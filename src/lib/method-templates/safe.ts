import {
  GitCompare,
  History,
  LayoutDashboard,
  ListChecks,
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
 * SAFe config — scaled-agile flavor. Adds Features (between Epics and
 * Stories) and Program-Increment view stubs. Mirrors Scrum's sidebar
 * with an Epics-and-Features layer.
 */
// Duplicate-route entries (Epics & Features → backlog?kind=epic, Sprint-Board
// → backlog?view=board) are deferred until the backlog page filters by query.
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "backlog", label: "Backlog", icon: ListChecks, tabPath: "backlog" },
  { id: "releases", label: "Releases", icon: GitCompare, tabPath: "planung" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("safe")
)

export const safeConfig: MethodConfig = {
  method: "safe",
  label: "SAFe",
  topHeaderMode: "sprint-selector",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "board",
  hasSprints: true,
  hasPhases: false,
  hasDependencies: false,
  allowedAiKinds: ["epic", "feature", "story", "task", "subtask", "bug"],
  stakeholderAttachableKinds: ["story", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "PI-Planning · Sprint-Planning · Daily · Review · Retro · System-Demo",
}
