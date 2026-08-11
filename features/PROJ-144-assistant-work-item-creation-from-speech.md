# PROJ-144: Work-Item-Anlage aus Spracheingabe (Assistant Action Pack)

## Status: Architected
**Created:** 2026-08-11
**Last Updated:** 2026-08-11 (Tech Design ergänzt; L7 + L8 gelockt)

## Summary

Erweitert den deployten Assistenten um sein **zweites mutierendes Aktionspaket**: Der Nutzer
spricht einen Auftrag wie *„Neue Story: Rechnungsimport testen"*, der Assistent legt einen
prüfbaren Entwurf vor, und erst nach ausdrücklicher Bestätigung entsteht ein echtes Work-Item
im Zielprojekt.

Das erste mutierende Paket (`project_create_draft`, PROJ-39) legt Projekte an. Diese Slice
überträgt dasselbe Muster eine Ebene tiefer auf die Backlog-Struktur — den Ort, an dem
Projektleiter täglich arbeiten. Der fachliche Gewinn ist die **Erfassungslücke im Meeting**:
Aufgaben, die heute mündlich verabredet und anschließend nie erfasst werden, landen direkt in
der Plattform, ohne dass jemand den Arbeitskontext verlässt.

Die Slice ist bewusst **regelbasiert und ohne Sprachmodell** geschnitten. Das ist keine
Sparmaßnahme, sondern folgt zwei belegten Erfahrungen: PROJ-86 zeigte live, dass deutschsprachige
Texte mit Personennamen durch den Class-3-Block laufen und ohne tenant-eigenes Ollama in
**null Ergebnissen** enden — und der erste ERP-Pilot hat kein eigenes Ollama. Ein LLM-Pfad
für freies Diktat ist als eigener Folge-Slice vorgesehen (siehe *Deferred*).

## Dependencies

- **Requires: PROJ-37** (Assistant-UX / Overlay + Push-to-Talk) — *Deployed*
- **Requires: PROJ-38** (Intent-Runtime, Confirmation-Gates, Session-Kontext) — *Deployed*
- **Requires: PROJ-39** (Action-Pack-Muster inkl. `project_create_draft` als Vorlage) — *Deployed, wird **nicht** editiert; diese Slice ergänzt ein eigenständiges Paket*
- **Requires: PROJ-40** (Transcript-Governance / Retention-Modi) — *Deployed* — bestimmt, was vom diktierten Rohtext überhaupt gespeichert werden darf
- **Requires: PROJ-41** (Speech-Infrastruktur, Browser-STT + Text-Fallback) — *Deployed*
- **Requires: PROJ-9** (Work-Item-Metamodell: Kind-Arten, `ALLOWED_PARENT_KINDS`) — *Deployed*
- **Requires: PROJ-6 / PROJ-26** (Methoden-Katalog + Method-Gating der Kind-Arten) — *Deployed*
- **Requires: PROJ-4** (RBAC / Projektzugriff für das Schreibrecht-Gate) — *Deployed*
- **Requires: PROJ-17** (Modul-Gate über Tenant-Settings) — *Deployed*
- **Influences:** künftige Aktionspakete (Risiken, Stakeholder, Budget) — diese Slice etabliert das
  wiederverwendbare Muster „diktieren → Entwurf → bestätigen → Fachobjekt".

## Gelockte Entscheidungen

Diese sechs Punkte wurden in der Requirements-Phase mit dem Nutzer entschieden und sind für
`/architecture` **bindend**:

| # | Entscheidung | Begründung |
|---|---|---|
| L1 | **Methoden-adaptiv**, nicht Scrum-only | `story` ist laut `WORK_ITEM_METHOD_VISIBILITY` nur in scrum/kanban/safe/vxt2 erlaubt; in waterfall/pmi/prince2 wird auf `work_package` abgebildet und das dem Nutzer **gesagt**. Scrum-only hätte die Funktion für den ERP-Pilot (häufig Wasserfall/Hybrid) wertlos gemacht. |
| L2 | **Entwurf + Bestätigung im Overlay**, keine Vorschlags-Queue | Spiegelt das deployte `project_create_draft`-Muster und erhält den Sprechfluss. Die `ki_suggestions`-Queue (PROJ-70/88/89) wäre semantisch falsch: dort landen **modellgenerierte** Vorschläge, hier ist es die wörtliche Absicht des Nutzers. |
| L3 | **Regelbasierte Extraktion**, kein neuer AI-Purpose | Kein Dependency, kein Cloud-Call, kein Class-3-Konflikt. Ein Purpose hätte Lockstep-CHECKs, Implementierung für alle fünf Provider (sonst stiller Stub-Fallback, PROJ-85) und `reason_code` (PROJ-137) nach sich gezogen — bei einem Pilot ohne Ollama mit dem realen Ergebnis „0 Vorschläge". |
| L4 | **Projektraum-Kontext, Projektname optional** | Im Projektraum gilt das offene Projekt; ein mitgesprochener Name wird über den bestehenden `resolveProject` aufgelöst (inkl. vorhandener Mehrfachtreffer-Rückfrage). Außerhalb eines Projektraums ohne Namen: Rückfrage statt Rateversuch. |
| L5 | **Entwürfe werden persistiert und sind wiederaufnehmbar** | Ein abgebrochener Entwurf darf nicht verloren gehen. Preis, der bewusst akzeptiert wurde: eigene Ablage + Sicht darauf + Aufräumregel. |
| L6 | **Bestätigung + Link, Overlay bleibt offen** | Erlaubt es, mehrere Elemente in Folge zu diktieren (Meeting-Fall), ohne den Arbeitskontext zu verlassen. |

