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

## Status: Architected (α — Tech Design 2026-09-03, beide Gabelungen entschieden)
## Deployment Scope: —

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

---

## Tech Design (Solution Architect) — α, 2026-09-03

**Auftrag:** `/architecture` für PROJ-127-α, nachdem PROJ-169 den Epic-K-Zyklus aufgelöst und diese
Story zum Startpunkt gemacht hat. Die Kernfrage der Auflösung — `workstreams` (PROJ-102) erweitern
oder spiegeln — ist hier entschieden.

### Was live schon da ist (gegen Prod gemessen, 2026-09-03)

`workstreams` ist erheblich besser ausgestattet, als die Spec vom 2026-06-10 wissen konnte — PROJ-102
wurde erst am **2026-07-02** ausgeliefert, weshalb AC-1 mit DD-Streams vergleicht und den näheren
Kandidaten nicht kennt:

| Vorhanden | Wert für diese Story |
|---|---|
| Bezeichnung, Ziel, Umfang, Notizen, Sortierung | AC-2 Grundangaben |
| **Stream-Lead** (`lead_user_id`) | AC-2 „Stream-Lead" **vollständig** |
| Verweise von Arbeitspaketen, Risiken und Deliverables | AC-2 „Aufgabenliste (C1), Risiken (E1)" **vollständig** |
| Auswertung je Workstream: Aufgaben gesamt/fertig, offene Risiken, Deliverables gesamt/überfällig | AC-3 Zahlengrundlage **vollständig** |
| Ampel (grün/gelb/rot) | AC-3 Anzeige, aber **manuell** gesetzt |
| Vertraulichkeitsstufe + **drei** einschränkende Zugriffsregeln | Need-to-know erbt sich |
| Feld-Audit über 9 Spalten **und** Lebenszyklus-Audit | AC-5 **vollständig** |
| Mehrfach-Bezug zu Phasen | Phase 10 heißt im Preset bereits „Post-Merger-Integration" |
| Vorlagen-Herkunft + Vorlagen-Maschinerie aus PROJ-96 | AC-1 „Standardvorlage" hat einen Weg |

**Vier Lücken bleiben:** ein Typ-Merkmal (AC-1), die PMI-Vorlage mit ihren sieben Workstreams (AC-1),
ein **Lebenszyklus-Status** für „in Linie übergeben" (AC-4 — die Tabelle hat *nur* die Ampel, keinen
Status) und ein **gerechneter** Ampelwert (AC-3).

### Entscheidung 1 — Erweitern statt spiegeln (Nutzer-Entscheid nach CIA-Checkpoint)

Der Blast-Radius wurde vor der Entscheidung gemessen, und er liegt **anders als erwartet**: von zwölf
Datenbank-Funktionen, die Workstreams berühren, liest nur **eine** die Tabelle als Primärquelle (die
Auswertung je Workstream). Die vier großen Berichte joinen sie bloß als **Beschriftungsquelle** — sie
kommen über den Workstream-Verweis eines Arbeitspakets oder Risikos an die Zeile. Eine Typ-Spalte
verändert sie deshalb **überhaupt nicht**: zeigt ein Bericht das Arbeitspaket eines PMI-Workstreams,
ist genau dessen Bezeichnung die richtige Angabe. In der Anwendung berühren 80 Dateien den Begriff,
aber nur **sechs Stellen in drei Dateien** greifen die Tabelle direkt.

**Das tragende Argument von PROJ-45-α greift hier nicht.** Dort wurde gespiegelt, weil die
Bezeichnung eine Pflichtangabe und gleichzeitig Anzeigequelle von fünf Auswertungen war, während die
neue Struktur eine *nullbare* Bezeichnung gebraucht hätte. PMI-Workstreams heißen immer HR, IT oder
Finance — der Vertrag bleibt unversehrt. Und der Umzug ist ohnehin folgenlos: **null Zeilen** in
Workstreams, DD-Streams und Vorlagen, **null** lebende M&A-Projekte.

