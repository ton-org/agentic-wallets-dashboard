/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { AccountTx } from './account-transactions';

import { normalizeAddressForComparison } from './address';
import { TON_ASSET_KEY } from './limits-codec';
import { parseJettonOutflowAmount } from './limits-jetton';
import type { JettonSpendProbe, SpendEntry, TransactionSpend } from './limits-types';

/**
 * Reduce a page of account transactions into per-transaction net outgoing-spend
 * for `walletAddress`, parsing jetton transfers directly from message bodies.
 *
 * - TON: per transaction, `net = sum(out-message values) - in-message value` so a
 *   contract call that forwards funds is metered at its net cost (e.g. receive 0.1
 *   then send 1 counts as 0.9). Only positive net is recorded as spend.
 * - Jettons: every out-message carrying a TEP-74 transfer/burn op yields a probe
 *   (amount + jetton-wallet address); the caller resolves the wallet to a master
 *   and aggregates. Incoming jettons arrive as transfer-notifications, never as a
 *   transfer/burn op, so they are not picked up here.
 *
 * Transactions whose compute phase explicitly failed are skipped; their actions
 * were reverted and moved no funds.
 */
export function transactionsToSpend(transactions: AccountTx[], walletAddress: string): TransactionSpend {
    const walletRaw = normalizeAddressForComparison(walletAddress);
    if (!walletRaw) {
        return { tonEntries: [], jettonProbes: [] };
    }

    const tonEntries: SpendEntry[] = [];
    const jettonProbes: JettonSpendProbe[] = [];

    for (const transaction of transactions) {
        if (transaction.description?.computePhase?.isSuccess === false) {
            continue;
        }

        let tonOut = 0n;
        for (const message of transaction.outMessages) {
            if (!isFromWallet(message.source, walletRaw)) {
                continue;
            }
            tonOut += toBigInt(message.value);
            const outflow = parseJettonOutflowAmount(message.messageContent?.body);
            if (outflow && outflow > 0n && message.destination) {
                jettonProbes.push({
                    timestamp: transaction.now,
                    jettonWalletAddress: message.destination,
                    amount: outflow,
                });
            }
        }

        const tonNet = tonOut - toBigInt(transaction.inMessage?.value);
        if (tonNet > 0n) {
            tonEntries.push({ timestamp: transaction.now, asset: TON_ASSET_KEY, amount: tonNet });
        }
    }

    return { tonEntries, jettonProbes };
}

/** Sum recorded spend for `asset` within the last `windowSeconds` (inclusive of `now - window`). */
export function sumSpendWithinWindow(entries: SpendEntry[], asset: string, now: number, windowSeconds: number): bigint {
    const cutoff = now - windowSeconds;
    let total = 0n;
    for (const entry of entries) {
        if (entry.asset === asset && entry.timestamp >= cutoff) {
            total += entry.amount;
        }
    }
    return total;
}

/**
 * Whether an out-message was emitted by this wallet. Messages in the `outMessages`
 * list of a transaction on the wallet's account are emitted by it, but the indexer
 * may omit `source`; an absent source is treated as the wallet, a present one must
 * match.
 */
function isFromWallet(source: string | undefined, walletRaw: string): boolean {
    if (!source) {
        return true;
    }
    return normalizeAddressForComparison(source) === walletRaw;
}

function toBigInt(value: bigint | string | number | undefined): bigint {
    if (value === undefined) {
        return 0n;
    }
    try {
        return typeof value === 'bigint' ? value : BigInt(value);
    } catch {
        return 0n;
    }
}
