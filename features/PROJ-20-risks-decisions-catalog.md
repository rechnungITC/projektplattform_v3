# PROJ-20: Risks & Decisions Catalog (Cross-cutting Governance Backbone)

## Status: Deployed
**Created:** 2026-04-25
**Last Updated:** 2026-04-29

## Summary
Cross-cutting governance backbone: Risks (with score, mitigation, status) and Decisions (immutable, dated, with rationale, optional revision link) as first-class project entities. V2's Risk register (F4.2) lives operationally inside the project room (PROJ-7), but the immutable Decision concept — distinct from Open Items and Tasks per V2's `term-boundaries.md` — needs its own home. PROJ-20 is the place. Open Items also fit here as a lightweight clarification artifact.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles)
- Requires: PROJ-2 (Project CRUD)
- Requires: PROJ-8 (Stakeholders) — decision references stakeholders
- Requires: PROJ-10 (Audit)
- Influences: PROJ-7 (Project Room — Risks already there; Decisions tab added)
- Influences: PROJ-12 (KI proposals can produce decision drafts — never auto-decide)

## V2 Reference Material
- **Epic file:** N/A — Risks live in V2 EP-05 (F4.2). Decisions live in V2's term-boundaries doc but not in a single epic. The V3 user prompt requested PROJ-20 to bundle them.
- **Migrations:** V2 migration 0013 is referenced in the user prompt as Risks & Decisions catalog source.
- **ADRs:** `docs/architecture/term-boundaries.md` (Task vs Open Item vs Decision), `docs/decisions/architecture-principles.md` (governance is first-class)
- **V2 code paths to study during /architecture and /backend:**
  - `apps/api/src/projektplattform_api/domain/core/risks/`
  - V2's planned `apps/api/src/projektplattform_api/domain/core/decisions/` and `domain/core/open_items/` (skeleton only)

## User Stories
- **As a project lead, I want to capture risks with probability, impact, mitigation, and responsible person so that risks are centrally tracked.** (Already covered by PROJ-7 F4.2 — duplicated here as a reminder for cross-cutting consistency.)
- **As a project lead, I want to document decisions with date, rationale, decider, and stakeholders involved so the project's choices are auditable.**
- **As a project lead, I want decisions to be immutable — revisions create a new linked decision — so historical truth is preserved.**
- **As a project member, I want lightweight Open Items for unclear topics that aren't yet tasks or decisions.**
- **As a project member, I want to convert an Open Item into either a Task (if a clarification path is defined) or a Decision (when the matter is decided).**

## Acceptance Criteria

### Risks (cross-link to PROJ-7's implementation)
- [ ] Single canonical `risks` table (defined in PROJ-7 — PROJ-20 reuses it).
- [ ] Risk score = `probability × impact`.
- [ ] Status: `open | mitigated | accepted | closed`.

### Decisions
- [ ] Table `decisions`: `id, tenant_id, project_id, title, decision_text, rationale, decided_at, decider_stakeholder_id (nullable FK), context_phase_id (nullable), context_risk_id (nullable), supersedes_decision_id (nullable FK self), is_revised (bool, default false), created_by, created_at`.
- [ ] **No mutating PATCH** on the body fields (`decision_text`, `rationale`, `decided_at`). Edits create a new decision with `supersedes_decision_id = old.id` and old.is_revised becomes true.
- [ ] CRUD endpoints under `/api/projects/[id]/decisions` (POST creates new; revisions also POST with `supersedes_decision_id`).
- [ ] Project room "Decisions" tab lists chronologically with revision links.
- [ ] Every decision logged in PROJ-10 audit with reason `decision_logged` or `decision_revised`.

### Open Items
- [ ] Table `open_items`: `id, tenant_id, project_id, title, description, status (open | in_clarification | closed | converted), contact (nullable text — name OR FK stakeholder), converted_to_entity_type (nullable), converted_to_entity_id (nullable), created_at, updated_at`.
- [ ] CRUD endpoints.
- [ ] Convert action: open item → task (creates a work_item with kind=task, links back) or → decision (creates a decision, marks open_item.status=converted).
- [ ] Audit on every status change.

