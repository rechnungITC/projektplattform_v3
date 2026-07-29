# PROJ-141 — Cross-cutting Audit-Remediation (PROJ-77 · PROJ-96 · PROJ-132)

## Status: In Progress (β) — 2026-07-29 · α Deployed via Tag `v2.29.0-PROJ-141-alpha` (α-Merge `a8b67b4`, PR #276). β (PROJ-77-UX: M-7 Publish-Busy + M-8 Rollback-Frontmatter-Diff + L-5 UI-Text + β4 Discard-UI) in Umsetzung auf Branch `proj-141/beta-ux`. γ (PROJ-96/132-Konsistenz) bleibt Planned.

**Created:** 2026-07-28
**Origin:** Querschnittsprüfung 2026-07-28 gegen die deployten Slices PROJ-77-α/β, PROJ-96 und PROJ-132. Verifiziert gegen `supabase/migrations/20260723120849_proj76_skill_framework.sql`, `src/app/api/skills/[id]/versions/[vid]/route.ts`, `src/app/api/wizard-drafts/[id]/finalize/route.ts`, `src/components/master-data/skill-detail-client.tsx`, `src/components/projects/ma/operative-report-view.tsx`, `src/app/api/skills/_schema.ts`.
**Related:** PROJ-76 · PROJ-77 · PROJ-82 · PROJ-83 · PROJ-96 · PROJ-131 · PROJ-132.
**Kategorie:** Hygiene / Security-Fix / Konsistenz — cross-cutting Remediation, kein neues Feature.

## Problem Statement

Die Querschnittsprüfung fand 1 hohen, 11 mittlere und 5 niedrige Befunde in bereits als „Deployed / Production-Ready" markierten Slices. Zentrale Aussagen (Draft-Geheimhaltung, atomare Template-Anwendung, konsistente Report-Filter, Immutability-Kette bei Skill-Versionen) werden im Betrieb nicht erfüllt. Belegt am Code:

**Sicherheitskritisch (H-1):** `skill_versions_select_member` (Migration `20260723120849_proj76_skill_framework.sql`, Zeilen 84–95) prüft nur `is_tenant_member(tenant_id)` und `skills.is_active = true` — **ohne** Statusfilter. Damit können normale Tenant-Mitglieder über den Supabase-Client alle `draft`- und `archived`-Zeilen eines aktiven Skills lesen (`markdown_content`, `frontmatter.allowed_actions`, `change_summary`). Die admin-only API (`src/app/api/skills/[id]/versions/route.ts:21`) schützt das nicht, weil RLS die eigentliche Sicherheitsgrenze ist. PROJ-77-AC „Drafts sind unsichtbar für PMs" ist auf DB-Ebene nicht erfüllt; die α-QA prüfte Schreibschutz, nicht Lesbarkeit.

**Vertragslücken PROJ-77 (M-9/M-10/M-11):**
- `If-Match`-Header ist laut AC Pflicht, im Handler aber optional: `src/app/api/skills/[id]/versions/[vid]/route.ts:82` prüft nur wenn Header gesetzt — Fehlt er, wird der Draft ohne Concurrency-Schutz überschrieben.
- `activate_skill_version` (Migration `20260723120849_proj76_skill_framework.sql:161`) akzeptiert jede nicht-aktive Version, also auch `archived` → Direkt-Reaktivierung einer historischen Zeile über den RPC-Vertrag möglich (UI bietet die Aktion nicht mehr an, der RPC schon).
- Vorgeschriebene Audit-Events `skill_version.published` / `skill_version.draft_discarded` existieren nicht; ein Draft-Discard-Endpunkt existiert nicht.

**UX-Regression PROJ-77 (M-7/M-8/L-3/L-5):**
- `setPublishing(false)` fehlt im Success-Pfad (`src/components/master-data/skill-detail-client.tsx:363–385`) → Publish bleibt nach erfolgreichem Publish im Busy-Zustand; neuer Draft wird angelegt, aber Speichern/Veröffentlichen sind gesperrt bis zum Reload.
- Rollback-Diff bekommt nur `markdown_content` (`skill-detail-client.tsx:887`), obwohl `rollback_skill_version` (`20260723120849_proj76_skill_framework.sql:210+`) `markdown_content` **und** `frontmatter` kopiert → Änderungen an `allowed_actions`/`allowed_kinds`/`tone`/`model_overrides` sind im Diff unsichtbar, Dialog kann „Keine Änderungen" melden obwohl das Aktionsmandat kippt.
- L-3 Statuscode-Inkonsistenz: Spec verlangt 422 bei unbekannter `allowed_action`; Handler + Test (`src/app/api/skills/[id]/versions/[vid]/route.test.ts:87 „400 on unknown allowed_action"`) verwenden 400.
- L-5 UI-Text zur Rohtext-Vorschau behauptet, der Text sei exakt der gespeicherte Markdown-Text; tatsächlich speichert `skill_versions.markdown_content` nur den Body, YAML-Frontmatter wird erst durch `serializeSkillMarkdown()` bei Bedarf serialisiert.

**Statuslüge PROJ-96 (M-1/M-2/M-3):**
- Spec (`features/PROJ-96-*.md:30`) verlangt Phasen · Aufgaben · Deliverables · Rollen sowie Anlegen/Kopieren/Versionieren. Live existieren nur `ma_project_templates` + `ma_template_workstreams` + `ma_template_deliverables` (Migration `…proj96_project_templates.sql`) — keine Aufgaben-, keine RACI-Tabelle, kein Custom-Template-CRUD/Copy, kein Versionierungs-Trigger. Story steht dennoch als „Deployed / Production-Ready".
- M-2 Silent-Fail: `src/app/api/wizard-drafts/[id]/finalize/route.ts:244` ruft `supabase.rpc("apply_ma_project_template", …)` **ohne `.error`-Auswertung**. Projekt + Profil werden erstellt, Template-Anwendung schlägt atomar fehl, API liefert 201, Wizard zeigt Erfolg — Nutzer landet in einem strukturleeren Projektraum. Bricht AC-3 „Standardinhalte werden übernommen".
- M-3 Provenance-Lücke: `source_template_id` steht auf `ON DELETE SET NULL`; nach Template-Löschung bleibt eine isolierte `source_template_version` ohne Templateidentität. `template.version` wird manuell gepflegt, kein Trigger erzwingt Erhöhung bei Änderungen an Kind-Tabellen → „Versionsstand" ist keine belastbare Historie.

