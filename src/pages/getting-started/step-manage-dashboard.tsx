/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Link } from 'react-router-dom';
import { Eye, Wallet, ShieldOff, KeyRound } from 'lucide-react';

const features = [
    {
        icon: Eye,
        title: 'Monitor transactions',
        description: 'See all agent wallet activity in real time',
    },
    {
        icon: Wallet,
        title: 'Fund & withdraw',
        description: 'Add or remove funds from any agent wallet',
    },
    {
        icon: ShieldOff,
        title: 'Revoke access',
        description: 'Instantly deactivate an agent\'s operator key',
    },
    {
        icon: KeyRound,
        title: 'Rotate keys',
        description: 'Replace an operator key without redeploying',
    },
];

export function StepManageDashboard() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-bold tracking-tight">Manage from the dashboard</h3>
                <p className="mt-2 text-base leading-relaxed text-neutral-400 sm:text-lg">
                    Use the dashboard to oversee all your agent wallets in one place:
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {features.map((feature) => (
                    <div
                        key={feature.title}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                        <feature.icon size={16} className="mb-3 text-amber-500" />
                        <p className="text-sm font-medium text-neutral-200">{feature.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                            {feature.description}
                        </p>
                    </div>
                ))}
            </div>

            <Link
                to="/dashboard"
                className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-base font-semibold text-on-accent transition-colors hover:bg-amber-400"
            >
                Open Dashboard
            </Link>
        </div>
    );
}