## Edge Cases
- **Decision with no decider stakeholder** → allowed, but logged as "no decider documented" in audit; UI warns.
- **Revising a decision multiple times** → forms a chain via `supersedes_decision_id`; UI shows the lineage.
- **Open item with both task AND decision conversion attempted** → second conversion blocked; status `converted` is final.
- **Cross-tenant access** → 404 (RLS).
- **Decision attached to a deleted phase or risk** → FK SET NULL; decision text stays.
- **Bulk import of pre-existing decisions** → migration script creates the rows with backdated `decided_at` and a special audit reason `decision_imported`.
- **AI tries to write a decision automatically** → blocked. Per V2 `term-boundaries.md`, "KI kann vorschlagen: nein — Decisions werden nicht von KI getroffen." UI exposes only "Convert KI proposal to decision (with my approval)" — never an auto path.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase.
- **Multi-tenant:** `decisions`, `open_items` MUST have `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`. RLS: project members read; editor+ write.
- **Validation:** Zod schemas; immutability of decision body fields enforced at the API layer (PATCH only sets `is_revised`; new content goes via POST + `supersedes_decision_id`).
- **Auth:** Supabase Auth + project role checks.
- **Audit:** PROJ-10 logs every change including the immutability-protecting attempts.
- **Performance:** Index on `(project_id, decided_at DESC)` for the decisions list.

## Out of Scope (deferred or explicit non-goals)
- Approval workflows on decisions (governance epic later).
- KI auto-deciding (forbidden by design — V2 binding term).
- Voting on decisions.
- Linking decisions to external systems.
- Heavy-weight escalation rules.
- Overlap with compliance: a decision is NOT a compliance increment by default; PROJ-18 tags decide that explicitly.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck: Risks gehören in PROJ-20

Die Spec verweist beim Risikoregister auf PROJ-7. PROJ-7 ist aber nur als „MVP-Slice" deployed — die Risiken-Seite ist eine Coming-Soon-Karte, ein `risks`-Table existiert nicht. **PROJ-20 baut deshalb alle drei Bausteine selbst:** Risiken, Entscheidungen, Offene Punkte. Decisions und Risks teilen sich denselben UX-Rahmen (Governance), das passt thematisch.

### Komponentenstruktur

```
Projektraum
├── Tab „Risiken"    (vorher Coming-Soon → jetzt real)
│   ├── Risiko-Matrix (5×5: Wahrscheinlichkeit × Auswirkung)
│   ├── Risiko-Tabelle (Filter nach Status: offen/gemindert/akzeptiert/geschlossen)
│   └── Risiko-Drawer (Anlegen/Bearbeiten + HistoryTab aus PROJ-10)
│
└── Tab „Entscheidungen"   (neu)
    ├── Entscheidungs-Timeline (chronologisch, mit Revisions-Kette)
    │   └── Entscheidungs-Karte (Body schreibgeschützt; „Revidieren"-Button legt Nachfolger an)
    ├── Panel „Offene Punkte" (leichte Klärungsliste, daneben/darunter)
    │   ├── Offener-Punkt-Karte (Titel, Status, Ansprechpartner)
    │   └── Aktion „Umwandeln in" → Aufgabe (legt Work-Item an) | Entscheidung
    └── Dialog „Neue Entscheidung" (mit Stakeholder-Picker, optional Phasen-/Risiko-Verknüpfung)
```

Zwei neue Tabs in der Projektraum-Navigation: Icon `AlertTriangle` für Risiken, `Gavel` für Entscheidungen.

### Datenmodell (Klartext)

**Risiken** — operativ, änderbar
- Titel, Beschreibung, Wahrscheinlichkeit 1–5, Auswirkung 1–5, abgeleiteter Score (W×A)
- Status: offen / gemindert / akzeptiert / geschlossen
- Minderungsmaßnahme, verantwortliche Person
- Standard PROJ-10-Feldhistorie auf jeder Änderung

**Entscheidungen** — Governance, Body unveränderlich
- Titel, Entscheidungs-Text, Begründung, Entscheidungs-Zeitpunkt
- Entscheider (FK auf Stakeholder, optional)
- Optionale Kontext-Links: Phase, Risiko
- `supersedes_decision_id`-Kette für Revisionen; `is_revised`-Flag kippt beim Vorgänger
- Body-Felder werden **niemals** per PATCH geändert — Revisionen sind neue Datensätze
- Audit beim INSERT: Reason `decision_logged` bzw. `decision_revised`

