/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { ReactNode } from 'react';

const useCases: { title: string; description: ReactNode }[] = [
    {
        title: 'Trading bot',
        description: (
            <>
                Build a bot that trades{' '}
                <span className="whitespace-nowrap">on behalf of users</span> within defined risk limits
            </>
        ),
    },
    {
        title: 'DeFi agent',
        description: (
            <>
                Automate staking, farming, and rebalancing strategies –{' '}
                <span className="whitespace-nowrap">each in isolated</span> wallets
            </>
        ),
    },
    {
        title: 'Payment automation',
        description: (
            <>
                Let agents handle recurring <span className="whitespace-nowrap">on-chain</span> payments{' '}
                <span className="whitespace-nowrap">for subscriptions</span> and purchases
            </>
        ),
    },
    {
        title: 'TMA with agent execution',
        description: (
            <>
                Embed agentic wallets directly{' '}
                <span className="whitespace-nowrap">into a Telegram Mini App</span>. Users fund and manage
                their agent inside <span className="whitespace-nowrap">the app</span>
            </>
        ),
    },
];

export function LandingUseCases() {
    return (
        <section id="use-cases" className="py-12 sm:py-20">
            <div className="mx-auto max-w-[1240px] px-6">
                <div className="mb-6 text-center sm:mb-12">
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Use cases</h2>
                </div>

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                    {useCases.map((uc) => (
                        <div
                            key={uc.title}
                            className="flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]"
                        >
                            <div className="border-b border-white/[0.06] px-5 py-3">
                                <h3 className="text-sm font-semibold text-neutral-200">{uc.title}</h3>
                            </div>
                            <div className="px-5 py-4">
                                <p className="text-sm leading-relaxed text-neutral-400">{uc.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="mt-8 text-center text-base text-neutral-400">
                    and many more...
                </p>
            </div>
        </section>
    );
}
