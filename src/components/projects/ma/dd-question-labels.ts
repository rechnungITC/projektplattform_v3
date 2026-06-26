/**
 * PROJ-113 — shared German labels + helpers for the DD Q&A UI.
 */

import type {
  DdQuestionPriority,
  DdQuestionStatus,
} from "@/lib/ma-project/dd-questions-api"

export const DD_QUESTION_STATUS_LABEL: Record<DdQuestionStatus, string> = {
  open: "Offen",
  in_answering: "In Beantwortung",
  answered: "Beantwortet",
  followup: "Nachgefragt",
  closed: "Geschlossen",
}

export const DD_QUESTION_PRIORITY_LABEL: Record<DdQuestionPriority, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
}

export function ddQuestionStatusBadgeVariant(
  status: DdQuestionStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "closed") return "default"
  if (status === "open") return "outline"
  return "secondary" // in_answering | answered | followup
}

export function ddPriorityBadgeVariant(
  priority: DdQuestionPriority
): "default" | "secondary" | "destructive" | "outline" {
  if (priority === "high") return "destructive"
  if (priority === "low") return "outline"
  return "secondary"
}

/**
 * Allowed next states — mirrors the server-side transition_dd_question_status
 * machine (linear forward + one-step revert + reopen). The RPC re-validates
 * authoritatively (incl. need-to-know clearance).
 */
export function allowedDdQuestionTransitions(
  status: DdQuestionStatus
): DdQuestionStatus[] {
  switch (status) {
    case "open":
      return ["in_answering"]
    case "in_answering":
      return ["answered", "open"]
    case "answered":
      return ["followup", "closed", "in_answering"]
    case "followup":
      return ["in_answering", "answered"]
    case "closed":
      return ["followup"]
    default:
      return []
  }
}
