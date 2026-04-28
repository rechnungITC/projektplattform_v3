import {
  History,
  Kanban,
  LayoutDashboard,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  Users,
  Users2,
} from "lucide-react"

import type { MethodConfig, SidebarSection } from "@/types/method-config"
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"

/**
 * Kanban config — pull-system focus, no sprints. Sidebar leads with
 * Board, then Backlog. Top-header is a simple project banner.
 */
// "Backlog" entry (same target as Board) is deferred until the backlog page
// supports a list/board view-switch.
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "board", label: "Board", icon: Kanban, tabPath: "backlog" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("kanban")
)

export const kanbanConfig: MethodConfig = {
  method: "kanban",
  label: "Kanban",
  topHeaderMode: "simple",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "board",
  hasSprints: false,
  hasPhases: false,
  hasDependencies: false,
  allowedAiKinds: ["story", "task", "bug"],
  stakeholderAttachableKinds: ["story", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "WIP-Reviews · Service-Class-Refinement · Replenishment-Meetings",
}
