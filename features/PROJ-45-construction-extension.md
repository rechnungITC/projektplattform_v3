# PROJ-45: Construction Extension — Gewerke & Bauabschnitte

## Status: Deployed
## Deployment Scope: alpha

**Created:** 2026-05-06
**Last Updated:** 2026-08-13 (Requirements refined + Tech Design — gegen den deployten Stand geerdet, Zuschnitt in Sub-Slices getrennt, 8 Nutzer-Locks, alle vier Forks beantwortet, CIA-Review zu Q2 eingearbeitet)

---

## Summary

Bauprojekte gliedern ihre Arbeit entlang zweier Achsen, die der geteilte Kern nicht kennt: **Gewerk**
(wer ausführt — Elektro, Rohbau, Sanitär) und **Bauabschnitt** (wo ausgeführt wird — Haus A, 2. OG,
Wohnung 3). Diese Slice führt beide Achsen ein und verknüpft sie mit dem Bestand. Sie ändert **keine**
Kernsemantik: Projekte, Phasen, Arbeitspakete, Risiken und Abhängigkeiten bleiben, was sie sind, und
werden nur zusätzlich referenziert.

`project_type = "construction"` existiert seit PROJ-6 im Katalog, trägt aber `is_placeholder: true` und
den Text *„Strukturell vorbereitet, fachliche Vertiefung folgt mit der Construction-Extension."* — diese
Slice löst genau dieses Versprechen ein. Bau-Code existiert heute **null**.

**α ist der einzige hier vollständig spezifizierte Schnitt.** Mängel, Abnahmen und bauspezifische
Terminsignale sind als β/γ/δ benannt und bewusst nicht vorgebaut.

---

## Nutzer-Locks (Requirements 2026-08-13)

| # | Entscheidung | Begründung |
|---|---|---|
| **L1** | **Erster Slice = Gewerke + Bauabschnitte.** Mängel (β), Abnahmen (γ), Terminsignale (δ) folgen getrennt. | Alle Folge-Objekte verweisen auf diese beiden Achsen. Ohne sie müssten Gewerk und Ort Freitext sein und später migriert werden. |
| **L2** | **Gewerke = mandantenweiter Katalog + Auswahl je Projekt.** | Ein Gewerk wiederholt sich über Projekte. Hauseigenes Muster: Risikokategorien (PROJ-107), DD-Stream-Templates (PROJ-112). Erst dadurch werden projektübergreifende Auswertungen möglich; projektlokale Anlage erzeugt „Elektro" vs. „E-Technik". |
| **L3** | **Ein Mangel wird ein eigenes Bau-Objekt** (eigener Lebenszyklus inkl. Prüf-Stufe, Frist, Nachunternehmer) — **gebaut in β, nicht hier.** | Ein `work_item` der Art `bug` hat weder Prüf-Stufe noch Vendor-Bezug noch Ortsangabe. Vorbild ist `dd_findings` (PROJ-114). |
| **L4** | **Fotodokumentation später.** α erfasst Beschreibung, Ort als Text, Gewerk, Frist. | Hält den ersten Deploy klein. Fotos hängen sich später an das DMS (PROJ-79), das seit PROJ-Y-115c ein Vertraulichkeits-Gate trägt. |
| **L5** | **Bauabschnitte sind mehrstufig und frei tief** (Selbstverweis). | Bauteil / Geschoss / Wohnung ist der Regelfall. Deployte Muster: `organization_units` (PROJ-62) und der DMS-Baum (PROJ-79), beide mit Baumdarstellung. |
| **L6** | **Verknüpfbar sind Arbeitspakete, Phasen und Risiken.** Spätere Bau-Objekte werden **nicht** vorgehalten. | Deckt „Elektro-Grobinstallation in Haus A, 2. OG" (Arbeitspaket), „Rohbau läuft über Haus A und B" (Phase, M:N) und „Lieferverzug Fenster betrifft Fassade" (Risiko). β/γ bringen ihre Verweise selbst mit. |
| **L7** | **Benutztes Katalog-Gewerk ist nicht löschbar** (Fehlermeldung nennt die Projekte), stattdessen deaktivierbar. **Umbenennen wirkt überall.** | Ein Gewerk behält seine Identität; die Auswertung darf nicht driften. `RESTRICT`-Muster wie PROJ-141-γ3. |
| **L8** | **Je Projekt-Gewerk: Verantwortlicher + optionaler Nachunternehmer + manuelle Ampel** (grün/gelb/rot). | Die Bauleitung muss der Zahl widersprechen können — eine rein gerechnete Ampel nimmt ihr das. Feld-Set entspricht `workstreams` (PROJ-102). |

---

## Dependencies

Alle Voraussetzungen sind **Deployed** und live verifiziert:

- **PROJ-6** — Projekttyp-/Methoden-Katalog (`construction` ist dort als Platzhalter reserviert)
- **PROJ-9** — Work-Item-Metamodell (Ziel der Arbeitspaket-Verknüpfung)
- **PROJ-19** — Phasen/Meilensteine (Ziel der M:N-Phasen-Verknüpfung)
- **PROJ-20 / PROJ-107** — Risiken (Ziel der Risiko-Verknüpfung; `risk_categories` ist die Katalog-Vorlage)
- **PROJ-15** — Vendors (Nachunternehmer-Zuordnung, L8)
- **PROJ-10** — Feld-Audit
- **PROJ-17** — Mandanten-Module (`active_modules`)

Beeinflusst: **PROJ-21** (Berichtsvarianten), **PROJ-25** (Gantt, relevant erst in δ).

---

## Prior Art — was wiederverwendet statt nachgebaut wird

