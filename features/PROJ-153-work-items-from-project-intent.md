# PROJ-153: Arbeitspakete aus dem Vorhaben — KI-gestützt, ohne Kickoff-Datei

## Status: Planned
## Deployment Scope: —
**Created:** 2026-08-28
**Last Updated:** 2026-08-28

> **ID-Hinweis.** Registriert war diese Arbeit zunächst als `PROJ-Y-152a`. Das Präfix `PROJ-Y-`
> bezeichnet im Haus den **Folgekandidaten eines Elternfeatures** (Präzedenz PROJ-145/D-145.1);
> PROJ-152 ist der Zeitbudget-Fix, und die Erzeugung von Arbeitspaketen aus dem Vorhaben ist
> nicht dessen Folge, sondern ein eigenes Feature mit eigenem AI-Zweck, eigener Migration und
> eigener Oberfläche. Es läuft daher als **PROJ-153**; der Registereintrag `PROJ-Y-152a` verweist
> hierher, damit die Spur des Nutzer-Berichts nicht abreißt.

## Auslöser

Nutzer-Meldung 2026-08-27, zweiter Teil:

> „außerdem möchte ich auch ohne kickoff datei projekt-skillbezogen meine Arbeitspakete
> ki basiert erstellen lassen können nach vorhaben"

## Warum es das noch nicht gibt — drei Sperren, jede bewusst gesetzt

1. **`contextSourceId` ist Pflicht.** Im Zod-Schema der Backlog-Route
   (`ai/proposal-from-context/route.ts:39`) ist es ein `z.string().uuid()` ohne Default — ohne
   Datei gibt es keinen Aufruf.
2. **PROJ-91 verbietet ausdrücklich, aus dem Vorhaben Items abzuleiten.** Der ausgelieferte
   Prompt sagt wörtlich: *„Extrahiere Items AUSSCHLIESSLICH aus dem Kickoff-Dokument. Erfinde
   KEINE Items aus dem Vorhaben — das Vorhaben ist NUR der Bewertungsmaßstab für `relevance`,
   NIE eine Quelle für Items."* (`graph-purpose-prompts.ts:507`). Das ist keine Vorsichtsregel,
   sondern die Reaktion auf ein **live gemessenes A/B**: ohne sie erfand das Modell einen
   plausiblen ERP-Backlog aus dem Zielsatz statt aus dem Dokument zu extrahieren (8/8 `on_goal`,
   Traceability-Verstoß). Zwei Vertragstests pinnen die Regel.
3. **Projekt-Skills werden von keinem Vorschlags-Zweck gelesen.** `project_skills` (PROJ-78)
   existiert und wird vom KI-Chat konsumiert (`project-chat-skills.ts`), von keiner
   Generierung. PROJ-82 „Skill-driven AI Proposals" steht seit jeher auf `Planned`.

## Erdung gegen den deployten Stand (Prod, 2026-08-27)

| Was | Gemessen | Folge für den Zuschnitt |
|---|---|---|
| Lebende Projekte | 31 | |
| **Vorhaben gefüllt** | **5 von 31**, Ø **47** Zeichen, max **97**, nur **1** über 80 | **Der tragende Befund** — siehe unten |
| Projekttyp | 31/31 | als Gerüst nutzbar, aber generisch |
| Methode | 18/31 | bestimmt die Item-Art (Arbeitspaket vs. Story) |
| Phasen vorhanden | 11 Projekte (15 Phasen) | mögliche Einhängepunkte |
| Kickoff-Quellen | 5 Projekte, 17 Quellen | der bestehende Pfad wird wenig genutzt |
| **Projekt-Skills** | **2 Skills** (1 aktiv), **2 Zuordnungen** | die skill-bezogene Hälfte hat heute kaum Substanz |
| Work-Items | 136 | |

