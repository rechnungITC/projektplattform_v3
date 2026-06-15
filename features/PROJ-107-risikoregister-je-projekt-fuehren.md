---
id: PROJ-107
title: "Risikoregister je Projekt führen"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-e", "mvp"]
dependencies: ["A1", "A2", "C1", "L3"]
roles: ["Risiko-Owner (je Workstream)", "Deal Lead", "PMO-Lead", "Steering Committee (Eskalationsempfänger)"]
summary_for_jira: "[E1] Risikoregister je Projekt führen"
---

# PROJ-107: Risikoregister je Projekt führen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-20 Risks (Score/Heatmap teils neu). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-e` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `C1`, `L3`

**User Story:**

Als Risiko-Owner möchte ich Projekt-Risiken mit Beschreibung, Bewertung (Eintrittswahrscheinlichkeit × Schadenshöhe), Maßnahmen und Verantwortlichem erfassen, damit das Risikomanagement während des gesamten Deals stringent nachvollziehbar ist.

**Beschreibung / Kontext:**

Das Modell verlangt ein durchgängiges Risikoregister. Risiken entstehen in allen Phasen (strategisch, Bewertung, DD, Vertrag, Closing, PMI). Die Plattform muss ein zentrales Register mit standardisierter Bewertungslogik bereitstellen.

**Akzeptanzkriterien:**

- [ ] Risiko anlegbar mit Pflichtfeldern: Titel, Kategorie, Beschreibung, Eintrittswahrscheinlichkeit (1–5), Schadenshöhe (1–5), Status, Owner.
- [ ] Aus der Bewertung wird automatisch ein Risiko-Score und Heat-Map-Quadrant abgeleitet.
- [ ] Risiken sind Phase, Workstream und ggf. Deliverable zuordenbar.
- [ ] Maßnahmen pro Risiko sind als Aufgaben (C1) verknüpfbar.
- [ ] Eine Risiko-Heatmap und eine Top-Risiken-Liste sind im Reporting verfügbar.

**Abgrenzungen (Out of Scope):**

- Quantitative Schadensberechnung (EUR-Wert) ist optional, nicht erzwungen.
- Keine automatische Risiko-Identifikation durch KI.

**Offene Fragen:**

- Welche Risiko-Kategorien sollen verbindlich sein?
- Soll die Bewertungsskala (1–5 oder 1–10) plattformweit verbindlich sein?
- Müssen Risiken bei Stage-Gate-Übergängen explizit überprüft und kommentiert werden?

**Definition of Ready:**

- [ ] Bewertungsmethodik (Skala, Score-Formel) ist mit Risikomanagement abgestimmt.
- [ ] Risiko-Kategorien sind definiert.

**Definition of Done:**

- [ ] Risikoregister ist funktional, Heatmap dargestellt, Aufgaben verknüpfbar.

**Abhängigkeiten:**

- A1, A2 – Projekt, Phase
- C1 – Aufgaben (für Maßnahmen)
- L3 – Audit-Trail

**Betroffene Rollen:**

- Risiko-Owner (je Workstream)
- Deal Lead
- PMO-Lead
- Steering Committee (Eskalationsempfänger)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_
