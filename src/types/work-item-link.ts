/**
 * PROJ-27 — Work-Item-Link types (DB row + API contract).
 *
 * Two flavours:
 *  - `WorkItemLink` matches the raw `work_item_links` row exactly.
 *  - `WorkItemLinkWithTargets` is the API-side enriched view with the
 *    joined item titles + accessibility flag for cross-project links.
 */

import type {
  WorkItemLinkApprovalState,
  WorkItemLinkType,
} from "@/lib/work-items/link-types"
import type { WorkItemKind, WorkItemStatus } from "@/types/work-item"

export interface WorkItemLink {
  id: string
  tenant_id: string
  from_work_item_id: string
  to_work_item_id: string | null
  from_project_id: string
  to_project_id: string | null
  link_type: WorkItemLinkType
  lag_days: number | null
  approval_state: WorkItemLinkApprovalState
  approval_project_id: string | null
  approved_by: string | null
  approved_at: string | null
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * Joined view rendered in the drawer + inbox. `target_item.accessible`
 * is false when the caller has no project-membership on the target side
 * (PROJ-27 § 4 — Placeholder rendering). When `target_item` is null and
 * `target_project` is set, the link is a "whole-project" `delivers`
 * link (PROJ-27 ST-08).
 */
export interface WorkItemLinkTargetRef {
  id: string
  title: string | null
  kind: WorkItemKind | null
  status: WorkItemStatus | null
  project_id: string
  project_name: string | null
  accessible: boolean
}

export interface WorkItemLinkProjectTargetRef {
  project_id: string
  project_name: string | null
  accessible: boolean
}

export interface WorkItemLinkWithTargets extends WorkItemLink {
  /** Joined target work-item (null for whole-project `delivers`-links). */
  target_item: WorkItemLinkTargetRef | null
  /** Joined source work-item — used by the inbox to show *who* asked. */
  source_item: WorkItemLinkTargetRef | null
  /** Whole-project target (only set when `to_work_item_id IS NULL`). */
  target_project: WorkItemLinkProjectTargetRef | null
  /** Display name of the creator — UX nicety for the inbox row. */
  created_by_name: string | null
}

/**
 * Perspective grouping the drawer renders. The API returns links pre-split
 * so the client never re-classifies. `pending_approval` is everything in
 * `pending` state where the caller is the *target* project lead — these are
 * actionable in the drawer (vs. the inbox page which lists *all* pending
 * for the project the user has lead-access to).
 */
export interface WorkItemLinksGroupedResponse {
  outgoing: WorkItemLinkWithTargets[]
  incoming: WorkItemLinkWithTargets[]
  pending_approval: WorkItemLinkWithTargets[]
}

/** Request body for `POST /api/projects/[id]/work-item-links`. */
export interface CreateLinkRequest {
  from_work_item_id: string
  /** Either `to_work_item_id` or `to_project_id` (whole-project delivers) must be set. */
  to_work_item_id?: string | null
  to_project_id?: string | null
  link_type: WorkItemLinkType
  lag_days?: number | null
}

/** Response of `POST /api/projects/[id]/work-item-links`. */
export interface CreateLinkResponse {
  link: WorkItemLinkWithTargets
  /** Reflects whether the trigger took us to `pending` (cross-project)
   *  or `approved` (hierarchy / same-project). */
  approval_state: WorkItemLinkApprovalState
}

/**
 * Inbox row (`GET /api/projects/[id]/links/inbox`). The inbox is the
 * project-lead's queue of pending cross-project requests *into* this
 * project. `source` is the requesting item; `target` is this project's
 * item that would receive the link.
 */
export interface LinkInboxItem {
  link_id: string
  link_type: WorkItemLinkType
  approval_state: WorkItemLinkApprovalState
  created_at: string
  created_by_name: string | null
  lag_days: number | null
  source: WorkItemLinkTargetRef
  target: WorkItemLinkTargetRef | null
  target_project: WorkItemLinkProjectTargetRef | null
}

/** Filter facets for the inbox page. */
export type LinkInboxFilter = "pending" | "approved" | "rejected" | "all"

/** Combobox response for `GET /api/work-items/search`. */
export interface WorkItemSearchResultItem {
  id: string
  title: string
  kind: WorkItemKind
  status: WorkItemStatus
  project_id: string
  project_name: string
  /** Whether the caller has at least view-access in the target project. */
  accessible: boolean
}

/** Request body for `POST /api/projects/[id]/work-item-links/[lid]/approve`. */
export interface ApproveLinkResponse {
  link: WorkItemLinkWithTargets
}
