/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

const examples = [
    {
        command: 'Send 1 GRAM to UQB...',
        result: 'Agent signs a transfer from the agentic wallet',
    },
    {
        command: 'Swap 5 GRAM for USDT',
        result: 'Agent gets a quote, confirms with you, executes the swap',
    },
    {
        command: 'Show my NFTs',
        result: 'Agent queries NFTs owned by the wallet',
    },
    {
        command: 'Check my balance',
        result: 'Agent returns GRAM + jetton balances',
    },
    {
        command: 'Get my last transactions',
        result: 'Agent returns latest events on your wallets',
    },
    {
        command: 'Import agentic wallet',
        result: 'Agent restores wallet previously managed by another agent'
    }
    // {
    //     command: 'Deploy a sub-wallet for my trading bot',
    //     result: 'Agent deploys a child agentic wallet',
    // },
];

export function StepStartUsing() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-bold tracking-tight">Start using it</h3>
                <p className="mt-2 text-base leading-relaxed text-neutral-400 sm:text-lg">
                    Once setup is complete, here are things you can ask your agent to do:
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {examples.map((example) => (
                    <div
                        key={example.command}
                        className="grid grid-cols-1 gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:grid-cols-2 sm:gap-4"
                    >
                        <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 font-mono text-xs text-amber-500">&gt;</span>
                            <span className="text-sm font-medium text-neutral-200">
                                "{example.command}"
                            </span>
                        </div>
                        <p className="text-sm text-neutral-500 sm:text-right">{example.result}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
