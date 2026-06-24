---
id: PROJ-95
title: "M&A-Phasenmodell abbilden und visualisieren"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-a", "mvp"]
dependencies: ["A1", "F1"]
roles: ["Deal Lead", "PMO-Lead", "Workstream Leads", "Steering Committee (lesend)"]
summary_for_jira: "[A2] M&A-Phasenmodell abbilden und visualisieren"
---

# PROJ-95: M&A-Phasenmodell abbilden und visualisieren

## Status: In Progress (Backend gebaut 2026-06-24 — Preset + activate-RPC + Mandate-Gate live; Cockpit-UI + /qa offen)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)

## Implementation Notes — Backend (2026-06-24)

Genau nach Tech-Design gebaut. **Keine neue Phasentabelle, kein neuer Dep.** Vorbedingung [[PROJ-139]] (Status `suspended`) ist in derselben Branch gebaut.

- **Preset** `src/lib/project-types/ma-phase-preset.ts` — `MA_PHASE_PRESET` (10 Phasen Strategie→PMI, Code-Konstante, `deal_side`-Feld forward-kompatibel für PROJ-96). Phase 2 trägt `mandateGated: true`.
- **Seed-RPC** `activate_ma_phase_model(p_project_id)` (Migration `20260624120635`, in Prod; Repo-Dateiname == prod-Version per PROJ-134): idempotent (Dedupe `project_id`+`name`), kopiert Preset → bestehende `phases`-Zeilen (`status='planned'`). **Mandate-Gate hart:** Phase 2 „Target-Screening" wird NUR geseedet wenn `ma_project_profiles.mandate_status='approved'` (PROJ-94-Gate) — „freischaltbar" wörtlich umgesetzt. Authority: tenant-admin ODER project-lead. project_type='ma'-Check. **Impersonation-safe:** `auth.uid()`-only (kein actor-param), `execute` von anon revoked, grant authenticated (PROJ-94-Lektion). Core `transition_phase_status` UNBERÜHRT — das Gate lebt vollständig in der M&A-RPC.
- **API** `POST /api/projects/[id]/phase-model/activate` (mirror mandate-Route: view-Access-Check + RPC-Dispatch; 403/404/422-Mapping). Client-Wrapper `activateMaPhaseModel` in `src/lib/ma-project/api.ts`.

**Pflicht-Live-RPC-Smoke gegen Prod (ephemeres M&A-Projekt, JWT-Impersonation, 0 Residue via ROLLBACK_MARKER):** mandate=draft → 9 geseedet, `phase2_locked=true`; mandate=approved → +1 (Phase 2), `phase2_locked=false`; Re-Run → 0 geseedet (idempotent); total=10 Phasen.

**Quality-Gates:** lint 0, tsc 14 baseline/0 neu, vitest +11 (5 Preset + 6 Route), build clean (neue Route registriert).

