import {
  ClipboardList,
  History,
  LayoutDashboard,
  ListTodo,
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
 * General-purpose config — used when the project has not yet committed
 * to a method. Mirrors the original PROJ-4 tab order so behavior
 * stays familiar; defaults to the list view in the Backlog tab.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "planning", label: "Planung", icon: ClipboardList, tabPath: "planung" },
  { id: "backlog", label: "Backlog", icon: ListTodo, tabPath: "backlog" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("general")
)

export const generalConfig: MethodConfig = {
  method: "general",
  label: "Allgemein",
  topHeaderMode: "simple",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: false,
  allowedAiKinds: ["epic", "work_package", "task", "bug"],
  stakeholderAttachableKinds: ["story", "task", "work_package", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Wöchentliches Stand-up · Status-Review · Retrospektive",
}