Was PMI durch das Erweitern **sofort** erbt, müsste eine gespiegelte Tabelle vollständig neu bauen:
drei einschränkende Vertraulichkeitsregeln, Feld- und Lebenszyklus-Audit samt Registereinträgen, den
Phasen-Bezug, die Auswertung und die Vorlagen-Maschinerie. Schwerer wiegt der Verweis: Arbeitspakete,
Risiken und Deliverables zeigen heute auf *einen* Workstream. Eine zweite Tabelle bräuchte einen
zweiten Verweis — oder PMI-Aufgaben erschienen in vier ausgelieferten Berichten **ohne**
Workstream-Beschriftung.

### Entscheidung 2 — Gerechnetes Signal *neben* der manuellen Ampel (Nutzer-Entscheid)

Nach dem Muster aus PROJ-45-δ: die Ampel bleibt gesetzt, das gerechnete Signal steht daneben, und
**die Abweichung zwischen beiden ist der Ertrag** — wo die Workstream-Leitung grün meldet und die
Zahlen rot sagen, lohnt das Gespräch. Die manuelle Ampel zu ersetzen war ausgeschlossen: sie wird auf
der ausgelieferten Deal-Fläche als Inline-Auswahl geschrieben, ein Nur-Lesen-Feld hätte dort eine
Funktion entfernt.

Die Zahlen kommen aus der **vorhandenen** Auswertung (überfällige Aufgaben, offene Risiken); neu ist
allein die Bewertung. Die Schwellen stehen als Konstante im Code, nicht als Mandanten-Einstellung —
damit ist die offene Frage der Spec („welche Standard-KPIs?") beantwortet: überfällige Pflichtaufgaben
und offene Risiken, beide aus ausgelieferten Quellen. Eine echte Konfigurierbarkeit wäre eine
Einstellungsfläche für einen Bedarf, den niemand geäußert hat.

### Vier Folgeentscheidungen des Architekten

**A) Der Übergabe-Status ist nur für PMI setzbar.** Der Lebenszyklus-Status gilt technisch für alle
Workstreams (Vorgabewert „aktiv"), aber „an die Linie übergeben" ist für einen Deal-Workstream
sinnlos — der endet mit dem Closing. Ohne diese Einschränkung wäre das Erweitern gekauft um den
Preis einer Auswahl, die auf der Deal-Fläche Unsinn anbietet. Die Prüfung gehört in die Datenbank,
nicht in die Oberfläche.

**B) Der Statusbericht ist ein Feld, seine Historie ist das Feld-Audit.** AC-2 nennt den
Statusbericht neben Lead, Aufgaben und Risiken — als Angabe, nicht als Verlauf. Ein einzelnes Feld
würde die Historie überschreiben, und PMI läuft über Monate; aber die Spalte kommt in die
Audit-Whitelist, und damit hält das Änderungsprotokoll jede Fassung samt Verfasser und Zeitpunkt.
Dasselbe Muster wie die Quintessenz in PROJ-80-α („Menschen bearbeiten ihn"). Eine eigene
Berichts-Tabelle wäre die schwerere Lösung für dieselbe Zusage.

**C) Die PMI-Vorlage wird eigens angewandt, nicht bei der Projektanlage.** Die Buy-Side-Vorlage läuft
beim Anlegen des Deal-Raums — stünden die sieben PMI-Workstreams dort mit drin, hätte ein Deal ab
Tag 1 eine Integrationsstruktur für ein Unternehmen, das er noch nicht gekauft hat. AC-1 verlangt,
dass eine Standardvorlage **hinterlegt** ist, nicht dass sie sofort greift.

**D) Die IMO-Sicht ist eine eigene Fläche; die Deal-Fläche filtert auf ihren Typ.** AC-3 verlangt
ausdrücklich eine Sicht, die *alle* PMI-Workstreams aggregiert — das ist ein eigener Ort. Die
ausgelieferte Workstream-Fläche umfasst 952 Zeilen über vier Dateien; sie bekommt einen Typ-Filter
und bleibt sonst unangetastet. So liegt der Neubau in neuen Dateien statt im Bestand.

### Aufbau der Oberfläche

