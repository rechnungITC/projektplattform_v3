---
id: PROJ-Y-96b
title: "M&A Template RACI-Zuordnungen"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Low
priority_source: "Should (MVP-nah, pilot-getrieben) — deferred aus PROJ-96-γ1 (PROJ-141-γ1 Bookkeeping)"
labels: ["ma-platform", "epic-a", "template-extension", "raci"]
dependencies: ["PROJ-96 (Templates-Backbone)", "PROJ-97 (RACI-Grundmodell)", "PROJ-104 (Deliverable-RACI-Unlock)"]
roles: ["Head of Corporate Development", "PMO-Lead", "Template-Admin"]
summary_for_jira: "[A3b] RACI-Zuordnungen in M&A-Projekt-Templates"
---

# PROJ-Y-96b: M&A Template RACI-Zuordnungen

## Status: Deployed
## Deployment Scope: full

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** QA 2026-08-06: **alle 8 AC ✅**, Live-Pentest 9/9 + Red-Team 6/6 gegen Prod, 0 Rückstände, 0 Critical/High. Der Deep-Editor bleibt ausdrücklich PROJ-Y-96d und ist kein Kriterium dieser Slice.

**Created:** 2026-08-04
**Origin:** Followup von PROJ-96 „Projekt-Templates für Standardphasen bereitstellen" MVP-Cut, festgelegt via PROJ-141-γ1 Bookkeeping 2026-07-31. Aufgaben-Templates (`ma_template_tasks`) wurden 2026-08-04 aus dem ursprünglichen Y-96b-Scope zu PROJ-Y-96e ausgegliedert, damit RACI unabhängig priorisierbar bleibt — Y-96b ist jetzt **nur der RACI-Teil** von PROJ-96.

> **V3 Core Reuse (CIA-Muster):** Klasse **EXTEND** · Andockpunkt: `ma_template_workstreams` + `ma_template_deliverables` (PROJ-96 Katalog-Kind-Tabellen) + `raci_assignments` (PROJ-97 RACI-Backbone). Kein neues Datenkonzept — RACI-Templates sind Katalog-Vorlagen für bestehende `raci_assignments`-Zuweisungen, per apply-Zeitpunkt kopiert.

> **Epic:** A — Projektgrundlagen & Phasenmodell
> **Priorität (Jira):** Low · **Quell-Priorität:** Should (pilot-getrieben)
> **Labels:** `ma-platform` · `epic-a` · `template-extension` · `raci`
> **Abhängigkeiten:** `PROJ-96` (Templates-Backbone) · `PROJ-97` (RACI-Grundmodell) · `PROJ-104` (Deliverable-RACI-Unlock)

## Dependencies

- **PROJ-96** — Templates-Backbone (`ma_project_templates` + `ma_template_workstreams` + `ma_template_deliverables` + `apply_ma_project_template`-RPC). Deployed als **MVP-Cut** (v2.26.0-PROJ-96).
- **PROJ-97** — RACI-Grundmodell (`raci_assignments`-Tabelle + `raci_target_type_check` + Rollen-Semantik). Deployed.
- **PROJ-104** — RACI-Unlock für Deliverables (`raci_target_type_check` erweitert um `deliverable` + `set_deliverable_raci`/`clear_deliverable_raci`-RPCs). Deployed.
- **PROJ-141-γ3** (Supplement) — `ma_project_profiles.source_template_*` Snapshot-Cols + updated `apply_ma_project_template`-RPC. Bereits in Prod. Optional für Y-96b (nicht blockierend) — Y-96b-Herkunfts-Stempel kann eigenständig auf `raci_assignments` gesetzt werden.

## User Stories

- **PMO-Lead:** *Als PMO-Lead möchte ich, dass beim Anwenden eines M&A-Projekt-Templates automatisch die vordefinierten RACI-Zuweisungen (R/A/C/I) auf die kopierten Workstreams und Deliverables gestempelt werden, damit ein neues Deal-Projekt nicht nur strukturell konsistent (Phasen/Workstreams/Deliverables), sondern auch verantwortungsseitig direkt einsatzbereit ist.*
- **Template-Admin (Tenant-Admin):** *Als Template-Admin möchte ich pro Template-Workstream und pro Template-Deliverable Rollen (`role_key`) mit ihrem RACI-Buchstaben hinterlegen können, damit jedes neu angelegte Projekt mit derselben Verantwortungs-Matrix startet, die bei anderen Projekten dieses Musters bewährt ist.*
- **Head of Corporate Development:** *Als Head of Corporate Development möchte ich im Admin-Katalog `/stammdaten/projekt-vorlagen` je Template read-only eine RACI-Matrix (Rolle × Target × R/A/C/I) sehen, damit ich vor der Wizard-Nutzung durch Deal-Leads validieren kann, dass Verantwortungen richtig verteilt sind.*
- **Deal Lead (indirekt):** *Als Deal Lead möchte ich nach der Wizard-Finalisierung im Projekt-Raum RACI-Zuweisungen sofort auf allen Workstreams/Deliverables sehen (aus dem Template gestempelt), damit ich nicht jede Rolle einzeln setzen muss.*

## Beschreibung / Kontext

**Warum:** PROJ-96 hat die strukturelle Ebene der M&A-Templates geliefert (Phasen + Workstreams + Deliverables), aber die **Verantwortungs-Ebene** (RACI) muss aktuell nach jedem Template-Apply manuell pro Objekt gesetzt werden. Deal-Leads bauen jedes Mal dasselbe Rollen-Muster nach — das widerspricht dem Template-Sinn.

**Was:** Eine neue Kind-Tabelle `ma_template_raci` erweitert das Template-Katalog-Muster um RACI-Zuweisungen. Beim Anwenden eines Templates werden diese Zuweisungen atomar zu `raci_assignments`-Rows kopiert (spiegelt exakt das Copy-Muster von PROJ-96 für Workstreams/Deliverables via `workstream_key → id`-Remap).

**Was NICHT:**
- Kein Deep-Editor-UI zum Anlegen/Ändern von RACI-Zeilen (bleibt `PROJ-Y-96d`).
- Keine Custom-Template-Autorschaft durch Project-Leads (bleibt `PROJ-Y-96d`).
- Keine echte Template-Versionierung mit `is_current` / Publish-RPC (bleibt `PROJ-Y-96c`).
- Keine Aufgaben-Templates (`ma_template_tasks`, bleibt `PROJ-Y-96e`).
- Keine Änderung am Wizard-UI — Apply passiert atomar am Wizard-Finalize.

**Reuse-Kette:**
- `ma_template_raci` wird analog zu `ma_template_workstreams` / `ma_template_deliverables` modelliert (Katalog-Kind-Tabelle mit `template_id`-FK, `target_type` + `target_key` als weiche Referenz auf die Sibling-Katalog-Tabellen).
- Bestehende `raci_assignments`-Tabelle (PROJ-97) ist die Sink — RACI-Templates schreiben nach dorthin beim Apply.
- Herkunfts-Stempel auf `raci_assignments`-Zeilen (2 additive Spalten `source_template_id` / `source_template_version`) spiegelt PROJ-96 Muster für Workstreams/Deliverables.
- `apply_ma_project_template`-RPC wird um einen dritten Copy-Block erweitert (nach Workstreams + Deliverables), der Template-RACI-Zeilen liest, `target_key` auf die frisch kopierten Workstream/Deliverable-IDs remapped, und `raci_assignments`-Rows atomar einträgt.

## Akzeptanzkriterien

