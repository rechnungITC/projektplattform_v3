---
id: PROJ-127
title: "PMI-Workstreams und IMO-Steuerung"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["C1", "E1", "K1", "K2", "M1", "L3"]
roles: ["Integration Lead / IMO", "Workstream Leads PMI", "HR Lead", "IT Lead", "CFO / Finance Lead", "Executive Sponsor"]
summary_for_jira: "[K3] PMI-Workstreams und IMO-Steuerung"
---

# PROJ-127: PMI-Workstreams und IMO-Steuerung

## Status: Planned (nicht startbar — Knoten des Zyklus)

> **Geerdet 2026-09-02 (PROJ-167): der Knoten.** Vier der sechs Abhängigkeiten sind ausgeliefert;
> blockierend sind `K1` und `K2`, die beide auf diese Story warten. Genau deshalb ist die Auflösung
> hier am aussichtsreichsten. Erste Frage für `/architecture`: reicht das ausgelieferte
> `workstreams` (PROJ-102) statt einer zweiten Struktur? Siehe Erdungsabschnitt.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic K — Post-Merger-Integration)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **REUSE** · Andockpunkt: = PROJ-102 Workstreams im PMI-Kontext (merge). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** K — Post-Merger-Integration  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-k` · `should-have`  
> **Abhängigkeiten:** `C1`, `E1`, `K1`, `K2`, `M1`, `L3`

**User Story:**

Als Integration Lead / IMO möchte ich PMI-Workstreams (HR, IT, Finance, Operations, Sales, Communications, Risk & Compliance) mit eigenen Verantwortlichen, Aufgaben und Reporting-Punkten steuern, damit das IMO eine vollständige Sicht auf den Integrationsfortschritt hat.

**Beschreibung / Kontext:**

Phase 10 fordert ein eigenständiges Integration Management Office mit dedizierten Workstreams. Diese unterscheiden sich teilweise von den DD-Streams: Sie sind operativer, langfristiger und mit Linienverantwortung verzahnt.

**Akzeptanzkriterien:**

- [ ] PMI-Workstreams sind als eigener Typ neben DD-Streams (G1) konfiguriert; eine Standardvorlage aus dem Modell ist hinterlegt.
- [ ] Pro PMI-Workstream können Stream-Lead, Aufgabenliste (C1), Synergie-Initiativen (K2), Risiken (E1), Statusbericht erfasst werden.
- [ ] Eine IMO-Sicht aggregiert alle PMI-Workstreams in einem Ampel-Status (grün/gelb/rot) basierend auf konfigurierbaren KPIs (z. B. Synergie-Erreichungsgrad, offene Pflichtaufgaben, Risikoindex).
- [ ] Ein Übergangs-Status 'in Linie übergeben' kann je Workstream gesetzt werden, was die Steuerung in die Linienorganisation überführt.
- [ ] Audit-Trail (L3) erfasst Statusänderungen und Übergänge.

**Abgrenzungen (Out of Scope):**

- Keine HR-Stammdaten- oder Vergütungslogik in der Plattform.
- Keine ERP-Migrationssteuerung; IT-Migration wird über Aufgaben (C1) abgebildet.

**Offene Fragen:**

- Welche Standard-KPIs sollen den Ampel-Status auslösen?
- Sollen PMI-Workstreams nach einem konfigurierbaren Reifegradmodell (z. B. CMMI-light) bewertet werden?

**Definition of Ready:**

- [ ] Workstream-Vorlage und Ampel-Logik sind abgestimmt.
- [ ] Übergabekriterien an die Linie sind dokumentiert.

**Definition of Done:**

- [ ] PMI-Workstreams können angelegt, gepflegt und übergeben werden.
- [ ] IMO-Sicht liefert korrekte Live-Daten.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- C1
- E1
- K1
- K2
- M1
- L3

**Betroffene Rollen:**

- Integration Lead / IMO
- Workstream Leads PMI
- HR Lead
- IT Lead
- CFO / Finance Lead
- Executive Sponsor

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: nicht startbar — der Knoten des Zyklus

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

Vier der sechs sind ausgeliefert (`C1`, `E1`, `M1`, `L3`). Offen sind `K1` (PROJ-125) und `K2`
(PROJ-126) — **und beide warten auf diese Story**. PROJ-127 ist damit der Knoten, an dem der Zyklus
in beide Richtungen hängt:

```
PROJ-125 → {126, 127}      PROJ-126 → {127}      PROJ-127 → {125, 126}
```

**Genau das macht die Auflösung hier am aussichtsreichsten:** wer Epic K starten will, muss zuerst
entscheiden, ob eine IMO-Steuerung mit Workstreams **ohne** fertigen 100-Tage-Plan und **ohne**
Synergie-Tracking sinnvoll ist. Fachlich spricht viel dafür — eine Steuerungsebene ist die Klammer,
die die anderen beiden trägt, nicht ihr Ergebnis. Aber das ist eine Fachentscheidung, und diese
Erdung trifft sie nicht.

### Ein Prior-Art-Hinweis, der die Story verkleinern könnte

`workstreams` (PROJ-102) ist ausgeliefert: Bezeichnung, Ziel, Lead, RAG-Ampel, Vertraulichkeit,
M:N-Verknüpfung zu Phasen, additive Verweise von Arbeitspaketen und Risiken, plus eine
`workstream_dashboard`-Auswertung als SECURITY INVOKER. PROJ-45-α hat für die Bau-Extension
gemessen, dass `workstreams` in Prod **0 Zeilen** trägt und sich deshalb ein Spiegeln statt
Generalisieren lohnte — für PMI-Workstreams ist die Lage anders: sie sind fachlich dasselbe wie
Deal-Workstreams, nur in einer späteren Phase. Ob PROJ-127 `workstreams` **wiederverwendet** statt
eine zweite Struktur anzulegen, ist die erste Frage für `/architecture` — und sie ist nach der
Hausregel „search for the primitive that already exists" zu stellen, bevor eine Tabelle entsteht.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
