/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { useJettonsByAddress, useNetwork } from '@ton/appkit-react';
import { Plus, Trash2 } from 'lucide-react';

import { Modal } from './modal';

import type { AgentWallet } from '@/features/agents';
import { useAgentOperations } from '@/features/agents';
import { storedToLimitsDict, TON_ASSET_KEY } from '@/features/agents/lib/limits-codec';
import type { LimitsView, StoredLimits } from '@/features/agents/lib/limits-types';
import { shortenAssetKey, WINDOW_PRESETS } from '@/features/agents/lib/limits-constants';
import { formatUnitsTrimmed, parseUiAmountToUnits } from '@/features/agents/lib/amount';

interface LimitsModalProps {
    agent: AgentWallet | null;
    currentLimits?: LimitsView | null;
    onClose: () => void;
    onSuccess?: () => void | Promise<void>;
}

interface AssetOption {
    key: string;
    symbol: string;
    decimals: number;
    imageUrl?: string;
}

interface LimitRow {
    id: number;
    assetKey: string;
    windowPreset: string; // preset seconds as string, or 'custom'
    customSeconds: string;
    amount: string;
}

const MAX_UINT32 = 0xffffffff;

let rowIdSeq = 0;
function nextRowId(): number {
    rowIdSeq += 1;
    return rowIdSeq;
}

function emptyRow(assetKey: string): LimitRow {
    return { id: nextRowId(), assetKey, windowPreset: '86400', customSeconds: '', amount: '' };
}

/** Order-sensitive signature of the editable row fields, used to detect changes. */
function rowsSignature(rows: LimitRow[]): string {
    return rows
        .map((row) => `${row.assetKey}|${row.windowPreset}|${row.customSeconds.trim()}|${row.amount.trim()}`)
        .join(';');
}

function rowsFromLimits(limits: LimitsView | null | undefined): LimitRow[] {
    if (!limits) {
        return [];
    }
    const rows: LimitRow[] = [];
    for (const asset of limits.assets) {
        for (const window of asset.windows) {
            const isPreset = WINDOW_PRESETS.some((preset) => preset.seconds === window.windowSeconds);
            rows.push({
                id: nextRowId(),
                assetKey: asset.assetKey,
                windowPreset: isPreset ? String(window.windowSeconds) : 'custom',
                customSeconds: isPreset ? '' : String(window.windowSeconds),
                amount: formatUnitsTrimmed(window.limit, asset.decimals),
            });
        }
    }
    return rows;
}

function windowLabel(windowPreset: string): string {
    if (windowPreset === 'custom') {
        return 'Custom (seconds)';
    }
    const preset = WINDOW_PRESETS.find((candidate) => String(candidate.seconds) === windowPreset);
    return preset?.label ?? 'Custom (seconds)';
}

function normalizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Failed to update limits';
    const lower = message.toLowerCase();
    if (lower.includes('unsupported metadata format')) {
        return 'Unsupported metadata format for this wallet. Limits require on-chain metadata (0x00).';
    }
    if (lower.includes('insufficient')) {
        return 'Insufficient gas for owner operation.';
    }
    if (lower.includes('rejected')) {
        return 'Transaction was rejected.';
    }
    return message;
}

