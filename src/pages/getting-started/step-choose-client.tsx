/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { Terminal } from 'lucide-react';

import { CodeBlock } from '@/components/shared/code-block';

const installCommand = 'npx skills add ton-connect/kit/packages/mcp';


export function StepChooseClient() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h3 className="text-xl font-bold tracking-tight">Add TON MCP skills</h3>
                <p className="mt-2 text-base leading-relaxed text-neutral-400 sm:text-lg">
                    One install path works across Cursor, Claude Desktop, Windsurf, Codex, and
                    other MCP-compatible clients:
                </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
                    <Terminal size={12} className="text-neutral-600" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                        SINGLE ENTRYPOINT · RUN IN YOUR TERMINAL
                    </span>
                </div>
                <CodeBlock code={installCommand} className="rounded-none border-0 bg-transparent" />
            </div>
        </div>
    );
}
