---
id: PROJ-118
title: "Kommunikationsmatrix für interne und externe Zielgruppen"
issue_type: Story
epic_code: H
epic_title: "Kommunikation, Gremien & Stakeholder"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-h", "should-have"]
dependencies: ["A2", "F1", "C1", "L2", "L3"]
roles: ["Communications Lead", "Deal Lead", "Executive Sponsor", "HR Lead", "Legal Counsel", "PMO-Lead"]
summary_for_jira: "[H2] Kommunikationsmatrix für interne und externe Zielgruppen"
---

# PROJ-118: Kommunikationsmatrix für interne und externe Zielgruppen

## Status: Deployed (2026-07-24 — PR #258 → main `a6c535c`, Tag `v2.23.0-PROJ-118`; QA PASS 0 Critical/0 High; Live-Pentest A–I 9/9 + Playwright 11/11)
## Deployment Scope: full

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** QA 2026-07-24: **AC1…AC5 ✅** und H1–H6 ✅, Playwright 11/11, Live-Pentest A–I 9/9. Die Abweichungen betreffen die *Umsetzung*, nicht den Umfang (D-2: Signing/Closing-Sicht als Namens-Filter; D-3: Approver-Gating clientseitig, SoD serverseitig erzwungen). Die Sende-Brücke (PROJ-Y-118a) verlangt kein AC — AC3 endet bei „versandbereit".

**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic H — Kommunikation, Gremien & Stakeholder)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: PROJ-13 + Klassifikation. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** H — Kommunikation, Gremien & Stakeholder  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-h` · `should-have`  
> **Abhängigkeiten:** `A2`, `F1`, `C1`, `L2`, `L3`

**User Story:**

Als Communications Lead möchte ich für jede Zielgruppe (Geschäftsführung, Beirat, Führungskräfte, Mitarbeiter beider Seiten, Kunden, Lieferanten, Banken, Behörden, Presse) Kommunikationszeitpunkte, Inhalte, Freigaben und Verantwortliche planen und nachverfolgen können, damit M&A-Kommunikation kontrolliert, vertraulich und zielgruppengerecht erfolgt.

**Beschreibung / Kontext:**

Das Modell definiert Kommunikation in M&A explizit als hochsensiblen Bereich mit Need-to-know-Prinzip, klaren Freigabeprozessen und konsistenten Botschaften. Eine zentrale Kommunikationsmatrix ist Pflichtartefakt.

**Akzeptanzkriterien:**

- [ ] Eine konfigurierbare Kommunikationsmatrix erfasst pro Eintrag: Zielgruppe, Botschaft/Inhalt, Kanal, Termin (geplant/erfolgt), Verantwortlicher, Freigeber, Status, Vertraulichkeitsstufe (L2).
- [ ] Einträge können mit Phasen (A2), Stage-Gates (F1) und Aufgaben (C1) verknüpft werden.
- [ ] Eine Freigabe-Workflow-Funktion existiert: Inhalt wird vom Verantwortlichen erstellt, vom Freigeber bestätigt; ohne Freigabe ist der Status nicht 'versandbereit'.
- [ ] Eine Sicht 'Kommunikation Signing/Closing' zeigt alle Pflicht-Kommunikationen rund um die Schlüsselereignisse.
- [ ] Vorlagen für Standardbausteine (Mitarbeiterinformation, Kundeninformation, Pressemitteilung, Behördenmeldung) können hinterlegt werden.

**Abgrenzungen (Out of Scope):**

- Die Plattform versendet keine Kommunikation an externe Empfänger.
- Eine Pressekontakt-Verwaltung ist nicht in Scope.
- Erstellung des tatsächlichen Versands erfolgt außerhalb der Plattform.

**Offene Fragen:**

- Soll der Versand-Status (z. B. 'an Pressestelle übergeben am …') protokolliert werden?
- Wie wird mit kapitalmarktrechtlichen Pflichten (Ad-hoc) umgegangen, falls relevant?

**Definition of Ready:**

- [ ] Zielgruppen- und Vorlagenkatalog ist abgestimmt.
- [ ] Freigabeprozess ist mit Compliance und Communications definiert.

**Definition of Done:**

- [ ] Matrix kann erfasst, verknüpft und gefiltert werden.
- [ ] Freigabe-Workflow funktioniert und ist protokolliert (L3).
- [ ] Mind. drei Standardvorlagen sind hinterlegt.

**Abhängigkeiten:**

- A2
- F1
- C1
- L2
- L3

**Betroffene Rollen:**

- Communications Lead
- Deal Lead
- Executive Sponsor
- HR Lead
- Legal Counsel
- PMO-Lead

---

## Tech Design (Solution Architect) — 2026-07-21 · CIA GO-mit-ADJUST

> **Klasse EXTEND.** **Reuse-Matrix-Drift korrigiert (wie PROJ-117):** realer Build-Anker = **PROJ-100a (Klassifikation) + PROJ-117-Muster** (EXTEND-Tabelle + Vorlagen-Katalog + confirm-gated RPC + Audit-Trio + `can_access_classified`-Gate). **PROJ-13 `communication_outbox` ist KEIN Build-Anker**, sondern eine spätere **Sende-Brücke** (deferred, PROJ-Y-118a) — Governance/Planungs-Matrix ≠ Sende-Outbox (byte-genau die „meeting ≠ message"-Lehre; Out-of-scope „kein Versand" macht ein Überladen der Outbox aktiv falsch). Kein neuer npm-Dep, 1 Migration.

### Grundidee in einem Satz

Die **Kommunikationsmatrix** ist eine projektbezogene Liste geplanter M&A-Kommunikationen (Zielgruppe/Botschaft/Kanal/Termin/Verantwortlicher/Freigeber/Vertraulichkeit); jeder Eintrag durchläuft eine **Ein-Freigeber-Bestätigung** (Verantwortlicher erstellt → Freigeber bestätigt, SoD-hart), und „versandbereit/versendet" ist strukturell nur nach Freigabe erreichbar — kein echter Versand.

### A) Komponenten-Struktur

```
M&A-Projektraum → neuer Nav-Eintrag "Kommunikation" (requiresProjectType 'ma')
+-- Matrix-Liste (Einträge, filterbar nach Zielgruppe/Status/Phase/Gate/Vertraulichkeit)
    +-- Eintrag anlegen/bearbeiten (Zielgruppe, Botschaft, Kanal, geplant/erfolgt-Datum,
    |     Verantwortlicher, Freigeber, Vertraulichkeit, Links Phase/Gate/Aufgabe, Vorlage)
    +-- Freigabe-Panel (Einreichen → Freigeber bestätigt/lehnt ab; SoD; Status-Badge)
    +-- Sicht "Signing/Closing" (FE-Filter auf Signing/Closing-Phasen/Gates — AC4)
