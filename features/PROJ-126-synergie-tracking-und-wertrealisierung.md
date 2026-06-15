---
id: PROJ-126
title: "Synergie-Tracking und Wertrealisierung"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["I1", "G3", "K3", "C1", "L3", "M1"]
roles: ["CFO / Finance Lead", "Integration Lead / IMO", "Workstream Leads", "Executive Sponsor", "Deal Lead"]
summary_for_jira: "[K2] Synergie-Tracking und Wertrealisierung"
---

# PROJ-126: Synergie-Tracking und Wertrealisierung

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic K — Post-Merger-Integration)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (an PROJ-22 Budget). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** K — Post-Merger-Integration  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-k` · `should-have`  
> **Abhängigkeiten:** `I1`, `G3`, `K3`, `C1`, `L3`, `M1`

**User Story:**

Als CFO/Finance Lead möchte ich Synergie-Hypothesen aus dem Business Case (I1) bis zu realisierten Wertbeiträgen nachverfolgen und je Initiative messen können, damit die im Deal-Rationale versprochenen Werte tatsächlich realisiert oder Abweichungen frühzeitig sichtbar werden.

**Beschreibung / Kontext:**

Das Modell betont: Ein Deal ist erst erfolgreich, wenn die Werte nach Closing realisiert sind. Synergiekontrolle ist Pflichtaufgabe. Die Plattform muss Initiative, geplanten Wertbeitrag, realisierten Wert und Status je Initiative steuern und einen Soll-Ist-Vergleich liefern.

**Akzeptanzkriterien:**

- [ ] Synergie-Initiativen können erfasst werden mit Titel, Synergie-Hypothese, Workstream, Verantwortlicher, Plan-Wertbeitrag (EUR, Jahr), Plan-Ramp-up, Status, Realisierter Wert (regelmäßig fortgeschrieben), Risiken/Annahmen.
- [ ] Initiativen sind mit dem Business Case (I1), Findings (G3) und PMI-Workstreams (K3) verknüpfbar.
- [ ] Eine 'Synergy-Review-Sicht' zeigt monatlich Plan, Ist, Abweichung je Initiative und in Summe; entspricht dem Synergy Review aus dem Kommunikationsmodell.
- [ ] Eskalation auf Sponsor und Steering erfolgt bei Abweichung über definierten Schwellenwert.
- [ ] Audit-Trail (L3) erfasst Wertänderungen.

**Abgrenzungen (Out of Scope):**

- Keine Buchhaltungsintegration; realisierte Werte werden manuell oder per Datenimport gepflegt.
- Keine Konzern-Controlling-Konsolidierung.

**Offene Fragen:**

- Welcher Schwellenwert löst eine Eskalation aus (z. B. >15 % Abweichung)?
- Soll eine Schnittstelle zum Konzern-Controlling (SAP/Anaplan o. ä.) realisiert werden?

**Definition of Ready:**

- [ ] Datenmodell für Synergie-Initiativen ist mit Finance abgestimmt.
- [ ] Review-Frequenz und Eskalationsregeln sind dokumentiert.

**Definition of Done:**

- [ ] Initiativen können angelegt, verknüpft und fortgeschrieben werden.
- [ ] Synergy-Review-Sicht liefert korrekte Werte.
- [ ] Eskalation ist getestet.

**Abhängigkeiten:**

- I1
- G3
- K3
- C1
- L3
- M1

**Betroffene Rollen:**

- CFO / Finance Lead
- Integration Lead / IMO
- Workstream Leads
- Executive Sponsor
- Deal Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