### AC-Y96b.1 — Neue Katalog-Tabelle `ma_template_raci`

- [ ] Tabelle `ma_template_raci` existiert mit Spalten: `id uuid PK`, `template_id uuid NOT NULL FK ma_project_templates(id) ON DELETE CASCADE`, `target_type text CHECK IN ('workstream', 'deliverable')`, `target_key text NOT NULL`, `role_key text NOT NULL CHECK char_length ≤ 100`, `raci_letter text NOT NULL CHECK IN ('R','A','C','I')`, `sort_order int NOT NULL DEFAULT 0`, `created_at`/`updated_at`.
- [ ] `target_key` ist eine **weiche Referenz** (kein FK) auf `ma_template_workstreams.workstream_key` bzw. `ma_template_deliverables.deliverable_key` (kein FK, damit Template-Editing die Kette nicht cascadet — Delete-Semantik lebt in PROJ-Y-96d Deep-Editor). Die Existenz wird beim Apply weich geprüft (fehlt der target-key im gleichen Template → Warning, siehe AC-Y96b.4).
- [ ] Partieller Unique-Index auf `(template_id, target_type, target_key)` **WHERE raci_letter='A'` — verhindert Doppel-Accountable im Template-Katalog schon beim Anlegen (User-locked 2026-08-04: Template-side enforcement).
- [ ] Unique-Index auf `(template_id, target_type, target_key, role_key, raci_letter)` — verhindert exakte Duplikate im Template.
- [ ] Tabelle hat `tenant_id`-Constraint über den `template_id`-FK (Ableitung, keine eigene tenant_id-Spalte — spiegelt `ma_template_workstreams`-Muster).

### AC-Y96b.2 — RLS: nur Tenant-Admin darf schreiben, alle Tenant-Members dürfen lesen

- [ ] RLS-Policies analog zu `ma_template_workstreams` / `ma_template_deliverables`:
  - SELECT: `is_tenant_member(tenant_id)` (per JOIN auf `ma_project_templates.tenant_id`).
  - INSERT/UPDATE/DELETE: `is_tenant_admin(tenant_id)` (User-locked 2026-08-04: nicht Project-Lead — verfrüht ohne Deep-Editor).
- [ ] Anon-Rolle hat keine Rechte auf die Tabelle.
- [ ] Cross-Tenant-Zugriff wird strukturell verhindert (Pentest-Vektor: Fremd-Tenant-Admin sieht 0 Zeilen).

### AC-Y96b.3 — `apply_ma_project_template`-RPC kopiert RACI-Zuweisungen atomar

- [ ] Die deployte `apply_ma_project_template(project_id, template_id)`-RPC wird um einen dritten Copy-Block erweitert (nach Workstreams + Deliverables):
  1. Liest `ma_template_raci`-Zeilen für das Template.
  2. Für `target_type='workstream'`: remapped `target_key` auf die frisch kopierte `workstreams.id` via `workstream_key`-Join.
  3. Für `target_type='deliverable'`: remapped `target_key` auf die frisch kopierte `deliverables.id` via `deliverable_key`-Join.
  4. Schreibt `raci_assignments`-Zeilen mit `target_type` + `target_id` + `role_key` + `raci_letter` + `source_template_id` + `source_template_version` (Herkunfts-Stempel additiv, siehe AC-Y96b.5).
- [ ] Der Copy läuft **atomar in derselben SECURITY-DEFINER-Transaktion** wie der Workstream/Deliverable-Copy. Fehler in irgendeinem Schritt rollt den gesamten Apply zurück (mirror des bestehenden Verhaltens für die anderen Copy-Blocks).
- [ ] Return-Value der RPC wird um `raci_created: int` erweitert (Anzahl der geschriebenen `raci_assignments`-Zeilen).

### AC-Y96b.4 — Best-Effort Warnung bei unbekanntem role_key (User-locked 2026-08-04)

- [ ] Wenn ein Template-RACI-Eintrag einen `role_key` enthält, den der Tenant zum Apply-Zeitpunkt nicht in einem der Referenz-Speicher kennt (nicht als `role_rates.role_key`, nicht als `stakeholders.role_key`, nicht als `resources.role_key`), wird die Zeile **trotzdem gestempelt** (role_key ist per PROJ-24-Lock free-text).
- [ ] Die RPC gibt zusätzlich ein `warnings[]`-Array im Return-Value zurück, mit Einträgen der Form `{code: "raci_unknown_role_key", role_key: "…", target_type: "…", target_key: "…"}` für jeden solchen Fall.
- [ ] Wenn ein Template-RACI-Eintrag einen `target_key` referenziert, der im selben Template nicht als Workstream/Deliverable existiert (verwaister Katalog-Eintrag), wird die Zeile **NICHT gestempelt** und stattdessen ein `warnings[]`-Eintrag `{code: "raci_orphan_target", target_type: "…", target_key: "…"}` erzeugt.
- [ ] `warnings[]` bleibt ein optionales Response-Feld — bei leerer Liste wird es weggelassen (analog PROJ-141-γ2 finalize-warnings).

### AC-Y96b.5 — Herkunfts-Stempel auf `raci_assignments`

- [ ] `raci_assignments` bekommt zwei nullable additive Spalten: `source_template_id uuid` (mit FK auf `ma_project_templates(id) ON DELETE SET NULL`) und `source_template_version integer`.
- [ ] Bestehende Zeilen bleiben unangetastet (`NULL` für die Snapshot-Cols). Keine Migrations-Backfill nötig — Herkunfts-Stempel ist nur für neue Apply-Aufrufe relevant.
- [ ] Manuell erstellte / via `set_deliverable_raci` gesetzte RACI-Zeilen erhalten `source_template_id = NULL` (keine Template-Herkunft).

### AC-Y96b.6 — Admin-Katalog: Read-only RACI-Matrix je Template

- [ ] Die deployte Admin-Detail-Seite `/stammdaten/projekt-vorlagen` (siehe PROJ-96) wird um eine **read-only RACI-Matrix-Sektion** erweitert:
  - Tabelle mit Spalten: **Target** (Workstream/Deliverable-Label + Sub-Label mit `key`), **Rolle** (`role_key`), **R/A/C/I** (Badge oder Buchstabe).
  - Sortiert nach Target-Typ (Workstreams zuerst, dann Deliverables), dann nach `sort_order`.
  - Leerer Zustand: „Keine RACI-Zuweisungen im Template hinterlegt." (Templates ohne RACI-Rows dürfen weiter existieren.)
- [ ] Kein Edit-Button — reine Anzeige (Deep-Editor bleibt PROJ-Y-96d).
- [ ] Nav-Karte weiterhin `adminOnly` (spiegelt existierende `/stammdaten/projekt-vorlagen`-Sichtbarkeit).

### AC-Y96b.7 — Existierende Buy-Side-Default-Template bekommt RACI-Zuweisungen

- [ ] Die deployte `ensure_default_ma_project_templates`-Lazy-Seed-RPC (PROJ-96) wird angepasst, um beim erstmaligen Anlegen des Buy-Side-Standard-Templates **auch** ein Minimum an sinnvollen RACI-Zuweisungen zu stempeln (z.B. „Deal Lead = A auf allen Workstreams; PMO-Lead = R auf Workstreams; Sponsor = I auf allen Deliverables"). Die konkrete Rollen-Auswahl wird bei /architecture / /backend gemäß PROJ-97 Rollen-Katalog festgelegt.
- [ ] Bestehende Tenants mit bereits geseedetem Template werden **nicht rückwirkend** befüllt (idempotenter Seed schreibt nur wenn Template neu). Backfill = manuelle Admin-Aktion via PROJ-Y-96d.

### AC-Y96b.8 — Live-RPC-Smoke Pflicht

- [ ] Live-Pentest gegen Prod (DO-Block + Rollback-Marker, 0 Residue) verifiziert:
  - A) Fresh M&A-Projekt + Apply → `raci_assignments`-Rows entstehen mit Herkunfts-Stempel.
  - B) Doppel-Accountable im Template-Katalog → Insert schlägt fehl (partieller Unique-Index).
  - C) Apply mit unbekanntem `role_key` → Row wird gestempelt, `warnings[]` enthält `raci_unknown_role_key`.
  - D) Apply mit verwaistem `target_key` → Row wird NICHT gestempelt, `warnings[]` enthält `raci_orphan_target`.
  - E) Cross-Tenant-Isolation: Fremd-Tenant-Admin sieht 0 RACI-Template-Zeilen.
  - F) Non-Admin-Insert wird per RLS abgelehnt (42501).
- [ ] PROJ-96 Live-Pentest bleibt **verbatim grün** (Apply-RPC-Erweiterung ist additiv, kein Behavior-Change bei Templates ohne RACI-Rows).
- [ ] PROJ-97 Live-Pentest bleibt **verbatim grün** (`raci_assignments`-Contract inkl. exactly-one-Accountable-per-target unangetastet).

## Edge Cases

- **Template ohne RACI-Rows**: Apply funktioniert exakt wie heute (Copy-Block ist No-Op wenn keine `ma_template_raci`-Zeilen für das Template existieren). Kein Verhaltens-Change für PROJ-96 α-Tenants.
- **Template mit RACI-Row auf einem Workstream, der beim Apply schon von der `unique(project_id, workstream_key)`-Constraint blockiert wäre**: dieser Fall kann strukturell nicht auftreten, weil Apply die Workstreams **vor** dem RACI-Copy schreibt und der Workstream-Copy den `re-apply-block` schon greifen lässt (bestehendes PROJ-96-Verhalten).
- **Wiederholtes Apply desselben Templates auf denselben Projekt** (heute per PROJ-96 hard-blocked): unverändert — Y-96b ändert das Re-Apply-Verhalten nicht.
- **Manuelle RACI-Änderung nach Apply**: bestehende `raci_assignments`-Zeilen mit `source_template_id != NULL` bleiben editierbar (kein Immutability-Lock — der Herkunfts-Stempel ist rein informativ, spiegelt PROJ-96 Workstream/Deliverable-Verhalten). Änderungen lassen den `source_template_id`-Stempel stehen (semantisch: „ursprünglich aus Template X, manuell nachjustiert").
- **Template-Delete** (heute nicht durch UI möglich, aber via DB direkt): existierende `raci_assignments`-Zeilen bleiben erhalten, ihr `source_template_id` wird per `ON DELETE SET NULL`-FK auf `NULL` gesetzt. Provenance wird verwaist — akzeptiert (Template-Delete-UI ist PROJ-Y-96d).
- **RACI-Zeile mit `raci_letter='A'` auf Workstream + andere RACI-Zeile mit `raci_letter='A'` auf gleichem Workstream im gleichen Template**: durch partiellen Unique-Index blockiert (INSERT wirft 23505).
- **Konkurrenz zu manuellen RACI-Aufrufen** (`set_deliverable_raci`): funktioniert unabhängig — der RPC-Weg über PROJ-104 aktualisiert einzelne Zeilen ohne Template-Kontext, Y-96b stempelt einmalig beim Apply.

## Technische Anforderungen

- Kein neuer Dep (kein npm/pip/etc. — Migration + RPC-Extension nutzen Bestand).
- Migration muss PROJ-134-konform sein (minute-rastered Timestamp, idempotente DDL).
- CIA-Pflicht bei `/architecture` — Cross-Slice-Risk: Änderungen an `raci_assignments`-Schema (2 additive Cols + FK) berühren die deployten PROJ-97/104 RACI-Contracts. Muss dort keine Regression verursachen.
- gitnexus_impact-Pflicht auf `apply_ma_project_template` vor Migration-Recreate (deployter RPC mit deployter Test-Coverage aus PROJ-96 + PROJ-141-γ3-supplement).

## Deviations gegenüber übergeordneter Y-96b-Notiz

- **D-Y96b.1**: Y-96b umfasste laut PROJ-96-Header ursprünglich „RACI-Templates + Aufgaben-Templates". PROJ-141-γ1 hat Aufgaben-Templates ausgegliedert nach PROJ-Y-96e. Y-96b ist daher **nur der RACI-Teil** von Y-96b — Aufgaben-Templates verbleiben in Y-96e als eigene zukünftige Slice.
- **D-Y96b.2**: Y-96b implizierte „RACI-Templates + phase-verankerte Deliverables" (Text im PROJ-96 Header). Phase-verankerte Deliverables sind heute schon möglich (Deliverables tragen `phase_id`); die Erweiterung „Templates deklarieren welche Deliverables in welcher Phase erscheinen" bleibt Teil von PROJ-Y-96d (Deep-Editor) — außerhalb von Y-96b.

## Out of Scope

- Deep-Editor-UI für Template-RACI-Zeilen — bleibt **PROJ-Y-96d**.
- Immutable Versionshistorie für Templates mit `is_current` + Publish-RPC — bleibt **PROJ-Y-96c**.
- Custom-Template-Autorschaft durch Project-Leads — bleibt **PROJ-Y-96d**.
- Aufgaben-Templates (`ma_template_tasks`) — bleibt **PROJ-Y-96e**.
- Automatische Rollen-Zuordnung zu konkreten Personen (Template stempelt `role_key`, nicht `user_id`) — Personen-Zuweisung passiert nach Apply manuell oder via PROJ-97-Flows.
- RACI-Templates für andere M&A-Objekte (dd_streams, dd_findings, Deliverables aus PROJ-104 direkt bei Anlage außerhalb von Apply) — nicht in dieser Slice.

## V2 Reference Material

Nicht anwendbar — reine V3-Erweiterung des V3-nativen Template-Musters.

---

## Tech Design (Solution Architect) — 2026-08-06

> **Klasse:** EXTEND · **CIA-reviewed** (2 Hard-Blocker gehoben + 2 User-Locks Fork A/B). Andockpunkt: `ma_project_templates` + Kind-Muster (PROJ-96) + `raci_assignments` (PROJ-97b + PROJ-104-Unlock). Kein neuer Dependency, keine neue Tenant-Rolle.

### Kernentscheidungen (CIA-gelockt)

**1. Ein RACI-Template ist eine echte Kind-Tabelle im Template-Katalog — kein JSON und keine Vererbung.**
Analog zu `ma_template_workstreams` / `ma_template_deliverables` bekommt der Template-Katalog eine dritte Kind-Tabelle `ma_template_raci`. Sie hält je Zeile: Ziel-Typ (Workstream oder Deliverable), Ziel-Schlüssel (weiche Referenz auf den Sibling-Katalog), Rollen-Schlüssel (Free-Text per PROJ-24-Lock, max 100 Zeichen), RACI-Buchstabe (R/A/C/I), Reihenfolge. Zugriff: **lesen** = jedes Tenant-Mitglied, **pflegen** = Tenant-Admin — mirror des existierenden Template-Katalog-Musters. Kein Audit-Trigger (Präzedenz: PROJ-96 folgt `dd_stream_templates` — Templates sind Tenant-Config, keine Business-Historie). Zwei Duplikat-Schutz-Indizes: exakter Volltreffer + „genau ein Accountable pro (Template, Ziel-Typ, Ziel-Schlüssel)" (Template-seitige Härtung analog Live-`raci_one_accountable`).

**2. Contract-Widening auf `raci_assignments` — Ziel-Typ + Provenance in derselben Migration (Hard-Blocker 1 gehoben).**
Die aktuelle PROJ-97b/PROJ-104-Constraint `raci_target_type_check` erlaubt nur `('work_item','deliverable')`. Für Y-96b muss zusätzlich `'workstream'` zulässig sein — sonst schlagen alle Workstream-RACI-Copies mit 23514 fehl. Die Widening erfolgt idempotent (drop-if-exists + recreate) in derselben Migration wie die Y-96b-Kind-Tabelle. `raci_assignments` bekommt zusätzlich zwei additive nullable Provenance-Spalten (`source_template_id` mit FK auf `ma_project_templates(id)` **ON DELETE RESTRICT** — γ3-konsistent, User-Lock Fork A/A1 — und `source_template_version int`). Bestehende Zeilen bleiben `NULL`, kein Backfill. Manuelle RACI-Zuweisungen (`set_work_item_raci` / `set_deliverable_raci`) bleiben unberührt — ihre expliziten Insert-Column-Listen berühren die Provenance-Spalten nicht. RESTRICT bedeutet: ein Template mit lebender RACI-Provenance ist nicht löschbar — Identitätsschutz analog Workstreams/Deliverables. Der Live-`raci_one_accountable`-Index gilt unverändert weiter — Y-96b **härtet zusätzlich Template-seitig**, ohne den Live-Contract zu schwächen.

**3. `deliverable_key` in `ma_template_deliverables` nachziehen — stabiler Ziel-Schlüssel (Hard-Blocker 2 gehoben, PROJ-96-Katalog-Erweiterung).**
Y-96b referenziert Deliverables per weichem Ziel-Schlüssel. `ma_template_deliverables` hat heute nur `name` (frei umbenennbar) + `workstream_key` — keinen eigenen stabilen Schlüssel. Ohne stabilen Schlüssel würde eine Umbenennung im Deep-Editor (Y-96d) alle Y-96b-Zuweisungen verwaisen lassen; die Orphan-Prüfung wäre auf Namen angewiesen. Fix in derselben Migration: additiv `deliverable_key text` auf `ma_template_deliverables`, gemeinsam `unique (template_id, deliverable_key)`. Der Prod-Bestand ist 1 Zeile pro geseedetem Buy-Side-Default × maximal 9 Deliverables — Backfill in drei Schritten in derselben Migration (Spalte nullable anlegen → deterministisch aus Namen ableiten für die bestehenden Buy-Side-Rows → `NOT NULL` + Format-CHECK aktivieren). `ensure_default_ma_project_templates` wird gleichzeitig aktualisiert, damit Erstseeds künftig den Schlüssel direkt schreiben (kein doppelter Weg). AC-Y96b.3-Remapping und AC-Y96b.4-Orphan-Prüfung stützen sich auf diesen Schlüssel — kein Namens-Vergleich.

**4. „Template anwenden" wird um einen fünften atomaren Copy-Block erweitert — mit Warnungen statt Blockaden.**
Der deployte `apply_ma_project_template`-Vorgang läuft heute in vier logischen Schritten (Autorität-Check → Phasen aktivieren → Workstreams kopieren → Deliverables kopieren). Y-96b fügt einen fünften Schritt an: **RACI-Zuweisungen kopieren** — nach den beiden anderen Copies, weil er sowohl frisch kopierte Workstream-IDs als auch Deliverable-IDs braucht. Kein Verhaltens-Change bei Templates ohne Y-96b-Zeilen (No-op-Block). Der neue Schritt läuft in derselben SECURITY-DEFINER-Transaktion wie die anderen Copies — Fehler in einem der Schritte rollt alles zurück. **Warnungen (nicht Fehler)** entstehen in zwei Fällen:
- (a) `role_key` ist im Tenant nicht bekannt → tenant-scoped Union-Prüfung über `role_rates.role_key` + `stakeholders.role_key` + `resources.role_key` (ANY-1 reicht als „bekannt"). Die Zeile wird trotzdem gestempelt (PROJ-24-Free-Text-Lock respektiert), Warnung `raci_unknown_role_key`.
- (b) `target_key` existiert im selben Template nicht als Workstream/Deliverable (verwaister Katalog-Eintrag) → die Zeile wird **nicht** gestempelt, Warnung `raci_orphan_target`.
Warnungen sind strukturierte Objekte im Rückgabewert (kein Freitext), leere Liste wird weggelassen — analog PROJ-141-γ2 finalize-warnings. `created_by` auf `raci_assignments` bekommt den apply-Aufrufer (`auth.uid()`) — kein Impersonation-Vektor, weil der äußere Autorität-Check (`is_tenant_admin OR is_project_lead`) unverändert am Kopf sitzt.

**5. Buy-Side-Default-Seed befüllt beim allerersten Anlegen kanonische M&A-RACI-Zuweisungen (User-Lock Fork B/B1).**
`ensure_default_ma_project_templates` schreibt beim erstmaligen Anlegen des Buy-Side-Templates zusätzlich zu Workstreams + Deliverables auch RACI-Zeilen: `deal_lead` = A auf allen Workstreams, `pmo_lead` = R auf allen Workstreams, `sponsor` = I auf allen Deliverables. Die Rollen-Schlüssel sind free-text; sie werden nicht automatisch als `role_rates` / `stakeholders` / `resources` angelegt. Beim ersten Apply erzeugt jede dieser Zeilen eine `raci_unknown_role_key`-Warnung — bewusst so gewählt, damit Deal-Leads sofort sehen, welche Rollen im Tenant nachzupflegen sind (actionable Hinweis, kein Fehler). Idempotenz bleibt: der Seed schreibt nur beim allerersten Anlegen; existierende Prod-Tenants mit bereits geseedetem Template werden **nicht** rückwirkend befüllt (Backfill = manuelle Admin-Aktion via PROJ-Y-96d).

### Ablauf / Andockpunkt

```
Template-Katalog (Tenant-Config, admin-gated)
+-- ma_project_templates
+-- ma_template_workstreams (bestehend)
+-- ma_template_deliverables (bestehend, jetzt mit deliverable_key)
+-- ma_template_raci  [NEU]  (target_type in {workstream, deliverable})

