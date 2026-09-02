---
id: PROJ-127
title: "PMI-Workstreams und IMO-Steuerung"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["C1", "E1", "L3"]   # K1 gestrichen (unbelegt), K2 nach beta, M1 unbelegt — PROJ-169
roles: ["Integration Lead / IMO", "Workstream Leads PMI", "HR Lead", "IT Lead", "CFO / Finance Lead", "Executive Sponsor"]
summary_for_jira: "[K3] PMI-Workstreams und IMO-Steuerung"
---

# PROJ-127: PMI-Workstreams und IMO-Steuerung

## Status: Planned (α baubar — Zyklus aufgelöst, diese Story ist der Startpunkt von Epic K)

> **Zyklus aufgelöst am 2026-09-02 (PROJ-169, Nutzer-Entscheid „PROJ-127 zuerst").** Die Auflösung
> ist **gemessen, nicht gesetzt**: von den **sieben** zyklusbildenden Kanten über die vier
> Epic-J/K-Stories trugen **vier in keinem Akzeptanzkriterium einen Bezug** — weder als Epic-Code
> noch inhaltlich —, eine fünfte nur einen **additiven**. Konkret hier: `K1` (PROJ-125) hat **0**
> Bezüge in den fünf Kriterien dieser Story und ist **gestrichen**; `K2` (PROJ-126) hat **zwei**
> inhaltliche Bezüge — einen als Code (optionales Feld in AC-2), einen implizit (Beispiel-KPI in
> AC-3) —, beide **additiv**, und wandert nach **β**. Damit ist **α ohne beide
> Geschwister baubar**, und beide Geschwister brauchen α — die Story ist die Klammer, nicht das
> Ergebnis. Siehe Abschnitt „Zyklus-Auflösung".
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
- [ ] **(α)** Pro PMI-Workstream können Stream-Lead, Aufgabenliste (C1), Risiken (E1) und
      Statusbericht erfasst werden. **(β)** Synergie-Initiativen (K2) — der einzige Bezug dieser
      Story auf PROJ-126, und ein **additives Feld**: die anderen vier Angaben sind ohne es
      vollständig. Deshalb wandert er nach β statt die Story zu blockieren.
- [ ] Eine IMO-Sicht aggregiert alle PMI-Workstreams in einem Ampel-Status (grün/gelb/rot)
      basierend auf konfigurierbaren KPIs. **(α)** offene Pflichtaufgaben und Risikoindex — beide
      aus ausgelieferten Quellen (`work_items`, `risks`). **(β)** Synergie-Erreichungsgrad; die
      Erstfassung nannte ihn als **eines von drei Beispielen** („z. B."), nicht als Pflicht-KPI.
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
- L3

**Gestrichen am 2026-09-02 (PROJ-169):** `K1` (0 AC-Bezüge — unbelegt), `M1` (0 AC-Bezüge).
**Nach β verschoben:** `K2` (2 AC-Bezüge, beide additiv).

**Betroffene Rollen:**

- Integration Lead / IMO
- Workstream Leads PMI
- HR Lead
- IT Lead
- CFO / Finance Lead
- Executive Sponsor

## Zyklus-Auflösung am 2026-09-02 (PROJ-169) — diese Story ist der Startpunkt von Epic K

**Nutzer-Entscheid: „PROJ-127 zuerst".** Die Umsetzung ist nicht ein Strich in einer
Abhängigkeitsliste, sondern eine Messung: **welche der Kanten ist überhaupt durch ein
Akzeptanzkriterium belegt?**

### Belegt gegen gelistet — die Zählung über alle vier Epic-J/K-Stories

| Kante | AC-Bezüge | Urteil |
|---|---|---|
| **127 → K1** (125) | **0** | **gestrichen** — nichts stützt sie |
| **127 → K2** (126) | 2, beide **additiv** | **nach β** — optionales Feld (AC-2) + Beispiel-KPI (AC-3) |
| **126 → K3** (127) | 1, explizit | **bleibt** — die *einzige* **explizit** belegte Kante |
| **125 → K2** (126) | **0** | **gestrichen** |
| **125 → K3** (127) | 0 explizit, **implizit** | bleibt — AC-2 sagt „je Workstream" ohne den Code |
| **124 → K1** (125) | **0** | **gestrichen** |
| **124 → K2** (126) | **0** | **gestrichen** |

**Von sieben zyklusbildenden Kanten trugen vier keinen Bezug, eine nur einen additiven.** Der Zyklus bestand also nicht aus
fachlichen Zwängen, sondern aus einer Abhängigkeitsliste, die „gehört fachlich zusammen" mit „setzt
voraus" verwechselt hat.

**Warnung zur Methode, weil sie sonst falsch nachgemacht wird — und sie hat sich an dieser
Auflösung selbst bewährt:** eine reine Zählung der Epic-Codes findet **nur explizite** Nennungen.
Sie hätte hier **fünf** unbelegte Kanten gemeldet statt vier und damit `125 → K3` fälschlich
gestrichen, denn AC-2 sagt „je Workstream" ohne den Code. Zwei weitere Abhängigkeiten derselben
Story sind ebenso implizit und wären mitgefallen: `125 → F1` („Gate 8 — Integration Readiness") und
`125 → A2` (die PMI-Phase aus dem PROJ-95-Preset). **Gezählt und gelesen** ist die Untergrenze;
gezählt allein hätte eine Zyklus-Kante und zwei externe Abhängigkeiten fälschlich gestrichen — und
für `125 → K3` wäre das Ergebnis eine Story, die Workstreams verplant, ohne von ihnen zu wissen.

### Die neue Reihenfolge

```
PROJ-127-α  (diese Story: Workstreams, Lead, Aufgaben, Risiken, Statusbericht, Ampel, „in Linie übergeben")
   ├── PROJ-126  (Synergie — braucht K3 für AC-2, die einzige belegte Kante)
   │      └── PROJ-127-β  (Synergie-Initiativen am Workstream + Synergie-KPI im Ampelstatus)
   └── PROJ-125  (Day-1/100-Tage — braucht Workstreams für „je Workstream")
```

**126 und 125 sind parallel** — sie brauchen sich nicht gegenseitig. Und **PROJ-124 ist ganz aus der
Kette heraus**: es wartet nur noch auf PROJ-123 (Closing Conditions), die baubare MVP-Pflicht.

### Die Architekturfrage, die α zuerst beantworten muss

`workstreams` (PROJ-102) ist am **2026-07-02** ausgeliefert worden — **nach** dieser Spec
(2026-06-10). Deshalb vergleicht AC-1 mit `dd_streams` und kennt den näheren Kandidaten nicht.
Gemessen an der Live-Definition:

| AC dieser Story verlangt | `workstreams` (PROJ-102) hat |
|---|---|
| Stream-Lead | `lead_user_id` |
| Aufgabenliste (C1) | `work_items.workstream_id` (additiver Verweis, PROJ-102) |
| Risiken (E1) | `risks.workstream_id` |
| Statusbericht | `workstream_dashboard` (SECURITY INVOKER) |
| Ampel grün/gelb/rot | `rag_status` mit `check (rag_status in ('green','amber','red'))` |
| Bezeichnung, Ziel, Scope, Vertraulichkeit, Sortierung | `label`, `goal`, `scope`, `confidentiality_level`, `sort_order` |

**Was fehlt:** ein **Typ**-Merkmal (PMI gegen Deal, AC-1), die Standardvorlage der sieben
PMI-Workstreams (AC-1), der Übergangsstatus „in Linie übergeben" (AC-4), und ein **gerechneter**
Ampelstatus — `rag_status` ist heute **manuell** gesetzt, während AC-3 konfigurierbare KPIs verlangt.
PROJ-45-δ hat für die Bau-Extension genau diese Unterscheidung gebaut („gerechnetes Signal **neben**
der manuellen Ampel, die Abweichung ist der Ertrag") — ein Vorbild, kein Zwang.

**Erweitern oder spiegeln, ist hier offen** und gehört in `/architecture`. Der Präzedenzfall PROJ-45-α
entschied sich für **spiegeln**, aber mit einer Begründung, die hier nicht greift: dort ging es um
einen Mandanten-**Katalog** (Gewerke) plus Projektzuordnung, und `workstreams.label` als
`NOT NULL`-Anzeigequelle hätte eine nullbare Zweitform gebraucht. PMI-Workstreams sind dagegen
fachlich **dasselbe** wie Deal-Workstreams, nur in einer späteren Phase — ein additives
`stream_type` wäre die kleinere Änderung. Zu messen ist vor der Entscheidung, was die fünf
INVOKER-Auswertungen von `workstreams` bei einem zweiten Typ anzeigen würden.

## Geerdet am 2026-09-02 (PROJ-167)

### Urteil: nicht startbar — der Knoten des Zyklus
> **Überholt seit dem 2026-09-02 (PROJ-169).** Das Urteil unten ist die Bestandsaufnahme der Erdung und bleibt lesbar; der Zyklus **ist aufgelöst** — diese Story ist der **Startpunkt** von Epic K: `K1` hatte 0 AC-Bezüge, `K2` nur additive. Siehe den Kopf dieser Spec.


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
