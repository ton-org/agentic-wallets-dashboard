/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Address, toNano } from '@ton/core';
import { createTransferJettonTransaction, createTransferNftTransaction } from '@ton/appkit';
import {
    useAddress,
    useAppKit,
    useBalanceByAddress,
    useJettonsByAddress,
    useNetwork,
    useSelectedWallet,
    useSendTransaction,
} from '@ton/appkit-react';
import { getMaxOutgoingMessages } from '@ton/walletkit';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ENV_AGENTIC_WALLET_CODE_BOC } from '@/core/configs/env';
import { trackEvent } from '@/core/analytics/google-analytics';
import { getCurrentAnalyticsPath } from '@/core/analytics/url';
import {
    buildWalletStateInit,
    calculateWalletIndex,
    cellToBase64,
    createDeployWalletBody,
    createQueryId,
    getAgentWalletState,
    getCollectionAddressByIndex,
    type ToncenterLikeClient,
} from '@/features/agents/lib/agentic-wallet';
import { useAgentsStore } from '@/features/agents';
import type { PendingAgentWallet } from '@/features/agents';
import { useEnrichedNftsByAddress } from '@/features/agents/hooks/use-enriched-nfts-by-address';
import { buildOnchainMetadataCell } from '@/features/agents/lib/metadata';
import { isEligibleFundingNft } from '@/features/agents/lib/nft-trust';
import { formatUint256PublicKey, parseUint256PublicKey } from '@/features/agents/lib/public-key';
import {
    formatUnitsTrimmed,
    hasPositiveJettonBalance,
    parseUiAmountToUnits,
    tryParseUiAmountToUnits,
} from '@/features/agents/lib/amount';
import { isSameTonAddress } from '@/features/agents/lib/address';
import { delay } from '@/features/agents/lib/async';
import { getCollectionAddressForNetwork } from '@/features/agents/hooks/use-agents';

const DEPLOY_BASE_NANO = toNano('0.01');
const PER_ASSET_RESERVE_NANO = toNano('0.06');
const AGENT_DEPLOYMENT_RETRY_ATTEMPTS = 40;
const AGENT_DEPLOYMENT_RETRY_DELAY_MS = 250;

async function waitForDeployedAgentWallet(
    client: ToncenterLikeClient,
    address: string,
): Promise<Awaited<ReturnType<typeof getAgentWalletState>> | null> {
    if (!client.getAccountState) {
        return null;
    }

    for (let attempt = 0; attempt < AGENT_DEPLOYMENT_RETRY_ATTEMPTS; attempt += 1) {
        try {
            const state = await getAgentWalletState(client, address);
            if (state.isInitialized) {
                return state;
            }
        } catch (error) {
            if (!(error instanceof Error) || !error.message.startsWith('Account state data is empty for')) {
                throw error;
            }
        }

        await delay(AGENT_DEPLOYMENT_RETRY_DELAY_MS);
    }

    return null;
}

type DepositAssetKind = 'jetton' | 'nft';

interface DepositAssetItem {
    id: string;
    kind: DepositAssetKind;
    address: string;
    label: string;
    sublabel?: string;
    imageUrl?: string;
    decimals?: number;
    balance?: string;
    usdEquivalent?: number;
}

interface DepositAssetDraft {
    id: string;
    assetId: string;
    amount: string;
}

interface CreateDeepLinkAssetInput {
    kind: DepositAssetKind;
    address?: string;
    amount?: string;
    symbol?: string;
    label?: string;
}

interface CreateDeepLinkPayload {
    network?: string;
    operatorPublicKey?: string;
    agentName?: string;
    source?: string;
    callbackUrl?: string;
    tonDeposit?: string;
    assets: CreateDeepLinkAssetInput[];
}

interface DeployCallbackPayload {
    event: 'agent_wallet_deployed';
    deployedAt: string;
    indexed: boolean;
    network: {
        chainId: string;
        collectionAddress: string;
    };
    wallet: {
        address: string;
        ownerAddress: string;
        originOperatorPublicKey: string;
        operatorPublicKey: string;
        deployedByUser: boolean;
        name: string;
        source: string;
    };
    funding: {
        tonDeposit: string;
        tonDepositNano: string;
        assets: Array<{
            kind: DepositAssetKind;
            address: string;
            label: string;
            amount?: string;
            amountBaseUnits?: string;
            decimals?: number;
        }>;
    };
}

type CreateDeepLinkSource = URLSearchParams | Record<string, unknown>;

