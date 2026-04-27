import {
  GitCompare,
  History,
  Kanban,
  LayoutDashboard,
  ListChecks,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  TrendingUp,
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
 * Scrum config (Tech Design § 2 — Scrum column). Sidebar emphasizes
 * Backlog → Sprint Board → Releases → Velocity, plus the cross-cutting
 * AI / Stakeholder / Risk / Budget items.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "backlog", label: "Backlog", icon: ListChecks, tabPath: "backlog" },
  { id: "board", label: "Sprint-Board", icon: Kanban, tabPath: "backlog?view=board" },
  { id: "releases", label: "Releases", icon: GitCompare, tabPath: "planung" },
  { id: "velocity", label: "Velocity", icon: TrendingUp, tabPath: "planung" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("scrum")
)

export const scrumConfig: MethodConfig = {
  method: "scrum",
  label: "Scrum",
  topHeaderMode: "sprint-selector",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "board",
  hasSprints: true,
  hasPhases: false,
  hasDependencies: false,
  allowedAiKinds: ["epic", "feature", "story", "task", "bug"],
  stakeholderAttachableKinds: ["story", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Sprint-Planung · Daily · Review · Retro",
}
