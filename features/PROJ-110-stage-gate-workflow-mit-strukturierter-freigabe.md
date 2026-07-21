---
id: PROJ-110
title: "Stage-Gate-Workflow mit strukturierter Freigabe"
issue_type: Story
epic_code: F
epic_title: "Entscheidungen & Stage-Gates"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-f", "mvp"]
dependencies: ["A2", "B2", "D1", "E2", "F2", "L3"]
roles: ["Executive Sponsor", "Steering Committee", "Deal Lead", "PMO-Lead", "Workstream Leads (lesend)"]
summary_for_jira: "[F1] Stage-Gate-Workflow mit strukturierter Freigabe"
---

# PROJ-110: Stage-Gate-Workflow mit strukturierter Freigabe

## Status: In Progress (Backend gebaut 2026-07-21, gebündelt mit PROJ-111 — → /frontend → /qa)

> **Backend gebaut 2026-07-21 (bundled slice mit PROJ-111):** Migration `20260721094301_proj110_stage_gates_and_decision_fields` in Prod. Neue `ma_stage_gates` (9-Gate-Preset copy-on-create, `target_phase_id` nullable FK, 4-State-Status pending/passed/conditional/aborted, 3-Wege-`decision` freigabe/auflage/abbruch, `conditions`, `decision_reason` [vertraulich], `decision_id` FK decisions, `confidentiality_level`); 2 SELECT-Policies (permissive `is_project_member` + RESTRICTIVE `can_access_classified`, mirror dd_findings) — Writes RPC-only, keine INSERT/UPDATE/DELETE-Policies. RPCs: `seed_stage_gates` (lazy-seed mirror `activate_ma_phase_model`, idempotent, M&A-only, admin/lead-gated, anon-revoked, Gate N → Phase seq N+1), `decide_stage_gate` (SECURITY DEFINER, auth.uid()-only, admin/lead + `can_access_classified`-Re-Check + pending-Guard, atomar: schreibt NEUTRALE PROJ-20-`decisions`-Zeile → Freigabe/Auflage → `transition_phase_status`, Abbruch → `transition_project_status('canceled')`; vertraulicher Grund/Conditions leben auf dem Gate, NUR neutrale Kommentare fließen in `project_lifecycle_events`), `stage_gate_prereadiness` (SECURITY INVOKER → Need-to-know des Aufrufers gilt; zählt offene Tasks/Risiken-ohne-Maßnahme/offene Red-Flags, Deliverables=null bis PROJ-104), `hidden_stage_gate_decision_ids` (SECURITY DEFINER Set-Helper für den 111-Log-/Export-Need-to-know-Filter). Audit: `ma_stage_gates` in CHECK + `_tracked_audit_columns` (NUR status/decision/decision_id/decided_by/decided_at/confidentiality_level — NICHT decision_reason/conditions, da audit_log member-level) + `can_read_audit_entry` (+authenticated-Grant re-granted, PROJ-114-Lektion). HIGH-1: Immutability-Trigger erweitert (Flip-Path verbietet auch die 3 neuen decisions-Spalten). HIGH-2: neutrale Decision + vertraulicher Grund RLS-gated auf Gate + Log-Filter. **APIs:** GET `/stage-gates`, POST `/stage-gates/seed`, GET `/stage-gates/[gid]/prereadiness`, POST `/stage-gates/[gid]/decide` + Client `lib/ma-project/stage-gates-api.ts`. **Gates:** lint 0, tsc 14 baseline/0 neu, vitest 2287/2287 (+27 Route-Tests), build clean, Advisors 0 ERROR/0 rls_disabled. **Pflicht-Live-RPC-Smoke `tests/sql/PROJ-110-stage-gates-pentest.sql` A–J 11/11 PASS gegen Prod, 0 Residue** (seed 9 + idempotent; Freigabe→passed+Phase in_progress; Decision neutral + Grund auf Gate; pending-Guard 23514; Editor-Deny 42501; non-cleared-Lead-auf-strict-Deny 42501; Abbruch→Projekt canceled + neutraler Lifecycle-Kommentar; Need-to-know: strict-Gate für Nicht-Cleared versteckt / für Admin sichtbar; Audit-Zeilen ma_stage_gates+decisions; Pre-Read-Counts). **Deferrals:** Multi-Approver-Quorum → PROJ-Y-110-quorum; Pflicht-Deliverables im Pre-Read → PROJ-104; genehmigungspflichtiger Phasenrücksprung → PROJ-Y.

