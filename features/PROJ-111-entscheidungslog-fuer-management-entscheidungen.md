---
id: PROJ-111
title: "Entscheidungslog für Management-Entscheidungen"
issue_type: Story
epic_code: F
epic_title: "Entscheidungen & Stage-Gates"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-f", "mvp"]
dependencies: ["F1", "E1", "G3", "D1", "L3"]
roles: ["Deal Lead", "PMO-Lead", "Executive Sponsor", "Workstream Leads", "Legal Counsel (lesend)"]
summary_for_jira: "[F2] Entscheidungslog für Management-Entscheidungen"
---

# PROJ-111: Entscheidungslog für Management-Entscheidungen

## Status: Approved (QA PASS 2026-07-21, gebündelt mit PROJ-110 — 0 Critical/0 High → /deploy)

> **QA PASS 2026-07-21 (bundled run mit PROJ-110, 0 Critical/0 High → PRODUCTION-READY).** Playwright `tests/PROJ-110-stage-gates.spec.ts` deckt die `decisions/export`-Route auth-gated ab (307/401/403). Der HIGH-2-Need-to-know-Filter (`hidden_stage_gate_decision_ids`) ist im PROJ-110-Live-Pentest Case H bewiesen (strict-Gate-Decision für Nicht-Cleared versteckt). Drift-Test (decisions POST kitchen-sink) grün → die 3 neuen INSERT-only-Felder erreichen den DB-Payload. vitest 2287/2287, lint 0, tsc 0 neu, build clean.
>
> **AC-Abdeckung (111):** AC1 ✅ Felder title/decision_text/rationale/decided_at/decider + neue `decision_body` (Gremium) / `options` — **Backend/API akzeptiert sie; FE-Eingabe im generischen DecisionForm noch nicht exponiert → Followup PROJ-Y-111a**. AC2 ✅ Links Phase/Risk (bestehend) + `context_finding_id` (neu, INSERT-only); **Deliverable-Link → PROJ-104-Followup**. AC3 ✅ Gate-Entscheidungen erscheinen automatisch als „Stage-Gate N:"-Einträge (PROJ-110). AC4 ✅ Immutabilität via PROJ-20-Trigger (HIGH-1: neue Spalten INSERT-only). AC5 **teilweise** — Export-Endpoint filtert per `phaseId`/`deciderId`; **UI-Filter (Phase/Entscheider/Quelle) im Timeline-View → Followup PROJ-Y-111a**. AC6 ✅ CSV-Export mit Need-to-know-Filter + Formula-Escaping. **Deviation D-G:** kein zweiter Nav-Eintrag (Route `entscheidungen` existiert bereits generisch) → additive CSV-Export-Erweiterung der bestehenden Decisions-Fläche.

## Status (QA vorher): In Review (Backend + Frontend gebaut 2026-07-21, gebündelt mit PROJ-110 — → /qa)

> **Frontend gebaut 2026-07-21 (Deviation vom Tech-Design G):** Der Tech-Design skizzierte eine neue M&A-Nav „Entscheidungen"-Sektion — der Route `entscheidungen` + die Sektion existieren aber bereits generisch in ALLEN Method-Configs (`DecisionsTabClient`, PROJ-20 create/revise/list). Eine zweite Sektion mit demselben `tabPath` hätte kollidiert/dupliziert. Gelockte Reuse-Vorgabe („Anlage/Revision via bestehender decisions-Route; Log-Sicht ist neue FE") daher umgesetzt als **additive Erweiterung der bestehenden Decisions-Fläche** statt zweiter Route: (1) **CSV-Export-Button** in der `DecisionsTabClient`-Kopfzeile (`decisionsExportUrl`, `include_revised=true`) — der Export-Endpoint filtert server-seitig via `hidden_stage_gate_decision_ids` (HIGH-2 Need-to-know) und labelt Gate-Provenance; gilt für alle Projekt-Typen (non-M&A: keine Gates → leerer Hidden-Set → alle member-sichtbaren Decisions). (2) **AC3 automatisch erfüllt**: Gate-Entscheidungen erscheinen im bestehenden Log als selbst-beschreibende „Stage-Gate N: …"-Einträge (von PROJ-110-Decide-RPC geschrieben). Formaler Quelle-Badge/Filter im Timeline-View bewusst zurückgestellt (nicht nötig — Titel ist selbst-beschreibend, Export trägt formale Provenance; kein Über-Fassen der geteilten Timeline-Komponente). AC5-Filter (Phase/Entscheider/Quelle) liegen als Query-Params am Export-Endpoint vor; UI-Filter im Timeline-View = optionaler Followup. Gates: lint 0, tsc 0 neu, vitest 2287/2287, build clean.

