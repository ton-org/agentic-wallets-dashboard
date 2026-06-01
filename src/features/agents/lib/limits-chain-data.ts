/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Cell } from '@ton/core';
import type { ApiClient } from '@ton/walletkit';

import type { AccountTx } from './account-transactions';
import { fetchAccountTransactionsWithBody } from './account-transactions';
import { normalizeAddressForComparison } from './address';
import {
    computeLimitsHash,
    limitsDictToStored,
    parseLimitsDictFromMessageBody,
    TON_ASSET_KEY,
} from './limits-codec';
import { usageKey } from './limits-constants';
import { getJettonWalletInfoFromClient } from './limits-jetton';
import type { LimitsUsageMap, SpendEntry, StoredLimits } from './limits-types';
import { sumSpendWithinWindow, transactionsToSpend } from './spend-window';

/**
 * One page of 50 transactions; up to 20 pages (~1000 transactions) cover both the
 * latest limits-change lookup and the longest rolling window we meter.
 */
const LIMITS_PAGE = 50;
const LIMITS_MAX_PAGES = 20;

interface NetworkLike {
    chainId: string;
}

/** Decoded mirror of the on-chain limits, plus the dict hash to verify against `limits_hash`. */
export interface DecodedLimits {
    stored: StoredLimits;
    /** Hash of the decoded dict, to verify against the on-chain `limits_hash`. */
    hash: string;
}

/**
 * Everything the limits UI derives from account history, computed from a single
 * fetch so the decoded limits and the spend bars always agree on the same
 * transaction objects.
 */
export interface LimitsChainData {
    /** Decoded limits from the latest limits-change transaction, or `null` if none found. */
    decoded: DecodedLimits | null;
    /** Rolling-window spend per `${assetKey}|${windowSeconds}`; empty when no windows are metered. */
    usage: LimitsUsageMap;
}

/** Largest configured rolling window across all assets, in seconds (0 if only per-transaction caps). */
function maxWindowSecondsOf(stored: StoredLimits): number {
    let max = 0;
    for (const asset of Object.values(stored.assets)) {
        for (const seconds of Object.keys(asset.windows)) {
            const value = Number(seconds);
            if (value > max) {
                max = value;
            }
        }
    }
    return max;
}

/** Decode the first (newest) transaction in a page whose body carries a non-empty limitsDict. */
function decodeLimitsFromPage(transactions: AccountTx[]): DecodedLimits | null {
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
    return null;
}

/**
 * Compute spend per configured window from already-fetched transactions, mirroring
 * MCP enforcement: net TON outflow per transaction plus jetton transfers (resolved
 * jetton-wallet -> master via `get_wallet_data`), summed over each rolling window
 * ending now.
 */
async function computeUsageFromTransactions(
    client: ApiClient,
    transactions: AccountTx[],
    stored: StoredLimits,
    address: string,
    now: number,
): Promise<LimitsUsageMap> {
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
    for (const [assetKey, assetLimit] of Object.entries(stored.assets)) {
        const normalizedKey =
            assetKey === TON_ASSET_KEY ? TON_ASSET_KEY : (normalizeAddressForComparison(assetKey) ?? assetKey);
        for (const seconds of Object.keys(assetLimit.windows)) {
            const windowSeconds = Number(seconds);
            if (windowSeconds === 0) {
                continue; // per-transaction caps are not rolling-window metered
            }
            usage[usageKey(assetKey, windowSeconds)] = sumSpendWithinWindow(
                entries,
                normalizedKey,
                now,
                windowSeconds,
            );
        }
    }
    return usage;
}

/**
 * Fetch account history once and derive everything the limits UI needs from the
 * same transaction objects: the decoded `limitsDict` (+hash) from the latest
 * limits-change transaction, and the rolling-window spend for each configured
 * window.
 *
 * Paging (newest first) stops as soon as both needs are met — the latest
 * limits-change transaction has been found and history reaches back past the
 * longest window — or when history is exhausted / the page cap is hit.
 */
export async function fetchLimitsChainData(
    client: ApiClient,
    network: NetworkLike,
    address: string,
): Promise<LimitsChainData> {
    const now = Math.floor(Date.now() / 1000);
    const transactions: AccountTx[] = [];
    let decoded: DecodedLimits | null = null;
    let maxWindowSeconds = 0;

    for (let page = 0; page < LIMITS_MAX_PAGES; page += 1) {
        const pageTransactions = await fetchAccountTransactionsWithBody(
            client,
            network,
            address,
            LIMITS_PAGE,
            page * LIMITS_PAGE,
        );
        if (pageTransactions.length === 0) {
            break;
        }
        transactions.push(...pageTransactions);

        if (!decoded) {
            decoded = decodeLimitsFromPage(pageTransactions);
            if (decoded) {
                maxWindowSeconds = maxWindowSecondsOf(decoded.stored);
            }
        }

        if (decoded) {
            // Only per-transaction caps configured: no rolling window needs older history.
            if (maxWindowSeconds === 0) {
                break;
            }
            const oldest = pageTransactions[pageTransactions.length - 1];
            if (oldest.now < now - maxWindowSeconds) {
                break; // history now reaches back past the longest window
            }
        }

        if (pageTransactions.length < LIMITS_PAGE) {
            break;
        }
    }

    const usage =
        decoded && maxWindowSeconds > 0
            ? await computeUsageFromTransactions(client, transactions, decoded.stored, address, now)
            : {};

    return { decoded, usage };
}