+-- Stammdaten/Projektraum: "Kommunikationsvorlagen" (seed 4 Standard + Anlegen aus Vorlage)
```

### B) Datenmodell in Klartext (2 neue Tabellen, `tenant_id NOT NULL`, EXTEND-Rezept)

1. **`communication_matrix_entries`** (project-scoped): `target_group_key` (Text, App-Konstantenliste 9 Werte, KEIN DB-Enum — Enum-Erweiterung ist teuer, vgl. PROJ-139; `custom` + `target_group_label` für Freitext), `message` (Text), `channel` (Text), `planned_date`/`actual_date` (nullable), `responsible_user_id`, `approver_user_id`, `approval_status` (`draft · pending_approval · approved · sent · rejected`), `approved_at`, `rejection_reason`, `confidentiality_level` (PROJ-100a, Default `standard`), `template_id` (nullable FK), Links `phase_id`/`stage_gate_id`/`work_item_id` (alle nullable FK, ON DELETE SET NULL). Need-to-know via 2 SELECT-Policies (permissive `is_project_member` + RESTRICTIVE `can_access_classified`). **Kein Floor-Trigger** — Eintrag hängt direkt am Projekt (nicht an höher klassifiziertem Eltern-Objekt, anders als PROJ-117-Meeting-an-Committee). Freigabe-Fakten als **echte Spalten** (audit-getrackt) statt Events-Tabelle.
2. **`communication_templates`** (tenant-scoped, mirror `committee_templates`): `template_key`/`name`/`default_target_group_key`/`default_channel`/`default_confidentiality`/`body_skeleton`; lazy-seed 4 Standard (Mitarbeiterinfo, Kundeninfo, Pressemitteilung, Behördenmeldung); copy-on-create.

### C) Freigabe-Workflow (AC3) — confirm-gated, kein Quorum

Status-Enum + Writes RPC-only (SECURITY DEFINER, `auth.uid()`-only, anon-revoked):
- `create/update/delete_communication_entry` — Autorität admin OR project-lead + `can_access_classified`.
- `submit_communication_entry` — `draft`/`rejected` → `pending_approval`.
- `respond_communication_approval(entry, approved bool, reason)` — **SoD hart**: Aufrufer = benannter `approver_user_id` UND `approver_user_id <> responsible_user_id`; setzt `approved`(+`approved_at`) oder `rejected`(+`rejection_reason`).
- `mark_communication_sent` — nur aus `approved` → `sent` (dokumentarisch; interner Setter, `sent` nie per Direkt-Weg). Kein echter Versand (Out-of-scope).

„Protokolliert (L3)" = Freigabe-Spalten in `_tracked_audit_columns` → PROJ-10-Audit ohne Zusatztabelle.

### D) Fork-Verdikte (CIA)

| Fork | Verdikt |
|---|---|
| 1 Matrix-Anker | **GO** — neue `communication_matrix_entries`; Outbox (PROJ-13) NICHT überladen |
| 2 Freigabe-Engine | **GO (a) confirm-gated** — Status-Enum + 2 RPCs + SoD, keine Events-Tabelle, kein PROJ-105-Klon |
| 3 Links | **GO** — per-Paar nullable FK phase/stage_gate/work_item (ON DELETE SET NULL); gitnexus_impact auf work_items |
| 4 Zielgruppe | **ADJUST** — `target_group_key` Text + App-Konstanten (9) + `custom`/`label`, kein DB-Enum |
| 5 Vorlagen | **GO** — `communication_templates` lazy-seed 4 (mirror committee_templates) |
| 6 Signing/Closing | **GO** — reine FE-Filter-Sicht, kein Backend-Objekt |
| 7 Vertraulichkeit | **GO ohne Floor** — Default `standard`, frei bis eigene Clearance; FE-Hinweis wenn verknüpftes Objekt höher klassifiziert; optionaler Floor → PROJ-Y-118c |
| 8 „versendet" | **GO** — dokumentarischer `actual_date` + `sent`-Status, kein Versand |

### E) Pflicht-Hardening-ACs

- **H1 Tenant-Isolation** — beide Tabellen `tenant_id NOT NULL`; Cross-Tenant-Smoke 0 Zeilen.
- **H2 Need-to-know-Pentest** — nicht-cleared Member sieht `standard` nicht `strict`; nach Clearance kippt; Aggregat-Leak-Probe.
- **H3 Audit-entity_type-CHECK in DERSELBEN Migration** + `_tracked_audit_columns` (inkl. Freigabe-Spalten) + `can_read_audit_entry`-Zweig + **authenticated-Grant re-granted** (PROJ-114-Lektion, aus LIVE-Defs neu bauen).
- **H4 Impersonationssichere RPCs** — kein actor-Param, `auth.uid()`-only, anon revoked, Autorität admin/lead bzw. Freigeber-Identität.
- **H5 SoD-Test** — Ersteller kann eigenen Eintrag nicht freigeben; nur benannter Freigeber; `sent` nie ohne `approved`.
- **H6 Pflicht-Live-RPC-Smoke** gegen Prod (rollback, 0 Residue): submit → approve durch Zweit-User → sent; SoD-Block; Need-to-know hide→grant; cross-tenant; Vorlagen seed+apply; Audit. `extensions.moddatetime` schema-qualifiziert.

### F) Abhängigkeiten

- **Live:** PROJ-100a (can_access_classified), PROJ-10 (Audit), PROJ-8 (Verantwortlicher/Freigeber = User), PROJ-19/95 (phases), PROJ-110 (ma_stage_gates), PROJ-101 (work_items), PROJ-117 (Muster + committee_templates-Vorlage).
- **Neue npm-Pakete:** keine.

### G) Deferrals (PROJ-Y-Kandidaten)

- **PROJ-Y-118a** — echter Versand über PROJ-13-Outbox-Brücke (approved Eintrag → outbox-Zeile), Pilot-getrieben.
- **PROJ-Y-118b** — Kapitalmarktrecht/Ad-hoc-Pflichten (Legal-Klärung, kein MVP).
- **PROJ-Y-118c** — optionaler Confidentiality-Floor gegen verknüpfte Phase/Gate (falls Pilot Leak-Sorge meldet).
- **PROJ-Y-118d** — Presse-/Pressekontakt-Verwaltung (explizit out-of-scope).

### H) Handoff

1 Migration (2 Tabellen + per-Paar-FKs + Audit-Trio/CHECK in selber Migration + RPCs create/update/delete/submit/respond/mark_sent + Vorlagen seed/create/apply) → **`/backend`** mit Pflicht-Live-Smoke → **`/frontend`** (Kommunikations-Tab + Freigabe-Panel + Signing/Closing-Filter + Vorlagen-Katalog) → **`/qa`** (Need-to-know-Pentest + SoD + Playwright). ~3,5 PT.

---

## Implementation Notes

### Backend (2026-07-23) — Migration `20260721192418_proj118_communication_matrix` (in Prod seit /architecture)
2 Tabellen (`communication_matrix_entries` project-scoped + `communication_templates` tenant-scoped), Writes RPC-only (SECURITY DEFINER, `auth.uid()`-only, anon-revoked): `create/update/delete/submit/respond/mark_sent` + `seed/create`-Vorlagen. Confirm-gated Ein-Freigeber-Workflow mit **harter SoD** (`respond` verlangt caller=approver UND approver≠responsible), `sent` immutable, Need-to-know via 2 SELECT-Policies (permissive `is_project_member` + RESTRICTIVE `can_access_classified`, **kein Floor** — Eintrag hängt am Projekt). Audit-Trio (entity_type-CHECK + `_tracked_audit_columns` inkl. Freigabe-Spalten + `can_read_audit_entry`-Zweig + authenticated-Grant) in derselben Migration aus LIVE-Defs neu gebaut. `extensions.moddatetime` schema-qualifiziert.

**TS-API-Layer** (mirror committees): 7 Route-Dateien (`communication-entries` GET/POST + `[entryId]` PATCH/DELETE + `submit`/`respond`/`mark-sent`; `communication-templates` GET/POST + `seed`), `_schema.ts` (Zod), Client `src/lib/ma-project/communication-api.ts`, Typen `src/types/communication-matrix.ts` (9 Zielgruppen + `custom`). Error-Mapping 42501→403, P0002→404, 22023/23514/23503→422, 23505→409. Gates: lint 0, tsc 0 neu, Route-Tests 8/8, build clean, migration-naming 0 Errors.

**Pflicht-Live-RPC-Smoke** `tests/sql/PROJ-118-communication-matrix-pentest.sql` **A–I 9/9 PASS** gegen Prod (rolled back, 0 Residue): A create→draft · B submit · C SoD (Nicht-Freigeber + Freigeber==Verantwortlicher blockiert, H5) · D approve→sent + sent immutable · E Nicht-Manager create blockiert (H4) · F Need-to-know hide→grant (H2) · G Cross-Tenant-Isolation (H1) · H Templates seed(4)+idempotent(0)+create (AC5) · I Audit-Rows (H3/L3).

### Frontend (2026-07-24)
Nav-Section `MA_KOMMUNIKATION_SECTION` (requiresProjectType `ma`) in `method-templates/index.ts` nach `MA_GREMIEN_SECTION`. Route `(app)/projects/[id]/kommunikationsmatrix/page.tsx` + `communication-page.tsx` (Matrix-Tabelle, client-Filter Zielgruppe/Status/Phase/Vertraulichkeit + Signing/Closing-Chip, Freigabe-Sheet, Löschen) + `communication-entry-dialog.tsx` (RHF+Zod, Vorlage prefills client-seitig) + `communication-templates-dialog.tsx` (seed+create, canManage-gated). Gates: lint 0, tsc 0 neu, build clean (Route registriert). Playwright `tests/PROJ-118-communication-matrix.spec.ts` **11/11 chromium** (alle Routen + Seite auth-gated).

### AC-Abdeckung
AC1 Matrix erfassen + filtern ✅ · AC2 Links Phase/Gate/Aufgabe ✅ (per-Paar nullable FK) · AC3 Freigabe-Workflow mit SoD ✅ · AC4 Signing/Closing-Sicht ✅ · AC5 Vorlagen (4 Standard + custom) ✅. H1–H6 durch Live-Pentest bewiesen.

### Deviations
- **D-1 (Route-Slug):** Tech-Design nannte `tabPath: kommunikation` — dieser Slug + Label „Kommunikation" ist bereits von **PROJ-13** (Communication Center, Outbox/Chat, `requiresModule: communication`) belegt. Um PROJ-13 nicht zu clobbern, nutzt die M&A-Matrix Slug/Label **`kommunikationsmatrix` / „Kommunikationsmatrix"** (Nav-Konstante trägt Kommentar). Ein M&A-Projekt mit aktivem Communication-Modul zeigt dadurch beide Einträge unterscheidbar.
- **D-2 (AC4-Filter):** kein dediziertes Signing/Closing-Flag → Quick-Filter-Chip matcht Einträge, deren verknüpfte Phase/Stage-Gate im Namen `signing`/`closing` (case-insensitive) enthält. Dokumentiert im `signingClosingIds`-Memo.
- **D-3 (Approver-Gating):** Respond-Buttons rendern client-seitig nur für den benannten Freigeber; SoD + alle State-Guards werden serverseitig erzwungen (UI zeigt Fehler via Toast).
- **D-4 (Typen-Datei):** `src/types/communication.ts` gehört PROJ-13 → neue Typen in `src/types/communication-matrix.ts`.
- **Env:** Mobile-Safari-Playwright skipped (WebKit-Host-Libs fehlen, PROJ-67/F2).

### Deferrals (PROJ-Y-Kandidaten, aus Tech-Design)
PROJ-Y-118a echter Versand über PROJ-13-Outbox-Brücke · PROJ-Y-118b Kapitalmarktrecht/Ad-hoc · PROJ-Y-118c optionaler Confidentiality-Floor gegen verknüpftes Objekt · PROJ-Y-118d Pressekontakt-Verwaltung.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · H — Kommunikation, Gremien & Stakeholder_
