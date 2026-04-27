import {
  ChartGantt,
  Flag,
  History,
  LayoutDashboard,
  Layers,
  Network,
  Package,
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
 * Waterfall config (Tech Design § 2). Sidebar adds Abhängigkeiten as
 * a first-class entry; default center view is `list` (with Gantt as a
 * secondary toggle once shipped).
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "phases", label: "Phasen", icon: Layers, tabPath: "planung" },
  { id: "work-packages", label: "Arbeitspakete", icon: Package, tabPath: "backlog" },
  { id: "dependencies", label: "Abhängigkeiten", icon: Network, tabPath: "abhaengigkeiten" },
  { id: "gantt", label: "Gantt", icon: ChartGantt, tabPath: "planung" },
  { id: "milestones", label: "Meilensteine", icon: Flag, tabPath: "planung?tab=meilensteine" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("waterfall")
)

export const waterfallConfig: MethodConfig = {
  method: "waterfall",
  label: "Wasserfall",
  topHeaderMode: "phase-bar",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: true,
  allowedAiKinds: ["work_package", "task", "bug"],
  stakeholderAttachableKinds: ["work_package", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Sign-off pro Phase · Change-Request-Review",
}
