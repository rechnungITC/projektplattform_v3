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

## Status: Planned (baubar)

> **Geerdet 2026-09-02 (PROJ-167): nicht blockiert.** Alle fünf Abhängigkeiten (`I1`, `G3`, `F2`,
> `J1`, `L3`) sind ausgeliefert. Das Versionsmuster existiert in `ma_valuations`; neu wären Kopf und
> Bestandteile-Kind-Tabelle plus zwei Quellenverweise, die `ma_valuation_links` heute nicht kennt.
> AC-4 („Indikativ → Final → Closing") hängt am offenen PROJ-123/124. Siehe Erdungsabschnitt.
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

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: baubar — alle fünf Abhängigkeiten sind ausgeliefert

Die Spec notiert ihre Abhängigkeiten als **Epic-Codes**, nicht als PROJ-IDs; aufgelöst über die
`summary_for_jira`-Kennungen der Spec-Frontmatter (belegt, nicht geraten):

| Epic-Code | PROJ | Stand |
|---|---|---|
| I1 | PROJ-120 Bewertungsmodell | `Deployed / mvp` |
| J1 | PROJ-122 SPA-Issues | `Deployed / mvp` |
| F1 | PROJ-110 Stage-Gates | `Deployed / mvp` |
| F2 | PROJ-111 Entscheidungslog | `Deployed / mvp` |
| G3 | PROJ-114 DD-Findings | `Deployed / mvp` |
| C1 | PROJ-101 Aufgaben | `Deployed / mvp` |
| E1 | PROJ-107 Risikoregister | `Deployed / mvp` |
| M1 | PROJ-131 Steering-Report | `Deployed / full` |
| L3 | PROJ-130 Audit-Trail | `Deployed / mvp` |
| A2 | PROJ-95 M&A-Phasenmodell | `Deployed / mvp` |
| J2 · J3 · K1 · K2 · K3 | PROJ-123 · 124 · 125 · 126 · 127 | **offen** |

Für PROJ-121 heißt das: `I1`, `G3`, `F2`, `J1`, `L3` sind **alle** `Deployed`. Die Story ist **nicht
blockiert** — anders als vier ihrer fünf Geschwister in dieser Tranche.

### Was schon existiert und was wirklich neu wäre

`ma_valuations` (PROJ-120) bringt das **Versionsmuster** mit, das AC-3 verlangt: `version_no`,
`supersedes_valuation_id`, `is_current`, `version_comment`, dazu `value_low`/`value_high`,
`currency`, `assumptions` und `confidentiality_level` (Default `confidential`). Eine Kaufpreis-Bridge
kann diesem Muster folgen statt es neu zu erfinden.

**Neu wäre die Struktur, nicht die Mechanik:** `ma_valuations` beschreibt eine *Bewertung* (eine
Bandbreite mit Methode), die Bridge beschreibt *Bestandteile* (EV, Net Debt, Working Capital,
Earn-out, Escrow, Verkäuferdarlehen, Garantien). Das ist ein Kopf mit Kind-Tabelle, nicht eine
Erweiterung der Bewertungszeile.

**Ein Andockpunkt fehlt heute:** `ma_valuation_links.linked_kind` trägt einen CHECK mit **genau
einem** Wert (`'dd_finding'`) — PROJ-120 hat das bewusst so gebaut und einen **Erweiterungs-Kontrakt**
im Migrationskopf hinterlassen. Für AC-2 („Quelle: Finding, DD-Stream, Vertragspunkt") braucht die
Bridge Verweise auf `spa_issues` (J1) und `decisions` (F2), die dort noch nicht vorgesehen sind. Der
Kontrakt beschreibt, was dabei mitzuziehen ist (CHECK, Sichtbarkeits-Zweig, Cleanup-Trigger) — er ist
für `synergy_hypothesis` geschrieben, gilt aber wörtlich für jeden neuen Wert.

### Ein Akzeptanzkriterium hängt an offenen Geschwistern

AC-4 verlangt eine konsolidierte Sicht **„Indikativ → Final → Closing"**. Der Closing-Stand entsteht
erst mit PROJ-123 (Closing Conditions) und PROJ-124 (Closing-Durchführung). Das Kriterium ist also in
α ohne den letzten Zustand erfüllbar, oder es wartet — eine Entscheidung, die diese Erdung
**nicht** trifft.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · I — Bewertung & Kaufpreislogik_