function getFirstSourceValue(source: CreateDeepLinkSource, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = source instanceof URLSearchParams ? source.get(key) : source[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return undefined;
}

function getSourceValues(source: CreateDeepLinkSource, key: string): string[] {
    if (source instanceof URLSearchParams) {
        return source.getAll(key).map((value) => value.trim()).filter(Boolean);
    }

    const value = source[key];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? [trimmed] : [];
    }

    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

function decodeBase64UrlUtf8(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(`${normalized}${'='.repeat(padding)}`, 'base64').toString('utf8');
}

function parseAssetToken(value: string): CreateDeepLinkAssetInput | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parts = trimmed.split(':');
    if (parts.length < 2) {
        return null;
    }

    const kind = parts[0]?.toLowerCase();
    const address = parts[1]?.trim();
    const amount = parts.slice(2).join(':').trim();
    if (!address) {
        return null;
    }

    if (kind === 'jetton') {
        return { kind: 'jetton', address, amount: amount || undefined };
    }
    if (kind === 'nft') {
        return { kind: 'nft', address };
    }

    return null;
}

function appendJsonAssets(value: unknown, assets: CreateDeepLinkAssetInput[]): void {
    if (!Array.isArray(value)) {
        return;
    }

    for (const item of value) {
        const kind = item?.kind === 'nft' ? 'nft' : item?.kind === 'jetton' ? 'jetton' : null;
        if (!kind) {
            continue;
        }

        const address = typeof item?.address === 'string' ? item.address.trim() : undefined;
        const amount = typeof item?.amount === 'string' ? item.amount.trim() : undefined;
        const symbol = typeof item?.symbol === 'string' ? item.symbol.trim() : undefined;
        const label = typeof item?.label === 'string' ? item.label.trim() : undefined;
        assets.push({ kind, address, amount, symbol, label });
    }
}

function appendSourceAssets(source: CreateDeepLinkSource, assets: CreateDeepLinkAssetInput[]): void {
    const jsonAssetsRaw = source instanceof URLSearchParams ? source.get('assets') : source.assets;
    if (typeof jsonAssetsRaw === 'string') {
        try {
            appendJsonAssets(JSON.parse(jsonAssetsRaw), assets);
        } catch {
            // ignore malformed JSON
        }
    } else {
        appendJsonAssets(jsonAssetsRaw, assets);
    }

    for (const value of getSourceValues(source, 'asset')) {
        const parsed = parseAssetToken(value);
        if (parsed) {
            assets.push(parsed);
        }
    }

    for (const value of getSourceValues(source, 'jetton')) {
        const [addressPart, amountPart] = value.split(':');
        const address = addressPart?.trim();
        if (!address) {
            continue;
        }

        assets.push({
            kind: 'jetton',
            address,
            amount: amountPart?.trim() || undefined,
        });
    }

    for (const value of getSourceValues(source, 'nft')) {
        const address = value.trim();
        if (!address) {
            continue;
        }

        assets.push({
            kind: 'nft',
            address,
        });
    }
}

function parseCreateDeepLinkSource(source: CreateDeepLinkSource): CreateDeepLinkPayload {
    const assets: CreateDeepLinkAssetInput[] = [];
    appendSourceAssets(source, assets);

    return {
        network: getFirstSourceValue(source, ['network']),
        operatorPublicKey: getFirstSourceValue(source, [
            'originOperatorPublicKey',
            'operatorPublicKey',
            'operatorPubkey',
            'operator',
            'pubkey',
        ]),
        agentName: getFirstSourceValue(source, ['agentName', 'name']),
        source: getFirstSourceValue(source, ['source']),
        callbackUrl: getFirstSourceValue(source, ['callbackUrl', 'callback', 'webhookUrl', 'webhook']),
        tonDeposit: getFirstSourceValue(source, ['tonDeposit', 'ton', 'tonAmount']),
        assets,
    };
}

function parseCreateDeepLinkDataParam(searchParams: URLSearchParams): CreateDeepLinkPayload {
    const encoded = searchParams.get('data')?.trim();
    if (!encoded) {
        return { assets: [] };
    }

    try {
        const parsed = JSON.parse(decodeBase64UrlUtf8(encoded));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { assets: [] };
        }

        return parseCreateDeepLinkSource(parsed as Record<string, unknown>);
    } catch {
        return { assets: [] };
    }
}

function parseCreateDeepLink(searchParams: URLSearchParams): CreateDeepLinkPayload {
    const encodedPayload = parseCreateDeepLinkDataParam(searchParams);
    const queryPayload = parseCreateDeepLinkSource(searchParams);

    return {
        network: queryPayload.network ?? encodedPayload.network,
        operatorPublicKey: queryPayload.operatorPublicKey ?? encodedPayload.operatorPublicKey,
        agentName: queryPayload.agentName ?? encodedPayload.agentName,
        source: queryPayload.source ?? encodedPayload.source,
        callbackUrl: queryPayload.callbackUrl ?? encodedPayload.callbackUrl,
        tonDeposit: queryPayload.tonDeposit ?? encodedPayload.tonDeposit,
        assets: [...encodedPayload.assets, ...queryPayload.assets],
    };
}

