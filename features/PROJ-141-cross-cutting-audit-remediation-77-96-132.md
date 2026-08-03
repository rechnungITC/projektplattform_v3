# PROJ-141 — Cross-cutting Audit-Remediation (PROJ-77 · PROJ-96 · PROJ-132)

## Status: Deployed (α + β) — 2026-07-29 · α Tag `v2.29.0-PROJ-141-alpha` (α-Merge `a8b67b4`, PR #276) · β Tag `v2.30.0-PROJ-141-beta` (β-Merge `c9360da`, PR #282). γ (PROJ-96/132-Konsistenz) — **Approved 2026-07-31** (Option Alpha locked; alle 5 γ-Slices γ1-γ6 implementiert, QA PASS, pending Deploy).

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

## Deployment — β (2026-07-29)

- **Tag:** `v2.30.0-PROJ-141-beta` (annotiert, auf β-Merge `c9360da`).
- **PR:** #282 (squash-merge → main).
- **Migrationen:** keine — β ist reine Frontend-Polish, kein Schema-/RPC-Change.
- **Runtime-Deploy:** Vercel-Auto-Deploy vom Merge (`main` → prod). `/deploy` = Bookkeeping + Tag; nichts, was einen expliziten Runtime-Deploy braucht.
- **Post-Deploy-Smoke:** `/skills`, `/stammdaten/skills` und `DELETE /api/skills/[id]/versions/[vid]` → alle 307 Auth-Gate ohne Leck (Redirect zu `/login?next=…`). β4-Endpunkt ist derselbe wie α4 — Auth-Gate + verhaltensidentisch zum α-Smoke.
- **Verhaltensänderungen sichtbar in Prod (admin-Session-abhängig, nicht live getestet):**
  - Publish auf Draft ⇒ Save/Publish-Buttons reagieren sofort wieder (β1).
  - Rollback-Dialog zeigt zwei Sektionen (Body / Frontmatter) + amber „Aktionsmandat wird geändert"-Warnung bei geänderten `allowed_actions` (β2). „Keine Änderungen" nur bei Body+Frontmatter identisch.
  - Rohtext-Vorschau trägt die korrigierte Beschreibung: „Vorschau des serialisierten Markdown (Body + YAML-Frontmatter) — die Datenbank speichert Body und Frontmatter getrennt." (β3)
  - Draft-Card zeigt zweiten Button „Draft verwerfen" (admin-only), mit Bestätigungs-Dialog; schreibt `skill_versions.draft_discarded`-Audit-Row via α4-DEFINER-RPC (β4).
- **Env/Secret:** keine Änderung.
- **Rollback-Plan:** reine FE-Änderung — Vercel-Deployment-Promotion auf pre-#282 SHA (`c7e5f27`) rollt die UI zurück, α-Backend/Migrationen bleiben unangetastet. Kein Migration-Rollback nötig.
- **Followups:** γ (PROJ-96/132 Konsistenz) bleibt in dieser Spec Planned.

## Implementation Notes — γ (2026-07-31)

### γ3 Provenance-Härtung — /backend live

- Migration `20260731100000_proj141_gamma_template_provenance` in Prod (idempotent, minute-rastered).
- Neue Snapshot-Spalten auf `ma_project_profiles`: `source_template_id` (FK → `ma_project_templates` ON DELETE **RESTRICT**), `source_template_label` (text), `source_template_version_snapshot` (integer), `source_template_applied_at` (timestamptz).
- FKs auf `workstreams.source_template_id` und `deliverables.source_template_id` von ON DELETE SET NULL → **RESTRICT** umgestellt (aligned enforcement).
- `apply_ma_project_template`-RPC angepasst: schreibt die drei Snapshot-Spalten atomar im selben SECURITY-DEFINER-Aufruf (mirror-Präzedenz: RPC ist einzige Schreib-Autorität, kein Trigger nötig).
- Backfill für historische Zeilen: `ma_project_profiles`-Snapshots aus `workstreams`-Provenance rückwirkend gestempelt (Label via LEFT JOIN `ma_project_templates.name`; `source_template_applied_at` bleibt NULL für historische Zeilen — Zeitpunkt nicht rekonstruierbar).

**Live-RPC-Smoke 5/5 PASS gegen Prod, 0 Residue** (`tests/sql/PROJ-141-gamma-template-provenance-pentest.sql`):
- A) `apply_ma_project_template` auf frischem M&A-Projekt → alle vier Snapshot-Spalten gesetzt.
- B) Template-Delete mit lebender Profil-Referenz → 23503 (foreign_key_violation via RESTRICT-FK).
- C) Template-Delete nach Auflösen aller FKs (Profile + Workstreams + Deliverables + Kind-Tabellen) → OK.
- D) Snapshot-Label überlebt Template-Delete (Text-Snapshot ist FK-los, DSGVO-transparent).
- E) Cross-Tenant-Isolation: Fremd-Tenant-Admin sieht 0 Zeilen des Pentest-Profils (RLS intakt).

