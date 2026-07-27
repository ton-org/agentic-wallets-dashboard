/**
 * Copyright (c) TonTech.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { AgentWallet } from '../types';
import type { LimitsUsageMap, LimitsView } from '../lib/limits-types';
import { useAgentLimitsChainData } from './use-agent-limits';

export interface UseAgentLimitsUsageResult {
    usage: LimitsUsageMap;
    isLoading: boolean;
}

/**
 * Live rolling-window spend for the configured limits, reproducing the MCP's
 * per-transaction accounting so the bars match what the MCP will enforce.
 *
 * Shares the single account-history fetch performed by `useAgentLimits` (same
 * query key), so the spend bars and the decoded limits are always derived from the
 * same on-chain transactions — there is no second fetch.
 */
export function useAgentLimitsUsage(agent: AgentWallet | null, limits: LimitsView | null): UseAgentLimitsUsageResult {
    const query = useAgentLimitsChainData(agent);
    const hasWindowedLimits = (limits?.maxWindowSeconds ?? 0) > 0;

    return {
        usage: query.data?.usage ?? {},
        isLoading: hasWindowedLimits && query.isLoading,
    };
}
