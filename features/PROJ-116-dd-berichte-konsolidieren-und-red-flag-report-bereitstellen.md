---
id: PROJ-116
title: "DD-Berichte konsolidieren und Red-Flag-Report bereitstellen"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-g", "should-have"]
dependencies: ["G1", "G2", "G3", "D1", "F1", "M1"]
roles: ["Deal Lead", "Stream Leads", "PMO-Lead", "Steering Committee (lesend)"]
summary_for_jira: "[G5] DD-Berichte konsolidieren und Red-Flag-Report bereitstellen"
---

# PROJ-116: DD-Berichte konsolidieren und Red-Flag-Report bereitstellen

## Status: In Progress (Backend live)

**Architected (CIA-reviewed 2026-06-29)** — VIEW-Slice: neue SECURITY-INVOKER-RPC `dd_report_consolidated` über deployte 112/113/114, need-to-know gratis; Export via PROJ-21-Print-to-PDF; Live-Sicht; Word/Snapshot/Deliverables deferred; 6 Hardening-ACs. Kein neues Dep, keine neue Tabelle.

**Backend gebaut 2026-06-29:** Migration `20260629084539_proj116_dd_report_consolidated` in Prod (eine `dd_report_consolidated(p_project_id uuid)`-RPC: `language sql`, `stable`, **security invoker**, `set search_path=public,pg_temp`, kein actor-Param, `revoke execute from public,anon` / `grant authenticated` — H1 verifiziert: `is_definer=false`, `auth_exec=true`, `anon_exec=false`). JSON `{streams[], red_flags[]}`: pro Stream Status + Severity-Counts (niedrig/mittel/hoch/deal_breaker) + EUR-Summe + null_eur_count + Q&A offen/beantwortet; `red_flags` direkt aus `dd_findings` (`severity in ('hoch','deal_breaker')`, row-wise RESTRICTIVE-Gate, NICHT aus einer vor-aggregierten Definer-Quelle — H3), deal_breaker zuerst sortiert. GET `/api/projects/[id]/dd-report` ruft die RPC mit dem **session-gebundenen User-Client** auf (`getAuthenticatedUserId`, nie service-role — H2) + `requireProjectAccess(view)` + Zod-UUID-Guard. FE-Client `fetchDdReport` + Typen in `dd-findings-api.ts`.

**Quality-Gates:** route.test.ts 5/5; eslint 0; tsc 14 baseline/0 neu; build clean.

**H6 Pflicht-Live-RPC-Smoke** gegen Prod (`tests/sql/PROJ-116-dd-report-pentest.sql`, self-rolling-back, **0 Residue verifiziert**): gemischter Need-to-know-Kontext, A–F **6/6 PASS** — Admin sieht beide Streams + 2 Red-Flags (deal_breaker zuerst); nicht-freigeschaltetes Member sieht NUR den `standard`-Stream (vertraulicher Stream gefiltert, H4), **0** Red-Flag-Zeilen aus dem vertraulichen Stream (H2/H3, Aggregat-Leak-Probe), korrekte Aggregate für den sichtbaren Stream; nach `grant_confidentiality_clearance` kippt die Sichtbarkeit auf beide Streams (Gate ist echt, nicht hardcoded).

