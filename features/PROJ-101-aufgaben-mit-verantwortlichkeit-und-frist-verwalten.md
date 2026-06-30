---
id: PROJ-101
title: "Aufgaben mit Verantwortlichkeit und Frist verwalten"
issue_type: Story
epic_code: C
epic_title: "Aufgaben & Workstreams"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-c", "mvp"]
dependencies: ["A1", "A2", "B1"]
roles: ["Workstream Lead", "Deal Lead", "PMO-Lead", "Aufgabenverantwortliche (alle Workstreams)"]
summary_for_jira: "[C1] Aufgaben mit Verantwortlichkeit und Frist verwalten"
---

# PROJ-101: Aufgaben mit Verantwortlichkeit und Frist verwalten

## Status: In Progress (Backend live)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic C — Aufgaben & Workstreams)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-9 Work-Items (kind=task). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** C — Aufgaben & Workstreams  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-c` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `B1`

**User Story:**

Als Workstream Lead möchte ich Aufgaben mit Verantwortlichem, Frist, Status und Bezug zu Phase und Workstream anlegen und nachverfolgen können, damit die operative Steuerung des Deals durchgängig nachvollziehbar ist.

**Beschreibung / Kontext:**

Aufgaben sind die kleinste Steuerungseinheit. Sie entstehen entlang aller Phasen und müssen mit Phasen, Workstreams, Deliverables und Risiken verknüpfbar sein.

**Akzeptanzkriterien:**

- [ ] Aufgabe lässt sich anlegen mit Pflichtfeldern Titel, Verantwortlicher, Frist und Workstream.
- [ ] Aufgaben sind einer Phase und optional einem Deliverable, einem Risiko und einer Entscheidung zuordenbar.
- [ ] Status: offen, in Arbeit, blockiert, erledigt, verworfen.
- [ ] Fristüberschreitungen werden farblich hervorgehoben und können als Benachrichtigung an den Verantwortlichen gesendet werden.
- [ ] Aufgaben sind nach Verantwortlichem, Phase, Workstream, Fristfenster und Status filterbar.

**Abgrenzungen (Out of Scope):**

- Kein vollständiges Projektmanagement-Modul (Gantt, Ressourcenplanung) in dieser Story.
- Keine direkte Kostenerfassung pro Aufgabe.

**Offene Fragen:**

- Sollen Aufgaben in ein bestehendes Ticketsystem (Jira) synchronisiert werden?
- Welche Eskalationsregeln gelten bei wiederholter Fristüberschreitung?
- Wie werden wiederkehrende Aufgaben (z. B. wöchentlicher SteerCo-Vorbereitungs-Task) abgebildet?

**Definition of Ready:**

- [ ] Pflichtfelder und Statusmodell sind abgestimmt.
- [ ] Benachrichtigungsregeln sind definiert.

**Definition of Done:**

- [ ] Aufgaben können angelegt, bearbeitet, verknüpft, gefiltert und exportiert werden.
- [ ] Benachrichtigungen funktionieren.
- [ ] Performance-Test mit ≥ 10.000 Aufgaben pro Projekt bestanden.

**Abhängigkeiten:**

- A1 – Projektanlage
- A2 – Phasenmodell
- B1 – Rollen

**Betroffene Rollen:**

- Workstream Lead
- Deal Lead
- PMO-Lead
- Aufgabenverantwortliche (alle Workstreams)

---

## Tech Design (Solution Architect)

**Architektur-Datum:** 2026-06-30 · **Reuse-Klasse:** DUP→REUSE auf PROJ-9 Work-Items (`kind='task'`) · **CIA-reviewed:** 2026-06-30 (3 Forks gelockt)

### Leitprinzip
Wir bauen **kein** neues `tasks`-Modell. Eine M&A-„Aufgabe" **ist** ein bestehendes Work-Item mit `kind='task'`. Der gesamte deployed Core wird wiederverwendet: Status-Maschine, Verantwortlicher, Phase-Bezug, RACI-Rollen, Audit, Soft-Delete, Jira-Export. Die einzige neue Schema-Fläche ist eine Frist-Spalte, die dem **gesamten Core** zugutekommt.

### Was schon da ist (1:1-Reuse, kein Neubau)
- **Aufgabe = `work_items` mit `kind='task'`** — Tabelle, RLS, Soft-Delete, Audit (PROJ-10) existieren.
- **Statusmodell deckt sich exakt** mit der Spec:
  | Spec (AC3) | Core-Wert |
  |---|---|
  | offen | `todo` |
  | in Arbeit | `in_progress` |
  | blockiert | `blocked` |
  | erledigt | `done` |
  | verworfen | `cancelled` |
  → Keine Enum-Änderung nötig. Statuswechsel läuft über die bestehende Status-Route.
