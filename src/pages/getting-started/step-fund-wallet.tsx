/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Coins, LayoutDashboard, Send } from 'lucide-react';

const fundingMethods = [
    {
        icon: Coins,
        title: 'During creation',
        description: 'Use the "Initial TON deposit" field on the deployment page.',
    },
    {
        icon: LayoutDashboard,
        title: 'From the dashboard',
        description: 'Open your agent\'s page and use the Fund button to send TON, Jettons, or NFTs.',
    },
    {
        icon: Send,
        title: 'Direct transfer',
        description: 'Send assets directly to the agentic wallet address from any wallet.',
    },
];

export function StepFundWallet() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-bold tracking-tight">Fund the wallet</h3>
                <p className="mt-2 text-base leading-relaxed text-neutral-400 sm:text-lg">
                    After creation, the agentic wallet needs TON to operate. There are three ways to fund it:
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                {fundingMethods.map((method) => (
                    <div
                        key={method.title}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                        <method.icon size={16} className="mb-3 text-amber-500" />
                        <p className="text-sm font-medium text-neutral-200">{method.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-500">{method.description}</p>
                    </div>
                ))}
            </div>

            {/* Conversation mock */}
            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="border-b border-white/[0.06] px-5 py-3">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                        Check your balance
                    </span>
                </div>
                <div className="flex flex-col gap-4 p-5">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-amber-500">You</span>
                        <span className="text-sm text-neutral-200">What's my agentic wallet balance?</span>
                    </div>
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-neutral-500">Agent</span>
                        <div className="flex flex-col gap-1 text-sm text-neutral-400">
                            <p>Your agentic wallet balance is 0 TON.</p>
                            <p>
                                You can fund it by sending TON to:{' '}
                                <code className="font-mono text-xs text-neutral-500">UQA...</code>
                            </p>
                            <p>Or open the dashboard to fund it.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
