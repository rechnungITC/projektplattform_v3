---
id: PROJ-131
title: "Management-Reporting und Steering-Dashboard"
issue_type: Story
epic_code: M
epic_title: "Reporting & Dashboards"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-m", "should-have"]
dependencies: ["A2", "E2", "G3", "I1", "I2", "K2", "F1", "L2"]
roles: ["Executive Sponsor", "Steering Committee", "Deal Lead", "PMO-Lead", "Corporate Development"]
summary_for_jira: "[M1] Management-Reporting und Steering-Dashboard"
---

# PROJ-131: Management-Reporting und Steering-Dashboard

## Status: Planned (Requirements refined 2026-07-28 — gegen deployten Stand geerdet, Scope-Schnitt gelockt; → /architecture)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic M — Reporting & Dashboards)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-64 Dashboard + PROJ-21. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **⚠️ CIA-Reuse-Note-Korrektur (2026-07-28):** Die ursprüngliche Note „merge mit PROJ-132" ist **überholt**. PROJ-132 (Operatives Reporting) wurde am 2026-07-27 **standalone** als VIEW-class deployed (`operative_report`-SECURITY-INVOKER-Funktion + M&A-Tab + CSV + Print-to-PDF, Tag `v2.25.0-PROJ-132`). PROJ-131 wird **kein Merge**, sondern spiegelt dasselbe Muster auf **Management/Steering-Ebene** (Executive Sponsor / Steering Committee) — das Pendant zu PROJ-132s operativer Ebene (PMO / Deal Lead / Workstreams). Referenz-Implementierung: `PROJ-132-*.md` Tech Design (`operative_report`, `/print`-Seite, `csvCell`, Aggregat-Leak-Pentest).

