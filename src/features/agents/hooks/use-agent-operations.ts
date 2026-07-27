/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { getSelectedWallet } from '@ton/appkit';
import { Address } from '@ton/core';
import type { Feature, SendTransactionFeature } from '@tonconnect/sdk';
import { useCallback, useState } from 'react';
import { useAddress, useAppKit, useNetwork, useSendTransaction } from '@ton/appkit-react';
import { getJettonWalletAddressFromClient, getJettonsFromClient, getNftsFromClient, parseUnits } from '@ton/walletkit';

import type { AgentWallet } from '../types';
import { useAgentsStore } from '../store/agents-store';
import {
    cellToBase64,
    buildRenameAgentTransaction,
    buildSetLimitsTransaction,
    buildClearLimitsTransaction,
    createChangeOperatorBody,
    createExtensionActionRequestBody,
    createRemoveExtensionsRequestBody,
    createQueryId,
    createWithdrawAllOutActions,
    getAgentWalletState,
} from '../lib/agentic-wallet';
import type { WithdrawJettonAction, WithdrawNftAction } from '../lib/agentic-wallet';
import type { LimitsDict } from '../lib/limits-types';
import { buildUpdatedMetadataCell, extractLimitsHashFromMetadata, extractNameFromMetadata } from '../lib/metadata';
import { fetchNftInterfaces, mergeAddressBookInterfaces } from '../lib/nft-interfaces';
import { isEligibleFundingNft } from '../lib/nft-trust';
import { parseUint256PublicKey } from '../lib/public-key';
import { delay } from '../lib/async';
import { waitForTransactionStatus } from '../lib/transaction-status';

import { ENV_AGENTIC_OWNER_OP_GAS } from '@/core/configs/env';

const JETTON_WITHDRAW_EXECUTION_COST_NANO = 55_000_000n; // 0.055 GRAM
const NFT_WITHDRAW_EXECUTION_COST_NANO = 110_000_000n; // 0.11 GRAM
const EXTENSION_REMOVAL_GAS_PER_EXTENSION_NANO = 1_000_000n; // 0.001 GRAM
const MAX_EXTENSION_REMOVALS_PER_MESSAGE = 255;
const OPERATION_RETRY_ATTEMPTS = 40;
const OPERATION_RETRY_DELAY_MS = 250;

type WithdrawSelection = {
    includeTon?: boolean;
    jettons?: Array<{
        walletAddress: string;
        amount: string;
        decimals?: number;
    }>;
    nfts?: Array<{
        address: string;
    }>;
};

type OperatorUpdateOptions = {
    removeAllExtensions?: boolean;
};

function parseGasNano(value: string): bigint {
    const parsed = value.trim();
    if (!/^\d+$/.test(parsed)) {
        throw new Error('VITE_AGENTIC_OWNER_OP_GAS must be a nano amount integer');
    }
    return BigInt(parsed);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    if (chunkSize < 1) {
        throw new Error('chunkSize must be greater than zero');
    }

    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}

function getMaxMessagesFromFeatures(features: Feature[] | undefined): number {
    const sendTransactionFeature = features?.find(
        (feature): feature is SendTransactionFeature => feature !== 'SendTransaction' && feature.name === 'SendTransaction',
    );
    return Math.max(1, sendTransactionFeature?.maxMessages ?? 1);
}

