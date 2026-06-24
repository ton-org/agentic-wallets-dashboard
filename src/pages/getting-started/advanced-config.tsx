/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CodeBlock } from '@/components/shared/code-block';

const envVars = [
    { name: 'NETWORK', description: 'mainnet or testnet', defaultValue: 'mainnet' },
    { name: 'TONCENTER_API_KEY', description: 'Toncenter API key for higher rate limits', defaultValue: 'none' },
    { name: 'TON_CONFIG_PATH', description: 'Custom path for wallet registry config', defaultValue: '~/.config/ton/config.json' },
    { name: 'AGENTIC_CALLBACK_BASE_URL', description: 'Public URL for the onboarding callback', defaultValue: 'auto (local)' },
    { name: 'AGENTIC_CALLBACK_PORT', description: 'Port for the callback server', defaultValue: 'auto' },
];

const httpModeCommand = 'npx @ton/mcp@alpha --http 3000';

const testnetConfig = `{
  "mcpServers": {
    "ton-wallet": {
      "command": "npx",
      "args": ["@ton/mcp@alpha"],
      "env": {
        "NETWORK": "testnet"
      }
    }
  }
}`;

const deepLinkParams = [
    { param: 'data', description: 'base64url-encoded JSON payload with the same create parameters' },
    { param: 'operatorPublicKey', description: "Agent's operator public key (uint256 hex)" },
    { param: 'callbackUrl', description: 'URL the dashboard POSTs to after deployment' },
    { param: 'agentName', description: 'Display name for the agent' },
    { param: 'source', description: 'Source identifier (e.g., "cursor", "claude-desktop")' },
    { param: 'tonDeposit', description: 'Suggested initial TON deposit amount' },
];

const changePublicKeyPrefillParams = [
    { param: 'action=change-public-key', description: 'Identifier of action. Set to change-public-key' },
    { param: 'nextOperatorPublicKey', description: 'New operator public key to prefill in the modal' },
];

function CollapsibleSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="rounded-xl border border-white/[0.06]">
            <button
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
                <span className="text-sm font-medium text-neutral-300">{title}</span>
                <ChevronDown
                    size={16}
                    className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && <div className="border-t border-white/[0.06] px-5 py-4">{children}</div>}
        </div>
    );
}

export function AdvancedConfig() {
    return (
        <div className="flex flex-col gap-4">
            <div className="mb-2">
                <p className="text-xs font-medium uppercase tracking-widest text-amber-500">
                    Advanced
                </p>
                <h3 className="mt-1 text-xl font-bold tracking-tight">Configuration reference</h3>
            </div>

            <CollapsibleSection title="Environment variables">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-white/[0.06]">
                                <th className="pb-2 pr-4 font-mono text-xs text-neutral-500">Variable</th>
                                <th className="pb-2 pr-4 text-xs text-neutral-500">Description</th>
                                <th className="pb-2 text-xs text-neutral-500">Default</th>
                            </tr>
                        </thead>
                        <tbody>
                            {envVars.map((v) => (
                                <tr key={v.name} className="border-b border-white/[0.04]">
                                    <td className="py-2.5 pr-4 font-mono text-xs text-amber-500/70">{v.name}</td>
                                    <td className="py-2.5 pr-4 text-xs text-neutral-400">{v.description}</td>
                                    <td className="py-2.5 font-mono text-xs text-neutral-600">{v.defaultValue}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="HTTP mode">
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-400">
                        For developers running the MCP server as a shared service:
                    </p>
                    <CodeBlock code={httpModeCommand} title="Shell" />
                </div>
            </CollapsibleSection>

            <CollapsibleSection title="Deep link parameters">
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-400">
                        The <code className="font-mono text-xs text-neutral-300">/create</code> page accepts these query parameters (populated automatically by the agent):
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="pb-2 pr-4 font-mono text-xs text-neutral-500">Parameter</th>
                                    <th className="pb-2 text-xs text-neutral-500">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deepLinkParams.map((p) => (
                                    <tr key={p.param} className="border-b border-white/[0.04]">
                                        <td className="py-2.5 pr-4 font-mono text-xs text-amber-500/70">{p.param}</td>
                                        <td className="py-2.5 text-xs text-neutral-400">{p.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-xs text-neutral-600">
                        These are generated by <code className="font-mono">agentic_start_root_wallet_setup</code> in the MCP tools. You should never need to construct these manually.
                    </p>
                    <p className="text-xs text-neutral-600">
                        For easier copy/paste, the dashboard also accepts <code className="font-mono">/create?data=...</code>, where
                        {' '}<code className="font-mono">data</code> is <code className="font-mono">base64url(JSON.stringify(payload))</code>.
                    </p>

                    <div className="h-px bg-white/[0.06]" />

                    <p className="text-sm text-neutral-400">
                        The <code className="font-mono text-xs text-neutral-300">/agent/:id</code> page also supports a deep link for changing the operator public key:
                    </p>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-white/[0.06]">
                                    <th className="pb-2 pr-4 font-mono text-xs text-neutral-500">Parameter</th>
                                    <th className="pb-2 text-xs text-neutral-500">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {changePublicKeyPrefillParams.map((p) => (
                                    <tr key={p.param} className="border-b border-white/[0.04]">
                                        <td className="py-2.5 pr-4 font-mono text-xs text-amber-500/70">{p.param}</td>
                                        <td className="py-2.5 text-xs text-neutral-400">{p.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-neutral-600">
                        Example: <code className="font-mono">/agent/EQ...?action=change-public-key&amp;operatorPublicKey=0x1234</code>
                    </p>
                </div>
            </CollapsibleSection>
        </div>
    );
}