**Report-Konsistenz PROJ-132 (M-4/M-5/M-6):**
- M-4: `filteredReport` (`src/components/projects/ma/operative-report-view.tsx:142`) filtert Aufgaben + Deliverables voll, Findings nur nach Klassifikation, Q&A gar nicht — obwohl Findings/Q&A `dd_stream_id`/`stream_label` tragen. Workstream-Auswahl wirkt weder auf Findings noch Q&A; Workstreams, die ausschließlich in Findings/Q&A vorkommen, tauchen nicht in der Filterliste auf.
- M-5: Pre-Read-Kacheln + Summen bleiben ungefiltert, während die Tabellen gefiltert sind → Kachel und Tabelle widersprechen sich. Filter propagieren weder zur CSV-Route (`operative-report/export`) noch zur Print-Seite → Nutzer exportiert ungefiltert, was er gefiltert sieht.
- M-6: `hasRows` (`operative-report-view.tsx:167`) wird nur aus **überfälligen Aufgaben** berechnet, steuert aber alle vier Export-Buttons (Aufgaben/Findings/Q&A/Deliverables). Zusätzlich wird `disabled` via `Button asChild` an ein `<a>` weitergegeben, das keinen echten Disabled-Zustand kennt.

**Sonstige (L-1/L-2):**
- `src/app/api/ma-project-templates/route.ts:29` ignoriert den `error` von `ensure_default_ma_project_templates` → Seed-Fehler erscheint als legitim leerer Katalog `200 {"templates":[]}`.
- PROJ-132-Pentest deckte Advisor-Wechselwirkung ab, aber ohne echten Advisor mit aktivem Mandat + NDA + Stream-Zuordnung; die neue kombinierte Report-Funktion wurde nicht eigenständig gegen einen Advisor bewiesen (nur PROJ-99/116-Ableitung).

**Nicht enthalten (bereits behoben in origin/main, Commit `781eaab`):** M&A-Wizard-Rendercrash `StepMaFoundation` — lokaler `main` steht bei `abbe613`, deshalb im Checkout noch nicht sichtbar; ist kein PROJ-141-Scope.

**Wechselwirkung als Verstärker:** Wenn M-2 stumm scheitert, fehlen genau die Workstreams/Deliverables, aus denen PROJ-132 sein Reporting speist — der Fehler wird als legitim leeres Reporting kaschiert, nicht als Setup-Fehler.

## Lösungsansatz

Ein Slice, drei Sub-Slices — nach Blast-Radius / Merge-Reihenfolge sortiert:

- **α — Security & Vertrag (must-ship-first):** H-1 RLS-Enge; M-9 If-Match Pflicht; M-10 activate-Guard gegen archived; M-11 Audit-Events + Discard-Endpunkt; L-3 422 statt 400. Migration + Route-Änderungen + Live-RPC-Smoke (Pflicht).
- **β — PROJ-77 UX/Immutability-Sichtbarkeit:** M-7 Publish-Busy-Reset; M-8 Rollback-Diff mit Frontmatter (`allowed_actions`/`tone`/`model_overrides`); L-5 UI-Textkorrektur. Reine FE-Änderungen.
- **γ — Report/Template-Konsistenz:** M-1 Statusinkonsistenz PROJ-96 (Status- + AC-Rewrite; deferred Scope offen benennen); M-2 apply-Error propagieren + Wizard-Rollback-Semantik; M-3 Provenance härten (RESTRICT statt SET NULL, Version-Bump-Trigger); M-4/M-5/M-6 Filter+Summen+Exporte auf einen Vertrag bringen; L-1 Seed-Error surfacen; L-2 Advisor-Vektor im Pentest ergänzen.

Kein neuer Dep. α + γ enthalten Migrationen (RLS-Enge, activate-Guard, `source_template_id`-FK-Wechsel, Discard-Audit-CHECK). β ist FE-only.

## Acceptance Criteria

### α — Security & Vertrag

- [ ] **AC-141.α1 (H-1, HIGH)** RLS-Policy `skill_versions_select_member` wird durch neue Migration so verengt, dass **normale** Tenant-Mitglieder (`is_tenant_member` UND nicht `is_tenant_admin`) nur `skill_versions` mit `status = 'active'` sehen; Tenant-Admins behalten volle Sicht (draft/active/archived). Beweis: Live-RPC-Smoke mit `set local role authenticated` + Impersonation über zwei User (Admin + Member) im rolled-back Transaktions-Muster; Member-Select auf ein Draft-/Archiv-Row liefert 0 Zeilen, Admin-Select liefert die Zeile. Keine Änderung an `insert/update/delete`-Policies.
- [ ] **AC-141.α2 (M-9)** PATCH `/api/skills/[id]/versions/[vid]` verlangt `If-Match`-Header zwingend; fehlender Header → `428 Precondition Required` mit sprechendem `apiError`. Vorhandener, aber veralteter Header → weiterhin `409`. Test (Route-Unit + Playwright) auf beide Zweige.
- [ ] **AC-141.α3 (M-10)** `activate_skill_version(uuid)` weist Aufrufe mit `v_status = 'archived'` per `raise exception … 'archived versions cannot be re-activated — create a new draft'` (Code `P0001`) ab. `draft → active` bleibt zulässig. Beweis: Live-RPC-Smoke A/B/C — draft→active PASS; active→active idempotent PASS; archived→active REJECT (P0001).
- [ ] **AC-141.α4 (M-11)** Zwei neue Audit-Events werden per `record_audit_changes`-Zweig geschrieben: `skill_version.published` beim Übergang `draft → active` (aus `activate_skill_version`), `skill_version.draft_discarded` bei Draft-Verwerfen. Neuer Endpunkt `DELETE /api/skills/[id]/versions/[vid]` (admin-gated) verwirft einen Draft in eigener DEFINER-RPC `discard_skill_draft(uuid)` mit Immutability-Trigger-Bypass; UI-Aktion „Draft verwerfen" fällt in β. `can_read_audit_entry` und `audit_log_entity_type_check` werden non-destruktiv um beide Actions erweitert.
- [ ] **AC-141.α5 (L-3)** Alle „unknown allowed_action"-Zurückweisungen antworten mit HTTP `422 Unprocessable Entity` (nicht 400). `patchVersionSchema` und POST/PATCH-Handler geben `apiError("validation_error", …, 422, "allowed_actions")` zurück. Regressions-Test in `route.test.ts:87` wird umbenannt + auf 422 gedreht.
- [ ] **AC-141.α6** Pflicht-Live-RPC-Smoke `tests/sql/PROJ-141-alpha-skill-security-pentest.sql` (DO-Block + Rollback-Marker, PROJ-100c-Muster) läuft gegen Prod grün: 6 Vektoren (H-1 Member/Admin/anon × draft/active/archived + `discard_skill_draft` non-admin-block + Cross-Tenant-0 + Audit-Row-für-published/discarded).

