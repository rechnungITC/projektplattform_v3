import {
  AlertTriangle,
  Building2,
  Gauge,
  Gavel,
  History,
  Layers,
  LayoutDashboard,
  ListTodo,
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
 * VXT 2.0 config (PROJ-6). Hybrid: Wasserfall-Phasen oben, agile
 * Stories/Tasks im Backlog unten. Sidebar bietet beide Welten parallel.
 *
 * PROJ-28: routeSlug=phasen for the Phasen section; the Backlog stays
 * canonical (`backlog`) because this is the agile half of the hybrid
 * and renaming it would mislead users.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "phases", label: "Phasen", icon: Layers, tabPath: "planung", routeSlug: "phasen" },
  { id: "backlog", label: "Backlog", icon: ListTodo, tabPath: "backlog" },
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
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("vxt2")
)

export const vxt2Config: MethodConfig = {
  method: "vxt2",
  label: "VXT 2.0",
  topHeaderMode: "phase-bar",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: false,
  allowedAiKinds: ["work_package", "story", "task", "bug"],
  stakeholderAttachableKinds: ["work_package", "story", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Phase-Review · Sprint-Stand-up · Stage-Gate",
}
