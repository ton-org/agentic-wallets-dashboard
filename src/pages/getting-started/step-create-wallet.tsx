/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { ArrowRight } from 'lucide-react';

const flowSteps = [
    'Agent generates keys',
    'You open dashboard link',
    'Connect TON wallet',
    'Deploy agentic contract',
    'Agent imports wallet',
];

const keyPoints = [
    'The agent generates an operator key pair — it keeps the private key.',
    'You deploy the agentic wallet contract from your regular TON wallet.',
    'The agent requests the address of the deployed wallet.',
    'You find the address in the dashboard and provide it to the agent.',
    'The agent can now sign transactions with its operator key.',
    'You can revoke access or withdraw funds at any time from the dashboard.',
];

export function StepCreateWallet() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-bold tracking-tight">Create your first Agentic Wallet</h3>
                <p className="mt-2 text-sm text-neutral-500">
                    Before you start, create and fund a regular TON wallet: it'll become the owner of your agentic wallet. For example, you can use Tonkeeper or wallet.ton.org.
                </p>
                <p className="mt-2 text-base leading-relaxed text-neutral-400 sm:text-lg">
                    Ask your AI agent to create an agentic wallet. Here's what happens under the hood:
                </p>
            </div>

            {/* Conversation mock */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="border-b border-white/[0.06] px-5 py-3">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                        Agent conversation
                    </span>
                </div>
                <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-amber-500">You</span>
                        <span className="text-sm text-neutral-200">Create agentic wallet</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-neutral-500">Agent</span>
                        <div className="flex flex-col gap-1 text-sm text-neutral-400">
                            <p>I'll set up a new agentic wallet for you.</p>
                            <p>Generating operator keys...</p>
                            <p>
                                Please open this link to deploy the wallet:{' '}
                                <span className="text-amber-500/70">→ [a link to the dashboard]</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Flow diagram */}
            <div className="overflow-x-auto">
                <div className="flex items-center gap-1 py-2">
                    {flowSteps.map((step, i) => (
                        <div key={i} className="flex shrink-0 items-center gap-1">
                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                <span className="whitespace-nowrap text-xs text-neutral-300">{step}</span>
                            </div>
                            {i < flowSteps.length - 1 && (
                                <ArrowRight size={12} className="shrink-0 text-neutral-700" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Key points */}
            <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-widest text-amber-500">Key points</p>
                <ul className="flex flex-col gap-2">
                    {keyPoints.map((point, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-base leading-relaxed text-neutral-400 sm:text-lg">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500/50" />
                            {point}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