export function LimitsModal({ agent, currentLimits, onClose, onSuccess }: LimitsModalProps) {
    const network = useNetwork();
    const { setAgentLimits, clearAgentLimits, isPending } = useAgentOperations();
    const [rows, setRows] = useState<LimitRow[]>([]);
    const [initialSignature, setInitialSignature] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { data: jettonsResponse } = useJettonsByAddress({
        address: agent?.address ?? '',
        network: network ?? undefined,
        query: { enabled: !!agent },
    });

    const assetOptions = useMemo<AssetOption[]>(() => {
        const byKey = new Map<string, AssetOption>();
        byKey.set(TON_ASSET_KEY, { key: TON_ASSET_KEY, symbol: 'TON', decimals: 9 });

        for (const jetton of jettonsResponse?.jettons ?? []) {
            if (!jetton.address) {
                continue;
            }
            byKey.set(jetton.address, {
                key: jetton.address,
                symbol: jetton.info?.symbol ?? shortenAssetKey(jetton.address),
                decimals: jetton.decimalsNumber ?? 9,
                imageUrl: jetton.info?.image?.url,
            });
        }

        // Keep assets already configured even if no longer held.
        for (const asset of currentLimits?.assets ?? []) {
            if (!byKey.has(asset.assetKey)) {
                byKey.set(asset.assetKey, { key: asset.assetKey, symbol: asset.symbol, decimals: asset.decimals });
            }
        }

        return Array.from(byKey.values());
    }, [jettonsResponse?.jettons, currentLimits]);

    useEffect(() => {
        if (agent) {
            const seeded = rowsFromLimits(currentLimits);
            const nextRows = seeded.length > 0 ? seeded : [emptyRow(TON_ASSET_KEY)];
            setRows(nextRows);
            setInitialSignature(rowsSignature(nextRows));
        }
    }, [agent, currentLimits]);

    if (!agent) {
        return null;
    }

    const optionForAsset = (assetKey: string): AssetOption | undefined =>
        assetOptions.find((option) => option.key === assetKey);

    const symbolForAsset = (assetKey: string): string => optionForAsset(assetKey)?.symbol ?? 'units';

    const updateRow = (id: number, patch: Partial<LimitRow>) => {
        setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    };

    const addRow = () => setRows((current) => [...current, emptyRow(TON_ASSET_KEY)]);
    const removeRow = (id: number) => setRows((current) => current.filter((row) => row.id !== id));

    const buildStoredLimits = (): StoredLimits => {
        if (rows.length === 0) {
            throw new Error('Add at least one limit, or use “Clear all limits”.');
        }

        const assets: StoredLimits['assets'] = {};
        const seen = new Set<string>();

        for (const row of rows) {
            const option = assetOptions.find((candidate) => candidate.key === row.assetKey);
            if (!option) {
                throw new Error('Select a valid asset for every limit.');
            }

            let windowSeconds: number;
            if (row.windowPreset === 'custom') {
                const parsed = Number(row.customSeconds.trim());
                if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_UINT32) {
                    throw new Error('Custom window must be a whole number of seconds between 1 and 4294967295.');
                }
                windowSeconds = parsed;
            } else {
                windowSeconds = Number(row.windowPreset);
            }

            const dedupeKey = `${row.assetKey}|${windowSeconds}`;
            if (seen.has(dedupeKey)) {
                throw new Error(`Duplicate window for ${option.symbol}. Each asset/window pair must be unique.`);
            }
            seen.add(dedupeKey);

            const amountUnits = parseUiAmountToUnits(row.amount, option.decimals, `${option.symbol} amount`);
            if (amountUnits <= 0n) {
                throw new Error(`${option.symbol} amount must be greater than zero.`);
            }

            const assetEntry = assets[row.assetKey] ?? { windows: {} };
            assetEntry.windows[String(windowSeconds)] = amountUnits.toString();
            assets[row.assetKey] = assetEntry;
        }

        return { assets };
    };

    const uiPending = isPending || isSubmitting;
    const isDirty = rowsSignature(rows) !== initialSignature;

    const handleSave = async () => {
        let limitsDict;
        try {
            const stored = buildStoredLimits();
            limitsDict = storedToLimitsDict(stored);
        } catch (error) {
            toast.error(normalizeError(error));
            return;
        }

        try {
            setIsSubmitting(true);
            await setAgentLimits(agent, limitsDict);
            await onSuccess?.();
            toast.success('Transaction limits updated');
            onClose();
        } catch (error) {
            toast.error(normalizeError(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClear = async () => {
        try {
            setIsSubmitting(true);
            await clearAgentLimits(agent);
            await onSuccess?.();
            toast.success('Transaction limits cleared');
            onClose();
        } catch (error) {
            toast.error(normalizeError(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal open={!!agent} onClose={onClose} title="Transaction limits">
            <div className="space-y-4">
                <p className="text-[11px] text-neutral-500">
                    Set rolling spend caps per asset. Window <span className="text-neutral-400">Per transaction</span>{' '}
                    caps a single transfer; time windows cap total spend over the trailing period.
                </p>

                <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
                    {rows.map((row) => {
                        const selectedAsset = optionForAsset(row.assetKey);

                        return (
                            <div key={row.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                                <div className="flex items-center gap-2">
                                    <Dropdown
                                        className="min-w-0 flex-1"
                                        value={row.assetKey}
                                        onSelect={(value) => updateRow(row.id, { assetKey: value })}
                                        items={assetOptions.map((option) => ({
                                            value: option.key,
                                            content: (
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <AssetIcon asset={option} />
                                                    <span className="truncate">{option.symbol}</span>
                                                </span>
                                            ),
                                        }))}
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <AssetIcon asset={selectedAsset} />
                                            <span className="truncate">{selectedAsset?.symbol ?? 'Select asset'}</span>
                                        </span>
                                    </Dropdown>
                                    <button
                                        type="button"
                                        onClick={() => removeRow(row.id)}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                                        aria-label="Remove limit"
                                        title="Remove limit"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>

                                <div className="mt-2 flex items-center gap-2">
                                    <Dropdown
                                        className="min-w-0 flex-1"
                                        value={row.windowPreset}
                                        onSelect={(value) => updateRow(row.id, { windowPreset: value })}
                                        items={[
                                            ...WINDOW_PRESETS.map((preset) => ({
                                                value: String(preset.seconds),
                                                content: preset.label,
                                            })),
                                            { value: 'custom', content: 'Custom (seconds)' },
                                        ]}
                                    >
                                        <span className="truncate">{windowLabel(row.windowPreset)}</span>
                                    </Dropdown>
                                    {row.windowPreset === 'custom' && (
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={row.customSeconds}
                                            onChange={(event) => {
                                                const next = event.target.value;
                                                if (next === '' || /^\d+$/.test(next)) {
                                                    updateRow(row.id, { customSeconds: next });
                                                }
                                            }}
                                            placeholder="seconds"
                                            className="w-28 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-sm text-white placeholder-neutral-700 outline-none transition-colors focus:border-amber-500/50"
                                        />
                                    )}
                                </div>

                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={row.amount}
                                    onChange={(event) => updateRow(row.id, { amount: event.target.value })}
                                    placeholder={`Max amount (e.g. 12.34 ${symbolForAsset(row.assetKey)})`}
                                    className="mt-2 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-neutral-700 outline-none transition-colors focus:border-amber-500/50"
                                />
                            </div>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={addRow}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] px-3.5 py-2 text-xs text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                    <Plus size={14} />
                    Add limit
                </button>

                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-full border border-white/[0.1] py-3 text-sm text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                        Cancel
                    </button>
                    {currentLimits && (
                        <button
                            onClick={() => void handleClear()}
                            disabled={uiPending}
                            className="rounded-full border border-red-500/25 bg-red-500/10 px-5 py-3 text-sm text-red-300 transition-colors hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Clear all limits
                        </button>
                    )}
                    <button
                        onClick={() => void handleSave()}
                        disabled={uiPending || rows.length === 0 || !isDirty}
                        className="flex-1 rounded-full bg-amber-500 py-3 text-sm font-medium text-on-accent transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {uiPending ? (
                            <span className="inline-flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent" />
                                Saving…
                            </span>
                        ) : (
                            'Save limits'
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

interface DropdownItem {
    value: string;
    content: ReactNode;
}

/**
 * Select-style dropdown whose menu renders in a portal with fixed positioning,
 * so it escapes the modal's `overflow-hidden` and the scroll container's clipping.
 */
function Dropdown({
    value,
    items,
    onSelect,
    className,
    children,
}: {
    value: string;
    items: DropdownItem[];
    onSelect: (value: string) => void;
    className?: string;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);

    const updatePosition = useCallback(() => {
        const element = triggerRef.current;
        if (!element) {
            return;
        }
        const rect = element.getBoundingClientRect();
        setPosition({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    }, []);

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        updatePosition();
        const handle = () => updatePosition();
        window.addEventListener('scroll', handle, true);
        window.addEventListener('resize', handle);
        return () => {
            window.removeEventListener('scroll', handle, true);
            window.removeEventListener('resize', handle);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) {
            return;
        }
        const handlePointer = (event: MouseEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
                return;
            }
            setOpen(false);
        };
        window.addEventListener('mousedown', handlePointer);
        return () => window.removeEventListener('mousedown', handlePointer);
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((current) => !current)}
                className={`flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left text-sm text-white outline-none transition-colors hover:border-white/[0.15] focus:border-amber-500/50 ${className ?? ''}`}
            >
                {children}
                <Chevron open={open} />
            </button>
            {open &&
                position &&
                createPortal(
                    <div
                        ref={menuRef}
                        style={{
                            position: 'fixed',
                            left: position.left,
                            top: position.top,
                            width: position.width,
                            zIndex: 200,
                        }}
                        className="max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-surface-suggestions shadow-xl"
                    >
                        {items.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => {
                                    onSelect(item.value);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06] ${
                                    value === item.value ? 'text-amber-500' : 'text-white'
                                }`}
                            >
                                {item.content}
                            </button>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`ml-2 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function AssetIcon({ asset }: { asset: AssetOption | undefined }) {
    if (asset?.key === TON_ASSET_KEY) {
        return <img src="/icons/ton.png" alt="" className="h-5 w-5 rounded-full object-cover" />;
    }

    if (asset?.imageUrl) {
        return <img src={asset.imageUrl} alt="" className="h-5 w-5 rounded-full object-cover" />;
    }

    return (
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold">
            {(asset?.symbol ?? '?').charAt(0)}
        </div>
    );
}
