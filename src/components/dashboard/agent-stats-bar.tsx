/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Link } from 'react-router-dom';

import type { AgentWallet } from '@/features/agents';
import { formatUiAmountFixed } from '@/features/agents/lib/amount';

export function AgentStatsBar({ agents, totalBalanceTon }: { agents: AgentWallet[]; totalBalanceTon: string }) {
    const activeAgents = agents.filter((a) => a.status === 'active');
    const revokedCount = agents.length - activeAgents.length;

    return (
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-sm text-neutral-400">
                    <span className="font-medium text-white">{activeAgents.length}</span>{' '}
                    {activeAgents.length === 1 ? 'agent' : 'agents'} active
                </span>
                <span className="text-neutral-700">&middot;</span>
                <span className="text-sm text-neutral-400">
                    Total balance:{' '}
                    <span className="font-medium text-white">{formatUiAmountFixed(totalBalanceTon, 2)} GRAM</span>
                </span>
                {revokedCount > 0 && (
                    <>
                        <span className="text-neutral-700">&middot;</span>
                        <span className="text-sm text-neutral-500">{revokedCount} revoked</span>
                    </>
                )}
            </div>

            <Link
                to="/create"
                className="flex w-full items-center justify-center self-stretch rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white sm:inline-flex sm:w-auto sm:self-auto"
            >
                Create new wallet
            </Link>
        </div>
    );
}