function normalizeRequestedNetworkChainId(value: string | undefined): string | undefined {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }

    if (normalized === '-239' || normalized === '239' || normalized === 'mainnet') {
        return '-239';
    }
    if (normalized === '-3' || normalized === '3' || normalized === 'testnet') {
        return '-3';
    }

    throw new Error('Unsupported network parameter. Use mainnet, testnet, -239, or -3');
}

function formatNetworkLabel(chainId: string): string {
    if (chainId === '-239') {
        return 'mainnet';
    }
    if (chainId === '-3') {
        return 'testnet';
    }
    return chainId;
}

function parseCallbackUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('Callback url must be a valid absolute URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Callback url must start with http:// or https://');
    }

    return parsed.toString();
}

async function sendDeployCallback(callbackUrl: string, payload: DeployCallbackPayload): Promise<void> {
    const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Callback response status ${response.status}`);
    }
}

function getAgentCreateErrorReason(message: string): string {
    const normalized = message.toLowerCase();

    if (normalized.includes('connect wallet')) return 'wallet_not_connected';
    if (normalized.includes('network')) return 'network_mismatch';
    if (normalized.includes('collection address')) return 'collection_not_configured';
    if (normalized.includes('public key')) return 'invalid_public_key';
    if (normalized.includes('agentname')) return 'invalid_agent_name';
    if (normalized.includes('ton deposit') || normalized.includes('maximum initial ton')) return 'invalid_ton_deposit';
    if (normalized.includes('selected asset') || normalized.includes('amount for')) return 'invalid_asset_deposit';
    if (normalized.includes('already exists')) return 'agent_already_exists';
    if (normalized.includes('rejected')) return 'transaction_rejected';
    if (normalized.includes('callback')) return 'callback_failed';

    return 'unknown';
}

export function CreateAgentPage() {
    const navigate = useNavigate();
    const queueDeploymentNotice = useAgentsStore((s) => s.queueDeploymentNotice);
    const upsertPendingAgent = useAgentsStore((s) => s.upsertPendingAgent);
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const appKit = useAppKit();
    const [wallet] = useSelectedWallet();
    const network = useNetwork();
    const ownerAddress = useAddress();
    const { data: ownerTonBalance } = useBalanceByAddress({ address: ownerAddress ?? '', network });
    const { mutateAsync: sendTransaction, isPending } = useSendTransaction();
    const { data: jettonsResponse } = useJettonsByAddress({ address: ownerAddress, network });
    const { data: nftsResponse } = useEnrichedNftsByAddress({
        address: ownerAddress ?? '',
        network,
        limit: 1000,
    });

    const [originOperatorPublicKey, setOriginOperatorPublicKey] = useState('');
    const [agentName, setAgentName] = useState('');
    const [source, setSource] = useState('');
    const [callbackUrl, setCallbackUrl] = useState('');
    const [tonDeposit, setTonDeposit] = useState('0.1');
    const [assetDeposits, setAssetDeposits] = useState<DepositAssetDraft[]>([]);
    const [openSelectorId, setOpenSelectorId] = useState<string | null>(null);
    const [jettonsOpenById, setJettonsOpenById] = useState<Record<string, boolean>>({});
    const [nftsOpenById, setNftsOpenById] = useState<Record<string, boolean>>({});
    const [isAwaitingIndexing, setIsAwaitingIndexing] = useState(false);
    const isDeepLinkScalarsAppliedRef = useRef(false);
    const isDeepLinkAssetsAppliedRef = useRef(false);
    const deepLinkPayload = useMemo(() => parseCreateDeepLink(searchParams), [searchParams]);

    const collectionAddress = useMemo(() => getCollectionAddressForNetwork(network?.chainId), [network?.chainId]);
    const walletFeatures = (
        wallet as unknown as { tonConnectWallet?: { device?: { features?: unknown[] } } } | null
    )?.tonConnectWallet?.device?.features;
    const maxOutgoingMessages = Math.max(
        1,
        getMaxOutgoingMessages((Array.isArray(walletFeatures) ? walletFeatures : []) as never[]) ?? 1,
    );
    const maxAssetMessages = Math.max(0, maxOutgoingMessages - 1);

    const depositAssets = useMemo<DepositAssetItem[]>(() => {
        const jettons: DepositAssetItem[] = (jettonsResponse?.jettons ?? [])
            .filter((j) => hasPositiveJettonBalance(j.balance, j.decimalsNumber))
            .map((j) => {
                const balance = j.balance;
                const usdPrice = Number(j.prices?.find((p) => p.currency === 'USD')?.value ?? '0');
                const usdEquivalent = Number.isFinite(usdPrice) ? Number(balance) * usdPrice : 0;
                return {
                    id: `jetton:${j.address}`,
                    kind: 'jetton' as const,
                    address: j.address,
                    label: j.info.symbol ?? '???',
                    sublabel: j.info.name ?? 'Unknown',
                    imageUrl: j.info.image?.url,
                    decimals: j.decimalsNumber ?? 9,
                    balance,
                    usdEquivalent,
                };
            })
            .sort((a, b) => (b.usdEquivalent ?? 0) - (a.usdEquivalent ?? 0));

        const nfts: DepositAssetItem[] = (nftsResponse?.nfts ?? [])
            .filter((nft) => isEligibleFundingNft(nft, nftsResponse?.addressBook))
            .slice(0, 30)
            .map((nft) => ({
                id: `nft:${nft.address}`,
                kind: 'nft' as const,
                address: nft.address,
                label: nft.info?.name ?? 'NFT',
                sublabel: nft.collection?.name,
                imageUrl: nft.info?.image?.url,
            }));

        return [...jettons, ...nfts];
    }, [jettonsResponse?.jettons, nftsResponse?.addressBook, nftsResponse?.nfts]);

    const maxDepositsAllowed = Math.min(depositAssets.length, maxAssetMessages);
    const canAddMoreAssets = assetDeposits.length < maxDepositsAllowed;
    const tonBalanceDisplay = ownerTonBalance ?? '0';
    const ownerTonBalanceNano = tryParseUiAmountToUnits(ownerTonBalance ?? '0', 9) ?? 0n;
    const initialTonDepositMaxNano = (() => {
        const reserveNano = DEPLOY_BASE_NANO + PER_ASSET_RESERVE_NANO * BigInt(assetDeposits.length);
        return ownerTonBalanceNano > reserveNano ? ownerTonBalanceNano - reserveNano : 0n;
    })();
    const initialTonDepositMaxString = formatUnitsTrimmed(initialTonDepositMaxNano, 9);

    useEffect(() => {
        if (isDeepLinkScalarsAppliedRef.current) {
            return;
        }

        if (deepLinkPayload.operatorPublicKey) {
            setOriginOperatorPublicKey(deepLinkPayload.operatorPublicKey);
        }
        if (deepLinkPayload.agentName) {
            setAgentName(deepLinkPayload.agentName);
        }
        if (deepLinkPayload.source) {
            setSource(deepLinkPayload.source);
        }
        if (deepLinkPayload.callbackUrl) {
            setCallbackUrl(deepLinkPayload.callbackUrl);
        }
        if (deepLinkPayload.tonDeposit) {
            setTonDeposit(deepLinkPayload.tonDeposit);
        }

        isDeepLinkScalarsAppliedRef.current = true;
    }, [deepLinkPayload]);

    useEffect(() => {
        if (isDeepLinkAssetsAppliedRef.current) {
            return;
        }

        if (deepLinkPayload.assets.length === 0) {
            isDeepLinkAssetsAppliedRef.current = true;
            return;
        }

        if (depositAssets.length === 0) {
            return;
        }
        if (maxDepositsAllowed <= 0) {
            return;
        }

        const usedAssetIds = new Set<string>();
        const linkedDeposits: DepositAssetDraft[] = [];

        const findAsset = (assetInput: CreateDeepLinkAssetInput): DepositAssetItem | undefined => {
            const normalizedAddress = assetInput.address?.trim();
            if (normalizedAddress) {
                return depositAssets.find(
                    (asset) =>
                        asset.kind === assetInput.kind &&
                        isSameTonAddress(asset.address, normalizedAddress) &&
                        !usedAssetIds.has(asset.id),
                );
            }

            const normalizedSymbol = assetInput.symbol?.trim().toLowerCase();
            const normalizedLabel = assetInput.label?.trim().toLowerCase();
            if (!normalizedSymbol && !normalizedLabel) {
                return undefined;
            }

            return depositAssets.find((asset) => {
                if (asset.kind !== assetInput.kind || usedAssetIds.has(asset.id)) {
                    return false;
                }
                const bySymbol = normalizedSymbol ? asset.label.toLowerCase() === normalizedSymbol : false;
                const byLabel = normalizedLabel
                    ? asset.label.toLowerCase() === normalizedLabel || asset.sublabel?.toLowerCase() === normalizedLabel
                    : false;
                return bySymbol || byLabel;
            });
        };

        for (const [index, assetInput] of deepLinkPayload.assets.entries()) {
            const asset = findAsset(assetInput);
            if (!asset) {
                continue;
            }

            usedAssetIds.add(asset.id);
            linkedDeposits.push({
                id: `deeplink-${index}-${asset.id}`,
                assetId: asset.id,
                amount: asset.kind === 'jetton' ? (assetInput.amount ?? '').trim() : '',
            });
        }

        if (linkedDeposits.length > 0) {
            setAssetDeposits(linkedDeposits.slice(0, maxDepositsAllowed));
        }

        isDeepLinkAssetsAppliedRef.current = true;
    }, [deepLinkPayload.assets, depositAssets, maxDepositsAllowed]);

    const getAssetById = (assetId: string): DepositAssetItem | undefined => depositAssets.find((asset) => asset.id === assetId);
    const isSelectedInOtherDraft = (assetId: string, draftId: string): boolean =>
        assetDeposits.some((draft) => draft.id !== draftId && draft.assetId === assetId);
    const findNextUnselectedAssetId = (): string | null => {
        for (const asset of depositAssets) {
            if (!assetDeposits.some((draft) => draft.assetId === asset.id)) {
                return asset.id;
            }
        }
        return null;
    };

    const addAssetDeposit = () => {
        const nextAssetId = findNextUnselectedAssetId();
        if (!nextAssetId) return;
        setAssetDeposits((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, assetId: nextAssetId, amount: '' }]);
    };

    const updateAssetDeposit = (id: string, patch: Partial<DepositAssetDraft>) => {
        setAssetDeposits((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const removeAssetDeposit = (id: string) => {
        setAssetDeposits((prev) => prev.filter((item) => item.id !== id));
        setOpenSelectorId((current) => (current === id ? null : current));
        setJettonsOpenById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        setNftsOpenById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleCreate = async () => {
        try {
            setIsAwaitingIndexing(true);
            if (!network || !ownerAddress) {
                throw new Error('Connect wallet first');
            }
            const requestedNetworkChainId = normalizeRequestedNetworkChainId(deepLinkPayload.network);
            if (requestedNetworkChainId && requestedNetworkChainId !== network.chainId) {
                throw new Error(
                    `Connected wallet network is ${formatNetworkLabel(network.chainId)}, but ${formatNetworkLabel(requestedNetworkChainId)} is required`,
                );
            }
            if (!collectionAddress) {
                throw new Error('Collection address is not configured for current network');
            }

            const owner = Address.parse(ownerAddress);
            const collection = Address.parse(collectionAddress);
            const originKey = parseUint256PublicKey(originOperatorPublicKey);
            const name = agentName.trim();
            const sourceValue = source.trim();
            const callbackUrlValue = parseCallbackUrl(callbackUrl);
            if (!name || name.length > 64) {
                throw new Error('agentName length must be 1..64');
            }

            const tonDepositValue = tonDeposit.trim() || '0';
            const tonDepositNano = parseUiAmountToUnits(tonDepositValue, 9, 'TON deposit');
            if (tonDepositNano < 0n) {
                throw new Error('TON deposit must be zero or positive');
            }
            if (tonDepositNano > initialTonDepositMaxNano) {
                throw new Error(`Maximum initial TON deposit is ${initialTonDepositMaxString}`);
            }

            const nftItemIndex = calculateWalletIndex(owner, originKey, true);

            const creationTimestamp = Math.floor(Date.now() / 1000).toString();
            const metadata = buildOnchainMetadataCell({
                name,
                description: sourceValue,
                creation_date: creationTimestamp,
            });

            const runtimeData = {
                ownerAddress: owner,
                nftItemContent: metadata,
                originOperatorPublicKey: originKey,
                operatorPublicKey: originKey,
                deployedByUser: true,
            };

            const { stateInit, address: localAddress } = buildWalletStateInit(
                ENV_AGENTIC_WALLET_CODE_BOC,
                nftItemIndex,
                collection,
            );

            const client = appKit.networkManager.getClient(network);
            const expectedAddress = await getCollectionAddressByIndex(client, collection.toString(), nftItemIndex);
            if (!expectedAddress.equals(localAddress)) {
                throw new Error('Computed wallet address does not match collection.get_nft_address_by_index');
            }

            try {
                const existingState = await getAgentWalletState(client, localAddress.toString());
                if (existingState.isInitialized) {
                    throw new Error(
                        `Agentic wallet with this operator public key already exists: ${localAddress.toString()}`,
                    );
                }
            } catch (error) {
                if (
                    !(error instanceof Error) ||
                    !error.message.startsWith('Account state data is empty for')
                ) {
                    throw error;
                }
            }

            const deployBody = createDeployWalletBody({
                queryId: createQueryId(),
                walletData: runtimeData,
                senderOriginOperatorPublicKey: 0n,
            });

            if (assetDeposits.length > maxAssetMessages) {
                throw new Error(`You can add up to ${maxAssetMessages} assets (1 message reserved for deploy + TON)`);
            }

            const callbackAssets: DeployCallbackPayload['funding']['assets'] = [];
            const assetMessages = [];
            for (const deposit of assetDeposits) {
                const asset = getAssetById(deposit.assetId);
                if (!asset) {
                    throw new Error('Selected asset is not available');
                }

                if (asset.kind === 'jetton') {
                    const amount = deposit.amount.trim();
                    const parsedAmount = parseUiAmountToUnits(amount, asset.decimals ?? 9, `${asset.label} amount`);
                    if (parsedAmount <= 0n) {
                        throw new Error(`Enter valid amount for ${asset.label}`);
                    }
                    const tx = await createTransferJettonTransaction(appKit, {
                        jettonAddress: asset.address,
                        recipientAddress: localAddress.toString(),
                        amount: formatUnitsTrimmed(parsedAmount, asset.decimals ?? 9),
                        jettonDecimals: asset.decimals ?? 9,
                        comment: `Create agent ${name}`,
                    });

                    if (!tx.messages[0]) {
                        throw new Error(`Failed to build jetton transfer message for ${asset.label}`);
                    }
                    callbackAssets.push({
                        kind: asset.kind,
                        address: asset.address,
                        label: asset.label,
                        amount: formatUnitsTrimmed(parsedAmount, asset.decimals ?? 9),
                        amountBaseUnits: parsedAmount.toString(),
                        decimals: asset.decimals ?? 9,
                    });
                    assetMessages.push(tx.messages[0]);
                    continue;
                }

                const tx = await createTransferNftTransaction(appKit, {
                    nftAddress: asset.address,
                    recipientAddress: localAddress.toString(),
                    comment: `Create agent ${name}`,
                });
                if (!tx.messages[0]) {
                    throw new Error(`Failed to build NFT transfer message for ${asset.label}`);
                }
                callbackAssets.push({
                    kind: asset.kind,
                    address: asset.address,
                    label: asset.label,
                });
                assetMessages.push(tx.messages[0]);
            }

            const deployAmountNano = DEPLOY_BASE_NANO + tonDepositNano;

            await sendTransaction({
                network,
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [
                    {
                        address: localAddress.toString(),
                        amount: deployAmountNano.toString(),
                        stateInit: cellToBase64(stateInit),
                        payload: cellToBase64(deployBody),
                    },
                    ...assetMessages,
                ],
            });

            const deployedState = await waitForDeployedAgentWallet(client, localAddress.toString());
            if (!deployedState) {
                toast.message('Transaction sent, but wallet state is not available via API yet. It will appear after indexing.');
                return;
            }
            const createdAtIso = new Date(Number(creationTimestamp) * 1000).toISOString();
            const nowIso = new Date().toISOString();
            const pendingAgent: PendingAgentWallet = {
                id: localAddress.toString(),
                name,
                address: localAddress.toString(),
                operatorPubkey: formatUint256PublicKey(deployedState.operatorPublicKey),
                originOperatorPublicKey: formatUint256PublicKey(deployedState.originOperatorPublicKey),
                extensions: deployedState.extensions,
                ownerAddress: deployedState.ownerAddress?.toString() ?? ownerAddress,
                creationDateTimestamp: Number(creationTimestamp) * 1000,
                createdAt: createdAtIso,
                detectedAt: nowIso,
                isNew: false,
                status: deployedState.operatorPublicKey === 0n ? 'revoked' : 'active',
                source: sourceValue || 'Local deployment',
                collectionAddress: deployedState.collectionAddress.toString(),
                nftItemContent: null,
                isPendingIndexing: true,
                networkChainId: network.chainId,
            };
            upsertPendingAgent(pendingAgent);

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['agentic-wallets-owner-nfts'] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-wallets-chain-state'] }),
                queryClient.invalidateQueries({ queryKey: ['agentic-wallets-bulk-poll'] }),
                queryClient.invalidateQueries({ queryKey: ['balance'] }),
                queryClient.invalidateQueries({ queryKey: ['jettons'] }),
                queryClient.invalidateQueries({ queryKey: ['nfts'] }),
            ]);

            if (callbackUrlValue) {
                const callbackPayload: DeployCallbackPayload = {
                    event: 'agent_wallet_deployed',
                    deployedAt: new Date().toISOString(),
                    indexed: false,
                    network: {
                        chainId: network.chainId,
                        collectionAddress: collection.toString(),
                    },
                    wallet: {
                        address: localAddress.toString(),
                        ownerAddress: deployedState.ownerAddress?.toString() ?? ownerAddress,
                        originOperatorPublicKey: formatUint256PublicKey(deployedState.originOperatorPublicKey),
                        operatorPublicKey: formatUint256PublicKey(deployedState.operatorPublicKey),
                        deployedByUser: true,
                        name,
                        source: sourceValue,
                    },
                    funding: {
                        tonDeposit: formatUnitsTrimmed(tonDepositNano, 9),
                        tonDepositNano: tonDepositNano.toString(),
                        assets: callbackAssets,
                    },
                };

                try {
                    await sendDeployCallback(callbackUrlValue, callbackPayload);
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown callback error';
                    toast.warning(`Wallet created, but callback failed: ${message}`);
                }
            }

            trackEvent('agent_create_success', {
                page_path: getCurrentAnalyticsPath(),
                network: network.chainId,
                asset_count: assetDeposits.length,
                has_callback_url: Boolean(callbackUrlValue),
                has_ton_deposit: tonDepositNano > 0n,
            });

            queueDeploymentNotice(localAddress.toString());
            navigate(`/agent/${localAddress.toString()}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create an agentic wallet';
            trackEvent('agent_create_error', {
                page_path: getCurrentAnalyticsPath(),
                network: network?.chainId ?? 'unknown',
                reason: getAgentCreateErrorReason(message),
            });
            toast.error(message);
        } finally {
            setIsAwaitingIndexing(false);
        }
    };

    return (
        <div className="animate-fade-in mx-auto max-w-2xl">
            <Link
                to="/dashboard"
                className="mb-6 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
            >
                <ArrowLeft size={14} />
                Back to dashboard
            </Link>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h1 className="text-2xl font-bold tracking-tight">Create Agentic Wallet</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    Deploy a wallet NFT and send first funding in one wallet confirmation flow.
                </p>

                <div className="mt-6 space-y-4">
                    <Field
                        label="Operator Public Key"
                        value={originOperatorPublicKey}
                        onChange={setOriginOperatorPublicKey}
                        placeholder="0x..."
                    />
                    <Field label="Agent name" value={agentName} onChange={setAgentName} placeholder="Research Agent" />
                    <Field label="Source" value={source} onChange={setSource} placeholder="telegram-bot" />
                    <Field
                        label="Callback url"
                        value={callbackUrl}
                        onChange={setCallbackUrl}
                        placeholder="https://example.com/agent-wallet-created"
                        type="url"
                    />
                    <div>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                            <label className="block text-xs text-neutral-500">Initial TON deposit</label>
                            <span className="text-xs text-neutral-500">Balance: {tonBalanceDisplay} TON</span>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={tonDeposit}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    if (next === '' || /^\d*\.?\d*$/.test(next)) {
                                        setTonDeposit(next);
                                    }
                                }}
                                placeholder="0.2"
                                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 pr-16 text-sm text-white placeholder-neutral-700 outline-none transition-colors focus:border-amber-500/50"
                            />
                            <button
                                type="button"
                                onClick={() => setTonDeposit(initialTonDepositMaxString)}
                                disabled={initialTonDepositMaxNano <= 0n}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Max
                            </button>
                        </div>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-wider text-neutral-500">Other funding assets</p>
                            <p className="text-[11px] text-neutral-500">
                                {assetDeposits.length}/{maxDepositsAllowed} assets
                            </p>
                        </div>
                        <div className="space-y-3">
                            {assetDeposits.map((deposit) => {
                                const selected = getAssetById(deposit.assetId);
                                if (!selected) return null;
                                const selectorOpen = openSelectorId === deposit.id;
                                const jettonsOpen = jettonsOpenById[deposit.id] ?? false;
                                const nftsOpen = nftsOpenById[deposit.id] ?? false;
                                const availableJettons = depositAssets.filter(
                                    (asset) => asset.kind === 'jetton' && !isSelectedInOtherDraft(asset.id, deposit.id),
                                );
                                const availableNfts = depositAssets.filter(
                                    (asset) => asset.kind === 'nft' && !isSelectedInOtherDraft(asset.id, deposit.id),
                                );
                                const isFungible = selected.kind === 'jetton';
                                const maxDecimals = selected.decimals ?? 9;
                                return (
                                    <div key={deposit.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                        <div className="relative mb-3 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setOpenSelectorId((current) => (current === deposit.id ? null : deposit.id))}
                                                className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-left text-sm text-white outline-none transition-colors hover:border-white/[0.15] focus:border-amber-500/50"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <AssetIcon imageUrl={selected.imageUrl} label={selected.label} />
                                                    <span>{selected.label}</span>
                                                    {selected.sublabel && <span className="text-neutral-500">{selected.sublabel}</span>}
                                                </span>
                                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${selectorOpen ? 'rotate-180' : ''}`}>
                                                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeAssetDeposit(deposit.id)}
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                            {selectorOpen && (
                                                <div className="absolute left-0 top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-white/10 bg-surface-suggestions shadow-xl">
                                                    <button
                                                        type="button"
                                                        onClick={() => setJettonsOpenById((prev) => ({ ...prev, [deposit.id]: !(prev[deposit.id] ?? false) }))}
                                                        className="flex w-full items-center justify-between px-4 py-2 text-left text-xs uppercase tracking-wide text-neutral-400 transition-colors hover:bg-white/[0.04]"
                                                    >
                                                        <span>Jettons</span>
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${jettonsOpen ? 'rotate-180' : ''}`}>
                                                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                        </svg>
                                                    </button>
                                                    {jettonsOpen &&
                                                        availableJettons.map((asset) => (
                                                            <button
                                                                key={asset.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    updateAssetDeposit(deposit.id, { assetId: asset.id, amount: '' });
                                                                    setOpenSelectorId(null);
                                                                }}
                                                                className={`flex w-full items-center justify-between gap-2 px-6 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                                                                    deposit.assetId === asset.id ? 'text-amber-500' : 'text-white'
                                                                }`}
                                                            >
                                                                <span className="flex items-center gap-2">
                                                                    <AssetIcon imageUrl={asset.imageUrl} label={asset.label} />
                                                                    <span>{asset.label}</span>
                                                                    {asset.sublabel && <span className="text-neutral-500">{asset.sublabel}</span>}
                                                                </span>
                                                                <span className="font-mono text-xs text-neutral-400">{asset.balance ?? '0'}</span>
                                                            </button>
                                                        ))}
                                                    {jettonsOpen && availableJettons.length === 0 && (
                                                        <div className="px-6 py-2 text-xs text-neutral-500">No jettons found</div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => setNftsOpenById((prev) => ({ ...prev, [deposit.id]: !(prev[deposit.id] ?? false) }))}
                                                        className="flex w-full items-center justify-between px-4 py-2 text-left text-xs uppercase tracking-wide text-neutral-400 transition-colors hover:bg-white/[0.04]"
                                                    >
                                                        <span>NFTs</span>
                                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${nftsOpen ? 'rotate-180' : ''}`}>
                                                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                        </svg>
                                                    </button>
                                                    {nftsOpen &&
                                                        availableNfts.map((asset) => (
                                                            <button
                                                                key={asset.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    updateAssetDeposit(deposit.id, { assetId: asset.id, amount: '' });
                                                                    setOpenSelectorId(null);
                                                                }}
                                                                className={`flex w-full items-center gap-2 px-6 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                                                                    deposit.assetId === asset.id ? 'text-amber-500' : 'text-white'
                                                                }`}
                                                            >
                                                                <AssetIcon imageUrl={asset.imageUrl} label={asset.label} />
                                                                <span>{asset.label}</span>
                                                                {asset.sublabel && <span className="text-neutral-500">{asset.sublabel}</span>}
                                                            </button>
                                                        ))}
                                                    {nftsOpen && availableNfts.length === 0 && (
                                                        <div className="px-6 py-2 text-xs text-neutral-500">No NFTs found</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {isFungible ? (
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between gap-3">
                                                    <label className="block text-xs text-neutral-500">Amount ({selected.label})</label>
                                                    <span className="text-xs text-neutral-500">Balance: {selected.balance ?? '0'} {selected.label}</span>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={deposit.amount}
                                                        onChange={(e) => {
                                                            const next = e.target.value;
                                                            if (next === '') {
                                                                updateAssetDeposit(deposit.id, { amount: '' });
                                                                return;
                                                            }
                                                            if (!/^\d*\.?\d*$/.test(next)) return;
                                                            const [, fraction = ''] = next.split('.');
                                                            if (fraction.length > maxDecimals) return;
                                                            updateAssetDeposit(deposit.id, { amount: next });
                                                        }}
                                                        placeholder="0.00"
                                                        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 pr-16 text-sm text-white placeholder-neutral-700 outline-none transition-colors focus:border-amber-500/50"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => updateAssetDeposit(deposit.id, { amount: selected.balance ?? '0' })}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-white/[0.12]"
                                                    >
                                                        Max
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-neutral-500">NFT transfer (1 item)</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {canAddMoreAssets && (
                            <button
                                type="button"
                                onClick={addAssetDeposit}
                                className="mt-3 w-full rounded-xl border border-white/[0.1] bg-white/[0.02] py-2.5 text-sm text-white transition-colors hover:bg-white/[0.05]"
                            >
                                Add asset
                            </button>
                        )}
                    </div>
                </div>

                <button
                    onClick={() => void handleCreate()}
                    disabled={isPending || isAwaitingIndexing || !ownerAddress}
                    className="mt-6 w-full rounded-full bg-amber-500 px-6 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending ? 'Sending...' : isAwaitingIndexing ? 'Waiting for indexing...' : 'Deploy + First Fund'}
                </button>
            </div>
        </div>
    );
}

function AssetIcon({ imageUrl, label }: { imageUrl?: string; label: string }) {
    if (imageUrl) {
        return <img src={imageUrl} alt="" className="h-5 w-5 rounded-full object-cover" />;
    }
    return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold">
            {label.charAt(0)}
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    readOnly = false,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    type?: string;
    readOnly?: boolean;
}) {
    return (
        <div>
            <label className="mb-1.5 block text-xs text-neutral-500">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                readOnly={readOnly}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-neutral-700 outline-none transition-colors focus:border-amber-500/50 read-only:text-neutral-500"
            />
        </div>
    );
}
