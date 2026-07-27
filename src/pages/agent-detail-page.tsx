/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Network } from '@ton/appkit';
import {
    getBalanceByAddressQueryOptions,
    getJettonsByAddressQueryOptions,
    getNFTsQueryOptions,
} from '@ton/appkit/queries';
import { useAddress, useAppKit, useBalanceByAddress, useNetwork } from '@ton/appkit-react';
import { ArrowLeft, AlertTriangle, Check, CheckCircle2, Copy, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAgentActivity, useAgentLimits, useAgentLimitsUsage, useAgentOperations, useAgents, useAgentsStore } from '@/features/agents';
import type { AgentWallet } from '@/features/agents';
import { StatusDot } from '@/components/shared/status-dot';
import { CopyableAddress, CopyableValue } from '@/components/shared/copyable-address';
import { JettonBalances } from '@/components/shared/jetton-balances';
import { NftBalances } from '@/components/shared/nft-balances';
import { FundModal } from '@/components/modals/fund-modal';
import { WithdrawModal } from '@/components/modals/withdraw-modal';
import { RevokeModal } from '@/components/modals/revoke-modal';
import { RenameModal } from '@/components/modals/rename-modal';
import { LimitsModal } from '@/components/modals/limits-modal';
import { LimitsCard } from '@/components/dashboard/limits-card';
import { ChangePublicKeyModal } from '@/components/modals/change-public-key-modal';
import { UnexpectedActivityModal } from '@/components/modals/unexpected-activity-modal';
import { RemoveExtensionsModal } from '@/components/modals/remove-extensions-modal';
import { ActivityFeedV2 } from '@/components/dashboard/activity-feed-v2';
import { getAgentWalletState } from '@/features/agents/lib/agentic-wallet';
import { extractCreationDateFromMetadata, extractNameFromMetadata } from '@/features/agents/lib/metadata';
import { formatTonAddressForNetwork, isSameTonAddress } from '@/features/agents/lib/address';
import { formatUint256PublicKey, parseUint256PublicKey } from '@/features/agents/lib/public-key';
import { formatUiAmountFixed } from '@/features/agents/lib/amount';

const CHANGE_PUBLIC_KEY_PARAM_KEYS = [
    'nextOperatorPublicKey',
    'newOperatorPublicKey',
    'operatorPublicKey',
    'operatorPubkey',
    'operator',
    'pubkey',
] as const;

const CHANGE_PUBLIC_KEY_FLAG_KEYS = [
    'changePublicKey',
    'change-public-key',
    'updateOperatorPublicKey',
    'update-operator-public-key',
] as const;

const CHANGE_PUBLIC_KEY_ACTION_VALUES = new Set([
    'change-public-key',
    'changePublicKey',
    'update-public-key',
    'updateOperatorPublicKey',
]);