**Offene Punkte** — Klärungsartefakte
- Titel, Beschreibung, Ansprechpartner (Freitext oder Stakeholder-FK)
- Status: offen / in_klärung / geschlossen / umgewandelt
- Beim Umwandeln: `converted_to_entity_type` + `converted_to_entity_id` werden gespeichert; Status sperrt auf `umgewandelt`
- Feld-Audit auf Edits; Umwandlung ist eine Einbahnstraße

Alle drei Tabellen: `tenant_id`, `project_id` (FK CASCADE), RLS via `is_project_member()`.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Risiken liegen in PROJ-20, nicht in PROJ-7 | PROJ-7 ist als MVP-Slice ohne Risiken deployed; die Tab-Seite ist leer. PROJ-20 ist die natürliche Heimat, weil Decisions und Risks denselben Governance-UX-Rahmen teilen. |
| Decisions sind append-only auf der API | Spec-Regel + V2-`term-boundaries`. Erzwungen auf der API-Schicht (PATCH lehnt Body-Änderungen ab); RLS unverändert. |
| Insert-Trigger für Decisions-Audit | Der PROJ-10-Trigger feuert nur auf UPDATE. Ein zusätzlicher Trigger schreibt pro INSERT eine Audit-Zeile mit dem vollen Body in `new_value`, Reason `decision_logged` / `decision_revised`. |
| PROJ-10-Whitelist erweitern | `risks`, `decisions`, `open_items` zur `audit_log_entry_type_check`-Constraint und zu `_tracked_audit_columns()` ergänzen. |
| Umwandlung Offener-Punkt → Entscheidung/Aufgabe als POST-Endpoint | `/api/open-items/[id]/convert-to-decision` und `/convert-to-task`. Atomar in einer Transaktion (legt Zielentität an + setzt Status auf `umgewandelt`). |
| KI entscheidet nie automatisch | UI bietet nur „KI-Vorschlag in Entscheidung umwandeln (mit meiner Freigabe)" — niemals einen Auto-Pfad. PROJ-12 dockt hier an. |

### Neue Code-Oberfläche

**Migration (eine):**
- `20260429_proj20_risks_decisions_open_items.sql` — drei Tabellen, Indizes, RLS-Policies, Audit-Whitelist-Erweiterung, Insert-Trigger für Decisions

**API-Routen:**
- `/api/projects/[id]/risks` (GET, POST), `/api/risks/[rid]` (GET, PATCH, DELETE)
- `/api/projects/[id]/decisions` (GET, POST — POST behandelt neu *und* Revision via `supersedes_decision_id`)
- `/api/projects/[id]/open-items` (GET, POST), `/api/open-items/[oid]` (PATCH, DELETE)
- `/api/open-items/[oid]/convert-to-task`, `/api/open-items/[oid]/convert-to-decision`

**UI-Seiten/Komponenten:**
- `app/(app)/projects/[id]/risiken/page.tsx` ersetzen (Coming-Soon → real)
- Neu: `app/(app)/projects/[id]/entscheidungen/page.tsx`
- Zwei Nav-Einträge in `project-room-shell.tsx` ergänzen
- Neu: `components/projects/risks/` und `components/projects/decisions/`

### Abhängigkeiten

Keine neuen npm-Pakete. Verwendet vorhandene shadcn-Bausteine (Card, Dialog, Table, Tabs, Badge) plus `HistoryTab` aus PROJ-10.

### Out-of-Scope (aus der Spec)

- Keine Freigabe-Workflows auf Entscheidungen
- Kein KI-Auto-Decide-Pfad
- Kein Voting
- Compliance-Tags (PROJ-18) entscheiden separat, ob eine Entscheidung ein Compliance-Increment ist

---

### Festgelegte Design-Entscheidungen

**Frage 1 — Offene Punkte: Option A (kombiniert).** Das Panel „Offene Punkte" lebt im Tab „Entscheidungen" als zweite Sektion neben der Decisions-Timeline. Begründung: Offene Punkte sind per Design temporär (werden in Entscheidungen oder Aufgaben umgewandelt) und gehören thematisch dorthin; spart einen Nav-Eintrag (Projektraum bleibt bei 9 Tabs statt 10).

**Frage 2 — Revisions-Anzeige: Option A (Expander).** Die Decisions-Timeline zeigt nur die jeweils aktuellste Revision; ein „Vorgänger anzeigen"-Expander öffnet die Kette inline. Begründung: häufiger Lesefall („was gilt heute?") ist ohne Klick beantwortet; der vollständige Verlauf bleibt über Expander und HistoryTab erreichbar.