> **Backend-Anteil gebaut 2026-07-21 (bundled mit PROJ-110, Migration `20260721094301`):** Dünne INSERT-only-Erweiterung von `decisions` — neue Spalten `context_finding_id` (FK dd_findings SET NULL), `decision_body`, `options`. HIGH-1: der Immutability-Flip-Trigger verbietet jetzt auch die Mutation dieser 3 Spalten (INSERT-only). POST `/api/projects/[id]/decisions` + `_schema` um die 3 Felder erweitert (Spread-Pattern; Drift-Test grün, Kitchen-Sink ergänzt). **CSV-Export (AC6):** GET `/api/projects/[id]/decisions/export` (RLS-scoped + `include_revised`/`phaseId`/`deciderId`-Filter + Formula-Injection-Escaping + `X-Export-Scope`-Header); HIGH-2-Need-to-know-Filter: Gate-Decisions, deren Gate der Aufrufer nicht sehen darf, werden via `hidden_stage_gate_decision_ids` (PROJ-110) herausgefiltert; sichtbare Gate-Decisions werden über LEFT-Lookup als „Stage-Gate N" gekennzeichnet, alles andere „manuell". AC3 (Gate-Decisions automatisch im Log) liefert PROJ-110 (Decide-RPC schreibt die neutrale `decisions`-Zeile). AC4 (Immutabilität) via PROJ-20-Trigger. Client: `decisionsExportUrl` in `lib/decisions/api.ts` + `DecisionInput`/`Decision`-Type um die 3 Felder erweitert. **Gates:** lint 0, tsc 0 neu, vitest 2287/2287 (inkl. neue export-Route-Tests), build clean. **FE-Anteil (Decision-Log-Seite + Filter Phase/Entscheider/Quelle + Export-Button) → /frontend.**

## Status (vorher): Architected (Tech-Design 2026-06-26 — Decision-Log-Sicht + dünne PROJ-20-Extension; KEINE neue Tabelle [ADR-Config-Downgrade]. Gate-Bridge via PROJ-110. → CIA → /backend|/frontend)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic F — Entscheidungen & Stage-Gates)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-20 Decisions (immutable+supersedes bereits exakt vorhanden). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** F — Entscheidungen & Stage-Gates  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-f` · `mvp`  
> **Abhängigkeiten:** `F1`, `E1`, `G3`, `D1`, `L3`

**User Story:**

Als PMO-Lead möchte ich alle wesentlichen Managemententscheidungen eines M&A-Projekts zentral, nachvollziehbar und revisionssicher dokumentieren, damit jederzeit klar ist, wer was wann auf welcher Grundlage entschieden hat.

**Beschreibung / Kontext:**

Das M&A-Modell fordert ein explizites Entscheidungslog als zentrales Artefakt. Entscheidungen entstehen nicht nur an Stage-Gates, sondern laufend (z. B. Kaufpreisanpassung, Annahme eines Risikos, Anpassung der Verhandlungsposition). Die Plattform muss alle Entscheidungen einheitlich erfassen und verknüpfen können.

**Akzeptanzkriterien:**

- [ ] Entscheidungen können mit Titel, Beschreibung, Entscheidungsdatum, Entscheider, Entscheidungsgremium, Begründung und Entscheidungsoptionen erfasst werden.
- [ ] Jede Entscheidung kann mit Risiken (E1), Findings (G3), Deliverables (D1) oder Phasen (A2) verknüpft werden.
- [ ] Stage-Gate-Entscheidungen (F1) werden automatisch in das Entscheidungslog übernommen.
- [ ] Entscheidungen sind nach Erfassung nicht mehr inhaltlich änderbar; Korrekturen erfolgen ausschließlich durch neue Entscheidungen mit Verweis auf die alte (Korrektureintrag).
- [ ] Eine Filter-Sicht erlaubt es, alle Entscheidungen eines Workstreams, einer Phase oder eines Entscheiders zu listen.
- [ ] Export der Entscheidungen als Liste ist möglich (Reporting, siehe M1).

