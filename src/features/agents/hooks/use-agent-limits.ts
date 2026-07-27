/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { useAppKit, useJettonsByAddress, useNetwork } from '@ton/appkit-react';

import type { AgentWallet } from '../types';
import { extractLimitsHashFromMetadata } from '../lib/metadata';
import { fetchLimitsChainData } from '../lib/limits-chain-data';
import type { LimitsChainData } from '../lib/limits-chain-data';
import { TON_ASSET_KEY } from '../lib/limits-codec';
import { formatWindowLabel, shortenAssetKey } from '../lib/limits-constants';
import type { AssetLimitView, LimitsView, StoredLimits, WindowLimitView } from '../lib/limits-types';

interface JettonMeta {
    symbol: string;
    decimals: number;
    imageUrl?: string;
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

/**
 * Shared query that fetches account history once and derives both the decoded
 * limits and the rolling-window spend from the same transactions. `useAgentLimits`
 * and `useAgentLimitsUsage` both subscribe to this with an identical query key, so
 * React Query performs a single fetch+compute no matter how many limits hooks are
 * mounted — the spend bars and the decoded config can never disagree on history.
 */
export function useAgentLimitsChainData(agent: AgentWallet | null): UseQueryResult<LimitsChainData> {
    const appKit = useAppKit();
    const network = useNetwork();

    const hashHex = agent ? extractLimitsHashFromMetadata(agent.nftItemContent) : null;
    const address = agent?.address ?? null;

    return useQuery({
        queryKey: ['agent-limits-data', network?.chainId ?? null, address, hashHex],
        enabled: !!network && !!address && !!hashHex,
        staleTime: 15_000,
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<LimitsChainData> => {
            if (!network || !address) {
                return { decoded: null, usage: {} };
            }
            const client = appKit.networkManager.getClient(network);
            return fetchLimitsChainData(client, network, address);
        },
    });
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
    const network = useNetwork();

    const hashHex = agent ? extractLimitsHashFromMetadata(agent.nftItemContent) : null;
    const address = agent?.address ?? null;

    const { data: jettonsResponse } = useJettonsByAddress({
        address: address ?? '',
        network: network ?? undefined,
        query: { enabled: !!address && !!hashHex },
    });

    const query = useAgentLimitsChainData(agent);

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
        if (!hashHex || !query.data?.decoded) {
            return null;
        }
        return buildLimitsView(query.data.decoded.stored, hashHex, jettonMeta);
    }, [hashHex, query.data, jettonMeta]);

    const hashMismatch =
        Boolean(hashHex) && query.isSuccess && (!query.data?.decoded || query.data.decoded.hash !== hashHex);

    return {
        limits,
        isLoading: Boolean(hashHex) && query.isLoading,
        hashMismatch,
    };
}