## User Stories

1. **Diktat im Projektraum** — Als Projektleiter möchte ich im geöffneten Projekt *„Neue Story:
   Rechnungsimport testen"* sprechen und das Element nach einer kurzen Prüfung anlegen können,
   damit im Meeting verabredete Arbeit nicht verloren geht.

2. **Prüfen vor dem Anlegen** — Als Nutzer möchte ich vor dem Schreiben sehen, *was* mit
   *welcher Art* in *welchem Projekt* entsteht, damit eine Fehlerkennung der Spracheingabe
   keine falschen Daten erzeugt.

3. **Methodengerechte Art** — Als Projektleiter eines Wasserfall-Projekts möchte ich, dass der
   Assistent ein Arbeitspaket anlegt und mir das sagt, wenn ich „Story" sage, damit die
   Projektstruktur methodenkonform bleibt und ich nicht rätsele, warum es „Story" nicht gibt.

4. **Mehrere Elemente in Folge** — Als Nutzer möchte ich nach dem Anlegen sofort das nächste
   Element diktieren können, damit ich eine Besprechungsliste in einem Zug erfassen kann.

5. **Unterbrechung übersteht** — Als Nutzer möchte ich einen begonnenen, nicht bestätigten
   Entwurf später fortsetzen können, damit ein Anruf oder Seitenwechsel meine Eingabe nicht
   vernichtet.

6. **Nachvollziehbarkeit** — Als Tenant-Admin möchte ich erkennen können, dass ein Work-Item
   über den Assistenten aus einer Spracheingabe entstand, damit die Herkunft von Daten
   prüfbar bleibt.

## Acceptance Criteria

### A. Erkennung und Extraktion (regelbasiert)

- [ ] **AC-144.1** — Der Assistent erkennt einen neuen Intent für die Work-Item-Anlage und
      unterscheidet ihn zuverlässig von den fünf bestehenden Intents; insbesondere darf
      *„Wie ist der Stand von Projekt X?"* **nie** als Anlage-Auftrag erkannt werden.
- [ ] **AC-144.2** — Folgende Formulierungen führen zu einem Entwurf mit korrekt getrenntem Titel:
      - `Neue Story: Rechnungsimport testen`
      - `Erstelle eine Story Rechnungsimport testen`
      - `Neue Aufgabe Rechnungsimport testen im Projekt ERP-Rollout`
      - `Neues Arbeitspaket: Schnittstelle abnehmen`
