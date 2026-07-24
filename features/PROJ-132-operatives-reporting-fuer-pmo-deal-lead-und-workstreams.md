---
id: PROJ-132
title: "Operatives Reporting für PMO, Deal Lead und Workstreams"
issue_type: Story
epic_code: M
epic_title: "Reporting & Dashboards"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-m", "should-have"]
dependencies: ["C1", "D1", "G2", "G3", "B4", "H1", "L2"]
roles: ["PMO-Lead", "Deal Lead", "Stream Leads", "Workstream Leads PMI", "Externe Berater"]
summary_for_jira: "[M2] Operatives Reporting für PMO, Deal Lead und Workstreams"
---

# PROJ-132: Operatives Reporting für PMO, Deal Lead und Workstreams

## Status: In Progress (backend live — RPC + data/export routes + 13 tests; /frontend next)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic M — Reporting & Dashboards)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-21 + PROJ-64 (merge mit PROJ-131). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** M — Reporting & Dashboards  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-m` · `should-have`  
> **Abhängigkeiten:** `C1`, `D1`, `G2`, `G3`, `B4`, `H1`, `L2`

**User Story:**

Als PMO-Lead möchte ich operativ verwertbare Listen und Statussichten (offene Aufgaben mit Fristüberschreitung, offene Findings, offene Q&A, fehlende Pflicht-Deliverables, fehlende Freigaben) je Deal und je Workstream haben, damit ich Steuerungseingriffe rechtzeitig anstoßen kann.

**Beschreibung / Kontext:**

Neben dem Management-Reporting (M1) braucht es einen operativen Reporting-Layer. Dieser ist die Grundlage der wöchentlichen Steuerung und der Vorbereitung der Regelgremien (H1).

**Akzeptanzkriterien:**

- [ ] Pro Deal sind mindestens vier operative Sichten konfigurierbar: 'Aufgaben mit Fristüberschreitung' (C1), 'Offene Findings nach Schwere' (G3), 'Q&A-Stand je Stream' (G2), 'Deliverables-Status' (D1).
- [ ] Sichten sind filterbar nach Workstream, Owner, Phase, Klassifikation (L2).
- [ ] Eine 'Wöchentliche-Steuerung-Sicht' bündelt die wichtigsten operativen Werte als Pre-Read für das Deal Core Team (H1).
- [ ] Berichte können als PDF/Excel exportiert werden.
- [ ] Sichten respektieren das Berechtigungskonzept (B4) – externe Berater sehen nur ihren Stream.

**Abgrenzungen (Out of Scope):**

- Kein Aufgaben-Management-Tool-Ersatz; Sichten bauen auf den vorhandenen Objekten auf.
- Keine Workflow-Automatisierung über das Reporting hinaus.

**Offene Fragen:**

- Sollen Sichten als E-Mail-Digest (z. B. wöchentlich) automatisch verteilt werden?
- Welche Sicht ist Pflicht-Pre-Read für welches Gremium?

**Definition of Ready:**

- [ ] Sichten und Filter sind mit PMO und Stream-Leads abgestimmt.
- [ ] Export-Anforderungen sind dokumentiert.

**Definition of Done:**

- [ ] Vier operative Sichten sind verfügbar, gefiltert und exportierbar.
- [ ] Berechtigungen sind getestet.
- [ ] Pre-Read-Sicht funktioniert für ein Pilot-Gremium.

**Abhängigkeiten:**

- C1
- D1
- G2
- G3
- B4
- H1
- L2

**Betroffene Rollen:**

- PMO-Lead
- Deal Lead
- Stream Leads
- Workstream Leads PMI
- Externe Berater

---

## Tech Design (Solution Architect)

> **Klasse: VIEW (DUP→REUSE).** Architektur-CIA 2026-07-24: keine neue Persistenz, kein neues Dep. PROJ-132 baut **nichts** neu, was der Core schon aggregiert — es bündelt vier bereits existierende Aggregate zu einer operativen Steuerungssicht + Wochen-Pre-Read und surft sie als eigenen M&A-Tab mit Filtern + Export. Direkte Anwendung des **PROJ-116-Musters** (`dd_report_consolidated`): eine lesende Funktion mit Anrufer-Kontext → Need-to-know & Externen-Berater-Beschränkung kommen ohne eine Zeile Extra-Code.

### Was gebaut wird (WAS, nicht WIE)

**1. Eine neue lesende Auswertungsfunktion `operative_report` (pro Projekt).**
Sie liefert in einem Aufruf vier operative Abschnitte + einen Wochen-Pre-Read-Block. Sie schreibt nichts, legt keine Tabelle an, läuft **im Rechte-Kontext des Aufrufers** (wie PROJ-116). Dadurch greifen die bestehenden Vertraulichkeits-Filter (Need-to-know, B4) automatisch auf jeder Quelle — inklusive der Regel „externer Berater sieht nur seinen Stream". Die Abschnitte übernehmen **exakt die bereits etablierten Definitionen**, damit keine divergenten Zahlen entstehen:

