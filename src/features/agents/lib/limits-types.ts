/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { Address, Dictionary } from '@ton/core';

/**
 * On-chain wire shape of the limits, recovered from a ChangeNftContentMsg body:
 * `map<address, map<uint32, coins>>` = {asset: {window_seconds: max_spend}}.
 *
 * - Outer key: the asset address. TON is the sentinel zero address; jettons use
 *   their jetton-master address.
 * - Inner key: rolling window in seconds. The special value `0` is a
 *   per-transaction limit.
 * - Inner value: maximum spend in the asset's base units.
 */
export type LimitsDict = Dictionary<Address, Dictionary<number, bigint>>;

/**
 * A single outgoing-spend observation derived from on-chain history, already
 * netted per asset. Amounts are strictly positive base units.
 */
export interface SpendEntry {
    /** Unix timestamp in seconds. */
    timestamp: number;
    /** Normalized asset key: `'TON'` or a normalized jetton-master address. */
    asset: string;
    /** Spent amount in the asset's base units (always > 0). */
    amount: bigint;
}

/**
 * A single outgoing jetton transfer recovered from a transaction's out-messages,
 * before its jetton-wallet address is resolved to a master. Resolution and
 * per-master aggregation happen in the service (they require a `get_wallet_data`
 * call), keeping the transaction parser pure and synchronous.
 */
export interface JettonSpendProbe {
    /** Unix timestamp in seconds of the transaction that emitted the transfer. */
    timestamp: number;
    /** Destination of the transfer message: this wallet's jetton-wallet address. */
    jettonWalletAddress: string;
    /** Transferred (or burned) amount in base jetton units (always > 0). */
    amount: bigint;
}

/**
 * Outgoing spend recovered from a page of account transactions: netted TON
 * entries ready to use, and unresolved jetton outflows awaiting master lookup.
 */
export interface TransactionSpend {
    /** Net TON spend entries (one per transaction with positive net outflow). */
    tonEntries: SpendEntry[];
    /** Outgoing jetton transfers, keyed by jetton-wallet address (unresolved). */
    jettonProbes: JettonSpendProbe[];
}

/**
 * Amounts the pending (not-yet-broadcast) transaction will spend, grouped by
 * normalized asset key.
 */
export interface PendingSpend {
    /** Total TON outflow across all messages, in nanotons. */
    ton: bigint;
    /** Normalized jetton-master address -> outflow amount in base jetton units. */
    jettons: Map<string, bigint>;
}

/**
 * Decoded mirror of the on-chain limitsDict, JSON-friendly. Mirrors the MCP
 * `StoredLimits` config shape so the dashboard and MCP agree on the decode
 * target (MCP `registry/config.ts`).
 */
export interface StoredLimits {
    /** Keyed by asset address (`'TON'` sentinel for native TON). */
    assets: Record<string, StoredAssetLimit>;
}

export interface StoredAssetLimit {
    /** Rolling windows: window seconds -> max spend in base units, as a decimal string. */
    windows: Record<string, string>;
}

/** One configured window within an asset, decoded for display. */
export interface WindowLimitView {
    /** Rolling window in seconds; `0` is a per-transaction cap. */
    windowSeconds: number;
    /** Human label, e.g. "Per transaction", "Per day", "Per 7200s". */
    label: string;
    /** Max spend in the asset's base units. */
    limit: bigint;
}

/** One asset's limits, decoded and enriched with display metadata. */
export interface AssetLimitView {
    /** Normalized asset key: `'TON'` or the jetton-master address. */
    assetKey: string;
    /** Display symbol: `'TON'`, the jetton symbol, or a shortened address. */
    symbol: string;
    /** Decimals for base-unit <-> UI conversion (9 for TON). */
    decimals: number;
    /** Optional token icon URL. */
    imageUrl?: string;
    /** Configured windows, sorted (per-tx first, then ascending). */
    windows: WindowLimitView[];
}

/** Decoded, display-ready limits for a wallet. */
export interface LimitsView {
    /** The on-chain `limits_hash` these limits correspond to. */
    hashHex: string;
    /** Per-asset limits. */
    assets: AssetLimitView[];
    /** Largest configured window across all assets, in seconds (0 if only per-tx). */
    maxWindowSeconds: number;
}

/**
 * Live usage per `${assetKey}|${windowSeconds}`, in base units, for the rolling
 * window ending now. Per-transaction (window 0) entries are not metered here.
 */
export type LimitsUsageMap = Record<string, bigint>;
