import {
  AlertTriangle,
  Building2,
  Gauge,
  Gavel,
  History,
  Kanban,
  LayoutDashboard,
  MessageSquare,
  Network,
  Settings as SettingsIcon,
  Sparkles,
  Users,
  Users2,
  Wallet,
} from "lucide-react"

import type { MethodConfig, SidebarSection } from "@/types/method-config"
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"

/**
 * Kanban config — pull-system focus, no sprints, no phases. Sidebar
 * leads with the Board (which uses the canonical `backlog` folder), no
 * route alias because the term "Backlog" works for Kanban as-is.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "board", label: "Board", icon: Kanban, tabPath: "backlog" },
  { id: "graph", label: "Graph", icon: Network, tabPath: "graph" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "stakeholder-health", label: "Stakeholder-Health", icon: Gauge, tabPath: "stakeholder-health" },
  { id: "risks", label: "Risiken", icon: AlertTriangle, tabPath: "risiken", requiresModule: "risks" },
  { id: "decisions", label: "Entscheidungen", icon: Gavel, tabPath: "entscheidungen", requiresModule: "decisions" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals", requiresModule: "ai_proposals" },
  { id: "communication", label: "Kommunikation", icon: MessageSquare, tabPath: "kommunikation", requiresModule: "communication" },
  { id: "vendor", label: "Lieferanten", icon: Building2, tabPath: "lieferanten", requiresModule: "vendor" },
  { id: "budget", label: "Budget", icon: Wallet, tabPath: "budget", requiresModule: "budget" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
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
