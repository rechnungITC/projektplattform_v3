/**
 * PROJ-18 — TS-as-source-of-truth compliance templates.
 *
 * The /architecture decision (Frage 2 = A) locked these as TypeScript
 * constants instead of Markdown files or DB rows: easier to type-check,
 * version with the code, and ship without a migration.
 *
 * The 7 keys here MUST match the platform-default `compliance_tags.key`
 * values seeded in the migration. Each tag's `template_keys` array points
 * to one or more entries below by `key`.
 *
 * To add a tenant-custom template later: extend this map at runtime via a
 * tenant-settings layer (out of scope for the v1 plumbing slice).
 */

import type { ComplianceTagKey, ComplianceTemplate } from "./types"

const ISO_9001: ComplianceTemplate = {
  key: "iso-9001-form",
  title: "ISO 9001 — Qualitätsprüfung",
  childKind: "task",
  childTitle: "ISO 9001 Qualitäts-Check durchführen",
  childDescription:
    "Prüfung gegen Qualitätsmanagement-Anforderungen nach ISO 9001. " +
    "Pflicht: prozesskonforme Dokumentation + Freigabe-Schritt.",
  firePhase: "created",
  body:
    "## ISO 9001 Qualitätsprüfung\n\n" +
    "Diese Compliance-Form wurde automatisch durch das Tag *iso-9001* erzeugt.\n\n" +
    "Bitte alle Punkte abarbeiten und das Dokument vor Statuswechsel nach " +
    "*done* finalisieren.\n",
  checklist: [
    { key: "process-doc", label: "Prozess-Dokumentation erstellt/aktualisiert" },
    { key: "review", label: "Vier-Augen-Prüfung erfolgt" },
    { key: "sign-off", label: "Freigabe durch QM-Verantwortliche/n eingeholt" },
    {
      key: "evidence-stored",
      label: "Nachweise in Vorgangs-Dokumentation abgelegt",
      hint: "z.B. Prüfprotokoll, Checklisten, Screenshots",
    },
  ],
}

const ISO_27001: ComplianceTemplate = {
  key: "iso-27001-form",
  title: "ISO 27001 — Informationssicherheits-Check",
  childKind: "task",
  childTitle: "ISO 27001 Informationssicherheits-Check",
  childDescription:
    "Risikobetrachtung + Maßnahmen-Mapping gegen ISO-27001-Controls.",
  firePhase: "created",
  body:
    "## ISO 27001 Informationssicherheits-Check\n\n" +
    "Auslöser: Tag *iso-27001*. Bitte alle Punkte vor Done abschließen.\n",
  checklist: [
    { key: "asset-classification", label: "Schutzbedarf-Klassifikation der betroffenen Assets durchgeführt" },
    { key: "risk-assessment", label: "Risikobewertung durchgeführt (Eintrittswahrsch. × Schaden)" },
    { key: "controls-mapping", label: "Anwendbare Controls aus Annex A identifiziert" },
    { key: "mitigations", label: "Maßnahmen geplant und Verantwortliche festgelegt" },
    { key: "soa-update", label: "Statement of Applicability (SoA) aktualisiert", hint: "Falls neue Controls dazukommen" },
  ],
}

const DSGVO: ComplianceTemplate = {
  key: "dsgvo-form",
  title: "DSGVO — Datenschutz-Folgenabschätzung & DPA",
  childKind: "task",
  childTitle: "DSGVO-Prüfung durchführen",
  childDescription:
    "Datenfluss aufnehmen, Klasse-3-Daten markieren, ggf. AVV/DPA " +
    "und DSFA erstellen oder anbinden.",
  firePhase: "created",
  body:
    "## DSGVO Compliance\n\n" +
    "Auslöser: Tag *dsgvo*. Klasse-3-Daten dürfen das System NICHT über " +
    "externe LLM-Pfade verlassen (vgl. PROJ-12).\n",
  checklist: [
    { key: "data-flow", label: "Datenfluss dokumentiert (welche personenbez. Daten, woher, wohin)" },
    { key: "purpose", label: "Verarbeitungszweck festgehalten und Rechtsgrundlage benannt" },
    { key: "minimization", label: "Datenminimierung geprüft (nur erforderliche Felder)" },
    {
      key: "dpa",
      label: "AVV/DPA mit allen externen Auftragsverarbeitern abgeschlossen",
      hint: "Cloud-Anbieter, SaaS-Tools, Subdienstleister",
    },
    {
      key: "dpia",
      label: "DSFA durchgeführt (falls erforderlich)",
      hint: "Pflicht bei hohem Risiko: z.B. Profiling, sensitive Daten, neue Technologien",
    },
    { key: "retention", label: "Löschfristen + Aufbewahrungsregeln definiert" },
  ],
}

const M365: ComplianceTemplate = {
  key: "m365-intro-form",
  title: "Microsoft 365 — Standard-Rollout Schritte",
  childKind: "work_package",
  childTitle: "Microsoft 365 Einführung",
  childDescription:
    "Standard-Bündel für M365-Rollouts: Identitäten, Lizenzen, Migration, " +
    "Schulung. Aus Tag *microsoft-365-intro* automatisch erstellt.",
  firePhase: "created",
  body:
    "## Microsoft 365 Einführung\n\n" +
    "Standard-Schritte für Microsoft-365-Rollouts. Reihenfolge nach " +
    "Best-Practice — Identitäten/AzureAD zuerst, dann Lizenzen + Migration.\n",
  checklist: [
    { key: "identities", label: "Identitäten/Tenant + AzureAD-Konfiguration" },
    { key: "licenses", label: "Lizenz-Modell festgelegt + Rollen-Zuweisung" },
    { key: "exchange", label: "Exchange-Migration geplant (Mailbox-Größen, Cutover/Hybrid)" },
    { key: "teams", label: "Teams-Channels + Governance-Policies definiert" },
    { key: "sharepoint", label: "SharePoint-Site-Struktur + Berechtigungen" },
    { key: "intune", label: "Intune Device-Management aktiviert" },
    { key: "training", label: "End-User-Schulung organisiert" },
  ],
}

