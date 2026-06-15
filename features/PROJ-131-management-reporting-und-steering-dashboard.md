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

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic M — Reporting & Dashboards)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-64 Dashboard + PROJ-21 (merge mit PROJ-132). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** M — Reporting & Dashboards  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-m` · `should-have`  
> **Abhängigkeiten:** `A2`, `E2`, `G3`, `I1`, `I2`, `K2`, `F1`, `L2`

**User Story:**

Als Executive Sponsor möchte ich pro Deal und über alle Deals hinweg ein Steering-Dashboard mit den wichtigsten Kennzahlen (Phase, Stage-Gate-Status, Top-Findings/Red Flags, Kaufpreisbandbreite, Synergiestand) sehen können, damit ich Entscheidungs- und Eskalationsbedarf schnell erkenne.

**Beschreibung / Kontext:**

Das Modell verlangt eine Steuerung auf Geschäftsführungs- und Steering-Committee-Ebene. Die Plattform muss aus den operativen Daten ein verdichtetes Management-Reporting erzeugen, das ohne manuelle Aufbereitung tagesaktuell ist.

**Akzeptanzkriterien:**

- [ ] Pro Deal zeigt das Dashboard mindestens: aktuelle Phase und Status, nächstes Stage-Gate, Top-5 Red Flags (G3/E2), aktuelle Kaufpreisbandbreite (I1/I2), Synergie-Stand (K2), kritische offene Aufgaben.
- [ ] Eine Portfolio-Sicht aggregiert mehrere parallele Deals mit Filter nach Status, Land/Region, Investitionsvolumen.
- [ ] Berichte können als PDF/Word exportiert oder als Zeitpunkt-Snapshot eingefroren werden (z. B. für ein Steering-Pre-Read).
- [ ] Sichtbarkeit folgt der Klassifikation (L2) – Sponsor sieht alles, andere Rollen nur das ihnen Zugängliche.
- [ ] Eine Drill-down-Funktion vom Dashboard zum jeweiligen Detailobjekt ist möglich.

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
_Quelle: Backlog-Entwurf M&A-Projektplattform · M — Reporting & Dashboards_