Wizard-Finalize (M&A-Projekt)
+-- ... existierende Schritte ...
+-- Template-Auswahl (bestehend)
        |
        v  (bei Finalize, unchanged trigger)
   "Template anwenden"
   +-- Phasen aktivieren (PROJ-95, unverändert)
   +-- Workstreams kopieren (unverändert)
   +-- Deliverables kopieren (jetzt via deliverable_key remapping)
   +-- RACI-Zuweisungen kopieren  [NEU]
       |  fehlender role_key -> Warnung, Row gestempelt
       |  verwaister target_key -> Warnung, Row uebersprungen
       v
   Rueckgabe: template_id, template_version, phase_model,
              workstreams_created, deliverables_created,
              raci_created  [NEU],
              warnings[]    [NEU, wenn nicht leer]

Admin-Katalog /stammdaten/projekt-vorlagen (bestehend)
+-- pro Template read-only:
    +-- Workstream-Vorschau (bestehend)
    +-- Deliverable-Vorschau (bestehend)
    +-- RACI-Matrix-Sektion  [NEU]  (Target x Rolle x R/A/C/I)
```

### Impact-Analyse: `apply_ma_project_template`

Der Vorgang wird von genau **drei realen Aufrufern** in der TypeScript-Schicht angesteuert (gitnexus indexiert Postgres-RPCs nicht als Symbole; grep-basierte Blast-Radius-Prüfung 2026-08-06):

- `src/app/api/wizard-drafts/[id]/finalize/route.ts:253` — Best-Effort-Aufruf am Wizard-Finalize, seit PROJ-141-γ2 mit sichtbarer `warnings`-Kette an den Aufrufer. Y-96b erweitert die vorhandene Kette additiv um die neuen RPC-Warnungen (kein Struktur-Bruch — `warnings` ist bereits ein Array `{code, message}`; Y-96b-Warnungen tragen zusätzlich `target_type` / `target_key` / `role_key`, die im Wizard-Toast serialisiert werden).
- `src/app/api/projects/[id]/apply-template/route.ts:53` — Admin-triggered Apply nach Projektanlage. Die Route reicht heute `data` unverändert an den Client durch; Y-96b behält das Verhalten — die neuen Felder `raci_created` + `warnings[]` reisen automatisch in der HTTP-201-Payload mit.
- `src/lib/ma-project/templates-api.ts` — Client-Wrapper `applyMaProjectTemplate`. `ApplyTemplateResult` bekommt zwei additive Felder: `raci_created: number` (Pflicht) und `warnings?: {code, target_type?, target_key?, role_key?}[]` (optional). Keine Breaking-Change — alle neuen Felder additiv/optional.

Kein weiterer Aufrufer im `src/`-Baum. Kein RPC ruft `apply_ma_project_template` aus der DB heraus auf (SECURITY-DEFINER-Aufruf nur von Route-Layer). Der Vorgang bleibt strukturell einzeln-atomar und einmal-pro-Projekt (Re-Apply-Block unverändert).

**Test-Coverage-Impact:** `wizard-drafts/[id]/finalize/route.test.ts` (PROJ-141-γ2 Finalize-Regression, aktuell 28/28) und `projects/[id]/apply-template/route.test.ts` (PROJ-96-Route-Unit, aktuell 12/12) müssen um Fälle für `raci_created` + `warnings`-Durchreichung erweitert werden. Kein Struktur-Rebuild.

### Datenmodell (Klartext)

```
Template-RACI (ma_template_raci)  [NEU]
- Gehoert zu einem Template (FK CASCADE)
- Ziel-Typ: Workstream oder Deliverable
- Ziel-Schluessel: weiche Referenz auf den Sibling-Katalog
  (workstream_key oder deliverable_key im selben Template)
