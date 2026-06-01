/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Provider-aware account-transactions fetch that always carries message bodies.
 *
 * The limits feature recovers the off-chain `limitsDict` from a transaction's
 * message body, but walletkit's **tonapi** client hardcodes
 * `messageContent.body = undefined` (it only maps the toncenter
 * `message_content.body`). tonapi instead returns the body as `in_msg.raw_body`
 * (a hex BOC), which the typed `Transaction` never surfaces. Since this app runs
 * on the tonapi provider, the limits decode / spend-usage would otherwise see no
 * body at all.
 *
 * This module fetches transactions in a provider-aware way and normalizes the
 * body to a base64 BOC so the existing `Cell.fromBase64(body)` consumers work
 * unchanged: tonapi via a direct REST call (mirroring walletkit's own field
 * mapping, plus `raw_body`), toncenter via walletkit (its body is already
 * populated).
 */

import { Cell } from '@ton/core';

import { ENV_TON_API_KEY_MAINNET, ENV_TON_API_KEY_TESTNET, ENV_TON_API_PROVIDER } from '@/core/configs/env';

/** testnet masterchain workchain id, as exposed by `Network.testnet().chainId`. */
const TESTNET_CHAIN_ID = '-3';

/** A transaction message with its body normalized to a base64 BOC. */
export interface AccountTxMessage {
    source?: string;
    destination?: string;
    value?: string;
    /** Base64 BOC of the message body (normalized from tonapi hex `raw_body`). */
    messageContent?: { body?: string };
}

/**
 * The subset of a transaction the limits decode and spend-window need, with
 * message bodies guaranteed present regardless of provider. Structurally a subset
 * of walletkit's `Transaction`, so toncenter results assign without remapping.
 */
export interface AccountTx {
    /** Lowercased hex transaction hash, no `0x` prefix (matches tonapi event `base_transactions`). */
    hash?: string;
    now: number;
    description?: { computePhase?: { isSuccess?: boolean } };
    inMessage?: AccountTxMessage;
    outMessages: AccountTxMessage[];
}

interface WalletkitTransactionsClient {
    getAccountTransactions: (request: {
        address: string[];
        limit: number;
        offset: number;
    }) => Promise<{ transactions?: AccountTx[] }>;
}

interface NetworkLike {
    chainId: string;
}

/** Normalize any hash form to lowercased hex without a `0x` prefix. */
export function normalizeTxHash(value: string | undefined | null): string | undefined {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim().toLowerCase();
    return trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
}

function tonapiBaseUrl(chainId: string): string {
    return chainId === TESTNET_CHAIN_ID ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
}

function apiKeyForNetwork(chainId: string): string {
    return chainId === TESTNET_CHAIN_ID ? ENV_TON_API_KEY_TESTNET : ENV_TON_API_KEY_MAINNET;
}

/** Convert a tonapi `raw_body` hex BOC to the base64 BOC the consumers parse. */
function rawBodyToBase64(rawBody: unknown): string | undefined {
    if (typeof rawBody !== 'string' || rawBody.length === 0) {
        return undefined;
    }
    try {
        return Cell.fromHex(rawBody).toBoc().toString('base64');
    } catch {
        return undefined;
    }
}

interface TonApiRawMessage {
    source?: { address?: string };
    destination?: { address?: string };
    value?: number | string;
    raw_body?: string;
}

function mapTonApiMessage(raw: TonApiRawMessage | undefined): AccountTxMessage | undefined {
    if (!raw) {
        return undefined;
    }
    return {
        source: raw.source?.address,
        destination: raw.destination?.address,
        value: raw.value !== undefined && raw.value !== null ? String(raw.value) : undefined,
        messageContent: { body: rawBodyToBase64(raw.raw_body) },
    };
}

interface TonApiRawTransaction {
    hash?: string;
    utime?: number;
    success?: boolean;
    compute_phase?: { success?: boolean };
    in_msg?: TonApiRawMessage;
    out_msgs?: TonApiRawMessage[];
}

async function fetchTonApiTransactions(
    network: NetworkLike,
    address: string,
    limit: number,
    offset: number,
): Promise<AccountTx[]> {
    const url = new URL(`/v2/blockchain/accounts/${address}/transactions`, tonapiBaseUrl(network.chainId));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort_order', 'desc');

    const apiKey = apiKeyForNetwork(network.chainId);
    const response = await fetch(url.toString(), {
        headers: {
            accept: 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
    });
    if (!response.ok) {
        throw new Error(`tonapi transactions request failed (${response.status})`);
    }

    const data = (await response.json()) as { transactions?: TonApiRawTransaction[] };
    return (data.transactions ?? []).map((raw) => ({
        hash: normalizeTxHash(raw.hash),
        now: Number(raw.utime ?? 0),
        description: { computePhase: { isSuccess: raw.compute_phase?.success ?? raw.success ?? true } },
        inMessage: mapTonApiMessage(raw.in_msg),
        outMessages: (raw.out_msgs ?? []).map((message) => mapTonApiMessage(message)).filter(Boolean) as AccountTxMessage[],
    }));
}

/**
 * Fetch one page of account transactions with message bodies populated. On the
 * tonapi provider this issues a direct REST call (walletkit drops the body); on
 * toncenter it delegates to the walletkit client whose body is already present.
 */
export async function fetchAccountTransactionsWithBody(
    client: WalletkitTransactionsClient,
    network: NetworkLike,
    address: string,
    limit: number,
    offset: number,
): Promise<AccountTx[]> {
    if (ENV_TON_API_PROVIDER === 'tonapi') {
        return fetchTonApiTransactions(network, address, limit, offset);
    }

    const response = await client.getAccountTransactions({ address: [address], limit, offset });
    return (response.transactions ?? []).map((transaction) => ({
        ...transaction,
        hash: normalizeTxHash(transaction.hash),
    }));
}