→ `/frontend` (DD-Bericht-Ansicht + `/print`), dann `/qa` (H2/H3-Pentest im gemischten Need-to-know-Kontext).
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-21 Output-Rendering. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-g` · `should-have`  
> **Abhängigkeiten:** `G1`, `G2`, `G3`, `D1`, `F1`, `M1`

**User Story:**

Als Deal Lead möchte ich eine konsolidierte DD-Berichtsicht haben, die je Stream den Status, Findings und Red Flags zusammenführt, damit ich vor Gate 5 (Final Bid) eine fundierte Gesamtsicht habe.

**Beschreibung / Kontext:**

Das Modell verlangt sowohl Einzel-DD-Berichte je Stream als auch eine konsolidierte Red-Flag-Sicht. Die Plattform muss diese Aggregation automatisieren und dabei sicherstellen, dass die Sicht jederzeit dem aktuellen Stand entspricht (statt eines manuell gepflegten Reports).

**Akzeptanzkriterien:**

- [ ] Pro Stream wird eine Berichtsicht aus den erfassten Findings (G3), Q&A-Status (G2) und Pflicht-Deliverables (D1) automatisch generiert.
- [ ] Eine konsolidierte Red-Flag-Sicht aggregiert alle Findings mit Schwere 'hoch' oder 'Deal Breaker' über alle Streams.
- [ ] Die Sicht kann als PDF oder Word-Export für den Steering-Termin (siehe H1, F1) erstellt werden.
- [ ] Die Sicht ist auf den jeweiligen Berechtigungskontext beschränkt (kein Vollzugriff für externe Berater eines anderen Streams).

**Abgrenzungen (Out of Scope):**

- Eine vollwertige redaktionelle DD-Report-Erstellung (Layout, Formulierung, Anlagen) bleibt im Verantwortungsbereich der externen Berater; die Plattform liefert die Daten-/Strukturbasis.
- Keine inhaltliche Bewertung durch die Plattform.

**Offene Fragen:**

- Welche Layoutvorlage gilt für den Word-/PDF-Export (Corporate-Design)?
- Soll die Sicht zu definierten Zeitpunkten (Snapshot) eingefroren werden?

**Definition of Ready:**

- [ ] Aggregationslogik und Export-Layout sind abgestimmt.
- [ ] Stakeholder (M&A, Steering) haben den Mockup freigegeben.

**Definition of Done:**

- [ ] Berichtsicht zeigt korrekte Live-Daten je Stream und konsolidiert.
- [ ] Export funktioniert reproduzierbar.
- [ ] Berechtigungen sind getestet.

**Abhängigkeiten:**

- G1
- G2
- G3
- D1
- F1
- M1

**Betroffene Rollen:**

- Deal Lead
- Stream Leads
- PMO-Lead
- Steering Committee (lesend)

---

## Tech Design (Solution Architect) — 2026-06-29 (CIA-reviewed)

> **CIA-Pflicht-Review erfolgt.** Reuse-Klasse **VIEW** — reine Lese-/Aggregations-Slice auf den deployten PROJ-112/113/114 + PROJ-21-Rendering. **Keine neue Mutations-Tabelle, kein neues npm-Paket.** Keine Code-/SQL-Snippets.

### 0. Worum es geht (ein Absatz)
PROJ-116 liefert eine **konsolidierte, live aktuelle DD-Berichtsicht**: je Stream Status + Findings (nach Schwere/EUR) + Q&A-Stand, plus eine **streamübergreifende Red-Flag-Liste** (Findings `hoch`/`deal_breaker`). Die Sicht ist **need-to-know-sicher by construction** (ein externer Berater sieht nur freigeschaltete Streams/Findings) und als **PDF** über das bestehende PROJ-21-Print-Muster exportierbar.

### 1. Komponenten-Struktur
```
PROJ-116 DD-Bericht
├── Backend
│   └── Read-RPC dd_report_consolidated(project) — SECURITY INVOKER             ← NEU
│         ├── (a) je Stream: Status, Findings-Counts je Schwere, EUR-Summe,
│         │       null_eur_count, Q&A open/answered
│         └── (b) Red-Flag-Liste: Findings hoch/deal_breaker (direkt aus dd_findings)
│       REUSE: dd_findings + dd_findings_summary-Muster (114), dd_questions (113),
│              dd_streams (112), can_access_classified (100a, greift im INVOKER-Plan)
└── Frontend
    ├── DD-Bericht-Ansicht im Projektraum (read-only): Stream-Kacheln + Red-Flag-Tabelle
    ├── `/print`-Route (Browser-Print-to-PDF) — REUSE PROJ-21-Muster                ← NEU dünn
    └── REUSE: report-/snapshot-Body-Komponenten-Stil, project-room-Nav (requiresProjectType ma)
