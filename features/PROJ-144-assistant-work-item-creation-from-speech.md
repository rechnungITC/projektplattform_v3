# PROJ-144: Work-Item-Anlage aus Spracheingabe (Assistant Action Pack)

## Status: Approved
**Deployment scope:** — (leer; noch nicht deployed — für „Approved" ist kein Scope zulässig)
**Created:** 2026-08-11
**Last Updated:** 2026-08-12 (F-8 geschlossen: der Browser-Durchlauf ist über PROJ-Y-144d bewiesen, 3/3 chromium; 0 Critical/0 High, keine offenen AC)

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

## Implementation Notes — /backend (2026-08-11)

### Was gebaut wurde

**Datenbank.** Migration `20260811190000_proj144_assistant_work_item_drafts` (in Prod):
Tabelle `assistant_work_item_drafts` mit 4 RLS-Policies (nutzer-privat: `user_id =
(select auth.uid())` **und** `is_tenant_member(tenant_id)`), 8 CHECK-Constraints,
`extensions.moddatetime`-Trigger und 3 Indizes. **Kein Feld-Audit** und **kein Zweig im
`audit_log_entity_type`-Register** — bewusst, weil Entwürfe flüchtiger, privater Scratch sind
und die Handlung selbst über `assistant_action_events` protokolliert wird (AC-144.27). Neben
der fachlichen Begründung hatte das einen praktischen Nutzen: die parallel laufende
PROJ-130-Kette arbeitet genau an diesen Audit-Funktionen; so gab es null Kollisionsfläche.

**Anwendung.**
- `src/lib/assistant/work-item-command.ts` — regelbasierte Befehlszerlegung + Methoden-Abbildung,
  komplett I/O-frei und damit über alle sieben Methoden testbar.
- `src/lib/work-items/create-work-item.ts` — die geprüfte Anlage aus
  `POST /api/projects/[id]/work-items` **herausgelöst** (D3). Die Route ist jetzt ein dünner
  Aufrufer; ihr Drift-Test läuft weiterhin durch denselben Pfad und bleibt der Wächter.
- `src/lib/projects/access.ts` — die Drei-Rollen-Schreibregel als reine Funktion, genutzt von
  `requireProjectAccess` **und** der Runtime (D6). Ohne das stünde die Regel an zwei Stellen.
- `src/lib/assistant/transcript.ts` — Redaktion geteilt statt zweimal geschrieben.
- Drei Routen: Liste, Bestätigen, Verwerfen. Das Beanspruchen (`open → claiming`) läuft
  **vor** der Anlage (D5).
- Aufräumung als zweiter Schritt im bestehenden 03:00-Lauf, eigene Frist 14 Tage (L8).

### Nachweise

| Prüfung | Ergebnis |
|---|---|
| Live-Pentest gegen Prod (`tests/sql/PROJ-144-…-pentest.sql`) | **17/17 PASS, 0 Residue** |
| vitest (volle Suite) | 363 Dateien / **2841 Tests** grün (+54 neu) |
| ESLint | 0 |
| tsc | 13 = Baseline, **0 neu** |
| Build | clean, alle 3 Routen registriert |
| `check:migration-naming` | 0 Fehler |
| Supabase-Advisors | **0 ERROR** (Security + Performance) |

Kernbeweis des Pentests ist Fall B: ein **Tenant-Admin**, der nicht der Ersteller ist, sieht
fremde Entwürfe nicht (0 Zeilen). Ebenfalls live belegt: kein Schreibzugriff auf fremde
Entwürfe (0 betroffene Zeilen statt Fehler), `INSERT` auf fremde `user_id` → 42501,
Doppel-Beanspruchen → zweiter Versuch 0 Zeilen (AC-144.19 auf DB-Ebene), Cascade beim
Projekt-Löschen, sowie die drei CHECKs.

### Befunde und Abweichungen

- **D-144.1 — AC-144.23 ist nur zur Hälfte erfüllbar.** `ModuleKey` kennt keinen Schalter für
  den Backlog; der ist Kernfunktion und nicht abschaltbar. Das Gate reduziert sich damit
  ehrlich auf das **Assistant**-Modul, das auf allen drei neuen Routen geprüft wird. Die
  Spec-Formulierung „oder der Backlog-Bereich" beschreibt etwas, das im Datenmodell nicht
  existiert.
- **D-144.2 — `anon` ist strenger gesperrt als erwartet.** Der erste Pentest-Lauf lief in
  `42501`, weil `anon` kein EXECUTE auf `is_tenant_member` hat (PROJ-68-Härtung): die Policy
  ist für anon nicht einmal auswertbar. Der Testfall akzeptiert jetzt beides (0 Zeilen **oder**
  42501) und benennt 42501 als das strengere Ergebnis.
- **D-144.3 — ein naiver `updated_at`-Test schlägt immer fehl.** `now()` ist innerhalb einer
  Transaktion konstant, und `moddatetime` schreibt genau `now()`; „Zeitstempel wird größer"
  kann im Pentest nie zutreffen. Belastbar ist die Gegenprobe: ein absichtlich auf 30 Tage
  zurückgesetztes `updated_at` wird vom Trigger überschrieben — sonst könnte ein Client sich
  der Aufräumung entziehen. Diese Falle ist im Pentest kommentiert.
- **D-144.4 — der Cascade-Fall braucht ein mitgliedschaftsfreies Projekt.** Ein Hart-Löschen
  scheitert sonst am live `enforce_last_lead()`-Trigger, der das Entfernen der letzten
  Projektleitung verweigert. Vorbestehende Produkteigenschaft, im Pentest dokumentiert.
- **D-144.5 — zwei FK-Indizes bewusst weggelassen.** Die Performance-Advisors melden
  `created_work_item_id` und `user_id` als „foreign key without covering index" (INFO). Beide
  liegen nicht auf einem Leseweg: der Verweis wird geschrieben, nie gefiltert, und
  Konto-Löschungen sind selten (PROJ-69-Triage-Muster „delete-rare → skip"). Der
  Aufräum-Index erscheint erwartungsgemäß als „unused", bis der nächtliche Lauf ihn nutzt.
- **D-144.6 — Projektname nur am Satzende.** „… im Projekt X" wird als Zielprojekt gelesen,
  wenn es den Satz beendet. Bei eingeschobener Nennung („lege im Projekt X eine Story an")
  greift der Projektraum-Kontext. Bewusst konservativ: greifzügigeres Abtrennen würde Teile
  des Titels als Projektnamen verschlucken.
- **PROJ-134-Versionsdrift (benign).** Die MCP registrierte `20260811133225` statt des
  Dateinamens — wie bei **jeder** Migration dieses Tages in allen Sessions. Der Dateiname
  bleibt, weil er die echte Anwendungsreihenfolge gegenüber den Geschwister-Migrationen
  spiegelt; ein Rename auf `133225` würde sie gegenüber Prod verdrehen. Die Migration ist
  durchgängig idempotent (`create table if not exists`, `drop policy if exists`), `db push`
  bleibt also unberührt.

### Offen für die Folgeschritte

- **`/frontend`** — Entwurfs-Karte mit **korrigierbarem Titel** (ohne das ist die Bestätigung
  eine Formsache), Entwurfsliste im Overlay, Erfolgsmeldung mit Sprung, Zustände für „kein
  Mikrofon" und „kein Schreibrecht".
- **`/qa`** — Playwright-Auth-Gates auf den drei neuen Routen, der Methoden-Regressionstest
  über alle sieben Methoden als bewusster Prüfpunkt (D4: keine DB-Absicherung), und ein
  End-to-End-Durchlauf Diktat → Bestätigen → Work-Item.

## Implementation Notes — /frontend (2026-08-12)

### Was gebaut wurde

- **`AssistantWorkItemDraftCard`** (`src/components/assistant/assistant-work-item-draft-card.tsx`) —
  die Prüfansicht. Titel **korrigierbar** (Tech-Design-Pflichtrisiko), Beschreibung optional,
  Art-Badge, Erklärung einer von der Methode erzwungenen Art (AC-144.8), Anlegen/Verwerfen mit
  Lade- und Fehlerzustand. Bewusst mit `key={draft.id}` zu rendern: der lokale State wird aus den
  Props *initialisiert*, ein Reset per Effect wäre eine set-state-in-effect-Verletzung des
  React-Compilers (Lehre aus PROJ-70-β). Die Anforderung steht als Kommentar in der Datei, weil
  sie sonst beim nächsten Aufrufer verloren geht.
- **`useAssistantWorkItemDrafts`** (`src/hooks/use-assistant-work-item-drafts.ts`) — Haus-Muster
  (`{data, loading, error, refresh, …Mutatoren}`, `let cancelled`-Guard). Lädt nur bei offenem
  Overlay. Serverfehler werden über den stabilen `code` ins Deutsche übersetzt statt rohe
  englische Meldungen durchzureichen; `draft_not_open` (409) wird ausdrücklich **nicht** als
  technischer Fehlschlag formuliert, weil das Work-Item in dem Moment bereits existiert.
- **Overlay** (`assistant-launcher.tsx`) — Entwurfsliste (L7, AC-144.17) mit Zusage der
  Aufbewahrungsfrist, Karte direkt am Sprechfluss (L2), nach der Anlage Erfolgsmeldung +
  Sprung-Link, Overlay bleibt offen (L6). Ein Entwurf erscheint nie doppelt (inline **oder**
  Liste). Der Sprung nutzt den **kanonischen** `backlog`-Slug; die Methoden-Auflösung bleibt bei
  `src/proxy.ts` (308, PROJ-28) statt hier nachgebaut zu werden.

### Nachweise

- `assistant-work-item-draft-card.test.tsx` **6/6** — Fall 1 ist der Kern: der korrigierte Titel
  muss bis in den `confirm`-Aufruf durchreisen. Dazu: vor dem Klick passiert nichts
  (AC-144.15/16), leerer Titel ist nicht bestätigbar, erzwungene Art wird erklärt (AC-144.8),
  nach einem Fehlschlag bleibt die Karte bedienbar (kein Dauer-Ladezustand), Verwerfen-Pfad.
- `use-assistant-work-item-drafts.test.ts` **5/5** — Fehlerübersetzung, damit ein umbenannter
  Code nicht still auf den Sammelfall zurückfällt.
- Gates: ESLint 0 · tsc 13 = Baseline / **0 neu** · vitest 2852/2852 (+11) · Build clean.

### Befunde und Abweichungen

- **F-6 (behoben, betraf den eigenen Backend-Stand):** `runtime.work-item-draft.test.ts` gab
  seinen Mock mit `as never` zurück. Der Typ war auf **keiner** Aufrufstelle einem
  `SupabaseClient` zuweisbar → **9 tsc-Fehler**, die der Backend-Commit als „tsc 13 = Baseline/0
  neu" gemeldet hatte. Die Zahl war nie gegen `main` gegengemessen worden. Jetzt auf eine
  Schnittmenge umgestellt (zuweisbar UND weiter als Mock erkennbar für die
  `toHaveBeenCalledWith`-Zusicherungen); Baseline auf reinem `origin/main` nachgemessen: **13**,
  gleiche Dateiverteilung. Lehre: „0 neu" ohne Gegenmessung ist eine Behauptung, keine Messung.
- **F-7 (behoben):** die 14-Tage-Frist stand privat in der Aufräum-Route, während das Overlay sie
  dem Nutzer zusagt. Nach `lib/assistant/work-item-command` gezogen — zwei Kopien wären eine
  Zusage, die der nächtliche Lauf still brechen könnte.

## QA Test Results — 2026-08-12

**Verdikt: 0 Critical / 0 High.** Ein Akzeptanzkriterium bleibt ausdrücklich **offen** (F-8),
nicht als „Deviation" verbucht.

### Ausgeführt

- **Live-Pentest gegen Prod** (`tests/sql/PROJ-144-assistant-work-item-drafts-pentest.sql`):
  **17/17 PASS**, Rollback-Marker erreicht. Rückstände nicht angenommen, sondern per
  Gegenabfrage geprüft: Pentest-Projekte 0, Entwürfe 0, Pentest-Profile 0,
  Bestätigungs-Events 0. Kernbeweis Fall B unverändert: ein **Tenant-ADMIN** sieht fremde
  Entwürfe NICHT — strenger als jede Vertraulichkeitsstufe im Produkt.
- **Playwright** `tests/PROJ-144-assistant-work-item-drafts.spec.ts` **4/4** chromium: alle drei
  Routen auth-gated; die Bestätigungsroute verrät ohne Sitzung weder Titel noch Projekt- oder
  Mandantenkennung.
- **Methoden-Matrix (D4)** — die Zuordnung Methode↔Art hat in der Datenbank keinen Constraint.
  Die Matrix lief über `PROJECT_METHODS` schon datengetrieben, die **Arten**-Achse war eine
  handgepflegte Kopie; auf `WORK_ITEM_KINDS` umgestellt, damit eine neue Art nicht still
  ungeprüft bleibt. Verhalten unverändert (beide Achsen 7 Werte) — der Gewinn ist die künftige
  Drift-Sicherung, kein gefundener Fehler.
- **Advisors:** Security 137 Findings, **alle WARN, 0 ERROR**, davon **0** zur neuen Tabelle.
  Keine DDL-Änderung in Frontend/QA, daher unverändert gegenüber dem /backend-Stand
  (dort 3 INFO zu erwarteten unbenutzten Indizes einer neuen Tabelle).
- Volle Gates: ESLint 0 · tsc 13 = Baseline/0 neu · vitest 2852/2852 · Build clean ·
  migration-naming 0 Fehler.

### F-8 — GESCHLOSSEN am 2026-08-12 durch PROJ-Y-144d

Der authentifizierte Browser-Durchlauf ist jetzt bewiesen:
`tests/PROJ-Y-144d-assistant-work-item-chain.spec.ts` **3/3 chromium**. Details und
Nachweise stehen unten in den PROJ-Y-144d-Notizen. Die ursprüngliche Analyse bleibt
unverändert stehen, weil sie erklärt, warum der Test nicht früher möglich war:

---

#### Ursprüngliche Analyse (Stand vor PROJ-Y-144d)

Ein authentifizierter Durchlauf Diktat → Prüfansicht → Bestätigen → Work-Item wurde **nicht**
ausgeführt. Grund ist keine Bequemlichkeit, sondern eine belegte Blockade:

1. Alle drei Assistant-Flächen sind modul-gegated (`requireModuleActive(…, "assistant")`), und im
   E2E-Mandanten ist das Assistant-Modul **aus** (live geprüft: `assistant_aktiv = false`). Ohne
   Modul rendert `AssistantLauncher` `null` und auch der reine API-Weg antwortet 403/404.
2. `AssistantLauncher` sitzt in `src/components/app/app-shell.tsx:57`, also auf **jeder**
   eingeloggten Seite, als `fixed`-Knopf unten rechts. `tests/PROJ-51-visual-regression-authenticated.spec.ts`
   fotografiert genau diese Shell (`/`, `/projects`, `/stammdaten`, `fullPage`). Das Modul im
   geteilten E2E-Mandanten anzuschalten würde die sieben Baselines verändern, die PROJ-Y-143b/d
   gerade stabilisiert haben — und Playwright fährt Dateien parallel, ein Ein-/Ausschalten
   innerhalb eines Specs wäre für gleichzeitig laufende Visual-Specs eine Flake-Quelle.
3. Das E2E-Projekt hat zudem **keine Methode** (`project_method = null`), womit die
   Methoden-Abbildung dort ohnehin nicht greifen würde.

Das ist eine Entscheidung über eine geteilte Test-Fixture und gehört nicht in diese Slice.
Empfohlener Weg → **PROJ-Y-144d**: ein eigener Assistant-E2E-Mandant mit aktivem Modul und einem
Projekt mit Methode, damit die Visual-Baselines unberührt bleiben. Bis dahin gilt: die
Bestätigungs**mechanik** ist auf Datenbank- (17/17), Routen- (11 Fälle) und Komponentenebene
(6 Fälle) bewiesen; die **Verkettung im Browser** ist es nicht.

Ausdrücklich in der Sprache von PROJ-135 festgehalten: ein nicht ausgeführter E2E-Layer ist
**kein** „Deviation", sondern ein offenes Akzeptanzkriterium.

## Implementation Notes — PROJ-Y-144d (2026-08-12): F-8 geschlossen

Geliefert **in derselben PR** (#341) statt als eigener Zweig, weil der einzige Zweck das
Schließen dieses offenen ACs ist — ein separater Merge hätte PROJ-144 zwischenzeitlich mit
einem unbewiesenen AC auf `main` stehen lassen.

### Was gebaut wurde

- **Zweiter Test-Mandant** mit aktivem Assistant-Modul (`E2E_ASSISTANT_TENANT_ID`) plus
  **Scrum**-Projekt (`E2E_ASSISTANT_PROJECT_ID`), in `global-setup` idempotent geseedet.
  Scrum bewusst: `E2E_PROJECT_ID` hat `project_method = null`, dort ist jede Art erlaubt und
  die Methoden-Abbildung ein No-op — ein Durchlauf dort hätte über die Methodenregel nichts
  bewiesen.
- `active_modules` wird **explizit** geschrieben. Beide Tore fallen bei fehlender
  Settings-Zeile offen (`isModuleActive` gibt für `null` `true` zurück,
  `requireModuleActive` gibt `null` zurück) — der Durchlauf hätte also auch ganz ohne Zeile
  „funktioniert". Eine Fixture, deren Zweck „Assistant ist an" ist, darf nicht auf einem
  Fail-open ruhen; der Tabellen-Default enthält `assistant` nämlich **nicht**.
- **Aktiver Mandant explizit gepinnt** (`auth-fixture.ts` setzt `active_tenant_id`). Der
  Nutzer ist jetzt in zwei Mandanten, und `resolveActiveTenantId` fällt ohne Cookie auf die
  *früheste* Mitgliedschaft zurück — auf einer frisch geseedeten Umgebung entstehen beide in
  derselben Sekunde, die Reihenfolge wäre ein Münzwurf. Ohne das Pinning wäre **jeder**
  bestehende `authenticatedPage`-Spec einen Zufall von einem anderen Workspace entfernt
  gewesen. Der Cookie ist keine Vertrauensgrenze: der Resolver prüft die Mitgliedschaft
  serverseitig bei jedem Request nach (PROJ-55-α/ε).
- **Neuer Spec** `tests/PROJ-Y-144d-assistant-work-item-chain.spec.ts`, 3 Fälle.

### Nachweise

- **3/3 chromium.** Tragend ist Fall 1, Schritt 4: **vor** dem Klick existiert der Entwurf,
  aber **kein** Work-Item (service-role-Gegenabfrage). Ohne diese Zusicherung würde der Test
  nur zeigen, dass ein Knopf eine Zeile anlegt — nicht, dass die Bestätigung ein Tor ist.
  Danach: Titel korrigieren → bestätigen → **genau ein** `story` mit dem **korrigierten**
  Titel, Entwurf auf `confirmed` mit Verweis auf das erzeugte Item, ein
  `assistant_action_events`-Eintrag mit `result_status='success'` (AC-144.27).
- Fall 2 (Wiederaufnahme) prüft nach einem **echten Reload**, nicht nach „Escape": das Sheet
  schließen unmountet den Launcher nicht, `messages` überleben, die Karte steht also einfach
  weiter da. Escape-und-wieder-auf hätte nur bewiesen, dass React-State überlebt — nicht, was
  „später wiederaufnehmbar" bedeutet. Nach dem Reload kann der Titel nur aus der Datenbank
  kommen. Anschließend Verwerfen → `status='discarded'`, kein Work-Item.
- Fall 3 ist der **Wächter für die fremde Lane**: mit dem geteilten Mandanten aktiv ist der
  Launcher-Knopf nicht im DOM (`toHaveCount(0)`), bei nachgewiesen passierter Auth-Schranke.
  Damit ist die Trennung, auf der die Visual-Baselines beruhen, getestet statt behauptet.
- **Rückstände 0** über alle fünf Assistant-Tabellen live gegengeprüft. Die Aufräumung
  erfasst zusätzlich Sitzungen und Aktions-Events des Test-Mandanten: die vom
  Bestätigungspfad geschriebenen Events tragen **keine** `session_id`, die FK-Kaskade greift
  dort also nicht, und ohne das würden pro CI-Lauf Zeilen liegen bleiben. `audit_log_entries`
  wird ausdrücklich **nicht** angefasst (seit PROJ-130-α append-only).
- **Nicht-Regression gemessen, nicht behauptet:** `PROJ-51-visual-regression-authenticated`
  ergibt auf reinem `origin/main` (bcf8e7c) **7 failed / 2 passed** und auf diesem Branch
  **7 failed / 2 passed** — identische Menge. Die Fehlschläge sind vorbestehend (eine
  Parallel-Session ist mitten im Re-Baselining). Ein erster Kontrolllauf war **ungültig**,
  weil der Vergleichs-Worktree auf einem älteren main stand; erst nach Gleichziehen beider
  Seiten auf denselben Commit ist die Aussage belastbar.

### Befunde

- **F-9 (behoben, eigener Fehler):** die Seed-Schritte waren als
  `Promise<{error}>` typisiert — ein Supabase-Query-Builder ist *thenable*, aber kein
  `Promise` → **4 neue tsc-Fehler**. Gegen `origin/main` gegengemessen (13), auf
  `PromiseLike` umgestellt, wieder 13. Genau die Fehlerklasse, die ich am Backend-Commit
  beanstandet hatte — deshalb wird hier gemessen und nicht behauptet.
- **F-10 (behoben):** die inneren Timeouts des Specs (120 s) lagen **über** dem globalen
  Test-Budget von 60 s aus `playwright.config.ts` und waren damit toter Code; bei kaltem
  `.next` starb der Test vor seinem eigenen Navigations-Timeout. Budget per
  `test.setTimeout(180_000)` angehoben statt die Wartezeiten zu kürzen — die Anwendung ist
  nicht langsam, der Dev-Server ist kalt. Gegenprobe mit vollständig gelöschtem `.next`:
  3/3 grün.
- **F-11 (Doku-Korrektur):** `constants.ts` verwies auf ein `constants.test.ts`, das den
  RFC-4122-Guard „pinnt". Die Datei existiert nicht und könnte es nicht: `tests/**` ist von
  vitest ausgeschlossen, weshalb PROJ-143 den Guard in `global-setup` gelegt hat. Verweis
  korrigiert, die beiden neuen Kennungen dem echten Guard hinzugefügt.
- **Betriebshinweis:** dieser Spec darf nicht mit `PW_SKIP_WARM_COMPILE=1` neben anderen
  Specs laufen — ohne die PROJ-138-Vorwärmung verhungert `/projects/[id]` an einem parallelen
  Worker. Gemessen: mit Abkürzung im Paarlauf rot, isoliert grün; mit Vorwärmung als Paar
  7/7.

### Weitere Abweichungen

- **D-144.1** (aus /backend) — AC-144.23 ist nur zur Hälfte erfüllbar: `ModuleKey` hat keinen
  Backlog-Schalter, Backlog ist Kern. Das Gate ist das Assistant-Modul.
- **D-144.7** — Mobile Safari umgebungsbedingt übersprungen (WebKit-Host-Bibliotheken,
  PROJ-67/F2).

## Deployment
_To be added by /deploy_
