/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppKit, useJettonsByAddress, useNetwork } from '@ton/appkit-react';
import { Cell } from '@ton/core';

import type { AgentWallet } from '../types';
import { extractLimitsHashFromMetadata } from '../lib/metadata';
import { fetchAccountTransactionsWithBody } from '../lib/account-transactions';
import {
    computeLimitsHash,
    limitsDictToStored,
    parseLimitsDictFromMessageBody,
    TON_ASSET_KEY,
} from '../lib/limits-codec';
import { formatWindowLabel } from '../lib/limits-constants';
import type { AssetLimitView, LimitsView, StoredLimits, WindowLimitView } from '../lib/limits-types';

/** Page size and cap for scanning history for the latest limits-change transaction. */
const LIMITS_HISTORY_PAGE = 100;
const LIMITS_HISTORY_MAX_PAGES = 5;

interface JettonMeta {
    symbol: string;
    decimals: number;
    imageUrl?: string;
}

interface DecodedLimits {
    stored: StoredLimits;
    /** Hash of the decoded dict, to verify against the on-chain `limits_hash`. */
    hash: string;
}

function shortenAssetKey(assetKey: string): string {
    return assetKey.length > 12 ? `${assetKey.slice(0, 4)}…${assetKey.slice(-4)}` : assetKey;
}

/**
 * Scan account history (newest first) for the most recent ChangeNftContent
 * transaction that carries a non-empty `limitsDict`, mirroring MCP
 * `syncLimitsFromChain`. Returns the decoded limits and the dict's hash.
 */
async function decodeLimitsFromHistory(
    fetchPage: (limit: number, offset: number) => Promise<Array<{ inMessage?: { messageContent?: { body?: string | null } | null } | null }>>,
): Promise<DecodedLimits | null> {
    for (let page = 0; page < LIMITS_HISTORY_MAX_PAGES; page += 1) {
        const transactions = await fetchPage(LIMITS_HISTORY_PAGE, page * LIMITS_HISTORY_PAGE);
        if (transactions.length === 0) {
            break;
        }

        for (const transaction of transactions) {
            const body = transaction.inMessage?.messageContent?.body;
            if (!body) {
                continue;
            }
            let dict;
            try {
                dict = parseLimitsDictFromMessageBody(Cell.fromBase64(body));
            } catch {
                continue;
            }
            if (dict && dict.size > 0) {
                return { stored: limitsDictToStored(dict), hash: computeLimitsHash(dict) };
            }
        }

        if (transactions.length < LIMITS_HISTORY_PAGE) {
            break;
        }
    }

    return null;
}

function buildLimitsView(stored: StoredLimits, hashHex: string, jettonMeta: Map<string, JettonMeta>): LimitsView {
    const assets: AssetLimitView[] = [];
    let maxWindowSeconds = 0;

    for (const [assetKey, assetLimit] of Object.entries(stored.assets)) {
        const meta: JettonMeta =
            assetKey === TON_ASSET_KEY
                ? { symbol: 'TON', decimals: 9 }
                : (jettonMeta.get(assetKey) ?? { symbol: shortenAssetKey(assetKey), decimals: 9 });

        const windows: WindowLimitView[] = Object.entries(assetLimit.windows)
            .map(([seconds, amount]) => ({
                windowSeconds: Number(seconds),
                label: formatWindowLabel(Number(seconds)),
                limit: BigInt(amount),
            }))
            .sort((a, b) => a.windowSeconds - b.windowSeconds);

        for (const window of windows) {
            if (window.windowSeconds > maxWindowSeconds) {
                maxWindowSeconds = window.windowSeconds;
            }
        }

        assets.push({
            assetKey,
            symbol: meta.symbol,
            decimals: meta.decimals,
            imageUrl: meta.imageUrl,
            windows,
        });
    }

    assets.sort((a, b) => {
        if (a.assetKey === TON_ASSET_KEY) return -1;
        if (b.assetKey === TON_ASSET_KEY) return 1;
        return a.symbol.localeCompare(b.symbol);
    });

    return { hashHex, assets, maxWindowSeconds };
}

export interface UseAgentLimitsResult {
    limits: LimitsView | null;
    isLoading: boolean;
    /** On-chain hash present but the decoded dict couldn't be found/verified. */
    hashMismatch: boolean;
}

/**
 * Read an agent's transaction limits. The `limits_hash` is read from the wallet's
 * NFT content with no network call; when present, the dict is decoded from the
 * latest limits-change transaction and verified against the hash.
 */
export function useAgentLimits(agent: AgentWallet | null): UseAgentLimitsResult {
    const appKit = useAppKit();
    const network = useNetwork();

    const hashHex = agent ? extractLimitsHashFromMetadata(agent.nftItemContent) : null;
    const address = agent?.address ?? null;

    const { data: jettonsResponse } = useJettonsByAddress({
        address: address ?? '',
        network: network ?? undefined,
        query: { enabled: !!address && !!hashHex },
    });

    const query = useQuery({
        queryKey: ['agent-limits', network?.chainId ?? null, address, hashHex],
        enabled: !!network && !!address && !!hashHex,
        staleTime: 30_000,
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<DecodedLimits | null> => {
            if (!network || !address) {
                return null;
            }
            const client = appKit.networkManager.getClient(network);
            return decodeLimitsFromHistory((limit, offset) =>
                fetchAccountTransactionsWithBody(client, network, address, limit, offset),
            );
        },
    });

    const jettonMeta = useMemo(() => {
        const map = new Map<string, JettonMeta>();
        for (const jetton of jettonsResponse?.jettons ?? []) {
            if (!jetton.address) {
                continue;
            }
            map.set(jetton.address, {
                symbol: jetton.info?.symbol ?? shortenAssetKey(jetton.address),
                decimals: jetton.decimalsNumber ?? 9,
                imageUrl: jetton.info?.image?.url,
            });
        }
        return map;
    }, [jettonsResponse?.jettons]);

    const limits = useMemo<LimitsView | null>(() => {
        if (!hashHex || !query.data) {
            return null;
        }
        return buildLimitsView(query.data.stored, hashHex, jettonMeta);
    }, [hashHex, query.data, jettonMeta]);

    const hashMismatch = Boolean(hashHex) && query.isSuccess && (!query.data || query.data.hash !== hashHex);

    return {
        limits,
        isLoading: Boolean(hashHex) && query.isLoading,
        hashMismatch,
    };
}
