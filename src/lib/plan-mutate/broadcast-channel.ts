/**
 * PROJ-65 ε.3c.δ (D8) — Plan-Mutate BroadcastChannel producer.
 *
 * Cross-tab + same-tab pub/sub surface so that PROJ-58 ProjectGraphView
 * (and any future consumer) can invalidate its snapshot when a
 * Plan-Mutate commit OR undo lands in another tab/window of the same
 * user session.
 *
 * Design notes:
 *  - Producer-side opens a new BroadcastChannel per emit and closes it
 *    immediately. The OS-level channel is identified by name only, so
 *    there is no lifecycle to manage — keeping the call ergonomic and
 *    leak-free.
 *  - Consumer-side keeps a long-lived channel (see
 *    `project-graph-view.tsx` listener Mini-PR).
 *  - Browser-support: BroadcastChannel is available in Safari 15.4+,
 *    Chrome/Edge/Firefox all current. The helper no-ops on older
 *    browsers (or SSR) so callers do not have to guard themselves.
 *  - Out of scope: cross-origin / cross-user sync (would need
 *    server-side eventing) — see brief R-δ4.
 */

export const PLAN_MUTATE_CHANNEL_NAME = "plan-mutate-events"

/**
 * Discriminated union of event types broadcast over the channel.
 * Adding new event types in the future is backwards-safe — consumers
 * must check `event.type` before reading `detail`.
 */
export type PlanMutateEvent =
  | {
      type: "plan-mutate-committed"
      detail: {
        projectId: string
        causation_id: string
        affectedCount: number
      }
    }
  | {
      type: "plan-mutate-undone"
      detail: {
        projectId: string
        causation_id: string
        affectedCount: number
      }
    }

/**
 * Emits a PlanMutateEvent on the shared channel. Safe to call from any
 * client context — no-op when BroadcastChannel is unavailable (SSR or
 * pre-Safari-15.4 browsers).
 */
export function emitPlanMutateEvent(event: PlanMutateEvent): void {
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(PLAN_MUTATE_CHANNEL_NAME)
  try {
    channel.postMessage(event)
  } finally {
    channel.close()
  }
}