> **Epic:** M — Reporting & Dashboards  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-m` · `should-have`  
> **Abhängigkeiten:** `A2`, `E2`, `G3`, `I1`, `I2`, `K2`, `F1`, `L2`

**User Story:**

Als Executive Sponsor möchte ich pro Deal und über alle Deals hinweg ein Steering-Dashboard mit den wichtigsten Kennzahlen (Phase, Stage-Gate-Status, Top-Findings/Red Flags, Kaufpreisbandbreite, Synergiestand) sehen können, damit ich Entscheidungs- und Eskalationsbedarf schnell erkenne.

**Beschreibung / Kontext:**

Das Modell verlangt eine Steuerung auf Geschäftsführungs- und Steering-Committee-Ebene. Die Plattform muss aus den operativen Daten ein verdichtetes Management-Reporting erzeugen, das ohne manuelle Aufbereitung tagesaktuell ist.

**Akzeptanzkriterien (MVP — buildbar gegen den deployten Stand):**

- [ ] **AC-131-1 (Pro-Deal Steering-Dashboard):** Pro Deal zeigt das Dashboard mindestens: aktuelle Phase + Status (PROJ-95/19), **nächstes offenes Stage-Gate** mit Status (F1 = PROJ-110 ✅), **Top-5 Red Flags** (G3 = PROJ-114 `severity ∈ {hoch, deal_breaker}` + E2 = PROJ-107 Risikoregister ✅), **kritische offene Aufgaben** (überfällig/blockiert, PROJ-101/103 ✅).
- [ ] **AC-131-2 (Klassifikations-gated Sichtbarkeit, L2):** Sichtbarkeit folgt der Vertraulichkeit (L2 = PROJ-100a/129 ✅) über den **Caller-Kontext einer SECURITY-INVOKER-Auswertungsfunktion** (mirror PROJ-132/116) — Sponsor sieht alles, andere Rollen nur ihnen Zugängliches; **Aggregate/Headline-Zahlen leaken keine nicht-zugänglichen Objekte** (Aggregat-Leak-Pentest Pflicht, wie PROJ-132 A–G).
- [ ] **AC-131-3 (Drill-down):** Von jedem Dashboard-Element ist ein Sprung zum Detailobjekt möglich (Stage-Gate → `/stage-gates`, Red Flag → DD-Findings/Risiko, Aufgabe → `/aufgaben`/`/engpaesse`).
- [ ] **AC-131-4 (Export):** Bericht als **Print-to-PDF** (chrome-lose `/print`-Seite außerhalb `(app)`, PROJ-21-Muster wie PROJ-116/132, Session-Client-RLS-gebunden, `robots: noindex`) + optional **CSV** je Abschnitt (`csvCell`-Formel-Escaping, Single-Source via erneuter Funktionsaufruf serverseitig).
- [ ] **AC-131-5 (Vorwärts-kompatible Platzhalter):** **Kaufpreisbandbreite** (I1/I2) und **Synergie-Stand** (K2) erscheinen als sichtbare „noch nicht verfügbar"-Kacheln (Modul nicht aktiv/nicht gebaut), damit die Steering-Dashboard-Struktur vollständig ist und die KPIs später **ohne Struktur-Umbau** angeschlossen werden können.

**Deferred (Folge-Slices — bewusst NICHT im MVP):**

- **PROJ-131-β (Portfolio-/Multi-Deal-Sicht):** deal-übergreifende Aggregation über alle M&A-Deals des Tenants mit Filter nach Status, Land/Region, Investitionsvolumen (ursprüngliches AC2). Eigener Lift: **cross-project** Aggregation + Tenant-Sicht (nicht projekt-gebundenes `requireProjectAccess`) + eigene Berechtigungs-/Aggregat-Leak-Prüfung. MVP liefert erst die belastbare Pro-Deal-Sicht (mirror PROJ-132 per-project).
- **PROJ-Y-131a (Kaufpreis-/Synergie-KPIs):** die AC-131-5-Platzhalter mit echten Werten füllen, sobald **PROJ-120/121** (Bewertung/Kaufpreis-Bridge) und **PROJ-126** (Synergie-Tracking) deployed sind.
- **PROJ-Y-131b (Word-Export + Snapshot-Freeze):** Word-Export + persistiertes Zeitpunkt-Einfrieren eines Steering-Pre-Reads (ursprüngliches AC3-Teil). Bricht die reine VIEW-class (Migration + Retention-Entscheidung) → separater Slice.

**Abgrenzungen (Out of Scope):**

- Kein BI-Tool-Ersatz; einfache, vordefinierte Sichten.
- Keine Ad-hoc-Datenanalyse durch den Anwender.

**Offene Fragen:**

- Welche Top-5 KPIs werden pro Deal verbindlich erwartet?
- Soll eine Schnittstelle zu einem BI-Tool (Power BI, Tableau) bereitgestellt werden?

**Definition of Ready:**

- [ ] Dashboard-Mockup ist mit Sponsor, Steering und PMO abgestimmt.
- [ ] KPI-Definitionen und Datenquellen sind dokumentiert.

**Definition of Done:**

- [ ] Dashboard zeigt korrekte Live-Daten.
- [ ] Portfolio-Sicht und Snapshot-Export funktionieren.
- [ ] Berechtigungen sind getestet.

**Abhängigkeiten:**

- A2
- E2
- G3
- I1
- I2
- K2
- F1
- L2

**Betroffene Rollen:**

- Executive Sponsor
- Steering Committee
- Deal Lead
- PMO-Lead
- Corporate Development

---

## Requirements Refinement (2026-07-28)

Der ursprüngliche Backlog-Stub wurde gegen den **tatsächlich deployten** Plattform-Stand geerdet und der Scope für einen lieferbaren MVP gelockt (3 User-Entscheidungen).

### Dependency-Readiness (verifiziert gegen origin/main INDEX)

| Dep | Bedeutung | Modul | Status | Im MVP? |
|-----|-----------|-------|--------|---------|
| A2 | Strategische Grundlage / Deal-Phase | PROJ-94/95 | ✅ Deployed | ja (Phase+Status) |
| F1 | Stage-Gate-Status | PROJ-110 | ✅ Deployed | ja |
| E2 | Risikoregister | PROJ-107 | ✅ Deployed | ja (Red Flags) |
| G3 | DD-Findings / Red Flags | PROJ-114 | ✅ Deployed | ja (Red Flags) |
| L2 | Vertraulichkeit / Need-to-know | PROJ-100a/129 | ✅ Deployed | ja (Gate) |
| (Aufgaben) | Kritische offene Aufgaben | PROJ-101/103 | ✅ Deployed | ja |
| I1/I2 | Bewertung / Kaufpreis-Bridge | PROJ-120/121 | ⛔ Planned | **nein → Platzhalter (AC-131-5), PROJ-Y-131a** |
| K2 | Synergie-Tracking | PROJ-126 | ⛔ Planned | **nein → Platzhalter (AC-131-5), PROJ-Y-131a** |

### Gelockte Scope-Entscheidungen

1. **Ungebaute KPIs (I1/I2 Kaufpreis, K2 Synergie):** sauber deferren — sichtbare „noch nicht verfügbar"-Platzhalter im MVP (AC-131-5), echte Werte über **PROJ-Y-131a** sobald 120/121/126 landen. (Kein Block von PROJ-131.)
2. **Portfolio-Sicht (ursprüngliches AC2):** **pro-Deal zuerst** (MVP, mirror PROJ-132 per-project); deal-übergreifende Aggregation + Filter → **PROJ-131-β**.
3. **Export/Snapshot (ursprüngliches AC3):** **Print-to-PDF** (+ optional CSV) im MVP; **Word-Export + persistiertes Snapshot-Freeze** → **PROJ-Y-131b**.

### Reuse-/Architektur-Rahmen (WAS, nicht WIE — Details in /architecture)

- **Klasse VIEW / DUP→REUSE**, standalone (nicht Merge mit 132). Referenz-Muster: PROJ-132 `operative_report` — eine lesende `SECURITY INVOKER`-Auswertungsfunktion pro Projekt (Caller-Kontext → Need-to-know & Externen-Berater-Scope gratis, keine neue RLS-Engine), + M&A-Tab (Steering-Ebene) + `/print`-Seite + `csvCell`-Export. **Keine neue Tabelle/Migration an Bestand erwartet** (nur die neue Lese-Funktion; Snapshot-Persistenz ist bewusst nach PROJ-Y-131b ausgelagert, um VIEW-class rein zu halten).
- **Offene Architektur-Fragen** (für /architecture, ggf. CIA falls Fork): exakte „kritische offene Aufgabe"-Definition (Reuse `project_task_bottlenecks` aus PROJ-103?), „Top-5 Red Flags"-Sortierung (severity → EUR → Datum?), Tab-Platzierung/Rolle-Gating (nur Sponsor/SteerCo sichtbar?).

### Offene Fragen — Stand nach Refinement

- Verbindliche Top-5 KPIs pro Deal: **MVP-Set gelockt** (Phase/Status · nächstes Stage-Gate · Top-5 Red Flags · kritische offene Aufgaben · Platzhalter Kaufpreis/Synergie). Finales Mockup-Signoff mit Sponsor/SteerCo bleibt DoR für /architecture bzw. /designer.
- BI-Tool-Schnittstelle (Power BI/Tableau): bleibt **Out of Scope** (kein BI-Ersatz); ggf. späterer eigener Slice.

---

## Tech Design (Solution Architect) — 2026-07-28

> **Klasse: VIEW (DUP→REUSE), standalone.** Direkte Anwendung des **deployten PROJ-132-Musters** (`operative_report`) und des PROJ-116-Musters (`dd_report_consolidated`): **eine** lesende Auswertungsfunktion, die bereits existierende Kern-/M&A-Objekte zu einer verdichteten Sicht bündelt und als eigener M&A-Tab (Steering-Ebene) mit Print/CSV-Export surft. **Kein neues npm-Paket, keine neue Tabelle, keine Migration an Bestandstabellen, kein Audit-Trio-Touch.** Einzige DB-Änderung: die neue Lese-Funktion.

### A) Was gebaut wird — Bausteine (WAS, nicht WIE)

```
M&A-Projektraum
└── Neuer Tab „Steering-Dashboard"  (project_type='ma', view-Zugriff)
    ├── Pre-Read-Kachelzeile (Ampel-Headline für Steering)
    │   ├── aktuelle Phase + Projekt-Status
    │   ├── nächstes offenes Stage-Gate (+ Status/Termin)
    │   ├── offene Deal-Breaker-/High-Red-Flags (Zahl)
    │   └── kritische offene Aufgaben (überfällig/blockiert, Zahl)
    ├── Abschnitt „Stage-Gate-Status"      → Drill-down /stage-gates
    ├── Abschnitt „Top-5 Red Flags"        → Drill-down DD-Findings / Risiko
    ├── Abschnitt „Kritische offene Aufgaben" → Drill-down /aufgaben · /engpaesse
    ├── Platzhalter-Kachel „Kaufpreisbandbreite — noch nicht verfügbar" (AC-131-5)
    ├── Platzhalter-Kachel „Synergie-Stand — noch nicht verfügbar"      (AC-131-5)
    └── Aktionen: „Drucken/PDF" (eigene /print-Seite) · „CSV" je Abschnitt