```
Projektraum (nur M&A-Projekte)
+-- "Workstreams"  [ausgeliefert, PROJ-102]
|   +-- Liste — jetzt gefiltert auf Deal-Workstreams
|
+-- "IMO-Steuerung"  [NEU]
    +-- Kopfzeile: Ampel-Verteilung über alle PMI-Workstreams
    |   +-- gesetzt (grün/gelb/rot)  |  gerechnet (grün/gelb/rot)
    |   +-- Hinweis, wo beide auseinanderfallen
    +-- Werkzeugleiste: "Workstream anlegen" · "Standardvorlage anwenden"
    +-- Workstream-Karten (je Workstream)
    |   +-- Bezeichnung · Leitung · Vertraulichkeit
    |   +-- Ampel gesetzt (änderbar)  ·  Ampel gerechnet (nur Anzeige, mit Grund)
    |   +-- Zahlen: Aufgaben fertig/gesamt · überfällig · offene Risiken
    |   +-- Statusbericht (Auszug, mit Datum)
    |   +-- Zustand: aktiv / an die Linie übergeben (mit Datum)
    |   +-- Aktionen: Bearbeiten · Statusbericht · Übergeben · Entfernen
    +-- Leerzustand: erklärt die Vorlage statt einer leeren Liste
```

Die Karte zeigt beide Ampeln **immer nebeneinander** — eine, die nur bei Abweichung erscheint, würde
den Normalfall als Ausnahme darstellen.

### Datenmodell (Klartext)

**Erweitert wird die vorhandene Workstream-Struktur** um vier Angaben:

- **Art** — „Deal" oder „PMI", Vorgabe „Deal". Bestandszeilen bleiben damit unverändert Deal-
  Workstreams, ohne dass eine Zeile angefasst werden muss.
- **Zustand** — „aktiv" (Vorgabe) oder „an die Linie übergeben"; der zweite Wert nur für PMI.
- **Übergabe-Zeitpunkt** — wird beim Übergeben gesetzt, sonst leer.
- **Statusbericht** — Freitext; seine Geschichte hält das Änderungsprotokoll.

**Erweitert wird die Vorlagen-Struktur** um dieselbe Art, damit eine Vorlage sagen kann, welche
Workstreams sie beschreibt. Neu hinterlegt werden die **sieben PMI-Workstreams** aus der User Story:
Personal, IT, Finanzen, Betrieb, Vertrieb, Kommunikation, Risiko & Compliance.

**Neu ist nichts an Tabellen.** Kein zweiter Verweis an Arbeitspaketen, Risiken oder Deliverables,
keine eigene Berichts-Tabelle, keine zweite Auswertung.

**Angefasst werden zwei ausgelieferte Datenbank-Funktionen:**

