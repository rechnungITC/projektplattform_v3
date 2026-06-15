---
id: PROJ-132
title: "Operatives Reporting für PMO, Deal Lead und Workstreams"
issue_type: Story
epic_code: M
epic_title: "Reporting & Dashboards"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-m", "should-have"]
dependencies: ["C1", "D1", "G2", "G3", "B4", "H1", "L2"]
roles: ["PMO-Lead", "Deal Lead", "Stream Leads", "Workstream Leads PMI", "Externe Berater"]
summary_for_jira: "[M2] Operatives Reporting für PMO, Deal Lead und Workstreams"
---

# PROJ-132: Operatives Reporting für PMO, Deal Lead und Workstreams

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic M — Reporting & Dashboards)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **VIEW** · Andockpunkt: PROJ-21 + PROJ-64 (merge mit PROJ-131). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** M — Reporting & Dashboards  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-m` · `should-have`  
> **Abhängigkeiten:** `C1`, `D1`, `G2`, `G3`, `B4`, `H1`, `L2`

**User Story:**

Als PMO-Lead möchte ich operativ verwertbare Listen und Statussichten (offene Aufgaben mit Fristüberschreitung, offene Findings, offene Q&A, fehlende Pflicht-Deliverables, fehlende Freigaben) je Deal und je Workstream haben, damit ich Steuerungseingriffe rechtzeitig anstoßen kann.

**Beschreibung / Kontext:**

Neben dem Management-Reporting (M1) braucht es einen operativen Reporting-Layer. Dieser ist die Grundlage der wöchentlichen Steuerung und der Vorbereitung der Regelgremien (H1).

**Akzeptanzkriterien:**

- [ ] Pro Deal sind mindestens vier operative Sichten konfigurierbar: 'Aufgaben mit Fristüberschreitung' (C1), 'Offene Findings nach Schwere' (G3), 'Q&A-Stand je Stream' (G2), 'Deliverables-Status' (D1).
- [ ] Sichten sind filterbar nach Workstream, Owner, Phase, Klassifikation (L2).
- [ ] Eine 'Wöchentliche-Steuerung-Sicht' bündelt die wichtigsten operativen Werte als Pre-Read für das Deal Core Team (H1).
- [ ] Berichte können als PDF/Excel exportiert werden.
- [ ] Sichten respektieren das Berechtigungskonzept (B4) – externe Berater sehen nur ihren Stream.

**Abgrenzungen (Out of Scope):**

- Kein Aufgaben-Management-Tool-Ersatz; Sichten bauen auf den vorhandenen Objekten auf.
- Keine Workflow-Automatisierung über das Reporting hinaus.

**Offene Fragen:**

- Sollen Sichten als E-Mail-Digest (z. B. wöchentlich) automatisch verteilt werden?
- Welche Sicht ist Pflicht-Pre-Read für welches Gremium?

**Definition of Ready:**

- [ ] Sichten und Filter sind mit PMO und Stream-Leads abgestimmt.
- [ ] Export-Anforderungen sind dokumentiert.

**Definition of Done:**

- [ ] Vier operative Sichten sind verfügbar, gefiltert und exportierbar.
- [ ] Berechtigungen sind getestet.
- [ ] Pre-Read-Sicht funktioniert für ein Pilot-Gremium.

**Abhängigkeiten:**

- C1
- D1
- G2
- G3
- B4
- H1
- L2

**Betroffene Rollen:**

- PMO-Lead
- Deal Lead
- Stream Leads
- Workstream Leads PMI
- Externe Berater

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · M — Reporting & Dashboards_