## Status (vorher): Architected (Tech-Design 2026-06-26 — `ma_stage_gates` füllt den PROJ-95-Hook; Decide-RPC schreibt PROJ-20-Decision + transition_phase/project; reuse PROJ-31/19/2/20; Pre-Read live über tasks/risks/findings. Quorum-Fork → CIA. → CIA → /backend)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic F — Entscheidungen & Stage-Gates)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-31 Approval-Gates + PROJ-19 Phasen-Transition. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** F — Entscheidungen & Stage-Gates  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-f` · `mvp`  
> **Abhängigkeiten:** `A2`, `B2`, `D1`, `E2`, `F2`, `L3`

**User Story:**

Als Executive Sponsor möchte ich an jedem der neun Stage-Gates strukturiert und nachvollziehbar entscheiden können (Fortsetzen, Anpassen, Abbrechen), damit das M&A-Projekt diszipliniert geführt wird und Risiken nicht unbemerkt in die nächste Phase übertragen werden.

**Beschreibung / Kontext:**

Das Best-Practice-Modell sieht neun Stage-Gates vor (Gate 1 'M&A-Strategie' bis Gate 9 'Value Realization'). Die Plattform muss diese Gates pro Projekt instanziieren, an Phasenübergänge koppeln, die für die Entscheidung notwendigen Inhalte (Deliverables, Risiken, offene Punkte, Empfehlung) zusammenführen und die Freigabe protokollieren.

**Akzeptanzkriterien:**

- [ ] Pro Projekt werden alle neun Stage-Gates aus dem Modell automatisch angelegt und können konfigurativ erweitert werden.
- [ ] Jedes Gate hat eine Pre-Read-Sicht, die automatisch verlinkte Pflicht-Deliverables (siehe D1), offene Red Flags (E2), offene Aufgaben (C1) und die Entscheidungsempfehlung des Deal Leads anzeigt.
- [ ] Vor einer Gate-Entscheidung weist die Plattform auf nicht erfüllte Pflicht-Deliverables und auf aktive Risiken ohne Maßnahme hin (siehe E3).
- [ ] Ein Gate kann mit einer der drei Entscheidungen abgeschlossen werden: Freigabe, Auflage (bedingte Freigabe mit Pflichten), Abbruch.
- [ ] Bei Freigabe wird die nächste Phase aktiviert (siehe A2); bei Abbruch wird das Projekt in den Status 'Beendet' überführt mit Pflicht zur Begründung.
- [ ] Jede Gate-Entscheidung erzeugt einen unveränderbaren Eintrag im Entscheidungslog (F2) und im Audit-Trail (L3).

**Abgrenzungen (Out of Scope):**

- Die Plattform trifft selbst keine Entscheidung – sie strukturiert die Entscheidungsvorbereitung.
- Eine inhaltliche Bewertung der Deliverables ist nicht in Scope.
- Eine elektronische Signatur des Gate-Beschlusses ist Erweiterung (siehe offene Frage).

**Offene Fragen:**

- Soll die Plattform eine qualifizierte elektronische Signatur am Gate verpflichtend einbinden?
- Sollen Gates Mehrfachunterschriften (z. B. Sponsor + CFO + Legal) erzwingen?
- Sind kundenspezifische Zusatzgates erlaubt (z. B. Beirats-Vorgate)?

**Definition of Ready:**

- [ ] Stage-Gate-Konfigurationsmodell und Pflichtinhalte je Gate liegen vor.
- [ ] Verknüpfung zu Phasen (A2) und Deliverables (D1) ist spezifiziert.
- [ ] Eskalationsregeln bei abgelehnten Gates sind dokumentiert.

**Definition of Done:**

- [ ] Alle neun Gates sind im System konfiguriert.
- [ ] Pre-Read-Sicht und Warnhinweise sind funktional und getestet.
- [ ] Entscheidungen erscheinen revisionssicher im Log und im Audit-Trail.
- [ ] Mind. ein End-to-End-Testszenario von Gate 1 bis Gate 9 ist durchlaufen.

**Abhängigkeiten:**

- A2 – Phasenmodell
- B2 – Steering Committee
- D1 – Deliverables
- E2 – Red Flags
- F2 – Entscheidungslog
- L3 – Audit-Trail

