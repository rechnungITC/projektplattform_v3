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

## Status: Planned
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
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
