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

## Status: Architected (2026-07-21)
**Created:** 2026-06-10
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

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