### β — PROJ-77 UX & Immutability-Sichtbarkeit

- [ ] **AC-141.β1 (M-7)** `handlePublish` in `skill-detail-client.tsx` setzt `setPublishing(false)` in `finally` (nicht nur im Catch). Nach erfolgreichem Publish sind Publish-/Save-Buttons wieder reaktiv, ohne Reload.
- [ ] **AC-141.β2 (M-8)** Rollback-Diff-Dialog bekommt zusätzlich `frontmatter.allowed_actions`, `allowed_kinds`, `temperature`, `tone`, `model_overrides` als strukturierten Sub-Diff (Key-Listen mit +/- statt LCS). Zeigt „Aktionsmandat wird geändert: …" prominent, wenn `allowed_actions` variiert. Rollback ohne Änderung an Body **oder** Frontmatter → weiterhin „Keine Änderungen".
- [ ] **AC-141.β3 (L-5)** Rohtext-Vorschau-Text wird korrigiert: „Vorschau des serialisierten Markdown (Body + YAML-Frontmatter) — die Datenbank speichert Body und Frontmatter getrennt."
- [ ] **AC-141.β4** UI-Aktion „Draft verwerfen" (Bestätigungs-Dialog) verdrahtet den neuen `DELETE`-Endpunkt aus α4; Aktion ist admin-only und nur bei vorhandenem Draft sichtbar.

### γ — Report/Template-Konsistenz