### γ4/γ5 operative_report Filter-Args — /backend live

- Migration `20260731100100_proj141_gamma_operative_report_filters` in Prod: `operative_report` DROP + CREATE mit erweiterter Signatur `(p_project_id uuid, p_workstream_id uuid default null, p_owner_id uuid default null, p_phase_id uuid default null, p_classification text default null)`, SECURITY INVOKER erhalten, EXECUTE anon revoked / authenticated granted.
- Filter-Semantik gemäß Tech Design D-γ5: `p_classification` cross-cuts alle 4 Sektionen + Pre-Read; `p_workstream_id`/`p_owner_id`/`p_phase_id` gelten nur für Tasks + Deliverables (kein FK auf Findings/Q&A). Pre-Read zählt aus den bereits gefilterten CTEs — Pre-Read/CSV/Print/View immer konsistent.
- Backward compatibility: alte 1-Arg-Aufrufe resolven byte-identisch via Default-`null`-Args → PROJ-132-Regression bleibt strukturell grün.
- GET-Route + Export-Route + Print-Page threading Filter-Query-Params (`workstream_id`, `owner_id`, `phase_id`, `classification`) durch dieselbe `parseOperativeReportFilters`-Zod-Validierung (Single-Source-of-Truth, im GET-Route-Modul exportiert).
- FE-View state → filter query params für Fetch + Export + Print (URL-encoded). Client-side `filteredReport`-Memo entfernt; nur `NO_OWNER`-Sentinel bleibt clientseitig (kein Server-RPC-Arg für „unassigned owner"; dokumentierte Deviation D-γ6).

**Live-RPC-Smoke strukturell PASS** (`tests/sql/PROJ-141-gamma-operative-report-filters-pentest.sql`):
- Function-Metadata: `prosecdef=false` (SECURITY INVOKER erhalten) ✅
- Grants: `authenticated` EXECUTE only; anon revoked ✅
- Passthrough: `operative_report(uuid) = operative_report(uuid, null, null, null, null)` byte-identical ✅
- Filter-Narrowing: explizite Klassifikations-/Workstream-Filter engen die Rows/Aggregate erwartbar ein (0-Baseline auf Empty-Project — Filter fügt strukturell nichts hinzu).

### γ6 hasRows per Sektion + korrektes Disabled-Verhalten — FE

- 4 separate `hasRows`-Flags in `operative-report-view.tsx`, per-Sektion aus dem Report abgeleitet.
- Export-Buttons rendern konditional: bei `hasRows === false` als echtes `<Button disabled aria-disabled="true">` (kein klickbarer `<a>`); bei `true` als `<Button asChild><a href>` mit Filter-Query-Params. Print-Button bleibt immer aktiv.

### γ2 Wizard-Finalize warnings[] — /backend + /frontend

- `finalize/route.ts:244` wertet jetzt `.error` von `apply_ma_project_template` aus.
- Response um additives optionales `warnings: Array<{code, message}>` erweitert; HTTP-Status bleibt 201 (Best-Effort-Vertrag). Alte Clients ignorieren `warnings[]`.
- `finalizeDraft`-Client-Wrapper (`lib/wizard/draft-storage.ts`) gibt jetzt `{ project, warnings }`-Tupel zurück; alte Consumer bekommen `warnings: []`.
- Wizard-Client (`wizard-client.tsx`) surfaced `template_apply_failed`-Warnung via `toast.warning`: „Projektvorlage nicht übernommen — Projekt angelegt, Vorlage konnte nicht angewendet werden: {message}. Sie können die Vorlage nachträglich im Projekt-Raum anwenden."
- 3 neue Vitest-Route-Cases (`route.test.ts`): warnings[] bei RPC-Fehler / warnings[] undefined bei Happy-Path / kein RPC-Call bei fehlendem template_id.

### γ1 Bookkeeping — Doc-Only

- PROJ-96-Spec-Header: Status auf **„Deployed (MVP-Cut)"** umformuliert mit expliziter Followup-Liste (Y-96b RACI / Y-96c Versionierung / Y-96d Deep-Editor / Y-96e Aufgaben-Templates — neu registriert).
- `features/INDEX.md`-Zeile PROJ-96: Status-Column auf **„Deployed (MVP-Cut)"**, Zeile ergänzt um γ1-Bookkeeping-Klarstellung + Y-96e-Neu-Registrierung.
- PROJ-Y-96e-Registrierung als geplanter Followup (Aufgaben-Templates-Kind-Tabelle `ma_template_tasks` mit Copy-Erweiterung in `apply_ma_project_template` + Herkunfts-Stempel auf `work_items`).

### Adjacent Fix — Pre-existing Migration-Prefix-Collision

- Beim Migration-Naming-Check aufgefallen (blockierte den γ-PR-Required-Check): `20260728120000_proj115_external_document_links.sql` + `20260728120000_proj131_steering_report.sql` teilten identisches 14-Digit-Präfix. Beide bereits als Prod-Deployed live (PROJ-115 als `20260729082833`, PROJ-131 als `20260729082438` in `schema_migrations`).
- PROJ-134-konformer Fix: Repo-Dateien auf Prod-registrierte Versionen umbenannt (`git mv` — kein DDL-Change, kein Rollback). Blast-Radius: 0 (Prod läuft seit 2026-07-29 auf den neuen Versionen).

## QA Test Results — γ (2026-07-31)

### Live-Pentest — 0 Residue

- `PROJ-141-gamma-template-provenance-pentest.sql` A–E **5/5 PASS** gegen Prod (Rollback-marker fired, 0 Residue verifiziert via Post-Rollback-Query).
- `PROJ-141-gamma-operative-report-filters-pentest.sql` strukturell PASS (Signatur/Grants/Passthrough/Filter-Narrowing).
- PROJ-96 + PROJ-132 Live-Pentests (`PROJ-96-project-templates-pentest.sql` / `PROJ-132-operative-report-pentest.sql`) — bleiben grün durch Default-`null`-Args-Passthrough (Signature-Level-Verify).

### Playwright Auth-Gates

- Neuer Spec `tests/PROJ-141-gamma-report-filters.spec.ts` mit 4 Auth-Gate-Assertions (GET + Export + Print alle mit Filter-Query-Params + Operatives-Reporting-Seite-Regression).
- Bestehende PROJ-132-Playwright-Spec-Cases bleiben strukturell gültig (RPC-Signatur-Change ist auth-transparent).

### Regression + Quality Gates (2026-07-31 auf γ-Worktree)

- **Vitest 2593/2593 grün** (+19 gegenüber pre-γ: 5 Route-Cases operative-report + 8 Route-Cases operative-report/export + 3 finalize + 3 draft-storage).
- **ESLint 0 errors / 0 warnings.**
- **tsc**: 0 neue Errors im γ-Scope (12 Baseline-Errors pre-existing in unrelated Files — `releases/route.test.ts`, `stakeholder-swap-preview/route.test.ts`, `assistant/runtime.test.ts`, `assistant/speech.test.ts`, `ai/providers/graph-purpose-prompts.test.ts`, `release-summary.test.ts`, `PROJ-1-2-live-closure.spec.ts` — nicht γ-verursacht).
- **`npm run build` clean** (17.9s, alle γ-Routen — `/operative-report` + `/operative-report/export` + `/operatives-reporting` + `/operative-report/print` — registriert).
- **`npm run check:migration-naming`** 0 errors (nach Rename der preexisting Kollision `20260728120000`); 80 warnings pre-existing.
- **Supabase Advisors 0 ERROR / 111 WARN** (WARNs alle pre-existing `function_search_path_mutable` — keine neuen durch γ-Migrationen).

### Findings

- **F-γ1 (Low, adjacent-fix):** preexisting Migration-Prefix-Kollision `20260728120000` (PROJ-115 + PROJ-131) blockierte den γ-PR-Required-Check. Bereits mit `git mv` auf Prod-Versions-basierte Repo-Filenamen aufgelöst — kein DDL, kein Rollback.
- **D-γ7 (Deviation, Info):** γ4/γ5-Filter-Pentest ist strukturell (Signatur/Grants/Passthrough/Narrowing) — für einen echten Data-driven Need-to-know-Filter-Aggregat-Leak-Nachweis müsste ein Pilot-Tenant mit seeded confidential Findings/Deliverables/Tasks über allen 3 Klassifikationsstufen aufgesetzt werden. Wird bei Pilot-Onboarding nachgeholt.
- **D-γ8 (Deviation, Info):** `NO_OWNER`-Filter-Wert bleibt clientseitig (kein RPC-Arg für „unassigned owner") — semantische Parität mit dem bestehenden UI-Sentinel; kein neuer Server-Kontrakt eingeführt.

## Deployment — γ (offen, pending user-approval)

- **Vorbereitung:** Branch `proj-141/gamma` auf `origin/main` basiert, alle γ-Änderungen bereit für Commit + PR.
- **Erwarteter Tag:** `v2.32.0-PROJ-141-gamma`.
- **Migrationen bereits in Prod:** `20260731100000_proj141_gamma_template_provenance` + `20260731100100_proj141_gamma_operative_report_filters` (beide via MCP `apply_migration` seit /backend live; PROJ-134-konform). Deploy = Code-Merge + Bookkeeping-Tag, kein Runtime-DB-Change.
- **Runtime-Deploy:** Vercel-Auto-Deploy vom Merge (`main` → prod).
- **Post-Deploy-Smoke:** 307-Auth-Gate auf `/api/projects/[id]/operative-report?workstream_id=…&classification=…`, Export-Route mit denselben Query-Params, Print-Seite `/projects/[id]/operative-report/print?workstream_id=…`, sowie POST `/api/wizard-drafts/[id]/finalize` (kein Verhaltens-Sichtbarwerden vor eingeloggter Session).
- **Env/Secret:** keine Änderung.
- **Rollback-Plan:** Vercel-Deployment-Promotion auf pre-γ-Merge-SHA rollt die UI/Route-Changes zurück. Die zwei γ-Migrationen sind idempotent und additiv (add-column-if-not-exists / drop+create RPC mit Backward-Compat-Default-Args) — Datenintegrität bleibt garantiert; kein Migration-Rollback nötig. Snapshot-Spalten bleiben harmlos NULL bis zum nächsten Template-Apply.

## Tech Design (Solution Architect) — γ (2026-07-31)

**CIA-Fork-Entscheidung 2026-07-31 (Option A locked)**: γ deckt nur die Konsistenz-Bugs M-2/M-3/M-4/M-5/M-6 + Bookkeeping. **M-1 (Aufgaben-/RACI-Templates + Custom-CRUD/Copy/Versionierung) wird herausgezogen** nach PROJ-Y-96b (RACI) / Y-96c (Versionierung) / Y-96d (Deep-Editor) / Y-96e (Aufgaben-Templates — neu). γ-Umfang: ~1 PT statt 2,5 PT.

**Design-Fork γ4/γ5 (User-locked 2026-07-31: Option Alpha — SQL-Filter in RPC):** ein früherer Draft dieses Tech Designs empfahl Option Beta (shared pure Lib) mit dem Argument „kleiner Slice, keine Migration". Der User hat Option Alpha gewählt mit der Rationale, dass die 5-Sektionen-Konsistenz (Pre-Read + CSV + Print + View + FE-Options) am schmerzfreiesten in-DB durchgesetzt wird — jede shared-Lib-Alternative würde denselben Filter-Vertrag an vier Stellen replizieren, mit dauerhaftem Drift-Risiko. Kosten sind bewusst: eine Migration (drop+recreate mit nicht-brechender Signatur-Erweiterung), neuer Live-Smoke inkl. Aggregat-Leak-Probe unter Filter × Need-to-know, und CSV/Print-Routen ziehen die Filter-Query-Params zur RPC durch.

### Ausgangslage (Ist-Zustand, code-verifiziert 2026-07-31)

- `finalize/route.ts:236–248` ruft `apply_ma_project_template` **ohne** `error`-Auswertung; Kommentar lockt bereits „Best-Effort", aber Fehler wird **still** geschluckt (Wizard zeigt Erfolg, Projekt bleibt strukturleer).
- `ma_project_profiles.source_template_id` steht auf `ON DELETE SET NULL` (aus PROJ-96 Migration `20260724120055`) → nach Template-Delete verliert Projekt-Provenance jede Identität; `source_template_version` (bereits vorhanden) wird als isoliertes Feld zurückgelassen.
- `operative_report(p_project_id uuid)` (Migration `20260724120000`) ist `SECURITY INVOKER` / `language sql stable` und nimmt **keinerlei Filter-Args**; die 4 Filter-Achsen (Workstream / Verantwortlich / Phase / Klassifikation) leben ausschliesslich im FE (`operative-report-view.tsx:122–140`).
- `filteredReport` (`operative-report-view.tsx:142–165`) filtert Tasks + Deliverables voll, Findings **nur** nach Klassifikation, Q&A **gar nicht**. Options-Liste (`:100–119`) baut Workstreams/Owners/Phases **nur** aus Tasks + Deliverables — Workstreams, die exklusiv in Findings/Q&A vorkommen, tauchen nicht auf.
- Export-Route `operative-report/export?section=…` (`export/route.ts:121`) und Print-Seite (`print/page.tsx:42`) ignorieren Filter komplett — Server ruft dieselbe RPC ohne Filter-Kontext, CSV ist byte-identisch unabhängig von der FE-Filterwahl.
- `hasRows` (`operative-report-view.tsx:167`) = nur `tasks_overdue.tasks.length > 0`; steuert aber ALLE vier Export-Buttons (Aufgaben/Findings/Q&A/Deliverables). Zusätzlich `<Button asChild disabled><a>` — HTML `<a>` kennt kein natives `disabled`, der Link bleibt klickbar.

### Datenmodell-Klarheit (γ4-Vor-Analyse)

`workstreams` (PROJ-102) ≠ `dd_streams` (PROJ-112). `work_items` + `deliverables` tragen `workstream_id`; `dd_findings` + `dd_questions` tragen `dd_stream_id`. Es gibt **keinen** FK zwischen beiden Katalogen. Die FE-„Workstream"-Filter-Dropdown listet PROJ-102-Workstreams — Findings/Q&A-Rows sind strukturell davon unabhängig.

**Ehrliche Filter-Semantik in der neuen RPC** (User-locked):

| Filter-Achse | Tasks | Deliverables | Findings | Q&A |
|---|---|---|---|---|
| `p_classification` | ✅ | ✅ | ✅ | — (Aggregat ohne Klass.) |
| `p_workstream_id` | ✅ | ✅ | — (kein FK) | — (kein FK) |
| `p_owner_id` | ✅ | ✅ | — (Findings sind team-scoped, kein Owner) | — |
| `p_phase_id` | ✅ | ✅ | — (Findings hängen am DD-Stream, nicht Phase) | — |

- `p_classification` = cross-cutting → filtert alle Zeilen-tragenden Sektionen. Q&A-Aggregat trägt keine per-Row-Klassifikation, wird aus der klassifikations-gefilterten `dd_questions`-Basis neu aggregiert (nicht pass-through).
- `p_workstream_id` / `p_owner_id` / `p_phase_id` = tasks + deliverables-scoped. Findings/Q&A bleiben unter diesen Achsen sichtbar (keine strukturelle Anwendbarkeit).
- **Pre-Read**: jede Kachel zählt aus der **jeweiligen bereits gefilterten CTE**. `overdue_tasks` respektiert alle 4 Filter; `open_deal_breaker_findings` respektiert nur `p_classification`; `open_qa` respektiert nur `p_classification`; `deliverables_not_approved` respektiert alle 4.
- **FE-Options-Liste (M-4)**: Workstream/Owner/Phase-Dropdowns bleiben tasks+deliverables-derived (semantisch korrekt, da nur diese die Felder tragen). Klassifikation-Dropdown ist statische Enum. Deviation D-γ4: keine synthetische Workstream-DD-Stream-Vermischung — das wäre eine falsche semantische Fusion.

### Impact-Analyse (CIA-Auflage 2026-07-31 — gitnexus_impact)

- `fetchOperativeReport` upstream: 12 Files im operative-report-Tree, keine Fremd-Callers (der initial gemeldete CRITICAL/116-Treffer war gitnexus-Ambiguität auf einem Shared-Symbol; mit `file_path`-Hint bereinigt).
- `apply_ma_project_template` (RPC): γ2 ändert nur den **Caller** (`finalize/route.ts`), nicht die RPC selbst → additive Response-Änderung, kein Migration-Risiko.
- `ma_project_profiles.source_template_id` (FK): γ3 wechselt Kaskade + fügt Snapshot-Column an — Migration-Blast auf 1 deployte Tabelle, additiv.
- `operative_report` (RPC): γ4/γ5 = DROP + CREATE mit erweiterter Signatur. Alte 1-Arg-Callers resolven weiter über Default-Args. Neuer Live-Smoke Pflicht inkl. Filter × Need-to-know-Aggregat-Leak-Probe.

---

### Block 1 — PROJ-96-Konsistenz (M-2 + M-3)

#### γ2 (M-2) — apply-Fehler in Wizard-Finalize sichtbar machen

**Was gebaut wird:** Der Aufruf von `apply_ma_project_template` in `finalize/route.ts:244` wird um `.error`-Auswertung erweitert. Der bereits im Kommentar gelockte Best-Effort-Vertrag bleibt (Projekt-Anlage schlägt NICHT fehl), aber der Fehler wird sichtbar:

- Response-Shape um optionales `warnings[]`-Array erweitert: `{ project, warnings?: Array<{ code: "template_apply_failed", message: string }> }`.
- Beim RPC-Fehler wird ein Eintrag in `warnings[]` geschrieben; HTTP-Status bleibt `201` (Projekt existiert).
- Der Wizard-Client zeigt bei nicht-leerem `warnings[]` einen Sonner-Toast „Projekt angelegt — Template-Vorlage nicht übernommen. Grund: …" mit Verweis auf die nachträgliche Anwendung via `/api/projects/[id]/apply-template` (PROJ-96 deployt).

**Warum diese Semantik (nicht Wizard-Rollback):**
- Der Kommentar im Live-Code (`finalize/route.ts:232–235`) lockt bereits „Best-Effort … a failure here must NOT roll back the project".
- Nachträgliche Anwendung ist heute schon möglich via `/api/projects/[id]/apply-template`.
- Compensating-Delete auf Projekt-Anlage + Context-Source-Attach wäre ein deutlich grösserer Refactor mit eigenem Testbedarf; γ soll schlank bleiben.

**Kein Migration.** Kein neuer Endpoint. Nur Response-Shape-Erweiterung + Toast im Wizard-Client.

#### γ3 (M-3) — Provenance-Härtung

**Was gebaut wird:** Eine neue Migration mit vier DDL-Schritten (alle idempotent, PROJ-134-konform):

1. **Neue Snapshot-Spalten** auf `ma_project_profiles` (additiv, `add column if not exists`):
   - `source_template_label text` — Text-Snapshot des Template-Labels zum Zeitpunkt der Anwendung.
   - `source_template_version_snapshot integer` — Numerischer Snapshot der Template-Version (aktuelle `templates.version`).
   - `source_template_applied_at timestamptz` — Zeitstempel der Anwendung.
2. **FK-Wechsel** `source_template_id`: `ON DELETE SET NULL` → `ON DELETE RESTRICT`. Verhindert Template-Löschung, solange Projekt-Provenance darauf zeigt. (`SET DEFAULT`/`CASCADE` explizit ausgeschlossen.)
3. **Backfill** für bestehende Zeilen: Snapshot-Spalten aus dem aktuellen Katalog-Zustand befüllen. Zeilen mit `source_template_id is null` bleiben snapshot-lose (ohnehin bereits Provenance-verwaist).
4. **`apply_ma_project_template`-RPC** wird angepasst: befüllt die drei Snapshot-Spalten **atomar** im gleichen INSERT-Zweig, in dem `source_template_id` gesetzt wird.

**Warum RESTRICT und nicht Soft-Delete:**
- Templates sind Katalog-Objekte mit lazy-seed; harte Löschung ist kein normaler Betrieb-Case (heute nur Admin-CRUD via Katalog-Route).
- Die deferred PROJ-Y-96c-Slice führt volle immutable Versionierung mit `is_current`-Flag ein — Soft-Delete lebt dort im richtigen Design-Kontext.
- Für γ genügt Text-Snapshot: Provenance-Identität überlebt jede Katalog-Änderung, auch nach späterer Y-96c-Migration.

**Live-RPC-Smoke Pflicht:** `tests/sql/PROJ-141-gamma-template-provenance-pentest.sql` — 5 Vektoren (DO-Block + Rollback-Marker):
- A) Neues Projekt via `apply_ma_project_template` → Snapshot-Spalten (label + version + applied_at) sind gesetzt.
- B) Template-Delete mit lebender Projekt-Referenz → `raise exception … 23503` (foreign_key_violation via RESTRICT).
- C) Template-Delete nach `set source_template_id = null` auf Projekt → PASS (Template löschbar, Provenance-Snapshot bleibt erhalten).
- D) Backfill-Beweis: bestehende Zeile mit gesetztem `source_template_id` hat nach Migration ausgefüllte Snapshot-Spalten.
- E) Cross-Tenant-Isolation: Admin-Impersonation aus Fremd-Tenant sieht die Projekt-Zeile nicht (RLS unverändert).

