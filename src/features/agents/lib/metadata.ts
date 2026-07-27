/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { beginCell, Cell, Dictionary } from '@ton/core';
import { sha256_sync } from '@ton/crypto';

const ONCHAIN_CONTENT_PREFIX = 0x00;
const SNAKE_CONTENT_PREFIX = 0x00;
const MAX_NAME_LENGTH = 64;

const METADATA_KEYS = {
    name: 'name',
    creationDate: 'creation_date',
} as const;

export function onchainMetadataKey(key: string): bigint {
    return BigInt(`0x${sha256_sync(key).toString('hex')}`);
}

export function buildOnchainMetadataValue(value: string): Cell {
    return beginCell().storeUint(SNAKE_CONTENT_PREFIX, 8).storeStringTail(value).endCell();
}

export function buildOnchainMetadataCell(fields: Record<string, string>): Cell {
    const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());
    for (const [key, rawValue] of Object.entries(fields)) {
        const value = rawValue.trim();
        if (!value) {
            continue;
        }
        dict.set(onchainMetadataKey(key), buildOnchainMetadataValue(value));
    }

    return beginCell().storeUint(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

export function parseOnchainMetadataDict(content: Cell | null): Dictionary<bigint, Cell> {
    const empty = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell());

    if (!content) {
        return empty;
    }

    const slice = content.beginParse();
    if (slice.remainingBits < 8) {
        throw new Error('Unsupported metadata format');
    }

    const prefix = Number(slice.loadUint(8));
    if (prefix !== ONCHAIN_CONTENT_PREFIX) {
        throw new Error('Unsupported metadata format');
    }

    const root = slice.loadMaybeRef();
    if (!root) {
        return empty;
    }

    return Dictionary.loadDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell(), root.beginParse());
}

function readSnakeBuffer(cell: Cell): Buffer {
    const chunks: Buffer[] = [];
    let current: Cell | null = cell;

    while (current) {
        const slice = current.beginParse();
        if (slice.remainingBits % 8 !== 0) {
            throw new Error('Unsupported metadata format');
        }

        const bytes = slice.remainingBits / 8;
        if (bytes > 0) {
            chunks.push(slice.loadBuffer(bytes));
        }

        if (slice.remainingRefs > 1) {
            throw new Error('Unsupported metadata format');
        }

        current = slice.remainingRefs === 1 ? slice.loadRef() : null;
    }

    return Buffer.concat(chunks);
}

export function parseOnchainMetadataValue(cell: Cell): string {
    const buf = readSnakeBuffer(cell);
    if (buf.length === 0 || buf[0] !== SNAKE_CONTENT_PREFIX) {
        throw new Error('Unsupported metadata format');
    }
    return buf.subarray(1).toString('utf-8');
}

export function extractNameFromMetadata(content: Cell | null): string | null {
    return extractStringFromMetadata(content, METADATA_KEYS.name);
}

export function extractStringFromMetadata(content: Cell | null, key: string): string | null {
    if (!content) {
        return null;
    }

    const dict = parseOnchainMetadataDict(content);
    const rawValue = dict.get(onchainMetadataKey(key));
    if (!rawValue) {
        return null;
    }
    return parseOnchainMetadataValue(rawValue);
}

export function extractCreationDateFromMetadata(content: Cell | null): string | null {
    const rawValue = extractStringFromMetadata(content, METADATA_KEYS.creationDate);
    if (!rawValue) {
        return null;
    }

    const trimmed = rawValue.trim();
    if (!trimmed) {
        return null;
    }

    if (/^\d+$/.test(trimmed)) {
        const numericValue = Number(trimmed);
        if (!Number.isFinite(numericValue)) {
            return null;
        }

        const timestampMs = trimmed.length <= 10 ? numericValue * 1000 : numericValue;
        const parsedDate = new Date(timestampMs);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
    }

    const parsedDate = new Date(trimmed);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
}

export function buildUpdatedMetadataCell(currentContent: Cell | null, newNameRaw: string): Cell {
    const newName = newNameRaw.trim();
    if (newName.length < 1 || newName.length > MAX_NAME_LENGTH) {
        throw new Error('Agent name must be between 1 and 64 characters');
    }

    const dict = parseOnchainMetadataDict(currentContent);
    dict.set(onchainMetadataKey(METADATA_KEYS.name), buildOnchainMetadataValue(newName));

    return beginCell().storeUint(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}

/** TEP-64 onchain attribute key under which the limits integrity anchor is stored. */
export const LIMITS_HASH_KEY = 'limits_hash';

/**
 * Read the on-chain `limits_hash` hex anchor from a wallet's NFT content cell, or
 * `null` when no limits are set. Trimmed to match how the MCP reads it
 * (`readOnchainMetadataValue(content, 'limits_hash')` trims the snake value).
 */
export function extractLimitsHashFromMetadata(content: Cell | null): string | null {
    const value = extractStringFromMetadata(content, LIMITS_HASH_KEY);
    if (value === null) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Clone the wallet's onchain metadata dict and set (or, when `hashHex` is null,
 * delete) the `limits_hash` attribute, preserving every other key (name,
 * creation_date, ...). Setting limits writes the new hash; clearing limits drops
 * the key so the MCP treats the wallet as unlimited.
 */
export function buildContentWithLimitsHash(currentContent: Cell | null, hashHex: string | null): Cell {
    const dict = parseOnchainMetadataDict(currentContent);
    const key = onchainMetadataKey(LIMITS_HASH_KEY);
    if (hashHex && hashHex.trim()) {
        dict.set(key, buildOnchainMetadataValue(hashHex.trim()));
    } else {
        dict.delete(key);
    }

    return beginCell().storeUint(ONCHAIN_CONTENT_PREFIX, 8).storeDict(dict).endCell();
}
