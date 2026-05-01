import {
  AlertTriangle,
  Building2,
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
 * Scrum config (Tech Design § 2 — Scrum column). Sidebar emphasizes
 * Backlog → Releases plus the cross-cutting governance / collaboration
 * tabs that the platform exposes (PROJ-17 module-gated).
 *
 * PROJ-28: routeSlug=releases on the planung folder so the URL reads
 * `/projects/[id]/releases` for Scrum projects while the page code
 * lives under canonical `planung/page.tsx`.
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "backlog", label: "Backlog", icon: ListChecks, tabPath: "backlog" },
  { id: "releases", label: "Releases", icon: GitCompare, tabPath: "planung", routeSlug: "releases" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
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