---

### Block 2 — PROJ-132-Konsistenz (M-4 + M-5 + M-6) — Option Alpha

#### γ4 (M-4) + γ5 (M-5) — RPC mit Filter-Args, Pre-Read/CSV/Print konsistent

**Was gebaut wird:** Eine Migration, die `operative_report` idempotent recreated mit erweiterter Signatur:

```sql
drop function if exists public.operative_report(uuid);
create function public.operative_report(
  p_project_id uuid,
  p_workstream_id uuid default null,
  p_owner_id uuid default null,
  p_phase_id uuid default null,
  p_classification text default null
) returns jsonb ...
```

Alte 1-Arg-Callers (bestehende Tests, Print-Page, GET-Route ohne Filter) resolven weiter über Default-`null`-Args → **passthrough-Behaviour byte-identisch** zur bisherigen RPC. Neue Callers geben nicht-`null`-Args und triggern die WHERE-Klausel-Filter in den jeweiligen CTEs. Alle CTEs behalten `security invoker` — Need-to-know-Gate über RESTRICTIVE-Policies unverändert (Filter wird **nach** RLS angewandt, also strukturell sicher).

**Filter-Application pro CTE:**
- `task_base` WHERE `AND (p_workstream_id IS NULL OR wi.workstream_id = p_workstream_id) AND (p_owner_id IS NULL OR wi.responsible_user_id = p_owner_id) AND (p_phase_id IS NULL OR wi.phase_id = p_phase_id) AND (p_classification IS NULL OR wi.confidentiality_level::text = p_classification)`
- `deliverable_base` WHERE analog (alle 4 Filter, nur classification-Cast auf `d.confidentiality_level::text`)
- `finding_open` WHERE `AND (p_classification IS NULL OR f.confidentiality_level::text = p_classification)` (nur classification — Findings sind team/stream-scoped, keine Workstream/Owner/Phase-FK)
- `qa_agg` liest die `dd_questions`-Basis so, dass wenn `p_classification` gesetzt ist, das Q&A-Aggregat aus der klassifikations-gefilterten Basis neu gezählt wird. (Q&A trägt keine per-Row-Klassifikation, aber `dd_questions` tragen `confidentiality_level` — der Filter fasst also.)
- Pre-Read: unverändert die vier Sub-Queries `from task_base` / `from finding_open` / `from qa_agg` / `from deliverable_base` — d.h. sie zählen automatisch aus den bereits gefilterten CTEs (kein Zusatz-Code, funktioniert per Konstruktion).

