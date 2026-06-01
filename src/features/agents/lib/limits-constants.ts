/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

export interface WindowPreset {
    /** Rolling window in seconds; `0` means a per-transaction cap. */
    seconds: number;
    /** Human label shown in dropdowns and rows. */
    label: string;
}

/**
 * UI presets for common windows. The on-chain format allows any uint32 window,
 * so the modal also offers a "Custom (seconds)" option.
 */
export const WINDOW_PRESETS: WindowPreset[] = [
    { seconds: 0, label: 'Per transaction' },
    { seconds: 3600, label: 'Per hour' },
    { seconds: 86400, label: 'Per day' },
    { seconds: 604800, label: 'Per week' },
];

/** Stable key for the live-usage map shared by the usage hook and the card. */
export function usageKey(assetKey: string, windowSeconds: number): string {
    return `${assetKey}|${windowSeconds}`;
}

const PRESET_LABEL = new Map(WINDOW_PRESETS.map((preset) => [preset.seconds, preset.label]));

/** Human label for any window length (presets, or a friendly fallback). */
export function formatWindowLabel(seconds: number): string {
    const preset = PRESET_LABEL.get(seconds);
    if (preset) {
        return preset;
    }
    if (seconds % 86400 === 0) {
        return `Per ${seconds / 86400} days`;
    }
    if (seconds % 3600 === 0) {
        return `Per ${seconds / 3600} hours`;
    }
    if (seconds % 60 === 0) {
        return `Per ${seconds / 60} minutes`;
    }
    return `Per ${seconds}s`;
}