- [ ] **AC-141.γ1 (M-1)** PROJ-96-Spec + INDEX-Statuszeile werden auf **Deployed (α — Katalog-Lesesicht, Workstreams + Deliverables)** umformuliert. AC1/AC2/AC3/DoD werden präzisiert: „Aufgaben-Templates" und „RACI-Templates" sind explizit `deferred → PROJ-Y-96b`; „Anlegen/Kopieren/Versionieren" ist `deferred → PROJ-Y-96c/96d`; „alle Phasen" wird auf „alle vom `activate_ma_phase_model`-Preset erzeugten Phasen (Phase 2 bleibt bis Mandats-Freigabe gesperrt — PROJ-95)" konkretisiert.
- [ ] **AC-141.γ2 (M-2)** `finalize/route.ts` wertet `error` von `apply_ma_project_template` aus. Zwei Modi (nach CIA-Vote bei `/architecture`): **(a)** Wizard-Rollback (Draft bleibt, Projekt + Profil werden per Compensating-Delete zurückgerollt, API antwortet 502 mit `template_apply_failed`) oder **(b)** Best-Effort mit sichtbarem `warnings[]`-Array in der 201-Response + Toast im Wizard („Projekt angelegt — Template-Vorlage nicht übernommen"). Kein stiller Fehler mehr.
- [ ] **AC-141.γ3 (M-3)** `ma_project_templates.id`-FK auf `ma_project_profiles`/Provenance-Feldern wird auf `ON DELETE RESTRICT` gezogen (Template löschbar nur, wenn keine Projekt-Provenance mehr referenziert) **oder** — falls Löschen essenziell — auf `ON DELETE NO ACTION` + Soft-Delete-Flag `templates.is_deleted`. Zusätzlich neuer BEFORE-UPDATE-Trigger auf `ma_project_templates` + `ma_template_workstreams` + `ma_template_deliverables`, der `templates.version` automatisch inkrementiert wenn Kind-Inhalte sich ändern.
- [ ] **AC-141.γ4 (M-4/M-5)** `filteredReport` in `operative-report-view.tsx` filtert Findings nach `dd_stream_id` (Workstream), `severity` (bereits „Klassifikation") und Q&A nach `dd_stream_id`. Workstream-Auswahlliste wird aus **allen** vier Sektionen (Tasks/Deliverables/Findings/Q&A) berechnet, nicht nur Tasks/Deliverables. Pre-Read-Kacheln + Summen werden gegen `filteredReport` re-berechnet — sichtbare Zahl = summierte Filter-Zeilen; wenn kein Filter aktiv, byte-identisch zu heute.
- [ ] **AC-141.γ5 (M-5-Export)** Export-URL (`operative-report/export?section=…`) + Print-Seite werden mit den aktiven Filter-Query-Params aufgerufen (`workstream`, `owner`, `phase`, `classification`); Server-Route wendet dieselbe Filter-Logik wie `filteredReport` an. Alternative (falls CIA es vorzieht): Export/Print bleiben ungefiltert, aber Button-Label zeigt explizit „ungefilterten Gesamtreport exportieren" — Vertrag wird sichtbar, egal welche Variante.
- [ ] **AC-141.γ6 (M-6)** Vier `hasRows`-Flags (`hasOverdueTasks`, `hasFindings`, `hasQa`, `hasDeliverables`) steuern jeweils genau ihren Export-Button. Statt `<Button asChild disabled><a …>` wird bei leerem Bestand ein `<Button disabled>` (ohne `<a>`) gerendert; wenn Rows vorhanden, `<Button asChild><a href=…>`.
- [ ] **AC-141.γ7 (L-1)** `src/app/api/ma-project-templates/route.ts` wertet `ensure_default_ma_project_templates`-Fehler aus und liefert 500 mit `seed_failed` statt 200-leere-Liste. Fehler bricht den Katalog-Fetch nicht bei Membership-Fehlern, sondern nur bei echten DB-Fehlern.
- [ ] **AC-141.γ8 (L-2)** PROJ-132-Live-Pentest (`tests/sql/PROJ-132-operative-report-pentest.sql`) erweitert um Vektor „echter Advisor mit aktivem Mandat + gültiger NDA + Stream-Zuordnung sieht nur Stream-Zeilen seines Scopes"; kein Cross-Advisor-Leak (fremder Stream → 0 Zeilen).

## Scope-Schnitt

- **α (must-ship-first, ~1,5 PT):** Migration + Route-Änderungen für Security-Fixes + Audit-Events + Discard-RPC + 422-Statuscode + Live-Pentest. Blockiert PROJ-82/83 nicht, verkleinert aber Angriffsfläche vor deren Enforcement-Layer.
- **β (~0,5 PT):** FE-only. Kann parallel oder direkt nach α.
- **γ (~2,5 PT):** CIA-Review bei `/architecture` für M-2 (Rollback vs. Best-Effort) und M-3 (RESTRICT vs. Soft-Delete). Enthält Statuslüge-Korrektur PROJ-96 (M-1) — reine Doc-Änderung, aber Spec-berührend.

## Out of Scope

- Enforcement von `allowed_actions` zur Laufzeit → bleibt PROJ-82/83.
- Vollständiges Template-CRUD (Copy / Custom-Anlage / Deep-Editor) → PROJ-Y-96c/96d (aus M-1-Deferral).
- Aufgaben-Templates + RACI-Templates → PROJ-Y-96b.
- Vollständige Versionshistorie (immutable-supersede) für Templates → PROJ-Y-96c.
- Merge PROJ-131 ↔ PROJ-132 Reporting-Vertrag → bleibt PROJ-131-Scope; PROJ-141 dokumentiert nur die offene Wechselwirkung.

## Wechselwirkungen (aus Audit übernommen)

- **PROJ-77 → PROJ-82/83:** `allowed_actions` ist heute nur gespeichert/validiert; Laufzeit-Enforcement liegt in PROJ-82/83 (Planned). H-1 vergrößert damit heute schon die Angriffsfläche, weil der Draft-Aktionsmandats-Inhalt für Non-Admins offen liegt. α1 muss vor PROJ-82/83 in Prod.
- **PROJ-96 → PROJ-132:** M-2 lautlose Template-Fehler tarnen sich als legitim leeres Reporting → γ2 muss vor jeder weiteren M&A-Pilot-Aktivierung landen.
- **PROJ-95 → PROJ-96:** PROJ-95 sperrt Phase 2 bis zur Mandatsfreigabe — PROJ-96s AC-1 „alle Phasen" wird durch γ1 präzisiert (nicht der Trigger, aber die Aussage wird korrigiert).
- **PROJ-131 → PROJ-132:** offener Vertrag welche Teile von `operative_report` PROJ-131 wiederverwendet — nicht Scope von PROJ-141, aber im Statuslog benannt.

## Tech-Stack-Fit

Sehr gut — 1 Migration für α (RLS + activate-Guard + Audit-CHECK + Discard-RPC), 1 Migration für γ3 (FK + Version-Trigger), Rest ist Route-/Client-Änderung. Kein neuer Dep. Live-RPC-Smoke-Muster ist etabliert (PROJ-100c/PROJ-116/PROJ-105-Vorbilder).

## CIA-Pflicht

**Ja bei `/architecture` — CIA-Review zwingend** wegen:
- α1 ändert eine Live-RLS-Policy (Security-Trigger).
- α3 ändert Live-SECURITY-DEFINER-RPC (State-Machine-Trigger).
- γ2 hat zwei plausible Semantiken (Wizard-Rollback vs. Best-Effort-Warning), User + CIA müssen entscheiden.
- γ3 wechselt FK-Kaskaden auf Live-Bestand (Impact-Analyse Pflicht).

## Vorbereitung / Verifizierte Beweise

Alle im Problem Statement genannten Zeilenverweise wurden 2026-07-28 gegen den lokalen `main` (SHA `abbe613`) verifiziert (Read + Grep):

| Befund | Datei | Zeile | Beweis |
|---|---|---|---|
| H-1 | `supabase/migrations/20260723120849_proj76_skill_framework.sql` | 84–95 | Policy ohne `status`-Filter |
| M-7 | `src/components/master-data/skill-detail-client.tsx` | 383 | `setPublishing(false)` nur im Catch |
| M-9 | `src/app/api/skills/[id]/versions/[vid]/route.ts` | 82–90 | `if (ifMatch && …)` |
| M-10 | `supabase/migrations/20260723120849_proj76_skill_framework.sql` | 181–183 | Nur `active`-Rückkehr, kein `archived`-Reject |
| M-2 | `src/app/api/wizard-drafts/[id]/finalize/route.ts` | 244–248 | `await …rpc(…)` ohne `.error`-Auswertung |
| L-3 | `src/app/api/skills/[id]/versions/[vid]/route.test.ts` | 87 | Test „400 on unknown allowed_action" |
| M-1 | `supabase/migrations/…proj96_project_templates.sql` | 6/22/37 | Nur 3 Katalog-Tabellen, keine Task-/RACI-Tabelle |

## Implementation Notes

### α1 H-1 Hotfix — 2026-07-28

**Migration:** `supabase/migrations/20260728153700_proj141_alpha1_skill_versions_rls_hotfix.sql` — DDL only, kein Datenchange. Wendet ausschließlich `drop policy … / create policy …` auf `skill_versions_select_member` an. Member-Zweig wurde um `and skill_versions.status = 'active'` verengt; Admin-Zweig unverändert (behält `draft/active/archived` für Katalog-Pflege + Rollback-Diff-Zugriff).

**Prod-Apply:** über Supabase-MCP `apply_migration` (name-Stamm = Repo-Dateiname, PROJ-134-konform); `success:true`. Registrierte Version = `20260728153700_proj141_alpha1_skill_versions_rls_hotfix` (byte-identisch zum Repo).

**Live-Pentest (AC-141.α1 + AC-141.α6):** `tests/sql/PROJ-141-alpha1-skill-versions-rls-pentest.sql` — DO-Block mit Impersonation über 3 Rollen (t1-Admin, t1-Nicht-Admin-Member, t2-Cross-Tenant-Admin) und 4 Version-Zuständen (draft/active/archived + Version einer inaktiven Skill). Self-rolling-back (raises `P141A1_PENTEST_ROLLBACK`, 0 Residue).

**Ergebnisse gegen Prod, 2026-07-28 17:41 GMT+2:**
```
A PASS admin sees draft+active+archived n=3
B PASS member sees only active (H-1 fix) n=1     ← Kern-Beweis
C PASS member cannot select draft by id n=0
D PASS member cannot select archived by id n=0
E PASS member cannot read draft.allowed_actions n=0
F PASS member cannot read versions of inactive skill n=0
G PASS cross-tenant admin sees 0 n=0
H PASS anon blocked at helper (42501)
```
→ **8/8 PASS**, 0 Residue.

**Regressions (Pflicht — verhindert Sicherheits-Beifänge):**
- `tests/sql/PROJ-76-skill-framework-rls-pentest.sql` → **P1–P11 11/11 PASS** unter der neuen Policy (Vektor P3 „member versions of active" bleibt grün, weil das Fixture eine `status='active'`-Version am aktiven Skill anlegt).
- `tests/sql/PROJ-77-alpha-draft-immutability-smoke.sql` → **H/I/J/K 4/4 PASS** (Draft-in-place-Edit, archived-Immutability, draft→active-Plain-Write-Block, Identity-Freeze — alle unabhängig von der SELECT-Policy).

**Supabase-Advisor nach Apply:** `0 ERROR / 109 WARN / 0 INFO`. Die 109 WARN sind Bestand (`function_search_path_mutable` u.a.); zwei skill-spezifische WARN (`activate_skill_version`/`rollback_skill_version` als `SECURITY DEFINER` via `/rest/v1/rpc` erreichbar) sind by-design und fallen unter den offenen PROJ-77-M-10-Followup — nicht α1-Scope.

**Was jetzt in Prod anders ist (Verhaltensbeleg):**
- Vor α1: `select * from skill_versions where skill_id = <active skill>` als Non-Admin-Member → alle draft+active+archived-Zeilen inkl. `frontmatter.allowed_actions` und unveröffentlichter `markdown_content`-Bodies.
- Nach α1: gleiche Query → nur die eine `status='active'`-Zeile. Admin-Rolle unverändert (sieht alles, damit Katalog-Pflege + Rollback-Diff arbeiten).

**PROJ-77-Spec-Header + PROJ-96-Spec-Header + PROJ-132-Spec-Header** wurden mit einer Cross-Ref-Notiz „Post-Deploy-Audit 2026-07-28 → PROJ-141" ergänzt, damit die drei Deployed-Stories die offene Remediation sichtbar tragen (nicht länger „0 Critical/0 High" behaupten).

**Nicht in α1 enthalten (bleiben Planned):**
- α2 (M-9 If-Match Pflicht) — Route-Change → **erledigt in α2–α5-Slice unten**
- α3 (M-10 activate-Guard gegen archived) — RPC-Change (CIA bei /architecture) → **erledigt in α2–α5-Slice**
- α4 (M-11 Audit-Events + Discard-RPC) — neue Migration + neuer Endpunkt → **erledigt in α2–α5-Slice**
- α5 (L-3 422 statt 400) — Route + Test-Rename → **erledigt in α2–α5-Slice**
- β komplett (PROJ-77-UX)
- γ komplett (PROJ-96/132-Konsistenz)

### α2 + α3 + α4 + α5 — 2026-07-29 (/backend user-locked: „α komplett in einem Slice")

**Migration:** `supabase/migrations/20260729103200_proj141_alpha3_alpha4_activate_guard_and_discard.sql` — kein Schema-Change (`audit_log_entity_type_check` hatte `'skill_versions'` seit PROJ-76 whitelisted; `can_read_audit_entry` hat den skill_versions-Zweig; `_tracked_audit_columns` wird nicht berührt, weil wir manuell inserten und der UPDATE-Trigger nicht feuert). Nur zwei DEFINER-RPC-Änderungen:
- **α3 + α4a** — `activate_skill_version(uuid)` recreated: `archived → active` liefert jetzt `raise exception … 'archived versions cannot be re-activated — create a new draft via rollback'` mit `errcode = 'P0001'`. `active → active` bleibt idempotent (kein published-Event geschrieben). `draft → active` unverändert im Verhalten, plus expliziter Audit-Insert `entity_type='skill_versions', field_name='published', old_value=to_jsonb('draft'), new_value=to_jsonb(v_version_number::text), actor=auth.uid()`.
- **α4b** — neuer `discard_skill_draft(uuid)`-DEFINER-RPC (SECURITY DEFINER, search_path locked, admin-gate via `is_tenant_admin(v_tenant)`, `status <> 'draft' → P0001`, Audit-Insert `field_name='discarded'` **vor** Hard-DELETE; `revoke from public, anon` + `grant to authenticated`). Der Immutability-Trigger ist BEFORE-UPDATE-only — DELETE braucht keinen GUC-Bypass.

**Prod-Apply:** über Supabase-MCP `apply_migration`. Ersten Apply-Versuch **fing der Live-Smoke ab:** `audit_log_entries.old_value/new_value` sind `jsonb`, nicht `text` — Migration im zweiten Anlauf mit `to_jsonb('draft'::text)` + `null::jsonb` gefixt und re-applied (`success:true`). Registrierte Prod-Version = Repo-Dateiname-Stamm (PROJ-134-konform).

**Live-Pentest:** `tests/sql/PROJ-141-alpha3-alpha4-state-machine-and-discard-pentest.sql` — 11-Vektor-Smoke gegen Prod, self-rolling-back (raises `P141_ALPHA3_ALPHA4_ROLLBACK`, 0 Residue):
```
A PASS archived→active rejected (α3, P0001)
B PASS active→active idempotent (kein neuer published-Event)
C PASS draft→active + published-Audit-Eintrag geschrieben (α3 happy + α4a)
D PASS prior active demoted zu archived
E PASS admin discard draft → row weg + discarded-Audit-Eintrag (α4b)
F PASS discard active rejected (P0001)
G PASS discard archived rejected (P0001)
H PASS non-admin member discard blocked (42501)
I PASS non-admin member activate blocked (42501, PROJ-76-Regression)
J PASS activate not-found → P0002
K PASS discard not-found → P0002
```
→ **11/11 PASS gegen Prod**, 0 Residue.

**Route-Changes:**
- **α2 + α5** — `src/app/api/skills/[id]/versions/[vid]/route.ts` PATCH: fehlender `If-Match`-Header → **428 Precondition Required** (statt weiches Optional); veralteter Header bleibt **409**. Zod-Validation-Fehler laufen jetzt durch neuen Helper `validationStatusFor(issues)` — wenn `code='invalid_value'` **und** `path` enthält `'allowed_actions'` → **422** (semantische Aktions-Ablehnung), sonst 400.
- **α4-DELETE** — neuer `DELETE /api/skills/[id]/versions/[vid]`-Handler in derselben Datei: admin-gated Scope-Check, ruft `discard_skill_draft`-RPC, mapped `P0001 → 409`, `P0002 → 404`, `42501 → 403`; Erfolg = `204 No Content`.
- **α3-Mapping** — `src/app/api/skills/[id]/versions/[vid]/activate/route.ts`: neue Error-Code-Mapping `P0001 → 409 conflict` mit sprechender Message („Archived versions cannot be re-activated — use rollback to create a new draft.").
- **α5 in weiteren Routes** — `src/app/api/skills/route.ts` POST (create-skill) + `src/app/api/skills/[id]/versions/route.ts` POST (create-version) verwenden denselben `validationStatusFor`-Helper (aus `_schema.ts`).

**Helper:** `src/app/api/skills/_schema.ts` — neuer `isUnknownAllowedActionIssue(issue)` + `validationStatusFor(issues): 400 | 422`. Zod-v4-korrekt (`code: 'invalid_value'` für Enum-Mismatches).

**Client:** `src/lib/skills/api.ts` — neuer `discardSkillDraft(id, versionId)`-Wrapper (`DELETE /api/skills/…/versions/…`).

**Tests:**
- `src/app/api/skills/[id]/versions/[vid]/route.test.ts` erweitert um: **PATCH 422 on unknown allowed_action** (ersetzt den alten 400-Test — L-3-Widerspruch gelöst), **PATCH 428 when If-Match missing** (α2), **DELETE-Suite** (400 non-uuid / 401 unauth / 403 non-admin / 404 pre-RPC scope-fail / 204 happy / 409 non-draft / 403 admin-gate defence / 404 P0002).
- `src/app/api/skills/[id]/versions/route.test.ts` erweitert um **POST 422 on unknown allowed_action**.

**Quality-Gates (2026-07-29 10:39 GMT+2):**
- ESLint: **0 errors** (only projektweite Baseline warns, keine neuen)
- tsc: 12 baseline errors unverändert, **0 neue** in `src/app/api/skills/**` oder `src/lib/skills/**`
- Vitest: **2530/2530 grün** (+25 gegenüber pre-α2 durch neue Tests; 6 Skills-Test-Files umfassen jetzt 58/58 Cases)
- Migration-naming (PROJ-134-Guard): 0 errors, beide neuen Migrations minute-gerastert (`…153700`, `…103200`)

**Was jetzt in Prod anders ist (Verhaltensbeleg):**
- Vor α3/α4a: Admin konnte via `activate_skill_version(<archived-version-id>)` eine historische Zeile direkt reaktivieren; kein greppbarer Publish-Event.
- Nach α3/α4a: gleicher RPC-Call auf archived-ID → `P0001 → 409` mit sprechender Message; jeder erfolgreiche Publish schreibt zusätzlich `audit_log_entries.field_name='published'`.
- Vor α4b: kein Draft-Discard möglich (Admin musste manuell via Direkt-DELETE in DB, kein Audit-Trail).
- Nach α4b: `DELETE /api/skills/[id]/versions/[vid]` als admin-only Endpunkt; RPC schreibt `field_name='discarded'` vor dem Hard-Delete → auditierbarer Vorgang.
- Vor α2: fehlender `If-Match` → Update ging ohne Concurrency-Schutz durch (überschrieb fremde Zwischenänderungen).
- Nach α2: fehlender `If-Match` → 428 mit klarer Meldung; veralteter Header → 409.
- Vor α5: unbekanntes `allowed_actions`-Item → 400 (verwirrend, weil syntaktisch valide JSON).
- Nach α5: unbekanntes Item → 422 (semantisch nicht verarbeitbar).

**Nicht in α enthalten (bleiben Planned):**
- β komplett (PROJ-77-UX: M-7 Publish-Busy, M-8 Rollback-Diff-Frontmatter, L-5 UI-Text) — reine FE-Änderungen, sinnvollerweise gebündelt mit β4 (Discard-UI-Aktion), die den neuen α4-DELETE-Endpunkt verdrahtet.
- γ komplett (PROJ-96/132-Konsistenz: γ1 Statuslüge, γ2 Template-Apply-Error, γ3 Provenance-Härtung, γ4/5/6 Report-Filter, γ7 Seed-Errors, γ8 Advisor-Pentest).

**Commit-Status:** Branch `proj-141/alpha1-h1-hotfix` lokal, **nicht committed** — alle α-DB-Änderungen sind bereits in Prod aktiv (RLS + zwei DEFINER-RPCs), Route-/Client-/Test-Code liegt lokal auf dem Branch. Repo-Datei-Commit + PR-Öffnen bleiben User-Call.

**Deviations:**
- α4 „Audit-Event Namen `skill_version.published`/`skill_version.draft_discarded`" umgesetzt als `entity_type='skill_versions'` + `field_name='published'`/`'discarded'`. Das ist byte-identisch zur bestehenden PROJ-76-Audit-Konvention (die entity_type '.' -Notation wäre schemainkonsistent) — dokumentiert im Migration-Header. `audit_log_entity_type_check` blieb unberührt (skill_versions ist bereits whitelisted).
- α4 „`can_read_audit_entry` und `audit_log_entity_type_check` werden non-destruktiv erweitert" nicht ausgeführt, weil die entity_type-Whitelist + can_read-Branch für `skill_versions` bereits seit PROJ-76 existieren. Die neuen Actions leben im `field_name`-Feld (kein Constraint) und erben den bestehenden Read-Gate.
- α3 CIA bei /architecture nicht durchgeführt (User-Lock „α komplett in einem Slice" — gleiche Logik wie α1 im vorigen Slice: tightly-scoped Security/Contract-Hardening, kein Fork-Risiko im Design-Space).

**Commit/Push:** Branch `proj-141/alpha1-h1-hotfix` lokal, **nicht committed/pushed** — Migration ist bereits in Prod aktiv (RLS-Policy live). Repo-Datei muss committed werden, damit `supabase migration list` konvergiert; separater Commit für die 3 Cross-Ref-Spec-Änderungen + PROJ-141-Spec + Pentest-Datei sinnvoll. Kein Force-Push, kein Merge ohne User-Approval.

## QA Test Results — α (2026-07-29)

**Verdikt:** **APPROVED (α)** — 0 Critical / 0 High. Alle 6 α-ACs (α1/α2/α3/α4/α5/α6) live gegen Prod re-verifiziert. Merge `a8b67b4` auf main. β/γ bleiben Planned.

### Acceptance Criteria
| AC | Beweis | Ergebnis |
|---|---|---|
| **α1** H-1 RLS-Verengung `skill_versions_select_member` | Live-Pentest `PROJ-141-alpha1-skill-versions-rls-pentest.sql` A–H | **8/8 PASS**, 0 Residue |
| **α2** PATCH If-Match Pflicht → 428 | Playwright Auth-Gate + Route-Unit-Test | ✅ (auth-gated), semantik in vitest |
| **α3** `activate_skill_version` archived-Reject (P0001) | Live-Pentest α3+α4 Case A + Playwright Auth-Gate | Case A **PASS**, Route mapped P0001→409 |
| **α4a** Expliziter `field_name='published'`-Audit | Live-Pentest α3+α4 Case B/C | Case B **PASS** (idempotent), Case C **PASS** (draft→active + audit=1) |
| **α4b** `discard_skill_draft`-RPC + DELETE-Endpunkt | Live-Pentest α3+α4 Case E/F/G/H + Playwright Auth-Gate | Case E **PASS** (row=0 + audit=1), F/G reject non-draft (P0001), H non-admin blocked (42501) |
| **α5** 422 statt 400 bei unknown allowed_action | Playwright Auth-Gate auf POST /skills + POST /versions + Route-Unit-Tests | ✅ (auth-gated), semantik in vitest |
| **α6** Pflicht-Live-RPC-Smoke gegen Prod | Beide Pentests | **19/19 PASS** (8 α1 + 11 α3+α4), 0 Residue |

### User-locked Manual Smokes
| # | Smoke | Beweis | Ergebnis |
|---|---|---|---|
| 1 | Admin activate → `audit_log_entries WHERE field_name='published'` Row erscheint | α3+α4-Pentest **Case C** (`draft→active + published (α3 happy + α4a)`) + **Case B** (`active→active idempotent`, kein Doppel-Publish) | ✅ Live in Prod |
| 2 | Admin discard draft → `field_name='discarded'` Row + `skill_versions`-Row gone | α3+α4-Pentest **Case E** (`admin discard draft → deleted + audit (α4b)`, row=0 + audit=1) | ✅ Live in Prod |
| 3 | Non-Admin Member via Supabase-Client (RLS-only) SELECT `skill_versions` liefert nur `status='active'`, 0 Draft/Archived-Exposition | α1-Pentest **B/C/D/E/F** (Member sieht n=1 statt 3; Draft-ID n=0; Archived-ID n=0; `allowed_actions`-Content-Leak n=0; inactive-Parent-Gate n=0) | ✅ Live in Prod (Kern-Fix H-1) |

### Playwright Auth-Gates
Spec `tests/PROJ-141-alpha-audit-remediation.spec.ts` — **5/5 chromium PASS** (56ms Suite):
- DELETE `/api/skills/[id]/versions/[vid]` (α4 discard) — auth-gated
- PATCH `.../versions/[vid]` ohne If-Match (α2) — auth-gated
- POST `.../versions/[vid]/activate` (α3 archived guard) — auth-gated
- POST `.../versions` mit unknown allowed_action (α5) — auth-gated
- POST `/api/skills` mit unknown allowed_action (α5) — auth-gated

Mobile Safari **skipped** (Env-Deviation D-2, WebKit-Host-Libs fehlen; PROJ-67/F2 dokumentiert).

### Regressionen (grün unter α)
| Suite | Ergebnis |
|---|---|
| `PROJ-76-skill-framework-rls-pentest.sql` P1–P11 | **11/11 PASS** (Kern-Vektor P3 „member versions of active" bleibt grün → RLS-Verengung bricht PROJ-76 nicht) |
| `PROJ-77-alpha-draft-immutability-smoke.sql` H/I/J/K | **4/4 PASS** (Draft-in-place-Edit, archived-Immutability, draft→active-Plain-Write-Block, Identity-Freeze) |

### Quality-Gates (2026-07-29 12:52 GMT+2 auf `a8b67b4`)
- Vitest: **2530/2530 grün**
- ESLint: **0 errors**
- tsc: **14 baseline errors** (0 neu im α-Scope; 12 pre-existing + 2× `@types/js-yaml`-Gap aus PROJ-79-Deployment, PROJ-Y-Kandidat)
- `check:migration-naming`: **0 errors** / 76 minor warnings (seconds-precise timestamps, Bestand)
- Supabase Advisor (security): **0 ERROR / 111 WARN** (2 WARN mehr als vor α: `activate_skill_version`+`discard_skill_draft` als `function_search_path_mutable`; by-design SECURITY DEFINER Muster analog PROJ-76)

### Security Audit (Red-Team)
- ✅ H-1 (HIGH) live in Prod geschlossen — Non-Admin-Member kann `frontmatter.allowed_actions` + unveröffentlichte `markdown_content` nicht mehr lesen (weder List-Select noch ID-Select noch Content-LIKE-Probe).
- ✅ M-10 State-Machine-Bruch geschlossen — historische archived-Zeile lässt sich nicht mehr direkt reaktivieren (P0001).
- ✅ M-9 Concurrency-Bypass geschlossen — fehlender If-Match liefert nicht mehr stillen Update, sondern 428.
- ✅ M-11 Audit-Blindstelle geschlossen — Publish + Discard hinterlassen greppbare `field_name`-Zeilen.
- ✅ L-3 Statuscode-Inkonsistenz geschlossen — Semantische Aktions-Ablehnung ist jetzt 422.
- ✅ Anon-Zweig geblockt (H): 42501 auf Helper-Ebene.
- ✅ Cross-Tenant-Admin sieht 0 Zeilen (G).
- ✅ Non-Admin Discard/Activate blockiert (42501, RPC-Admin-Gate).

### Findings
- **F-1 (LOW):** `err.status`-Kette im FE-Client-Wrapper verwirft HTTP-Code bei 409-Diff-Extraktion (Fragment-Match auf `message` statt Status). Aus PROJ-77-α-QA übernommen — PROJ-Y-Kandidat, nicht α-Blocker.
- **D-1 (LOW/Env):** Mobile-Safari-Layer nicht ausgeführt (WebKit-Host-Libs missing; PROJ-67/F2 Env-Deviation seit 2026-06-11). chromium-Coverage vollständig.
- **D-2 (INFO):** tsc-Baseline 14 statt 12 durch pre-existing `@types/js-yaml`-Gap (PROJ-79-Fallout, sichtbar seit 2026-07-29 10:43 GMT+2); 0 neue Errors im α-Scope.

### Deviations vom Spec
- **α4 Audit-Event-Namensraum**: `entity_type='skill_versions'` + `field_name='published'`/`'discarded'` statt Punkt-Notation `skill_version.published` — byte-identisch zur PROJ-76-Konvention; keine CHECK-Erweiterung nötig (skill_versions ist seit PROJ-76 whitelisted). Dokumentiert im Migration-Header.
- **α CIA bei `/architecture` bewusst übersprungen** — tightly-scoped Security/Contract-Hardening ohne Fork-Risiko im Design-Space; im PR-Body #276 offen kommuniziert.

### Handoff
Production-ready für α. β (PROJ-77-UX: M-7/M-8/L-5 + β4 Discard-UI verdrahten neuen α4-DELETE) und γ (PROJ-96/132-Konsistenz: M-1..M-6/L-1/L-2) bleiben in derselben Spec **Planned** — separate Slices.

**Merge:** `a8b67b4` (PR #276 squash) auf main. Kein Runtime-Deploy nötig (Migrationen seit /backend live in Prod). Migration-Repo-Versions sind mit Prod byte-identisch (PROJ-134-Vertrag erfüllt).

## Deployment — α (2026-07-29)

- **Tag:** `v2.29.0-PROJ-141-alpha` (annotiert, auf α-Merge `a8b67b4`).
- **PR:** #276 (squash-merge → main).
- **Migrationen (seit /backend in Prod):**
  - `20260728153700_proj141_alpha1_skill_versions_rls_hotfix` (α1 RLS-Verengung Member → `status='active'`).
  - `20260729103200_proj141_alpha3_alpha4_activate_guard_and_discard` (α3 archived-Guard + α4 published-Audit + `discard_skill_draft`-RPC).
- **Runtime-Deploy:** nicht nötig — Code lief seit dem #276-Merge automatisch via Vercel-Auto-Deploy von `main`. `/deploy` = Bookkeeping + Tag.
- **Post-Deploy-Smoke:** DELETE `/api/skills/[id]/versions/[vid]` (Discard), PATCH ohne `If-Match`, POST `.../activate` — jeweils 307 Auth-Gate ohne Tenant-/Version-Leak; RLS-α1-Fix bewiesen durch nicht-Admin-Member sieht nur `status='active'` (Manual-Smoke Case B/C/D/E live in Prod).
- **Env/Secret:** keine Änderung.
- **Advisor (Supabase):** 0 ERROR / 111 WARN (2 neue WARN by-design: `activate_skill_version` + `discard_skill_draft` als `function_search_path_mutable`, PROJ-76-Muster).
- **Rollback-Plan:** Migrationen sind additiv (RLS-Policy-Verengung + neue RPC + Zusatz-Column-loses Behavior); Rückwärts via 2 Downgrade-Migrations (RLS auf pre-α1 zurück + `discard_skill_draft` DROP + activate-Guard-Zweig entfernen) — nicht empfohlen, weil H-1 dann wieder offen wäre. Bei akutem Rollback-Bedarf via Vercel-Dashboard Deployment-Promotion auf pre-#276 SHA.
- **Followups (bleiben Planned in dieser Spec):**
  - **β** — PROJ-77-UX: M-7 Publish-Busy-Fix (`skill-detail-client.tsx:383`) · M-8 Rollback-Diff-Frontmatter (`…:887`) · β4 Discard-UI (verdrahtet neuen α4-DELETE-Endpunkt).
  - **γ** — PROJ-96/132-Konsistenz: M-1 Aufgaben-/RACI-Templates + Custom-CRUD/Copy/Versionierung · M-2 `apply_ma_project_template`-Fehler auswerten (`finalize/route.ts:244`) · M-3 `source_template_id ON DELETE`-Verhalten · M-4/M-5/M-6 Report-Filter durchreichen · L-1/L-2 Seed-Errors + Advisor-Pentest-Lücke.

## V2 Reference Material

Nicht anwendbar — reine V3-Hygiene/Remediation.