Beide Entscheidungen sind backend-identisch — nur die UI in `components/projects/decisions/` und `components/projects/open-items/` setzt sie um.

## Implementation Notes

### Backend (2026-04-28)

**Migrations applied to project iqerihohwabyjzkpcujq:**
- `20260429120000_proj20_risks_decisions_open_items.sql` — three tables, RLS, audit-whitelist extension, decisions INSERT trigger (`record_decision_insert`), predecessor flip trigger (`decisions_after_insert_flip_predecessor`), convert RPCs.
- `20260429120100_proj20_harden_trigger_only_functions.sql` — revoke EXECUTE on the two trigger-only functions (advisor hardening; mirrors PROJ-10 follow-up).

**Key implementation choices:**
- Risks live in PROJ-20 (PROJ-7 deferred them in MVP slice). PROJ-7's spec text referencing "the risks table" was aspirational — there was no table.
- Decisions are append-only at the API: `POST /api/projects/[id]/decisions` handles both new entries and revisions (via `supersedes_decision_id`); no PATCH route. The body fields (`decision_text`, `rationale`, `decided_at`, etc.) are not in `_tracked_audit_columns('decisions')` because they are immutable; only `is_revised` is tracked, and a separate INSERT trigger writes one summary audit row per new decision (reason: `decision_logged` or `decision_revised`).
- Predecessor flip: AFTER-INSERT trigger sets `is_revised=true` on the supersedes_decision_id row. The standard PROJ-10 update-trigger then writes the audit row for that field flip, so the lineage of revisions appears in the audit log too.
- Open items are one-way: status `converted` and the `converted_to_*` fields are gated by three CHECK constraints — the API PATCH route additionally refuses any edit on a converted item with 409.
- Convert is atomic via SECURITY DEFINER RPC (`convert_open_item_to_task`, `convert_open_item_to_decision`): inside one transaction it inserts the target row, then sets the open_item to `converted`. RPC has internal authorization (editor/lead/admin) so the SECURITY DEFINER privilege escalation is bounded.

**API surface (8 routes):**
- `GET /api/projects/[id]/risks` (status filter), `POST /api/projects/[id]/risks`
- `GET/PATCH/DELETE /api/projects/[id]/risks/[rid]`
- `GET /api/projects/[id]/decisions` (`include_revised=true` to see superseded), `POST /api/projects/[id]/decisions` (new + revision)
- `GET /api/projects/[id]/decisions/[did]`
- `GET /api/projects/[id]/open-items` (status filter), `POST /api/projects/[id]/open-items`
- `GET/PATCH/DELETE /api/projects/[id]/open-items/[oid]`
- `POST /api/projects/[id]/open-items/[oid]/convert-to-task`
- `POST /api/projects/[id]/open-items/[oid]/convert-to-decision`

**Tests:** 35 new vitest cases across 6 test files. Full suite 190/190 green (was 155 before PROJ-20). Type-check and ESLint clean on touched files.

**Open follow-ups (handed to /frontend):**
- Build Risiken tab (replace coming-soon page) with matrix + table + drawer + HistoryTab.
- Build Entscheidungen tab with timeline + Open Items panel + revise/convert dialogs.
- Add two nav entries to `project-room-shell.tsx` (`AlertTriangle`, `Gavel` icons).
- Ensure `is_revised=true` decisions render with "Vorgänger anzeigen" expander (Option A).

### Frontend (2026-04-29)

**New pages:**
- `src/app/(app)/projects/[id]/risiken/page.tsx` — replaces the PROJ-7 coming-soon page; mounts `RiskTabClient`.
- `src/app/(app)/projects/[id]/entscheidungen/page.tsx` — new; mounts `DecisionsTabClient` with the decisions timeline and the open-items panel side by side.

**New components:**
- `components/projects/risks/risk-form.tsx`, `risk-table.tsx`, `risk-matrix.tsx` (5×5), `risk-tab-client.tsx` (list/matrix toggle, status filter, drawer with Stammdaten + Historie tabs).
- `components/projects/decisions/decision-form.tsx` (handles new + revision via `supersedes` prop), `decision-card.tsx` (with "Vorgänger anzeigen" Collapsible), `decisions-timeline.tsx` (walks supersedes chain), `decisions-tab-client.tsx`.
- `components/projects/open-items/open-item-form.tsx`, `convert-to-decision-dialog.tsx`, `open-items-panel.tsx` (sidebar; convert dropdown → Aufgabe / Entscheidung).

