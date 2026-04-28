import {
  History,
  LayoutDashboard,
  Layers,
  Package,
  Settings as SettingsIcon,
  Sparkles,
  Target,
  Users,
  Users2,
  ShieldCheck,
} from "lucide-react"

import type { MethodConfig, SidebarSection } from "@/types/method-config"
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_METHOD_VISIBILITY,
  type WorkItemKind,
} from "@/types/work-item"

/**
 * PRINCE2 config (PROJ-6). Sidebar leads with Phasen / Arbeitspakete /
 * Meilensteine plus an explicit Lenkungsausschuss / Freigaben section
 * to reflect PRINCE2's strong governance gates. Top header is the
 * phase-bar like PMI.
 */
// Meilensteine (planung sub-tab) and Gantt (planung alias) are deferred
// until the planung page supports those sub-views.
const SIDEBAR_SECTIONS: SidebarSection[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard, tabPath: "" },
  { id: "phases", label: "Phasen", icon: Layers, tabPath: "planung" },
  { id: "work-packages", label: "Arbeitspakete", icon: Package, tabPath: "backlog" },
  { id: "approvals", label: "Freigaben", icon: ShieldCheck, tabPath: "governance" },
  { id: "ai", label: "KI-Vorschläge", icon: Sparkles, tabPath: "ai-proposals" },
  { id: "stakeholder", label: "Stakeholder", icon: Users, tabPath: "stakeholder" },
  { id: "members", label: "Mitglieder", icon: Users2, tabPath: "mitglieder" },
  { id: "risks", label: "Risiken", icon: Target, tabPath: "risiken" },
  { id: "history", label: "Historie", icon: History, tabPath: "historie" },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon, tabPath: "einstellungen" },
]

const VISIBLE_KINDS: WorkItemKind[] = WORK_ITEM_KINDS.filter((kind) =>
  WORK_ITEM_METHOD_VISIBILITY[kind].includes("prince2")
)

export const prince2Config: MethodConfig = {
  method: "prince2",
  label: "PRINCE2",
  topHeaderMode: "phase-bar",
  sidebarSections: SIDEBAR_SECTIONS,
  defaultCenterView: "list",
  hasSprints: false,
  hasPhases: true,
  hasDependencies: false,
  allowedAiKinds: ["work_package", "task", "bug"],
  stakeholderAttachableKinds: ["work_package", "task", "bug"],
  workItemKindsVisible: VISIBLE_KINDS,
  ritualsLabel: "Stage-Gate · Lenkungsausschuss · Lessons Learned",
}