- [ ] **AC-144.3** — Wird nur die Art ohne Inhalt gesprochen (*„Neue Story"*), entsteht **kein**
      Entwurf, sondern eine Rückfrage nach dem Titel.
- [ ] **AC-144.4** — Ein diktierter Satz, der die Muster nicht trifft (freies Gerede), führt zu
      einer Rückfrage mit einem konkreten Formulierungsbeispiel — nicht zu einer generischen
      „Ich habe das nicht verstanden"-Antwort und **nicht** zu einem geratenen Entwurf.
- [ ] **AC-144.5** — Titel werden auf die zulässige Länge begrenzt; ein längerer Diktattext wird
      nicht abgeschnitten und verworfen, sondern der Überhang landet in der Beschreibung.

### B. Methoden-Fit (L1)

- [ ] **AC-144.6** — Die Zielart wird aus der Projektmethode über die **bestehende**
      `WORK_ITEM_METHOD_VISIBILITY`-Tabelle abgeleitet; es entsteht keine zweite Wahrheitsquelle
      für die Methoden-Kind-Zuordnung.
- [ ] **AC-144.7** — In scrum/kanban/safe/vxt2 wird bei „Story" eine `story` erzeugt.
- [ ] **AC-144.8** — In waterfall/pmi/prince2 wird bei „Story" ein `work_package` erzeugt **und**
      die Antwort benennt die Abweichung ausdrücklich (z. B. *„Dieses Projekt läuft nach
      Wasserfall — ich habe ein Arbeitspaket vorbereitet statt einer Story."*).
- [ ] **AC-144.9** — Hat das Projekt **noch keine** Methode gesetzt (zulässiger Zustand nach
      PROJ-6), wird die wörtlich genannte Art verwendet, ohne Umdeutung.
- [ ] **AC-144.10** — Die erzeugte Art verletzt nie `ALLOWED_PARENT_KINDS`; ein Element, das
      nicht auf oberster Ebene stehen darf, wird nicht ohne gültigen Elternbezug angelegt.

### C. Zielkontext (L4)

- [ ] **AC-144.11** — Innerhalb eines Projektraums ist das geöffnete Projekt das Ziel, ohne dass
      der Nutzer es nennen muss.
- [ ] **AC-144.12** — Ein mitgesprochener Projektname überschreibt den Kontext und wird über den
      bestehenden `resolveProject` aufgelöst; bei mehreren Treffern erscheint die bereits
      vorhandene Auswahl-Rückfrage.
- [ ] **AC-144.13** — Außerhalb eines Projektraums ohne genannten Projektnamen erfolgt eine
      Rückfrage; es wird **kein** Projekt geraten (auch nicht „das letzte" oder „das einzige").
- [ ] **AC-144.14** — Ein Projekt, auf das der Nutzer keinen Zugriff hat, ist über die
      Spracheingabe nicht auflösbar und leakt seinen Namen nicht in die Antwort.

### D. Entwurf, Bestätigung, Persistenz (L2, L5, L6)

- [ ] **AC-144.15** — Vor der Bestätigung existiert **kein** Work-Item. Der Entwurf zeigt
      mindestens: Zielprojekt, Zielart, Titel und — falls vorhanden — Beschreibung.
- [ ] **AC-144.16** — Erst die ausdrückliche Bestätigung (Klick) erzeugt das Work-Item; ein
      gesprochenes „ja" allein löst **keine** Anlage aus.
- [ ] **AC-144.17** — Ein nicht bestätigter Entwurf bleibt erhalten und ist später
      wiederaufnehmbar; der Nutzer findet seine offenen Entwürfe und kann sie fortsetzen oder
      verwerfen.
- [ ] **AC-144.18** — Entwürfe sind **privat**: ein Nutzer sieht ausschließlich seine eigenen,
      auch innerhalb desselben Tenants und Projekts.
- [ ] **AC-144.19** — Ein bestätigter oder verworfener Entwurf erscheint nicht länger als offen
      und kann nicht doppelt bestätigt werden (kein zweites Work-Item aus demselben Entwurf).
- [ ] **AC-144.20** — Nach dem Anlegen meldet der Assistent Erfolg, bietet einen Sprung zum neuen
      Element und bleibt für die nächste Eingabe bereit.
- [ ] **AC-144.21** — Alte, nie bestätigte Entwürfe werden automatisch aufgeräumt; die
      Aufräumung nutzt die **bestehende** tägliche Entwurfs-Aufräumung mit
      (`/api/cron/purge-wizard-drafts`) statt eines zweiten Zeitplans.

### E. Berechtigung und Modul-Gate

- [ ] **AC-144.22** — Die Anlage setzt Schreibrecht im Zielprojekt voraus. Ein Nutzer mit
      Leserechten erhält eine klare Absage und **keinen** Entwurf, der beim Bestätigen scheitern
      würde.
- [ ] **AC-144.23** — Ist der Assistent oder der Backlog-Bereich im Tenant deaktiviert, antwortet
      der Assistent entsprechend und legt nichts an (Muster aus PROJ-39).
- [ ] **AC-144.24** — Die Anlage läuft über den regulären, sitzungsgebundenen Schreibpfad; die
      Mandanten- und Vertraulichkeitsregeln greifen unverändert. Ein Service-Role-Schreibweg
      ist ausgeschlossen.

### F. Datenschutz und Nachvollziehbarkeit (L3)

- [ ] **AC-144.25** — Kein Teil der Eingabe wird an einen externen KI-Anbieter gesendet. Es
      entsteht kein `ki_runs`-Eintrag, weil kein Modell beteiligt ist.
- [ ] **AC-144.26** — Der Entwurf speichert die **fachlichen Felder** (Titel, Beschreibung, Art,
      Ziel). Ob zusätzlich der diktierte Rohtext gespeichert werden darf, richtet sich nach dem
      Retention-Modus des Tenants aus PROJ-40: bei `no_persist` wird **kein** Rohtranskript
      abgelegt.
- [ ] **AC-144.27** — Jede Anlage hinterlässt einen Audit-Eintrag über den bestehenden
      Assistant-Aktions-Audit (Intent, Aktionsschlüssel, Bestätigungszustand, Ergebnis).
- [ ] **AC-144.28** — Das entstandene Work-Item ist als über den Assistenten erfasst erkennbar.
      Es wird **kein** `ki_provenance` geschrieben — das würde eine Modellherkunft behaupten,
      die es nicht gibt, und wäre eine falsche KI-Zuschreibung.
- [ ] **AC-144.29** — Der Text-Eingabepfad des Assistenten bleibt gleichwertig nutzbar: alles,
      was diktiert funktioniert, funktioniert auch getippt (Barrierefreiheit + Fallback ohne
      Mikrofonfreigabe, PROJ-41).

### G. Nicht-Regression

- [ ] **AC-144.30** — Die fünf bestehenden Intents verhalten sich unverändert; die
      Bestandstests der Assistant-Runtime bleiben grün.
- [ ] **AC-144.31** — Der bestehende `project_create_draft`-Pfad bleibt unangetastet.

## Edge Cases

- **Diktat trifft die Muster nicht** — freies Gerede erzeugt nie ein geratenes Element, sondern
  eine Rückfrage mit Formulierungsbeispiel (AC-144.4). Das ist die wahrscheinlichste
  Alltagssituation und entscheidet über die Akzeptanz.
- **Mikrofon verweigert oder Browser ohne Spracherkennung** — Rückfall auf Texteingabe über die
  bestehende Capability-Erkennung aus PROJ-41; die Funktion bleibt vollständig nutzbar.
- **Spracherkennung liefert Unsinn** („Rechnungsimport" → „Rechnung Sport") — genau dagegen
  steht die Prüfansicht vor dem Schreiben; der Titel muss im Entwurf **korrigierbar** sein,
  sonst ist die Bestätigung wertlos.
- **Gleichnamiges Element existiert bereits** — es wird angelegt, ohne Blockade (Work-Item-Titel
  sind nicht eindeutig); ein Hinweis auf den Namensgleichstand ist erlaubt, aber keine Sperre.
- **Projektname mehrfach vorhanden** — bestehende Auswahl-Rückfrage; nach der Auswahl bleibt der
  diktierte Titel erhalten und muss nicht erneut gesprochen werden.
- **Methode kennt die gesprochene Art nicht** — Abbildung plus Erklärung (AC-144.8), niemals
  stilles Umdeuten.
- **Nutzer verliert unterwegs das Schreibrecht** (Rollenwechsel zwischen Diktat und Bestätigung)
  — die Bestätigung scheitert kontrolliert mit klarer Meldung; es entsteht kein halb
  geschriebener Zustand.
- **Zwei Bestätigungen desselben Entwurfs** (Doppelklick, zweiter Tab) — führt zu genau **einem**
  Work-Item (AC-144.19).
- **Projekt wird zwischen Diktat und Bestätigung gelöscht oder archiviert** — kontrollierte
  Fehlermeldung statt Verweis auf ein verschwundenes Ziel.
- **Sehr langes Diktat** — Titel wird begrenzt, Überhang wandert in die Beschreibung
  (AC-144.5), nichts wird still verworfen.
- **Mehrere Elemente in einem Satz** („Story A und Story B") — im Zuschnitt dieser Slice
  entsteht **ein** Element; Mehrfachanlage aus einem Satz ist ausdrücklich *Out of Scope*.

## Out of Scope

- **Freies Diktat über ein Sprachmodell** — bewusst als Folge-Slice ausgelagert (siehe unten).
- **Mehrere Elemente aus einem Satz** — erst nach Pilot-Rückmeldung.
- **Eltern-, Sprint-, Phasen- oder Verantwortlichen-Zuweisung per Sprache** — jede weitere
  Auflösung ist eine eigene Fehlerquelle mit eigener Rückfrage-Logik; das Element wird nach der
  Anlage im Backlog verfeinert.
- **Bearbeiten oder Löschen bestehender Work-Items per Sprache** — mutierende Änderungen an
  Bestand brauchen ein eigenes Sicherheitskonzept.
- **Wake-Word-Bedienung** — bleibt bei PROJ-41 (`wakeWord.available: false`).
- **Sprachausgabe der Rückfragen** — die bestehende Sprachausgabe wird genutzt, aber nicht
  erweitert.

## Deferred / Folge-Kandidaten

- **PROJ-Y-144a — LLM-Extraktion für freies Diktat.** Neuer AI-Purpose, der aus unstrukturierter
  Rede Titel/Art/Beschreibung ableitet. Voraussetzung ist die volle Purpose-Pflicht
  (CHECK-Lockstep in `ki_runs` + `tenant_ai_cost_caps`, alle Cloud-Provider, `reason_code`) und
  ein tenant-eigenes Ollama für den Class-3-Fall. Erst bauen, wenn Pilot-Feedback zeigt, dass
  die Kommandoform zu eng ist.
- **PROJ-Y-144b — Mehrfachanlage aus einem Diktat** („drei Stories: …").
- **PROJ-Y-144c — Eltern-/Sprint-Zuweisung per Sprache.**

## Technical Requirements

- **Kein neues Dependency.** Spracherkennung, Overlay, Runtime, Audit und Aufräum-Zeitplan
  existieren bereits.
- **Kein Lockstep-CHECK nötig.** `assistant_turns.recognized_intent` und
  `assistant_action_events.recognized_intent` sind `text` **ohne** CHECK-Constraint (Migration
  `20260518193000_proj37_41_assistant_core.sql`, Z. 121/166) — ein neuer Intent-Wert bricht
  nichts in der Datenbank. Das unterscheidet diese Slice von `AIPurpose`, wo ein fehlender
  CHECK-Wert in Produktion 5xx erzeugt.
- **Mandantentrennung.** Jede neue Tabelle trägt `tenant_id UUID NOT NULL REFERENCES tenants(id)
  ON DELETE CASCADE` mit RLS über die etablierten Helfer; Entwürfe zusätzlich nutzer-privat
  (Muster `assistant_action_events_select_own`).
- **Schreibpfad.** Anlage über den sitzungsgebundenen Client und den regulären Projekt-Zugriffs-Gate.
- **Barrierefreiheit.** Texteingabe gleichwertig; Rückfragen und Entwurfsansicht per Tastatur
  bedienbar; Statusmeldungen für Screenreader wahrnehmbar.
- **Performance.** Erkennung und Entwurfsaufbau ohne Netzwerk-Roundtrip zu Dritten; die
  Antwortzeit bleibt im Rahmen der bestehenden Assistant-Turns.

> Tabellenzuschnitt, Spaltennamen, Intent-Schlüsselwort, RPC-Bedarf und die konkrete
> Wiederverwendung der Aufräum-Route sind **Aufgabe von `/architecture`** und hier absichtlich
> nicht vorentschieden.

## Offene Frage für /architecture

- **Wo sieht der Nutzer seine offenen Entwürfe?** Naheliegend ist eine kompakte Liste im
  Assistant-Overlay selbst (der Entwurf ist ein Artefakt des Assistenten, nicht des Backlogs) —
  zu entscheiden mit Blick darauf, dass der Nutzer sie ohne Suche wiederfindet. L5 verlangt
  Wiederaufnehmbarkeit, legt den Ort aber nicht fest.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Erstellt:** 2026-08-11 · **Zwei zusätzliche Locks in dieser Phase:** L7, L8 (unten)

### 1. Ausgangslage — was schon existiert

Der Assistent ist vollständig gebaut und live. Diese Slice ergänzt ein Aktionspaket, sie
erfindet keine Infrastruktur:

| Baustein | Zustand | Wird hier … |
|---|---|---|
| Overlay mit Mikrofon-Taste + Texteingabe | live | erweitert (Entwurfs-Karte + Entwurfsliste) |
| Erkennungs-Logik (regelbasiert, 7 Intents) | live | um einen Intent ergänzt |
| Turn-Route inkl. Sitzung, Audit, Transkript-Regeln | live | um einen Fall ergänzt |
| Work-Item-Anlage inkl. **Methoden- und Elternprüfung** | live | **unverändert wiederverwendet** |
| Tägliche Entwurfs-Aufräumung (03:00) | live | um eine zweite Frist ergänzt |
| Methode→erlaubte-Art-Tabelle | live | als einzige Wahrheitsquelle gelesen |

**Ein Befund verändert den Zuschnitt.** Die bestehende Turn-Route ist **einschrittig**: Eingabe
rein, Antwort raus. Bei der Projektanlage aus PROJ-39 wird die Entwurfszeile **sofort**
geschrieben, und die gemeldete „Bestätigung erforderlich" ist reine Begleit-Information — einen
Rückweg, über den der Nutzer eine vorbereitete Aktion freigibt, gibt es heute **nicht**. Die
Spec verlangt aber genau das (AC-144.16). Also braucht diese Slice einen **zweiten Schritt**,
den es bisher nirgends gibt. Das ist der eigentliche Neubau-Anteil.

### 2. Lösungsüberblick — der Zwei-Schritt-Fluss

```
Schritt 1  DIKTIEREN                      Schritt 2  BESTÄTIGEN
──────────────────────────────            ──────────────────────────────
"Neue Story:                              Nutzer prüft, korrigiert
 Rechnungsimport testen"                  ggf. den Titel, klickt
        │                                         │
        ▼                                         ▼
  Erkennung (regelbasiert)                  Entwurf wird "beansprucht"
        │                                         │
        ▼                                         ▼
  Zielprojekt bestimmen                     bestehende Work-Item-Anlage
  Zielart aus Methode ableiten                    │
  Schreibrecht prüfen                             ▼
        │                                   echtes Work-Item
        ▼                                         │
  SPRACH-ENTWURF gespeichert                      ▼
  (noch KEIN Work-Item)                     Entwurf als erledigt markiert
        │                                         │
        ▼                                         ▼
  Prüfansicht im Overlay                    "Angelegt." + [Öffnen]
                                            Overlay bleibt offen
```

Übersteht der Nutzer den zweiten Schritt nicht (Anruf, Seitenwechsel), bleibt der Sprach-Entwurf
liegen und erscheint beim nächsten Öffnen des Overlays in der Liste (L5).

### 3. A) Komponentenstruktur

```
Assistant-Overlay                              [bestehend, wird erweitert]
├── Eingabezeile (Mikrofon / Text)             [bestehend, unverändert]
├── Antwortbereich                             [bestehend, unverändert]
│
├── NEU: Entwurfs-Karte "Prüfen und anlegen"
│   ├── Zielprojekt (Name, in dieser Slice nicht umstellbar)
│   ├── Zielart + Methoden-Hinweis
│   │      z. B. „Arbeitspaket (dieses Projekt läuft nach Wasserfall)"
│   ├── Titel                                  ← korrigierbar (Pflichtfeld)
│   ├── Beschreibung                           ← korrigierbar (optional)
│   └── [Anlegen]   [Verwerfen]
│
├── NEU: Liste "Offene Entwürfe"               [nur wenn welche existieren]
│   └── je Zeile: Titel · Art · Projekt · [Weiter] [Verwerfen]
│
└── NEU: Erfolgsmeldung
    └── „Story ‚…' wurde angelegt."  [Öffnen]  → Overlay bleibt offen
```

Keine neue Seite, kein neuer Navigationspunkt, kein Eingriff in die Backlog-Fläche (L7).

### 4. B) Datenmodell (Klartext)

**Eine** neue Ablage entsteht: **Sprach-Entwürfe**. Jeder Entwurf hält:

- **Wem er gehört** — Mandant und Nutzer. Entwürfe sind **privat**: niemand sonst sieht sie,
  auch nicht im gleichen Projekt (AC-144.18). Das ist bewusst dieselbe Sichtbarkeitsregel wie
  beim bestehenden Assistent-Aktions-Protokoll.
- **Wohin er zielt** — Projekt und die aus der Projektmethode abgeleitete Art.
- **Was hinein soll** — Titel und optionale Beschreibung, beide korrigierbar.
- **Wie es ihm geht** — offen / bestätigt / verworfen.
- **Was daraus wurde** — ein Verweis auf das erzeugte Work-Item, sobald bestätigt. Dieser
  Verweis ist gleichzeitig die **Sicherung gegen Doppelanlage**: existiert er, ist der Entwurf
  verbraucht (AC-144.19).
- **Zeitstempel** — für die Aufräumung.
- **Den diktierten Rohtext** — **nur**, wenn die Transkript-Regel des Mandanten das erlaubt.
  Bei „nicht speichern" wird er nicht abgelegt; bei „bereinigt speichern" nur bereinigt
  (AC-144.26). Der Titel selbst ist **kein** Transkript, sondern gewollter Geschäftsinhalt —
  er wird immer gespeichert, sonst wäre die Wiederaufnahme sinnlos.

**Nicht angetastet:** die drei bestehenden Assistent-Tabellen bekommen **keine neue Spalte**.
Der Verweis auf den Entwurf reist im bereits vorhandenen Aktions-Protokoll pro Turn mit. Sonst
müsste jedes künftige Aktionspaket eine eigene Spalte anbauen — die Tabelle würde mit jeder
Slice breiter. Ebenso unangetastet: die Work-Item-Tabelle.

### 5. C) Technische Entscheidungen (mit Begründung)

**D1 — Der Entwurf wird gespeichert, das Work-Item erst nach Klick.**
Erfüllt AC-144.15 und L5 gleichzeitig. Bewusster Unterschied zur Projektanlage aus PROJ-39: dort
ist das sofort geschriebene Artefakt schon der Projekt-Entwurf; hier ist das gespeicherte
Artefakt ausdrücklich **nicht** das Zielobjekt, sondern eine Vorstufe davon.

**D2 — Die Bestätigung ist ein eigener Vorgang, kein zweiter Satz.**
Weil die bestehende Turn-Route einschrittig ist, braucht es einen zusätzlichen, eng
geschnittenen Freigabe-Weg. Er nimmt genau eine Entwurfs-Kennung und die (ggf. korrigierten)
Felder. Ausdrücklich **kein** gesprochenes „ja" als Auslöser (AC-144.16): eine Datenänderung
darf nicht an der Erkennung eines einzelnen Wortes hängen.

**D3 — Die Anlage läuft über die bestehende Work-Item-Anlage, nicht über einen zweiten Weg.**
Die größte Wiederverwendung dieser Slice. Der vorhandene Weg prüft schon heute Methode gegen
Art, Elternregeln und Oberste-Ebene-Erlaubnis und schreibt mandantengebunden. Ein eigener
Einfügeweg im Assistenten würde diese Prüfungen duplizieren — und Duplikate driften. **Vier
Akzeptanzkriterien werden dadurch geerbt statt gebaut** (siehe Abdeckungstabelle).

**D4 — Die Zielart kommt aus der bestehenden Methode→Art-Tabelle.**
Erfüllt AC-144.6. **Ehrlicher Warnhinweis für /qa:** diese Regel ist **nicht** in der Datenbank
verankert — es gibt keine Bedingung, die eine methodenfremde Art ablehnt; die Anwendungsschicht
ist der einzige Wächter. Eine falsche Zuordnung fällt also **nicht** von selbst auf. Deshalb ist
ein Regressionstest über alle sieben Methoden Pflicht und kein Beiwerk.

**D5 — Der Entwurf wird beansprucht, bevor das Work-Item entsteht.**
Reihenfolge: Entwurf von „offen" auf „in Anlage" umstellen → Work-Item anlegen → Entwurf mit dem
Verweis abschließen. Scheitert die Anlage, geht der Entwurf zurück auf „offen". Ein Doppelklick
oder ein zweiter Browser-Tab kann so kein zweites Work-Item erzeugen (AC-144.19). Die naive
Reihenfolge (erst anlegen, dann markieren) hätte genau dieses Loch.

**D6 — Das Schreibrecht wird schon beim Diktat geprüft, nicht erst beim Bestätigen.**
Sonst bekäme ein Nutzer mit Leserechten eine Prüfansicht, die beim Klick scheitert — eine
Sackgasse. Geprüft wird mit dem vorhandenen Projektzugriffs-Helfer; ein Projekt aus einem
fremden Mandanten ist über die Sprache **nicht auflösbar** und sein Name erscheint nicht in der
Antwort (AC-144.14), weil der Helfer in diesem Fall „nicht gefunden" meldet. Beim Bestätigen
wird erneut geprüft — ein Rollenwechsel zwischen den beiden Schritten führt zu einer klaren
Absage statt zu einem halben Zustand.

**D7 — Kein Sprachmodell, also auch keine KI-Buchführung.**
Es entsteht kein KI-Lauf-Eintrag und **kein KI-Herkunftsstempel** auf dem Work-Item: es war kein
Modell beteiligt, eine Modellherkunft zu behaupten wäre eine falsche Zuschreibung (AC-144.28).
Die Herkunft „über den Assistenten erfasst" wird stattdessen am Work-Item vermerkt, die
Handlung selbst im bestehenden Assistent-Aktions-Protokoll (AC-144.27).

**D8 — Der neue Intent braucht keine Datenbank-Anpassung.**
Die Intent-Spalten der beiden Assistent-Tabellen sind freier Text **ohne** Wertebeschränkung.
Damit fehlt hier die Falle, die beim KI-Router zweimal zugeschlagen hat (fehlender erlaubter
Wert → Serverfehler in Produktion). Die **einzige** Datenbank-Änderung dieser Slice ist die neue
Entwurfs-Ablage.

**D9 — Die Aufräumung reitet auf dem bestehenden Zeitplan.**
Kein zweiter täglicher Lauf. Die bestehende Entwurfs-Aufräumung um 03:00 erhält einen zweiten
Arbeitsschritt mit **eigener Frist: 14 Tage** (L8) — bewusst kürzer als die 90 Tage der
Projekt-Entwürfe, weil ein Diktat eine flüchtige Notiz ist und weniger diktierter Text
herumliegen soll.

**D10 — Der Textweg bleibt gleichwertig.**
Alles, was diktiert geht, geht getippt (AC-144.29). Das ist nicht nur Barrierefreiheit, sondern
auch der Rückfall für Browser ohne Spracherkennung und für verweigerte Mikrofonfreigabe — und
der Weg, über den sich die Funktion überhaupt automatisiert testen lässt.

### 6. D) Abhängigkeiten (Pakete)

**Keine.** Kein neues Paket, keine neue externe Anbindung, kein neuer Umgebungswert, kein neuer
Zeitplan-Eintrag. Damit ist auch kein Freigabe-Review für neue Technologie nötig.

### 7. Blast-Radius und Risiken

Vor der Umsetzung gemessen (Aufruf-Graph, aufwärts):

| Symbol | Direkte Aufrufer | Risiko | Bemerkung |
|---|---|---|---|
| Turn-Verarbeitung des Assistenten | 1 | LOW | nur die Turn-Route |
| Interner Antwort-Zusammenbau | 4 | LOW | alle vier in derselben Datei |

Der Antwort-Zusammenbau bindet die Meldung „Bestätigung erforderlich" heute **fest an den einen
Projektanlage-Intent**. Diese Kopplung muss gelöst werden, damit ein zweiter bestätigungs-
pflichtiger Intent existieren kann. Alle fünf bestehenden Intents laufen durch dieselbe Stelle —
die vorhandenen Runtime-Tests sind der Wächter dagegen, dass sich ihr Verhalten verschiebt
(AC-144.30/144.31).

Zwei weitere Risiken, die /qa gezielt angehen muss:

1. **Methoden-Zuordnung ohne Datenbank-Netz** (siehe D4) — Regressionstest über alle sieben
   Methoden.
2. **Fehlerkennung der Spracheingabe** — die Prüfansicht ist die einzige Verteidigung. Ein
   nicht korrigierbarer Titel würde die Bestätigung zur Formsache machen; die Korrigierbarkeit
   ist deshalb Teil des Designs, nicht Politur.

### 8. Abdeckung: geerbt vs. neu gebaut

| Kriterien | Herkunft |
|---|---|
| AC-144.6 – 144.10 (Methoden-Fit, Elternregeln) | **geerbt** aus der bestehenden Work-Item-Anlage (D3) |
| AC-144.12 – 144.14 (Projektauflösung, Mehrfachtreffer, kein Leck) | **geerbt** aus bestehender Projektauflösung + Zugriffs-Helfer |
| AC-144.24 (sitzungsgebundener Schreibweg) | **geerbt** (D3) |
| AC-144.26 (Transkript-Regeln) | **geerbt** aus der Transkript-Governance |
| AC-144.27 (Handlungs-Protokoll) | **geerbt** aus dem Assistent-Aktions-Protokoll |
| AC-144.21 (Aufräumung) | **erweitert** (bestehender Zeitplan, neue Frist) |
| AC-144.1 – 144.5 (Erkennung, Extraktion) | **neu** |
| AC-144.15 – 144.20 (Entwurf, Bestätigung, Doppelklick-Schutz) | **neu** — der Kern dieser Slice |
| AC-144.11 / 144.22 / 144.23 (Kontext, Vorab-Rechteprüfung, Modul-Gate) | **neu**, auf vorhandenen Helfern |
| AC-144.25 / 144.28 (keine KI-Buchführung, kein Herkunftsstempel) | **neu** (Weglassen mit Absicht) |

### 9. Empfohlene Arbeitsteilung

**Abweichend von der Standard-Reihenfolge empfehle ich `/backend` zuerst.** Die Prüfansicht ist
ohne Entwurfs-Ablage und Freigabe-Weg nicht sinnvoll baubar; eine reine Vorschau-Attrappe würde
weggeworfen. Dieselbe Umkehrung wurde in diesem Projekt bereits mehrfach bewusst gefahren
(u. a. PROJ-109).

- **`/backend`** — Entwurfs-Ablage samt Zugriffsregeln, neuer Intent + Erkennungsmuster,
  Zielart-Ableitung, Vorab-Rechteprüfung, Freigabe-Weg mit Beanspruchung (D5), Anbindung an die
  bestehende Work-Item-Anlage, zweiter Schritt in der Aufräumung. Pflicht vor „Approved": ein
  echter Live-Aufruf gegen die Datenbank sowie ein Sicherheitstest, der belegt, dass ein
  fremder Nutzer die Entwürfe eines anderen **nicht** sieht.
- **`/frontend`** — Entwurfs-Karte, Entwurfsliste, Erfolgsmeldung mit Sprung, Tastatur- und
  Screenreader-Verhalten, Zustände für „kein Mikrofon" und „kein Schreibrecht".
- **`/qa`** — die beiden Risiken aus Abschnitt 7, Doppelklick-Schutz, alle sieben Methoden,
  Nicht-Regression der fünf bestehenden Intents.

### 10. Zusätzliche Locks aus dieser Phase

| # | Entscheidung |
|---|---|
| L7 | Entwurfsliste **im Assistant-Overlay**, nicht im Backlog — der Entwurf ist ein Artefakt des Assistenten und privat; in einer geteilten Projektfläche wäre eine private Liste irritierend. |
| L8 | Aufbewahrung unbestätigter Entwürfe **14 Tage**, über den bestehenden täglichen Aufräum-Lauf mit eigener Frist. |

### 11. Hinweis zum Freigabe-Review (CIA)

Nach den Projektregeln ist ein Technologie-/Architektur-Review verpflichtend bei neuer
Technologie, neuem Persistenzmuster, größerem Refactoring oder einer offenen Architekturfrage,
die **drei oder mehr** Folgeschritte betrifft. Hier trifft keines davon zu: kein neues Paket
(Abschnitt 6), etabliertes Ablage- und Sichtbarkeitsmuster (Abschnitt 4), additive Erweiterung
statt Musterwechsel, und die einzige offene Frage betraf die Platzierung der Entwurfsliste
(zwei Folgeschritte, jetzt als L7 entschieden). Ein Review ist daher **optional** — sinnvoll
wäre er, falls stattdessen doch der Sprachmodell-Weg (PROJ-Y-144a) vorgezogen werden soll.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