**Route-/View-/Print-Wiring:**
- `GET /api/projects/[id]/operative-report` liest `workstream_id` / `owner_id` / `phase_id` / `classification` aus `URLSearchParams` (jeweils optional Zod-UUID bzw. Enum), leitet sie als RPC-Args weiter.
- `GET /api/projects/[id]/operative-report/export` analog + spiegelt sie in die Response-Row-Auswahl.
- `/projects/[id]/operative-report/print/page.tsx` liest Filter-Query-Params aus `searchParams` (Next-Server-Component-Kontrakt), leitet weiter zur RPC.
- `operativeReportExportUrl` + Print-Link im View erhalten die aktiven Filter als Query-Params (via Helper `buildFilterQuery(filters)`).
- `useOperativeReport(projectId, filters)` bekommt einen `filters`-Parameter, dependen-array baut den Effect neu bei Änderung.
- FE `filteredReport` fällt weg — die RPC liefert bereits gefilterten Report; `filteredReport = report`. Die `aggregateFindingStreams`-Helper-Funktion bleibt zunächst als toter Code stehen (unused-Warning wird entfernt), oder wird gelöscht (Präferenz: löschen — Simplify-Skill).

#### γ6 (M-6) — `hasRows` per Sektion + korrektes Disabled-Verhalten