Ergebnis der DUP→REUSE-Prüfung (CLAUDE.md: *„Before modelling anything new, search for the primitive
that already exists"*). Diese Tabelle ist bindender Input für `/architecture`:

| Bau-Begriff | Existiert heute als | Konsequenz für PROJ-45 |
|---|---|---|
| Gewerk (Projektsicht) | `workstreams` (PROJ-102): Label · Lead · RAG-Ampel · M:N-Phasen · FK von `work_items` **und** `risks` · Dashboard-RPC | Das Feld-Set ist **deckungsgleich** mit L6+L8. Ob generalisiert oder gespiegelt wird, entscheidet `/architecture` — neu erfunden wird es nicht. Die Navigation von PROJ-102 ist heute `requiresProjectType: "ma"`. |
| Gewerk (Katalog) | `risk_categories` (PROJ-107), `dd_stream_templates` (PROJ-112) | Muster für mandantenweiten Katalog mit Lazy-Seed und Admin-CRUD. |
| Bauabschnitt (Baum) | `organization_units` (PROJ-62, `parent_id` + react-arborist + DnD), DMS-Baum (PROJ-79) | Selbstverweis-Hierarchie samt Baum-UI ist zweifach erprobt. |
| Nachunternehmer | `vendors` (PROJ-15) | Kein eigenes Firmenmodell. |
| Fotodokumentation | DMS (PROJ-79) inkl. Vertraulichkeits-Gate (PROJ-Y-115c) | Erst in β/γ relevant (L4). |
| Abnahme | `deliverable_approvals` (PROJ-105, sequenzielle Stufen), Stage-Gates (PROJ-110) | Vorlage für γ. |
| Mangel | `dd_findings` (PROJ-114): Schwere, Betrag, empfohlene Behandlung, Eskalation | Vorlage für β. |
| Mängelanzeige-PDF | PROJ-21 Print-to-PDF (chrome-lose Druckseite) | Vorlage für β. |
| Frist / Zuständigkeit | `work_items.due_date` + `responsible_user_id` (PROJ-101) | Kein zweites Fristmodell. |

**Eine echte Lücke**, die α schließen muss:

1. `ModuleKey` (`src/types/tenant-settings.ts:18-30`) kennt kein `construction`. Der Wert und sein
   Eintrag in `TOGGLEABLE_MODULES` sind neu anzulegen — das ist der einzige Mechanismus-Zuwachs.

**Korrektur gegenüber der ersten Fassung dieses Refinements (2026-08-13):** Dort stand, die
projekttyp-gegatete Navigation müsse „verallgemeinert werden". Das ist **falsch** und wurde am Code
widerlegt. Beide Tore sind bereits generisch und greifen komponiert:

- `filterSectionsByProjectType` (`src/lib/method-templates/routing.ts:175-182`) filtert über
  `!s.requiresProjectType || s.requiresProjectType === projectType`, und das Feld ist als
  `requiresProjectType?: ProjectType` typisiert (`src/types/method-config.ts:61`) — **nicht** als
  Literal `"ma"`. Dass heute nur M&A-Sektionen es benutzen, ist eine Eigenschaft der Daten, nicht des
  Mechanismus.
- `filterSectionsByModules` läuft davor; beide werden in `project-room-shell.tsx:46-53` und in der
  Projekt-Sidebar zusammen angewandt.

Für α heißt das: Sektionen mit `requiresProjectType: "construction"` und
`requiresModule: "construction"` eintragen genügt — **kein** Umbau der Filterlogik, **keine**
Signaturänderung, **keine** Migration bestehender Sektionen. Der Aufwand für ST-45.5 sinkt damit
gegenüber der ersten Einschätzung deutlich. Bestehen bleibt nur die Vorsicht beim Ort: die
Sektionsliste in `src/lib/method-templates/index.ts` ist ein bekannter Merge-Hotspot.

---

## User Stories (α)

### ST-45.1 — Gewerke-Katalog pflegen
Als **Mandanten-Administrator** möchte ich die Gewerke meines Unternehmens einmal zentral pflegen,
damit jedes Bauprojekt dasselbe Vokabular benutzt und Auswertungen über Projekte hinweg tragen.

**Akzeptanzkriterien**
- [x] **AC-45.1** Ein Administrator kann Gewerke anlegen, umbenennen, deaktivieren und sortieren; jedes trägt eine mandantenweit eindeutige Kennung und eine Bezeichnung.
- [x] **AC-45.2** Nicht-Administratoren sehen den Katalog, können ihn aber nicht ändern; der Schreibversuch wird serverseitig abgewiesen, nicht nur in der Oberfläche ausgeblendet.
- [x] **AC-45.3** Ein Gewerk, das in mindestens einem Projekt zugeordnet ist, lässt sich **nicht löschen**; die Fehlermeldung benennt die betroffenen Projekte und verweist auf „deaktivieren" (L7).
- [x] **AC-45.4** Ein deaktiviertes Gewerk verschwindet aus der Auswahl neuer Zuordnungen, bleibt aber in bestehenden Projekten sichtbar und ausgewertet.
- [x] **AC-45.5** Eine Umbenennung im Katalog wirkt sofort in allen Projekten (L7) — es wird kein Name in die Projektzuordnung kopiert.
- [x] **AC-45.6** Der Katalog ist mandantengetrennt: ein fremder Mandant sieht ihn nicht und kann nicht darauf verweisen.

### ST-45.2 — Gewerke einem Bauprojekt zuordnen
Als **Bauleiter** möchte ich die für mein Projekt zutreffenden Gewerke auswählen und je Gewerk
Verantwortung, ausführenden Nachunternehmer und eine Ampel führen, damit die Lage auf einen Blick
lesbar ist.

**Akzeptanzkriterien**
- [x] **AC-45.7** Ein Projekt-Gewerk trägt: Verweis auf den Katalogeintrag, verantwortliche Person, optionalen Nachunternehmer aus PROJ-15, Ampel (`gruen` · `gelb` · `rot`, Vorgabe `gruen`), optionale Notiz (L8).
- [x] **AC-45.8** Die Ampel wird **manuell** gesetzt und nie automatisch überschrieben (L8).
- [x] **AC-45.9** Dasselbe Katalog-Gewerk kann einem Projekt nur **einmal** zugeordnet werden.
- [x] **AC-45.10** Zuordnen, Ändern und Entfernen ist auf Projektleitung und Mandanten-Administration beschränkt; Betrachter sehen die Liste unverändert lesend.
- [x] **AC-45.11** Änderungen an Verantwortlichem, Nachunternehmer und Ampel sind im Feld-Audit (PROJ-10) nachvollziehbar.

### ST-45.3 — Bauabschnitte gliedern
Als **Bauleiter** möchte ich das Bauvorhaben räumlich mehrstufig gliedern (Bauteil → Geschoss →
Einheit), damit Arbeit dort verortet werden kann, wo sie stattfindet.

**Akzeptanzkriterien**
- [x] **AC-45.12** Bauabschnitte sind je Projekt frei tief schachtelbar (Selbstverweis) und als Baum darstellbar (L5).
- [x] **AC-45.13** Ein Abschnitt kann umbenannt, verschoben (Elternwechsel) und gelöscht werden; die Reihenfolge unter einem Elternknoten ist bestimmbar.
- [x] **AC-45.14** Ein Abschnitt kann nicht sein eigener Vorfahre werden — der Zyklus wird serverseitig abgewiesen.
- [x] **AC-45.15** Beim Löschen eines Abschnitts mit Unterabschnitten wird die Folge vorher benannt und bestätigt; verwaiste Unterabschnitte entstehen nicht.
- [x] **AC-45.16** Bauabschnitte sind projekt- und mandantengetrennt.

### ST-45.4 — Arbeit auf beiden Achsen verorten
Als **Bauleiter** möchte ich Arbeitspakete, Phasen und Risiken einem Gewerk und einem Bauabschnitt
zuordnen, damit „Elektro-Grobinstallation in Haus A, 2. OG" als Filter existiert und nicht nur im
Titel steht.

**Akzeptanzkriterien**
- [x] **AC-45.17** Ein Arbeitspaket (`work_items`) kann je einem Gewerk und einem Bauabschnitt zugeordnet werden; beide Angaben sind optional (L6).
- [x] **AC-45.18** Eine Phase kann mit mehreren Bauabschnitten verknüpft werden und ein Abschnitt mit mehreren Phasen (M:N, L6).
- [x] **AC-45.19** Ein Risiko kann einem Gewerk zugeordnet werden (L6).
- [x] **AC-45.20** Die Arbeitspaket-Liste ist serverseitig nach Gewerk und nach Bauabschnitt filterbar; ein Abschnittsfilter schließt dessen Unterabschnitte ein.
- [x] **AC-45.21** Alle Verknüpfungen sind **additiv**: ohne Bau-Modul und außerhalb von Bauprojekten verhält sich der Kern unverändert — nachzuweisen durch eine grüne Regression der bestehenden Work-Item-, Phasen- und Risiko-Tests.
- [x] **AC-45.22** Wird ein Gewerk aus dem Projekt entfernt oder ein Abschnitt gelöscht, verlieren die verknüpften Objekte nur den Verweis; kein Arbeitspaket, keine Phase und kein Risiko wird gelöscht.

### ST-45.5 — Sichtbarkeit nur dort, wo sie hingehört
Als **Mandanten-Administrator** möchte ich, dass Bau-Funktionen ausschließlich in Bauprojekten und nur
bei aktivem Modul erscheinen, damit ERP-, Software- und M&A-Projekte unverändert bleiben.

**Akzeptanzkriterien**
- [x] **AC-45.23** Die Bau-Navigation erscheint nur bei `project_type = "construction"` **und** aktivem Bau-Modul; sie ist über `active_modules` abschaltbar.
- [x] **AC-45.24** Bei abgeschaltetem Modul antwortet der Server auf die Bau-Endpunkte gleichbleibend abweisend, ohne die Existenz der Fläche zu verraten — und die Oberfläche zeigt den neutralen „nicht aktiv"-Hinweis aus PROJ-Y-143f, **nicht** einen Leerzustand und **nicht** eine Fehlermeldung.
- [x] **AC-45.25** Das `construction`-Profil im Katalog (PROJ-6) verliert seinen Platzhalter-Status und benennt die Bau-Module.
- [x] **AC-45.26** Bestehende Projekte anderer Typen zeigen keine Bau-Elemente; nachzuweisen an einem ERP- und einem M&A-Projekt.

---

## Edge Cases

- **Katalog leer.** Ein Mandant öffnet erstmals ein Bauprojekt, ohne Gewerke gepflegt zu haben → leerer Zustand mit direktem Weg in den Katalog (Administrator) bzw. klarem Hinweis (Bauleiter ohne Adminrecht). Ob eine Standardliste vorbefüllt wird, ist offene Frage Q1.
- **Gewerk mitten im Projekt deaktiviert.** Bestehende Zuordnungen bleiben gültig und sichtbar; nur die Neuauswahl entfällt (AC-45.4). Die Projektsicht kennzeichnet den Eintrag als nicht mehr im Katalog geführt.
- **Nachunternehmer wird im Vendor-Stammdatensatz gelöscht.** Die Zuordnung fällt auf „nicht gesetzt" zurück, das Projekt-Gewerk bleibt bestehen.
- **Verantwortlicher verlässt den Mandanten.** Das Projekt-Gewerk bleibt bestehen und weist die Verantwortung als offen aus, statt stillschweigend leer zu wirken.
- **Abschnitt mit verknüpften Arbeitspaketen löschen.** Verweise fallen weg, Arbeitspakete bleiben (AC-45.22); die Bestätigung nennt die Zahl betroffener Objekte vorher.
- **Tiefe Bäume.** Sehr tiefe oder breite Abschnittsbäume dürfen die Ansicht nicht sprengen; Zyklen sind serverseitig ausgeschlossen (AC-45.14).
- **Projekttyp nachträglich.** `project_type` hat nach der Anlage heute **keinen Schreibpfad** (Befund aus PROJ-78) — ein bestehendes Projekt lässt sich nicht zum Bauprojekt machen. Das ist hinzunehmen und in der Oberfläche nicht zu versprechen.
- **Gleichnamige Abschnitte.** „2. OG" darf unter „Haus A" und „Haus B" gleichzeitig existieren; Eindeutigkeit gilt nur je Elternknoten.
- **Paralleles Bearbeiten.** Zwei Bauleiter ändern dieselbe Ampel — letzte Schreibung gewinnt, die Änderung ist im Audit zuordenbar.

---

## PROJ-45-β — Mängelmanagement (Requirements 2026-08-14)

**Status: Planned** · zweiter Sub-Slice, baut auf dem deployten α auf.

### Ein Befund vorweg: L3s Begründung ist zur Hälfte überholt

Lock **L3** wurde formuliert, **bevor** α gebaut war, und begründete das eigene Objekt damit, dass ein
`work_item` der Art `bug` *„weder Prüf-Stufe noch Vendor-Bezug noch Ortsangabe"* habe. Drei dieser vier
Lücken hat α selbst geschlossen:

| L3-Argument | Stand heute |
|---|---|
| keine Ortsangabe | `work_items.section_id` — in α gebaut |
| kein Gewerk | `work_items.trade_id` — in α gebaut |
| keine Frist | `work_items.due_date` — seit PROJ-101 |
| kein Verantwortlicher | `responsible_user_id` — seit PROJ-9 |

Echt übrig bleiben **zwei** Lücken: der **Nachunternehmer** (`work_items` trägt keinen Vendor-Bezug,
am Typ verifiziert) und die **Prüf-Stufe** — `WorkItemStatus` kennt `todo · in_progress · blocked ·
done · cancelled`, und „erledigt" ist eben nicht „geprüft". Letzteres ist auch kein Statuswert, sondern
ein **Zwei-Akteur-Gate**: der Nachunternehmer meldet fertig, die Bauleitung sieht nach.

**L3 bleibt trotzdem — auf neuer Begründung** (Nutzer-Entscheid, L9): nicht wegen der Felder, sondern
weil ein Mangel **keine geplante Arbeit** ist. Er ist ein eingetretener Sachverhalt mit
Gewährleistungsgewicht und formaler Mängelanzeige. Im Backlog würde er Velocity, Burndown und die
WBS-Rollups verfälschen — Auswertungen, die genau davon leben, dass dort geplante Arbeit steht.

### Nutzer-Locks (β)

| # | Entscheidung | Begründung |
|---|---|---|
| **L9** | **Eigenes Bau-Objekt**, L3 bleibt — aber fachlich begründet statt feldbegründet. | Siehe oben. Preis: eigene Oberfläche, kein Erben von Gantt und Abhängigkeiten. |
| **L10** | **Bauleitung prüft, Vier-Augen, Rückweisung möglich.** Wer auf „erledigt" gesetzt hat, kann nicht selbst abnehmen; eine fehlgeschlagene Prüfung wirft auf „in Bearbeitung" zurück. | Genau die Trennung, wegen der die vierte Stufe existiert. Muster für das Vier-Augen-Gate: PROJ-105 / PROJ-100c. Rückweisung statt Duplikat, weil sonst Ketten zum selben Sachverhalt entstehen. |
| **L11** | **Mängelanzeige in β**, als chrome-lose Druckseite (PROJ-21-Muster). | Ohne sie bliebe β ein internes Register; die Anzeige ist der Punkt, an dem der Mangel den Nachunternehmer erreicht. Kein neues Paket, kein Renderer. Echter Versand über PROJ-13 ausdrücklich **nicht** — der Nachunternehmer ist selten Plattformnutzer. |
| **L12** | **Überfällig sichtbar + in der Engpass-Sicht** (PROJ-103), keine eigene Benachrichtigungsschicht. | PROJ-103 sammelt überfällige Arbeit bereits; ein zweiter Mechanismus wäre eine zweite Wahrheit. |
| **L13** | **Gewerk ist Pflicht, Ort optional.** | Ein Mangel ohne Adressaten ist wertlos — das Gewerk trägt die Zuständigkeit und die Mängelanzeige. Der Ort ist beim Rundgang oft noch unpräzise; ihn zu erzwingen bremst die Erfassung dort, wo Mängel entstehen. |
| **L14** | **Dreistufiger Schweregrad** (gering · erheblich · gravierend), **keine** Kostenschätzung. | Trennt den Kratzer im Treppenhaus von der undichten Dachhaut und macht eine Liste mit 200 Einträgen lesbar. Ein EUR-Betrag ist auf der Baustelle selten belastbar — ein leeres Pflichtfeld ist schlimmer als keins. |
| **L15** | **Jedes Projektmitglied darf erfassen**, auch Betrachter. Ändern, Fristen setzen und Prüfen bleiben der Bauleitung. | Mängel entstehen beim Rundgang, nicht am Schreibtisch. **Bewusste Abweichung vom Hausmuster**, wo Betrachter nichts anlegen — deshalb architektur- und CIA-relevant (siehe offene Fragen). |
| **L16** | **Entfernen sperren**, solange Mängel an einem Gewerk oder Abschnitt hängen; die Meldung nennt sie. | Wie die Katalog-Löschsperre aus α. **Bewusst inkonsistent zu α**, wo Arbeitspakete und Risiken ihren Bezug per `SET NULL` verlieren dürfen: ein Mangel ohne Adressaten ist gewährleistungsrechtlich wertlos, ein Arbeitspaket ohne Gewerk nur unscharf. |

### Prior Art für β

| Bedarf | Vorlage |
|---|---|
| Objektform, Schweregrad, Statuswechsel-RPC | `dd_findings` (PROJ-114) — inklusive `create`/`update`-Paar und Zusammenfassungs-RPC |
| Vier-Augen-Prüfung | `deliverable_approvals` (PROJ-105), `_system`-Helfer-Muster aus PROJ-100c |
| Mängelanzeige | PROJ-21 Print-to-PDF, zuletzt in PROJ-131/132 angewandt |
| Nachunternehmer | `vendors` (PROJ-15) |
| Überfälligkeit | `project_task_bottlenecks` (PROJ-103) |
| Gewerk / Ort | `project_construction_trades`, `construction_sections` (α) — inkl. der in PROJ-Y-45a erzwungenen Projekt-Konsistenz |
| Fotos | DMS (PROJ-79) — **nicht** in β, das ist ε |

### User Stories (β)

#### ST-45β.1 — Mangel erfassen
Als **Projektmitglied auf der Baustelle** möchte ich einen Mangel in wenigen Feldern festhalten,
damit er nicht verloren geht, während ich noch vor Ort bin.

- [ ] **AC-45β.1** Jedes Projektmitglied — auch mit Betrachterrolle — kann einen Mangel anlegen (L15).
- [ ] **AC-45β.2** Pflicht sind Titel, Gewerk und Schweregrad; Ort, Beschreibung, Frist und Nachunternehmer sind optional (L13/L14).
- [ ] **AC-45β.3** Auswählbar sind nur Gewerke und Abschnitte **dieses** Projekts; ein projektfremder Verweis wird serverseitig abgewiesen.
- [ ] **AC-45β.4** Ein neu erfasster Mangel steht auf „offen" und ist ohne weiteren Schritt in der Liste sichtbar.

#### ST-45β.2 — Nachbesserung steuern
Als **Bauleitung** möchte ich Frist, Verantwortlichen und ausführenden Nachunternehmer setzen,
damit die Nachbesserung zugeordnet und terminiert ist.

- [ ] **AC-45β.5** Nur Projektleitung/Bauleitung oder Mandanten-Administration ändert einen bestehenden Mangel; ein Betrachter kann nach dem Anlegen nichts mehr ändern (L15).
- [ ] **AC-45β.6** Frist, Verantwortlicher und Nachunternehmer (aus PROJ-15) sind setz- und wieder entfernbar.
- [ ] **AC-45β.7** Der Status folgt der Kette offen → in Bearbeitung → erledigt → geprüft; jeder Wechsel ist auditiert.
- [ ] **AC-45β.8** Ein Mangel kann verworfen werden (etwa „kein Mangel"), mit Pflichtbegründung.

#### ST-45β.3 — Prüfen
Als **Bauleitung** möchte ich eine gemeldete Nachbesserung abnehmen oder zurückweisen,
damit „erledigt" nicht dasselbe bedeutet wie „nachgesehen".

- [ ] **AC-45β.9** „Geprüft" setzt ausschließlich Projektleitung/Bauleitung oder Mandanten-Administration.
- [ ] **AC-45β.10** Wer den Mangel auf „erledigt" gesetzt hat, kann ihn **nicht selbst** auf „geprüft" setzen; der Versuch wird serverseitig abgewiesen (L10).
- [ ] **AC-45β.11** Eine Prüfung kann fehlschlagen und wirft den Mangel auf „in Bearbeitung" zurück, mit Pflichtbegründung.
- [ ] **AC-45β.12** Der Verlauf zeigt jede Runde nachvollziehbar — wer wann fertigmeldete, wer wann prüfte oder zurückwies.

#### ST-45β.4 — Mängelanzeige herausgeben
Als **Bauleitung** möchte ich eine Mängelanzeige je Nachunternehmer erzeugen,
damit die Nachbesserung schriftlich und fristgebunden angefordert ist.

- [ ] **AC-45β.13** Aus der Mängelliste lässt sich eine Anzeige erzeugen, gefiltert auf ein Gewerk oder einen Nachunternehmer.
- [ ] **AC-45β.14** Die Anzeige ist eine chrome-lose Druckseite; der Browser druckt nach PDF (L11).
- [ ] **AC-45β.15** Sie enthält je Mangel Titel, Beschreibung, Ort (falls gesetzt), Schweregrad und Nachbesserungsfrist, dazu Projekt- und Erstellungsangaben.
- [ ] **AC-45β.16** Die Anzeige respektiert die Projektzugehörigkeit: sie zeigt ausschließlich Mängel, die der Aufrufer ohnehin sehen darf.

#### ST-45β.5 — Überfälliges sehen
Als **Bauleitung** möchte ich überschrittene Nachbesserungsfristen sofort erkennen,
damit ich nachhake, bevor die Gewährleistung zum Thema wird.

- [ ] **AC-45β.17** Ein Mangel mit überschrittener Frist und nicht abschließendem Status ist in der Liste als überfällig gekennzeichnet.
- [ ] **AC-45β.18** Überfällige Mängel erscheinen in der bestehenden Engpass-Sicht aus PROJ-103, ohne dass dort ein zweiter Mechanismus entsteht (L12).
- [ ] **AC-45β.19** Die Liste ist nach Gewerk, Abschnitt, Status, Schweregrad und Überfälligkeit filterbar.

#### ST-45β.6 — Sichtbarkeit
- [ ] **AC-45β.20** Mängel erscheinen nur in Bauprojekten mit aktivem Bau-Modul; bei abgeschaltetem Modul antwortet der Server gleichbleibend abweisend und die Oberfläche zeigt den neutralen „nicht aktiv"-Hinweis.
- [ ] **AC-45β.21** Ein Gewerk oder Abschnitt, an dem Mängel hängen, lässt sich nicht aus dem Projekt entfernen; die Meldung benennt die betroffenen Mängel (L16).
- [ ] **AC-45β.22** Mandanten- und Projekttrennung gilt unverändert: fremde Mängel sind unsichtbar, auch aggregiert.

### Edge Cases (β)

- **Erfasser prüft selbst.** Häufigster Versuch. Serverseitig abgewiesen (AC-45β.10) — nicht nur in der Oberfläche ausgeblendet.
- **Frist liegt beim Anlegen bereits in der Vergangenheit.** Erlaubt (Nacherfassung eines alten Mangels), aber sofort als überfällig gekennzeichnet.
- **Mangel ohne Ort.** Zulässig (L13); die Mängelanzeige lässt die Zeile weg statt „unbekannt" zu drucken.
- **Nachunternehmer wird im Stammdatensatz gelöscht.** Der Bezug fällt auf leer, der Mangel bleibt — anders als beim Gewerk, das die Zuständigkeit trägt.
- **Gewerk wird im Katalog nur deaktiviert.** Bestehende Mängel bleiben zugeordnet und sichtbar; nur die Neuauswahl entfällt.
- **Mehrfache Rückweisung.** Der Verlauf muss alle Runden zeigen, nicht nur die letzte (AC-45β.12).
- **Verworfener Mangel.** Zählt nicht als überfällig und erscheint nicht in der Engpass-Sicht.
- **Bauprojekt ohne Abschnittsbaum.** Erfassung muss vollständig funktionieren; der Ort bleibt schlicht leer.
- **Viele Mängel.** Bei 200+ Einträgen muss die Liste über Filter bedienbar bleiben; das ist der Grund für den Schweregrad (L14).

### Out of Scope (β)

Fotodokumentation (**ε**) · Verortung im Bauplan · echter Versand der Anzeige über PROJ-13 (L11) ·
Abnahmen (**γ**) · Gewährleistungsfristen und -verfolgung über die Bauzeit hinaus ·
Kostenschätzung je Mangel (L14).

### Offene Fragen für `/architecture`

- **Q-β1 — L15 weicht vom Hausmuster ab.** Betrachter dürfen sonst nirgends anlegen. Die Umsetzung braucht eine differenzierte Schreibregel (Anlegen ja, Ändern nein) statt der üblichen einen. **CIA-relevant**, weil es ein produktweit etabliertes Rechte-Muster aufweicht.
- **Q-β2 — Wo lebt das Vier-Augen-Gate?** In einer Statuswechsel-RPC wie bei `dd_findings`, oder in einer eigenen Prüf-Tabelle wie bei den Freigaben aus PROJ-105? Die Rückweisung mit Begründung und der mehrrundige Verlauf (AC-45β.12) sprechen für Ersteres mit einer Ereignis-Tabelle daneben.
- **Q-β3 — Wie kommt die Überfälligkeit in PROJ-103?** Dessen Auswertung ist heute auf `work_items` gebaut. Mängel sind ein zweiter Typ — erweitert die bestehende Funktion oder liefert eine zweite, die daneben gestellt wird?
- **Q-β4 — Sperren statt `SET NULL` (L16).** In α tragen Arbeitspakete und Risiken `SET NULL`. Zwei Regeln auf derselben Fläche sind erklärungsbedürftig; zu prüfen ist, ob `RESTRICT` auf dem Projekt-Gewerk mit dem bestehenden Entfernen-Pfad kollidiert.

---

## Out of Scope (α) — benannte Folge-Slices

| Slice | Inhalt | Vorlage |
|---|---|---|
| **PROJ-45-β** | **Mängelmanagement**: eigenes Objekt mit Lebenszyklus offen → in Bearbeitung → erledigt → **geprüft**, Nachbesserungsfrist, Pflicht-Gewerk, Ort (Abschnitt), verantwortlicher Nachunternehmer; Mängelanzeige als PDF (L3) | `dd_findings` (PROJ-114) + PROJ-21 |
| **PROJ-45-γ** | **Abnahmen**: Abnahmeprotokoll mit Status, Termin, verantwortlicher Rolle und Belegverweis; fehlgeschlagene Abnahme erzeugt prüfbare Vorschläge für Mangel oder Risiko | `deliverable_approvals` (PROJ-105) |
| **PROJ-45-δ** | **Bauspezifische Terminsignale**: Abschnittsfortschritt und Gewerk-Blocker in Gantt und Berichten | PROJ-25 · PROJ-103 · PROJ-132 |
| **PROJ-45-ε** | **Fotodokumentation** am Mangel über das DMS (L4) | PROJ-79 · PROJ-Y-115c |

**Dauerhaft außerhalb** (unverändert aus der Erstfassung): BIM-Integration · VOB-Automatisierung über
Compliance-Tags hinaus · mobiles Offline-Bautagebuch · Aufmaß- und Leistungsverzeichnis-Prüfung
(VOB/C — eigenes Vorhaben, berührt PROJ-22/24).

---

## Technical Requirements

- **Mandantentrennung.** Jede neue Tabelle trägt `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` und wird über `is_tenant_member` / `has_tenant_role` / `is_tenant_admin` abgesichert (CLAUDE.md, Multi-Tenant-Invariante).
- **Register-Pflichten nach PROJ-130.** Neue Tabellen müssen in derselben Migration in **alle vier** Register eingetragen werden: `audit_log_entity_type_check`, `_tracked_audit_columns`, `can_read_audit_entry` und das TypeScript-Register `AUDIT_ENTITY_TYPES`. Register-Änderungen erfolgen als **Anker-Ersetzung aus der Live-Definition** mit Fail-Loud-Guard und Re-Grant — nie abgetippt.
- **Lebenszyklus-Protokoll.** Anlage und Löschung werden über `record_audit_lifecycle` erfasst (PROJ-130-β).
- **Kein Eingriff in Kernsemantik.** Verknüpfungen sind additive, nullbare Verweise; bestehende Prüfungen, Zustandsautomaten und Methoden-Gates bleiben unberührt (AC-45.21).
- **Live-RPC-Smoke ist Pflicht** vor `Approved`: jede neue `SECURITY DEFINER`-Funktion bekommt einen echten Aufruf gegen die Produktionsdatenbank; Pentest in `tests/sql/PROJ-45-*.sql` nach dem DO-Block-Muster mit Rollback-Marker und **null Rückständen**, inklusive Gegenprobe für Mandantenfremde, Nicht-Mitglieder und Betrachter sowie entzogenem `anon`-EXECUTE.
- **Keine Actor-Parameter** in RPCs — `auth.uid()` wird intern gelesen.
- **`extensions.moddatetime`** schemaqualifiziert (sonst bricht der Schema-Drift-Wächter).
- **Kein neues Paket erwartet.** Für die Baumdarstellung ist `react-arborist` bereits im Bestand.

---

## Beantwortete Forks (2026-08-13)

| Fork | Entscheidung | Grundlage |
|---|---|---|
| **Q1** Standard-Gewerke vorbefüllen? | **Ja**, VOB/C-nahe Standardliste als Lazy-Seed beim ersten Katalogaufruf; alles umbenennbar und deaktivierbar. | Nutzer-Entscheid. Muster: `seed_risk_categories_if_empty` (PROJ-107), `ensure_default_ma_project_templates` (PROJ-96). **Korrektur zur ersten Begründung:** dort stand „in Produktion existieren bereits 3 Bauprojekte". Beim Live-Smoke stellte sich heraus, dass **alle drei weich gelöscht** sind („Wasserfall 1", „enablence.ai", „Test" — Testreste im Papierkorb); es gibt **kein einziges lebendes Bauprojekt**. Der Entscheid bleibt, seine ursprüngliche Stütze war falsch. Der erste echte Pilot startet also auf grüner Wiese — was für den Seed spricht, nicht dagegen. |
| **Q2** `workstreams` generalisieren? | **Nein — spiegeln (Option B).** Eigene Bau-Tabellen nach dem PROJ-112/102-Rezept. | CIA-Review 2026-08-13, Nutzer bestätigt. Tragender Grund unten. |
| **Q3** Matrix Gewerk × Abschnitt? | **Später.** α liefert zwei Achsen + Filter; die Kreuzansicht wird erst mit Mängeln (β) und Abnahmen (γ) inhaltsvoll. | Nutzer-Entscheid. Reine Darstellung, nachlegbar ohne Modelländerung. |
| **Q4** Modulschnitt | **Ein Schalter `construction`** für die ganze Extension. | Nutzer-Entscheid, CIA-konform: feinere Schalter erzeugen Kombinationen, die weder Test noch QA vollständig abdecken. |

---

## Implementierungsnotizen — /backend α (2026-08-13)

**Datenbank live in Prod.** Zwei Migrationen: `20260813131238_proj45_alpha_construction_trades_sections`
(4 Tabellen + 3 additive Verweise + 4 Guard-Trigger + 14 Policies + Register-Eingriffe + Lazy-Seed mit
18 VOB/C-nahen Gewerken) und `20260813131346_proj45_alpha_work_items_audit_fix` (Fix-forward, siehe unten).
Beide Dateinamen tragen die **registrierte Prod-Version** — der MCP vergab je einen eigenen Zeitstempel,
die Dateien wurden nach PROJ-134 nachbenannt.

**Eigener Fehler, von der Verifikation gefangen.** Die erste Migration erweiterte den `risks`-Zweig der
Audit-Whitelist korrekt, den `work_items`-Zweig aber **nicht**: die Wächterbedingung
`if position('trade_id' in v_def) = 0` kollidierte mit dem kurz zuvor selbst injizierten
`project_construction_trades`-Zweig, der das Literal `'trade_id'` enthält — die Bedingung war sofort
falsch, der Patch wurde stillschweigend übersprungen. Ein Umhängen zwischen Gewerken wäre unprotokolliert
geblieben (AC-45.11 / Auflage A-2 nur halb erfüllt). Der `risks`-Block war korrekt, weil er auf die
**präzise Zweigform** ankerte statt auf das nackte Literal. Fix-forward mit demselben präzisen Anker.
Lehre: ein Anker darf nie auf Text prüfen, den dieselbe Migration selbst schreibt.

**Zweiter Abbruch, ebenfalls gewollt:** der erste Anwendungsversuch brach mit
„entity_type CHECK anchor not found — refusing to guess" ab. Die Constraint rendert als
`ARRAY['x'::text, …])))`, nicht in der `]::text[]`-Form der Funktion. Nichts landete teilweise (atomar
zurückgerollt, an 0 `construction*`-Tabellen verifiziert). Anker und Delta-Zählung korrigiert, lesend
gegen die Live-Definition getestet (88 → 91), dann angewendet.

**Abweichung von Auflage A-1, belegt statt behauptet.** A-1 verlangte einen Katalog *ohne* Audit nach
dem `dd_stream_templates`-Muster. Live gemessen ist dieses Muster nicht einheitlich: `dd_stream_templates`
und `ma_project_templates` tragen kein Audit, **`risk_categories`, `ma_clearance_profiles`,
`committee_templates` und `organization_units` tragen beides**. Die Trennlinie ist *kopierte Vorlage* vs.
*referenzierter Katalog* — und L7 macht den Gewerke-Katalog per Konstruktion zu einem referenzierten.
Ohne Audit könnte niemand rekonstruieren, warum sich eine Bezeichnung in allen Projekten geändert hat.
Gewählt: `risk_categories`-Muster (Feld-Audit + Lebenszyklus).

**Live-Nachweise gegen Prod, 0 Rückstände:** Funktions-Smoke 10/10 (Pfadtiefe 3, Teilbaum-Filter,
gleichnamige Geschwister unter verschiedenen Eltern erlaubt, unter demselben blockiert, Zyklus 23514,
Katalog-Löschsperre, Repath nach Umhängen) und **Pentest 16/16** über alle neun Pflichtvektoren
(`tests/sql/PROJ-45-construction-trades-sections-pentest.sql`). Tragend darin: der Feld-Audit-Nachweis
lief unter einem **synthetisierten Nicht-Admin** — `V9c_not_admin=PASS` belegt, dass die Prüffunktion
nicht kurzgeschlossen hat und der Vektor nicht falsch-grün war.

**M&A unberührt:** `can_access_classified` enthält kein einziges `construction`-Vorkommen, `workstreams`
hat unverändert 7 Policies, alle Geschwisterzweige der drei geteilten Register namentlich gegengeprüft,
`can_read_audit_entry` an `authenticated` neu erteilt.

**Gates:** ESLint 0 · tsc 13 = Baseline / 0 neu · Build clean (7 neue Routen registriert) ·
`check:migration-naming` 0 Fehler · Advisors **0 ERROR** (der einzige slice-bezogene WARN ist die
`authenticated`-ausführbare Seed-Funktion — beabsichtigt, sie prüft intern selbst auf Mandanten-Admin,
identisch zu `seed_risk_categories_if_empty`).

**M&A-Regression PROJ-130-γ1 wörtlich gefahren (2026-08-13):** alle Verhaltensvektoren PASS —
A (standard bleibt sichtbar), **B (strict bleibt fuer nicht freigeschaltete Mitglieder verborgen)**,
C (Freischaltung oeffnet das Tor), D (Admin-Bypass), E (Nicht-Mitglied 0), F (anon 42501),
G1 (Tor ruft die Stufen-Aufloesung), G3 (alpha-Waechter 3/3). **G2 FAIL: 60 statt erwarteter 57
Zweige** — das sind exakt die drei von dieser Slice ergaenzten. Kein Verhaltensbruch, sondern eine
absolute Bestandszahl im Test einer Schwester-Slice; Sollwert auf 60 angehoben und im Test begruendet.
Der Umbau auf eine Untergrenze plus namentliche Geschwisterpruefung ist ein eigener Followup — die
absolute Zahl schlaegt bei jeder legitimen Erweiterung fehl, genau die Lehre, die PROJ-130-alpha fuer
Migrations-Zusicherungen selbst gezogen hat.

**Anwendungsschicht nachgezogen (2026-08-14):** Client-Wrapper `src/lib/construction/api.ts`
(`ConstructionApiError` trägt den HTTP-Status mit, damit 409 „Gewerk noch zugeordnet" von einem echten
Fehler unterscheidbar bleibt), `WorkItem`/`Risk`-Typen, `useWorkItems` reicht `tradeId`/`sectionId`
durch, **34 Route-Unit-Tests** über die drei Flächen. Dabei schlugen **fünf Bestands-Drift-Wächter** an
und taten genau ihre Arbeit: `type-vs-select-drift` (der Hook-SELECT ist eine explizite Spaltenliste,
kein `*`), danach `hook-mapping-drift` für die Gegenrichtung (selektiert, aber nicht abgebildet),
`modules.test`, sowie zwei Kitchen-Sink-Fixturen. Alle Erwartungen nachgezogen, keine abgeschwächt.
Gates: vitest **2965/2965**, tsc 13 = Baseline, ESLint 0.

**M&A-Regressionen wörtlich gefahren (2026-08-14), 0 Rückstände:**

- **PROJ-100a** abschnittsweise (Seed → Vektoren → Teardown): V1+4 exakt wie dokumentiert
  (`["P100A Conf","P100A Std"]`, Work-Item nur `confidential`, Phasen leer, `conf_true`/`strict_false`),
  V3 Cross-Tenant (`["P100A T2 Conf"]`, Fremd-Projekt `false`), V2c+5 alle vier Bypass-Schreibversuche
  **0 Zeilen**, V5c Freischaltungen für Nicht-Manager unlesbar, V6 Class-3-Orthogonalität (0/0),
  Admin-Bypass sieht alle drei, abgelaufene Freischaltung wirkt nicht. Teardown 0 Rückstände.
- **PROJ-100b** A–H **8/8 PASS** (Profil-Anwendung + Provenienz, Downgrade-Schutz, Wer-darf-was
  inkl. Ausschluss des Nicht-Freigeschalteten, Baseline, inaktives Profil, Fremd-Tenant-Profil,
  Manager-Gate, Katalog-Isolation).
- **PROJ-130-γ1** siehe oben: alle Verhaltensvektoren PASS, nur die absolute Zweigzahl angehoben.

**Drei Befunde, die nicht dieser Slice gehören:**

1. **PROJ-130-α, sicherheitsrelevant:** die Append-only-Zusage („`42501` für **jede** Rolle inkl.
   `service_role`/`postgres`") gilt für ein direktes `DELETE`, **nicht** unter
   `session_replication_role = replica` — in diesem Modus sind die Wächter-Trigger deaktiviert und
   Audit-Zeilen löschbar. Genau so räumt der PROJ-100a-Teardown seine 13 Lebenszyklus-Zeilen wieder ab
   (deshalb 0 Rückstände). Wer den Modus setzen darf, ist auf Superuser/`service_role` beschränkt, über
   die Anwendung ist es nicht erreichbar — die Zusage ist trotzdem zu stark formuliert. Eigener Followup.
2. **PROJ-130-γ1:** die absolute Zweigzahl (57) im Test schlägt bei **jeder** legitimen Erweiterung
   fehl. Umbau auf Untergrenze plus namentliche Geschwisterprüfung — eigener Followup.
3. **Buchführung:** für **PROJ-102** existiert keine Pentest-Datei; die im INDEX dokumentierten
   „Need-to-know 6/6" stammen aus einem Ad-hoc-Lauf und sind nicht reproduzierbar. Die von CIA-Auflage
   A-6 namentlich verlangte Regression ist damit strukturell nicht führbar, solange die Datei fehlt.
   Ersatzweise strukturell belegt: `can_access_classified` enthält kein `construction`-Vorkommen,
   `workstreams` hat unverändert 7 Policies.

**Frontend α live 2026-08-14:** Stammdaten-Katalog `/stammdaten/gewerke` (Liste mit aktiv/inaktiv,
Anlegen mit aus der Bezeichnung abgeleiteter Kennung, Umbenennen, Deaktivieren, Sortierung,
Lazy-Seed-Leerzustand, Löschsperre die die blockierenden Projekte benennt), zwei Projektraum-Flächen
(`/gewerke` mit Verantwortlichem + manueller Ampel + Notiz, `/bauabschnitte` als frei tiefer Baum mit
Anlegen/Umbenennen/Umhängen/Löschen samt Folgenhinweis), die drei additiven Felder in **beiden**
Work-Item-Dialogen und im Risiko-Formular über eine gemeinsame `ConstructionAxisFields`-Komponente,
sowie die Registrierung: zwei Nav-Sektionen mit `requiresProjectType` **und** `requiresModule`, plus
Stammdaten-Kachel.

**Ein Fund beim Registrieren, der Backend-Arbeit nachzog:** die Kachel-Registry erlaubt
`requiresModule` ausdrücklich nur, wenn die Fläche serverseitig wirklich gegatet ist — sonst behauptet
die Kachel „nicht aktiv", während die Seite funktioniert. Meine Routen hatten dieses Gate noch nicht.
AC-45.24 verlangt es ohnehin, also wurde `requireModuleActive("construction")` in **alle sieben**
Routen nachgezogen (Lese-Absicht → 404, damit das Tor nicht verrät, was es verbirgt) und je Fläche ein
expliziter Gate-Test ergänzt — sonst hätte ich das neue Gate in den Tests nur wegmockt.

**Eine Invariante musste angepasst werden:** `routing.test.ts` verlangte **genau eine** Sektion je
Modul. Diese Extension hat zwei Flächen hinter **einem** Schalter (Lock Q4). Die Prüfung ist auf ihre
tatsächliche Absicht umgestellt — „mindestens eine, und alles Verschwundene gehört zu genau diesem
Modul" plus Dedup auf der **Sektions-Kennung** statt auf dem Modulschlüssel. Damit fängt sie weiterhin
das versehentliche Doppelregistrieren, verbietet aber keine Extension mit mehreren Oberflächen.

**Deviation:** Der Bauabschnitts-Baum ist eine eingerückte Liste mit ausdrücklichem Eltern-Picker statt
Drag-and-drop. Der Picker bietet den Knoten selbst und seinen Teilbaum gar nicht erst an, kann also
keinen Zug vorschlagen, der nur scheitern kann; Ziehen ist Komfort und bewusst zurückgestellt.

Gates: vitest **2976/2976** · tsc 13 = Baseline · ESLint 0 · Build clean (3 neue Seiten + 7 Routen).

**Offen bleibt nur `/qa`** — gegen eine jetzt vollständige Basis.

---

## Tech Design (Solution Architect)

### Der tragende Grund für „spiegeln"

Nicht der Blast-Radius (119 Dateien, 12 Datenbankfunktionen, 10 Policies), sondern ein **Lesevertrag**:
Die Bezeichnung in `workstreams` ist pflichtbesetzt und wird von **allen fünf** Auswertungsfunktionen
als Anzeigequelle gelesen. Lock **L7 / AC-45.5** verlangt dagegen, dass eine Umbenennung im Katalog
überall wirkt und **kein** Name in die Projektzuordnung kopiert wird. Beim Generalisieren bliebe nur:
die Pflichtbesetzung aufgeben — dann zeigen fünf deployte M&A-Auswertungen leere Bezeichnungen — oder
den Namen kopieren und per Auslöser synchron halten, also genau die zweite Wahrheit, die L7
ausschließt. Der Fork scheitert am Vertrag, nicht am Datenumzug; dass die Tabelle heute **null Zeilen**
führt, macht das Generalisieren billiger, aber nicht richtiger.

Zwei Nebenbefunde stützen dieselbe Richtung: die Vertraulichkeitsachse würde mitreisen, und sobald eine
Bauleitung sie anhebt, käme sie an die eigenen Daten nicht mehr heran (die Freischaltungs-Oberfläche ist
M&A-gegatet) — **die Bauleitung sperrt sich selbst aus**. Und die befürchteten „zwei bedeutungsgleichen
Achsen" kosten in α faktisch nichts, weil alle fünf Auswertungen projekttyp-gegatet sind und ein
Bauprojekt keine davon aufruft.

### Was gebaut wird — Oberfläche

```
Stammdaten (mandantenweit, nur Administration)
└── Gewerke-Katalog
    ├── Liste: Bezeichnung · Kennung · aktiv/inaktiv · Reihenfolge
    ├── Anlegen / Umbenennen / Deaktivieren / Sortieren
    ├── Löschversuch bei Verwendung → Hinweis mit Namen der Projekte
    └── Erstaufruf ohne Bestand → Standardliste wird angeboten

Projektraum (nur Bauprojekte, nur bei aktivem Modul)
├── Gewerke
│   ├── Karte je Projekt-Gewerk: Bezeichnung (aus Katalog) · Verantwortlicher
│   │   · Nachunternehmer · Ampel · Notiz
│   ├── Gewerk hinzufügen (Auswahl aus aktivem Katalog, bereits vergebene ausgegraut)
│   └── Ampel direkt in der Karte umschaltbar
└── Bauabschnitte
    ├── Baum, frei tief, mit Ziehen zum Umhängen
    ├── Anlegen · Umbenennen · Umhängen · Löschen (mit Vorschau der Folgen)
    └── Detail: Bezeichnung, Beschreibung, verknüpfte Phasen

Bestehende Flächen, additiv erweitert
├── Arbeitspaket-Dialog: zwei zusätzliche Auswahlfelder (Gewerk, Bauabschnitt)
├── Arbeitspaket-Liste: zwei zusätzliche Filter; Abschnittsfilter schließt Unterabschnitte ein
└── Risiko-Formular: ein zusätzliches Auswahlfeld (Gewerk)
```

### Was gespeichert wird — in Klartext

**Gewerke-Katalog** (mandantenweit): Kennung, Bezeichnung, Reihenfolge, aktiv-Kennzeichen. Die Kennung
ist je Mandant eindeutig. Kein Feld-Audit — der Katalog ist Mandantenkonfiguration, wie die
DD-Stream-Vorlagen; damit bleibt er vollständig aus den vier Audit-Registern heraus.

**Projekt-Gewerk**: Verweis auf Projekt und auf den Katalogeintrag, Verantwortlicher, optionaler
Nachunternehmer, Ampel (grün/gelb/rot, Vorgabe grün, **immer manuell**), Notiz, Reihenfolge. Dieselbe
Katalogposition kann je Projekt nur einmal vorkommen. Die Bezeichnung wird **nicht** kopiert, sondern
immer über den Verweis gelesen — das ist die technische Umsetzung von L7.

**Bauabschnitt**: Verweis auf Projekt, optionaler Verweis auf den übergeordneten Abschnitt,
Bezeichnung, Beschreibung, Reihenfolge. Ein Abschnitt kann nicht sein eigener Vorfahre werden. Für den
Filter „schließt Unterabschnitte ein" wird der Pfad materialisiert mitgeführt, statt bei jeder Abfrage
den Baum rekursiv aufzurollen — dieselbe Technik, die der Arbeitspaket-Gliederung seit PROJ-9-R2
zugrunde liegt.

**Abschnitt ↔ Phase**: eigene Verbindungstabelle, weil beides mehrfach zueinander steht (ein Abschnitt
läuft über mehrere Phasen, eine Phase deckt mehrere Abschnitte ab).

**Additive Verweise auf Bestehendes**: Arbeitspakete bekommen zwei nullbare Verweise (Gewerk,
Abschnitt), Risiken einen (Gewerk). Alle drei mit „beim Löschen auf leer setzen", damit das Entfernen
eines Gewerks oder Abschnitts niemals Arbeit vernichtet (AC-45.22).

### Bewusst nicht gebaut

Keine Vertraulichkeitsachse in Bauprojekten (siehe oben — falls β/γ eine braucht, ist das ein eigener,
dann bewusster Schnitt mit eigener Freischaltungs-Oberfläche). Keine gerechnete Ampel. Keine
Kreuzmatrix (Q3). Keine Mängel, Abnahmen, Terminsignale, Fotos — das sind β/γ/δ/ε.

### Auflagen aus dem CIA-Review (bindend für `/backend` und `/qa`)

- **A-1** Katalog ohne Audit-Auslöser; Löschsperre über eine einschränkende Fremdschlüsselregel, Fehlermeldung nennt die betroffenen Projekte (AC-45.3).
- **A-2** Die drei neuen Verweise additiv und beim Löschen auf leer setzend; der Arbeitspaket-Zweig der Audit-Whitelist wird **mit Regressionsschutz** für die elf Bestandsspalten erweitert.
- **A-3** Jede Änderung an einer geteilten Registerfunktion: aus der Live-Definition lesen, **whitespace-toleranter** Anker, Treffer genau einmal prüfen, sonst lautstark abbrechen, nach dem Schreiben nachverifizieren, Geschwisterzweige namentlich gegenprüfen, Ausführungsrecht neu erteilen (Lehre aus PROJ-Y-115c und PROJ-Y-122a).
- **A-4** Bestandszahlen in Migrationszusicherungen immer als **Differenz**, nie absolut (Lehre aus PROJ-130-α: Shadow-Datenbank und Produktion zählen unterschiedlich).
- **A-5** `construction` in die Modul-Union **und** in die schaltbaren Module; Navigation über den bestehenden Projekttyp-Filter — keine Signaturänderung.
- **A-6** Live-Pentest `tests/sql/PROJ-45-*.sql`, null Rückstände, mit den Vektoren: mandantenfremd · Nicht-Mitglied · Betrachter schreibt · Katalog-Löschsperre · Doppelzuordnung · Abschnitts-Zyklus · Unterabschnitt-Löschung ohne Waisen · `anon`-Ausführungsrecht entzogen · **Feld-Audit unter einem synthetisierten Nicht-Administrator** (unter Mandanten-Administration schließt die Prüffunktion kurz und wäre falsch-grün). **Nicht-Regression M&A wörtlich**: PROJ-100a · PROJ-100b · PROJ-102-Need-to-know · PROJ-130-γ1 · PROJ-Y-122a — plus je eine **Aggregat-Leck-Probe** auf die beiden Berichtsfunktionen, deren Lesepfad von A-2 berührt wird.

### Offene Bestandsfunde (nicht Teil von α)

- `work_items.workstream_id` ist **nicht** im Feld-Audit — eine Umhängung zwischen Arbeitssträngen ist heute unprotokolliert (CIA-Fund).
- **`work_items.due_date` ebenfalls nicht** (eigene Nachprüfung gegen Produktion: der Arbeitspaket-Zweig führt `title, description, status, priority, responsible_user_id, kind, sprint_id, parent_id, story_points, confidentiality_level, is_deleted`). Für β relevant: eine stillschweigend verschobene Nachbesserungsfrist ist genau das, was eine Bauleitung nachweisen können muss. → eigener Followup.

### Abhängigkeiten (Pakete)

**Keine neuen.** Die Baumdarstellung nutzt `react-arborist` aus dem Bestand (PROJ-62/79), die Auswahlfelder
und Karten die vorhandenen shadcn-Bausteine.

### Reihenfolge

`/backend` zuerst (Katalog, Projekt-Gewerke, Abschnitte, die drei Verweise, Live-Pentest), danach
`/frontend` (Stammdaten-Katalog, zwei Projektraum-Flächen, die drei additiven Felder plus Filter),
danach `/qa`. Grund: die Oberfläche ist ohne Katalog und Baum nicht sinnvoll baubar — dieselbe Reihenfolge
wie bei PROJ-109 und PROJ-117.

---

## V2 Reference Material

`docs/projektplattform_skills/home/ubuntu/skills_markdown/bauleitung/` — **vier Dateien à ~31 Zeilen**
(`defect-tracking`, `gantt-scheduling`, `resource-allocation`, `vob-compliance`).

**Ehrliche Einordnung:** Das ist Vokabular und Workflow-Skizze, **kein Domänenmodell** — die Erstfassung
dieser Spec hat die Quelle überschätzt. Verwertbar ist daraus die Sprache: Mangel als *Ort · Gewerk ·
Beschreibung · Frist*, die vierstufige Mangel-Kette *offen → in Bearbeitung → erledigt → geprüft*, die
Mängelanzeige als PDF an den Nachunternehmer und der Hinweis auf eindeutige Verortung im Plan. Alles
davon zielt auf β/ε, nicht auf α.

Weiter: `docs/decisions/v3-code-extension-pattern.md` · `docs/decisions/ma-domain-architecture.md`
(M&A als gelebtes Beispiel für „Extension auf dem geteilten Kern statt Parallelmodul") ·
`docs/architecture/target-picture.md`.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Lauf 2026-08-14 · Verdikt: 0 Critical / 0 High → PRODUCTION-READY · 26/26 Akzeptanzkriterien erfüllt**

### Nachweise je Kriteriengruppe

| Kriterien | Nachweis |
|---|---|
| AC-45.1–45.6 (Katalog) | 14 Route-Unit-Tests · Live-Pentest V3b (Nicht-Admin-Schreibsperre), V4 (Löschsperre 23503), V1/V2 (Mandanten- und Fremdsicht) · Rot-Team R3a/R3b (deaktiviertes Gewerk: Bestand überlebt, Neuzuordnung 23514) · AC-45.5 strukturell: die Projektzeile hat **keine** Label-Spalte, ein Test pinnt den JOIN auf den Katalog |
| AC-45.7–45.11 (Projekt-Gewerk) | Pentest V5 (Doppelzuordnung 23505), V3 (Betrachter-Schreibsperre 42501), **V9a/V9b/V9c** (Feld-Audit unter synthetisiertem Nicht-Admin — `V9c_not_admin=PASS` schließt Falsch-Grün aus) · AC-45.8 strukturell: die Ampel wird nirgends abgeleitet |
| AC-45.12–45.16 (Abschnittsbaum) | Funktions-Smoke 10/10 (Tiefe 3, Teilbaum-Filter, Repath nach Umhängen) · Pentest V6 (Zyklus 23514), V7 (keine Waisen), V2b (Fremdsicht 0) · 7 Unit-Tests der reinen Baum-Helfer |
| AC-45.17–45.22 (Verknüpfung) | Migration SET NULL · Rot-Team R2 (Cross-Projekt-Phase abgewiesen, 23514) · AC-45.20 Smoke `D_subtree=ok` · **AC-45.21**: volle Suite 2976/2976 plus M&A-Regressionen PROJ-100a, PROJ-100b A–H 8/8, PROJ-130-γ1 |
| AC-45.23–45.26 (Sichtbarkeit) | 4 Modul-Gate-Tests · 125 Routing-Tests · Playwright 16/16 Auth-Gates · AC-45.25 in diesem Lauf **nachgezogen** (siehe F-1) |

### Automatisierte Läufe

- **vitest 2976/2976** · tsc 13 = Baseline / 0 neu · ESLint 0 · Build clean · `check:index-scope` 0 Fehler · `check:migration-naming` 0 Fehler
- **Playwright** `tests/PROJ-45-construction.spec.ts` **16/16** chromium — alle 7 API-Routen, 3 Seiten, plus eine Probe, dass eine unwohlgeformte Projekt-ID nichts über die Tabellenstruktur verrät
- **Visual-Regression** 9/9 nach begründeter Neuaufnahme zweier Baselines (siehe D-2)

### Rot-Team-Supplement (live gegen Prod, 0 Rückstände)

| Vektor | Ergebnis |
|---|---|
| R1 Fremd-Mandanten-Gewerk zuordnen | **PASS** (23514) |
| R2 Phase eines fremden Projekts verknüpfen | **PASS** (23514) |
| R3a/R3b Deaktiviertes Gewerk | **PASS** — Bestand überlebt, Neuzuordnung abgewiesen |
| R4 Arbeitspaket zeigt auf fremdes Projekt-Gewerk | **ANGENOMMEN → F-2** |
| R4a Leckprüfung zu R4 | **PASS, kein Leck** — die fremde Zeile ist für das Mitglied unsichtbar |

### Befunde

**F-1 (Medium, in diesem Lauf behoben) — AC-45.25 war nicht umgesetzt.**
Das `construction`-Profil stand unverändert auf `is_placeholder: true` und versprach die Extension
weiterhin als Zukunft („fachliche Vertiefung folgt mit der Construction-Extension") — während die
Extension bereits ausgeliefert wurde. Der Wizard hätte dem Nutzer damit das Gegenteil dessen gesagt,
was er sieht. Behoben: Platzhalter-Marker **entfernt** statt auf `false` gesetzt (die Bedeutung ist
„reserviert, nichts dahinter", und das stimmt nicht mehr), Zusammenfassung benennt jetzt Gewerke und
Bauabschnitte, `standard_modules` um beide erweitert (dafür musste die `ProjectModule`-Union wachsen).
Der Test, der den Platzhalter festnagelte, ist auf die neue Zusage umgestellt statt gelöscht.

**F-2 (Medium, offen → Followup) — fehlende Projekt-Konsistenz auf den additiven Verweisen.**
`work_items.trade_id` und `work_items.section_id` (analog `risks.trade_id`) sichern über den
Fremdschlüssel nur, dass die Zielzeile **existiert**, nicht dass sie **zum selben Projekt gehört**. Ein
Editor kann per API einem Arbeitspaket aus Projekt B ein Gewerk aus Projekt A zuweisen (live bestätigt).
**Kein Sicherheitsbefund:** Vektor R4a zeigt, dass die fremde Zeile für das Mitglied unsichtbar bleibt
(RLS ist projektbezogen) und die Oberfläche eine solche Auswahl gar nicht anbietet — sie listet nur die
Gewerke des eigenen Projekts. Wirkung ist unsinnige Zuordnung, kein Informationsabfluss. Der Fix ist ein
Konsistenz-Trigger analog `construction_section_phase_guard`; er gehört in dieselbe Klasse wie die schon
vorhandenen Guards und ist billiger, bevor β/γ weitere Verweise ergänzen.

### Abweichungen

- **D-1** Der Bauabschnittsbaum ist eine eingerückte Liste mit ausdrücklichem Eltern-Picker statt
  Drag-and-drop. Der Picker bietet den eigenen Teilbaum gar nicht an, kann also keinen Zug vorschlagen,
  der nur scheitern kann. Ziehen ist Komfort und zurückgestellt.
- **D-2** Zwei Visual-Baselines neu aufgenommen: Stammdaten **+206 px** (eine Kachelreihe für „Gewerke")
  und Tenant-Einstellungen **+49 px** (eine Modulzeile). Beide Höhen-Deltas entsprechen exakt genau
  einer neuen Zeile; nach Neuaufnahme zweimal stabil 9/9.
- **D-3** Mobile Safari übersprungen (WebKit-Host-Bibliotheken fehlen, PROJ-67/F2) — chromium-only.
- **D-4** Kein authentifizierter Browser-Durchlauf durch die drei Seiten: die Flächen sind
  modul-gegatet, und im E2E-Mandanten ist `construction` aus. Das Einschalten hätte die frisch
  stabilisierten Visual-Baselines verändert (dieselbe Abwägung wie PROJ-144/F-8). Die Mechanik ist
  über DB-Pentest, Route-Tests und Auth-Gates bewiesen, die **Verkettung im Browser** nicht.

---

## QA Test Results (Vorlage)
_ersetzt durch den Lauf oben_

## Deployment

**Deployed 2026-08-14 · Tag `v2.56.0-PROJ-45-alpha` · PR #385 (squash) → main `3732532`**

**Deployment Scope: `alpha`** — und bewusst nicht `full`. Alle **26** Akzeptanzkriterien *dieser*
Slice sind erfüllt, aber die Erstfassung der Spec (2026-05-06) trug vier Stories; drei davon
(Abnahmen, Mängel, bauspezifische Terminsignale) sind ausdrücklich auf β/γ/δ verschoben. Nach der
Regel schließt eine zurückgestellte **ursprüngliche** Anforderung `full` aus, auch wenn der gelieferte
Schnitt in sich vollständig ist. Verbleibende Slices sind unten und in
`features/OPEN-DEFERRED-STATUS.md` namentlich aufgeführt.

**Kein Runtime-DB-Change beim Merge:** beide Migrationen (`20260813131238`, `20260813131346`) liegen
seit `/backend` in Prod; der Merge liefert Code. Vercel deployt automatisch von `main`.

**Prod-Verifikation nach dem Deploy:**

- 4 Tabellen mit aktivem RLS · 15 Policies · 4 Guard-Trigger · `anon`-EXECUTE auf der Seed-Funktion entzogen · `work_items`-Audit-Whitelist trägt `trade_id` · **0 Rückstände** in allen Bau-Tabellen
- Post-Deploy-Smoke: alle fünf neuen Flächen (Katalog-Seite, Katalog-API, beide Projektraum-Tabs, Abschnitts-API) antworten mit **307 Auth-Gate**; der Antwortrumpf ist `Redirecting...` — kein Struktur- oder Datenleck
- Rebase linear auf `main` statt Merge-Commit (ein Merge-Commit löst bei Vercel kein Build-Event aus); alle sechs Gates grün, darunter der **Schema-Drift-Wächter** — der belegt unabhängig, dass die Anker-Ersetzungen auch in einer frisch aus den Migrationsdateien gebauten Datenbank greifen

**Followup F-2 erledigt 2026-08-14** — Tag `v2.57.0-PROJ-Y-45a`, PR #390: zwei BEFORE-Wächter
erzwingen jetzt, dass ein referenziertes Gewerk bzw. ein Bauabschnitt zum selben Projekt gehört.
Live-Smoke 9/9 gegen Prod, 0 Rückstände; die N-Vektoren belegen, dass der Normalpfad jedes
Nicht-Bauprojekts unbeschädigt bleibt. **Offen bleiben nur die Slices β/γ/δ/ε.**

---