function getFirstQueryParam(searchParams: URLSearchParams, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const value = searchParams.get(key);
        if (value && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

function parseChangePublicKeyDeepLink(searchParams: URLSearchParams): {
    nextPublicKey?: string;
    shouldOpenModal: boolean;
} {
    const action = searchParams.get('action')?.trim();
    const modal = searchParams.get('modal')?.trim();
    const nextPublicKey = getFirstQueryParam(searchParams, CHANGE_PUBLIC_KEY_PARAM_KEYS);
    const shouldOpenByAction =
        (action ? CHANGE_PUBLIC_KEY_ACTION_VALUES.has(action) : false) ||
        (modal ? CHANGE_PUBLIC_KEY_ACTION_VALUES.has(modal) : false) ||
        CHANGE_PUBLIC_KEY_FLAG_KEYS.some((key) => searchParams.has(key));

    return {
        nextPublicKey,
        shouldOpenModal: shouldOpenByAction || Boolean(nextPublicKey),
    };
}

export function AgentDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const appKit = useAppKit();
    const queryClient = useQueryClient();
    const connectedAddress = useAddress();
    const markKnown = useAgentsStore((s) => s.markKnown);
    const { agents, refresh, isLoading: isAgentsLoading } = useAgents();
    const { revokeAgentWallet, isPending: isAgentOperationPending } = useAgentOperations();
    const listedAgent = agents.find(
        (a) => id && (a.id === id || isSameTonAddress(a.id, id) || isSameTonAddress(a.address, id)),
    );
    const network = useNetwork() ?? Network.mainnet();
    const { data: fallbackAgent, isLoading: isFallbackAgentLoading, refetch: refetchFallbackAgent } = useQuery({
        queryKey: ['agent-detail-fallback', network?.chainId, id],
        enabled: !!network && !!id && !isAgentsLoading && !listedAgent,
        staleTime: 30_000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
        queryFn: async (): Promise<AgentWallet | null> => {
            if (!network || !id) {
                return null;
            }

            const client = appKit.networkManager.getClient(network);
            const state = await getAgentWalletState(client, id);
            if (!state.isInitialized) {
                return null;
            }

            const name = extractNameFromMetadata(state.nftItemContent) ?? `Agent ${id.slice(0, 6)}`;
            const createdAt = extractCreationDateFromMetadata(state.nftItemContent);
            const creationDateTimestamp = createdAt ? Date.parse(createdAt) : null;
            const nowIso = new Date().toISOString();

            return {
                id,
                name,
                address: id,
                operatorPubkey: formatUint256PublicKey(state.operatorPublicKey),
                originOperatorPublicKey: formatUint256PublicKey(state.originOperatorPublicKey),
                extensions: state.extensions,
                ownerAddress: state.ownerAddress?.toString() ?? '',
                creationDateTimestamp:
                    creationDateTimestamp != null && Number.isFinite(creationDateTimestamp)
                        ? creationDateTimestamp
                        : null,
                createdAt: createdAt ?? nowIso,
                detectedAt: nowIso,
                isNew: false,
                status: state.operatorPublicKey === 0n ? 'revoked' : 'active',
                source: 'On-chain',
                collectionAddress: state.collectionAddress.toString(),
                nftItemContent: state.nftItemContent,
            };
        },
    });
    const agent = listedAgent ?? fallbackAgent ?? null;
    const isOwner = Boolean(connectedAddress && agent?.ownerAddress && isSameTonAddress(connectedAddress, agent.ownerAddress));
    const { data: balance } = useBalanceByAddress({ address: agent?.address ?? '', network });
    const { data: activity, isLoading: isActivityLoading } = useAgentActivity(
        agent?.address ?? null,
        agent?.ownerAddress ?? null,
    );
    const { limits, isLoading: isLimitsLoading, hashMismatch: limitsHashMismatch } = useAgentLimits(agent);
    const { usage: limitsUsage, isLoading: isLimitsUsageLoading } = useAgentLimitsUsage(agent, limits);
    const lastActivityMarkerRef = useRef<string | null>(null);

    const [showFund, setShowFund] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    const [showRevoke, setShowRevoke] = useState(false);
    const [showRename, setShowRename] = useState(false);
    const [showLimits, setShowLimits] = useState(false);
    const [showChangePublicKey, setShowChangePublicKey] = useState(false);
    const [showRemoveExtensions, setShowRemoveExtensions] = useState(false);
    const [showUnexpected, setShowUnexpected] = useState(false);
    const [showDeploymentNotice, setShowDeploymentNotice] = useState(false);
    const [deploymentNoticeDismissed, setDeploymentNoticeDismissed] = useState(false);
    const [deploymentNoticeCopied, setDeploymentNoticeCopied] = useState(false);
    const [deepLinkedPublicKey, setDeepLinkedPublicKey] = useState<string | null>(null);
    const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
    const changePublicKeyDeepLink = useMemo(() => parseChangePublicKeyDeepLink(searchParams), [searchParams]);
    const latestActivityMarker = useMemo(() => {
        const latestItem = activity?.[0];
        if (!latestItem) {
            return null;
        }

        return latestItem.hash ?? `${latestItem.id}:${latestItem.timestamp}`;
    }, [activity]);
    const pendingDeploymentNoticeAgentIds = useAgentsStore((s) => s.pendingDeploymentNoticeAgentIds);
    const consumeDeploymentNotice = useAgentsStore((s) => s.consumeDeploymentNotice);

    const clearChangePublicKeyDeepLink = useCallback(() => {
        let hasUpdates = false;
        const nextSearchParams = new URLSearchParams(searchParams);

        for (const key of CHANGE_PUBLIC_KEY_PARAM_KEYS) {
            if (nextSearchParams.has(key)) {
                nextSearchParams.delete(key);
                hasUpdates = true;
            }
        }

        for (const key of CHANGE_PUBLIC_KEY_FLAG_KEYS) {
            if (nextSearchParams.has(key)) {
                nextSearchParams.delete(key);
                hasUpdates = true;
            }
        }

        const action = nextSearchParams.get('action')?.trim();
        if (action && CHANGE_PUBLIC_KEY_ACTION_VALUES.has(action)) {
            nextSearchParams.delete('action');
            hasUpdates = true;
        }

        const modal = nextSearchParams.get('modal')?.trim();
        if (modal && CHANGE_PUBLIC_KEY_ACTION_VALUES.has(modal)) {
            nextSearchParams.delete('modal');
            hasUpdates = true;
        }

        if (hasUpdates) {
            setSearchParams(nextSearchParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const handleCloseChangePublicKey = useCallback(() => {
        setShowChangePublicKey(false);
        setDeepLinkedPublicKey(null);
        clearChangePublicKeyDeepLink();
    }, [clearChangePublicKeyDeepLink]);

    useEffect(() => {
        if (agent) {
            markKnown(agent.id);
        }
    }, [agent, markKnown]);

    useEffect(() => {
        lastActivityMarkerRef.current = null;
    }, [agent?.address]);

    useEffect(() => {
        if (!agent?.address || !latestActivityMarker) {
            return;
        }

        const previousMarker = lastActivityMarkerRef.current;
        lastActivityMarkerRef.current = latestActivityMarker;

        if (previousMarker === latestActivityMarker) {
            return;
        }

        const queryScope = { address: agent.address, network };
        void queryClient.invalidateQueries({
            queryKey: getBalanceByAddressQueryOptions(appKit, queryScope).queryKey,
            exact: true,
        });
        void queryClient.invalidateQueries({
            queryKey: getJettonsByAddressQueryOptions(appKit, queryScope).queryKey,
            exact: true,
        });
        void queryClient.invalidateQueries({
            queryKey: getNFTsQueryOptions(appKit, queryScope).queryKey,
            exact: true,
        });
        // Limits + spend bars are derived from transaction history (no
        // refetchInterval of their own), so refresh them whenever new activity
        // lands. Prefix match covers the hash tail of the shared query key; the
        // single query feeds both the decoded limits and the spend usage.
        void queryClient.invalidateQueries({
            queryKey: ['agent-limits-data', network?.chainId ?? null, agent.address],
        });
    }, [agent, appKit, latestActivityMarker, network, queryClient]);

    useEffect(() => {
        if (!agent || showChangePublicKey || !changePublicKeyDeepLink.shouldOpenModal) {
            return;
        }

        if (changePublicKeyDeepLink.nextPublicKey) {
            try {
                parseUint256PublicKey(changePublicKeyDeepLink.nextPublicKey);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Invalid operator public key in deep link';
                toast.error(message);
                clearChangePublicKeyDeepLink();
                return;
            }
        }

        setDeepLinkedPublicKey(changePublicKeyDeepLink.nextPublicKey ?? null);
        setShowChangePublicKey(true);
        clearChangePublicKeyDeepLink();
    }, [agent, changePublicKeyDeepLink, clearChangePublicKeyDeepLink, showChangePublicKey]);

    useEffect(() => {
        if (!agent || showDeploymentNotice) {
            return;
        }

        const hasPendingNotice = pendingDeploymentNoticeAgentIds.some((storedId) => isSameTonAddress(storedId, agent.address));
        if (!hasPendingNotice) {
            return;
        }

        setShowDeploymentNotice(true);
        consumeDeploymentNotice(agent.address);
    }, [agent, consumeDeploymentNotice, pendingDeploymentNoticeAgentIds, showDeploymentNotice]);

    useEffect(() => {
        if (!agent) {
            setSelectedExtensions([]);
            return;
        }

        setSelectedExtensions((current) => current.filter((extension) => agent.extensions.includes(extension)));
    }, [agent]);

    if (!agent) {
        if (isAgentsLoading || isFallbackAgentLoading) {
            return (
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-amber-500" />
                </div>
            );
        }

        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 animate-fade-in">
                <p className="text-neutral-500">Agent not found</p>
                <button onClick={() => navigate('/dashboard')} className="text-sm text-amber-500 hover:text-amber-400">
                    Back to dashboard
                </button>
            </div>
        );
    }

    const balanceStr = balance != null ? formatUiAmountFixed(balance, 2) : '—';
    const isZero = balance != null && parseFloat(balance) === 0;
    const isRevoked = agent.status === 'revoked';
    const createdDate = new Date(agent.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const importCommand = `Import wallet ${formatTonAddressForNetwork(agent.address, network?.chainId)}`;
    const shouldShowDeploymentNotice = !deploymentNoticeDismissed && showDeploymentNotice;
    const hasExtensions = agent.extensions.length > 0;
    const selectedExtensionCount = selectedExtensions.length;
    const deleteSelectedExtensionsLabel =
        selectedExtensionCount > 0
            ? `Delete selected extensions (${selectedExtensionCount})`
            : 'Delete selected extensions';

    const handleCopyDeploymentNotice = async () => {
        await navigator.clipboard.writeText(importCommand);
        setDeploymentNoticeCopied(true);
        window.setTimeout(() => setDeploymentNoticeCopied(false), 2000);
    };

    const toggleExtensionSelection = (extension: string) => {
        setSelectedExtensions((current) =>
            current.includes(extension) ? current.filter((item) => item !== extension) : [...current, extension],
        );
    };

    return (
        <div className="animate-fade-in">
            <Link
                to="/dashboard"
                className="mb-6 inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-white"
            >
                <ArrowLeft size={14} />
                Back to dashboard
            </Link>

            {shouldShowDeploymentNotice && (
                <div className="relative mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-4 pr-11 sm:p-5 sm:pr-12">
                    <div className="flex min-w-0 items-start gap-3">
                            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-emerald-200">Wallet deployed successfully</p>
                            <p className="mt-1 text-sm text-neutral-300">
                                To let your agent use this wallet, send it the message:
                            </p>
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-surface-1 p-2">
                                <div className="deployment-command-scroll min-w-0 flex-1 overflow-x-auto pb-1">
                                    <code className="block w-max min-w-full whitespace-nowrap px-1 font-mono text-xs text-neutral-100 sm:text-sm">
                                        {importCommand}
                                    </code>
                                </div>
                                <button
                                    onClick={() => {
                                        void handleCopyDeploymentNotice();
                                    }}
                                    className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white"
                                    aria-label="Copy import command"
                                    title="Copy import command"
                                >
                                    {deploymentNoticeCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setDeploymentNoticeDismissed(true)}
                        className="absolute top-3 right-3 text-neutral-500 transition-colors hover:text-white sm:top-4 sm:right-4"
                        aria-label="Close deployment success message"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                    <StatusDot status={agent.status} />
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">{agent.name}</h1>
                            {isOwner && (
                                <button
                                    onClick={() => setShowRename(true)}
                                    className="text-neutral-600 transition-colors hover:text-white"
                                >
                                    <Pencil size={14} />
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-neutral-500">
                            Created by {agent.source} on {createdDate}
                        </p>
                    </div>
                </div>
                {isOwner && (
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end sm:gap-3">
                        {!isRevoked && (
                            <button
                                onClick={() => setShowFund(true)}
                                className="order-1 w-full rounded-full bg-amber-500 px-6 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-amber-400 sm:order-none sm:w-auto"
                            >
                                Fund
                            </button>
                        )}
                        <button
                            onClick={() => setShowWithdraw(true)}
                            className="order-2 w-full rounded-full border border-white/[0.1] px-6 py-2.5 text-sm text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white sm:order-none sm:w-auto"
                        >
                            Withdraw
                        </button>
                        <button
                            onClick={() => setShowChangePublicKey(true)}
                            className="order-3 w-full rounded-full border border-white/[0.1] px-6 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-white sm:order-none sm:w-auto"
                        >
                            Change key
                        </button>
                        {!isRevoked && (
                            <button
                                onClick={() => setShowRevoke(true)}
                                className="order-4 w-full rounded-full border border-red-500/25 bg-red-500/10 px-6 py-2.5 text-sm text-red-300 transition-colors hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200 sm:order-none sm:w-auto"
                            >
                                Revoke
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <p className="text-xs uppercase tracking-wider text-neutral-600">Agent Balance</p>
                <div className="mt-2 flex items-baseline gap-2">
                    {isZero && <AlertTriangle size={18} className="text-amber-500" />}
                    <span className="font-mono text-4xl font-semibold tabular-nums">{balanceStr}</span>
                    <span className="text-lg text-neutral-500">GRAM</span>
                </div>
                {isZero && (
                    <p className="mt-2 text-xs text-amber-500/70">
                        This agent is out of funds and can&apos;t execute transactions.
                    </p>
                )}
            </div>

            <JettonBalances address={agent.address} network={network} title="Jetton Balances" />

            <NftBalances address={agent.address} network={network} title="NFT Assets" />

            {isRevoked && (
                <div className="mb-8 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-4 py-3">
                    <p className="text-sm text-red-400/80">
                        This agent is revoked (`operatorPublicKey = 0`). Set a new public key to reactivate it.
                    </p>
                </div>
            )}

            <div className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04]">
                <InfoRow label="Agent Address">
                    <CopyableAddress
                        address={agent.address}
                        adaptive
                        className="w-full justify-between sm:w-full sm:justify-end"
                    />
                </InfoRow>
                <InfoRow label="Operator Public Key">
                    <CopyableValue
                        value={agent.operatorPubkey}
                        adaptive
                        className="w-full justify-between sm:w-full sm:justify-end"
                    />
                </InfoRow>
                <InfoRow label="Origin Operator Public Key">
                    <CopyableValue
                        value={agent.originOperatorPublicKey}
                        adaptive
                        className="w-full justify-between sm:w-full sm:justify-end"
                    />
                </InfoRow>
                <InfoRow label="Owner Address">
                    <CopyableAddress
                        address={agent.ownerAddress}
                        adaptive
                        className="w-full justify-between sm:w-full sm:justify-end"
                    />
                </InfoRow>
                <InfoRow label="Created">{createdDate}</InfoRow>
                <InfoRow label="Source">{agent.source}</InfoRow>
            </div>

            <LimitsCard
                limits={limits}
                usage={limitsUsage}
                isLoading={isLimitsLoading}
                isUsageLoading={isLimitsUsageLoading}
                isOwner={isOwner}
                hashMismatch={limitsHashMismatch}
                onEdit={() => setShowLimits(true)}
            />

            {hasExtensions && (
                <div className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-neutral-600">Extensions</p>
                            <p className="mt-1 text-sm text-neutral-400">
                                {isOwner
                                    ? 'Selected extensions can be removed by the wallet owner.'
                                    : 'Extensions installed on this wallet.'}
                            </p>
                        </div>
                        {isOwner && (
                            <button
                                onClick={() => setShowRemoveExtensions(true)}
                                disabled={selectedExtensionCount === 0}
                                className="rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:border-red-500/50 hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:border-white/[0.08] disabled:bg-white/[0.03] disabled:text-neutral-500"
                            >
                                {deleteSelectedExtensionsLabel}
                            </button>
                        )}
                    </div>

                    <div className="mt-4 space-y-2">
                        {agent.extensions.map((extension, index) => {
                            const selected = selectedExtensions.includes(extension);
                            const formattedExtension = formatTonAddressForNetwork(extension, network?.chainId);
                            return (
                                <button
                                    type="button"
                                    key={extension}
                                    onClick={isOwner ? () => toggleExtensionSelection(extension) : undefined}
                                    aria-pressed={selected}
                                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left transition-colors ${
                                        selected
                                            ? 'border border-amber-500/50 bg-amber-500/[0.08] hover:border-amber-400/60 hover:bg-amber-500/[0.12]'
                                            : 'border border-white/[0.06] bg-white/[0.03] hover:border-white/[0.1] hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={`block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm ${
                                                selected ? 'text-amber-100' : 'text-neutral-300'
                                            }`}
                                        >
                                            {`Extension ${index + 1}: ${formattedExtension}`}
                                        </span>
                                    </div>
                                    <InlineCopyButton value={formattedExtension} label={`Copy extension ${index + 1} address`} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <ActivityFeedV2
                items={activity}
                isLoading={isActivityLoading}
                isRevoked={isRevoked}
                onMarkUnexpected={() => setShowUnexpected(true)}
            />

            <FundModal agent={showFund ? agent : null} onClose={() => setShowFund(false)} onSuccess={refresh} />
            <WithdrawModal
                agent={showWithdraw ? agent : null}
                onClose={() => setShowWithdraw(false)}
                onSuccess={refresh}
            />
            <RevokeModal agent={showRevoke ? agent : null} onClose={() => setShowRevoke(false)} onSuccess={refresh} />
            <RenameModal agent={showRename ? agent : null} onClose={() => setShowRename(false)} onSuccess={refresh} />
            <LimitsModal
                agent={showLimits ? agent : null}
                currentLimits={limits}
                onClose={() => setShowLimits(false)}
                onSuccess={async () => {
                    await Promise.all([refresh(), refetchFallbackAgent()]);
                }}
            />
            <ChangePublicKeyModal
                agent={showChangePublicKey ? agent : null}
                initialPublicKey={deepLinkedPublicKey}
                onClose={handleCloseChangePublicKey}
                onSuccess={refresh}
            />
            <RemoveExtensionsModal
                agent={showRemoveExtensions ? agent : null}
                selectedExtensions={selectedExtensions}
                onClose={() => setShowRemoveExtensions(false)}
                onSuccess={async () => {
                    setShowRemoveExtensions(false);
                    setSelectedExtensions([]);
                    await Promise.all([refresh(), refetchFallbackAgent()]);
                }}
            />
            <UnexpectedActivityModal
                agent={showUnexpected ? agent : null}
                onClose={() => setShowUnexpected(false)}
                isPending={isAgentOperationPending}
                onConfirm={async () => {
                    try {
                        await revokeAgentWallet(agent);
                        await refresh();
                        toast.success(`Marked ${agent.name} as unexpected and revoked.`);
                        setShowUnexpected(false);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Failed to revoke agent';
                        toast.error(message);
                    }
                }}
            />
        </div>
    );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-neutral-600">{label}</span>
            <div className="min-w-0 text-sm text-neutral-300 sm:ml-6 sm:flex-1 sm:text-right">{children}</div>
        </div>
    );
}

function InlineCopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    return (
        <button
            type="button"
            onClick={(event) => {
                void handleCopy(event);
            }}
            className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            aria-label={label}
            title={label}
        >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
    );
}