export function useAgentOperations() {
    const appKit = useAppKit();
    const network = useNetwork();
    const ownerAddress = useAddress();
    const gasAmount = parseGasNano(ENV_AGENTIC_OWNER_OP_GAS);

    const { mutateAsync: sendTransaction, isPending: isSendTransactionPending } = useSendTransaction();
    const [activeOperations, setActiveOperations] = useState(0);
    const setOperatorKeyOverride = useAgentsStore((s) => s.setOperatorKeyOverride);

    const runWithPending = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
        setActiveOperations((current) => current + 1);
        try {
            return await operation();
        } finally {
            setActiveOperations((current) => Math.max(0, current - 1));
        }
    }, []);

    const getOwnerMaxMessagesPerRequest = () => {
        const selectedWallet = getSelectedWallet(appKit) as
            | {
                  tonConnectWallet?: {
                      device?: {
                          features?: Feature[];
                      };
                  };
              }
            | null;

        return getMaxMessagesFromFeatures(selectedWallet?.tonConnectWallet?.device?.features);
    };

    const sendAgentMessages = async (
        messages: Array<{ agentAddress: string; payloadB64: string; amountNano?: bigint }>,
    ) => {
        if (!network) {
            throw new Error('Network is not selected');
        }

        if (messages.length === 0) {
            throw new Error('At least one message must be provided');
        }

        const maxMessagesPerRequest = getOwnerMaxMessagesPerRequest();
        const requestBatches = chunkArray(messages, maxMessagesPerRequest);
        const receipts = [];

        for (const batch of requestBatches) {
            const receipt = await sendTransaction({
                network,
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: batch.map((message) => ({
                    address: message.agentAddress,
                    amount: (message.amountNano ?? gasAmount).toString(),
                    payload: message.payloadB64,
                })),
            });
            receipts.push(receipt);
        }

        return receipts;
    };

    const sendAgentMessage = async (agentAddress: string, payloadB64: string, amountNano: bigint = gasAmount) => {
        const [receipt] = await sendAgentMessages([{ agentAddress, payloadB64, amountNano }]);
        return receipt;
    };

    const waitForTransactionConfirmations = async (
        receipts: Array<{
            normalizedHash: string;
        }>,
    ) => {
        for (const receipt of receipts) {
            await waitForTransactionConfirmation(receipt.normalizedHash);
        }
    };

    const waitForTransactionConfirmation = async (normalizedHash: string) => {
        if (!network) {
            return;
        }

        const status = await waitForTransactionStatus(
            appKit,
            { network, normalizedHash },
            { attempts: OPERATION_RETRY_ATTEMPTS, delayMs: OPERATION_RETRY_DELAY_MS },
        );
        if (status === 'completed') {
            return;
        }
        if (status === 'failed') {
            throw new Error('Transaction failed on-chain');
        }

        throw new Error('Transaction sent, but is not confirmed yet. Please refresh in a few seconds');
    };

    const waitForPublicKey = async (agentAddress: string, expected: bigint) => {
        if (!network) {
            return;
        }

        const client = appKit.networkManager.getClient(network);
        for (let attempt = 0; attempt < OPERATION_RETRY_ATTEMPTS; attempt += 1) {
            const state = await getAgentWalletState(client, agentAddress);
            const current = state.isInitialized ? state.operatorPublicKey : -1n;
            if (current === expected) {
                return;
            }
            await delay(OPERATION_RETRY_DELAY_MS);
        }

        throw new Error('On-chain state is not updated yet. Please refresh in a few seconds');
    };

    const waitForRemovedExtensions = async (agentAddress: string, removedExtensions: string[]) => {
        if (!network) {
            return;
        }

        const removed = new Set(removedExtensions.map((address) => Address.parse(address).toString()));
        const client = appKit.networkManager.getClient(network);
        for (let attempt = 0; attempt < OPERATION_RETRY_ATTEMPTS; attempt += 1) {
            const state = await getAgentWalletState(client, agentAddress);
            const current = new Set(state.extensions.map((address) => Address.parse(address).toString()));
            const allRemoved = [...removed].every((address) => !current.has(address));
            if (allRemoved) {
                return;
            }
            await delay(OPERATION_RETRY_DELAY_MS);
        }

        throw new Error('Extension removal transaction sent, but on-chain state is not updated yet. Please refresh shortly.');
    };

    const waitForLimitsHash = async (agentAddress: string, expectedHash: string | null) => {
        if (!network) {
            return;
        }

        const client = appKit.networkManager.getClient(network);
        for (let attempt = 0; attempt < OPERATION_RETRY_ATTEMPTS; attempt += 1) {
            const state = await getAgentWalletState(client, agentAddress);
            if (extractLimitsHashFromMetadata(state.nftItemContent) === expectedHash) {
                return;
            }
            await delay(OPERATION_RETRY_DELAY_MS);
        }

        throw new Error('Limits transaction sent, but on-chain state is not updated yet. Please refresh shortly.');
    };

    const normalizeExtensionAddresses = (extensionAddresses: string[]) =>
        Array.from(new Set(extensionAddresses.map((address) => Address.parse(address).toString())));

    const buildRemoveAgentExtensionMessages = (agent: AgentWallet, extensionAddresses: string[]) => {
        const selected = normalizeExtensionAddresses(extensionAddresses);
        if (selected.length === 0) {
            throw new Error('Select at least one extension to delete');
        }

        const extensionBatches = chunkArray(selected, MAX_EXTENSION_REMOVALS_PER_MESSAGE);
        return {
            selected,
            messages: extensionBatches.map((batch) => {
                const payload = createRemoveExtensionsRequestBody(
                    createQueryId(),
                    batch.map((address) => Address.parse(address)),
                );

                return {
                    agentAddress: agent.address,
                    payloadB64: cellToBase64(payload),
                    amountNano: gasAmount + BigInt(batch.length) * EXTENSION_REMOVAL_GAS_PER_EXTENSION_NANO,
                };
            }),
        };
    };

    const removeAgentExtensionsInternal = async (agent: AgentWallet, extensionAddresses: string[]) => {
        const { selected, messages } = buildRemoveAgentExtensionMessages(agent, extensionAddresses);
        const receipts = await sendAgentMessages(messages);
        await waitForTransactionConfirmations(receipts);
        await waitForRemovedExtensions(agent.address, selected);
    };

    const revokeAgentWallet = async (agent: AgentWallet, options?: OperatorUpdateOptions) =>
        runWithPending(async () => {
            const queryId = createQueryId();
            const payload = createChangeOperatorBody(queryId, 0n);
            const operationMessages: Array<{ agentAddress: string; payloadB64: string; amountNano?: bigint }> = [
                { agentAddress: agent.address, payloadB64: cellToBase64(payload) },
            ];
            let removedExtensions: string[] = [];

            if (options?.removeAllExtensions && agent.extensions.length > 0) {
                const maxMessagesPerRequest = getOwnerMaxMessagesPerRequest();
                if (maxMessagesPerRequest < 2) {
                    throw new Error(
                        'Connected wallet supports only 1 message per request. It cannot send revoke and delete extensions in the same confirmation.',
                    );
                }

                const removePlan = buildRemoveAgentExtensionMessages(agent, agent.extensions);
                removedExtensions = removePlan.selected;
                operationMessages.push(...removePlan.messages);
            }

            const receipts = await sendAgentMessages(operationMessages);
            await waitForTransactionConfirmations(receipts);
            await waitForPublicKey(agent.address, 0n);
            setOperatorKeyOverride(agent.address, 0n);
            if (removedExtensions.length > 0) {
                await waitForRemovedExtensions(agent.address, removedExtensions);
            }
        });

    const changeAgentPublicKey = async (agent: AgentWallet, newPublicKeyInput: string, options?: OperatorUpdateOptions) =>
        runWithPending(async () => {
            const newPublicKey = parseUint256PublicKey(newPublicKeyInput);
            const queryId = createQueryId();
            const payload = createChangeOperatorBody(queryId, newPublicKey);
            const operationMessages: Array<{ agentAddress: string; payloadB64: string; amountNano?: bigint }> = [
                { agentAddress: agent.address, payloadB64: cellToBase64(payload) },
            ];
            let removedExtensions: string[] = [];

            if (options?.removeAllExtensions && agent.extensions.length > 0) {
                const maxMessagesPerRequest = getOwnerMaxMessagesPerRequest();
                if (maxMessagesPerRequest < 2) {
                    throw new Error(
                        'Connected wallet supports only 1 message per request. It cannot send change key and delete extensions in the same confirmation.',
                    );
                }

                const removePlan = buildRemoveAgentExtensionMessages(agent, agent.extensions);
                removedExtensions = removePlan.selected;
                operationMessages.push(...removePlan.messages);
            }

            const receipts = await sendAgentMessages(operationMessages);
            await waitForTransactionConfirmations(receipts);
            await waitForPublicKey(agent.address, newPublicKey);
            setOperatorKeyOverride(agent.address, newPublicKey);
            if (removedExtensions.length > 0) {
                await waitForRemovedExtensions(agent.address, removedExtensions);
            }
        });

    const withdrawAllFromAgentWallet = async (agent: AgentWallet, selection?: WithdrawSelection) =>
        runWithPending(async () => {
            if (!ownerAddress) {
                throw new Error('Wallet is not connected');
            }
            if (!network) {
                throw new Error('Network is not selected');
            }

            const owner = Address.parse(ownerAddress);
            const client = appKit.networkManager.getClient(network);

            const jettons: WithdrawJettonAction[] = [];
            const nfts: WithdrawNftAction[] = [];
            const includeTon = selection?.includeTon ?? true;

            if (selection) {
                for (const jetton of selection.jettons ?? []) {
                    const decimals = Number.isFinite(jetton.decimals) ? Number(jetton.decimals) : 9;
                    const amount = parseUnits(jetton.amount, decimals);
                    if (amount <= 0n) {
                        continue;
                    }

                    jettons.push({
                        jettonWalletAddress: Address.parse(jetton.walletAddress),
                        amount,
                    });
                }

                for (const nft of selection.nfts ?? []) {
                    nfts.push({ nftAddress: Address.parse(nft.address) });
                }
            } else {
                const jettonPageLimit = 500;
                for (let page = 0; page < 50; page += 1) {
                    const response = await getJettonsFromClient(client, agent.address, {
                        pagination: {
                            limit: jettonPageLimit,
                            offset: page * jettonPageLimit,
                        },
                    });
                    const pageJettons = response.jettons ?? [];

                    for (const jetton of pageJettons) {
                        const balance = BigInt(jetton.balance);
                        if (balance <= 0n) {
                            continue;
                        }

                        const jettonWalletAddress = await getJettonWalletAddressFromClient(
                            client,
                            jetton.address,
                            agent.address,
                        );
                        jettons.push({
                            jettonWalletAddress: Address.parse(jettonWalletAddress),
                            amount: balance,
                        });
                    }

                    if (pageJettons.length < jettonPageLimit) {
                        break;
                    }
                }

                const nftPageLimit = 500;
                for (let page = 0; page < 50; page += 1) {
                    const response = await getNftsFromClient(client, agent.address, {
                        pagination: {
                            limit: nftPageLimit,
                            offset: page * nftPageLimit,
                        },
                    });
                    const pageNfts = response.nfts ?? [];

                    const interfaces = await fetchNftInterfaces(
                        network?.chainId,
                        pageNfts.map((nft) => nft.address),
                    );
                    const addressBook = mergeAddressBookInterfaces(response.addressBook, interfaces);

                    for (const nft of pageNfts) {
                        if (!isEligibleFundingNft(nft, addressBook)) {
                            continue;
                        }
                        nfts.push({ nftAddress: Address.parse(nft.address) });
                    }

                    if (pageNfts.length < nftPageLimit) {
                        break;
                    }
                }
            }

            if (!includeTon && jettons.length === 0 && nfts.length === 0) {
                throw new Error('Select at least one asset to withdraw');
            }

            const totalActions = (includeTon ? 1 : 0) + jettons.length + nfts.length;
            if (totalActions > 255) {
                throw new Error(
                    'Too many assets to withdraw in one transaction. Please reduce jettons/NFTs and retry.',
                );
            }

            const outActions = createWithdrawAllOutActions(owner, { includeTon, jettons, nfts });
            const payload = createExtensionActionRequestBody(createQueryId(), outActions);
            const requiredExecutionNano =
                BigInt(jettons.length) * JETTON_WITHDRAW_EXECUTION_COST_NANO +
                BigInt(nfts.length) * NFT_WITHDRAW_EXECUTION_COST_NANO;
            const agentBalanceNano = BigInt(await client.getBalance(agent.address));
            const missingExecutionNano =
                agentBalanceNano < requiredExecutionNano ? requiredExecutionNano - agentBalanceNano : 0n;
            const attachedAmountNano = gasAmount + missingExecutionNano;

            const tx = await sendAgentMessage(agent.address, cellToBase64(payload), attachedAmountNano);
            await waitForTransactionConfirmation(tx.normalizedHash);
        });

    const removeAgentExtensions = async (agent: AgentWallet, extensionAddresses: string[]) =>
        runWithPending(async () => {
            await removeAgentExtensionsInternal(agent, extensionAddresses);
        });

    const renameAgentWallet = async (agent: AgentWallet, newName: string) =>
        runWithPending(async () => {
            if (!network) {
                throw new Error('Network is not selected');
            }

            const client = appKit.networkManager.getClient(network);
            const state = await getAgentWalletState(client, agent.address);
            const updatedContent = buildUpdatedMetadataCell(state.nftItemContent, newName);
            const tx = buildRenameAgentTransaction({
                agentAddress: agent.address,
                queryId: createQueryId(),
                gasAmountNano: gasAmount,
                updatedNftItemContent: updatedContent,
                networkChainId: network.chainId,
            });
            await sendTransaction(tx);

            const expected = newName.trim();
            for (let attempt = 0; attempt < OPERATION_RETRY_ATTEMPTS; attempt += 1) {
                const updatedState = await getAgentWalletState(client, agent.address);
                const actual = extractNameFromMetadata(updatedState.nftItemContent);
                if (actual === expected) {
                    return;
                }
                await delay(OPERATION_RETRY_DELAY_MS);
            }

            throw new Error('Rename transaction sent, but metadata update is not visible yet. Please refresh shortly.');
        });

    const setAgentLimits = async (agent: AgentWallet, limitsDict: LimitsDict) =>
        runWithPending(async () => {
            if (!network) {
                throw new Error('Network is not selected');
            }

            const client = appKit.networkManager.getClient(network);
            const state = await getAgentWalletState(client, agent.address);
            const { request, limitsHash } = buildSetLimitsTransaction({
                agentAddress: agent.address,
                queryId: createQueryId(),
                gasAmountNano: gasAmount,
                currentContent: state.nftItemContent,
                limitsDict,
                networkChainId: network.chainId,
            });
            await sendTransaction(request);
            await waitForLimitsHash(agent.address, limitsHash);
        });

    const clearAgentLimits = async (agent: AgentWallet) =>
        runWithPending(async () => {
            if (!network) {
                throw new Error('Network is not selected');
            }

            const client = appKit.networkManager.getClient(network);
            const state = await getAgentWalletState(client, agent.address);
            const request = buildClearLimitsTransaction({
                agentAddress: agent.address,
                queryId: createQueryId(),
                gasAmountNano: gasAmount,
                currentContent: state.nftItemContent,
                networkChainId: network.chainId,
            });
            await sendTransaction(request);
            await waitForLimitsHash(agent.address, null);
        });

    return {
        isPending: isSendTransactionPending || activeOperations > 0,
        revokeAgentWallet,
        changeAgentPublicKey,
        withdrawAllFromAgentWallet,
        removeAgentExtensions,
        renameAgentWallet,
        setAgentLimits,
        clearAgentLimits,
    };
}