| Abschnitt (AC) | Wiederverwendete Quelle / Definition | Neu? |
|---|---|---|
| Aufgaben mit Fristüberschreitung (C1) | gleiche Logik wie PROJ-103 `project_task_bottlenecks` (offen = todo/in_progress/blocked, `days_overdue`, Buckets überfällig/heute/diese Woche, blockiert) inkl. Workstream/Phase/Owner/Klassifikation je Zeile | Reuse |
| Offene Findings nach Schwere (G3) | gleiche Gruppierung wie PROJ-114 `dd_findings_summary` (je Stream × Schwere niedrig/mittel/hoch/deal_breaker, EUR-Summe, `null_eur_count`) | Reuse |
| Q&A-Stand je Stream (G2) | gleicher „offen"-Kontrakt wie PROJ-116 (`offen` = Status ∉ {answered, closed}, `beantwortet` = ∈ {answered, closed}) | Reuse |
| Deliverables-Status (D1) | Status-Verteilung je Workstream/Phase über `deliverables` (planned/in_progress/in_review/approved/suspended), Ampel „überfällig" via `due_date` | Reuse |
| **Wochen-Steuerungs-Pre-Read (H1)** | verdichtet die Kernzahlen der vier Abschnitte zu einer Pre-Read-Kachelzeile (überfällige Aufgaben · offene Deal-Breaker-Findings · offene Q&A · nicht-freigegebene Pflicht-Deliverables) | Neu (nur Verdichtung) |

**2. Eine Daten-Route** (`/api/projects/[id]/operative-report`) — ruft die Funktion mit dem Session-Client des angemeldeten Nutzers auf (`requireProjectAccess "view"`, **nie** Service-Role). Damit ist B4/Need-to-know serverseitig garantiert.

**3. Ein neuer Projektraum-Tab „Operatives Reporting"** (M&A-typ-gegated, `requiresProjectType: "ma"`, Route `operatives-reporting`) — analog zu „DD-Bericht"/„Engpässe". Zeigt die vier Abschnitte + Pre-Read-Block.

**4. Filter (Anzeige-seitig, Muster wie PROJ-103):** Workstream · Owner · Phase · Klassifikation. Die Funktion liefert die (bereits need-to-know-gefilterten) Zeilen, die Feinfilterung/Gruppierung passiert clientseitig — konsistent mit dem etablierten Engpässe-Muster, kein zusätzliches Angriffs-/Filterargument auf der Funktion.

**5. Export:**
- **CSV** (öffnet in Excel) je Abschnitt — über eine Export-Route, die dieselbe Funktion serverseitig erneut aufruft (Single-Source-of-Truth), mit der etablierten Formel-Injektion-Escaping-Zelle (`csvCell`, wie PROJ-103/113). Kein neues Dep (`papaparse` vorhanden).
- **PDF** über eine chrome-lose `/print`-Seite außerhalb der `(app)`-Gruppe (Browser-Print-to-PDF, PROJ-21-Muster wie PROJ-116 `dd-report/print`), Session-Client-RLS-gebunden, `robots: noindex`.

### Datenmodell (Klartext)
**Keine neue Tabelle, keine Migration an Bestandstabellen, kein Audit-Trio-Touch.** Die einzige DB-Änderung ist die neue lesende Funktion (SECURITY INVOKER, `stable`, revoke public/anon, grant authenticated) — mirror des PROJ-116-Grant-Musters. Keine Spaltenänderung an `work_items`/`dd_findings`/`dd_questions`/`deliverables`. → **Null Kollisionsfenster mit der laufenden PROJ-118-Session** (die berührt Migrationen/Audit-Trio; PROJ-132 nicht).

### Berechtigungen (B4)
Kein zweites Rechtemodell. Weil die Funktion im Aufrufer-Kontext läuft, filtern die bestehenden RESTRICTIVE-Vertraulichkeits-Policies auf `work_items`/`dd_findings`/`dd_questions`/`deliverables`/`dd_streams` die Zeilen **vor** der Aggregation. Die additive Advisor-Regel in `can_access_classified` (NDA + aktives Mandat + Stream, PROJ-99) beschränkt externe Berater automatisch auf ihren Stream. Pflicht-QA: Live-Need-to-know-Pentest (Admin vs. nicht-cleared Member vs. Advisor vs. Cross-Tenant), inkl. Aggregat-Leak-Probe (keine vertraulichen Zahlen in den Summen eines sichtbaren Streams).

### Abhängigkeiten (verifiziert Deployed)
C1=PROJ-101 ✅ · D1=PROJ-104 ✅ · G2=PROJ-113 ✅ · G3=PROJ-114 ✅ · B4=PROJ-100 ✅ · H1=PROJ-117 ✅ · L2=PROJ-129 ✅. Kein neues npm-Paket.

