---
id: PROJ-125
title: "Day-1-Plan und 100-Tage-Plan steuern"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["A2", "C1", "G3", "K2", "K3", "F1", "L3"]
roles: ["Integration Lead / IMO", "Deal Lead", "Workstream Leads (HR, IT, Finance, Operations, Sales)", "Executive Sponsor"]
summary_for_jira: "[K1] Day-1-Plan und 100-Tage-Plan steuern"
---

# PROJ-125: Day-1-Plan und 100-Tage-Plan steuern

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic K — Post-Merger-Integration)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-9/19 (Sub-Projekt-Plan). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** K — Post-Merger-Integration  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-k` · `should-have`  
> **Abhängigkeiten:** `A2`, `C1`, `G3`, `K2`, `K3`, `F1`, `L3`

**User Story:**

Als Integration Lead / IMO möchte ich den Day-1-Plan und den 100-Tage-Plan strukturiert anlegen, mit Workstreams (K2) und Synergien (K3) verknüpfen und in einer Readiness-Sicht verfolgen, damit Day 1 stabil läuft und die ersten 100 Tage planvoll umgesetzt werden.

**Beschreibung / Kontext:**

Phase 9 und Phase 10 verlangen explizit einen Day-1-Readiness-Plan und einen 100-Tage-Plan. Die Plattform muss die im Modell genannten Integrationsansätze (Stand-alone, symbiotisch, Absorption, Transformation) unterstützen und die Steuerung der frühen Phase nach Closing ermöglichen.

**Akzeptanzkriterien:**

- [ ] Pro Deal kann der Integrationsansatz (Stand-alone, symbiotisch, Absorption, Transformation) gesetzt werden und beeinflusst die Standardvorlagen für Day-1 und 100-Tage-Plan.
- [ ] Day-1-Plan und 100-Tage-Plan werden als strukturierte Aufgabenlisten (siehe C1) je Workstream geführt.
- [ ] Eine 'Day-1-Readiness'-Sicht zeigt den Erfüllungsgrad je Pflicht-Day-1-Aufgabe und blockiert Gate 8 (Integration Readiness) bei nicht erfüllten Pflichtaufgaben (Hinweis, nicht hartes Veto – offene Frage).
- [ ] Verlinkung zu DD-Findings (G3), die Day-1-Risiken sind, ist möglich (z. B. ein IT-Carve-out-Thema).
- [ ] Audit-Trail (L3) erfasst Statusänderungen.

**Abgrenzungen (Out of Scope):**

- Keine spezifische HR-Tool-Integration (Onboarding der Zielmitarbeiter) in dieser Story.
- Kein Linien-Übergang in der Erst-Story (siehe K3).

**Offene Fragen:**

- Soll die Plattform bei nicht erfüllten Day-1-Pflichtaufgaben hart blockieren?
- Wie wird die Aufgabenliste bei Multi-Country-Deals (mehrere Day-1-Regionen) strukturiert?

**Definition of Ready:**

- [ ] Standardvorlagen pro Integrationsansatz sind abgestimmt.
- [ ] Pflichtaufgaben für Day-1 sind definiert.

**Definition of Done:**

- [ ] Day-1-Plan und 100-Tage-Plan funktionieren in der Aufgabenlogik.
- [ ] Readiness-Sicht zeigt korrekte Live-Daten.
- [ ] Vorlagen sind hinterlegt und versionierbar.

**Abhängigkeiten:**

- A2
- C1
- G3
- K2
- K3
- F1
- L3

**Betroffene Rollen:**

- Integration Lead / IMO
- Deal Lead
- Workstream Leads (HR, IT, Finance, Operations, Sales)
- Executive Sponsor

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