- **Verantwortlicher** = `responsible_user_id` (existiert).
- **Phase-Bezug** = `phase_id` (existiert, nullable).
- **RACI** (Workstream-Lead/Deal-Lead/PMO als R/A/C/I) = `raci_assignments` aus PROJ-97 (greift bereits auf `target_type='work_item'`).
- **Overdue-Benachrichtigung an den Verantwortlichen** = das **deployed PROJ-64 „My Work"-Inbox** listet bereits alle dem User zugewiesenen aktiven Work-Items, berechnet `is_overdue` und hat einen „Überfällig"-Filter + Hervorhebung. Damit ist AC4 („Benachrichtigung an den Verantwortlichen") durch Reuse abgedeckt — **kein neuer Cron**.

### Was neu gebaut wird (minimal)
1. **Eine neue Spalte** `due_date` (Frist) auf `work_items` — nullable, gilt core-weit.
   - *Warum nicht `planned_end` wiederverwenden?* `planned_start/planned_end` tragen Gantt-/Critical-Path-Semantik (Balkenlänge, FS/SS/FF/SF-Dependencies). Eine **Frist** (ein Stichtag) ist etwas anderes als ein **geplantes Arbeitsende**. `planned_end` zu überladen würde Gantt und Critical-Path mit Deadline-Daten verschmutzen. Eine separate Frist-Spalte ist eine triviale additive Migration und schließt eine echte Core-Lücke (heute hat der Core keine Deadline-Semantik).
2. **List-API-Filter erweitern** — der bestehende Work-Item-List-Endpoint kann heute nach `kind`/`status`/`sprint` filtern. Ergänzt werden: Verantwortlicher, Phase und **Fristfenster** (`due_date` von–bis) — deckt AC5.
3. **My-Work-Inbox auf die echte Frist umstellen** — die Inbox nimmt heute `planned_end` als Fälligkeit; sie wird auf `due_date ?? planned_end` umgestellt, damit die echte Deadline (und damit „überfällig") korrekt erscheint. Kleiner Reuse-Gewinn, der gleichzeitig AC4 schärft.

### Gelockte Architektur-Entscheidungen (CIA 2026-06-30)
- **F1 — „Workstream"-Pflichtfeld (AC1):** PROJ-102 (Workstreams) ist nicht gebaut und laut ADR eine spätere Gruppierungs-EXTEND. Ein Workstream-Stub jetzt wäre verfrühtes Generikum. **Entscheidung:** Pflichtfeld in PROJ-101 ist **Phase**; „Workstream" wird als **optionaler Freitext-Tag** (`attributes.ma_workstream`, kein FK, kein Constraint) geführt und ist filterbar. Wenn PROJ-102 die echte `workstreams`-Entität baut, migriert es den Tag auf eine FK und kann die Pflicht hochziehen. **Deviation zu AC1 (Workstream optional statt pflicht) — dokumentiert.**
- **F2 — Verknüpfung mit Risiko/Entscheidung/Deliverable (AC2/DoD):** Deliverables (PROJ-104) existieren nicht; eine generische Governance-Link-Tabelle jetzt würde das Assoziations-Muster für ~10 spätere M&A-Specs (104/107/109/111/114) festschreiben, bevor deren reale Anforderungen bekannt sind. **Entscheidung:** Cross-Entity-Linking wird **zurückgestellt**; PROJ-101 nutzt nur den nativen `phase_id`-Bezug + RACI. Das Muster (generisch-polymorph vs. pro-Paar) wird beim **zweiten realen Konsumenten** (PROJ-104 oder 107) entschieden. **Deviation zu AC2 (Risiko/Entscheidung/Deliverable-Links forward-compat deferriert) — dokumentiert, Owner = PROJ-104/107.**
- **F3 — Frist:** neue `due_date`-Spalte (siehe oben), bewusst **ohne** CHECK gegen `planned_start/planned_end` (eine Deadline darf legitim vor dem geplanten Ende liegen).

### Offene Fragen der Spec — beantwortet
- **Jira-Sync?** Aufgaben erben den bestehenden Jira-Export (PROJ-47/50, `jira-export-dialog` greift auf Work-Items). Kein M&A-spezifischer Sync — kein Neubau.
- **Eskalationsregeln bei wiederholter Fristüberschreitung?** MVP: Überfälligkeit erscheint farblich + in der My-Work-Inbox des Verantwortlichen. Aktive Eskalation an den Lead bei *wiederholter* Überschreitung → Followup (PROJ-Y-101c).
- **Wiederkehrende Aufgaben?** Out of Scope (Spec schließt schweres PM bereits aus) → Followup (PROJ-Y).

### Komponenten-Struktur (UI)
```
M&A-Projektraum
└── Tab „Aufgaben" (neu, kind=task gefiltert)
    ├── Filterleiste:  Verantwortlicher · Phase · Fristfenster · Status · Workstream(-Tag)
    ├── Aufgabenliste  (reuse vorhandener Work-Item-Listen-Komponente)
    │   └── Zeile:  Titel · Verantwortlicher · Frist (rot, wenn überfällig) · Status-Badge · Phase
    ├── „Neue Aufgabe" / „Bearbeiten"-Dialog  (reuse vorhandener Work-Item-Dialoge,
    │                                            + Feld Frist, + optional Workstream-Tag)
    └── Status-Wechsel  (reuse vorhandene Status-Route)

Querschnitt (kein neuer Code in PROJ-101):
- My-Work-Inbox (PROJ-64) zeigt überfällige Aufgaben dem Verantwortlichen
- RACI-Tab am Work-Item (PROJ-97) für R/A/C/I-Rollen
```

### Datenmodell (Klartext)
```
Eine Aufgabe = ein Work-Item mit kind='task'. Es speichert:
- Titel (Pflicht)
- Verantwortlicher  (responsible_user_id, Pflicht laut AC1)
- Frist             (due_date — NEU, nullable core-weit; in der Aufgaben-UI Pflicht)
- Phase             (phase_id, Pflicht-Gruppierung in PROJ-101)
- Status            (todo|in_progress|blocked|done|cancelled)
- Workstream-Tag    (attributes.ma_workstream — optionaler Freitext, bis PROJ-102)
- (geerbt: Priorität, Beschreibung, Audit, Soft-Delete, RACI-Rollen)

Keine neue Tabelle. Eine neue Spalte (due_date). Kein neues Link-Schema.
```

### Tech-Entscheidungen (für PM)
- **Reuse statt Neubau** spart ~80% des Aufwands und hält die Invariante „shared core before specialization": eine M&A-Aufgabe ist im selben Datentopf wie jede andere Projektaufgabe → Audit, Reporting, Jira-Export, My-Work-Inbox funktionieren sofort mit.
- **`due_date` als Core-Feld** (nicht M&A-Sonderweg) ist ein Gewinn für die ganze Plattform und macht die My-Work-Inbox-Fälligkeit korrekt.
- **Workstream & Verknüpfungen bewusst offen gelassen**, bis die Stories existieren, die sie tragen — vermeidet wegzuwerfende Vorab-Infrastruktur.

### Abhängigkeiten (Pakete)
Keine neuen npm-Pakete. Eine Supabase-Migration (1 Spalte).

### Followups (PROJ-Y-Kandidaten)
- **PROJ-Y-101a → PROJ-102:** `attributes.ma_workstream`-Tag auf echte `workstreams`-FK migrieren + Pflicht hochziehen.
- **PROJ-Y-101b → PROJ-104/107:** Cross-Entity-Governance-Assoziation (generisch vs. pro-Paar) entscheiden + task↔Risk/Decision/Deliverable nachrüsten.
- **PROJ-Y-101c:** Aktive Eskalation bei wiederholter Fristüberschreitung (über My-Work-Inbox-Surface bevorzugt, kein neuer Cron).

---

## Backend Implementation Notes (2026-06-30)

**Reuse-Schnitt umgesetzt — kein neues Tabellenmodell.**

- **Migration `20260630094550_proj101_work_item_due_date`** (live in Prod-DB + Repo-Datei versionsgleich, PROJ-134-konform): `work_items.due_date date` nullable (core-weit), Kommentar, partieller Index `work_items_project_due_date_idx (project_id, due_date) WHERE is_deleted=false` für den Fristfenster-Filter. **Bewusst kein CHECK** gegen `planned_start/planned_end` (F3). Idempotent (`add column if not exists` / `create index if not exists`).
- **`due_date` in beiden Zod-Schemas** (`work-items/_schema.ts`, create + patch) als `YYYY-MM-DD`-Regex nullable optional — fließt via Spread-Pattern in INSERT/UPDATE (Drift-Test deckt ab).
- **Workstream-Tag** (`attributes.ma_workstream`) braucht **keine** Schema-Änderung — `attributes` ist bereits `z.record` in beiden Schemas (F1).
- **GET-List-Filter erweitert** (`work-items/route.ts`): `responsible_user_id`, `phase_id` (UUID-validiert), `due_after`/`due_before` (`due_date >=`/`<=`, YYYY-MM-DD-validiert). Deckt AC5.
- **My-Work-Inbox** (`lib/dashboard/summary.ts`): `due_date` zum Select ergänzt; effektive Fälligkeit = `due_date ?? planned_end` → echte Frist treibt jetzt `is_overdue` (AC4-Surface).
- **Frontend-Typ + Hooks** (`types/work-item.ts`, `use-work-items.ts`, `use-work-item.ts`): `due_date` zu Interface + Select-String + explizitem Row-Mapping ergänzt (obs-202-Footgun + Hook-Mapping-Drift-Test).

**Quality-Gates:** vitest **2137/2137** (inkl. +5 neue GET-Filter-Tests + 2 Drift-Kitchensinks erweitert); ESLint 0; `tsc` 0 neue Errors (Baseline unverändert); `npm run build` clean. **Advisors:** keine neue Security-Lint; Performance zeigt den neuen Index als „unused index"-INFO (erwartet bei frischem Index, 0 Scans — PROJ-69-Muster).

**Noch offen → /qa:** Live-Verifikation gegen Prod (Task mit Frist anlegen → Filter → My-Work-Overdue-Surface), Frontend „Aufgaben"-Tab (→ /frontend), Performance ≥10k Tasks (DoD).

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
