/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/**
 * Parity gate for the transaction-limits codec. The dashboard is the only writer
 * of limits, so its serialization must match the MCP reader/verifier byte-for-byte.
 * These cases mirror the MCP's `__tests__/limits-codec.spec.ts`, plus a pinned
 * canonical hash and the rename<->limits metadata-coexistence checks.
 *
 * Run with: `pnpm add -D vitest && pnpm exec vitest run` (test files are excluded
 * from `tsconfig.app.json` so the app typecheck does not require vitest).
 */

import { Address, beginCell } from '@ton/core';
import { describe, expect, it } from 'vitest';

import {
    CHANGE_NFT_CONTENT_OP,
    TON_ASSET_KEY,
    assetKeyForAddress,
    computeLimitsHash,
    limitsDictToStored,
    normalizeAssetKey,
    parseLimitsDictFromMessageBody,
    storedToLimitsDict,
} from '../limits-codec';
import type { LimitsDict, StoredLimits } from '../limits-types';
import {
    buildContentWithLimitsHash,
    buildUpdatedMetadataCell,
    extractLimitsHashFromMetadata,
    extractNameFromMetadata,
} from '../metadata';

const SENTINEL = new Address(0, Buffer.alloc(32));
const JETTON = new Address(0, Buffer.alloc(32, 7));

const STORED: StoredLimits = {
    assets: {
        [TON_ASSET_KEY]: { windows: { '0': '5000000000', '3600': '20000000000' } },
        [JETTON.toString()]: { windows: { '86400': '1000' } },
    },
};

/**
 * The on-chain `limits_hash` the MCP computes for {@link STORED}, derived from the
 * canonical `beginCell().storeDictDirect(dict).endCell().hash()` serialization both
 * implementations share. A change here means the dashboard and MCP have diverged.
 */
const STORED_LIMITS_HASH = '9b4b54aa6d31eb3bcfb7bfd6b3e384363f1efa3b319bdee091186ed0a619cafe';

/** A ChangeNftContentMsg body carrying `dict` after the (here empty) NFT content. */
function changeContentBody(dict: LimitsDict, op = CHANGE_NFT_CONTENT_OP) {
    return beginCell().storeUint(op, 32).storeUint(1n, 64).storeMaybeRef(null).storeDict(dict).endCell();
}

describe('limits-codec asset keys', () => {
    it('maps the zero address to the TON sentinel and jettons to their master', () => {
        expect(assetKeyForAddress(SENTINEL)).toBe(TON_ASSET_KEY);
        expect(assetKeyForAddress(JETTON)).toBe(JETTON.toString());
    });

    it('normalizes keys to a comparable form and rejects non-addresses', () => {
        expect(normalizeAssetKey(TON_ASSET_KEY)).toBe(TON_ASSET_KEY);
        expect(normalizeAssetKey(JETTON.toString())).toBe(JETTON.toRawString());
        expect(normalizeAssetKey('not-an-address')).toBeNull();
    });
});

describe('limits-codec round-trip', () => {
    it('round-trips StoredLimits -> dict -> StoredLimits', () => {
        expect(limitsDictToStored(storedToLimitsDict(STORED))).toEqual(STORED);
    });

    it('matches the MCP canonical limits_hash (byte-for-byte parity)', () => {
        expect(computeLimitsHash(storedToLimitsDict(STORED))).toBe(STORED_LIMITS_HASH);
    });

    it('computes a hash invariant under asset- and window-key insertion order', () => {
        const reordered: StoredLimits = {
            assets: {
                [JETTON.toString()]: { windows: { '86400': '1000' } },
                [TON_ASSET_KEY]: { windows: { '3600': '20000000000', '0': '5000000000' } },
            },
        };
        expect(computeLimitsHash(storedToLimitsDict(reordered))).toBe(STORED_LIMITS_HASH);
    });

    it('computes a hash invariant under friendly-vs-raw address form', () => {
        const rawForm: StoredLimits = {
            assets: {
                [TON_ASSET_KEY]: STORED.assets[TON_ASSET_KEY],
                [JETTON.toRawString()]: { windows: { '86400': '1000' } },
            },
        };
        expect(computeLimitsHash(storedToLimitsDict(rawForm))).toBe(STORED_LIMITS_HASH);
    });

    it('parses the limitsDict back out of a ChangeNftContentMsg body', () => {
        const dict = storedToLimitsDict(STORED);
        const parsed = parseLimitsDictFromMessageBody(changeContentBody(dict));
        expect(parsed).not.toBeNull();
        expect(limitsDictToStored(parsed!)).toEqual(STORED);
        expect(computeLimitsHash(parsed!)).toBe(STORED_LIMITS_HASH);
    });

    it('returns null for a non-ChangeNftContentMsg opcode', () => {
        expect(parseLimitsDictFromMessageBody(changeContentBody(storedToLimitsDict(STORED), 0x12345678))).toBeNull();
    });

    it('returns null for a ChangeNftContentMsg with no trailing limitsDict (a rename)', () => {
        const body = beginCell().storeUint(CHANGE_NFT_CONTENT_OP, 32).storeUint(1n, 64).storeMaybeRef(null).endCell();
        expect(parseLimitsDictFromMessageBody(body)).toBeNull();
    });
});

describe('limits_hash metadata coexistence', () => {
    it('set-limits stores the hash and preserves the name', () => {
        const named = buildUpdatedMetadataCell(null, 'My Agent');
        const withLimits = buildContentWithLimitsHash(named, STORED_LIMITS_HASH);
        expect(extractLimitsHashFromMetadata(withLimits)).toBe(STORED_LIMITS_HASH);
        expect(extractNameFromMetadata(withLimits)).toBe('My Agent');
    });

    it('rename preserves an existing limits_hash', () => {
        const named = buildUpdatedMetadataCell(null, 'My Agent');
        const withLimits = buildContentWithLimitsHash(named, STORED_LIMITS_HASH);
        const renamed = buildUpdatedMetadataCell(withLimits, 'New Name');
        expect(extractLimitsHashFromMetadata(renamed)).toBe(STORED_LIMITS_HASH);
        expect(extractNameFromMetadata(renamed)).toBe('New Name');
    });

    it('clear-limits drops the hash and preserves the name', () => {
        const named = buildUpdatedMetadataCell(null, 'My Agent');
        const withLimits = buildContentWithLimitsHash(named, STORED_LIMITS_HASH);
        const cleared = buildContentWithLimitsHash(withLimits, null);
        expect(extractLimitsHashFromMetadata(cleared)).toBeNull();
        expect(extractNameFromMetadata(cleared)).toBe('My Agent');
    });
});
