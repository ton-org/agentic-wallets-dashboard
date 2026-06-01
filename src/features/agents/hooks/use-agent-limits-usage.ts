/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useQuery } from '@tanstack/react-query';
import { useAppKit, useNetwork } from '@ton/appkit-react';

import type { AgentWallet } from '../types';
import type { AccountTx } from '../lib/account-transactions';
import { fetchAccountTransactionsWithBody } from '../lib/account-transactions';
import { normalizeAddressForComparison } from '../lib/address';
import { TON_ASSET_KEY } from '../lib/limits-codec';
import { getJettonWalletInfoFromClient } from '../lib/limits-jetton';
import { sumSpendWithinWindow, transactionsToSpend } from '../lib/spend-window';
import { usageKey } from '../lib/limits-constants';
import type { LimitsUsageMap, LimitsView, SpendEntry } from '../lib/limits-types';

/** Spend-history paging, mirroring MCP `fetchSpendEntries`. */
const LIMITS_SPEND_PAGE = 50;
const LIMITS_SPEND_MAX_PAGES = 20;

type TransactionsClient = Parameters<typeof fetchAccountTransactionsWithBody>[0];
interface NetworkLike {
    chainId: string;
}

async function fetchRecentTransactions(
    client: TransactionsClient,
    network: NetworkLike,
    address: string,
    cutoff: number,
): Promise<AccountTx[]> {
    const all: AccountTx[] = [];
    for (let page = 0; page < LIMITS_SPEND_MAX_PAGES; page += 1) {
        const transactions = await fetchAccountTransactionsWithBody(
            client,
            network,
            address,
            LIMITS_SPEND_PAGE,
            page * LIMITS_SPEND_PAGE,
        );
        if (transactions.length === 0) {
            break;
        }
        all.push(...transactions);

        const oldest = transactions[transactions.length - 1];
        if (oldest.now < cutoff) {
            break;
        }
        if (transactions.length < LIMITS_SPEND_PAGE) {
            break;
        }
    }
    return all;
}

/**
 * Compute spend per configured window, mirroring MCP enforcement: net TON outflow
 * per transaction plus jetton transfers (resolved jetton-wallet -> master via
 * `get_wallet_data`), summed over each rolling window ending now.
 */
async function computeUsage(
    client: TransactionsClient & Parameters<typeof getJettonWalletInfoFromClient>[0],
    network: NetworkLike,
    address: string,
    limits: LimitsView,
): Promise<LimitsUsageMap> {
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - limits.maxWindowSeconds;

    const transactions = await fetchRecentTransactions(client, network, address, cutoff);
    const { tonEntries, jettonProbes } = transactionsToSpend(transactions, address);

    const entries: SpendEntry[] = [...tonEntries];

    const uniqueWallets = [...new Set(jettonProbes.map((probe) => probe.jettonWalletAddress))];
    const walletToMaster = new Map<string, string | null>();
    await Promise.all(
        uniqueWallets.map(async (walletAddress) => {
            const info = await getJettonWalletInfoFromClient(client, walletAddress);
            walletToMaster.set(walletAddress, info?.master ? normalizeAddressForComparison(info.master) : null);
        }),
    );

    for (const probe of jettonProbes) {
        const master = walletToMaster.get(probe.jettonWalletAddress);
        if (!master) {
            continue;
        }
        entries.push({ timestamp: probe.timestamp, asset: master, amount: probe.amount });
    }

    const usage: LimitsUsageMap = {};
    for (const asset of limits.assets) {
        const normalizedKey =
            asset.assetKey === TON_ASSET_KEY
                ? TON_ASSET_KEY
                : (normalizeAddressForComparison(asset.assetKey) ?? asset.assetKey);
        for (const window of asset.windows) {
            if (window.windowSeconds === 0) {
                continue; // per-transaction caps are not rolling-window metered
            }
            usage[usageKey(asset.assetKey, window.windowSeconds)] = sumSpendWithinWindow(
                entries,
                normalizedKey,
                now,
                window.windowSeconds,
            );
        }
    }

    return usage;
}

export interface UseAgentLimitsUsageResult {
    usage: LimitsUsageMap;
    isLoading: boolean;
}

/**
 * Live rolling-window spend for the configured limits, reproducing the MCP's
 * per-transaction accounting so the bars match what the MCP will enforce.
 */
export function useAgentLimitsUsage(agent: AgentWallet | null, limits: LimitsView | null): UseAgentLimitsUsageResult {
    const appKit = useAppKit();
    const network = useNetwork();

    const address = agent?.address ?? null;
    const maxWindowSeconds = limits?.maxWindowSeconds ?? 0;
    const enabled = !!network && !!address && !!limits && maxWindowSeconds > 0;

    const query = useQuery({
        queryKey: ['agent-limits-usage', network?.chainId ?? null, address, limits?.hashHex ?? null, maxWindowSeconds],
        enabled,
        staleTime: 15_000,
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: async (): Promise<LimitsUsageMap> => {
            if (!network || !address || !limits) {
                return {};
            }
            const client = appKit.networkManager.getClient(network);
            return computeUsage(client, network, address, limits);
        },
    });

    return {
        usage: query.data ?? {},
        isLoading: enabled && query.isLoading,
    };
}
