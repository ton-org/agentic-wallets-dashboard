/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
    {
        question: 'Is this custodial?',
        answer: 'No. Agentic Wallets are self-custodial. You keep ownership through your main wallet, and each agent operates its own dedicated on-chain wallet.',
    },
    {
        question: 'Can the agent access my main wallet?',
        answer: 'No. The agent can transact only from the wallet you fund for it. Your main wallet keys are never shared with the agent.',
    },
    {
        question: 'Do I need to approve every transaction?',
        answer: 'No. After setup, the agent can transact autonomously within the balance you allocated to its wallet.',
    },
    {
        question: 'Can I revoke access?',
        answer: 'Yes. You can monitor the agentic wallet and revoke access at any time from the dashboard.',
    },
    {
        question: 'Which wallets and agents does it work with?',
        answer: 'It works across existing TON wallets with no wallet upgrades required, and it is designed for leading AI models and agent frameworks.',
    },
];

export function LandingFAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    return (
        <section id="faq" className="py-12 sm:py-20">
            <div className="mx-auto max-w-[1240px] px-6">
                <div className="mx-auto max-w-4xl">
                    <div className="mb-6 text-center sm:mb-12">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Common questions</h2>
                    </div>

                    <div className="flex flex-col divide-y divide-white/[0.06]">
                        {faqs.map((faq, i) => {
                            const isOpen = i === openIndex;
                            return (
                                <div key={i}>
                                    <button
                                        onClick={() => setOpenIndex(isOpen ? null : i)}
                                        className="flex w-full items-center justify-between gap-3 py-5 text-left"
                                    >
                                        <span className="min-w-0 pr-4 text-sm font-medium [overflow-wrap:anywhere]">
                                            {faq.question}
                                        </span>
                                        <ChevronDown
                                            size={16}
                                            className={`shrink-0 text-neutral-500 transition-transform ${
                                                isOpen ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>
                                    {isOpen && (
                                        <p className="pb-5 text-sm leading-relaxed text-neutral-400 [overflow-wrap:anywhere]">
                                            {faq.answer}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