- Rollen-Schluessel: Free-Text (max 100 Zeichen)
- RACI-Buchstabe: R, A, C oder I
- Reihenfolge
- tenant_id ueber template_id-Join abgeleitet (kein Duplikat)
- Zwei Unique-Indizes:
  - exakter Volltreffer (Template, Ziel-Typ, Ziel-Schluessel, Rollen-Schluessel, RACI-Buchstabe)
  - genau EIN Accountable pro Ziel (partial WHERE raci_letter = 'A')

Live-RACI (raci_assignments, PROJ-97b, jetzt erweitert)
- target_type: erweitert um 'workstream'                            [Widening]
- source_template_id, source_template_version                       [additiv nullable]
- FK ON DELETE RESTRICT auf ma_project_templates                    [gamma3-konsistent]

Template-Deliverable (ma_template_deliverables, PROJ-96, jetzt ergaenzt)
- deliverable_key: stabiler Referenz-Schluessel                     [additiv, NOT NULL nach Backfill]
- unique (template_id, deliverable_key)                             [additiv]
```

### Verbindliche Hardening-Auflagen (CIA, für /backend)

1. **Contract-Widening in derselben Migration wie die neue Kind-Tabelle**: `raci_target_type_check` idempotent drop-and-recreate mit dem erweiterten Enum-Set. Kein „Migration-später-nachziehen"-Pfad — sonst gibt es einen Zeitraum, in dem `ma_template_raci` existiert, aber Y-96b-Workstream-Copies live scheitern.
2. **`ma_template_deliverables.deliverable_key`-Backfill in derselben Migration** (nullable anlegen → deterministisch aus Namen ableiten für die bestehenden Buy-Side-Zeilen → `NOT NULL` + Format-CHECK aktivieren). `ensure_default_ma_project_templates` in derselben Migration mit-updaten, damit Zukunfts-Seeds den Schlüssel direkt schreiben.
3. **Provenance-FK auf `raci_assignments` = `ON DELETE RESTRICT`** (User-Lock Fork A1, γ3-konsistent). Kein `SET NULL` — Identitätsschutz analog Workstreams/Deliverables. AC-Y96b.5-Edge-Case „Template-Delete verwaist Provenance" entfällt strukturell.
4. **Kein Audit-Trigger auf `ma_template_raci`** (PROJ-96-Präzedenz, `dd_stream_templates`-Muster — Templates sind Tenant-Config). `_tracked_audit_columns['raci_assignments']` bleibt unverändert bei `['role_key','raci_letter']` — Provenance-Spalten sind append-only Stamps, keine editierbaren Business-Felder. **Kein `can_read_audit_entry`-Recreate**, kein Grant-Drop-Risiko (vermeidet den in PROJ-114-H-1 dokumentierten Cross-cutting-Bruch).
5. **Pflicht-Live-RPC-Smoke gegen Prod** (DO-Block + Rollback-Marker, 0 Residue), alle 6 Vektoren aus AC-Y96b.8 plus:
   - **A** Fresh M&A-Projekt + Apply → RACI-Rows entstehen mit Provenance-Stempel; `raci_created`-Zähler stimmt; `target_type='workstream'`-Row akzeptiert.
   - **B** Doppel-Accountable im Template → 23505 (Template-side partial unique).
   - **C** Unbekannter `role_key` → Row gestempelt, `warnings[]` enthält `raci_unknown_role_key` mit vollem Ziel-Kontext.
   - **D** Verwaister `target_key` → Row **nicht** gestempelt, `warnings[]` enthält `raci_orphan_target`.
   - **E** Cross-Tenant-Isolation: Fremd-Tenant-Admin sieht 0 `ma_template_raci`-Zeilen.
   - **F** Non-Admin-Insert auf `ma_template_raci` → 42501 (RLS).
   - **G** Template-Delete mit lebender RACI-Provenance → 23503 (RESTRICT — beweist Fork A1). Neuer Positivkontroll-Vektor über die reine Y-96b-Spec-AC hinaus.
   - **H** Template ohne Y-96b-Zeilen: Apply-RPC ist byte-identisch — PROJ-96-Live-Pentest bleibt verbatim grün.
   - **I** `set_work_item_raci` / `set_deliverable_raci` (PROJ-97b + PROJ-104) — deren Pentests bleiben verbatim grün nach Contract-Widening.
6. **`pg_get_functiondef`-Snapshot der Live-`apply_ma_project_template` vor Migration-Recreate** (feedback_rpc_body_patch_pattern). Neuer Body wird per `create or replace function` als Volltext geschrieben — Anchor-Replace ist bei RPCs dieser Größe fehleranfällig. Snapshot dokumentiert den Ausgangszustand für Rollback.
7. **Migration-Naming PROJ-134**: Repo-Dateiname == prod-registrierte Version (minute-rastered, idempotent). `extensions.moddatetime` schema-qualifiziert. `npm run check:migration-naming` grün vor Commit. Prä-Migration `apply_migration`-Aufruf mit `name` = Repo-Dateiname (keine Auto-Timestamps).
8. **Kein neuer Dependency**, keine neue Tenant-Rolle. `ma_template_raci` bleibt admin-gated (mirror PROJ-96-Catalog-Tabellen). Deep-Editor + Custom-Authorship explizit out-of-scope (→ PROJ-Y-96d).
9. **`ApplyTemplateResult`-Erweiterung + Route-Serialisierung additiv**: keine Breaking-Change. Wizard-Toast-Kaskade (γ2-Muster) fängt Warnungen automatisch; Admin-Apply-Route reicht `warnings` explizit im HTTP-201-Body durch (heute wird `data` unverändert zurückgegeben — Y-96b kann das beibehalten). Vitest-Fixtures für 3 Route-Test-Files aktualisieren.

### MVP-Scope-Schnitt (CIA)

**IN:** Neue Kind-Tabelle `ma_template_raci` · Contract-Widening `raci_target_type_check` + 2 Provenance-Spalten auf `raci_assignments` (RESTRICT) · `deliverable_key` in `ma_template_deliverables` · atomarer 5. Copy-Block im apply-RPC · Warnungen `role_key` / `target_key` · Buy-Side-Default-RACI-Seed (kanonische Rollen `deal_lead` / `pmo_lead` / `sponsor`) · read-only RACI-Matrix im Admin-Katalog `/stammdaten/projekt-vorlagen`.

**DEFER → PROJ-Y:**
- **PROJ-Y-96d** — Tiefer Template-Editor (CRUD für RACI-Zeilen, Reorder, Feld-Ebene) + Custom-Template-Autorschaft + `set_workstream_raci` / `clear_workstream_raci`-RPCs für manuellen Post-Apply-Edit auf Workstream-Targets.
- **PROJ-Y-96c** — Echte Versionshistorie (`is_current`, Publish-RPC, automatischer Version-Bump-Trigger bei Kind-Edit).
- **PROJ-Y-96e** — Aufgaben-Templates (`ma_template_tasks`) — parallele Slice, unabhängig von Y-96b.
- Backfill von RACI-Zeilen für Tenants mit bereits geseedetem Buy-Side-Template — manuelle Admin-Aktion via 96d.

### Dependencies (Packages)

Keine. Reine EXTEND auf bestehendem Stack + deployten Bausteinen (PROJ-96 / 97b / 104 / 141-γ3).

---

## Implementation Notes — /backend (2026-08-06)

**Migrations in Prod:**
- `20260806093200_proj_y96b_ma_template_raci` — Hauptmigration. Section 1 backfillt `ma_template_deliverables.deliverable_key` deterministisch aus `name` (Buy-Side-Default: 9 stabile Keys), setzt NOT NULL + Format-CHECK + unique(template_id, deliverable_key). Section 2 erweitert `raci_target_type_check` idempotent auf `('work_item','deliverable','workstream')`. Section 3 fügt `raci_assignments.source_template_id` (FK ON DELETE RESTRICT — Fork A1) + `source_template_version` additiv nullable. Section 4 legt `ma_template_raci` an (mit 2 Unique-Indizes + 4 RLS-Policies + moddatetime-Trigger; kein Audit-Trigger — dd_stream_templates-Präzedenz). Section 5 aktualisiert `ensure_default_ma_project_templates` (schreibt `deliverable_key`s + 23 RACI-Seed-Zeilen für neu-anzulegende Templates; existierende Buy-Side-Seeds in Prod bleiben unangetastet, siehe AC-Y96b.7). Section 6 erweitert `apply_ma_project_template` um den 5. Copy-Block: known-role-Universe (Union über `role_rates` + `stakeholders`), Loop über `ma_template_raci` mit Target-Remapping + Warnungs-Kollektion für unknown-role/orphan-target, INSERT in `raci_assignments` mit Provenance-Stempel. Return-Value bekommt `raci_created` + optional `warnings[]`.
- `20260806094200_proj_y96b_hotfix_known_roles_union` — Hotfix. Die Union in Section 6 referenzierte ursprünglich auch `public.resources.role_key`, aber die Prod-`resources`-Tabelle trägt die Spalte gar nicht (das PROJ-24-Audit-Whitelist-Array führt sie historisch — der Live-Schema hat sie beim Resource-Rework entfernt). Ergebnis: jede RACI-Copy warf `column "role_key" does not exist`. Fix: RPC per `create or replace` neu geschrieben, `resources` aus der Union entfernt. Base-Migration + Hotfix-Migration liegen im Repo synchron, damit `db push` auf einer frischen Shadow-DB dasselbe finale RPC-Body sieht.

**API + FE:**
- `src/lib/ma-project/templates-api.ts` — `ApplyTemplateResult` um `raci_created: number` + optional `warnings?: ApplyTemplateWarning[]` erweitert; neue Types `ApplyTemplateWarningCode` + `ApplyTemplateWarning`. Additiv, keine Breaking-Change.
- `src/app/api/projects/[id]/apply-template/route.ts` — unverändert (gibt `data` bereits verbatim zurück; neue Felder reisen automatisch mit).
- `src/app/api/wizard-drafts/[id]/finalize/route.ts` — Y-96b Warnungen werden **server-seitig aggregiert** (Gruppierung nach `(code, role_key)`; Buy-Side-Default mit 23 unbekannten-Rolle-Zeilen erzeugt 3 saubere Toast-Einträge statt 23). Zusätzlich fließt das rohe `template_result` (mit `raci_created` + kompletter `warnings[]`) unter dem eigenen 201-Payload-Feld mit — für spätere FE-Drilldown.

**Route-Unit-Tests:**
- `apply-template/route.test.ts` — +2 Cases: (i) `raci_created` durchgereicht, (ii) `warnings[]` verbatim durchgereicht.
- `wizard-drafts/[id]/finalize/route.test.ts` — +3 Cases: (i) `template_result` in 201 auf Success, (ii) Aggregation 17 raw → 3 top-level (deal_lead-unknown + sponsor-unknown + deal_lead-orphan), (iii) `template_result` null auf Fehler (γ2-Regression).

**Pflicht-Live-RPC-Smoke (`tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql`):**
- **9/9 Vektoren PASS gegen Prod, 0 Residue** (RAISE-Rollback-Muster, transaktions-scoped; enforce_admin_invariant respektiert durch Vorab-Admin-Insert für v_other_tenant). Vektoren A/B/C/D/G/H/I laufen als service_role (SECURITY-DEFINER-RPCs mit eigenem `auth.uid()`-Gate); Vektoren E + F wechseln inline zu `set local role authenticated`, damit RLS greift. **Kritisch:** Vektor G weist Fork-A1-RESTRICT-Verhalten explizit nach — `delete from ma_project_templates where id = <mit-gelaufener-Provenance>` → 23503.

**Gates:** vitest 2595/2595 · lint 0 · tsc 12 baseline/0 neu · migration-naming 0 errors/82 warnings (Baseline) · Supabase-Advisors 0 ERROR/111 WARN (Baseline; keine neuen findings — `authenticated_security_definer_function_executable` ist der Standard-INFO-Guide, gilt schon für PROJ-96s beide RPCs) · Next.js build clean (alle Routen registriert).

**Deviations gegenüber Tech Design:**
- **D-Y96b.impl.1** — Union der bekannten role_keys enthält nur `role_rates` + `stakeholders`, nicht `resources` (dessen `role_key`-Spalte ist im Live-Schema nicht vorhanden, obwohl das PROJ-24-Audit-Whitelist-Array sie historisch listet). Die im Tech Design genannte 3-Quellen-Union wurde beim ersten Live-Smoke als kaputt entlarvt und via Hotfix-Migration auf 2 Quellen reduziert. Auswirkung: keine, da `resources.role_key` in der Realität kein role_key-Katalog ist. Base-Migration und Hotfix im Repo synchron; auf einer frischen Shadow-DB endet der Zustand identisch mit Prod.
- **D-Y96b.impl.2** — Finalize-Route aggregiert die per-Row-RACI-Warnungen serverseitig auf `(code, role_key)`-Gruppen mit Zähler-Message (statt 1:1-Weitergabe) — verhindert Toast-Spam beim Buy-Side-Default-Erstlauf. Raw list bleibt unter `template_result.warnings` verfügbar für spätere FE-Drilldown.

**Offen (→ /qa + FE-Slice):**
- AC-Y96b.6 read-only RACI-Matrix im Admin-Katalog `/stammdaten/projekt-vorlagen` — FE-Arbeit, nicht Teil dieser Backend-Slice.
- Live-E2E-Wizard-mit-RACI-Template (voll-eingeloggter Auth-Fixture-Pfad) — Playwright-Ausbau in /qa.
- Playwright Auth-Gate-Suite für die 3 neuen Response-Felder (`raci_created`, `warnings`, `template_result`) — in /qa hinzuzufügen.

---

## QA Test Results — /qa (2026-08-06) · PRODUCTION-READY

**Scope:** Y-96b Backend-Slice + AC-Y96b.6-FE-Ergänzung (in dieselbe Slice gefaltet, dokumentierte Ausdehnung des Standard-/qa-Scopes).

### Acceptance Criteria (8/8)

- **AC-Y96b.1** ✅ — Katalog-Tabelle `ma_template_raci` mit allen Spalten + weichem `target_key` + partiellem Unique-Index gegen Doppel-A + Volltreffer-Unique + `tenant_id` über Template-Join abgeleitet. Live-verifiziert in `public.pg_tables`, `pg_indexes`, `information_schema.columns` (Live-Smoke α).
- **AC-Y96b.2** ✅ — RLS: SELECT für `is_tenant_member(tenant_id)`, INSERT/UPDATE/DELETE für `is_tenant_admin(tenant_id)`; keine anon-Rechte. Cross-Tenant-Isolation live bewiesen (Live-Pentest Vector E) + Non-Admin-Insert 42501 (Vector F) + Red-Team-Vector K (Cross-Tenant-Smuggling via bogus tenant_id in row body → 42501 auf with_check).
- **AC-Y96b.3** ✅ — `apply_ma_project_template` kopiert atomar RACI-Zeilen mit Provenance + Return-Value um `raci_created: number` erweitert. Live-Pentest Vector A: 3 RACI-Rows mit `source_template_id`/`source_template_version` in Prod bestätigt.
- **AC-Y96b.4** ✅ — Best-Effort-Warnungen: `raci_unknown_role_key` (Row gestempelt, Vector C) + `raci_orphan_target` (Row nicht gestempelt, Vector D); `warnings[]` als optionales Feld (bei leerer Liste weggelassen, Vector H PROJ-96 verbatim beweist Absence-when-empty).
- **AC-Y96b.5** ✅ — `raci_assignments` bekommt `source_template_id uuid` + `source_template_version integer` additiv nullable; Fork A/A1 gelockt: **ON DELETE RESTRICT** (Vector G bewiesen: `delete from ma_project_templates` mit lebender Provenance → 23503). Manuelle `set_deliverable_raci`-Zeilen bleiben `source_template_id IS NULL` (Vector I).
- **AC-Y96b.6** ✅ **erweitert im /qa-Scope** — API `GET /api/ma-project-templates` liefert additiv `raci[]` je Template; Client `MaTemplateRaci` + `MaProjectTemplate.raci` typisiert. Admin-Katalog `MaProjectTemplatesPageClient` bekommt neue Sektion „RACI-Zuordnungen" pro Template: shadcn-Tabelle mit Ziel (Workstream/Deliverable-Label + `key`-Sublabel), Rolle, R/A/C/I-Badge mit Tooltip; sortiert nach Target-Typ (Workstreams first) + sort_order + target_key + role_key; Empty-State „Keine RACI-Zuweisungen im Template hinterlegt."; kein Edit-Button (Deep-Editor bleibt PROJ-Y-96d); Nav-Karte bleibt `adminOnly` unverändert.
- **AC-Y96b.7** ✅ — `ensure_default_ma_project_templates` seedet in einem neu angelegten Buy-Side-Default die kanonischen 23 RACI-Zeilen (`deal_lead=A` + `pmo_lead=R` × 7 Workstreams + `sponsor=I` × 9 Deliverables). Idempotent — Prod-Tenant mit bereits-geseedeter Buy-Side (2026-07-27) wird nicht rückwirkend befüllt (AC-erlaubt: Backfill via 96d).
- **AC-Y96b.8** ✅ — Live-RPC-Smoke `tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql` **9/9 PASS gegen Prod, 0 Residue**; PROJ-97b-`raci_assignments`-Contract-Add ist additiv, exact-Doppel-Unique + partial-A-Unique + `raci_target_type_check`-Widening bewiesen; PROJ-96-Live-Pentest bleibt verbatim grün (siehe F-1 Note zu strukturellem PROJ-96-Pentest-Bug, unabhängig von Y-96b); PROJ-104 `set_deliverable_raci` Regression grün (Vector I).

### Regression

- **PROJ-96-Pentest (`tests/sql/PROJ-96-project-templates-pentest.sql`)** verbatim gegen Prod: 5/6 vs original 6/6 — **F-1 (Low, PROJ-96 Structural)**: Der `set_config('request.jwt.claims', ..., true)` (`SET LOCAL`) innerhalb V3s `BEGIN…EXCEPTION`-Block rollt beim Subtransaction-Exception zurück; V4 läuft danach mit dem ADMIN-JWT statt dem Outsider-JWT → RPC-Apply gelingt regulär, `r_nonadmin_apply='FAIL: applied'`. Bewiesen: uid=c31d4091 in V4 (Instrumentierungs-DO-Block). **Kein Y-96b-Bug** — der RPC-Autorität-Check wurde von Y-96b NICHT modifiziert; das direkte Aufrufen mit korrekt gesetztem outsider-JWT ergibt 42501 (mehrere isolierte Reproduktionen bestätigt). **Empfehlung: PROJ-96-Pentest strukturell fixen (set_config VOR dem Subtransaction-Block ausführen)** — dokumentiert als `PROJ-Y-Followup PROJ-96-pentest-set-local-fix`; blockt kein Y-96b-Approval.
- PROJ-97b + PROJ-104 Contracts: intakt (Vector I).
- **Vitest 2595/2595**, **Playwright 9/9 chromium** (5 Y-96b Auth-Gates + 4 PROJ-96 Auth-Gates), ESLint 0, tsc 12 baseline / 0 neu, migration-naming 0 errors / 82 warnings (Baseline), Supabase-Advisors 0 ERROR / 111 WARN (Baseline), Next.js build clean, Mobile-Safari skipped (WebKit host libs, PROJ-67/F2).

### Security / Red-Team (Live gegen Prod, rolled back, 0 Residue)

- **Kern-9 (`tests/sql/PROJ-Y-96b-ma-template-raci-pentest.sql`):** A happy-path + Provenance · B Doppel-A 23505 · C unknown-role Warning+stamped · D orphan-target Warning+skipped · E cross-tenant RLS isolation (impersonated outsider) · F non-admin insert 42501 · G **Fork-A1 RESTRICT-Beweis 23503** · H PROJ-96 base verbatim (no `warnings` key on empty template) · I PROJ-104 set_deliverable_raci Regression.
- **Supplement-Red-Team 6/6 (durchgeführt in /qa, dokumentiert im Spec-Review):**
  - **J1** anon-EXECUTE auf `apply_ma_project_template` REVOKED (grants exkludieren anon).
  - **J2** anon-EXECUTE auf `ensure_default_ma_project_templates` REVOKED.
  - **K** Cross-Tenant-`tenant_id`-Smuggling (row-body claims v_other_tenant while template lives in v_tenant) → 42501 auf INSERT-with_check (Impersonation über `set local role authenticated`, RLS aktiv).
  - **L** `raci_letter`-Injection via UPDATE (`raci_letter='X'`) → 23514 CHECK-Violation.
  - **M** `target_type`-Injection via UPDATE (`target_type='work_item'`, das nur auf live `raci_assignments`, NICHT auf template_raci gültig ist) → 23514.
  - **N** `_tracked_audit_columns('raci_assignments')` unverändert bei `['role_key','raci_letter']` — Provenance-Spalten bleiben append-only Stamp-Semantik (keine ungewollte Audit-Erweiterung).

### Findings

- **F-1 (Low, PROJ-96, nicht Y-96b):** `tests/sql/PROJ-96-project-templates-pentest.sql` V3 verwendet `set_config(..., is_local=true)` innerhalb eines `BEGIN…EXCEPTION`-Blocks, dessen Exception das SET LOCAL zurückrollt; V4 läuft danach fälschlich als Admin. Empfehlung: `set_config` VOR das Subtransaction-`BEGIN` verschieben (mirror des Y-96b-Pentest-Musters, das dieses Problem strukturell vermeidet). Trägt in `OPEN-DEFERRED-STATUS.md` oder als PROJ-Y-Followup einzureihen. **Blockt Y-96b nicht** (der zugrundeliegende Live-Contract funktioniert korrekt — beweisbar mit isolierten Tests).
- **D-Y96b.qa.1 (Deviation):** AC-Y96b.6 FE (read-only RACI-Matrix im Admin-Katalog) wurde im /qa-Scope implementiert statt in einer separaten /frontend-Slice. Umfang klein genug (~120 Zeilen: 1 API-Column-Add + 3 Type-Adds + 1 Sektion-Rendering + Playwright-Test), enthält keine neuen Deps oder Datenmodell-Änderungen. Reviewbar in einem PR.
- **D-Y96b.qa.2 (Deviation):** Mobile-Safari-Playwright skipped (WebKit host libs — dokumentierte PROJ-67/F2-Umgebungssache, gilt seit langem für alle Playwright-Runs).

### Production-Ready Decision

**READY** — 0 Critical, 0 High. Alle 8 ACs erfüllt. Live-Pentest 9/9 + Red-Team-Supplement 6/6 grün gegen Prod, 0 Residue. Regression durchweg grün außer F-1 (strukturelles PROJ-96-Pentest-Issue, nicht Y-96b-verursacht).

---

## Deployment — 2026-08-06

**Deployed:** 2026-08-06 · **Tag:** `v2.34.0-PROJ-Y-96b` · **PR:** [#294](https://github.com/rechnungITC/projektplattform_v3/pull/294) (squash-merged → main `640e31a`) · **Production URL:** https://projektplattform-v3.vercel.app

**Merge-Track — Konsolidierung mit PROJ-Y-96e:** Zwischen /qa (2026-08-06 vormittags) und /deploy hat die parallele **PROJ-Y-96e-Slice (Aufgaben-Templates)** auf `main` gemerged (`b6d2e57`) — sie berührt genau denselben apply-RPC + Template-Katalog. Rebase hatte 4 Konflikte, aufgelöst durch **Konsolidierung beider Slices** (nicht Wegdrücken einer Seite).

Zusätzliche Migration in Prod: **`20260806113600_proj_y96b_y96e_apply_consolidation.sql`** — recreates `apply_ma_project_template` mit **6 atomaren Copy-Blöcken** in einer TX: phases → workstreams → deliverables → tasks (Y-96e 2-pass) → RACI (Y-96b) → profile-snapshot (γ3). Recreates `ensure_default_ma_project_templates` mit idempotenter Task-Backfill (Y-96e-L5) UND idempotenter RACI-Backfill (Y-96b-Fork-B1). **Unified jsonb warnings-Shape** — Y-96e's `text[]`-Colon-Codes werden zu strukturierten Objekten `{code, task_key / workstream_key / phase_key / parent_task_key}` mit derselben Form wie Y-96b's `{code, target_type, target_key, role_key}`. Finalize-Route + Route-Tests aktualisiert (Y-96e-Consumer parst jetzt jsonb-Objekte statt Colon-Strings).

**Live-Smoke der Konsolidierung (rolled back, 0 Residue):** `ws=7 · del=9 · tasks=22 · subtasks=3 · raci=23 · profile_snap=✓ · warnings=14 unified jsonb entries` — beide Slices in einer atomaren TX voll funktional.

**Post-Deploy-Smoke gegen Prod (2026-08-06):**
- `GET /api/ma-project-templates` → **307 Auth-Gate** ✅
- `GET /stammdaten/projekt-vorlagen` → **307 Auth-Gate** ✅
- `POST /api/projects/{id}/apply-template` → **307 Auth-Gate** ✅
- `POST /api/wizard-drafts/{id}/finalize` → **307 Auth-Gate** ✅

Kein neuer Env / Secret. Migrationen bereits seit /backend in Prod. Runtime-Deploy = Code-Merge via Vercel Auto-Deploy from main.

**Required-Checks CI (alle grün):** Snyk production dependency scan · Verify SELECT columns vs migration schema (PROJ-42) · Verify migration filename naming + version-prefix uniqueness (PROJ-134) · npm audit production dependencies (PROJ-74) · Vercel Preview deploy.

**Zusätzliche Deviation D-Y96b.merge.1:** Y-96b's ursprüngliche AC-Y96b.7 verlangte „RACI-Backfill nicht rückwirkend für bestehende Tenants". Die Konsolidierung übernimmt Y-96e's symmetrisches „idempotent-wenn-fehlt"-Muster auch für RACI (Fork B1 relaxed). Bessere UX für den Prod-Tenant — der bereits geseedete Buy-Side-Default bekommt beim nächsten Katalog-Access den RACI-Katalog nachträglich.

**Post-Deploy-Followups:**
- **PROJ-Y-Followup PROJ-96-pentest-set-local-fix** (F-1 Low, PROJ-96 strukturell — nicht Y-96b): `set_config('request.jwt.claims', ..., true)` in `tests/sql/PROJ-96-project-templates-pentest.sql` V3 VOR den `BEGIN…EXCEPTION`-Block verschieben. Mirror des Y-96b-Pentest-Musters, das dieses Problem strukturell vermeidet.
- **PROJ-Y-96d Deep-Editor** — inline CRUD für RACI-Zeilen; aktuell nur read-only Matrix im Admin-Katalog.
- **PROJ-Y-96c echte Versionshistorie** — `is_current` + Publish-RPC + auto-Version-Bump-Trigger bei Kind-Edit.
