/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { trackLandingCtaClick } from '@/core/analytics/google-analytics';

const principles = [
    {
        title: 'Self-custody.',
        description:
            'The user holds the master key. The agent operates with its own operator key — your seed phrase is never shared or exposed',
    },
    {
        title: 'Control.',
        description:
            'Each agent gets its own isolated wallet. You set its limits and monitor activity via a dashboard –– where you can revoke access at any time',
    },
    {
        title: 'Adaptable.',
        description:
            'Works with any AI agent — Claude, ChatGPT, OpenClaw, Cursor, and others. Share the link with the AI agent of your choice and let it do the rest',
    },
];

export function LandingValueProps() {
    return (
        <section id="features" className="py-12 sm:py-20">
            <div className="mx-auto max-w-[1240px] px-6">
                <div className="mx-auto max-w-4xl">
                    <div className="mb-6 text-center sm:mb-12">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                            Core principles
                        </h2>
                    </div>

                    <ul className="flex list-disc flex-col gap-5 pl-5 text-base leading-relaxed text-neutral-500 marker:text-amber-500 sm:gap-6 sm:text-lg">
                        {principles.map((principle) => (
                            <li key={principle.title} className="pl-1">
                                <span className="font-semibold text-neutral-200">{principle.title}</span>{' '}
                                {principle.description}
                            </li>
                        ))}
                    </ul>

                    <div className="mt-6 flex justify-center sm:mt-8">
                        <a
                            href="https://github.com/the-ton-tech/agentic-wallet-contract"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-white/[0.04]"
                            onClick={() =>
                                trackLandingCtaClick({
                                    label: 'Contracts on GitHub',
                                    destination: 'https://github.com/the-ton-tech/agentic-wallet-contract',
                                    section: 'features',
                                })
                            }
                        >
                            Contracts on GitHub
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
