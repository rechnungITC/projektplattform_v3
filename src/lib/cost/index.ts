/**
 * PROJ-24 — Cost-Stack module surface.
 *
 * Public API exposed to API routes (Phase 24-γ) and the resource hook
 * (Phase 24-δ). Re-exports are kept minimal — internal helpers
 * (e.g. `pickBasis`, `parseRpcRow`) are not exported.
 */

export { calculateWorkItemCosts } from "./calculate-work-item-costs"
export { resolveRoleRates } from "./role-rate-lookup"
export { synthesizeResourceAllocationCostLines } from "./synthesize-cost-lines"
export type {
  SynthesizeCostLinesInput,
  SynthesizeCostLinesResult,
} from "./synthesize-cost-lines"
export type {
  AllocationInput,
  CostCalcResult,
  CostCalcWarning,
  CostCalcWarningKind,
  CostLineDraft,
  RoleRateLookupKey,
  RoleRateSnapshot,
  WorkItemCostInput,
} from "./types"