### Bewusste Abgrenzungen / Deviations
- **Standalone statt Merge mit PROJ-131** (Management-Dashboard, aktuell blockiert I1/I2/K2). Die Spec-Reuse-Note nennt „merge mit PROJ-131"; da 131 nicht baubar ist, wird 132 als eigenständiger operativer Tab gebaut. Merge-Klausel = dokumentierte Deviation; wenn 131 kommt, kann es den `operative_report`-Output mitverwenden.
- **Excel = CSV** (öffnet in Excel). Echtes `.xlsx` bräuchte ein neues Dep → out-of-scope-Followup (Repo-Konvention, wie PROJ-103/113).
- **E-Mail-Digest** (offene Frage) → out of scope; Followup-Kandidat (braucht PROJ-13-Outbox + Cron).
- **Gremium-Pflicht-Pre-Read-Mapping** (offene Frage) → MVP liefert EINEN generischen Wochen-Pre-Read; feste Gremien-Zuordnung deferred (Andockpunkt PROJ-117 Meetings).

### Komponenten (Baum)
```
Projektraum (M&A) → Tab „Operatives Reporting"
├── Wochen-Steuerungs-Pre-Read (Kachelzeile: 4 Kernzahlen)
├── Filterleiste (Workstream · Owner · Phase · Klassifikation)
├── Abschnitt „Aufgaben mit Fristüberschreitung"  (Reuse PROJ-103-Logik)
├── Abschnitt „Offene Findings nach Schwere"       (Reuse PROJ-114)
├── Abschnitt „Q&A-Stand je Stream"                (Reuse PROJ-116-Kontrakt)
├── Abschnitt „Deliverables-Status"                (Reuse PROJ-104)
├── [CSV-Export je Abschnitt]  [PDF (Print-Seite)]
└── Leerzustände / Need-to-know-gefiltert (keine verbotenen Zeilen)
```

### Slice-Größe & Handoff
~2–3 PT. Reine Reuse-/VIEW-Slice, kein neuer CIA-Pass nötig (spec-following, Template PROJ-116). Handoff: `/backend` (Funktion + Daten-/Export-Routen + Live-Pentest) → `/frontend` (Tab + Filter + Print-Seite) → `/qa` (Need-to-know-Pentest + Playwright-Auth-Gates) → `/deploy`.

### Implementation Notes — /backend (2026-07-24)
**Migration `20260724120000_proj132_operative_report.sql` in Prod-DB** (MCP-registrierte Version driftet ggf. zum Repo-Dateinamen — benign, da idempotentes `create or replace function`, PROJ-134-Domäne). Eine SECURITY-INVOKER-Funktion `operative_report(p_project_id uuid) → jsonb`, `stable`, `set search_path = public, pg_temp`, `revoke public/anon` + `grant authenticated` (mirror PROJ-116). Bündelt:
- `tasks_overdue` (C1) — verbatim PROJ-103-`project_task_bottlenecks`-Logik (offen = todo/in_progress/blocked, `days_overdue`, disjunkte Buckets, `is_blocked`) + Summary.
- `findings_by_severity` (G3) — **offene** dd_findings (status open/in_review) je Stream × Schwere (niedrig/mittel/hoch/deal_breaker, eur_sum, null_eur_count) + Einzel-Rows für Drill-down/Export.
- `qa_by_stream` (G2) — dd_questions offen/beantwortet je Stream, exakter PROJ-116-„offen"-Kontrakt (status ∉ answered/closed).
- `deliverables_status` (D1) — deliverables je Workstream/Phase mit Status + `is_overdue` (due<heute ∧ status≠approved) + Status-Count-Summary.
- `pre_read` (H1) — Wochen-Headline: überfällige Aufgaben · offene Deal-Breaker-Findings · offene Q&A · nicht-freigegebene Deliverables.

**Routen:** `GET /api/projects/[id]/operative-report` (Session-Client, `requireProjectAccess "view"`, RPC-Call, null→EMPTY_REPORT) + `GET …/operative-report/export?section=tasks|findings|qa|deliverables` (CSV, dieselbe RPC = Single-Source-of-Truth, `csvCell`-Formel-Injektion-Escaping, Owner-Namensauflösung via profiles, `X-Export-Scope`-Header). Beide **nie** service-role.

**Pflicht-Live-RPC-Smoke gegen Prod (bestanden):** Funktion ist `is_definer=false` (INVOKER), `authenticated`=exec, `anon`≠exec; echter Aufruf liefert alle 5 Top-Keys + vollständigen `pre_read`/`summary`-Shape; C1-Aggregation exakt 32/32 offene Work-Items (kein stiller Drop), Summary korrekt (blocked=2). Kein M&A-Projekt mit DD-/Deliverable-Daten in Prod → Findings/Q&A/Deliverables-Aggregation + Need-to-know-Filterung werden im `/qa`-Pentest mit geseedeten Daten + echter Non-Admin-Session geprüft (execute_sql läuft als Superuser, umgeht RLS).

**Gates:** vitest +13 (2 neue Route-Tests: 5 Daten + 8 Export inkl. Formel-Injektion + Owner-Auflösung), lint 0, tsc 0 neu, build clean (beide Routen registriert). Kein neues Dep. FE (Tab + Filter + Print-Seite) → `/frontend`.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · M — Reporting & Dashboards_
