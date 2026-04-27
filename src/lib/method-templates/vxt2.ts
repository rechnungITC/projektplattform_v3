import {
  ChartGantt,
  Flag,
  History,
  Kanban,
  LayoutDashboard,
  Layers,
  ListTodo,
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
 * VXT 2.0 config (PROJ-6). Hybrid: Wasserfall-Phasen oben, agile
 * Stories/Tasks im Backlog unten. Sidebar bietet beide Welten parallel.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "phases", label: "Phasen", icon: Layers, tabPath: "planung" },
  { id: "milestones", label: "Meilensteine", icon: Flag, tabPath: "planung?tab=meilensteine" },
  { id: "work-packages", label: "Arbeitspakete", icon: Package, tabPath: "backlog?kind=work_package" },
  { id: "backlog", label: "Backlog", icon: ListTodo, tabPath: "backlog" },
  { id: "board", label: "Board", icon: Kanban, tabPath: "backlog?view=board" },
  { id: "gantt", label: "Gantt", icon: ChartGantt, tabPath: "planung" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
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
