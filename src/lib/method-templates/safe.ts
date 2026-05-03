import {
  AlertTriangle,
  Building2,
  Gauge,
  Gavel,
  GitCompare,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
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
 * SAFe config — scaled-agile flavor. Adds Features (between Epics and
 * Stories) and Program-Increment view stubs. Mirrors Scrum's sidebar
 * with an Epics-and-Features layer.
 *
 * PROJ-28: routeSlug=releases on planung (same as Scrum).
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "backlog", label: "Backlog", icon: ListChecks, tabPath: "backlog" },
  { id: "releases", label: "Releases", icon: GitCompare, tabPath: "planung", routeSlug: "releases" },
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
