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

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)
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
