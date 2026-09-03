---
id: PROJ-125
title: "Day-1-Plan und 100-Tage-Plan steuern"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["A2", "C1", "G3", "K3", "F1", "L3"]   # K2 gestrichen (unbelegt); A2, K3, F1 implizit belegt — PROJ-169
roles: ["Integration Lead / IMO", "Deal Lead", "Workstream Leads (HR, IT, Finance, Operations, Sales)", "Executive Sponsor"]
summary_for_jira: "[K1] Day-1-Plan und 100-Tage-Plan steuern"
---

# PROJ-125: Day-1-Plan und 100-Tage-Plan steuern

## Status: Planned (wartet auf PROJ-127-α — Zyklus aufgelöst)

> **Zyklus aufgelöst am 2026-09-02 (PROJ-169).** Diese Story war **gar nicht** Teil des echten
> Zyklus: `K2` (PROJ-126) hat **0** Bezüge in ihren Kriterien und ist gestrichen. Was bleibt, sind
> **drei implizit belegte** Abhängigkeiten, die eine reine Code-Zählung nicht findet, ein Lesen aber
> schon: `K3` (AC-2 sagt „je Workstream" ohne den Code), `F1` (AC-3 nennt „Gate 8 — Integration
> Readiness") und `A2` (die PMI-Phase entsteht aus dem 10-Phasen-Preset von PROJ-95). Alle drei
> bleiben in der Liste, jetzt mit Begründung.
>
> **Eine eigene Ungenauigkeit dabei korrigiert:** die erste Fassung dieser Auflösung strich `A2` als
> unbelegt und behielt `F1` als implizit — beide sind gleich implizit, die Ungleichbehandlung war ein
> Fehler und ist behoben.
>
> Reihenfolge damit: **127-α → 125** (parallel zu 126, die beiden brauchen sich nicht gegenseitig).
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

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: nicht startbar — Teil eines Abhängigkeitszyklus in Epic K
> **Überholt seit dem 2026-09-02 (PROJ-169).** Das Urteil unten ist die Bestandsaufnahme der Erdung und bleibt lesbar; der Zyklus **ist aufgelöst** — diese Story war gar nicht Teil des echten Zyklus (`K2` hatte 0 AC-Bezüge) und startet nach **PROJ-127-α**, **parallel** zu PROJ-126. Siehe den Kopf dieser Spec.


Abhängigkeiten aufgelöst (Epic-Codes über die Spec-Frontmatter):

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

Fünf der sieben sind ausgeliefert (`A2`, `C1`, `G3`, `F1`, `L3`). Offen sind `K2` (PROJ-126) und
`K3` (PROJ-127) — **und beide warten ihrerseits auf diese Story**:

```
PROJ-125 (K1)  braucht  K2, K3
PROJ-126 (K2)  braucht  K3
PROJ-127 (K3)  braucht  K1, K2
```

**Keine der drei ist zuerst baubar.** Das ist kein technisches Hindernis, sondern ein
Struktur-Defekt der Abhängigkeitsangaben: die drei PMI-Stories wurden gegenseitig verdrahtet, weil
sie fachlich zusammengehören — nicht, weil eine die andere voraussetzt. Solange der Zyklus steht,
ist Epic K **nicht startbar**, und genau das erklärt, warum die drei seit dem 2026-06-10 unverändert
liegen.

Die Auflösung gehört in `/requirements`: welche der drei kommt **ohne** die anderen aus? Diese
Erdung benennt den Zyklus und trifft die Entscheidung nicht.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