const VENDOR_EVAL: ComplianceTemplate = {
  key: "vendor-evaluation-form",
  title: "Lieferanten-Evaluation",
  childKind: "task",
  childTitle: "Vendor-Evaluation durchführen",
  childDescription:
    "Bewertungs-Matrix nach Standard-Kriterien (Preis, Qualität, " +
    "Liefertreue, Compliance). Mit PROJ-15 Vendor-Master verzahnt.",
  firePhase: "created",
  body:
    "## Lieferanten-Evaluation\n\n" +
    "Auslöser: Tag *vendor-evaluation*. Mindestens drei Kriterien sind " +
    "zu bewerten. Ergebnis fließt in PROJ-15 Vendor-Master als Score zurück.\n",
  checklist: [
    { key: "criteria-defined", label: "Bewertungs-Kriterien festgelegt (mind. 3)" },
    { key: "scoring", label: "Scores erfasst (Skala 1–5)" },
    { key: "documents", label: "Belege/Angebote in Vendor-Master abgelegt" },
    { key: "decision", label: "Entscheidung dokumentiert (Vergabe/Absage)" },
  ],
}

const CHANGE_MGMT: ComplianceTemplate = {
  key: "change-management-form",
  title: "Change-Management — CR-Workflow",
  childKind: "work_package",
  childTitle: "Change-Request bearbeiten",
  childDescription:
    "Standard-Workflow: Antrag, Bewertung, Freigabe, Rollout, Review.",
  firePhase: "created",
  body:
    "## Change-Management Workflow\n\n" +
    "Auslöser: Tag *change-management*. Pflicht-Schritte vor Rollout.\n",
  checklist: [
    { key: "request", label: "Change-Request formal erfasst" },
    { key: "impact", label: "Impact-Analyse durchgeführt (Systeme, User, Risiken)" },
    { key: "approval", label: "Freigabe durch CAB / Lead-Verantwortliche" },
    { key: "rollout-plan", label: "Rollout- und Rollback-Plan dokumentiert" },
    { key: "communication", label: "Stakeholder-Kommunikation versendet" },
    { key: "post-review", label: "Post-Implementation-Review durchgeführt" },
  ],
}

const ONBOARDING: ComplianceTemplate = {
  key: "onboarding-form",
  title: "Onboarding-Checkliste",
  childKind: "task",
  childTitle: "Onboarding für neue/n Mitarbeiter/in",
  childDescription:
    "Standard-Bündel für neue Team-Mitglieder: Hardware, Accounts, " +
    "Berechtigungen, Schulung, Mentor-Zuweisung.",
  firePhase: "created",
  body:
    "## Onboarding\n\n" +
    "Auslöser: Tag *onboarding*. Reihenfolge möglichst einhalten — " +
    "Hardware + Accounts BEVOR der erste Tag startet.\n",
  checklist: [
    { key: "hardware", label: "Hardware (Laptop, Headset, Peripherie) bereitgestellt" },
    { key: "accounts", label: "Accounts angelegt (E-Mail, AD/AzureAD, Tools)" },
    { key: "permissions", label: "Berechtigungen vergeben (Repositories, Drives, SaaS)" },
    { key: "mentor", label: "Mentor/Buddy zugewiesen" },
    { key: "training", label: "Schulungs-Plan erstellt + erste Sessions terminiert" },
    { key: "first-day", label: "Welcome-Termin am ersten Tag organisiert" },
  ],
}

/**
 * Master template registry. The trigger engine looks up templates by key.
 * The `tagToTemplates` mapping is the canonical edge — adding a new tag
 * means: (a) seed the tag in a migration, (b) add the template here,
 * (c) wire it in `TAG_TO_TEMPLATES` below.
 */
export const TEMPLATES_BY_KEY: Readonly<Record<string, ComplianceTemplate>> = {
  [ISO_9001.key]: ISO_9001,
  [ISO_27001.key]: ISO_27001,
  [DSGVO.key]: DSGVO,
  [M365.key]: M365,
  [VENDOR_EVAL.key]: VENDOR_EVAL,
  [CHANGE_MGMT.key]: CHANGE_MGMT,
  [ONBOARDING.key]: ONBOARDING,
}

export const TAG_TO_TEMPLATE_KEYS: Readonly<
  Record<ComplianceTagKey, readonly string[]>
> = {
  "iso-9001": [ISO_9001.key],
  "iso-27001": [ISO_27001.key],
  dsgvo: [DSGVO.key],
  "microsoft-365-intro": [M365.key],
  "vendor-evaluation": [VENDOR_EVAL.key],
  "change-management": [CHANGE_MGMT.key],
  onboarding: [ONBOARDING.key],
}

export function lookupTemplate(key: string): ComplianceTemplate | null {
  return TEMPLATES_BY_KEY[key] ?? null
}

/**
 * Resolve template-key list -> template objects (silently drops unknown keys
 * so legacy tags with stale keys don't crash the trigger).
 */
export function lookupTemplates(keys: readonly string[]): ComplianceTemplate[] {
  const out: ComplianceTemplate[] = []
  for (const k of keys) {
    const t = TEMPLATES_BY_KEY[k]
    if (t) out.push(t)
  }
  return out
}