**API client wrappers:** `lib/risks/api.ts`, `lib/decisions/api.ts`, `lib/open-items/api.ts`.

**Project room shell:** added two nav entries (`AlertTriangle` for Risiken between Stakeholder and Mitglieder, `Gavel` for Entscheidungen right after).

**Type touch-up:** extended `AuditEntityType` (and labels) with `risks`, `decisions`, `open_items` so HistoryTab inside the risk drawer can pull from `/api/audit/risks/[id]/history`.

**Pre-existing infra fix (Next 16 dev-mode):** `/api/audit/[id]/undo` → `/api/audit/entries/[id]/undo`. The previous layout had `[id]` and `[entity_type]` as siblings under `/api/audit/`; production build tolerated it, but Next 16 dev (Turbopack and Webpack alike) refuses with a slug-name conflict. Production contract is identical: only call site (`lib/audit/api.ts`) was updated. Migration `proj10_audit_undo_path_rename` is implicit — just a route move; no DB change.

**Verification:**
- Type-check clean.
- `npm run build` succeeds; new routes appear in the route table.
- `npx vitest run` 190/190 green (no test changes needed; the path move only affects the URL string in the lib client).
- Dev server starts cleanly, both new pages compile through to the auth-redirect proxy.
- Lint baseline: +4 `react-hooks/set-state-in-effect` instances of the established repo convention; no new rule classes.

## QA Test Results

**Run:** 2026-04-29 · QA pass + DB-level red-team probes against live Supabase project `iqerihohwabyjzkpcujq`.

### Acceptance Criteria

#### Risks
| AC | Result | Evidence |
|---|---|---|
| Single canonical `risks` table with the documented columns + status enum | ✅ | Live `\d+ risks` matches; indexes on `(project_id, status)` and `(project_id, score desc)` |
| Score = probability × impact | ✅ | DB-side `generated always as (probability * impact) stored`; verified live (P=3, I=4 → score=12) |
| Status: open / mitigated / accepted / closed | ✅ | `risks_status_check` CHECK matches |

#### Decisions
| AC | Result | Evidence |
|---|---|---|
| Table with the documented columns + nullable FKs | ✅ | All FKs verified: phase + risk + supersedes → SET NULL; tenant + project → CASCADE; created_by → RESTRICT |
| **No mutating PATCH on body fields at the API** | ✅ | `/api/projects/[id]/decisions/[did]` only exports GET; collection POST handles new + revision |
| **No mutating PATCH on body fields at the DB** | ✅ **Resolved (H1, 2026-04-29).** Migration `20260429140000_proj20_decisions_immutability_trigger.sql` adds a BEFORE-UPDATE trigger that rejects every column change except a one-way `is_revised: false → true` initiated via the predecessor-flip path. Live red-team retest: direct UPDATE of `decision_text`/`rationale` now raises `decisions are immutable. Create a revision …`. |
| CRUD endpoints under `/api/projects/[id]/decisions` | ✅ | Routes exist; revision flow protected by predecessor-must-exist-and-not-already-revised checks (returns 409 if already revised) |
| Project room "Decisions" tab lists chronologically with revision links | ✅ | `DecisionsTimeline` walks the supersedes chain and attaches predecessors to each current row; "Vorgänger anzeigen" Collapsible per card (Option A) |
| Every decision logged in PROJ-10 audit with reason `decision_logged` or `decision_revised` | ✅ | Live verified: insert wrote 1 row reason=`decision_logged`; revision wrote 1 row reason=`decision_revised` plus a `is_revised` flip row on the predecessor |

#### Open Items
| AC | Result | Evidence |
|---|---|---|
| Table with the documented columns + status enum + converted_to_* | ✅ | Live `\d+ open_items` matches |
| CRUD endpoints | ✅ | Collection + single item routes; PATCH refuses on already-converted items (409) |
| Convert: open item → task or → decision; atomic; status locks to `converted` | ✅ | RPC verified live: `convert_open_item_to_task` returned `success=true, work_item_id=…`; second call → `already_converted` |
| Audit on every status change | ✅ | `status` is in `_tracked_audit_columns('open_items')`; status changes go through the standard UPDATE trigger |

