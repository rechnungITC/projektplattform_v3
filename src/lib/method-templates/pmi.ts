import {
  AlertTriangle,
  Building2,
  Gauge,
  Gavel,
  History,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Package,
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
 * PMI config (Tech Design § 2). Sidebar leads with Phasen, Arbeitspakete
 * and a Gantt entry. Top-header is a horizontal phase bar.
 *
 * PROJ-28: routeSlug aliases mirror Waterfall (phasen + arbeitspakete).
 */
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "phases", label: "Phasen", icon: Layers, tabPath: "planung", routeSlug: "phasen" },
  { id: "work-packages", label: "Arbeitspakete", icon: Package, tabPath: "backlog", routeSlug: "arbeitspakete" },
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
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("pmi")
)

export const pmiConfig: MethodConfig = {
  method: "pmi",
  label: "PMI",
  topHeaderMode: "phase-bar",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: false,
  allowedAiKinds: ["work_package", "task", "bug"],
  stakeholderAttachableKinds: ["work_package", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Phase-Gate · Lessons Learned · Meilenstein-Review",
}
