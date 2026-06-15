---
id: PROJ-121
title: "Kaufpreis-Bridge und Kaufpreisbestandteile abbilden"
issue_type: Story
epic_code: I
epic_title: "Bewertung & Kaufpreislogik"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-i", "should-have"]
dependencies: ["I1", "G3", "F2", "J1", "L3"]
roles: ["CFO / Finance Lead", "Deal Lead", "Legal Counsel", "Tax Advisor", "Externe M&A-Berater"]
summary_for_jira: "[I2] Kaufpreis-Bridge und Kaufpreisbestandteile abbilden"
---

# PROJ-121: Kaufpreis-Bridge und Kaufpreisbestandteile abbilden

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic I — Bewertung & Kaufpreislogik)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (M&A-spezifisch). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** I — Bewertung & Kaufpreislogik  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-i` · `should-have`  
> **Abhängigkeiten:** `I1`, `G3`, `F2`, `J1`, `L3`

**User Story:**

Als CFO/Finance Lead möchte ich die Kaufpreis-Bridge (Enterprise Value → Equity Value, Net Debt, Working-Capital-Adjustment, Earn-out, Escrow, Verkäuferdarlehen) als strukturierte Sicht abbilden und mit DD-Findings (G3), Bewertung (I1) und Vertragspunkten (J1) verknüpfen, damit alle Kaufpreismechaniken nachvollziehbar sind.

**Beschreibung / Kontext:**

Phase 6 verlangt eine konsequente Übersetzung der Bewertung in eine Kaufpreislogik mit definierten Bestandteilen. Diese Bestandteile müssen sich aus der DD und der Verhandlung ableiten lassen. Die Plattform stellt die Sicht und die Verknüpfung sicher.

**Akzeptanzkriterien:**

- [ ] Eine 'Kaufpreis-Bridge'-Sicht pro Deal erfasst die Bestandteile aus dem Modell (EV, Net Debt, Working Capital, Cash-Free/Debt-Free, Earn-out, Escrow, Verkäuferdarlehen, Garantien/Freistellungen).
- [ ] Pro Bestandteil können Wert, Annahmen, Quelle (z. B. zugehöriges Finding, DD-Stream, Vertragspunkt) erfasst werden.
- [ ] Änderungen am Kaufpreis werden versioniert und an die zugehörige Entscheidung (F2) gekoppelt.
- [ ] Eine konsolidierte Sicht zeigt den aktuellen Stand 'Indikativ → Final → Closing' inkl. Differenzen.

**Abgrenzungen (Out of Scope):**

- Kein vollständiges Finanzmodell in der Plattform (siehe I1).
- Keine Steuersimulation; steuerliche Sicht bleibt in Tax-DD-Bericht.

**Offene Fragen:**

- Welche Kennzahl-Granularität ist Pflicht (z. B. Net Debt-Bestandteile einzeln)?
- Soll die Sicht auch die Finanzierungsstruktur (Eigen-/Fremdkapital, Akquisitionsfinanzierung) abbilden?

**Definition of Ready:**

- [ ] Datenmodell der Kaufpreis-Bridge ist mit Finance und Legal abgestimmt.
- [ ] Verknüpfungspunkte zu Findings (G3) und SPA-Punkten (J1) sind spezifiziert.

**Definition of Done:**

- [ ] Bridge ist erfassbar, versionierbar und exportierbar.
- [ ] Verknüpfungen funktionieren.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- I1
- G3
- F2
- J1
- L3

**Betroffene Rollen:**

- CFO / Finance Lead
- Deal Lead
- Legal Counsel
- Tax Advisor
- Externe M&A-Berater

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · I — Bewertung & Kaufpreislogik_