1. Die Sperre der Projektvorlage („dieses Projekt hat schon Workstreams") wird auf **Deal**-
   Workstreams eingeschränkt. Ohne das macht der erste PMI-Workstream die Deal-Vorlage unanwendbar.
2. Die Auswertung je Workstream bekommt die überfälligen Aufgaben als zusätzliche Zahl — sie zählt
   heute fertige und gesamte, aber nicht die überfälligen, die das gerechnete Signal braucht.

Beide Änderungen als Anker-Ersetzung aus der **Live**-Definition mit Treffer-Eindeutigkeit und
Nachprüfung, nicht neu getippt — dieselbe Vorsicht, mit der PROJ-Y-115c und PROJ-Y-130s ihre
Registereingriffe gemacht haben.

### Was ausdrücklich nicht in α gehört

- **Synergie-Initiativen und der Synergie-KPI** — β, weil sie PROJ-126 voraussetzen (PROJ-169).
- **Ein Reifegradmodell** (die zweite offene Frage der Spec) — es gibt keine Nachfrage dafür, und
  eine Bewertungsskala ohne Bewerter ist eine leere Spalte.
- **Konfigurierbare Schwellen** für das gerechnete Signal — Konstante im Code, siehe oben.
- **Übergabe-Checkliste an die Linie** — die „Übergabekriterien" der Definition of Ready sind ein
  fachliches Dokument, kein Datenmodell; α setzt den Zustand, es prüft ihn nicht.

### Härtungskriterien (blockierend für `/qa`)

- **AC-127H-1** Die Deal-Fläche zeigt **keine** PMI-Workstreams, und die IMO-Sicht keine
  Deal-Workstreams — auf **beiden** Seiten geprüft, nicht nur auf der neuen.
- **AC-127H-2** Die Projektvorlage wird weiterhin abgewiesen, wenn Deal-Workstreams existieren, und
  **nicht mehr** abgewiesen, wenn nur PMI-Workstreams existieren. Beide Richtungen, weil die
  Einschränkung sonst eine Sperre aufhebt statt sie zu verengen.
- **AC-127H-3** Ein Deal-Workstream lässt sich **nicht** an die Linie übergeben — mit Gegenprobe,
  dass ein PMI-Workstream es kann. Ohne die zweite Hälfte belegt der Test nur eine kaputte Funktion.
- **AC-127H-4** Die IMO-Sicht ist ein **Aggregat** und braucht eine Leck-Probe: ein Mitglied ohne
  Freigabe sieht in den Kopfzahlen **nicht** die Workstreams, die es nicht öffnen darf. Die
  Auswertung rechnet im Rechtekontext des Aufrufers — das ist der Schutz, und er ist zu belegen.
- **AC-127H-5** Die vier neuen Angaben stehen im Feld-Audit; geprüft wird **verhaltensbasiert** (eine
  Änderung erzeugt genau eine Protokollzeile) mit Gegenprobe an einer nicht protokollierten Spalte.
  Eine Whitelist mit Geisterspalte protokolliert lautlos nichts (PROJ-Y-130s).
- **AC-127H-6** Die vier ausgelieferten Berichte bleiben **wörtlich** grün — sie joinen Workstreams
  als Beschriftungsquelle, und genau das soll die Typ-Spalte nicht verändern.
- **AC-127H-7** Pflicht-Live-Smoke gegen Prod im Rollback-Muster, null Rückstände; die geänderten
  Funktionen mit Post-Bedingung, die laut scheitert, wenn ein Zweig verloren geht.

### Risiken für `/qa`

1. **Das Typ-Merkmal wirkt an zwei Orten**, und der ausgelieferte ist der gefährlichere: vergisst die
   Deal-Fläche den Filter, wächst ihre Liste stillschweigend um PMI-Workstreams.
2. **Die Auswertung je Workstream liest ohne Typ-Filter** — die Deal-Route bekäme PMI-Zeilen. Zu
   entscheiden ist, ob der Filter in die Auswertung oder in die Route gehört; die Auswertung wird von
   zwei Flächen benutzt.
3. **Der Vorgabewert ist die stille Annahme.** „Deal" als Vorgabe ist richtig für den Bestand (null
   Zeilen) und für die Deal-Fläche, aber die IMO-Sicht muss die Art **setzen**, nicht erben.
4. **Zwei Ampeln, ein Missverständnis.** Wenn die Oberfläche nicht ausspricht, welche gesetzt und
   welche gerechnet ist, liest der Nutzer die eine als Korrektur der anderen.
5. **Die Vorlagen-Sperre ist die einzige Änderung mit Regressionspotential** an einer ausgelieferten
   Funktion, die 20 Workstream-Bezüge trägt.

### Abhängigkeiten

**Kein neues Paket.** Eine Migration. Kein weiterer CIA-Pass nötig — der Checkpoint zur Kernfrage ist
am 2026-09-03 gelaufen (Findings · Risks · Recommendations vorgelegt, Sub-Agenten in der Sitzung aus,
Verfahren nach `.claude/rules/continuous-improvement.md`), beide Gabelungen sind entschieden, und der
Rest folgt gemessenen Hausmustern.

**Reihenfolge:** `/backend` → `/frontend` → `/qa`. Die Datenschicht zuerst, weil die IMO-Sicht ohne
Typ-Merkmal und gerechnetes Signal nicht sinnvoll baubar ist (Präzedenz PROJ-109).
