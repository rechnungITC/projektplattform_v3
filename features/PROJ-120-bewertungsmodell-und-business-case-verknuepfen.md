---
id: PROJ-120
title: "Bewertungsmodell und Business Case verknüpfen"
issue_type: Story
epic_code: I
epic_title: "Bewertung & Kaufpreislogik"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-i", "mvp"]
dependencies: ["G3", "K2", "L2", "L3"]
roles: ["CFO / Finance Lead", "Deal Lead", "Executive Sponsor", "Externe M&A-Berater", "PMO-Lead (lesend)"]
summary_for_jira: "[I1] Bewertungsmodell und Business Case verknüpfen"
---

# PROJ-120: Bewertungsmodell und Business Case verknüpfen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic I — Bewertung & Kaufpreislogik)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (an PROJ-22 Budget). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** I — Bewertung & Kaufpreislogik  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-i` · `mvp`  
> **Abhängigkeiten:** `G3`, `K2`, `L2`, `L3`

**User Story:**

Als CFO/Finance Lead möchte ich Bewertungsmodelle und Business Cases als Artefakte am Deal verknüpfen, versionieren und mit Findings (G3) sowie Synergien (K2) in Beziehung setzen, damit die Bewertung in jeder Phase nachvollziehbar ist und Änderungen dokumentiert sind.

**Beschreibung / Kontext:**

Phase 4 und Phase 6 des Modells fordern eine indikative bzw. finale Bewertung. Die Plattform stellt selbst kein Bewertungsmodell bereit – Bewertung erfolgt in spezialisierten Tools (Excel, dedizierte Bewertungssoftware). Die Plattform muss jedoch die Bewertungsversionen und die zugehörige Entscheidungslogik nachvollziehbar machen.

**Akzeptanzkriterien:**

- [ ] Pro Deal können Bewertungs-Artefakte (Excel/PDF/Link) versioniert hinterlegt werden, je mit Stand-Datum, Methode (Multiple, DCF, Vergleichstransaktionen, Substanzwert), Ergebnis (Kaufpreisbandbreite), Annahmen und Verfasser.
- [ ] Versionswechsel sind explizit dokumentiert (z. B. 'V2 – nach Integration der Financial-DD-Findings').
- [ ] Bewertungsversionen können mit Findings (G3) und Synergie-Hypothesen (K2) verknüpft werden.
- [ ] Eine 'Aktuelle Bewertungssicht' zeigt die jeweils gültige Version und die Kaufpreisbandbreite.

**Abgrenzungen (Out of Scope):**

- Die Plattform berechnet keine Unternehmensbewertung selbst.
- Keine Sensitivitätsanalyse innerhalb der Plattform.
- Speicherung erfolgt als Verweis und/oder Anhang – keine Excel-Live-Rechnung in der Plattform.

**Offene Fragen:**

- Sollen Bewertungs-Excel-Dateien (mit hochsensiblen Daten) in der Plattform gespeichert oder nur verlinkt werden?
- Müssen Bewertungen vor jedem Stage-Gate aktualisiert werden (Pflicht)?

**Definition of Ready:**

- [ ] Datenmodell für Bewertungsartefakte und Version ist abgestimmt.
- [ ] Sichtbarkeit (Inner Circle) ist mit Finance und Legal abgestimmt.

**Definition of Done:**

- [ ] Anlage, Versionierung, Verknüpfung und Aktuelle-Bewertungssicht funktionieren.
- [ ] Audit-Trail erfasst Versionswechsel.
- [ ] Berechtigungen sind getestet.

**Abhängigkeiten:**

- G3
- K2
- L2
- L3

**Betroffene Rollen:**

- CFO / Finance Lead
- Deal Lead
- Executive Sponsor
- Externe M&A-Berater
- PMO-Lead (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · I — Bewertung & Kaufpreislogik_