**Betroffene Rollen:**

- Executive Sponsor
- Steering Committee
- Deal Lead
- PMO-Lead
- Workstream Leads (lesend)

---

## Tech Design (Solution Architect) — 2026-06-26

> **Klasse DUP→REUSE** ([ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) Zeile 78). Füllt den von **PROJ-95** bewusst offengelassenen **Stage-Gate-Hook** im Phasenübergang. Reuse: PROJ-19 `transition_phase_status`, PROJ-2 `transition_project_status('canceled')`, PROJ-20 `decisions` (Log), PROJ-31 (Quorum-Muster), PROJ-100a (Confidentiality), PROJ-10 (Audit), PROJ-114 `dd_findings` (live, Pre-Read).

### Grundidee in einem Satz

Ein **Stage-Gate** ist ein Steuerungsobjekt pro M&A-Projekt zwischen zwei Phasen; eine Gate-Entscheidung (**Freigabe / Auflage / Abbruch**) wird über eine RPC getroffen, die (a) einen **unveränderbaren PROJ-20-Decision-Eintrag** schreibt (= der „Entscheidungslog"-Eintrag aus PROJ-111), (b) bei Freigabe/Auflage die **nächste Phase aktiviert** (`transition_phase_status`) bzw. bei Abbruch das **Projekt beendet** (`transition_project_status('canceled', reason)`), und (c) auditiert wird.

### A) Komponenten-Struktur

```
M&A-Projektraum
+-- Navigationseintrag "Stage-Gates" (nur project_type='ma', requiresProjectType)
    +-- Gate-Liste (9 Standard-Gates, je Status: ausstehend / freigegeben / Auflage / abgebrochen)
    +-- Gate-Detail / Pre-Read-Sicht (AC2/AC3)
    |   +-- offene Aufgaben der Phase (PROJ-9 work_items)
    |   +-- aktive Risiken ohne Maßnahme (PROJ-20 risks, mitigation null)
    |   +-- offene Red-Flags (PROJ-114 dd_findings severity=deal_breaker, live)
    |   +-- Pflicht-Deliverables (PROJ-104 → Platzhalter „— noch nicht verlinkt")
    |   +-- Readiness-Warnung (nicht erfüllte Pflichten / Risiken ohne Maßnahme)
    +-- Aktion "Gate entscheiden" (Freigabe / Auflage+Bedingungen / Abbruch+Begründung)
    +-- Historie (PROJ-10 HistoryTab + verlinkter Decision-Log-Eintrag)
```

### B) Datenmodell in Klartext

**`ma_stage_gates` — ein Gate pro (Projekt, gate_key)** (NEU — der einzige neue Knoten)
- Projekt-/Tenant-Bezug (Multi-Tenant-Invariante)
- `gate_key` + `label` + `sequence_number` (aus 9er-Code-Preset, Copy-on-create wie PROJ-95-Phasen-Preset)
- `target_phase_id` (nullable FK `phases` — die Phase, deren Aktivierung dieses Gate freigibt; nullable, weil Phasen erst via PROJ-95 geseedet werden — forward-compat)
- `status` (`pending · passed · conditional · aborted`)
- `decision` (`freigabe · auflage · abbruch`, null bis entschieden)
- `conditions` (Text, Pflichten bei Auflage)
- `decision_id` (FK `decisions` — der unveränderbare Log-Eintrag, PROJ-20/111)
- `decided_by`, `decided_at`
- `confidentiality_level` (PROJ-100a, default `standard`)
- Eindeutig `(project_id, gate_key)`. Field-Level-Audit (PROJ-10).

**Kein eigenes Approval-Schema im MVP** (siehe Fork unten): die Gate-Entscheidung ist eine **Einzel-Autoritäts-Entscheidung** des Deal Leads/Tenant-Admins, unveränderbar im Decision-Log festgehalten. Multi-Approver-Quorum (PROJ-31-Klon) ist deferiert.

**Decide-RPC** `decide_stage_gate(p_gate_id, p_decision, p_reason, p_conditions)` (SECURITY DEFINER, kein actor-param, manager-gated [admin OR project-lead] + `can_access_classified`-Re-Check):
- validiert: Gate ist `pending`, gültige decision
- **Freigabe / Auflage:** schreibt PROJ-20-`decisions`-Zeile (`context_phase_id=target_phase_id`, `decision_text`, `rationale=reason`), setzt Gate `passed`/`conditional` + `decision_id` + `conditions`, aktiviert die Zielphase (`transition_phase_status(target_phase_id,'in_progress')`)
- **Abbruch:** schreibt Decision-Zeile, setzt Gate `aborted`, `transition_project_status(project,'canceled',reason)` (Pflicht-Begründung)
- alles in einer TX, auditiert; idempotent gegen Doppel-Entscheidung (pending-Guard)

**Pre-Read** = read-only Aggregation (RPC `stage_gate_prereadiness(p_gate_id)` ODER API-seitig), liefert Counts: offene Tasks, Risiken-ohne-Maßnahme, offene Deal-Breaker-Findings; Deliverables = `null`/Platzhalter bis PROJ-104.

### C) Tech-Entscheidungen

- **Gate-Decision = PROJ-20-Decision (kein zweiter Log):** AC6 (unveränderbarer Eintrag) + PROJ-111-AC3 (Gate-Entscheidungen automatisch im Log) werden **gemeinsam** erfüllt, indem die Decide-RPC eine `decisions`-Zeile schreibt. Kein paralleles Entscheidungslog.
- **Phasenübergang/Projektende = reuse:** `transition_phase_status` (PROJ-19) + `transition_project_status('canceled')` (PROJ-2) — kein neuer State-Machine-Code; nur der Gate-Wrapper ist neu (füllt den PROJ-95-Hook).
- **9-Gate-Preset als Code-Konstante + Copy-on-create**, exakt das PROJ-95-Muster; editierbare Gate-Bibliothek = später (PROJ-96-analog).
- **Confidentiality + Audit** nach dem etablierten dd_*-Rezept (Floor nicht nötig — Gate hängt an Projekt, nicht an einem höher klassifizierten Eltern-Objekt; `standard`-Default).
- **Pre-Read degradiert gracefully:** Deliverables (PROJ-104 ungebaut) → Platzhalter; Findings (PROJ-114 live) → echte Counts.

### D) Bewusste Scope-Cuts / Deferrals

| AC-Teil | Wohin | Begründung |
|---|---|---|
| Multi-Approver-**Quorum** für Gates | **PROJ-Y (110-Quorum)** | Spec verlangt 3-Wege-Entscheidung, KEIN Quorum; PROJ-31-Klon (state+approvers+magic-link+events) ist eigener großer Slice. MVP = Einzel-Autorität, im Log unveränderbar. |
| Pflicht-Deliverables im Pre-Read (D1) | **PROJ-104** | `deliverables`-Tabelle existiert nicht → Platzhalter |
| Genehmigungspflichtiger **Phasenrücksprung** | **PROJ-Y** | aus PROJ-95 deferiert; Gate-MVP deckt Vorwärts-Freigabe + Abbruch |
| Red-Flag-Report im Gate-Kontext | **PROJ-116** | Report-Owner |

### E) PROJ-111-Kopplung (Decision-Log)

PROJ-110 schreibt die Gate-Entscheidung als PROJ-20-`decisions`-Zeile. **PROJ-111** liefert die Log-**Sicht** (Filter/Liste/Export) über genau diese Decisions — kein eigenes Backend für den Gate-Pfad nötig. Siehe PROJ-111-Tech-Design.

### F) Abhängigkeiten

- **Live:** PROJ-94, PROJ-95 (Phasen-Preset + Hook), PROJ-19, PROJ-2, PROJ-20, PROJ-100a, PROJ-10, PROJ-114 (Findings).
- **Forward-compatible:** PROJ-104 (Deliverables-Pre-Read), PROJ-Y (Quorum, Phasenrücksprung).
- **Neue npm-Pakete:** keine.

### G) Offene Architektur-Forks (für CIA)

1. **Quorum:** Einzel-Autoritäts-Gate-Entscheidung (MVP, Empfehlung) **vs.** PROJ-31-Multi-Approver-Quorum-Klon jetzt.
2. **Neues `ma_stage_gates`-Table** (Empfehlung — Gate hat Status/Sequence/Phase-Link/3-Wege-Outcome, passt nicht in approval/decision allein) **vs.** Gate rein als PROJ-31-Approval + PROJ-20-Decision ohne Gate-Tabelle.
3. **`target_phase_id` nullable** (forward-compat, Phasen via PROJ-95 geseedet) **vs.** Pflicht-FK.
4. **Pre-Read als RPC vs. API-seitige Aggregation.**

### G-CIA) CIA-Review 2026-06-26 — ADJUST→GO (2 Lock-Punkte)

- **Fork 1 Quorum → GO** (Einzel-Autorität MVP): Governance-Absicherung liegt im unveränderbaren Decision-Log + Audit + manager-gate + clearance-recheck; AC verlangen 3-Wege-Outcome, **kein** Quorum (Mehrfachunterschrift steht unter „Offene Fragen"). Multi-Approver = eigener großer PROJ-31-Klon → **deferiert [[PROJ-Y-110-quorum]]**. Decide-RPC so schneiden, dass Quorum später als „auto-pass bei erfülltem Quorum" andockt (Gate-Status `pending` bleibt Anker).
- **Fork 2 `ma_stage_gates` → GO** (Status/Sequence/Phase-Link/3-Wege-Outcome ist Gate-Semantik, passt nicht in approval/decision allein).
- **Fork 3 Gate→Decision → GO mit Auflage:** **KEINE `source`-Spalte** an `decisions`. Gate-Provenance wird per **LEFT JOIN** `ma_stage_gates.decision_id` abgeleitet (Rück-FK existiert) — vermeidet zweite cross-cutting Änderung.
- **Fork 4 → ADJUST (2× HIGH, gelockt):**
  - **HIGH-1 (Immutability):** Der PROJ-20-Immutability-Trigger blockiert JEDE Spaltenänderung außer dem `is_revised`-Flip. ⇒ `context_finding_id` (und committee/options) MÜSSEN **beim INSERT** gesetzt werden (Decide-RPC + POST /decisions-Payload), **nie via UPDATE**. AC2 = „bei Anlage verknüpfbar", nicht „jederzeit nachverknüpfbar".
  - **HIGH-2 (Need-to-know):** confidentiality am Decision-Log NICHT pauschal weglassen — Gate-**Abbruchbegründungen** sind der sensibelste Deal-Inhalt. **Lösung ohne cross-cutting Spalte:** der vertrauliche Grund/Conditions lebt auf `ma_stage_gates` (RLS-gated via `can_access_classified`); die `decisions`-Zeile trägt nur **Outcome + neutralen Summary** (kein vertraulicher Klartext). Zusätzlich filtert die PROJ-111-Log-Sicht Gate-Decisions über die Sichtbarkeit des verknüpften Gates (JOIN). Manuelle Decisions bleiben member-sichtbar (Status quo). `decisions` bleibt unverändert.
- **`canceled` vs „Beendet":** reuse `transition_project_status(…,'canceled',…)`; „Beendet" ist nur das DE-UI-Label (kein neuer Status).
- **Audit-Checkliste (Pflicht):** entity_type-CHECK-vor-Write für `ma_stage_gates`; falls `can_read_audit_entry`/`_tracked_audit_columns` recreated → **authenticated-Grant re-granten** (Lektion 114); PROJ-134-Naming; Live-RPC-Smoke Pflicht.
- **Fork 5 Slice → GO:** 110+111 als **ein gebündelter Slice**, Build-Reihenfolge: (1) `decisions`-INSERT-Felder (`context_finding_id` + `decision_body`/`options`), (2) `ma_stage_gates` + Preset + `decide_stage_gate` + Audit, (3) Pre-Read, (4) FE Stage-Gates, (5) FE Decision-Log + CSV. Ein `/qa`-Lauf.

### H) Handoff

Nach Approval: **gebündelter `/backend`-Slice (110+111)** in der CIA-Build-Reihenfolge — Migration(en): `decisions`-INSERT-Felder + `ma_stage_gates` + 9-Gate-Preset-Seed + `decide_stage_gate`-RPC (sensibler Grund auf Gate, neutraler Summary in decision) + Confidentiality-Policies + Audit-Wiring + Pre-Read-Aggregation; APIs + Client-Wrapper; **Pflicht-Live-RPC-Smoke** (Freigabe→Phase-Aktivierung, Abbruch→Projekt-`canceled`, Decision-INSERT mit Gate-Link, Clearance-/Authority-Verweigerung, Need-to-know-Filter im Log) → `/frontend` (Stage-Gates-Seite + Decision-Log-Sicht) → `/qa` (Pentest inkl. HIGH-2-Leak-Vektor).

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · F — Entscheidungen & Stage-Gates_
