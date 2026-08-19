/**
 * PROJ-Y-143k — the Stammdaten tile grid, as data plus one pure resolver.
 *
 * The grid used to be a literal inside the page component and filtered by
 * nothing at all: the "Ressourcen" tile was advertised even when the
 * `resources` module is off and the route behind it deliberately answers
 * 404 (`requireModuleActive`, read intent). The navigation was selling what
 * the gate closes.
 *
 * The fix follows the precedent PROJ-Y-143f settled rather than inventing a
 * second one: an inactive module is **a state, not a hidden thing and not a
 * fault**. Tiles therefore stay visible and say so, instead of disappearing
 * — hiding them would leave a tenant admin with no way to discover what
 * could be switched on, and would make the setting itself undiscoverable.
 *
 * `requiresModule` is only set where a server gate actually exists — a
 * UI-only claim would be worse than no claim, because the tile would read
 * "not active" while the page behind it still works.
 *
 * PROJ-Y-143n closed the one exception this file used to carry: `organization`
 * was left out because only the five CSV-import routes enforced the switch
 * while the twelve handlers of the core surface ignored it. Those handlers now
 * call `requireModuleActive`, so the tile may state the gate like the others.
 */

import {
  Building2,
  HardHat,
  FolderTree,
  LayoutTemplate,
  ListChecks,
  Microscope,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
  Users2,
} from "lucide-react"

import { isModuleActive } from "@/lib/tenant-settings/modules"
import type { ModuleKey, TenantSettings } from "@/types/tenant-settings"

export interface StammdatenSection {
  href: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  /** True when only tenant_admin can navigate here. UI-only hint;
   *  server-side admin-gating happens in the API routes. */
  adminOnly?: boolean
  /**
   * PROJ-Y-143k — set **only** when the surface behind this tile is gated by
   * `requireModuleActive` on the server. A UI-only claim would be worse than
   * no claim: the tile would say "not active" while the page still works.
   */
  requiresModule?: ModuleKey
}

export interface ResolvedStammdatenSection extends StammdatenSection {
  /** The tile is module-backed and that module is off for this workspace. */
  moduleInactive: boolean
}

export const STAMMDATEN_SECTIONS: readonly StammdatenSection[] = [
  {
    href: "/stammdaten/resources",
    icon: Users,
    title: "Ressourcen",
    description:
      "Mandantenweiter Pool plannbarer Personen und Parteien. FTE, Verfügbarkeit, Allokationen.",
    requiresModule: "resources",
  },
  {
    href: "/stammdaten/stakeholder",
    icon: Users2,
    title: "Stakeholder-Rollup",
    description:
      "Tenant-weite Übersicht aller Stakeholder mit Projekt-Beteiligung. Read-only — Pflege bleibt pro Projekt.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/stakeholder-types",
    icon: Tags,
    title: "Stakeholder-Typen",
    description:
      "Globale Defaults (Promoter/Supporter/Kritiker/Blockierer) plus eigene Typen pro Tenant — werden im Stakeholder-Form als Dropdown angeboten.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/gewerke",
    icon: HardHat,
    title: "Gewerke",
    description:
      "Mandantenweiter Gewerke-Katalog für Bauprojekte. Wird je Projekt ausgewählt; eine Umbenennung wirkt überall, weil Projekte den Eintrag referenzieren statt ihn zu kopieren.",
    adminOnly: true,
    requiresModule: "construction",
  },
  {
    href: "/stammdaten/projekttypen",
    icon: FolderTree,
    title: "Projekttypen",
    description:
      "Tenant-spezifische Anpassungen der Standard-Rollen und Pflicht-Infos pro Projekttyp.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/methoden",
    icon: ListChecks,
    title: "Methoden",
    description:
      "Aktivieren oder deaktivieren der verfügbaren Projektmethoden pro Tenant. Mindestens eine bleibt aktiv.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/vendors",
    icon: Building2,
    title: "Lieferanten",
    description:
      "Mandantenweiter Vendor-Pool mit Bewertungen, Dokumenten-Slots und Projekt-Zuordnungen.",
    requiresModule: "vendor",
  },
  {
    href: "/stammdaten/berechtigungsprofile",
    icon: ShieldCheck,
    title: "Berechtigungsprofile",
    description:
      "Vorgefertigte Need-to-know-Vorlagen (z. B. „DD-Stream Legal voll“). Vergeben beim Anwenden eine Vertraulichkeitsstufe an einen Nutzer im Projekt.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/vier-augen-genehmigung",
    icon: ShieldCheck,
    title: "4-Augen-Genehmigung",
    description:
      "Optionaler Genehmigungs-Gate für sensible Vertraulichkeits-Freischaltungen: Stufen aktivieren, erforderliche Personenzahl und Approver-Pool festlegen.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/revisionszugriff",
    icon: ShieldCheck,
    title: "Revisionszugriff",
    description:
      "Leseberechtigung am Audit-Trail für Revision und befristete externe Prüfer — ohne Projektmitgliedschaft und ohne Schreibrechte. Ersetzt die Mitgliedschaft, nicht die Vertraulichkeitsstufe.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/organisation",
    icon: Network,
    title: "Organisation",
    description:
      "Unternehmensorganigramm — Gesellschaften, Standorte, Bereiche, Abteilungen und Teams als hierarchischer Baum (Tree + Tabelle).",
    adminOnly: true,
    requiresModule: "organization",
  },
  {
    href: "/stammdaten/dd-stream-vorlagen",
    icon: Microscope,
    title: "DD-Stream-Vorlagen",
    description:
      "Tenant-Katalog der Due-Diligence-Streams (Commercial, Financial, Tax, Legal, HR, IT …). Werden beim Aktivieren in ein M&A-Projekt kopiert.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/projekt-vorlagen",
    icon: LayoutTemplate,
    title: "Projekt-Vorlagen (M&A)",
    description:
      "Tenant-Katalog wiederverwendbarer M&A-Projektstrukturen (Phasen, Workstreams, Deliverables). Bei der Projektanlage wählbar; werden ins neue Projekt kopiert (Copy-on-create).",
    adminOnly: true,
  },
  {
    href: "/stammdaten/risikokategorien",
    icon: ShieldAlert,
    title: "Risikokategorien",
    description:
      "Tenant-Katalog der Risiko-Kategorien (Financial, Legal, Tax …). Pflichtfeld im M&A-Risiko-Register; der DD-Standardsatz wird bei Erstnutzung automatisch angelegt.",
    adminOnly: true,
  },
  {
    href: "/stammdaten/skills",
    icon: Sparkles,
    title: "Skills",
    description:
      "Tenant-Katalog wiederverwendbarer KI-Skill-Definitionen (Markdown + Metadaten), versioniert mit genau einer aktiven Version. Admin-Pflege; PMs sehen den Katalog read-only.",
    adminOnly: true,
  },
] as const

/**
 * Annotates every tile with whether its module is off. Nothing is removed —
 * the grid keeps its shape, the caller decides how to render the flag.
 *
 * Fails open through `isModuleActive`: while settings are still loading (or
 * missing entirely for a legacy tenant) every tile reads as active, so the
 * page never briefly claims that half the workspace is switched off.
 */
export function resolveStammdatenSections(
  settings: TenantSettings | null | undefined,
  sections: readonly StammdatenSection[] = STAMMDATEN_SECTIONS,
): ResolvedStammdatenSection[] {
  return sections.map((section) => ({
    ...section,
    moduleInactive: section.requiresModule
      ? !isModuleActive(settings, section.requiresModule)
      : false,
  }))
}