**Abgrenzungen (Out of Scope):**

- Entscheidungen werden inhaltlich nicht durch die Plattform validiert.
- Eine Workflow-Steuerung im Sinne von Approval-Chains ist Erweiterung; die Erst-Story dokumentiert nur.

**Offene Fragen:**

- Sollen geheime/sensible Entscheidungen nur einem eingeschränkten Personenkreis sichtbar sein (z. B. 'Deal-Inner-Circle')?
- Müssen Korrektureinträge eine Genehmigung durch den Sponsor erfordern?

**Definition of Ready:**

- [ ] Datenmodell für Entscheidungen ist abgestimmt.
- [ ] Verknüpfungspunkte zu anderen Objekten sind spezifiziert.

**Definition of Done:**

- [ ] Erfassung, Verknüpfung, Sperre nach Erfassung und Filter funktionieren.
- [ ] Audit-Trail liefert lückenlosen Nachweis (L3).
- [ ] Export funktioniert in mind. einem Standardformat.

**Abhängigkeiten:**

- F1
- E1
- G3
- D1
- L3

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Executive Sponsor
- Workstream Leads
- Legal Counsel (lesend)

---

## Tech Design (Solution Architect) — 2026-06-26

> **Klasse DUP→REUSE / Config-Downgrade** ([ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) Zeile 79 + §SR-Konsolidierung „111→PROJ-20 Decisions, kein eigener Build"). PROJ-20 `decisions` ist **immutable + `supersedes_decision_id` + `context_phase_id`/`context_risk_id`** bereits live — exakt das geforderte Modell. **Keine neue Tabelle.**

### Grundidee in einem Satz

PROJ-111 ist die **Entscheidungslog-Sicht** im M&A-Projektraum (Liste + Filter + CSV-Export) über die bestehenden PROJ-20-`decisions`, plus eine **dünne Feld-/Link-Erweiterung**; die Immutabilität (AC4) und die Stage-Gate-Übernahme (AC3) liefern PROJ-20 bzw. PROJ-110 ohne Zusatz-Backend.

### A) AC-Zuordnung gegen Ist-Zustand

| AC | Disposition |
|---|---|
| AC1 Titel/Beschreibung/Datum/Entscheider/Begründung/Optionen | ✅ PROJ-20 `decisions` (title/decision_text/rationale/decided_at/decider_stakeholder_id). **Lücke:** „Entscheidungsgremium" (committee) + „Entscheidungsoptionen" (options) — siehe Fork. |
| AC2 Verknüpfung mit Risiken/Findings/Deliverables/Phasen | Teilweise: `context_phase_id`/`context_risk_id` ✅; **`context_finding_id`** (PROJ-114) = dünne neue nullable FK; Deliverables (PROJ-104) deferiert. |
| AC3 Stage-Gate-Entscheidungen automatisch im Log | ✅ via **PROJ-110** (Decide-RPC schreibt eine `decisions`-Zeile) — kein Zusatz hier. |
| AC4 unveränderbar, Korrektur nur via neue Entscheidung | ✅ PROJ-20 Immutability-Trigger + `supersedes_decision_id` (bereits live). |
| AC5 Filter-Sicht (Workstream/Phase/Entscheider) | **NEU (FE):** Decision-Log-Seite mit Filter. |
| AC6 Export als Liste | **NEU:** CSV-Export-Endpoint (RLS-gefiltert), Muster wie PROJ-113 dd-questions-Export. |

### B) Datenmodell

**Keine neue Tabelle.** Dünne Erweiterung von `decisions`:
- `context_finding_id uuid` (nullable FK `dd_findings`) — AC2-Finding-Link.
- „Entscheidungsgremium"/„Optionen": Fork (siehe unten) — Empfehlung: leichte Felder `decision_body text` (Gremium frei) + `options text` ODER an PROJ-98 Gremien deferieren.

### C) Komponenten

```
M&A-Projektraum
+-- Navigationseintrag "Entscheidungen" (project_type='ma', requiresProjectType)
    +-- Decision-Log-Liste (alle PROJ-20-decisions des Projekts)
    |   +-- Filter: Phase · Entscheider · (Quelle: Gate/manuell)
    |   +-- Revisions-Kette sichtbar (supersedes → is_revised)
    +-- "Entscheidung erfassen" (reuse bestehender POST /decisions; manuell)
    +-- CSV-Export
```

### D) Tech-Entscheidungen

- **Reuse PROJ-20 end-to-end:** Anlage/Revision via bestehender `decisions`-Route; Log-Sicht ist neue FE + ein Export-Endpoint. Kein neues State-/Immutability-Modell.
- **Gate-Einträge** erscheinen automatisch (von PROJ-110 geschrieben) — die Sicht unterscheidet sie via `context_phase_id`/Provenance.
- **Confidentiality:** `decisions` trägt heute KEINE `confidentiality_level`-Spalte. Das ist eine **cross-cutting** Kernänderung (alle Projekte). Fork: weglassen (Decision-Log = projekt-member-sichtbar, sensible Inhalte bleiben in Gate/Finding) vs. additive Spalte. Empfehlung: **weglassen im MVP**.

### E) Offene Forks (für CIA)

1. **Committee/Optionen (AC1-Lücke):** leichte `decision_body`/`options`-Textfelder an `decisions` **vs.** Gremium an PROJ-98 (ungebaut) deferieren + Optionen aus Scope. Empfehlung: leichte Textfelder (klein, M&A-tauglich) oder Defer.
2. **`confidentiality_level` an `decisions`:** weglassen (Empfehlung, MVP) **vs.** cross-cutting Spalte ergänzen.
3. **Slice-Schnitt:** 111 als reine FE+Export-Slice (Backend nur die 1–2 nullable FK/Textfelder) — ggf. mit PROJ-110 gebündelt, da gekoppelt.

### F) Abhängigkeiten

- **Live:** PROJ-20 `decisions` (+ Immutability), PROJ-10 Audit, PROJ-114 `dd_findings` (für `context_finding_id`).
- **Bridge:** PROJ-110 schreibt Gate-Decisions.
- **Deferiert:** Deliverable-Link (PROJ-104), Gremien (PROJ-98).
- **Neue npm-Pakete:** keine.

### E-CIA) CIA-Review 2026-06-26 — ADJUST (gelockt, gebündelt mit PROJ-110)

- **Keine neue Tabelle** bestätigt (Config-Downgrade). Reuse PROJ-20 `decisions` end-to-end.
- **`context_finding_id` = INSERT-only (HIGH-1):** der Immutability-Trigger blockiert nachträgliche UPDATEs → die Finding-Verknüpfung wird **bei Anlage** gesetzt (POST /decisions + Decide-RPC), nicht nachträglich. AC2 entsprechend „bei Anlage verknüpfbar".
- **Gate-Provenance ohne `source`-Spalte (Fork 3):** Gate- vs. manuelle Decisions werden in der Log-Sicht per **LEFT JOIN auf `ma_stage_gates.decision_id`** unterschieden — kein cross-cutting Feld.
- **Need-to-know am Log (HIGH-2):** confidentiality NICHT als Core-Spalte. Stattdessen: Gate-Decisions tragen nur Outcome+neutralen Summary (vertraulicher Grund liegt RLS-gated auf `ma_stage_gates`), und die Log-Sicht **blendet Gate-Decisions aus, deren verknüpftes Gate der Aufrufer nicht sehen darf** (JOIN gegen das RLS-gated `ma_stage_gates`). Manuelle Decisions bleiben member-sichtbar.
- **committee/options:** leichte additive INSERT-only-Textfelder `decision_body` + `options` an `decisions` (M&A-tauglich, harmlos). GO.
- **`decisions`-Audit:** bleibt die Revisions-Kette (immutable); kein UPDATE-Audit-Loch, da `context_finding_id` per INSERT. Kein HistoryTab nötig.
- **Slice:** gebündelt mit PROJ-110 (ein `/qa`-Lauf). Backend-Anteil von 111 = nur die 3 INSERT-Felder + CSV-Export-Endpoint; Rest ist FE.

### G) Handoff

Klein und an PROJ-110 gekoppelt → **gemeinsamer Slice mit PROJ-110** (110 schreibt Decisions, 111 zeigt+exportiert). `/backend`-Anteil 111: `decisions`-INSERT-Felder (`context_finding_id`/`decision_body`/`options`) + RLS-gefilterter CSV-Export-Endpoint → `/frontend` (Entscheidungs-Log-Seite + Filter Phase/Entscheider/Quelle + Export) → `/qa`.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · F — Entscheidungen & Stage-Gates_