**Der tragende Befund:** Das Vorhaben ist heute **ein Satz, kein Vorhaben.** Eine Generierung, die
daraus einen Backlog ableitet, hätte für 30 von 31 Projekten praktisch keine Eingabe — und
erzeugte damit exakt den Defekt, gegen den PROJ-91 antrat. Die naive Umsetzung des Wunsches wäre
also nicht bloß dünn, sie wäre **die Wiederholung eines bereits behobenen Fehlers**.

## Nutzer-Entscheide

- **L1 — Substanz kommt aus einer Dialogrunde, nicht aus dem Satz.** Vor der Generierung stellt
  die KI 3–6 gezielte, einzeln überspringbare Rückfragen zum Vorhaben (Muster PROJ-135); die
  Antworten sind die eigentliche Generierungsgrundlage.
  **Warum das die PROJ-91-Sorge entschärft statt sie zu ignorieren:** die Items werden dann nicht
  aus 47 Zeichen *erfunden*, sondern aus etwas *extrahiert, das der Mensch soeben geschrieben
  hat*. Der Unterschied zwischen „erfinden" und „extrahieren" bleibt damit erhalten — nur die
  Quelle ist ein Dialog statt einer Datei.
- **L2 — Herkunft bleibt dauerhaft sichtbar.** Aus dem Vorhaben abgeleitete Items tragen ein
  eigenes Herkunftsmerkmal „abgeleitet, nicht belegt" — in der Prüfansicht **und** am
  akzeptierten Work-Item. PROJ-70-Items tragen ein wörtliches Zitat aus der Quelle; hier gibt es
  keines, und das muss man dem Item später ansehen können.