### Edge Cases

| Case | Spec | Result |
|---|---|---|
| Decision with no decider stakeholder | allowed; UI warns | ✅ **Resolved (M2, 2026-04-29).** `DecisionForm` now exposes a Stakeholder Select (active stakeholders for the project, fetched via the existing `listStakeholders` API). On submit with no decider, a `toast.warning("Kein Entscheider dokumentiert", …)` fires per the spec edge case. Phase and Risk pickers remain a low-priority follow-up (L4). |
| Revising a decision multiple times | forms a chain | ✅ DB allows multi-level chain; DecisionsTimeline walks it; `decisions_after_insert_flip_predecessor` flips one ancestor at a time |
| Open item with both task AND decision conversion | second blocked; status final | ✅ Convert RPC checks `if status='converted' return already_converted`; CHECK constraint pins the final state |
| Cross-tenant access | 404 (RLS) | ✅ Verified live: non-member counted 0 risks/open_items in test project; INSERT as non-member silently denied (no row appeared) |
| Decision attached to deleted phase or risk | FK SET NULL | ✅ FK definitions confirmed live |
| Bulk import of pre-existing decisions | migration script with `decision_imported` reason | ⏳ Not built. Out of scope for this MVP slice; documented as deferred. |
| AI tries to write a decision automatically | blocked | ✅ No API path bypasses the editor+ check; PROJ-12 will dock here later |

### Security Audit (red team)