**Offen / deferiert lt. Tech-Design:** Cockpit-UI (Route `/projects/[id]/phasenmodell`, reuse gantt-view/phases-timeline + Stage-Gate-Badge) → /frontend; AC-95-2 „ausgesetzt" nutzt [[PROJ-139]]; AC-95-5 Deliverable-Link → PROJ-104; genereller Stage-Gate-Zwang → PROJ-110; editierbare Template-Bibliothek + deal_side-Matrix → PROJ-96. /qa: Negativtests Mandate-Gate + Idempotenz + E2E Roadmap.
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-19 Phasen/Milestones + PROJ-6 Method-Catalog (M&A-Phasen als Methode, kein neues Phasen-Schema). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** A — Projektgrundlagen & Phasenmodell  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-a` · `mvp`  
> **Abhängigkeiten:** `A1`, `F1`

**User Story:**

Als PMO-Lead möchte ich die zehn M&A-Standardphasen pro Projekt aktivieren, konfigurieren und visuell darstellen können, damit alle Beteiligten jederzeit erkennen, in welcher Phase sich der Deal befindet.

**Beschreibung / Kontext:**

Das Modell unterscheidet zehn Phasen von Strategie bis Post-Merger-Integration. Die Plattform muss diese Phasen als verbindlichen Steuerungsrahmen abbilden, Übergänge an Stage-Gates koppeln und Projektfortschritt sichtbar machen.

**Akzeptanzkriterien:**

- [ ] Pro Projekt sind alle zehn Standardphasen verfügbar und können einzeln aktiviert oder deaktiviert werden.
- [ ] Pro Phase werden Start- und Soll-Endtermin, Verantwortliche(r) und Status (geplant, aktiv, abgeschlossen, ausgesetzt) gepflegt.
- [ ] Ein Phasen-Cockpit zeigt eine Roadmap (Gantt-ähnlich) mit Ist-Status, Soll-Termin und aktuellem Stage-Gate-Stand.
- [ ] Ein Übergang in die nächste Phase ist nur möglich, wenn das zugehörige Stage-Gate (siehe F1) freigegeben ist.
- [ ] Phasen-Verantwortliche können je Phase eigene Notizen, Risiken (E1) und Deliverables (D1) verknüpfen.

**Abgrenzungen (Out of Scope):**

- Methodische Vorgabe der Phaseninhalte ist nicht Teil der Plattform – Templates können hinterlegt werden, Inhalte bleiben fachliche Verantwortung der Workstreams.
- Die Plattform schreibt keine Mindest-Phasendauer vor.

**Offene Fragen:**

- Sollen alternative Phasenmodelle (Carve-out, Distressed, JV) parallel verfügbar sein?
- Muss eine Rückführung in eine frühere Phase technisch möglich und genehmigungspflichtig sein?
- Werden Phasen-Templates zentral durch Corporate Development gepflegt oder pro Projekt anpassbar?

**Definition of Ready:**

- [ ] Phasendefinitionen und Stage-Gate-Logik sind mit M&A und PMO abgestimmt.
- [ ] Visualisierungs-Mockups sind freigegeben.
- [ ] Verhalten beim Phasenrücksprung ist entschieden.

**Definition of Done:**

- [ ] Anwender können Phasen aktivieren, terminieren, Verantwortliche zuweisen und Status setzen.
- [ ] Roadmap-Ansicht ist im Browser erreichbar und korrekt.
- [ ] Phasenübergang ist mit Stage-Gate-Prüfung gekoppelt (Testfälle nachgewiesen).

**Abhängigkeiten:**

- A1 – Projektanlage
- F1 – Stage-Gate-Prüfungen

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Workstream Leads
- Steering Committee (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · A — Projektgrundlagen & Phasenmodell_

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-06-24 · **Author:** /architecture skill (CIA-reviewed)
> **Audience:** PM + dev team. Keine Code-/SQL-Snippets; nur strukturelle Referenzen.
> **Reuse-Klasse (ADR `ma-domain-architecture`, Fork 1+5):** **DUP→REUSE** — Andockpunkt **PROJ-19 Phasen/Milestones + PROJ-6 Method-Catalog**. **Es wird KEINE zweite Phasentabelle gebaut.**

### 0. Worum es geht (Scope in einem Absatz)

PROJ-95 macht aus einem M&A-Projektcontainer (PROJ-94) einen **ablauffähigen Deal** mit den zehn M&A-Standardphasen. Es liefert (a) ein **M&A-Phasen-Preset** (10 Phasen), das beim Aktivieren in die **bestehende** `phases`-Tabelle kopiert wird, (b) ein **Phasen-Cockpit** (Roadmap), das die **bereits existierende** Gantt-/Timeline-UI wiederverwendet, und (c) die **Konsumption des Mandate-Gates** aus PROJ-94 (`mandate_status='approved'` → Phase 2 „Target-Screening" wird freischaltbar). Alles andere (editierbare Template-Bibliothek, generischer Stage-Gate-Zwang, Deliverable-Verknüpfung, der Status „ausgesetzt") wird **forward-kompatibel** an benannte Slices deferiert.

### 1. Was gebaut wird (Komponenten-Sicht)

```
PROJ-95 M&A-Phasenmodell
├── Backend
│   ├── M&A-Phasen-Preset (Code-Konstante, 10 Phasen)        ← NEU, in src/lib/project-types/ (neben MA_PROFILE)
│   │     Phase 1 Strategie … Phase 10 Post-Merger-Integration; je: Name, Reihenfolge, deal_side-Sichtbarkeit
│   ├── RPC „M&A-Phasenmodell aktivieren" (seed, idempotent)  ← NEU; kopiert Preset → bestehende `phases`-Zeilen
│   ├── Mandate-Gate-Check für Phase-2-Aktivierung           ← NEU; konsumiert ma_project_profiles.mandate_status
│   └── REUSE: `phases`-Tabelle, `transition_phase_status`-RPC, `milestones`, PROJ-100a confidentiality_level
├── Frontend
│   ├── Phasen-Cockpit (Route /projects/[id]/phasenmodell)    ← NEU dünne Seite, M&A-nav-gated (requiresProjectType)
│   │     ├── REUSE components/phases/gantt-view + phases-timeline   (Roadmap, AC-95-3)
│   │     ├── Stage-Gate-Status-Spalte/Badge je Phase               ← NEU (zeigt Mandate-/Gate-Stand)
│   │     ├── „Phasenmodell aktivieren"-Aktion (ruft seed-RPC)      ← NEU
│   │     └── Phase aktiv/inaktiv-Toggle (AC-95-1)                  ← REUSE phase create / cancel
│   └── REUSE: use-phases, phase-card, phase-status-badge, new/edit/delete-phase-dialog, reorder-phases
└── Abhängigkeit (Vorbedingung): PROJ-139 (Core-Status „suspended") für AC-95-2 „ausgesetzt"
```

### 2. Datenmodell in Klartext

**Keine neue Tabelle.** Die zehn M&A-Phasen leben als **gewöhnliche Zeilen in der bestehenden `phases`-Tabelle** (eine Zeile pro aktivierter Phase, mit `project_id`, Name, `sequence_number`, `planned_start/end`, Verantwortliche(r), `status`, `confidentiality_level`). Das M&A-Preset selbst (welche 10 Phasen es gibt, in welcher Reihenfolge, welche je `deal_side` sichtbar sind) ist eine **deklarative Code-Konstante** — keine DB-Tabelle, weil die editierbare Template-**Bibliothek** bewusst Fork 5 / PROJ-96 gehört.

- **Aktivieren einer Phase (AC-95-1)** = die Preset-Phase wird als `phases`-Zeile angelegt (über die seed-RPC en bloc oder einzeln über den bestehenden Phase-Dialog). **Deaktivieren** = Phase wird nicht geseedet bzw. auf `cancelled` gesetzt (kein Hard-Delete → Audit bleibt).
- **Phasenfelder (AC-95-2)**: vollständig durch bestehende `phases`-Spalten gedeckt — Start/Soll-Ende, Verantwortliche(r), Status. **Der Status „ausgesetzt" fehlt im Core-CHECK** und wird durch die Vor-Slice **PROJ-139** ergänzt (siehe §7). Bis PROJ-139 landet, nutzt 95 die vier Bestandswerte.
- **Mandate-Gate-Flag**: gelesen aus `ma_project_profiles.mandate_status` (PROJ-94). Wird nicht dupliziert.
- **Stage-Gate-Stand je Phase (AC-95-3-Anzeige)**: im MVP abgeleitet (Phase 2 „freischaltbar/gesperrt" aus dem Mandate-Flag); der generische Gate-Zustand kommt aus PROJ-110.
- **Phasen-Notizen/Risiken/Deliverables (AC-95-5)**: Risiken via **PROJ-20**-Cross-Link (Risiko ↔ Phase, existiert); Notizen via `phases.description` bzw. bestehende Felder; **Deliverable-Verknüpfung deferiert an PROJ-104** (Tabelle existiert noch nicht).

### 3. Tech-Entscheidungen (das Warum) — CIA-gelockt (E5/E7)

| Entscheidung | Wahl | Warum / Trade-off |
|---|---|---|
| **E5 Phasen-Preset** | PROJ-6-„Methode" + **Copy-on-Create** der 10 Phasen in `phases`; Preset als Code-Konstante; `deal_side` nur minimale Sicht-/Label-Variation | Exakt das ADR-Reuse-Muster; **keine zweite Phasentabelle**. Trade-off: 95 liefert **einen** Default-Satz — die editierbare Template-Bibliothek + deal_side-Matrix ist **PROJ-96**. Forward-kompatibel: 96 ersetzt später die Konstante durch einen Template-Tabellen-Lookup, ohne 95-Schnittstellen zu brechen. |
| **E7 Mandate-Gate** | `mandate_status='approved'` **hart konsumieren** → Phase 2 „Target-Screening" erst dann aktivierbar | Das Flag existiert auditiert (PROJ-94). Konkreter, sofort baubarer 95-Scope. |
| **E7 Stage-Gate (generisch)** | **Non-blocking Hook** — ein prüfbarer Gate-Check-Erweiterungspunkt im Phasenübergang, der heute (außer dem Mandate-Fall) immer „erlaubt" zurückgibt | Harte Stage-Gate-Pflicht bei *jedem* Übergang würde 95 am nicht-gebauten **PROJ-110** blockieren. 110 füllt den Hook später mit echter Quorum-/Gate-Logik (PROJ-31). |
| **Phasenrücksprung-Genehmigung** | **Nicht in 95 entscheiden** → an PROJ-110 deferiert | Offene Spec-Frage; gehört zur Gate-/Approval-Logik (PROJ-31/110), nicht ins Phasen-Preset. |
| **Visualisierung** | **REUSE** `gantt-view` + `phases-timeline` statt Neubau | AC-95-3 „Gantt-ähnliche Roadmap" existiert bereits; 95 ergänzt nur eine Stage-Gate-Statusspalte/Badge. |
| **Need-to-Know** | `phases.confidentiality_level` (PROJ-100a) unverändert nutzen | Phasen sind bereits need-to-know-fähig; kein Eingriff. |

### 4. Öffentliche API (Routen — konzeptionell)

- **NEU** `POST /api/projects/[id]/phase-model/activate` — seedet das M&A-Phasen-Preset (idempotent) in `phases`.
- **NEU** Mandate-Gate-Prüfung im Pfad der Phase-2-Aktivierung (entweder im Aktivierungs-/Transition-Aufruf serverseitig) — verweigert Phase-2-Start, solange `mandate_status≠approved`, mit klarer Fehlermeldung.
- **REUSE** alle bestehenden `…/phases`-Routen (create/edit/transition/reorder), `…/milestones`, `…/risks`-Cross-Link.

### 5. Was sich außerhalb von PROJ-95 ändert

- `src/lib/project-types/` — neue Preset-Konstante (neben `MA_PROFILE`).
- Method-Nav: ein M&A-Cockpit-Eintrag über das bestehende `requiresProjectType`/`filterSectionsByProjectType`-Muster (PROJ-94) — **keine** neue Nav-Mechanik.
- **Vorbedingung PROJ-139** (Core): `phases.status`-Wert `suspended` + State-Machine-Regel. PROJ-95 baut darauf auf; ohne PROJ-139 bleibt AC-95-2-„ausgesetzt" offen.

### 6. Tests

- Unit: Preset-Konstante (10 Phasen, Reihenfolge, deal_side-Sichtbarkeit), Mandate-Gate-Logik (approved→Phase-2 erlaubt, sonst gesperrt).
- Integration/Live-RPC-Smoke (Pflicht, siehe Projekt-Konvention): `phase-model/activate` idempotent gegen Prod; Phase-2-Aktivierung vor/nach `mandate_status='approved'`.
- E2E: M&A-Projekt anlegen → Phasenmodell aktivieren → Cockpit-Roadmap rendert 10 Phasen → Phase-2-Gate sichtbar gesperrt/frei.
- Regression: bestehende PROJ-19-Phasen-Specs + PROJ-26-Method-Gating unverändert grün.

### 7. Out of Scope (explizit deferiert — benannt)

- **PROJ-139** (Core-Vor-Slice): `phases.status='suspended'` + State-Machine — Vorbedingung für AC-95-2-„ausgesetzt".
- **PROJ-96** (Fork 5): editierbare Phasen-Template-Bibliothek, deal_side-Preset-Matrix, zentrale vs. projekt-lokale Template-Pflege (offene Spec-Frage „Template-Ownership").
- **PROJ-110** (F1): generischer Stage-Gate-Zwang bei jedem Übergang + genehmigungspflichtiger Phasenrücksprung (PROJ-31-Quorum).
- **PROJ-104**: Deliverable↔Phase-Verknüpfung (AC-95-5-Teil) — Tabelle existiert noch nicht.
- Alternative Phasenmodelle (Carve-out/Distressed/JV als eigene Modelle): im MVP nur minimale `deal_side`-Variation; volle Modell-Varianten → PROJ-96.

### 8. Dependencies (Pakete)

**Keine neuen npm-Pakete.** Reuse von PROJ-19-Phasen-Stack, PROJ-6-Catalog, PROJ-94-Mandate, PROJ-100a-Confidentiality, PROJ-20-Risks.

### 9. Risiko + Trade-off

| Risiko | Sev | Mitigation |
|---|---|---|
| Scope-Bleed 95↔96 (deal_side-Preset-Bibliothek vorweggenommen) | MITTEL | 95 liefert **einen** Default-Satz als Code-Konstante; Bibliothek strikt PROJ-96. |
| Harte Kopplung an nicht-gebautes PROJ-110 blockiert Auslieferung | MITTEL | Stage-Gate als non-blocking Hook; nur Mandate-Gate hart. |
| Abhängigkeit von PROJ-139 verzögert AC-95-2 | NIEDRIG | 139 ist eine kleine Core-Slice; 95 ist ansonsten unabhängig baubar (vier Status-Werte reichen bis dahin). |
| Copy-on-Create dupliziert Phasen bei Doppelklick | NIEDRIG | seed-RPC idempotent (pro project_id nur einmal). |

### Locked design decisions (für /frontend + /backend)

1. **Keine neue Phasentabelle** — M&A-Phasen sind `phases`-Zeilen; Preset ist Code-Konstante (PROJ-96 ersetzt sie später).
2. **Mandate-Gate hart**, genereller Stage-Gate als non-blocking Hook (PROJ-110).
3. **Visualisierung reuse** (gantt-view/phases-timeline) + Stage-Gate-Badge.
4. **„Ausgesetzt" via PROJ-139** (Core), nicht M&A-lokal.
5. **Deliverable-Link an PROJ-104**, Risiken-Link via PROJ-20, Notizen via Bestandsfelder.
6. Phasenrücksprung-Genehmigung **an PROJ-110 deferiert** (nicht in 95 entscheiden).