- **L3 — Der Skill bestimmt, was generiert wird**, nicht nur wie. Ein Skill darf Struktur,
  Gliederungstiefe, Fachvokabular und Phasenmodell vorgeben.
  **Ausdrückliche Grenze, mit dem Entscheid mitgeliefert (siehe AC-153H.4):** „was generiert
  wird" ist nicht „wohin Daten gehen". Der Class-3-Gate, die Mandantentrennung, die
  Review-Pflicht (Invariante #2 — kein stilles Mutieren) und die Herkunftskennzeichnung aus L2
  sind **nicht** durch Skill-Inhalt abschaltbar. Ohne diese Grenze wäre die Skill-Pflege ein
  Weg, den Datenschutz-Gate zu umgehen — das war nicht Gegenstand des Entscheids.

## Dependencies

- **Requires PROJ-2** (Projekte) — `projects.description` ist die Eingabe
- **Requires PROJ-9** (Work-Item-Metamodell) — Ziel der Erzeugung
- **Requires PROJ-12/32** (AI-Router, Tenant-Keys) — Ausführung
- **Requires PROJ-78** (Projekt-Skills) — L3
- **Requires PROJ-135** (Dialogische Rückfragen) — L1 erbt Muster und Prompt-Bausteine
- **Requires PROJ-70** (Backlog-Vorschläge) — Prüfansicht, Bulk-Accept, 30-s-Undo werden
  wiederverwendet, nicht neu gebaut
- **Berührt PROJ-91** — die Invariante bleibt für `proposal_from_context` **unverändert**;
  dieses Feature kehrt sie nur für seinen **eigenen** Zweck um
- **Grenzt an PROJ-82** — „Skill-driven AI Proposals" bleibt eigenständig; dieses Feature
  liefert *einen* skill-gesteuerten Zweck, nicht das allgemeine Handlungsmandat mit
  Allowed-Action-Enforcement

## User Stories

- **US-1** Als Projektleiter möchte ich für ein Projekt **ohne** Kickoff-Dokument Arbeitspakete
  vorschlagen lassen, damit ich nicht erst ein Dokument erfinden muss, nur um die KI zu benutzen.
- **US-2** Als Projektleiter möchte ich vor der Generierung gezielt gefragt werden, was mein
  Vorhaben eigentlich umfasst, damit die Vorschläge zu meinem Projekt passen und nicht zu einem
  generischen Projekt dieses Typs.
- **US-3** Als Projektleiter möchte ich jede Rückfrage überspringen können, damit ein
  unvollständiges Bild mich nicht blockiert.
- **US-4** Als Prüfer möchte ich einem Vorschlag ansehen, dass er aus dem Vorhaben abgeleitet und
  **nicht** durch ein Dokument belegt ist, damit ich weiß, wie kritisch ich lesen muss.
- **US-5** Als Mandanten-Administrator möchte ich über einen Projekt-Skill vorgeben, welche
  Struktur die Generierung erzeugt (z. B. eine feste ERP-Phasenfolge), damit die Ergebnisse
  unserer Hausmethodik folgen.
- **US-6** Als Projektleiter möchte ich, dass ein zu dünnes Vorhaben mir gesagt wird, statt dass
  die KI etwas Plausibles erfindet, damit ich dem Ergebnis trauen kann.
- **US-7** Als Projektleiter möchte ich die Vorschläge in derselben Prüfansicht bearbeiten und
  einzeln oder gebündelt annehmen wie beim Kickoff-Pfad, damit ich nichts Neues lernen muss.

## Acceptance Criteria

### Zugang und Auslösung
- [ ] **AC-153.1** Die Generierung ist im Projektraum ohne jede Kickoff-Quelle auslösbar; der
      Aufruf verlangt **keine** `contextSourceId`.
- [ ] **AC-153.2** Der Einstieg liegt dort, wo Arbeitspakete entstehen (Backlog- bzw.
      Arbeitspakete-Fläche), und ist wie die bestehenden KI-Einstiege `edit`-gegatet.
- [ ] **AC-153.3** Hat das Projekt **keine** Methode, wird die Item-Art aus dem Projekttyp bzw.
      der Vorgabe des Nutzers bestimmt und die getroffene Wahl **benannt** (18 von 31 Projekten
      haben heute keine Methode).

### Dialogrunde (L1)
- [ ] **AC-153.4** Vor der Generierung wird **eine** Runde von 3–6 Rückfragen zum Vorhaben
      gestellt.
- [ ] **AC-153.5** Jede Rückfrage ist einzeln überspringbar, und die ganze Runde ist
      überspringbar.
- [ ] **AC-153.6** Die Antworten werden persistiert und sind bei erneutem Aufruf wieder
      verfügbar — eine abgebrochene Sitzung kostet die Eingaben nicht.
- [ ] **AC-153.7** Die Fragen beziehen sich auf **Lücken** des Vorhabens; eine Frage, deren
      Antwort bereits im Vorhaben steht, gilt als Fehler (Muster PROJ-135).
- [ ] **AC-153.8** Steht kein zulässiger Anbieter zur Verfügung, wird die Dialogrunde
      übersprungen statt zu blockieren — mit sichtbarem Grund (PROJ-137-`reason_code`).

### Substanz-Untergrenze (der tragende Befund)
- [ ] **AC-153.9** Reichen Vorhaben **und** Dialogantworten zusammen nicht aus, wird **nicht**
      generiert. Stattdessen wird gesagt, was fehlt und warum. Die Schwelle wird in
      `/architecture` festgelegt und ist testbar begründet — nicht geraten.
- [ ] **AC-153.10** Die Untergrenze ist an einer Stelle definiert und für Prüfer sichtbar
      (kein stiller Schwellwert im Prompt).

### Herkunft und Nachvollziehbarkeit (L2)
- [ ] **AC-153.11** Jeder Vorschlag trägt in der Prüfansicht sichtbar „aus dem Vorhaben
      abgeleitet — nicht durch ein Dokument belegt".
- [ ] **AC-153.12** Das Merkmal überlebt das Akzeptieren und ist am Work-Item feststellbar.
- [ ] **AC-153.13** Es ist unterscheidbar von einem PROJ-70-Item, das aus einer Datei stammt.
- [ ] **AC-153.14** Jeder Lauf ist als `ki_runs`-Zeile mit eigenem Zweck auffindbar.

### Skill-Steuerung (L3)
- [ ] **AC-153.15** Aktive Projekt-Skills prägen das Ergebnis in Struktur, Gliederungstiefe und
      Vokabular.
- [ ] **AC-153.16** Die Oberfläche nennt, welche Skills gewirkt haben — sonst ist ein
      abweichendes Ergebnis nicht erklärbar.
- [ ] **AC-153.17** Ohne aktiven Skill entsteht ein sinnvolles Ergebnis; Skills sind eine
      Verstärkung, keine Voraussetzung (heute: **1** aktiver Skill im ganzen Mandanten).

### Übernahme
- [ ] **AC-153.18** Vorschläge laufen durch die bestehende Prüfansicht mit Einzel- und
      Bulk-Annahme, Inline-Bearbeitung und 30-s-Undo — nichts davon wird neu gebaut.
- [ ] **AC-153.19** Akzeptierte Items landen methoden-adäquat in der bestehenden Struktur
      (Wasserfall → Arbeitspaket, Scrum → Story).
- [ ] **AC-153.20** Nichts wird ohne ausdrückliche Annahme geschrieben (Invariante #2).

### Härtung (blockierend)
- [ ] **AC-153H.1** Neuer `AIPurpose` wird im **Lockstep** in `ki_runs` **und**
      `tenant_ai_cost_caps` eingetragen — in derselben Migration.
- [ ] **AC-153H.2** Der Zweck ist für **jeden** Cloud-Anbieter implementiert, nicht nur den
      getesteten; ein datengetriebener Test über `AIPurpose` belegt es (PROJ-85 — sonst fällt der
      Router still auf den leeren Stub zurück, ununterscheidbar von „die KI fand nichts").
- [ ] **AC-153H.3** Ein leeres Ergebnis trägt einen typisierten `reason_code` und wird in der
      Fläche erklärt (PROJ-137).
- [ ] **AC-153H.4** **Ein Skill kann die Sicherheitszusagen nicht aushebeln**: Class-3-Gate,
      Mandantentrennung, Review-Pflicht und die Herkunftskennzeichnung aus L2 bleiben wirksam,
      unabhängig vom Skill-Inhalt. Ein Test fährt einen Skill dagegen, der genau das versucht.
- [ ] **AC-153H.5** Die Klassifizierung erfolgt **inhaltsbasiert** über Vorhaben und
      Dialogantworten. Kein Class-3-Pin — sonst wäre die Funktion ohne Ollama unbenutzbar; aber
      enthalten die Antworten Personendaten, greift der Gate wie überall.
- [ ] **AC-153H.6** **PROJ-91 bleibt unangetastet.** Die zwei Vertragstests und der Prompt von
      `proposal_from_context` laufen wörtlich unverändert grün. Belegt wird das durch einen
      Regressionslauf, nicht durch Zusicherung.
- [ ] **AC-153H.7** Kostendeckel und Audit-Trail gelten wie für jeden anderen Zweck.

## Edge Cases

- **EC-1 Vorhaben leer.** 26 von 31 Projekten. → Generierung gar nicht anbieten oder klar
  absagen; auf keinen Fall aus dem Projektnamen etwas ableiten.
- **EC-2 Vorhaben ist ein Wort** („ERP"). → AC-153.9 greift; die Dialogrunde muss dann die
  gesamte Substanz tragen, und wenn auch sie leer bleibt, wird nicht generiert.
- **EC-3 Nutzer überspringt alle Rückfragen.** → Es bleibt beim Vorhaben allein; unterschreitet
  das die Schwelle, wird abgesagt statt erfunden.
- **EC-4 Projekt hat bereits 136 Work-Items.** → Duplikate. Zu klären: erkennen und markieren
  oder ignorieren?
- **EC-5 Projekt hat sowohl Vorhaben als auch Kickoff-Quelle.** → Zwei Wege führen zum Backlog.
  Die Oberfläche muss sagen, welcher gerade läuft; das Ergebnis darf nicht vermischt aussehen.
- **EC-6 Skill widerspricht der Methode** (Skill schreibt Sprints vor, Projekt ist Wasserfall).
  → Wer gewinnt? Vorschlag: die Methode, mit sichtbarem Hinweis — sie ist in der Datenbank
  verankert, der Skill ist Text.
- **EC-7 Zwei aktive Skills widersprechen sich.** → Reihenfolge und Konfliktregel festlegen.
- **EC-8 Dialogantworten enthalten Personendaten** („Frau Meier verantwortet die Migration"). →
  Class-3, damit Ollama-only. Bei fehlendem lokalem Anbieter: absagen mit Grund, nicht
  stillschweigend an die Cloud.
- **EC-9 Nutzer generiert zweimal.** → Werden die alten Entwürfe ersetzt, ergänzt oder als
  Dublette geführt?
- **EC-10 Vorhaben wird nach der Generierung geändert.** → Die Vorschläge beziehen sich auf einen
  überholten Stand. Kennzeichnen oder ignorieren?
- **EC-11 Projekt ohne Methode** (18 von 31). → AC-153.3.
- **EC-12 Anbieter antwortet nicht.** → Seit PROJ-152 greift das Zeitbudget; die Fläche muss den
  Grund zeigen statt stehenzubleiben.

## Technical Requirements

- Neuer `AIPurpose` (Arbeitsname `proposal_from_intent`) — **nicht** eine Lockerung von
  `proposal_from_context`. Würde man den bestehenden Zweck aufweichen, fiele die
  Traceability-Zusage für **alle** Kickoff-Läufe mit; das ist der Grund für einen eigenen Zweck.
- Eine Migration: Zweck-CHECKs im Lockstep, Ablage für die Dialogantworten, Herkunftsmerkmal.
- Wiederverwendung statt Neubau: Prüfansicht und Bulk-Accept aus PROJ-70, Frage-Mechanik und
  Prompt-Bausteine aus PROJ-135, Skill-Lader nach dem Muster aus `project-chat-skills.ts`.
- Kein neues Paket erwartet.
- Sicherheit: `edit`-Recht für die Generierung; Class-3-Gate inhaltsbasiert; Kostendeckel aktiv.

## Offene Architekturfragen (für `/architecture`)

- **Q1** Wo werden die Dialogantworten abgelegt? PROJ-135 hängt sie an den `context_source`
  eines Wizard-Entwurfs — hier gibt es beides nicht. Eigene Tabelle, ein Feld am Projekt, oder
  ein „Vorhaben-Addendum" als synthetische `context_source`? Letzteres würde die
  PROJ-70-Maschinerie fast unverändert nutzbar machen, aber den Begriff „Kontextquelle"
  verwässern.
- **Q2** Wie wird die Substanz-Schwelle aus AC-153.9 bestimmt und **begründet**? Zeichenzahl ist
  messbar, aber grob (97 Zeichen können mehr tragen als 300 leere).
- **Q3** Wie weit darf ein Skill gehen (L3 gegen AC-153H.4)? Die Grenze braucht eine prüfbare
  Formulierung, nicht nur eine Absichtserklärung.
- **Q4** Verhältnis zu **PROJ-82**: absorbiert dieses Feature dessen skill-getriebenen Teil, oder
  bleibt PROJ-82 die allgemeine Schicht mit Allowed-Action-Enforcement?
- **Q5** EC-4/EC-9/EC-10 — Dublettenerkennung, Wiederholungsläufe, veraltete Vorschläge.
- **Q6** Ist ein CIA-Pass nötig? Nach `.claude/rules/continuous-improvement.md` spricht dafür,
  dass L3 eine **Architekturentscheidung mit Sicherheitsbezug** ist (Skill-Inhalt steuert
  Generierung) und dass die PROJ-91-Invariante bewusst umgekehrt wird. Empfehlung: **ja**, mit
  Q3 als konkreter Frage.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