```

Dazu (mirror PROJ-132-Dateisatz): eine Lese-Route (GET, ruft die Funktion mit Session-Client), eine Export-Route (CSV, ruft dieselbe Funktion serverseitig erneut → Single-Source), eine chrome-lose `/print`-Seite außerhalb der `(app)`-Gruppe (Browser-Print-to-PDF, `robots: noindex`), ein geteilter read-only Body + View-Wrapper, ein Hook, ein Client-Wrapper, ein Typ.

### B) Datenmodell (Klartext)

**Keine neue Tabelle, kein neues Feld.** Eine neue lesende Funktion `steering_report(projekt)` (analog `operative_report`) bündelt aus **bereits deployten** Quellen:

- **Phase + Status** — aus Phasen/Projekt (PROJ-95/19/2).
- **Nächstes offenes Stage-Gate** — aus dem Stage-Gate-Bestand (PROJ-110): das früheste noch offene Gate + Status/Zieltermin.
- **Top-5 Red Flags** — offene DD-Findings der Schwere `hoch`/`deal_breaker` (G3 = PROJ-114) als kanonische Red-Flag-Liste; begleitend die offenen High-Risiken aus dem Risikoregister (E2 = PROJ-107). Headline zeigt Top-5, Export/Drill-down die volle Liste.
- **Kritische offene Aufgaben** — **dieselbe Logik wie PROJ-103** `project_task_bottlenecks` (überfällig/heute/diese Woche/blockiert), damit die Zahlen nie zu 132/103 divergieren.
- **Kaufpreis (I1/I2) + Synergie (K2)** — **nicht** in der Funktion; die UI rendert feste „noch nicht verfügbar"-Platzhalter, bis PROJ-120/121/126 deployed sind (AC-131-5 → PROJ-Y-131a).

**Sicherheit / Need-to-know (AC-131-2, L2) — gratis:** Die Funktion läuft als **Aufrufer** (security invoker). Dadurch greifen die bestehenden RESTRICTIVE Need-to-know-Gates auf `work_items`/`dd_findings`/`risks`/`ma_stage_gates` (PROJ-100a) **vor** der Aggregation — eine für den Aufrufer unsichtbare Zeile taucht weder in Listen noch in Summen/Headline-Zahlen noch im Export auf. Der additive Externen-Berater-Scope (PROJ-99) gilt automatisch mit. Kein zweites Rechtemodell. Container-Joins (Phase/Workstream/Stream) sind LEFT JOINs → ein unsichtbarer Container blankt nur sein Label, die Zeile bleibt durch ihr eigenes Gate geschützt. **Aufruf zwingend mit Session-gebundenem User-Client, nie service-role** (Pflicht-Kontrakt wie PROJ-132/116). **Aggregat-Leak-Pentest ist Pflicht** (mirror PROJ-132 A–G: nicht-cleared Member sieht in Pre-Read/Summen 0 aus vertraulichen Objekten).

### C) Tech-Entscheidungen (begründet) + gelöste offene Fragen

1. **Standalone statt Merge mit PROJ-132** — PROJ-132 ist als eigenständiges operatives Reporting deployed; ein nachträglicher Merge brächte keinen Nutzen und Kollisionsrisiko. PROJ-131 ist die **Steering-Ebene** (Sponsor/SteerCo) mit eigener, verdichteter Sicht.
2. **„Kritische offene Aufgabe" = PROJ-103-Logik wiederverwenden** — identische Bucket-Definition (überfällig/blockiert), damit Steering- und operatives Reporting konsistent bleiben. (Löst offene Frage 1.)
3. **„Top-5 Red Flags"-Sortierung** — Schwere (`deal_breaker` > `hoch`) → wirtschaftlicher Impact (EUR) absteigend → Datum; DD-Findings sind die kanonische Red-Flag-Quelle (G3), High-Risiken (E2) begleitend. (Löst offene Frage 2.)
4. **Tab-Sichtbarkeit** — Tab ist für **alle M&A-Projektmitglieder mit view-Zugriff** sichtbar; der Inhalt wird durch Need-to-know automatisch gefiltert (mirror PROJ-132, das den Tab nicht rollen-gated). Eine strengere Rollenbeschränkung (nur Sponsor/SteerCo) ist bewusst **kein** MVP-Scope → optionaler Followup, falls Pilot es verlangt. (Löst offene Frage 3.)
5. **Export** — Print-to-PDF über eigene `/print`-Seite (PROJ-21-Muster) + CSV je Abschnitt mit Formel-Injektion-Escaping (`csvCell`, vorhanden). Word + persistiertes Snapshot-Freeze bewusst ausgelagert (PROJ-Y-131b), um die VIEW-class rein zu halten.

### D) Dependencies (zu installieren)

**Keine.** Kein neues npm-Paket (`papaparse`/Print-Muster vorhanden). Eine neue Lese-Funktion, keine Migration an Bestandstabellen.

### CIA-Einordnung

**Kein CIA-Pflicht-Pass** (per `.claude/rules/continuous-improvement.md`): keine neue Technologie, kein neues Dep, keine neue Tabelle, kein Refactoring ≥5 Dateien, kein von der Spec offengelassener Architektur-Fork mit Wirkung auf ≥3 Folge-Skills — der Scope wurde in `/requirements` gelockt, das Muster ist das deployte PROJ-132 (spec-following VIEW-class). Die 3 verbliebenen Detailfragen sind oben regelkonform entschieden.

### Abhängigkeiten (verifiziert Deployed)

A2 = PROJ-94/95 ✅ · F1 = PROJ-110 ✅ · E2 = PROJ-107 ✅ · G3 = PROJ-114 ✅ · L2 = PROJ-100a/129 ✅ · Aufgaben = PROJ-101/103 ✅. Deferred-Quellen: I1/I2 = PROJ-120/121 ⛔ · K2 = PROJ-126 ⛔ (→ Platzhalter/PROJ-Y-131a).

### Handoff

`/backend` (neue Lese-Funktion `steering_report` + GET-Route + CSV-Export-Route + Pflicht-Live-RPC-Smoke inkl. **Aggregat-Leak-Pentest**) → `/frontend` (Steering-Tab + Pre-Read-Kacheln + 3 Abschnitte + 2 Platzhalter-Kacheln + `/print`-Seite + Drill-down-Links) → `/qa` (Need-to-know-Pentest A–G-Muster + Playwright Auth-Gates). ~1,5–2 PT.

### Implementation Notes — /backend (2026-07-28)

VIEW-class, exakt gespiegelt vom deployten PROJ-132 (`operative_report`). **Keine neue Tabelle, kein neues Dep, kein Audit-Trio-Touch** — nur eine neue Lese-Funktion.

- **Migration `20260728120000_proj131_steering_report.sql` in Prod-DB.** Eine `SECURITY INVOKER`, `stable` Funktion `steering_report(p_project_id uuid) → jsonb` mit `search_path = public, pg_temp`, `revoke execute … from public, anon` + `grant execute … to authenticated`. Bündelt: `deal_status` (lifecycle_status + current phase [in_progress zuerst, sonst früheste aktive] + phase_summary) · `next_stage_gate` (frühestes `pending`-Gate + `stage_gate_summary`) · `red_flags` (offene DD-Findings `hoch`/`deal_breaker` [G3] + offene/mitigated Risiken score≥13 [E2] via `_risk_severity_bucket`, + kombinierte summary) · `critical_tasks` (offene Aufgaben overdue **oder** blocked, verbatim PROJ-103-Bucket-Logik, + volle open-task summary) · `pre_read` (Steering-Headline). Container-Joins (Phase/Workstream/Stream) sind LEFT JOINs. Kaufpreis/Synergie bewusst NICHT in der Funktion (UI-Platzhalter, PROJ-Y-131a).
- **Need-to-know (AC-131-2) gratis** via Caller-Kontext: die RESTRICTIVE-Gates auf `phases`/`ma_stage_gates`/`dd_findings`/`risks`/`work_items` (PROJ-100a) filtern vor der Aggregation → kein Leak in Listen, Summen oder Pre-Read.
- **Routen:** `GET …/steering-report` (Session-Client + `requireProjectAccess "view"` + RPC, null→`EMPTY_STEERING_REPORT`) · `GET …/steering-report/export?section=findings|risks|tasks` (dieselbe RPC serverseitig = Single-Source, `csvCell`-Formel-Escaping, Owner-Namensauflösung nur für `tasks`, `X-Export-Scope`-Header). Beide **nie service-role**. + Typ `steering-report.ts` + Client-Wrapper `steering-report-api.ts`.
- **Pflicht-Live-RPC-Smoke gegen Prod (`tests/sql/PROJ-131-steering-report-pentest.sql`) A–G 7/7 PASS, 0 Residue:** admin full · member standard-only · **Aggregat-Leak-Probe (pre_read schließt strict deal_breaker + critical risk + strict task aus)** · Listen-Ausschluss · Gate/Phase-Sichtbarkeit · anon-execute-revoked (42501) · cross-tenant leer. Zusätzlich verifiziert: `prosecdef=false` (INVOKER), authenticated-exec ✓, anon-exec ✗.
- **MCP-Versions-Drift (PROJ-134):** MCP `apply_migration` registrierte `20260729082438`, Repo-Datei `…120000` — **benign**, da vollständig idempotent (`create or replace function`, kein `create table`) → bricht `supabase db push` nicht (Muster wie PROJ-132/109).
- **Gates:** vitest steering-report 12/12 (5 GET + 7 Export), ESLint 0, tsc 0 neu (14 vorbestehende Baseline, inkl. 2 pre-existing `js-yaml`-Fehler aus PROJ-76/77 — nicht PROJ-131), migration-naming 0 Errors, `npm run build` clean (beide Routen registriert). Kein neues Dep. FE (Steering-Tab + Pre-Read-Kacheln + 3 Abschnitte + 2 Platzhalter + `/print` + Drill-down) → `/frontend`.

> **Env-Hinweis (nicht PROJ-131):** `next build` scheiterte zunächst an fehlendem `@types/js-yaml` — das steht bereits in `package.json` (devDep `^4.0.9`, via PROJ-76/77), war aber im Checkout-node_modules nicht installiert (stale). `npm install` synct es (package.json/lock unverändert); danach Build clean. Wird auf dem PROJ-77-Track ohnehin auf main gebracht.

### Implementation Notes — /frontend (2026-07-29)

Steering-Tab im M&A-Projektraum, gespiegelt vom PROJ-132-FE-Dateisatz. Kein neues Dep, shadcn-first (Card/Table/Badge/Button/Select vorhanden).

- **Nav:** `MA_STEERING_REPORT_SECTION` (`id ma-steering-report`, Label „Steering-Dashboard", Icon `LineChart`, `tabPath management-reporting`, `requiresProjectType: "ma"`) in `method-templates/index.ts` nach `MA_OPERATIVE_REPORT_SECTION` injiziert (view-gated über den bestehenden project-type-Filter, nicht rollen-gated — Tech-Design-Entscheidung 4). method-templates-Tests 124/124 unverändert grün.
- **Seite:** `(app)/projects/[id]/management-reporting/page.tsx` → `SteeringReportView` (fetch via `useSteeringReport`, Loading/Error/Retry, CSV-Buttons findings/risks/tasks + „Drucken/PDF"-Link). Owner-Namensauflösung via `useTenantMembers`.
- **Body (pure, geteilt View + Print):** `steering-report-body.tsx` — Pre-Read-Kachelzeile (aktuelle Phase · nächstes Stage-Gate · offene Red Flags · offene High-Risiken · kritische Aufgaben · **2 „n/a — noch nicht verfügbar"-Platzhalter Kaufpreis/Synergie**, AC-131-5) + 3 Abschnitte: Stage-Gate-Status (nächstes Gate + Summary), Top Red Flags (DD-Findings Top-5 mit Kaufpreis-Risiko-Summe + High-Risiken Top-5, „+N weitere"-Hinweis), Kritische offene Aufgaben (Tabelle). **Drill-down** über optionales `projectId`-Prop → Links zu `/stage-gates`, `/due-diligence`, `/risiken`, `/engpaesse` (AC-131-3); Print-Seite ohne `projectId` → keine Links.
- **Print:** `projects/[id]/steering-report/print/page.tsx` außerhalb `(app)` (chrome-los, PROJ-21-`theme-print`, `robots: noindex`), RPC via cookie-Session-Client (Need-to-know gilt für den Anfragenden), Projekt-RLS → `notFound`.
- **Gates:** method-templates 124/124, ESLint 0, tsc 0 neu (Baseline jetzt 12 — die 2 `js-yaml`-Fehler weg nach `npm install`), `npm run build` clean (4 Routen registriert: GET + Export + Page + Print). AC-131-1/3/4/5 FE-seitig erfüllt; AC-131-2 (Need-to-know) server-seitig bereits im /backend live-bewiesen. → `/qa` (Need-to-know-Pentest A–G re-verify + Playwright Auth-Gates + Tab-Smoke).

---

## QA Test Results — 2026-07-29 (PASS, 0 Critical / 0 High → Approved)

Getestet gegen den `/frontend`-Stand (`64dd883`) im Worktree `proj-131/requirements`. Fokus laut Auftrag: Need-to-know-Pentest A–G re-verify gegen Prod + Playwright Auth-Gates + Tab-Smoke.

### Akzeptanzkriterien

| AC | Ergebnis | Nachweis |
|----|----------|----------|
| **131-1** Pro-Deal Steering-Dashboard (Phase/Status · nächstes Stage-Gate · Top-5 Red Flags · kritische Aufgaben) | ✅ PASS | Live-Pentest A (admin full): current_phase in_progress · next gate seq=1 · red-flag findings=2/risks=2/summary.total=4 · critical_tasks=2 · pre_read korrekt. FE-Body rendert alle 4 Sektionen + Pre-Read. |
| **131-2** Klassifikations-gated Sichtbarkeit (L2), kein Aggregat-Leak | ✅ PASS | **Live-Pentest B/C/D**: nicht-cleared Member sieht nur standard (findings=1/risks=1/tasks=1); **Pre-Read schließt strict deal_breaker + critical risk + strict task aus** (open_red_flag_findings=1/open_high_risks=1/critical_tasks=1); Listen ohne deal_breaker/critical. Gate = SECURITY-INVOKER Caller-Kontext. |
| **131-3** Drill-down zum Detailobjekt | ✅ PASS | Body-Drill-Links (projectId gesetzt in View) → `/stage-gates`, `/due-diligence`, `/risiken`, `/engpaesse`; Print-Seite ohne Links. |
| **131-4** Export (Print-to-PDF + CSV) | ✅ PASS | 3 CSV-Buttons (findings/risks/tasks) + chrome-lose `/steering-report/print`-Seite (Session-Client, robots noindex). Route-Unit deckt CSV-Shape + Formel-Escaping. |
| **131-5** Vorwärts-kompatible Platzhalter (Kaufpreis/Synergie) | ✅ PASS | 2 „n/a — noch nicht verfügbar"-Kacheln im Pre-Read (muted, gestrichelt). Nicht in der RPC → sauber nachrüstbar (PROJ-Y-131a). |

### Security / Red-Team (Live gegen Prod, self-rolling-back, 0 Residue)

`tests/sql/PROJ-131-steering-report-pentest.sql` **A–G 7/7 PASS** (re-verifiziert in /qa gegen aktuellen Prod): A admin full · B member standard-only · **C Aggregat-Leak-Probe (Pre-Read)** · D Listen-Ausschluss strict · E Gate/Phase-Sichtbarkeit · F anon-execute revoked (42501) · G cross-tenant leer. Zusätzlich (im /backend verifiziert): `prosecdef=false` (INVOKER), authenticated-exec ✓, anon-exec ✗, 0 Residue.

### Automatisierte Tests

- **Playwright** `tests/PROJ-131-steering-report.spec.ts` **5/5 chromium** — Auth-Gates auf allen 4 Routen (GET · Export · Tab-Seite · Print) + malformed-id (Middleware-Gate vor Zod).
- **Route-Unit (vitest)** 12/12 (5 GET + 7 Export).
- **method-templates** 124/124 (Nav-Injektion ohne Regression).
- **Volle Vitest-Regression 2532/2532** — keine Regression durch die Slice.

### Deviations / Deferrals (dokumentiert, kein Blocker)

- **Portfolio-/Multi-Deal-Sicht** → PROJ-131-β (bewusst aus MVP geschnitten in /requirements).
- **Kaufpreis I1/I2 + Synergie K2 KPIs** → PROJ-Y-131a (Module PROJ-120/121/126 noch Planned; MVP zeigt Platzhalter).
- **Word-Export + persistiertes Snapshot-Freeze** → PROJ-Y-131b.
- **D-1 (Env):** Mobile-Safari-Projekt skipped (WebKit-Host-Libs fehlen, PROJ-67/F2) — nur Chromium exekutiert.

**Verdikt: PRODUCTION-READY.** 0 Critical / 0 High. Status → Approved. → `/deploy`.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · M — Reporting & Dashboards_
