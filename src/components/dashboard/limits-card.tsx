/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { formatUnitsTrimmed } from '@/features/agents/lib/amount';
import { TON_ASSET_KEY } from '@/features/agents/lib/limits-codec';
import { usageKey } from '@/features/agents/lib/limits-constants';
import type { AssetLimitView, LimitsUsageMap, LimitsView, WindowLimitView } from '@/features/agents/lib/limits-types';

interface LimitsCardProps {
    limits: LimitsView | null;
    usage?: LimitsUsageMap;
    isLoading: boolean;
    isUsageLoading?: boolean;
    isOwner: boolean;
    hashMismatch?: boolean;
    onEdit: () => void;
}

function spendRatio(spent: bigint, limit: bigint): number {
    if (limit <= 0n) {
        return 0;
    }
    const scaled = Number((spent * 10_000n) / limit) / 10_000;
    return scaled < 0 ? 0 : scaled;
}

export function LimitsCard({
    limits,
    usage,
    isLoading,
    isUsageLoading = false,
    isOwner,
    hashMismatch = false,
    onEdit,
}: LimitsCardProps) {
    const hasLimits = !!limits && limits.assets.length > 0;

    return (
        <div className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-neutral-600">Transaction Limits</p>
                    <p className="mt-1 text-sm text-neutral-400">
                        Rolling per-asset spend caps enforced by the agent&apos;s MCP before every transaction.
                    </p>
                </div>
                {isOwner && (
                    <button
                        onClick={onEdit}
                        className="shrink-0 rounded-full border border-white/[0.1] px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                        {hasLimits ? 'Edit limits' : 'Set limits'}
                    </button>
                )}
            </div>

            {hashMismatch && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                    <p className="text-xs text-amber-200/90">
                        Limits are set on-chain, but we couldn&apos;t verify them against a limits transaction in recent
                        history. The displayed values may be stale — re-set them to be safe.
                    </p>
                </div>
            )}

            <div className="mt-4">
                {isLoading ? (
                    <LimitsSkeleton />
                ) : !hasLimits ? (
                    <EmptyLimits isOwner={isOwner} onEdit={onEdit} hashMismatch={hashMismatch} />
                ) : (
                    <div className="space-y-5">
                        {limits.assets.map((asset) => (
                            <AssetLimitGroup
                                key={asset.assetKey}
                                asset={asset}
                                usage={usage}
                                isUsageLoading={isUsageLoading}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function AssetLimitGroup({
    asset,
    usage,
    isUsageLoading,
}: {
    asset: AssetLimitView;
    usage?: LimitsUsageMap;
    isUsageLoading: boolean;
}) {
    return (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2.5">
                {asset.assetKey === TON_ASSET_KEY ? (
                    <img src="/icons/ton.png" alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : asset.imageUrl ? (
                    <img src={asset.imageUrl} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-medium text-neutral-400">
                        {asset.symbol.slice(0, 2)}
                    </div>
                )}
                <span className="text-sm font-medium text-neutral-200">{asset.symbol}</span>
            </div>

            <div className="space-y-3">
                {asset.windows.map((window) => (
                    <WindowLimitRow
                        key={window.windowSeconds}
                        asset={asset}
                        window={window}
                        usage={usage}
                        isUsageLoading={isUsageLoading}
                    />
                ))}
            </div>
        </div>
    );
}

function WindowLimitRow({
    asset,
    window,
    usage,
    isUsageLoading,
}: {
    asset: AssetLimitView;
    window: WindowLimitView;
    usage?: LimitsUsageMap;
    isUsageLoading: boolean;
}) {
    const limitText = `${formatUnitsTrimmed(window.limit, asset.decimals)} ${asset.symbol}`;

    // Per-transaction limits (window 0) are not rolling-window metered; show the cap only.
    if (window.windowSeconds === 0) {
        return (
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">{window.label}</span>
                <span className="font-mono text-sm tabular-nums text-neutral-300">{limitText}</span>
            </div>
        );
    }

    const spent = usage?.[usageKey(asset.assetKey, window.windowSeconds)];
    const hasUsage = spent !== undefined;
    const ratio = hasUsage ? spendRatio(spent, window.limit) : 0;
    const pct = Math.min(100, ratio * 100);
    const over = ratio >= 1;
    const barColor = over ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-amber-500';

    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">{window.label}</span>
                <span className="font-mono text-xs tabular-nums text-neutral-400">
                    {isUsageLoading && !hasUsage ? (
                        <span className="text-neutral-600">checking…</span>
                    ) : (
                        <>
                            <span className={over ? 'text-red-300' : 'text-neutral-300'}>
                                {formatUnitsTrimmed(hasUsage ? spent : 0n, asset.decimals)}
                            </span>
                            <span className="text-neutral-600"> / {limitText}</span>
                        </>
                    )}
                </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function EmptyLimits({
    isOwner,
    onEdit,
    hashMismatch,
}: {
    isOwner: boolean;
    onEdit: () => void;
    hashMismatch: boolean;
}) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.01] px-4 py-8 text-center">
            <ShieldCheck size={20} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">
                {hashMismatch
                    ? 'Limits are set on-chain but could not be decoded from recent history.'
                    : 'No limits set — this agent can spend without restriction.'}
            </p>
            {isOwner && (
                <button
                    onClick={onEdit}
                    className="rounded-full bg-amber-500 px-5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-amber-400"
                >
                    {hashMismatch ? 'Re-set limits' : 'Set limits'}
                </button>
            )}
        </div>
    );
}

function LimitsSkeleton() {
    return (
        <div className="space-y-3">
            {[0, 1].map((row) => (
                <div key={row} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4">
                    <div className="mb-3 h-6 w-24 animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
                </div>
            ))}
        </div>
    );
}
