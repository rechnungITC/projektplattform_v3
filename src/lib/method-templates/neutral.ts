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
import { WORK_ITEM_KINDS, type WorkItemKind } from "@/types/work-item"

/**
 * Neutral fallback config (PROJ-6) — rendered when the project has not
 * yet committed to a method (`projects.project_method = NULL`). The
 * sidebar mirrors the original PROJ-4 tab order and every kind is
 * creatable — the user can structure freely before picking a method.
 *
 * Not associated with any `ProjectMethod` enum value; the `method` field
 * is `null` to make the unset state explicit.
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

const ALL_KINDS: WorkItemKind[] = [...WORK_ITEM_KINDS]

export const neutralFallbackConfig: MethodConfig = {
  method: null,
  label: "Methode wählen",
  topHeaderMode: "simple",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: false,
  allowedAiKinds: ["epic", "story", "task", "work_package", "bug"],
  stakeholderAttachableKinds: ["story", "task", "work_package", "bug"],
  workItemKindsVisible: ALL_KINDS,
  ritualsLabel: "Lege eine Methode fest, um passende Rituale vorzuschlagen.",
}