| Check | Result |
|---|---|
| RLS isolation: non-member cannot read or insert into another project's risks/decisions/open_items | ✅ Verified live |
| Convert RPC requires editor/lead/admin on the project | ✅ `convert_open_item_to_task` and `convert_open_item_to_decision` both return `forbidden` for a non-member caller |
| Audit log INSERT-only via SECURITY DEFINER trigger (no user-side INSERT) | ✅ Only SELECT policy on `audit_log_entries`; user-side INSERT denied by RLS |
| `open_items.status='converted'` only via RPC | ✅ `open_items_converted_status` CHECK forbids status='converted' without `converted_to_entity_type`; `open_items_converted_consistency` forbids the inverse |
| `convert_open_item_to_*` are SECURITY DEFINER but executable by `authenticated`; internal auth gate | ✅ Internal `has_project_role / is_project_lead / is_tenant_admin` check; verified `forbidden` return for non-member |
| Trigger-only SECURITY DEFINER functions hardened | ✅ `record_decision_insert` and `decisions_after_insert_flip_predecessor` revoked from `public, anon, authenticated` (proj20_harden migration) |
| `audit_log_entity_type_check` whitelist extended for the new types | ✅ Verified |
| **Decision body immutability** | ✅ **Resolved (H1).** BEFORE-UPDATE trigger rejects body changes; tested live. |
| **`is_revised` integrity** | ✅ **Resolved (M1).** Same trigger pins `is_revised` to one-way `false → true`; tested live. |
| SQL injection via dynamic SQL in convert RPCs | ✅ All values are passed as `$1`/`$2` placeholders; `format(... %I)` for identifiers in audit-log RPCs |
| XSS via title fields (titles render in JSX with React's auto-escape) | ✅ No `dangerouslySetInnerHTML`; React handles all interpolation |
| Rate limiting on the new endpoints | — Not implemented (consistent with the rest of the API; pre-existing baseline gap) |

### Bug Audit

| Severity | ID | Description | Fix complexity |
|---|---|---|---|
| ~~High~~ Resolved | H1 | ~~Decision body fields silently mutable via direct DB UPDATE~~ **Fixed 2026-04-29.** Migration `20260429140000_proj20_decisions_immutability_trigger.sql` adds `enforce_decision_immutability()` BEFORE-UPDATE trigger that rejects every column change except a one-way `is_revised: false → true` initiated via the predecessor-flip path (transaction-local GUC `decisions.allow_revise_flip` is set inside `decisions_after_insert_flip_predecessor` and consumed once by the new trigger). Live retest: direct body UPDATE → `check_violation`; legitimate revise flow + 3-generation chain still works. | — |
| ~~Medium~~ Resolved | M1 | ~~`is_revised` can be flipped back to `false`~~ **Fixed 2026-04-29 (same migration).** The new BEFORE-UPDATE trigger pins `is_revised` to one-way `false → true`. Live retest: setting `is_revised=false` raises `check_violation`. | — |
| ~~Medium~~ Resolved | M2 | ~~DecisionForm missing decider picker~~ **Fixed 2026-04-29.** `DecisionForm` now renders a Stakeholder Select (active stakeholders for the project) and emits `toast.warning("Kein Entscheider dokumentiert", …)` on submit with no decider, per the spec edge case. Phase + Risk pickers remain a low-priority follow-up (L4). | — |
| Low | L1 | Bulk-import migration (`decision_imported` reason) deferred — out of scope for this MVP slice. | — |
| Low | L2 | `decided_at` is always the server-side `now()` from the API; backdating is allowed by the schema but not exposed in the form. | Low — add an optional date-time input to DecisionForm. |
| Low | L3 | New endpoints have no rate limiting (consistent with rest of API). | — |
| Info | I1 | E2E (Playwright) tests not written for PROJ-20. Repo has zero E2E tests today; backend rigour was achieved via direct DB-level red-team probes for this QA pass. | — |

### Regression check

| Area | Result |
|---|---|
| `npx vitest run` 190/190 (35 PROJ-20 + 155 prior) | ✅ |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ All routes emitted, including `/api/audit/entries/[id]/undo` (renamed) |
| Dev server starts on Turbopack without slug conflicts | ✅ Pre-existing `[id]` vs `[entity_type]` collision under `/api/audit/` resolved by the rename |
| `lib/audit/api.ts` is the only `/undo` caller; updated to new path | ✅ Grep confirms no stale references |
| `AuditEntityType` extended with risks/decisions/open_items so HistoryTab inside the risk drawer can fetch `/api/audit/risks/[id]/history` | ✅ |

### Production-Ready Decision

**READY** for status `Approved`.

H1 + M1 + M2 all fixed in one iteration (Pfad A). H1 + M1 closed by a single BEFORE-UPDATE trigger that pins decisions to insert-only with a one-way `is_revised` flip, verified end-to-end against the live database (direct body mutation → rejected; `is_revised=false` flip-back → rejected; legitimate 3-generation revision chain → succeeds). M2 closed by adding a Stakeholder Select to DecisionForm with the spec-mandated warning toast on submit-without-decider.

No Critical or High bugs remain. Type-check, build, and 190/190 vitest all green. Lint baseline unchanged.

### Suggested follow-ups (not blockers)
1. L1 — bulk-import migration with `decision_imported` reason (when needed).
2. L2 — backdate decided_at via the form (small UI add).
3. L3 — rate limiting on the new endpoints (consistent project-wide pattern).
4. L4 — phase + risk pickers in DecisionForm (DB+API already accept; UI gap only).
5. I1 — E2E test suite (project-wide gap, not a PROJ-20 regression).

## Deployment

- **Production URL:** https://projektplattform-v3.vercel.app
- **Entry points:** `/projects/[id]/risiken` (replaces the PROJ-7 coming-soon) and `/projects/[id]/entscheidungen` (new tab combining decisions timeline + open items panel).
- **Deployed:** 2026-04-29 via auto-deploy from `main`. Final pre-tag commit: `c8033c5` (H1+M1+M2 fix).
- **Migrations applied to project iqerihohwabyjzkpcujq (Supabase):**
  - `20260429120000_proj20_risks_decisions_open_items.sql` — risks + decisions + open_items tables, RLS, audit-whitelist extension, decisions INSERT trigger, predecessor flip trigger, convert RPCs.
  - `20260429120100_proj20_harden_trigger_only_functions.sql` — revoke EXECUTE on the trigger-only functions.
  - `20260429140000_proj20_decisions_immutability_trigger.sql` — `enforce_decision_immutability()` BEFORE-UPDATE trigger that closes H1 + M1 (decision body and is_revised pinned to insert-only / one-way false→true via the legitimate flip path).
- **Vercel deploy status:** GitHub commit status on `c8033c5` = `success` ("Deployment has completed").
- **Pre-deploy checks:** `npm run build` ✅; `npm run lint` baseline unchanged at 51 problems (none from PROJ-20); `npx vitest run` 190/190 ✅; `npx tsc --noEmit` clean ✅.
- **Tag:** `v0.5.0-PROJ-20`.