```

### 2. Datenmodell in Klartext
**Keine neue Tabelle.** Eine read-only **RPC** aggregiert live:
- **Pro Stream** (aus `dd_streams` ⋈ `dd_findings` ⋈ `dd_questions`): Stream-Label + Status, Findings-Anzahl je Schwere, EUR-Summe (+ `null_eur_count` = Findings ohne EUR-Schätzung), Q&A offen/beantwortet.
- **Red-Flag-Liste** (direkt aus `dd_findings WHERE severity IN ('hoch','deal_breaker')`): einzelne Befunde über alle Streams, mit Stream, Titel, Schwere, EUR, Status.
- Rückgabe als strukturiertes JSON (`{ streams: [...], red_flags: [...] }`).

### 3. Tech-Entscheidungen (CIA-gelockt)
| # | Entscheidung | Wahl | Warum |
|---|---|---|---|
| E1 | **Daten-Assembly** | **Neue SECURITY-INVOKER-RPC `dd_report_consolidated`** (Muster `dd_findings_summary`: sql/stable/invoker, kein actor-Param, revoke public+anon) | INVOKER ⇒ RESTRICTIVE need-to-know-Policies laufen im Caller-Kontext **vor** der Aggregation → AC4 gratis, kein Aggregat-Leak. SQL-VIEW = Definer-äquivalent (Need-to-know-Bypass) → abgelehnt. `dd_findings_summary` erweitern → bräche den deployten 114-Contract → abgelehnt. |
| E2 | **Export PDF/Word** | **PROJ-21-Print-to-PDF wiederverwenden** (HTML-Report-Seite + `/print`); **Word deferiert** → PROJ-Y-1 | AC3 sagt „PDF **oder** Word" → PDF allein erfüllt die AC. Server-DOCX-Generator = neues Dep ⇒ vermeidbar. |
| E3 | **Snapshot-Freeze** (offene Frage) | **Live-Sicht im MVP**; Freeze → PROJ-Y-2 (`report_snapshots`-Reuse) | User Story will „jederzeit aktueller Stand statt manuell gepflegtem Report" = Live. Freeze ist Should/Later. |
| E4 | **AC4 Need-to-know** | INVOKER-RPC + bestehende RESTRICTIVE-Policies; **RPC MUSS mit User-Session-Client aufgerufen werden, nie service-role** | Häufigster INVOKER-Fehler (R1): service-role → `auth.uid()` null → Tor greift nicht. Der bestehende Route-Pattern (`getAuthenticatedUserId()` → session-gebundener Client) erfüllt das. |
| E5 | **D1-Deliverables** (ungebaut) | **Forward-compat deferieren** (PROJ-104) | Findings + Q&A (zwei wertvolle Drittel) sofort lieferbar; Deliverables-Sektion als „noch nicht verfügbar"-Slot, den PROJ-104 später andockt. Nicht blockieren. |

### 4. Hardening-Akzeptanzkriterien (CIA-Pflicht)
- **H1:** `dd_report_consolidated` ist `security invoker`, `revoke execute from public, anon` / `grant authenticated`, `set search_path=public,pg_temp`, **kein** actor/`p_user_id`-Param (PROJ-94-Impersonation-Lektion).
- **H2:** Die API-Route ruft die RPC mit dem **session-gebundenen User-Client** auf (nie service-role). Test-AC: ein für Stream B nicht freigeschalteter externer Berater erhält in (a) Stream-B-Aggregate 0/leer **und** in (b) keine einzige Stream-B-Red-Flag-Zeile.
- **H3:** Red-Flag-Liste selektiert **direkt aus `dd_findings`** (zeilenweiser RESTRICTIVE-Gate), nicht aus einer vorab-aggregierten Definer-Quelle.
- **H4:** Stream-Join erzeugt keine Zeile für gesperrte Streams (Inner-Join über gegatete `dd_findings` bzw. `can_access_classified`-Filter auf Stream-Ebene).
- **H5:** Print-/HTML-Sicht zeigt `null_eur_count` als Disclosure neben jeder EUR-Summe (kein irreführendes „Summe = vollständig").
- **H6:** Pflicht-**Live-RPC-Smoke** gegen Prod im gemischten Need-to-know-Kontext (cleared Stream A / gesperrt Stream B → 0 B-Zeilen), self-rolling-back, 0 Residue.

### 5. Dependencies
**Keine neuen npm-Pakete.** 1 Migration (nur die INVOKER-RPC; keine Tabelle/Policy). Reuse: PROJ-112/113/114 + PROJ-21-Print-Muster.

### 6. PROJ-Y Followups (nicht-blockierend)
- **PROJ-Y-1:** DOCX-Export (neues Dep `docx`, CIA-pflichtig) — nur bei Pilot-Bedarf.
- **PROJ-Y-2:** DD-Report Snapshot-Freeze via `report_snapshots` (Einfrieren vor Gate 5 / Audit-Nachweis).
- **PROJ-Y-3:** D1/Pflicht-Deliverables-Sektion andocken, sobald PROJ-104 deployed.

### 7. Handoff
`/backend` zuerst (INVOKER-RPC + API-Route + Live-Smoke H6), dann `/frontend` (DD-Bericht-Ansicht + `/print`), dann `/qa` (H2/H3-Pentest im gemischten Need-to-know-Kontext). Abhängigkeiten 110/111/104 bleiben forward-compat ungekoppelt.

### Locked design decisions (für /backend + /frontend)
1. Neue INVOKER-RPC `dd_report_consolidated` (JSON: streams[] + red_flags[]); keine Tabelle, keine View.
2. Need-to-know gratis über INVOKER + User-Session-Client-Aufruf (H2 zwingend).
3. Export = PROJ-21-Print-to-PDF; Word = PROJ-Y-1.
4. Live-Sicht; Snapshot-Freeze = PROJ-Y-2.
5. D1-Deliverables forward-compat (PROJ-Y-3).
6. 6 Hardening-ACs (H1–H6) Pflicht vor Approved.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
