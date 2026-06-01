/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Address } from '@ton/core';

export function normalizeTonAddress(address: string | undefined | null): string | null {
    if (!address) {
        return null;
    }

    try {
        return Address.parse(address).toRawString();
    } catch {
        return null;
    }
}

/**
 * Reduce an address to its canonical raw form (`workchain:hash`) for equality
 * comparison, or `null` when the input is not a valid address. Matches the MCP
 * `utils/address.ts` `normalizeAddressForComparison`, which the ported limits
 * codec / spend-window modules depend on.
 */
export function normalizeAddressForComparison(value: string | undefined | null): string | null {
    return normalizeTonAddress(value);
}

export function isSameTonAddress(a: string | undefined | null, b: string | undefined | null): boolean {
    const na = normalizeTonAddress(a);
    const nb = normalizeTonAddress(b);

    if (na && nb) {
        return na === nb;
    }

    return (a ?? '').trim() === (b ?? '').trim();
}

export function formatTonAddressForNetwork(
    address: string | undefined | null,
    chainId: string | undefined | null,
): string {
    if (!address) {
        return '';
    }

    try {
        return Address.parse(address).toString({
            bounceable: false,
            testOnly: String(chainId) === '-3',
        });
    } catch {
        return address;
    }
}
