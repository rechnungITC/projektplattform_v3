---
id: PROJ-103
title: "Phasenübergreifende Aufgaben- und Engpass-Übersicht"
issue_type: Story
epic_code: C
epic_title: "Aufgaben & Workstreams"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-c", "should-have"]
dependencies: ["C1", "C2"]
roles: ["Deal Lead", "PMO-Lead", "Workstream Leads"]
summary_for_jira: "[C3] Phasenübergreifende Aufgaben- und Engpass-Übersicht"
---

# PROJ-103: Phasenübergreifende Aufgaben- und Engpass-Übersicht

## Status: Deployed (2026-07-22)
**Created:** 2026-06-10
**Deployed:** 2026-07-22 — Tag `v2.16.0-PROJ-103`. Migration `20260721184740_proj103_task_bottlenecks` (INVOKER-RPC `project_task_bottlenecks`) seit /backend in Prod; kein Runtime-DB-Change (reine VIEW/RPC-Lesesicht). Rebase auf aktuellen main konfliktfrei; Post-Deploy-Smoke: 307-Auth-Gate auf `/projects/[id]/engpaesse` + `/api/projects/[id]/task-bottlenecks` (+ Export). Followup offen: PROJ-Y-103a (AC3-Cockpit-Embed), .xlsx out-of-scope.
**Origin:** M&A-Platform Backlog (Epic C — Aufgaben & Workstreams)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: Aggregation auf PROJ-9/19. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** C — Aufgaben & Workstreams  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-c` · `should-have`  
> **Abhängigkeiten:** `C1`, `C2`

**User Story:**

Als Deal Lead möchte ich eine projektweite Sicht über alle offenen, überfälligen und blockierten Aufgaben über alle Workstreams sehen, damit ich Engpässe und Eskalationsbedarfe erkennen kann.

**Beschreibung / Kontext:**

Im Verlauf eines Deals laufen Hunderte Aufgaben parallel. Ohne phasenübergreifende Sicht ist Engpassmanagement nicht möglich.

**Akzeptanzkriterien:**

- [ ] Eine Cross-Workstream-Tabelle zeigt: Aufgabentitel, Workstream, Phase, Verantwortlicher, Frist, Status, Tage über Frist.
- [ ] Schnellfilter: 'Überfällig', 'Heute fällig', 'Diese Woche', 'Blockiert', 'Nach Verantwortlichem', 'Nach Workstream'.
- [ ] Top-3-Engpässe (z. B. die ältesten überfälligen Aufgaben) werden auf dem Projekt-Dashboard angezeigt.
- [ ] Export als Excel/CSV ist möglich.

**Abgrenzungen (Out of Scope):**

- Keine automatische Eskalationsfunktion.
- Keine KI-gestützte Priorisierung.

**Offene Fragen:**

- Welche Eskalationsregeln (z. B. nach 7 Tagen automatische Info an Deal Lead) sind gewünscht?
- Soll diese Übersicht auch für Externe gefiltert sichtbar sein?

**Definition of Ready:**

- [ ] Filterlogik und Spaltenstruktur sind freigegeben.
- [ ] Performance-Erwartung ist definiert.

**Definition of Done:**

- [ ] Übersicht ist verfügbar, performant und exportierbar.

**Abhängigkeiten:**

- C1, C2

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Workstream Leads

## Tech Design (Solution Architect) — 2026-07-21

**Klasse: VIEW · DUP→REUSE.** Keine neue Tabelle, kein neues Feld, kein neues Paket. PROJ-103 ist eine reine Lesesicht über bereits deployte Core-Objekte: `work_items` (Titel/Status/`due_date`/`responsible_user_id`/`phase_id`/`workstream_id` — PROJ-9/101/102), `phases` (Name — PROJ-19), `workstreams` (Label — PROJ-102).

### Kernbefund der Bestandsaufnahme
- Die Filter-Bausteine existieren schon: `GET /api/projects/[id]/work-items` filtert bereits nach Verantwortlichem, Phase, Fristfenster (PROJ-101). Der M&A-Aufgaben-Tab (`ma-tasks-page`) zeigt Aufgaben pro Projekt mit Überfällig-Rot.
- Was fehlt für Engpassmanagement: eine **projektweite, workstream-übergreifende** Sicht mit berechneter **„Tage über Frist"**, Schnellfilter-Chips, **Top-3-Engpässe** und **Export**.

### Was PROJ-103 neu liefert
1. **Eine Auswertungs-Funktion** `project_task_bottlenecks(projekt)` (SECURITY INVOKER — spiegelt das live `risk_measure_overview` aus PROJ-109 und `workstream_dashboard` aus PROJ-102/104). Sie läuft als der aufrufende Nutzer, joint Workstream-Label + Phasen-Name an jede offene Aufgabe, berechnet server-seitig „Tage über Frist" und ordnet jede Aufgabe einem Bucket zu (überfällig / heute fällig / diese Woche / blockiert). Sie gibt zusätzlich die **Top-3-Engpässe** (älteste überfällige Aufgaben) als Zusammenfassung zurück — AC1 + AC3 aus einer Quelle.
   - **Warum INVOKER:** Die Vertraulichkeits-Filterung (Need-to-know, PROJ-100a/107) greift automatisch über das bestehende RESTRICTIVE-Gate auf `work_items` — kein zweites Rechtemodell, gleiche Lektion wie PROJ-109. Aufgaben, die der Aufrufer nicht sehen darf, erscheinen nicht in Tabelle, Top-3 oder Export.
2. **Neue Seite** `/projects/[id]/engpaesse` (neuer M&A-Nav-Eintrag „Engpässe", nur `project_type='ma'`): oben eine **Top-3-Engpässe-Kachel** (AC3), darunter die **Cross-Workstream-Tabelle** mit den geforderten Spalten (Titel, Workstream, Phase, Verantwortlicher, Frist, Status, Tage über Frist) — AC1.
3. **Schnellfilter-Chips** (AC2) rein client-seitig über die zurückgegebene Menge (Überfällig / Heute fällig / Diese Woche / Blockiert + Gruppierung nach Verantwortlichem / Workstream) → sofort, keine Server-Roundtrips.
4. **CSV-Export-Route** `/api/projects/[id]/task-bottlenecks/export` (spiegelt `decisions/export` aus PROJ-111: RLS-begrenzt, Formula-Injection-Escaping, `X-Export-Scope`-Header). Öffnet in Excel — AC4. Echtes `.xlsx` bewusst out of scope.

### Komponentenstruktur (PM-lesbar)
```
Engpässe-Seite (/projects/[id]/engpaesse)
├── Top-3-Engpässe-Kachel        (älteste überfällige Aufgaben — AC3)
├── Schnellfilter-Chips          (Überfällig · Heute · Diese Woche · Blockiert · nach Person/Workstream — AC2)
├── Export-Button                (CSV — AC4)
└── Cross-Workstream-Tabelle     (Titel · Workstream · Phase · Verantwortlich · Frist · Status · Tage über Frist — AC1)
```

### Datenmodell (Klartext)
Keine Persistenz-Änderung. Die Auswertung liefert je offener Aufgabe: Titel, Status, Frist, Verantwortlicher (ID → Name client-seitig aufgelöst wie in `ma-tasks-page`), Phasen-Name, Workstream-Label, Tage-über-Frist (heute − Frist, nur wenn überfällig), Bucket. Plus Zusammenfassung: Top-3 überfällige.

### Technische Entscheidungen (WARUM)
- **RPC statt Client-Joins:** „Tage über Frist" + Buckets einmal server-seitig (konsistent, keine Client-Datumsdrift) und Need-to-know gratis via INVOKER. Ein Aufruf deckt Tabelle + Top-3.
- **Export ruft dieselbe RPC:** eine Wahrheitsquelle, keine duplizierte Join-Logik.
- **Schnellfilter client-seitig:** die RPC liefert alle relevanten (nicht-erledigten) Aufgaben mit Buckets; Chips filtern lokal → sofortige UX.

### AC-Abdeckung
- AC1 Cross-Workstream-Tabelle mit allen Spalten → RPC-Zeilen + Tabelle ✅
- AC2 Schnellfilter → client-seitige Chips ✅
- AC3 Top-3-Engpässe → Top-3-Kachel oben auf der Engpässe-Seite ✅ *(Deviation: die Seite IST das projektweite Engpass-Dashboard; ein zusätzliches Einbetten in das PROJ-56-Readiness-Cockpit wäre cross-concern → Follow-up PROJ-Y-103a, falls gewünscht)*
- AC4 CSV-Export → Export-Route ✅ *(echtes .xlsx out of scope, CSV öffnet in Excel)*

### Bewusst außerhalb / vorwärtskompatibel
- Keine automatische Eskalation, keine KI-Priorisierung (Spec-Out-of-Scope).
- Externe-gefilterte-Sicht: erbt automatisch über Need-to-know-Gate (kein Sonderweg).

### Abhängigkeiten (Pakete)
Keine neuen. Reuse: shadcn Card/Table/Badge, `useWorkstreams`/`usePhases`/Responsible-Resolver, `apiError`/`requireProjectAccess`, CSV-Helfer-Muster aus PROJ-111.

### CIA-Einordnung
Nicht CIA-pflichtig: spec-following VIEW-Slice, kein neues Dep, keine neue Tabelle, kein neues Persistenz-/RLS-Muster (INVOKER-Aggregation ist etabliert: PROJ-102/104/109/116).

### Handoff
`/backend` (Migration `project_task_bottlenecks` INVOKER-RPC + Export-Route + Pflicht-Live-RPC-Smoke) → `/frontend` (Engpässe-Seite + Nav) → `/qa` (Need-to-know-Pentest + Playwright Auth-Gates).

## Implementierungs-Notizen — Backend (2026-07-21)

- **Migration `20260721184740_proj103_task_bottlenecks`** in Prod (MCP-Version = Repo-Dateiname; Datei zur Prod-Version umbenannt per PROJ-134). Eine Funktion `project_task_bottlenecks(uuid)→jsonb`, **`language sql` / `stable` / `security invoker`** / `search_path=public,pg_temp`, `revoke public,anon` + `grant authenticated`. Verifiziert: `prosecdef=false`, authenticated-exec ✅, anon-exec ✗.
- **Rückgabe** `{ tasks, top_bottlenecks, summary }`: offene Aufgaben (Status `todo/in_progress/blocked`, `done/cancelled` ausgeschlossen) mit Workstream-/Phasen-Label (LEFT JOIN), `days_overdue`, disjunkten Datums-Buckets (`is_overdue`/`is_due_today`/`is_due_this_week`, „diese Woche" = bis inkl. kommenden Sonntag via `isodow`) + orthogonalem `is_blocked`; Top-3 = älteste überfällige (`days_overdue desc`); Summary-Counts. Need-to-know erbt via `work_items`-RESTRICTIVE-Gate (INVOKER, kein zweites Rechtemodell).
- **Routen:** `GET /api/projects/[id]/task-bottlenecks` (RPC-Delegation, session-client, `requireProjectAccess(view)`) + `GET …/task-bottlenecks/export` (CSV — ruft **dieselbe RPC** = eine Wahrheitsquelle, löst Verantwortliche-Namen via `profiles` unter Caller-RLS auf, Formula-Injection-Escaping + `X-Export-Scope`-Header, Muster PROJ-111). Client-Wrapper `src/lib/work-items/task-bottlenecks.ts` (+ `normaliseRow` coerct NULL-Booleans→false) + Hook `use-task-bottlenecks.ts`.
- **Pflicht-Live-RPC-Smoke gegen Prod (rollback, 0 Residue):** M&A-Projekt + Phase + Workstream + 7 Aufgaben geseedet → RPC-Ausgabe verifiziert: 6 offen (done ausgeschlossen), T1 overdue/10d + T2 overdue/3d, T3 due_today, T4 due_this_week, T7 kein Bucket, T5 blocked/nicht-overdue; Labels korrekt; summary open 6/overdue 2/today 1/this_week 1/blocked 1; top_bottlenecks T1(10),T2(3). 0 Residue bestätigt.
- **Gates:** ESLint 0, tsc 0 neu (baseline unberührt), vitest **+14** (10 Route + 4 Lib) grün, build clean (beide Routen registriert). Kein neues Dep, keine neue Tabelle/Feld.
- Kein Fresh-Apply-Guard nötig: PROJ-103 referenziert nur `work_items`/`phases`/`workstreams` (kein PROJ-107-`risks`-Bezug); `work_items.confidentiality_level` stammt aus PROJ-100a (fresh-apply-sauber).

→ `/frontend` (Engpässe-Seite `/projects/[id]/engpaesse` + M&A-Nav-Eintrag).

## Implementierungs-Notizen — Frontend (2026-07-21)

- **Nav:** neuer M&A-Nav-Eintrag `MA_BOTTLENECKS_SECTION` (id `ma-bottlenecks`, Label „Engpässe", Icon `Gauge`, tabPath `engpaesse`, `requiresProjectType: 'ma'`) — in `withMaFoundation` direkt nach Workstreams eingehängt (Epic C, cross-workstream). method-templates 124/124 grün.
- **Route** `src/app/(app)/projects/[id]/engpaesse/page.tsx` → **`MaBottlenecksPage`** (`src/components/projects/ma/ma-bottlenecks-page.tsx`):
  - **AC3 Top-3-Kachel** oben (`top_bottlenecks` aus der RPC, älteste überfällige, „N Tage über").
  - **AC2 Schnellfilter-Chips** (single-select, rein client-seitig über die RPC-Menge): Alle / Überfällig / Heute fällig / Diese Woche / Blockiert — mit Count-Badges aus der Summary; plus **Gruppierung** (keine / nach Verantwortlichem / nach Workstream).
  - **AC4 CSV-Export-Button** → `taskBottlenecksExportUrl` (`<a download>`, disabled bei 0 Aufgaben).
  - **AC1 Cross-Workstream-Tabelle** (shadcn `Table`, `overflow-x-auto`): Aufgabe · Workstream · Phase · Verantwortlich · Frist · Status · Tage über Frist. Überfällige Frist rot, „Tage über Frist" als destructive-Badge, blockierte Status-Badge destructive.
  - Verantwortliche-Namen via `useTenantMembers`; Workstream/Phase-Label kommen fertig aus der RPC. Loading/Error/Empty (grüner „keine offenen Aufgaben") + „kein Treffer für Filter"-State.
- **Gates:** ESLint 0, tsc 0 neu, method-templates 124/124, build clean (Route `/projects/[id]/engpaesse` registriert). Kein neues shadcn-Primitive nötig (Card/Table/Badge/Button/Select vorhanden), kein neues Dep.

→ `/qa` (Need-to-know-Pentest gegen `project_task_bottlenecks` + Playwright Auth-Gates auf beiden Routen + Seite).

## QA Test Results — 2026-07-21 (PASS · Production-Ready)

**0 Critical / 0 High.** VIEW-Slice, DUP→REUSE, kein neues Dep/Tabelle.

### Akzeptanzkriterien
- **AC1** Cross-Workstream-Tabelle (Titel/Workstream/Phase/Verantwortlich/Frist/Status/Tage über Frist) — ✅ RPC-Zeilen + shadcn-Table; `days_overdue` server-berechnet.
- **AC2** Schnellfilter (Überfällig/Heute/Diese Woche/Blockiert + Gruppierung Verantwortlich/Workstream) — ✅ client-seitig über die RPC-Menge, Count-Badges aus Summary.
- **AC3** Top-3-Engpässe — ✅ Top-3-Kachel oben (älteste überfällige). *Deviation: auf der Engpässe-Seite (= projektweites Engpass-Dashboard); Cockpit-Embed → Follow-up PROJ-Y-103a.*
- **AC4** Export — ✅ CSV (öffnet in Excel), RLS-scoped, Formula-Injection-safe. *`.xlsx` out of scope.*

### Security / Need-to-know-Pentest (Pflicht, live gegen Prod, rolled back, 0 Residue)
`tests/sql/PROJ-103-task-bottlenecks-pentest.sql` **A–G 7/7 PASS** gegen `project_task_bottlenecks` (SECURITY INVOKER):
- A/B Admin-Bypass: 4 offene (W_done ausgeschlossen), open=4/overdue=2/today=1/blocked=1; Top-3 = [W_conf(8), W_std(5)].
- C/D **nicht-cleared Member sieht nur die 2 standard-Aufgaben** (W_conf confidential + W_strict strict absent) — **Aggregat-Leak-Probe: `blocked_total=0`**, obwohl es eine blockierte (strict) Aufgabe gibt → Summary/Top-3 werden über gegatete Zeilen berechnet, kein Leak über Counts.
- E confidential-cleared: 3 offen (std+conf), NICHT strict, blocked=0.
- F **anon kann die Funktion nicht ausführen** (revoke).
- G **cross-tenant Member: 0 Aufgaben** (kein Leak).
- Grants verifiziert: `prosecdef=false`, authenticated-exec ✅, anon-exec ✗. CSV-Export teilt dieselbe INVOKER-RPC → gleiche Sicht (keine zweite Angriffsfläche); `profiles`-Namensauflösung unter Caller-RLS.

### Playwright (chromium)
`tests/PROJ-103-task-bottlenecks.spec.ts` — **4/4 grün**: GET `…/task-bottlenecks`, GET `…/task-bottlenecks/export`, malformed-id, `/projects/[id]/engpaesse` alle auth-gated (307). Autorisierungs-Tiefe deckt der Live-Pentest ab. Route-Unit 10/10 + Lib-Unit 4/4.

### Befunde
- Keine Critical/High/Medium. Deviations: AC3-Cockpit-Embed → PROJ-Y-103a; `.xlsx` → out of scope (CSV). Beide im Tech-Design gelockt.
- **D-1 (Env):** Mobile-Safari-Projekt skipped (WebKit-Host-Libs fehlen — bekanntes PROJ-67/F2 `sudo npx playwright install-deps webkit`).

### Regression
vitest **+14** (10 Route + 4 Lib) + method-templates 124/124 grün; build clean (Routen registriert); ESLint 0; tsc 0 neu. Nav-Change (neuer M&A-Eintrag) berührt keine anderen Methoden (method-templates-Tests grün).

**Production-Ready: JA.** → `/deploy`.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
