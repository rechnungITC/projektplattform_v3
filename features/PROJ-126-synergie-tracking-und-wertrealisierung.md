---
id: PROJ-126
title: "Synergie-Tracking und Wertrealisierung"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["I1", "G3", "K3", "L3"]   # C1, M1 gestrichen (unbelegt) — PROJ-169
roles: ["CFO / Finance Lead", "Integration Lead / IMO", "Workstream Leads", "Executive Sponsor", "Deal Lead"]
summary_for_jira: "[K2] Synergie-Tracking und Wertrealisierung"
---

# PROJ-126: Synergie-Tracking und Wertrealisierung

## Status: Planned (wartet auf PROJ-127-α — Zyklus aufgelöst)

> **Zyklus aufgelöst am 2026-09-02 (PROJ-169).** Die Abhängigkeit `K3` (PROJ-127) **bleibt** — sie
> ist die **einzige belegte** Kante des ganzen Zyklus (AC-2: „Initiativen sind mit … PMI-Workstreams
> (K3) verknüpfbar"). Aufgelöst hat sich die **Gegenrichtung**: PROJ-127 brauchte diese Story nur
> additiv und baut ohne sie. Damit ist die Reihenfolge **127-α → 126** und keine Sackgasse mehr.
> `C1` und `M1` sind gestrichen: 0 AC-Bezüge.
>
> **Und die Vorbereitung bleibt der Trumpf dieser Story.** Der
> Bestand wartet an **vier** Stellen ausdrücklich auf sie — Erweiterungs-Kontrakt in PROJ-120, zwei
> Sichtbarkeits-Zweige, eine `n/a`-Kachel im Steering-Report, plus eine geseedete Gremien-Vorlage
> „Synergy Review". Gebaut ist davon nichts. Siehe Erdungsabschnitt.
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

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: nicht startbar (Zyklus) — aber die am besten vorbereitete Story der Tranche
> **Überholt seit dem 2026-09-02 (PROJ-169).** Das Urteil unten ist die Bestandsaufnahme der Erdung und bleibt lesbar; der Zyklus **ist aufgelöst** — die Gegenrichtung ist weggefallen (PROJ-127 brauchte diese Story nur additiv), sie startet nach **PROJ-127-α**. Siehe den Kopf dieser Spec.


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

Fünf der sechs sind ausgeliefert (`I1`, `G3`, `C1`, `L3`, `M1`). Offen ist allein `K3` (PROJ-127) —
das aber seinerseits `K1` **und** `K2` braucht, also diese Story. Der Zyklus ist in PROJ-125s
Erdungsabschnitt vollständig aufgeschrieben.

### Vier vorbereitete Andockpunkte, gemessen statt vermutet

Ungewöhnlich für eine Story, an der noch nichts gebaut ist: der Bestand **wartet** an vier Stellen
ausdrücklich auf sie.

1. **Ein Erweiterungs-Kontrakt in PROJ-120** (`…proj120_valuation_business_case.sql:19-24`): „*** ERWEITERUNGS-KONTRAKT
   für PROJ-126 (K2, Synergien) *** — Wer `synergy_hypothesis` ergänzt, MUSS zusätzlich (a) den CHECK
   `ma_valuation_links_kind_check` erweitern, … (c) einen after-delete Cleanup-Trigger auf der
   Synergie-Tabelle anlegen". Der CHECK trägt heute **genau einen** Wert (`'dd_finding'`) — bewusst,
   „kein toter Wert".
2. **Zwei Sichtbarkeits-Zweige**, die auf die Ergänzung warten (`…proj120…:158` und
   `…proj120_link_visibility_membership_guard.sql:41`, je „PROJ-126-Kontrakt: `synergy_hypothesis`-Zweig
   hier ergänzen").
3. **Eine Kachel im Steering-Report**, die bewusst `n/a` zeigt (`…proj120_steering_report_valuation.sql:24`:
   „Die Synergie-Kachel bleibt bewusst `n/a` (K2/PROJ-126 existiert nicht)").
4. **Eine geseedete Gremien-Vorlage** aus PROJ-117: `('synergy_review','Synergy Review','Synergie-Tracking
   & Wertrealisierung','monthly', …)` — das Gremium für diese Story existiert, sein Gegenstand nicht.

Dazu nennt das M&A-Phasen-Preset aus PROJ-95 in Phase 10 ausdrücklich „Day-1- und 100-Tage-Plan,
Synergien" — die **Phase** existiert, die Objekte darin nicht.

**Gebaut ist davon nichts:** `ma_synerg*` 0 Treffer in den Migrationen, `pmi_*` 0, alle sechs
`synerg`-Treffer sind Kommentare, Presets oder Vorlagen.

**Und die Zahl, die alles einordnet — live gegen Prod gemessen am 2026-09-02:** das M&A-Epic hat
**null Nutzung**. 0 Projekte mit `project_type = 'ma'` (auch keine weich gelöschten), 0 Profile,
0 Bewertungen, 0 SPA-Issues, 0 DD-Findings, 0 DD-Fragen, 0 Stage-Gates, 0 Phasen — bei 39
ausgelieferten M&A-Slices. Das macht keine dieser Stories falsch; es heißt, dass **heute niemand**
auf sie wartet, und dass die Reihenfolge frei wählbar ist statt von einem laufenden Deal erzwungen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