**Was gebaut wird in `operative-report-view.tsx`:**

- Vier separate `hasRows`-Flags (`useMemo`-abgeleitet aus dem RPC-Report):
  - `hasOverdueTasks = report.tasks_overdue.tasks.length > 0`
  - `hasFindings = report.findings_by_severity.findings.length > 0`
  - `hasQa = report.qa_by_stream.length > 0`
  - `hasDeliverables = report.deliverables_status.deliverables.length > 0`
- Vier Export-Buttons rendern **konditional**: bei `hasRows === false` als `<Button disabled>` (kein `<a>`, kein Link — echtes HTML-`disabled`); bei `hasRows === true` als `<Button asChild><a href="…?section=…&<filters>">…</a></Button>`.
- Print-Button verbleibt immer aktiv (der Print-Report darf leer bleiben — zeigt dann „Keine Zeilen für Ihre Filterauswahl" im Body).

---

### Block 3 — Bookkeeping (γ1 + M-1-Extract)

#### γ1 (M-1) — PROJ-96-Statuslüge auflösen (Doc-Only)

1. **`features/PROJ-96-projekt-templates-fuer-standardphasen-bereitstellen.md`** — Header um MVP-Cut-Klausel: „**Deployed (MVP-Cut):** Kern-Katalog + Standard-Apply live seit 2026-07-27 (Tag `v2.26.0-PROJ-96`, PR #263). Bewusst ausserhalb dieser Slice und in eigenen Followups fortgeführt: **PROJ-Y-96b** (RACI-Templates) · **PROJ-Y-96c** (Freigabesperre + immutable Versionshistorie) · **PROJ-Y-96d** (Custom-Template-CRUD / Copy / Deep-Editor) · **PROJ-Y-96e** (Aufgaben-Templates `ma_template_tasks`)."
2. **`features/INDEX.md`** — PROJ-96-Zeile bleibt „Deployed", mit MVP-Cut-Annotation.
3. **PROJ-Y-96e** (neu) in `features/INDEX.md` als Followup-Zeile registrieren, analog zu Y-96b/c/d aus PROJ-96-Header.

**Kein Code, keine Migration.** Reine Doku.

---

### Nicht in γ (per CIA Option A herausgezogen)

- **M-1 vollständig** — geht als eigene Slice-Familie (siehe γ1 oben). Bauen wenn Pilot-Feedback zeigt, dass der Standard-Katalog nicht reicht.

---

### Test-Plan

| Ebene | Umfang |
|---|---|
| Live-SQL-Pentest (Prod, DO-Block, rolled-back) | `PROJ-141-gamma-template-provenance-pentest.sql` A–E (γ3) + `PROJ-141-gamma-operative-report-filters-pentest.sql` A–H (γ4/γ5: classification-cross-cut, workstream/owner/phase applied to tasks+deliverables, Need-to-know-Aggregat-Leak unter Filter, cross-tenant, filter × pre_read consistency) — **Pflicht für γ3 + γ4/γ5** |
| Vitest Unit | keine neue Lib (RPC ist die Filter-Autorität); `EMPTY_OPERATIVE_REPORT` bleibt |
| Vitest Route | `finalize/route.test.ts` erweitert um „warnings[]-Rückgabe bei RPC-Fehler" (γ2); `operative-report/route.test.ts` + `.../export/route.test.ts` um „Filter-Query-Params werden an RPC durchgereicht" |
| Playwright | `PROJ-141-gamma-report-filters.spec.ts` — 4 Auth-Gates (GET + Export + Print + Wizard-Finalize) alle mit Filter-Query-Params; 1 Regression (bestehende PROJ-132-Spec bleibt grün) |
| Regression | PROJ-96-Route-Tests (`ma-project-templates`) + PROJ-132-Live-Pentest (`PROJ-132-operative-report-pentest.sql`) müssen grün bleiben — durch Default-`null`-Args passthrough-Behaviour beweisbar |

### Dependencies

**Keine neuen** (CIA-Auflage). Alle Änderungen mit Bestand-Stack: TypeScript + Zod + Supabase + shadcn/sonner.

### Risks + Deviations

- **R-γ1 (mittel):** Backfill in γ3 überspringt Zeilen mit gelöschtem Template. Mitigation: Text-Snapshot-Spalten bleiben `null` — die betroffenen Zeilen sind ohnehin schon Provenance-verwaist. Kein Datenverlust, aber sichtbar in Reports (Snapshot-`null` → „Herkunft unbekannt").
- **R-γ2 (niedrig):** M-2 `warnings[]`-Array ist additiv; alte Clients ignorieren es. Kein Breaking-Change.
- **R-γ3 (mittel):** Alpha-RPC-Recreate: alle bestehenden 1-Arg-Callers müssen weiter passthrough-korrekt sein. Absicherung: PROJ-132-Live-Pentest wird **verbatim** re-ausgeführt (0 Residue erwartet); + neuer Filter-Pentest.
- **D-γ1 (Deviation zur Spec):** PROJ-141-AC-141.γ1 forderte „Anlegen/Kopieren/Versionieren" als deferred zu markieren — γ1 macht das explizit + registriert die vier neuen Y-96-Slices statt sie im PROJ-96-Backlog stehen zu lassen.
- **D-γ2 (Deviation zur Spec):** PROJ-141-AC-141.γ2 gab „(a) Wizard-Rollback" ODER „(b) Best-Effort mit warnings[]" als offenen Fork — Tech Design lockt **(b)**.
- **D-γ3 (Deviation zur Spec):** PROJ-141-AC-141.γ3 gab „RESTRICT" ODER „NO ACTION + Soft-Delete-Flag" als offenen Fork — Tech Design lockt **RESTRICT + Text-Snapshot**. Soft-Delete-Flag wird nach PROJ-Y-96c verschoben.
- **D-γ4 (Deviation zum Draft-Tech-Design 2026-07-30):** der erste Draft empfahl Option Beta (shared pure Lib) — γ-User-Entscheidung 2026-07-31 lockt **Option Alpha** (SQL-Filter in RPC). Rationale: 5-Sektionen-Konsistenz (Pre-Read/CSV/Print/View/Options) ist in-DB nachhaltig durchsetzbar; shared Lib würde denselben Filter-Vertrag an vier Stellen replizieren mit Drift-Risiko.
- **D-γ5 (Filter-Semantik-Sub-Fork):** `p_classification` cross-cuts alle 4 Sektionen; `p_workstream_id`/`p_owner_id`/`p_phase_id` gelten nur für Tasks + Deliverables (kein FK auf Findings/Q&A). Die FE-Workstream-Dropdown bleibt tasks+deliverables-derived — kein synthetisches Merge mit `dd_streams` (semantisch falsch).

---

### Handoff

Nach User-Review: `/backend` startet mit:

1. **Impact-Analyse** erledigt (siehe oben).
2. **γ3-Migration** schreiben + `apply_migration` (PROJ-134-konform, minute-rastered), Live-Smoke-SQL parallel entwickeln.
3. **γ4/γ5-Migration** — separate Migration für `operative_report`-Recreate mit Filter-Args (nicht mit γ3 vermischen für saubere Rollback-Chirurgie).
4. **γ2 Route-Change** (`finalize/route.ts` + warnings[]-Wire-through zum Wizard-Client).
5. **γ4/γ5/γ6 Backend + FE** (GET-Route + Export-Route + Print-Page + FE-View + Hook + `operativeReportExportUrl`).
6. **γ1 Bookkeeping-Doku** als Teil desselben Commits (Doku + Code atomisch, mirror PROJ-141-α-Muster).

Anschliessend `/qa` mit Playwright + Pentest-SQL, dann `/deploy` als γ-Bookkeeping-Slice (Tag `v2.32.0-PROJ-141-gamma`).

## V2 Reference Material

Nicht anwendbar — reine V3-Hygiene/Remediation.
