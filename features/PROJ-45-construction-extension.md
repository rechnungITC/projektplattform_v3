# PROJ-45: Construction Extension — Gewerke & Bauabschnitte

## Status: Deployed
## Deployment Scope: alpha

> **β ist deployed (2026-08-19, Tag `v2.61.0-PROJ-45-beta`, PR #402 squash → main `740b16b`).**
> **Deployment Scope `alpha`** — aus den Belegen klassifiziert, nicht aus dem Etikett: `full` ist
> ausgeschlossen, weil **AC-45β.18 eine zurückgestellte ursprüngliche Anforderung** ist (nach
> PROJ-45-δ verschoben, D-β1), und weil drei Stories der Erstfassung (Abnahmen γ, Terminsignale δ,
> Fotodokumentation ε) offen bleiben. Die Ausnahme „Waived criterion“ greift **nicht** — Begründung
> an allen vier Bedingungen im Abschnitt „Deployment — β“.
>
> **γ ist deployed (2026-08-20, Tag `v2.70.0-PROJ-45-gamma`, PR #422 squash → main `31aef7f`).**
> **Deployment Scope bleibt `alpha`** — aus den Belegen klassifiziert, nicht aus dem Etikett, und
> γ ändert daran nichts: `full` bleibt ausgeschlossen, weil **AC-45β.18** eine zurückgestellte
> **ursprüngliche** Anforderung ist (nach δ verschoben, D-β1) und weil zwei Stories der Erstfassung
> — Terminsignale (δ) und Fotodokumentation (ε) — offen bleiben. Die Ausnahme „Waived criterion“
> greift nicht: sie verlangt „nothing was deferred“, hier ist ausdrücklich etwas zurückgestellt und
> mit Ziel-ID registriert. Begründung an allen vier Bedingungen im Abschnitt „Deployment — γ“.
> 29/29 γ-AC, **12/12** Härtungskriterien; γ-Pentest **60/60**, Rot-Team **11/11**,
> authentifizierte Kette **3× 3/3** inkl. echtem PDF-Druck, Regressionen α 18/18 ·
> PROJ-Y-45a 9/9 · PROJ-103 7/7 · β **53/53**, **0 Rückstände**. **Kein Runtime-DB-Change beim
> Merge** — beide Migrationen liegen seit `/backend` in Prod.
>
> **α ist unverändert live** (Tag `v2.56.0-PROJ-45-alpha`, Scope `alpha`, PR #385); die Nachweise
> dazu stehen weiter unten unverändert. Die Zeile in `features/INDEX.md` führt weiterhin **einen**
> Scope für das Feature; er bleibt `alpha`, die gelieferte Grenze wird um β breiter.

**Created:** 2026-05-06
**Last Updated:** 2026-08-20 (**γ `/qa` PASS** — 29/29 AC, 12/12 Härtungskriterien, 0 Critical/High/Medium; der authentifizierte Durchlauf ist gefahren und ein echter PDF-Druck liegt vor. Vier Befunde, davon **einer fremd verursacht und gewichtig**: PROJ-Y-148d hat β's QA-Teardown und β's Pentest-Vektor Z gebrochen — gemessen, und die Ursache ist belegt bei 148d, nicht bei γ. Vorher: **γ `/frontend` live** — Reiter, zwei Masken, Detailansicht, Druckseite; ein gemessener Befund: die Fristrechnung existiert zwangsläufig zweimal und die naive TypeScript-Fassung wich am Monatsende von Postgres ab, hätte dem Nutzer also ein anderes rechtlich relevantes Fristende gezeigt als gespeichert wird — behoben und über fünf live gemessene Datumspaare gepinnt. Vorher: **γ `/backend` live** — 2 Migrationen in Prod, Live-Pentest 56/56 + 4/4 Nachlauf, 0 Rückstände; vier Befunde, darunter zwei, die ohne Nachmessen still geblieben wären: eine parallele Session hat β's Ereignis-Wächter am selben Tag gehärtet und γ hatte die schwache Form geerbt, und das Teilnehmer-Modell hätte das Löschen eines Stakeholders blockiert. Vorher: **γ architected** — alle sieben Fragen beantwortet, kein CIA-Pass nötig; vier Befunde aus der Erdung, drei davon korrigieren ein Akzeptanzkriterium: die Gesamtabnahme über den Wurzel-Abschnitt war nicht baubar, der Beleg hätte mit eingefroren, und die Teilnehmer-Achse „Projektmitglied" war doppelt. Vierter Befund: die Entfernen-Meldung aus α/β würde durch γ **falsch**, nicht bloss unvollständig. Vorher: **γ spezifiziert** — Abnahmen, 29 AC, 7 Nutzer-Locks. Vorher: β **deployed** — Tag `v2.61.0-PROJ-45-beta`, Scope `alpha`, Prod-Verifikation eigenständig nachgemessen, Post-Deploy-Smoke 8/8 exakt 307 ohne Leck, ein Dokumentationsfehler korrigiert (Trigger-Zahl). Vorher: β `/qa` PASS — Zwei-Personen-Durchlauf gefahren, fünf Tech-Design-Risiken geprüft, echter PDF-Druck, 4 Befunde; 2026-08-13 Requirements refined + Tech Design)

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

**Status: Deployed** (2026-08-19, Scope `alpha`) · zweiter Sub-Slice, baut auf dem deployten α auf.
`/backend` in Prod seit 2026-08-18 (Migration `20260818104358`, Live-Pentest 53/53, 0 Rückstände),
`/frontend` dieselbe Woche (Mängel-Fläche, Druckseite, Zähler je Gewerk, ein Nav-Eintrag; 9/9
Visual-Baselines unberührt), `/qa` **PASS** 2026-08-19 (0 Critical / 0 High / 0 Medium),
`/deploy` 2026-08-19 (Tag `v2.61.0-PROJ-45-beta`, PR #402 → main `740b16b`).
Scope `alpha`, weil AC-45β.18 per Nutzer-Entscheid nach δ verschoben ist (D-β1) und γ/δ/ε offen sind.

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

- [x] **AC-45β.1** Jedes Projektmitglied — auch mit Betrachterrolle — kann einen Mangel anlegen (L15).
- [x] **AC-45β.2** Pflicht sind Titel, Gewerk und Schweregrad; Ort, Beschreibung, Frist und Nachunternehmer sind optional (L13/L14).
- [x] **AC-45β.3** Auswählbar sind nur Gewerke und Abschnitte **dieses** Projekts; ein projektfremder Verweis wird serverseitig abgewiesen.
- [x] **AC-45β.4** Ein neu erfasster Mangel steht auf „offen" und ist ohne weiteren Schritt in der Liste sichtbar.

#### ST-45β.2 — Nachbesserung steuern
Als **Bauleitung** möchte ich Frist, Verantwortlichen und ausführenden Nachunternehmer setzen,
damit die Nachbesserung zugeordnet und terminiert ist.

- [x] **AC-45β.5** Nur Projektleitung/Bauleitung oder Mandanten-Administration ändert einen bestehenden Mangel; ein Betrachter kann nach dem Anlegen nichts mehr ändern (L15).
- [x] **AC-45β.6** Frist, Verantwortlicher und Nachunternehmer (aus PROJ-15) sind setz- und wieder entfernbar.
- [x] **AC-45β.7** Der Status folgt der Kette offen → in Bearbeitung → erledigt → geprüft; jeder Wechsel ist auditiert.
- [x] **AC-45β.8** Ein Mangel kann verworfen werden (etwa „kein Mangel"), mit Pflichtbegründung.

#### ST-45β.3 — Prüfen
Als **Bauleitung** möchte ich eine gemeldete Nachbesserung abnehmen oder zurückweisen,
damit „erledigt" nicht dasselbe bedeutet wie „nachgesehen".

- [x] **AC-45β.9** „Geprüft" setzt ausschließlich Projektleitung/Bauleitung oder Mandanten-Administration.
- [x] **AC-45β.10** Wer den Mangel auf „erledigt" gesetzt hat, kann ihn **nicht selbst** auf „geprüft" setzen; der Versuch wird serverseitig abgewiesen (L10).
- [x] **AC-45β.11** Eine Prüfung kann fehlschlagen und wirft den Mangel auf „in Bearbeitung" zurück, mit Pflichtbegründung.
- [x] **AC-45β.12** Der Verlauf zeigt jede Runde nachvollziehbar — wer wann fertigmeldete, wer wann prüfte oder zurückwies.

#### ST-45β.4 — Mängelanzeige herausgeben
Als **Bauleitung** möchte ich eine Mängelanzeige je Nachunternehmer erzeugen,
damit die Nachbesserung schriftlich und fristgebunden angefordert ist.

- [x] **AC-45β.13** Aus der Mängelliste lässt sich eine Anzeige erzeugen, gefiltert auf ein Gewerk oder einen Nachunternehmer.
- [x] **AC-45β.14** Die Anzeige ist eine chrome-lose Druckseite; der Browser druckt nach PDF (L11).
- [x] **AC-45β.15** Sie enthält je Mangel Titel, Beschreibung, Ort (falls gesetzt), Schweregrad und Nachbesserungsfrist, dazu Projekt- und Erstellungsangaben.
- [x] **AC-45β.16** Die Anzeige respektiert die Projektzugehörigkeit: sie zeigt ausschließlich Mängel, die der Aufrufer ohnehin sehen darf.

#### ST-45β.5 — Überfälliges sehen
Als **Bauleitung** möchte ich überschrittene Nachbesserungsfristen sofort erkennen,
damit ich nachhake, bevor die Gewährleistung zum Thema wird.

- [x] **AC-45β.17** Ein Mangel mit überschrittener Frist und nicht abschließendem Status ist in der Liste als überfällig gekennzeichnet.
- [ ] **AC-45β.18** Überfällige Mängel erscheinen in der bestehenden Engpass-Sicht aus PROJ-103, ohne dass dort ein zweiter Mechanismus entsteht (L12).
- [x] **AC-45β.19** Die Liste ist nach Gewerk, Abschnitt, Status, Schweregrad und Überfälligkeit filterbar.

#### ST-45β.6 — Sichtbarkeit
- [x] **AC-45β.20** Mängel erscheinen nur in Bauprojekten mit aktivem Bau-Modul; bei abgeschaltetem Modul antwortet der Server gleichbleibend abweisend und die Oberfläche zeigt den neutralen „nicht aktiv"-Hinweis.
- [x] **AC-45β.21** Ein Gewerk oder Abschnitt, an dem Mängel hängen, lässt sich nicht aus dem Projekt entfernen; die Meldung benennt die betroffenen Mängel (L16).
- [x] **AC-45β.22** Mandanten- und Projekttrennung gilt unverändert: fremde Mängel sind unsichtbar, auch aggregiert.

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

### Offene Fragen für `/architecture` — **alle vier beantwortet 2026-08-17**, siehe Tech Design (β)

- **Q-β1 — L15 weicht vom Hausmuster ab.** Betrachter dürfen sonst nirgends anlegen. Die Umsetzung braucht eine differenzierte Schreibregel (Anlegen ja, Ändern nein) statt der üblichen einen. **CIA-relevant**, weil es ein produktweit etabliertes Rechte-Muster aufweicht.
- **Q-β2 — Wo lebt das Vier-Augen-Gate?** In einer Statuswechsel-RPC wie bei `dd_findings`, oder in einer eigenen Prüf-Tabelle wie bei den Freigaben aus PROJ-105? Die Rückweisung mit Begründung und der mehrrundige Verlauf (AC-45β.12) sprechen für Ersteres mit einer Ereignis-Tabelle daneben.
- **Q-β3 — Wie kommt die Überfälligkeit in PROJ-103?** Dessen Auswertung ist heute auf `work_items` gebaut. Mängel sind ein zweiter Typ — erweitert die bestehende Funktion oder liefert eine zweite, die daneben gestellt wird?
- **Q-β4 — Sperren statt `SET NULL` (L16).** In α tragen Arbeitspakete und Risiken `SET NULL`. Zwei Regeln auf derselben Fläche sind erklärungsbedürftig; zu prüfen ist, ob `RESTRICT` auf dem Projekt-Gewerk mit dem bestehenden Entfernen-Pfad kollidiert.

---

## Tech Design (β) — Mängelmanagement, 2026-08-17

Gegen den **deployten** Stand geerdet, nicht gegen die Anforderungsfassung: Live-Prod-Katalog
(Spalten, Fremdschlüssel-Regeln, Trigger, Registerstände), die sieben α-Routen und die geteilte
Navigations-Registry. Zwei Messungen haben den Zuschnitt geändert, bevor eine Zeile Entwurf entstand.

### Der Review-Pass

`.claude/rules/continuous-improvement.md` macht eine CIA-Bewertung hier verbindlich (Q-β1 weicht von
einem produktweit etablierten Rechte-Muster ab). CLAUDE.md hält fest, dass die Regel „about the review
happening, not about which tool performs it" ist, und benennt den Halt-und-Frage-Checkpoint mit
strukturierter Ausgabe als gleichwertigen Weg. So gelaufen: Prüfung gegen Live-Stand und α-Code,
die zwei echt offenen Entscheidungen dem Nutzer vorgelegt statt einseitig entschieden.

### Zwei Befunde, die den Zuschnitt geändert haben

**B-β1 — L12 war nicht baubar.** Die Engpass-Sicht aus PROJ-103 trägt `requiresProjectType: "ma"`
(`src/lib/method-templates/index.ts:179-185`), und `filterSectionsByProjectType` vergleicht mit
striktem `===` auf **einem** `ProjectType` (`routing.ts:180`). In einem Bauprojekt existiert diese
Fläche nicht. Verschärfend: die Out-of-Scope-Tabelle dieser Spec weist die PROJ-103-Anbindung
ohnehin **δ** zu. **Nutzer-Entscheid: AC-45β.18 wandert nach δ.** β liefert Überfälligkeit dort, wo
gehandelt wird — Kennzeichnung und Filter in der Mängelliste (AC-45β.17/.19) plus ein Zähler je
Gewerk auf der α-Gewerke-Fläche. Kein Eingriff in die geteilte Navigations-Registry, kein Umbau der
Auswertungsfunktion, keine gebrochenen PROJ-103-Pentest-Zählungen.

**B-β2 — die Rechte weichen in *beide* Richtungen ab.** Die Anforderung liest sich als eine
Aufweichung (Betrachter dürfen anlegen), ist aber zugleich eine Verschärfung: „Projektleitung/
Bauleitung oder Mandanten-Administration" entspricht `admin | lead` und schließt den Projekt-`editor`
aus, den das Hausrecht `edit` einschließt (`src/lib/projects/access.ts`). **Nutzer-Entscheid:
so gewollt** — gewährleistungsrelevante Fristen liegen in einer Hand.

| Handlung | Ebene | Wer |
|---|---|---|
| Mangel anlegen | `view` | jedes Projektmitglied, auch Betrachter (L15) |
| Mangel ändern, Frist/Verantwortlicher/Nachunternehmer setzen | `manage_members` | Mandanten-Admin oder Projektleitung |
| Fertigmelden, prüfen, zurückweisen, verwerfen | `manage_members` | Mandanten-Admin oder Projektleitung |
| Mängel lesen | `view` | jedes Projektmitglied |

### Die vier offenen Fragen, beantwortet

**Q-β1 — kein Rechte-Muster wird aufgeweicht, weil es an dieser Stelle keins gibt.** Die Vorlage
`dd_findings` trägt live **ausschließlich Lese-Regeln** (zwei SELECT-Policies, keine einzige für
INSERT/UPDATE/DELETE) — geschrieben wird nur über Funktionen. Damit ist „Betrachter darf anlegen"
keine gelockerte Zugriffsregel, sondern eine Rollenprüfung **innerhalb** der Anlege-Funktion. Nichts
Bestehendes wird angefasst, die Abweichung endet an dieser einen Tabelle, und ein späterer Leser
sieht die Regel an der Stelle, an der sie gilt. Der Preis ist Disziplin: es darf **keine**
Schreib-Policy entstehen, sonst wandert die Autorität an zwei Orte.

**Q-β2 — Statuswechsel-Funktion mit Ereignis-Tabelle daneben, nicht die Freigabe-Maschinerie aus
PROJ-105.** Deren Tabellen modellieren *mehrstufige Freigabeketten mit benannten Freigebern*; β hat
genau ein Tor und eine Rolle — das wäre Aufwand ohne Gegenwert. Entscheidend ist, dass PROJ-105 seinen
**Verlauf ebenfalls aus einer eigenen Ereignis-Tabelle** bedient statt aus dem zentralen Protokoll
(dortige Auflage H3, bewusst, um das Audit-Trio nicht neu bauen zu müssen). Genau das trägt hier den
mehrrundigen Verlauf aus AC-45β.12.

**Q-β3 — entfällt in β** (siehe B-β1). Die Auswertungsfunktion bleibt unberührt; ihre Gestalt ist
dokumentiert, damit δ nicht neu erheben muss: `project_task_bottlenecks` ist `language sql`, STABLE,
INVOKER, liest **allein** `work_items` und liefert `tasks[] · top_bottlenecks[] · summary{}`. Jeder
Eintrag trägt `kind` — einen Arbeitspaket-Typ, den ein Mangel nicht hat. δ ergänzt deshalb einen
**eigenen Schlüssel** statt Mängel unter `tasks` zu mischen, sonst brechen Typisierung im Frontend
und der CSV-Export.

**Q-β4 — Sperren am Fremdschlüssel, Meldung in der Route; die Kollision ist real und benannt.**
Live gemessen: `work_items.trade_id`, `risks.trade_id` und `work_items.section_id` stehen auf
`SET NULL`, `project_construction_trades.trade_id` dagegen schon auf `RESTRICT` (die Katalog-Sperre
aus α). Beide projektbezogenen Entfernen-Pfade sind heute **schlichte Löschungen ohne Vorprüfung**,
die jeden Fehler außer `42501` auf **500 `delete_failed`** abbilden
(`construction-trades/[ptid]/route.ts:105-108`, `construction-sections/[sid]/route.ts:119-122`).
Ein `RESTRICT` für Mängel liefe dort also in einen 500 mit rohem Datenbanktext — AC-45β.21 verlangt
aber eine Meldung, die die betroffenen Mängel **benennt**. Die Lösung liegt ein Verzeichnis weiter:
die Katalog-Route fängt genau diesen Fall ab, fragt die Blockierer nach und antwortet 409
(`construction-trades/[id]/route.ts:105-120`). Dieses Muster wird auf die zwei Projekt-Routen gehoben —
Löschung versuchen, `23503` abfangen, Mängel benennen, 409. Kein Vorab-Zählen: das kostet auf dem
Normalpfad eine Abfrage und wäre zwischen Prüfung und Löschung ohnehin nicht dicht.

**Der nicht offensichtliche Teil davon:** `construction_sections.parent_id` ist `CASCADE`. Das Löschen
eines Oberabschnitts reißt den Teilbaum mit, also kann ein Mangel an einem **Enkel** die Löschung der
Wurzel blockieren. Die benennende Abfrage muss deshalb den ganzen Teilbaum absuchen, nicht den einen
Knoten — die in α gebaute `path`-Spalte macht das billig.

### Weitere Befunde aus der Erdung

**B-β3 — der Nachunternehmer existiert schon, eine Ebene höher.** `project_construction_trades`
trägt live ein `vendor_id` (α, `SET NULL`). Der Mangel bekommt **trotzdem ein eigenes** Feld,
vorbelegt aus dem Gewerk: gewährleistungsrechtlich zählt, wer **zum Zeitpunkt des Mangels**
ausgeführt hat, und die Zuordnung am Gewerk darf sich später ändern. Ein abgeleiteter Wert würde
alte Mängelanzeigen rückwirkend umschreiben. Die Anzeige filtert ausschließlich über das Feld am
Mangel — eine Wahrheit für „wer wird zur Nachbesserung aufgefordert".

**B-β4 — keine Vertraulichkeitsstufe.** Die Vorlage `dd_findings` trägt `confidentiality_level`;
Mängel bekommen es **nicht**. α hat das für dieselbe Fläche schon entschieden und begründet: die
Freischaltungs-Oberfläche ist M&A-gegatet, eine Bauleitung, die die Stufe versehentlich anhebt, käme
an die eigenen Daten nicht mehr heran. Mandanten- und Projekttrennung tragen die Abgrenzung
(AC-45β.22).

**B-β5 — die Leer-Semantik ist eine bekannte Falle.** Fünf Felder müssen „setz- **und wieder
entfernbar**" sein (AC-45β.6). PROJ-122 hat hier live einen Defekt produziert: ein weggelassener Wert
wurde als „unverändert" gelesen, eine zurückgezogene Position überlebte stillschweigend. Die
Änderungs-Funktion erhält deshalb **ausdrückliche Leeren-Schalter** je Feld (Muster
`update_dd_finding`, das genau dafür schon einen trägt) — nicht weglassen-heißt-leeren, nicht
Leerstring-heißt-leeren.

**B-β6 — „überfällig" wird präzise definiert, weil der Wortlaut es offenlässt.** AC-45β.17 sagt
„nicht abschließender Status". Als überfällig gilt ein Mangel mit verstrichener Frist in **offen**
oder **in Bearbeitung**. Ausdrücklich **nicht** in „erledigt": dort hat der Nachunternehmer
fertiggemeldet und es wartet die Prüfung — die Verspätung läge bei der Bauleitung, und die Liste
würde den Falschen anzeigen. Damit dort nichts verrottet, führt die Liste **„wartet auf Prüfung"**
als eigenes Signal. Verworfen und geprüft sind abschließend (Edge Case bestätigt).

**B-β7 — das Vier-Augen-Tor kann in kleinen Projekten klemmen.** Fertigmelden *und* Prüfen liegen
beide bei `admin | lead` (B-β2), und AC-45β.10 verbietet dieselbe Person für beides. Ist die
Projektleitung gleichzeitig die einzige Mandanten-Administration, erreicht ein Mangel „geprüft" nie.
Bewusst **kein Umgehungspfad** (PROJ-119-Haltung: der legitime Weg ist eine zweite berechtigte
Person, nicht ein stiller Übersteuerungsschalter). `/qa` prüft den Fall ausdrücklich; tritt er beim
Pilot auf, ist die Antwort eine zweite Leitung, nicht eine Aufweichung.

### Komponentenstruktur

```
Projektraum › Mängel                      (neue Fläche, Bau-Projekttyp + Bau-Modul)
+-- Kopfzeile
|   +-- "Mangel erfassen"                 sichtbar für JEDES Projektmitglied (L15)
|   +-- "Mängelanzeige erzeugen"          nur Leitung/Admin
+-- Filterleiste                          Gewerk · Abschnitt · Status · Schweregrad · überfällig
+-- Mängelliste
|   +-- Zeile je Mangel
|       +-- Schweregrad-Abzeichen         gering · erheblich · gravierend
|       +-- Status-Abzeichen              offen · in Bearbeitung · erledigt · geprüft · verworfen
|       +-- Frist                         rot bei überfällig, Hinweis "wartet auf Prüfung"
|       +-- Gewerk · Abschnitt · Nachunternehmer
|       +-- Zeilenaktionen                nur Leitung/Admin
+-- Erfassen-Dialog                       Titel · Gewerk* · Schweregrad* | Ort · Beschreibung · Frist · Nachunternehmer
+-- Detail-Bereich (Leitung/Admin)
|   +-- Bearbeiten                        mit Leeren je Feld (B-β5)
|   +-- Statuswechsel                     Fertigmelden · Prüfen · Zurückweisen (Pflichtbegründung) · Verwerfen (Pflichtbegründung)
|   +-- Verlauf                           jede Runde, aus der Ereignis-Tabelle (AC-45β.12)
+-- Zustände                              Laden · leer · Fehler · Modul nicht aktiv

Projektraum › Gewerke                     (α-Fläche, additiv erweitert)
+-- je Gewerk: Zähler "N Mängel, davon M überfällig"

/projects/<id>/maengelanzeige/print       (chrome-lose Druckseite, außerhalb der App-Hülle)
+-- Kopf                                  Projekt · Gewerk oder Nachunternehmer · Erstellungsdatum · Ersteller
+-- je Mangel                             Titel · Beschreibung · Ort (weggelassen falls leer) · Schweregrad · Frist
```

### Datenmodell (Klartext)

**Ein Mangel** trägt: Mandant und Projekt · Titel (Pflicht, 1–200 Zeichen) · Beschreibung (frei) ·
**Gewerk** (Pflicht, Verweis auf das Projekt-Gewerk aus α) · **Ort** (optional, Verweis auf einen
Bauabschnitt) · **Schweregrad** (Pflicht, drei Stufen) · **Status** (fünf Werte) ·
Nachbesserungsfrist (optional) · Verantwortlicher (optional) · **Nachunternehmer** (optional, eigener
Verweis auf die Lieferanten-Stammdaten, vorbelegt aus dem Gewerk) · fortlaufende Nummer je Projekt
(damit eine Mängelanzeige eindeutig referenzierbar ist) · wer zuletzt fertiggemeldet hat und wann
(trägt das Vier-Augen-Tor) · Ersteller und Zeitstempel.

**Ein Mangel-Ereignis** trägt: den Mangel · die Art (angelegt · fertiggemeldet · geprüft ·
zurückgewiesen · verworfen · wieder aufgenommen) · Status davor und danach · die Begründung (Pflicht
bei Zurückweisung und Verwerfen) · Akteur und Zeitpunkt. Diese Zeilen sind **unveränderlich** — sie
sind der Verlauf, nicht eine Kopie davon.

**Aufbewahrung.** Fremde Mängel sind unsichtbar, auch in Zählern. Geschrieben wird ausschließlich
über Funktionen; Lesen erlaubt die Projektmitgliedschaft. Ein Gewerk oder Abschnitt mit Mängeln ist
nicht entfernbar (Sperre am Verweis); ein gelöschter Nachunternehmer lässt den Verweis leer und den
Mangel bestehen (Edge Case). Ein nur **deaktiviertes** Gewerk behält seine Mängel — es entfällt nur
aus der Neuauswahl.

### Technische Entscheidungen und warum

| Entscheidung | Warum |
|---|---|
| Eigene Bau-Tabelle statt Arbeitspaket-Art | L9. Ein Mangel ist kein geplantes Arbeitspaket; im Backlog verfälscht er Velocity, Burndown und die WBS-Rollups. |
| Schreiben nur über Funktionen, keine Schreib-Regeln | Vorlage `dd_findings` live so gebaut; macht die abweichende Rechte-Regel (B-β2) zu **einer** prüfbaren Stelle statt zu vier Policy-Ausdrücken. PROJ-Y-107c belegt, wie fehleranfällig Schreib-Bedingungen sind. |
| Verlauf in eigener Ereignis-Tabelle | Trägt Mehrfach-Rückweisung (AC-45β.12) und vermeidet den Neubau der geteilten Audit-Funktionen — die sind die historisch am häufigsten überschriebenen Objekte im Projekt. PROJ-105-Präzedenz. |
| Status **und** Feld-Protokoll zusätzlich | AC-45β.7 verlangt Auditierung; die Statusspalte kommt in die Feld-Whitelist, damit der Wechsel auch im zentralen Protokoll steht — der Verlauf-Reiter liest trotzdem die Ereignis-Tabelle. |
| Deutsche Schlüsselwerte | α hat für dieselbe Fläche deutsche Werte gewählt (`gruen/gelb/rot`); die Anforderung benennt die Stufen deutsch. Anzeigetexte kommen aus einer Zuordnung, nicht aus der Datenbank. |
| Druckseite statt Renderer | L11. Das Muster steht (PROJ-131/132): eigene Route außerhalb der App-Hülle, Sitzungs-Client — **nie** Dienst-Schlüssel, sonst zeigt die Anzeige mehr als der Aufrufer sehen darf (AC-45β.16). Kein neues Paket. |
| Kein Versand | L11. Der Nachunternehmer ist selten Plattformnutzer; die PROJ-13-Ausgangspost dafür zu belasten wäre eine Zusage ohne Empfänger. |
| Nav wie α | Beide α-Flächen tragen Projekttyp **und** Modulschalter; β erbt das wörtlich (AC-45β.20) und fügt der geteilten Registry genau einen Eintrag hinzu. |

### Register-Eingriffe (live gemessen, Stand 2026-08-17)

Die Mangel-Tabelle tritt den drei Registern bei, die α ebenfalls bedient (live bestätigt): Objektarten
**93 → 94**, Feld-Whitelist **75 → 76**, Lese-Tor **62 → 63**. Die Ereignis-Tabelle bleibt **außen** —
sie ist selbst das Protokoll, ein zweites Mitschreiben verdoppelte es (PROJ-130-β hat Doppel-
Protokollierung genau dafür ausgeschlossen). Alle drei Eingriffe als **Anker-Ersetzung aus der
Live-Definition** mit Treffer-Eindeutigkeit, Nachprüfung und Rechte-Neuvergabe in derselben
Migration — PROJ-Y-122a war der Fall, in dem eine fehlende Nachprüfung ein stilles Nichts erzeugte,
und PROJ-Y-115c der, in dem ein wörtlicher Anker in der frisch gebauten Datenbank nicht traf
(Anker daher whitespace-tolerant).

### Pflicht-Härtungskriterien (blockierend)

- [x] **AC-45βH-1** Mandanten- und Projekttrennung: fremde Mängel unsichtbar, auch in jedem Zähler.
- [x] **AC-45βH-2** Betrachter kann anlegen, aber **nicht** ändern, fertigmelden, prüfen oder verwerfen — serverseitig, nicht nur in der Oberfläche; ein Projekt-`editor` ebenfalls nicht (B-β2).
- [x] **AC-45βH-3** Vier-Augen: derselbe Akteur kann nicht fertigmelden und prüfen; abgewiesen auf **allen** Schreibwegen, auch bei mehreren Runden.
- [x] **AC-45βH-4** Kein Schreibweg an den Funktionen vorbei: direktes Einfügen und Ändern scheitert, auch als Mandanten-Administration.
- [x] **AC-45βH-5** Ereignis-Zeilen sind unveränderlich und nicht löschbar.
- [x] **AC-45βH-6** Projektfremdes Gewerk oder Abschnitt wird abgewiesen (PROJ-Y-45a-Wächter sinngemäß, hier für Mängel).
- [x] **AC-45βH-7** Entfernen-Sperre greift **und** benennt: Gewerk mit Mangel → 409 mit Nennung; Oberabschnitt, dessen **Enkel** einen Mangel trägt → ebenfalls 409, kein 500.
- [x] **AC-45βH-8** `anon` hat auf keiner neuen Funktion Ausführungsrecht.
- [x] **AC-45βH-9** Pflicht-Live-Pentest gegen Prod, Rollback-Muster, **0 Rückstände**; Nicht-Admin muss synthetisiert werden, weil in Prod jedes Mandanten-Mitglied Admin ist und das Lese-Tor für Admins kurzschließt — ein Smoke unter Admin wäre falsch-grün.
- [x] **AC-45βH-10** Regressionen wörtlich grün: α-Pentest (16/16), PROJ-Y-45a-Wächter (9/9), PROJ-103-Pentest (unberührt, belegt dass B-β1 nichts angefasst hat).
- [x] **AC-45βH-11** Druckseite ohne Sitzung → Anmelde-Umleitung, kein Mangel-Inhalt im Rumpf; mit Sitzung nur eigene Projekte.
- [x] **AC-45βH-12** Nicht-Bau-Projekte und abgeschaltetes Modul verhalten sich byte-gleich zu vorher.

### Risiken für `/qa`

1. **Feld leeren.** Jedes der fünf optionalen Felder einmal setzen und wieder leeren; überlebt der alte Wert, ist es der PROJ-122-Defekt (B-β5).
2. **Vier-Augen unter einer Person.** B-β7 — reproduzieren und als Befund festhalten, nicht wegdrücken.
3. **Anker-Ersetzung.** Nach der Migration alle Geschwister-Zweige der drei Register zählen; vier Nachbar-Slices arbeiten an denselben Objekten.
4. **Teilbaum-Sperre.** AC-45βH-7 mit einem Mangel am Enkel, nicht am Kind — der naive Test greift daneben.
5. **Überfälligkeits-Grenzen.** Frist heute, Frist gestern, Frist gestern aber „erledigt" (B-β6).

### Abweichungen und Folgearbeit

- **D-β1** AC-45β.18 (PROJ-103-Anbindung) auf **PROJ-45-δ** verschoben — Nutzer-Entscheid nach B-β1. Zurückgestellte Original-Anforderung → Registrierung in `features/OPEN-DEFERRED-STATUS.md` Pflicht. β kann damit **nicht** `full` werden; als Sub-Slice ohnehin `alpha`.
- **D-β2** Änderungsrecht ohne Projekt-`editor` — strenger als das Hausmuster, Nutzer-Entscheid (B-β2).
- **D-β3** Keine Vertraulichkeitsstufe (B-β4), abweichend von der Vorlage `dd_findings`, konsistent mit α.
- **D-β4** Kein Umgehungspfad für das Vier-Augen-Tor (B-β7).
- **PROJ-Y-45b (neu, klein)** α bildet auf beiden projektbezogenen Entfernen-Pfaden jeden Datenbankfehler außer `42501` auf **500** ab, obwohl einen Verzeichnis weiter das 409-Muster steht. β behebt das für Mängel; für andere künftige Verweise bleibt es bestehen.

### Abhängigkeiten

**Kein neues Paket.** Druckseite, Baumauswahl, Tabellen und Dialoge kommen aus dem Bestand
(shadcn/ui, `react-arborist` für den Abschnitts-Picker aus α). Kein neuer Umgebungswert, kein Cron.
Eine Migration; die Anwendungsschicht bringt eine Fläche, eine Druckseite und die additive Erweiterung
zweier α-Routen.

### Reihenfolge

**`/backend` → `/frontend` → `/qa`** — abweichend von der Standard-Empfehlung des Skills, wie in α und
aus demselben Grund: die Fläche ist ohne Statuswechsel-Funktionen und Ereignis-Verlauf nicht sinnvoll
baubar (PROJ-109-Präzedenz).

---

## Implementierungsnotizen — /backend β (2026-08-18)

**Datenbank live in Prod.** Eine Migration, `20260818104358_proj45_beta_construction_defects`
(Dateiname trägt die **registrierte Prod-Version**; der MCP vergab sie, die Datei wurde nach
PROJ-134 nachbenannt). Zwei Tabellen, acht Funktionen, **fünf** Trigger, zwei Lese-Policies, die drei
Register-Eingriffe, siebzehn Post-Condition-Gruppen. Alles atomar in einem Zug; die Post-Conditions
liefen mit und meldeten „alle Post-Conditions erfuellt".

**Register-Eingriffe genau wie im Tech Design vorhergesagt, live nachgemessen:**
Objektarten **93 → 94**, Feld-Whitelist **75 → 76**, Lese-Tor **62 → 63**. Alle drei als
whitespace-tolerante Anker-Ersetzung auf der Live-Definition, jeweils mit
**Treffer-Eindeutigkeitsprüfung** (Abbruch bei ≠ 1 statt Raten), Nachprüfung nach dem `execute`,
namentlicher Geschwister-Gegenprobe und Rechte-Neuvergabe. Die Ereignis-Tabelle ist bewusst
**draussen** geblieben (nachgeprüft: sie steht in keinem der drei Register) — sie *ist* das
Protokoll, ein zweites Mitschreiben verdoppelte es.

**Vier Entscheidungen, die aus einer Messung statt aus einer Annahme kamen.**

1. **`NO ACTION` statt `RESTRICT` für die zwei Sperren (L16).** Beide liefern für das *gezielte*
   Entfernen `23503`, also genau die von AC-45β.21 verlangte Wirkung. Der Unterschied zeigt sich
   beim Löschen eines ganzen Projekts, wo Gewerk-Zuordnung **und** Mangel in **derselben** Anweisung
   kaskadiert werden: `RESTRICT` prüft sofort, `NO ACTION` am Ende der Anweisung. In zurückgerollten
   Transaktionen gegengeprüft — unter `RESTRICT` entscheidet die **Feuerreihenfolge der RI-Trigger**
   über Erfolg oder Fehlschlag, das Ergebnis hing an der Erzeugungsreihenfolge der Tabellen;
   `NO ACTION` war in beiden Reihenfolgen robust. Ein `RESTRICT` hätte also einen neuen
   Projekt-Hard-Delete-Blocker gebaut, ausgerechnet in der Woche, in der PROJ-148 diese Klasse
   behoben hat.
2. **Die Ausnahme im Unveränderlichkeits-Trigger ist selbsttragend, nicht geerbt.** Prod trägt einen
   Helfer `_project_teardown_active()`, den `enforce_deliverable_approval_event_immutability` nutzt —
   aber **keine einzige Migrationsdatei erzeugt ihn** (nachgezählt: 0 Treffer in
   `supabase/migrations`). Ihn aufzurufen hätte die Migration im frisch aus den Dateien gebauten
   Schema-Drift-Wächter gebrochen. Die Ausnahme lautet daher schlicht „der Mangel existiert nicht
   mehr", was ohne Zusatzobjekt auskommt; empirisch bestätigt, dass ein von der Eltern-Kaskade
   abgeräumtes Kind seinen Elternteil bereits als gelöscht sieht. Für Anwendungsnutzer ist der Zweig
   **unerreichbar** — `construction_defects` hat gar keine DELETE-Policy. Als Nebenbefund ist damit
   eine **Prod/Repo-Divergenz** belegt (Klasse PROJ-Y-130f), siehe Folgearbeit.
3. **Der Unveränderlichkeits-Wächter ist `SECURITY DEFINER`, anders als die PROJ-105-Vorlage.** Seine
   Ausnahme hängt an „der Mangel ist weg"; als INVOKER könnte RLS-Unsichtbarkeit sich als „weg"
   tarnen. Die Prüfung darf nicht von der Sichtbarkeit des Aufrufers abhängen.
4. **Ein siebter Ereignis-Typ.** Die Klartext-Liste des Tech Designs nennt sechs, aber AC-45β.7
   verlangt die Kette `offen → in Bearbeitung`, für die keiner davon passt. `wieder_aufgenommen`
   dafür zu überladen hätte zwei verschiedene Sachverhalte unter einen Namen gelegt; ergänzt wurde
   `in_arbeit_genommen` (Abweichung D-β6).

**Der Nachunternehmer wird beim Anlegen aus dem Gewerk vorbelegt** (B-β3), danach ist er
eigenständig. Ein *abgeleiteter* Wert hätte alte Mängelanzeigen rückwirkend umgeschrieben, sobald
die Zuordnung am Gewerk wechselt.

**Fünf Leeren-Schalter, einzeln bewiesen (B-β5).** Die PROJ-122-Defektklasse ist in drei Vektoren
eingezäunt: alle fünf Felder setzen, dann **weglassen** (Wert bleibt), dann **Schalter** (Wert wird
leer). Ohne den mittleren Vektor wäre „weglassen heisst leeren" unentdeckt geblieben.

**Live-Pentest `tests/sql/PROJ-45-beta-construction-defects-pentest.sql` — 53/53 PASS gegen Prod,
0 Rückstände** (über neun Zähler gegengeprüft: beide neuen Tabellen 0, Fixture-Gewerke 0,
-Abschnitte 0, -Nachunternehmer 0, Audit-Zeilen 0, synthetisierte Mitgliedschaften 0, Projektbestand
des Testmandanten unverändert 20). Die tragenden Vektoren:

- **D — der Projekt-`editor` kann NICHT ändern.** Das ist die Richtung, in die diese Slice *strenger*
  ist als das Hausrecht `edit`, und sie ist damit belegt statt behauptet. Zugleich **D2**: anlegen
  darf er weiter, denn er ist Projektmitglied.
- **A — der Betrachter DARF anlegen.** Die einzige Aufweichung (L15), und sie sitzt in der
  Anlege-Funktion, nicht in einer Policy.
- **K — Vier-Augen greift in RUNDE 2.** Nach Rückweisung meldet ein *anderer* fertig; die Prüfung
  liest `reported_done_by` neu und sperrt jetzt ihn. Ein Test nur über Runde 1 hätte eine Sperre
  bestätigt, die beim zweiten Durchgang hätte durchfallen können.
- **U/V — die Teilbaum-Sperre.** Der Mangel hängt am **Enkel**; das Löschen der **Wurzel** scheitert
  mit `23503`. Vektor **V** zeigt zusätzlich, dass die naive Abfrage auf den einen Knoten **0**
  Treffer liefert — genau die Falle, die das Tech Design für `/qa` benannt hat.
- **Y — Aggregat-Leck-Probe.** Der Fremde erhält aus der INVOKER-Auswertung `total = 0`, während in
  Wahrheit 1 Mangel existiert; **Y2** ist die Gegenprobe, dass der Berechtigte die Wahrheit sieht
  (kein Blanket-Deny).
- **W1–W4 — kein Schreibweg an den Funktionen vorbei, geprüft als MANDANTEN-ADMIN:** direktes
  `INSERT` und Ereignis-`INSERT` → `42501`, `UPDATE`/`DELETE` → **0 Zeilen**.
- **S2 — der lesende Nutzer ist nachweislich kein Admin.** Ohne diesen Vektor wäre der
  Audit-Lesetest falsch-grün, weil `can_read_audit_entry` für Admins kurzschliesst.
- **Z — der Projekt-Hard-Delete wird von der Mängel-Historie blockiert** (`42501`).
  **Umgedreht durch PROJ-Y-148d am 2026-08-19**; bis dahin gelang er, und das war die korrekte
  Beschreibung des damaligen Stands. Die PROJ-148-Regression bleibt, nur in der anderen Richtung: ein
  Bauprojekt **ohne** Mängel muss weiter löschbar sein — geprüft als Vektor B in
  `tests/sql/PROJ-Y-148d-defect-events-no-cascade-exit-pentest.sql`.

**Ein Befund beim ersten Lauf, der einen Vektor falsch-grün gemacht hätte:** es gibt **zwei**
Mandanten mit dem Namen `[E2E] Projektplattform Test`. Der als zweiter Akteur gewählte Nutzer ist
Admin des **anderen** und im Zielmandanten völlig unberechtigt — der Vier-Augen-Vektor brach mit
`42501`. Er ist jetzt ausdrücklich Projekt-`lead`, was als Nebeneffekt die
`is_project_lead`-Hälfte der Rechteregel prüft und nicht nur `is_tenant_admin`.

**Regressionen wörtlich grün (AC-45βH-10), 0 Rückstände:**
α-Pentest **16/16** (Block 1 elf, Block 2 fünf — Zahlen und Meldungen identisch zur Dokumentation),
PROJ-Y-45a-Smoke **9/9**, **PROJ-103 A–G 7/7** (belegt unabhängig, dass B-β1 die Engpass-Auswertung
nicht angefasst hat).

**Advisors 0 ERROR** auf beiden Achsen (Security 144 WARN, Performance 15 WARN / 293 INFO). Die drei
slice-bezogenen Security-WARN sind die drei Schreib-RPCs als `authenticated`-ausführbare
`SECURITY DEFINER`-Funktionen — genau die Kategorie, die α ebenfalls trägt und die den Schreibweg
überhaupt erst möglich macht (141 Bestandsfälle derselben Art); jede prüft die Rolle intern. Der
einzelne `anon_security_definer`-WARN gehört `seed_risk_categories_if_empty` und ist Bestand —
Pentest-Vektor **G1** belegt, dass `anon` auf keiner der acht neuen Funktionen EXECUTE hat. Die acht
slice-bezogenen Performance-Meldungen sind INFO: fünf `unindexed_foreign_keys` auf
Personen-Verweisen (`created_by`, `reported_done_by`, `responsible_user_id`, `actor_id`) — die von
PROJ-69 ausdrücklich als „skip/delete-rare" triagierte Klasse, keine liegt auf einem Leseweg — und
drei `unused_index`, was bei 0 Zeilen in Prod zu erwarten ist.

### Abweichungen vom Tech Design (β)

- **D-β5 — die Ausnahme im Unveränderlichkeits-Trigger. ~~Abweichung~~ → aufgelöst am 2026-08-19
  durch PROJ-Y-148d; AC-45βH-5 ist jetzt wörtlich erfüllt.**
  Ursprünglich umgesetzt: `42501` für `UPDATE` und für jedes `DELETE`, solange der Mangel existiert;
  wurde die Zeile von der Kaskade ihres eigenen Mangels abgeräumt, durfte sie gehen. Begründet war das
  mit „über die Anwendung unerreichbar (keine DELETE-Policy auf `construction_defects`)" und damit,
  keine neue Instanz der von PROJ-Y-148a geführten Blocker-Klasse anzulegen.
  **Beide Gründe haben sich als nicht tragend erwiesen:** die Unerreichbarkeit gilt für den *direkten*
  Weg, nicht für die Kaskade `projects → construction_defects → construction_defect_events`, die keine
  Policy braucht — und da eine Kaskade den Eltern-Mangel zuerst entfernt, griff die Ausnahme bei
  **jedem** Projekt-Abriss, nicht nur im Randfall. Der zweite Grund entfiel, als PROJ-Y-148a am
  2026-08-19 **Variante 1** wählte: dort ist die Blockade die gewollte Antwort und wird lediglich
  ehrlich kommuniziert (422 mit benannter Ursache statt 500). Der Ausweg ist deshalb entfernt
  (Migration `20260819140000`), die Mängel-Historie überlebt den Projekt-Abriss, und
  `construction_defect_events` blockt den Hard-Delete wie ihre vier Geschwister-Inseln.
  Pentest Q1/Q2 belegt die Sperre; **Z prüft jetzt die Blockade statt der Ausnahme**.
- **D-β6 — siebter Ereignis-Typ `in_arbeit_genommen`** (Begründung oben).
- **D-β7 — `fertigmelden` ist auch direkt aus `offen` erlaubt.** AC-45β.7 beschreibt die Kette,
  verbietet das Überspringen aber nicht; ein kleiner, sofort behobener Mangel soll nicht durch einen
  Pflicht-Zwischenschritt laufen.
- **D-β8 — die Überfälligkeitsregel steht zweimal**, einmal als SQL-Prädikat
  (`_construction_defect_is_overdue`, Autorität für die Zähler) und einmal als reine TS-Funktion für
  die Listen-Anzeige. Eine gemeinsame Quelle über die Sprachgrenze gibt es nicht; beide Seiten sind
  mit denselben Grenzfällen gepinnt (heute / gestern / gestern-aber-erledigt).
- **D-β9 — die Routen gaten auf `view`, nicht auf `manage_members`.** Die verschärfte Regel lebt
  ausschliesslich in den Funktionen, damit sie *eine* prüfbare Stelle bleibt (Q-β1). Eine zweite
  Prüfung in der Route wäre eine zweite Wahrheit, die driften kann.
- **AC-45β.18 bleibt nach δ verschoben** (D-β1, unverändert) — zurückgestellte
  Original-Anforderung, registriert in `features/OPEN-DEFERRED-STATUS.md`.

### Nicht in dieser Slice gebaut

Oberfläche, Mängelanzeige-Druckseite und Zähler auf der α-Gewerke-Fläche gehören zu `/frontend`;
die Datenbank- und Routenschicht liefert alles, was sie brauchen (`construction_defect_summary`
liefert die Zähler je Gewerk bereits). `/qa` steht aus.

### Fremde Befunde (nicht diese Slice)

- **Prod/Repo-Divergenz, Klasse PROJ-Y-130f:** `_project_teardown_active()` und die entschärfte
  Fassung von `enforce_deliverable_approval_event_immutability` existieren in Prod, werden aber von
  **keiner** Migrationsdatei erzeugt. Eine frisch aus den Dateien gebaute Datenbank hat sie nicht.
  Kein Sicherheitsbefund, aber eine echte Divergenz — eigener Followup.
- **PROJ-45-α:** die zwei projektbezogenen Entfernen-Pfade bilden weiterhin jeden Datenbankfehler
  ausser `42501` auf **500** ab. β behebt das für Mängel (409 mit Nennung); für andere künftige
  Verweise bleibt es bestehen (**PROJ-Y-45b**, im Tech Design registriert).

---

## Implementierungsnotizen — /frontend β (2026-08-18)

Kein neues Paket, keine Migration, kein neuer RPC. Die Datenschicht aus `/backend` hat alles getragen,
was die Fläche braucht — auch die Zähler je Gewerk (`construction_defect_summary`) und die
benennende Teilbaum-Abfrage lagen bereits vor.

**Was entstanden ist**

| Fläche | Datei | Inhalt |
|---|---|---|
| Projektraum-Reiter „Mängel" | `src/app/(app)/projects/[id]/maengel/page.tsx` + `construction-defects-page.tsx` | Register mit fünf serverseitigen Filtern, Kopfzahlen, Zeilenaktionen |
| Erfassen / Bearbeiten | `construction-defect-dialog.tsx` | eine Maske für beide Vorgänge, mit sichtbaren Leeren-Schaltern |
| Detail + Statuswechsel + Verlauf | `construction-defect-detail-sheet.tsx` | Handlungen, Vier-Augen-Erklärung, unveränderliche Zeitleiste |
| Mängelanzeige erzeugen | `construction-defect-notice-dialog.tsx` | Achse Gewerk **oder** Nachunternehmer, Vorschau-Zahl |
| Mängelanzeige (Druck) | `src/app/projects/[id]/maengelanzeige/print/page.tsx` | chrome-los, ausserhalb der App-Hülle, Sitzungs-Client |
| Navigation | `src/lib/method-templates/index.ts` | **ein** Eintrag, +18 Zeilen im Merge-Hotspot |
| α-Fläche „Gewerke" | `project-trades-page.tsx` | Zähler je Gewerk (Mängel · überfällig · wartet auf Prüfung) |
| Reine Ableitungen | `defect-actions.ts`, `defect-notice.ts` | Angebots-Spiegel, Änderungs-Differenz, Anzeigen-Umfang |
| Lesezugriffe | `use-construction-defects.ts` | Liste, Zähler, Verlauf — Hausmuster inkl. `moduleInactive` |

**Das Zwei-Akteur-Gate in der Oberfläche — erklären, nicht nachbauen.** Die Regel lebt in
`transition_construction_defect_status` und weist mit `42501` ab (D-β9: die Routen gaten nur `view`).
Die Fläche tut drei Dinge und keins davon formuliert die Regel neu:

1. Für die Rechtefrage fragt sie das **bestehende Hausprädikat** `useProjectAccess(…,
   "manage_members")` ab — das ist `admin | lead` **ohne** den permissiven Rückfall, den
   `edit_master` trägt, und damit deckungsgleich mit `is_tenant_admin OR is_project_lead` in den
   Funktionen. Bewusst **nicht** `edit_master`: das schliesst den Projekt-`editor` ein, den diese
   Slice ausschliesst (B-β2). „Mangel erfassen" trägt umgekehrt **gar kein** Rechte-Gate (L15).
2. Sie bietet nur Handlungen an, die der Aufrufer wirklich ausführen kann. `offeredDefectActions`
   entfernt „Abnehmen" für die Person, die fertiggemeldet hat — verglichen wird dasselbe Feld, das
   die Datenbank liest (`reported_done_by`), das bei **jeder** Fertigmeldung neu gesetzt wird. Damit
   stimmt die Anzeige auch in Runde n nach mehrfacher Rückweisung (Pentest-Vektor K).
   „Zurückweisen" und „Verwerfen" bleiben stehen — sonst wäre der Mangel eingefroren.
3. Sie **benennt den klemmenden Fall** statt ihn zu verschweigen: `describeReviewBlock` erklärt, dass
   die Abnahme eine zweite berechtigte Person braucht, und sagt für den Fall „Projektleitung ist
   gleichzeitig die einzige Mandanten-Administration" ausdrücklich, dass der legitime Ausweg eine
   zweite Projektleitung ist (B-β7). **Kein Umgehungsweg, kein stiller Übersteuerungsschalter**
   — PROJ-119-Haltung.

**Die Leeren-Schalter sind wirklich in der Maske.** Alle fünf optionalen Felder tragen einen
sichtbaren „Leeren"-Knopf, sobald sie einen Wert haben: Beschreibung, Ort, Frist, Verantwortlicher,
Nachunternehmer. Ort und Nachunternehmer haben zusätzlich eine ausdrückliche Leer-Option in der
Auswahl („— ohne Ortsangabe —" / „— keiner —"), weil eine Auswahl ohne solche Option gar nicht
zurückgesetzt werden kann.

Die Übersetzung nach `clear_*: true` macht `buildDefectUpdatePayload` als **Differenz** zum
Ausgangszustand — ein in der Maske geleertes Feld wird zum Schalter, nicht zu einem weggelassenen
Feld (das hiesse „unverändert") und nicht zu einem Leerstring (das wäre ein gesetzter Wert). Genau
dieser Unterschied ist die in PROJ-122 live ausgelieferte Defektklasse. Das ist eine reine Funktion
und mit den drei Vektoren des Pentests gepinnt: setzen, weglassen (Wert bleibt), Schalter (Wert wird
leer); dazu ein Fall, der beweist, dass **nie** ein Wert und sein eigener Schalter zusammen gesendet
werden (die Route weist das mit 422 als widersprüchlich ab). Bei „nichts geändert" wird gar nicht
gesendet, weil die Funktion einen leeren Rumpf mit 422 abweist — die Maske sagt dann „Keine Änderung"
statt einen Fehler zu zeigen.

**Zwei getrennte Signale, nicht verschmolzen.** „überfällig" (rot, mit Frist) gilt nur in `offen`
und `in_bearbeitung`; sobald fertiggemeldet ist, erscheint stattdessen „wartet auf Prüfung" (amber) —
dort läge die Verspätung bei der Bauleitung, und ein gemeinsames Abzeichen würde den Falschen
anzeigen (B-β6). Beide Signale stehen in der Zeile, in der Detailansicht **und** in den Kopfzahlen;
die Zeilen-Flags kommen aus der vorhandenen TS-Lib (`deriveDefectFlags`), die Kopf- und
Gewerke-Zähler aus dem SQL-Zwilling — es ist **keine dritte Kopie** entstanden (D-β8 unverändert).

**Ein AC hat eine Entscheidung erzwungen, die im Entwurf nicht stand.** AC-45β.4 verlangt, dass ein
neu erfasster Mangel „ohne weiteren Schritt in der Liste sichtbar" ist. Bei aktivem Filter kann er
das nicht sein: wer nach „Gewerk Dach" filtert und einen Elektro-Mangel erfasst, sähe nichts und
müsste rätseln. Nach dem Erfassen wird die Auswahl deshalb zurückgesetzt **und das gesagt**
(„Filter zurückgesetzt, damit der neue Mangel sichtbar ist") — nicht stillschweigend behalten und
nicht stillschweigend verworfen.

**Die Mängelanzeige.** Chrome-lose Route ausserhalb der `(app)`-Gruppe, alle vier Abfragen über den
cookie-gebundenen Sitzungs-Client (`createClient`) — **nie** der Dienst-Schlüssel; genau daran hängt
AC-45β.16. Das Modul-Tor ist von Hand nachgezogen (`requireModuleActive` gibt eine HTTP-Antwort für
Routen zurück, eine Seite braucht `notFound()`), Regel wörtlich übernommen inklusive „fehlende
Einstellungszeile → offen bleiben". Ein nicht gesetzter Ort wird **weggelassen** statt als
„unbekannt" gedruckt (Edge Case β). Der Vorschau-Zähler im Dialog läuft über eine **eigene,
ungefilterte** Abfrage: die Liste der Fläche zu nehmen wäre bei aktivem Filter eine Zusage, die das
gedruckte Blatt bricht.

**Der Modul-Aus-Zustand ist der dritte Zustand, nicht Fehler und nicht leer.** Die Fläche rendert
`ModuleUnavailableNotice` (PROJ-Y-143f), und die abhängigen Abrufe (Gewerke, Abschnitte, Zähler)
werden gar nicht gestartet, sobald die Liste 404 gemeldet hat. Lieferanten-Stammdaten sind bewusst
**optional**: ist das Modul „Lieferanten" aus, bleibt die Auswahl leer und weist darauf hin — über
das Gewerk funktioniert alles weiter, und ein fremdes Modul darf hier keinen Fehlerbanner erzeugen.
Ein bereits gesetzter Nachunternehmer bleibt in der Auswahl wählbar, auch wenn er nicht in der
geladenen Liste steht; sonst verlöre ein Speichervorgang die Zuordnung stillschweigend.

### Nachweise je Akzeptanzkriterium

| AC | Nachweis |
|---|---|
| AC-45β.1 | „Mangel erfassen" ohne Rechte-Gate in der Kopfzeile; Autorität ist die Anlege-Funktion (Pentest A: Betrachter darf, D2: Editor darf) |
| AC-45β.2 | Speichern erst bei Titel **und** Gewerk; Schweregrad vorbelegt `gering`; die vier übrigen Felder optional |
| AC-45β.3 | Auswahl kommt aus `useProjectTrades`/`useConstructionSections` **dieses** Projekts; serverseitig durch die PROJ-Y-45a-Wächter belegt |
| AC-45β.4 | Anlegen → `reload()`; bei aktivem Filter Rücksetzen mit Hinweis (siehe oben) |
| AC-45β.5 | Zeilen-Bearbeiten-Knopf und Steuerblock nur bei `manage_members`; Server entscheidet (Pentest D) |
| AC-45β.6 | fünf Leeren-Schalter + `buildDefectUpdatePayload` (7 Unit-Fälle, darunter „Wert und Schalter nie zusammen") |
| AC-45β.7 | Handlungsknöpfe aus `availableDefectActions`, gegen die Migrationstabelle gepinnt (je Handlung ein Fall) |
| AC-45β.8 | „Verwerfen" öffnet den Begründungsblock; Senden erst bei nicht-leerem Text |
| AC-45β.9 | „Abnehmen" nur im Steuerblock, der `manage_members` verlangt |
| AC-45β.10 | `offeredDefectActions` hält „Abnehmen" zurück, `describeReviewBlock` erklärt es (6 Unit-Fälle inkl. Runde 2) |
| AC-45β.11 | „Zurückweisen" mit Pflichtbegründung, Zielzustand `in_bearbeitung` aus der gepinnten Tabelle |
| AC-45β.12 | Zeitleiste aus `construction_defect_events`, älteste zuerst, mit Begründung je Runde und Hinweis auf Unveränderlichkeit |
| AC-45β.13 | Anzeigen-Dialog mit Achse Gewerk **oder** Nachunternehmer |
| AC-45β.14 | Druckseite ausserhalb der App-Hülle, `theme-print`, kein Renderer |
| AC-45β.15 | je Mangel Nr., Titel, Beschreibung, Ort (nur falls gesetzt), Schweregrad, Frist; Kopf mit Projekt, Adressat, Datum, Ersteller |
| AC-45β.16 | ausschliesslich Sitzungs-Client; RLS ist `is_project_member`, Playwright belegt Anmelde-Umleitung ohne Inhalt |
| AC-45β.17 | rote Frist + „überfällig" in der Zeile, Abzeichen in Kopf und Detail |
| AC-45β.18 | **nicht gebaut** — nach δ verschoben (D-β1) |
| AC-45β.19 | fünf Filter (Gewerk · Abschnitt · Status · Schweregrad · nur überfällig), alle serverseitig |
| AC-45β.20 | Nav-Sektion mit `requiresProjectType: "construction"` **und** `requiresModule: "construction"`; Fläche zeigt `ModuleUnavailableNotice`, Druckseite `notFound()` |
| AC-45β.21 | 409 mit Nennung kommt aus `/backend`; die α-Fläche zeigt die Servermeldung unverändert an (`ConstructionApiError` trägt den Status mit) |
| AC-45β.22 | keine Zeile und kein Zähler entsteht im Client; alles kommt aus RLS-gebundenen Abfragen und der INVOKER-Auswertung |

Die Härtungskriterien AC-45βH-1…10 und -12 sind serverseitig und im `/backend`-Pentest (53/53)
belegt; **AC-45βH-11** ist die Hälfte, die diese Slice hinzufügt und die hier belegt ist
(Playwright: Anmelde-Umleitung ohne „Mängelanzeige" im Rumpf). Der authentifizierte Durchlauf
bleibt `/qa`.

### Abweichungen (/frontend β)

- **D-β10 — der Zustandsautomat steht ein zweites Mal, in TypeScript.** Ohne ihn müsste die Fläche
  alle sechs Handlungen anbieten und den 422 abwarten. Er ist ein **Angebots-Spiegel**, keine zweite
  Autorität: die Datenbank prüft unverändert. Gepinnt durch eine Testtabelle, die den `case
  p_action`-Block der Migration **wörtlich abschreibt** statt ihn aus dem Prüfling abzuleiten — ein
  Test, der seine Erwartung aus dem Prüfling bezieht, bestätigt nur sich selbst.
- **D-β11 — die Anzeige lässt geprüfte und verworfene Mängel weg.** Der Wortlaut von AC-45β.13/.15
  nennt nur die Achse, keinen Status. Ausgenommen sind ausschliesslich die beiden **abschliessenden**
  Zustände: bei `geprueft` ist abgenommen, bei `verworfen` war es keiner — eine Aufforderung wäre in
  beiden Fällen falsch. `erledigt` bleibt **drin** und wird als „fertiggemeldet, Prüfung offen"
  gekennzeichnet, damit keine Position verschwindet, die der Empfänger erwartet. Die Regel steht
  einmal (`NOTICE_STATUSES`), wird im Dialog angekündigt und im Blatt als Fusszeile ausgewiesen.
- **D-β12 — „Verantwortlich" erscheint nur beim Bearbeiten.** Die Anlege-Funktion nimmt das Feld
  nicht an; es beim Erfassen anzuzeigen hiesse, eine Eingabe zu verwerfen.
- **D-β13 — die Druckseite verlässt sich auf die RLS statt auf ein eigenes Mitgliedschafts-Tor.**
  Ein Mandanten-Mitglied ohne Projektmitgliedschaft sieht eine **leere** Anzeige, keinen 404. Kein
  Inhaltsabfluss (`construction_defects` verlangt `is_project_member`), und der Projektname ist ihm
  über die PROJ-2-RLS ohnehin sichtbar. Genau so verhalten sich die drei bestehenden Druckseiten
  (PROJ-116/131/132).
- **D-β14 — kein authentifizierter Browser-Durchlauf in diesem Schritt.** Die Flächen sind
  modul-gegatet und der E2E-Mandant hat `construction` **aus**; ihn einzuschalten hätte die frisch
  stabilisierten Visual-Baselines verschoben (PROJ-Y-143f/143l-Lehre). Belegt ist stattdessen: die
  neun Baselines bleiben **unberührt** (siehe unten), die α-Auth-Gates 16/16 grün, die zwei neuen
  Flächen auth-gegatet. Der Durchlauf gehört zu `/qa`.
- **Kein Deep-Link von den Gewerke-Zählern in die gefilterte Mängelliste.** Die Filter sind
  Zustand, nicht URL; ein Link, der die Auswahl nicht setzt, wäre irreführend. Der Zähler
  informiert, er navigiert nicht.

### Baselines und Gates

**Visual-Regression unberührt, empirisch belegt:** `PROJ-51-visual-regression-authenticated`
**9/9 grün ohne Neuaufnahme**. Erwartet, weil der Visual-Mandant `construction` nicht in
`E2E_VISUAL_ACTIVE_MODULES` führt und die drei Bau-Sektionen damit doppelt herausgefiltert werden
(Modul **und** Projekttyp) — aber gemessen statt geschlossen. `routing.test.ts` brauchte keine
Anpassung: α hat die Invariante schon von „genau eine Sektion je Modul" auf ihre Absicht umgestellt.

| Gate | Ergebnis |
|---|---|
| `npx eslint .` | **0 Fehler** (Exit 0) |
| `npx tsc --noEmit` | **13 = Baseline, 0 neu** |
| `npx vitest run` | **3240/3240** (395 Dateien), davon **34 neu** in dieser Slice |
| `npm run build` | clean, beide neuen Routen registriert (`/projects/[id]/maengel`, `…/maengelanzeige/print`) |
| `npm run check:migration-naming` | 0 Fehler |
| `npm run check:index-scope` | 0 Fehler |
| Playwright `PROJ-45-construction` | **18/18** chromium (16 α-Regression + 2 neu) |
| Playwright `PROJ-51-visual-authenticated` | **9/9**, keine Baseline neu gezogen |

**Eine Messfalle unterwegs, festgehalten weil sie wiederkehrt:** die erste Baseline-Messung meldete
**15** tsc-Fehler ohne die Slice gegen 13 mit ihr — die Slice hätte Fehler *behoben*. Ursache waren
die von `npm run build` erzeugten Routen-Typen unter `.next`, die nach dem Wegstashen auf gelöschte
Dateien zeigten. Nach `rm -rf .next` sind beide Seiten **13**. Dieselbe Klasse wie der
`validator.ts`-Befund aus PROJ-Y-143e; eine tsc-Baseline ist nur mit geleertem `.next` belastbar.

### Nicht in dieser Slice gebaut

`/qa` steht aus: der authentifizierte Durchlauf (Erfassen als Betrachter → Fertigmelden → Abnahme
durch eine **zweite** Person), die fünf Risiken aus dem Tech Design (Feld leeren, Vier-Augen unter
einer Person, Anker-Zweige zählen, Teilbaum-Sperre am **Enkel**, Überfälligkeits-Grenzen) sowie ein
echter Druck nach PDF. AC-45β.18 bleibt nach **δ** verschoben.

---

## QA Test Results — β (2026-08-19)

**Verdikt: PASS — 0 Critical / 0 High / 0 Medium, 3 Low/Info.** 21 von 22 Akzeptanzkriterien
erfüllt, alle 12 blockierenden Härtungskriterien erfüllt. **AC-45β.18 ist ein offenes
Kriterium**, keine Abweichung — es ist per Nutzer-Entscheid (D-β1) nach δ verschoben und als
Auslassung geführt. Status → **Approved**; Deployment-Scope bleibt leer, `/deploy` vergibt ihn
(er wird `alpha`, weil drei Original-Anforderungen auf γ/δ/ε liegen).

### Was dieser Lauf hinzufügt

`/frontend` β hatte drei Dinge ausdrücklich offen gelassen. Alle drei sind jetzt ausgeführt,
nicht kompensiert — nach der PROJ-135/AC-135.3-Lehre ist ein nicht gelaufener Nachweis ein
offenes Kriterium und keine Deviation:

1. **Der Zwei-Personen-Durchlauf ist wirklich gelaufen**, in drei getrennten authentifizierten
   Browser-Sitzungen: Betrachter erfasst → Bauleitung meldet fertig → **zweite Person** nimmt ab.
2. **Die fünf Tech-Design-Risiken** sind einzeln geprüft.
3. **Ein echter Druck nach PDF** liegt vor (`%PDF-`-Kopf, 15 KB, als Testartefakt angehängt).

### Die vierte Fixture-Lane (Bau)

Der Durchlauf brauchte eine Fläche, die doppelt gegatet ist (`project_type = 'construction'`
**und** Modul `construction`). Das Modul im geteilten `[E2E]`-Mandanten einzuschalten war
ausgeschlossen — genau der Griff, den PROJ-Y-143f/143l verboten haben, weil die authentifizierten
Visual-Baselines Mandanten-Zustand fotografieren. Also eine eigene Lane nach dem
PROJ-Y-144d-Muster: eigener Mandant `[E2E] Bau Test`, eigenes Bauprojekt, eigenes Gewerk,
zweistufiger Abschnittsbaum, `active_modules` **ausdrücklich** geschrieben (beide Modul-Tore
fallen bei fehlender Einstellungszeile offen zurück — eine Fixture mit dem Zweck „das Modul ist
an" darf nicht auf einem Fail-open ruhen), `audit_lifecycle_exempt` **vor** dem Seeden gesetzt.

**Drei Akteure, weil die Rollen es erzwingen** und nicht aus Bequemlichkeit: der Betrachter darf
anlegen, aber nicht fertigmelden; Fertigmelden verlangt `admin | lead`; Abnehmen verlangt
dieselbe Rolle **und** eine andere Person. Zwei davon sind neue Identitäten, der Abnehmer ist der
geteilte E2E-Nutzer als Mandanten-Administration — dass dessen Einbuchung in einen vierten
Mandanten heute gefahrlos ist, verdankt sich PROJ-Y-143l und ist unten **gemessen**, nicht
angenommen. Alle acht neuen Kennungen sind RFC-4122-konform und im harten `global-setup`-Wächter
eingetragen (PROJ-143).

### Nachweise je Akzeptanzkriterium

| AC | Nachweis |
|---|---|
| AC-45β.1 | **Browser, Betrachter-Sitzung:** „Mangel erfassen" ist für die Betrachterrolle sichtbar und der Mangel entsteht; Gegenprobe im selben Test, dass „Mängelanzeige" ihm **nicht** angeboten wird (sonst wäre der Nachweis auch auf einer Fläche grün, die jedem alles zeigt). Datenbankseitig Pentest A/D2. |
| AC-45β.2 | Speichern erst bei Titel **und** Gewerk; Pentest A (Titel getrimmt, Status `offen`), Vektoren für fehlenden Titel und fehlendes Gewerk → `23514`. Die vier übrigen Felder sind im Durchlauf leer geblieben und der Mangel entstand trotzdem. |
| AC-45β.3 | Pentest **E/F** (projektfremdes Gewerk / projektfremder Abschnitt → `23514`), plus PROJ-Y-45a-Wächter 9/9. Die Auswahl der Oberfläche stammt aus den Projekt-Hooks. |
| AC-45β.4 | **Browser:** direkt nach dem Erfassen ist die Zeile sichtbar und trägt „Offen" — ohne Reload und ohne weiteren Schritt. |
| AC-45β.5 | **Browser, Betrachter-Sitzung:** statt des Steuerblocks erscheint der Nur-Lese-Hinweis; „Fertigmelden", „Abnehmen" und „Angaben bearbeiten" haben Trefferzahl **0**. Serverseitig Rot-Team über HTTP: sein `PATCH` und sein Statuswechsel enden auf **403**, und die Zeile ist danach unverändert (`titel` und `status` gegengeprüft). Pentest B/C/D. |
| AC-45β.6 | Pentest **O0/O1/O2** über **alle fünf** optionalen Felder in drei Zuständen: setzen → **weglassen behält** → Schalter leert wirklich. Der mittlere Zustand ist der eigentliche Nachweis: ohne ihn bliebe „weglassen heißt leeren" unentdeckt (die live ausgelieferte PROJ-122-Defektklasse). **Browser** zusätzlich für den Ort, das schwerste Feld, weil eine Auswahlliste ohne ausdrückliche Leer-Option gar nicht zurückgesetzt werden kann — geprüft gegen die **persistierte Zeile**, nicht gegen die gerenderte Zelle. |
| AC-45β.7 | Pentest über jeden Übergang der Kette; zusätzlich **im Feld-Protokoll live nachgewiesen**: die drei Durchläufe erzeugten 28 Zeilen `construction_defects.status` in `audit_log_entries` (danach aufgeräumt, siehe Rückstände). |
| AC-45β.8 | Pentest **M** (Verwerfen ohne Begründung → `23514`); in der Maske öffnet „Verwerfen" den Begründungsblock und sendet erst bei nicht-leerem Text. |
| AC-45β.9 | **Browser:** „Abnehmen" existiert nur im Steuerblock, den die Betrachter-Sitzung nicht bekommt; die Abnahme selbst gelingt in der Sitzung der Mandanten-Administration. |
| AC-45β.10 | **Der Kern des Durchlaufs.** In der Sitzung der Bauleitung, die fertiggemeldet hat, ist „Abnehmen" mit Trefferzahl **0** — „Zurückweisen"/„Verwerfen" bleiben stehen, sonst wäre der Mangel eingefroren. Und weil ein zurückgehaltener Knopf allein kosmetisch ist: dieselbe Sitzung fragt die Statusroute direkt und erhält **403** mit `four-eyes` im Rumpf. Pentest **I** und **K** (Runde 2 nach Rückweisung). |
| AC-45β.11 | Pentest **L/L2**; Rot-Team über HTTP: Zurückweisen ohne Begründung → **422**, und der Mangel bleibt auf `erledigt` (kein Nebeneffekt). |
| AC-45β.12 | **Browser:** die Zeitleiste zeigt nach der Abnahme „Angelegt", „Fertiggemeldet", „Geprüft" mit dem Unveränderlichkeits-Hinweis. Pentest **R** prüft jetzt die volle Mehrrunden-Kette (siehe F-1) und **R2** beide Fertigmeldungen. |
| AC-45β.13 | **Browser:** Anzeigen-Dialog mit Achse Gewerk oder Nachunternehmer, nur für die Leitung. |
| AC-45β.14 | **Echter Druck:** `page.pdf()` auf der Druckseite liefert einen gültigen `%PDF-`-Kopf und ~15 KB; die App-Hülle ist nachweislich nicht im DOM (`[data-sidebar]` Trefferzahl 0). |
| AC-45β.15 | Titel, Ort und Gewerk stehen auf dem Blatt (im gedruckten Fall mit gesetztem Ort, Frist und Schweregrad `erheblich`). |
| AC-45β.16 | Ohne Sitzung führt die Druckseite zur Anmeldung und der Rumpf enthält weder „Mängelanzeige" noch `construction_defects`. Rot-Team über HTTP: ein Fremder aus einem anderen Mandanten erhält auf Liste **und** Zähler **404** (nicht 403 — 403 würde die Existenz des Projekts bestätigen). |
| AC-45β.17 | **Risiko 5, alle drei Grenzen:** Frist **heute** → nicht überfällig (`<`, nicht `<=`), Frist **gestern** → überfällig, Frist gestern **aber fertiggemeldet** → „wartet auf Prüfung" und ausdrücklich **nicht** überfällig. Pentest P1–P4. |
| AC-45β.18 | **OFFEN — nicht erfüllt.** Nach PROJ-45-δ verschoben (D-β1, Nutzer-Entscheid nach B-β1). Als zurückgestellte Original-Anforderung in `features/OPEN-DEFERRED-STATUS.md` in der δ-Zeile geführt. Der PROJ-103-Pentest ist als Regression **A–G 7/7** grün und belegt unabhängig, dass β die Engpass-Auswertung nicht angefasst hat. |
| AC-45β.19 | Fünf serverseitige Filter; im Durchlauf mitbenutzt (der Filter wird nach dem Erfassen zurückgesetzt und das gesagt). |
| AC-45β.20 | Positive Hälfte im Browser: die Fläche ist überhaupt nur erreichbar, weil Projekttyp **und** Modul stimmen — die Fixture-Lane ist der Nachweis. Negative Hälfte: der Fremd-Mandant (Modul `construction` aus) erhält 404 ohne Mangeldaten. |
| AC-45β.21 | **Risiko 4 im Browser/HTTP:** der Mangel hängt am **Enkel**, gelöscht wird die **Wurzel** → **409** mit `defects_present` **und dem Titel des Mangels im Rumpf**. Pentest U/V/V2/V3, wobei **V** zeigt, dass die naive Abfrage auf den einen Knoten 0 Treffer liefert. |
| AC-45β.22 | Rot-Team über HTTP (404 auf Liste und Zähler, kein Leck des Laufkennzeichens) + Pentest X/X2 und die **Aggregat-Leck-Probe Y/Y2** (Fremder sieht `total = 0`, obwohl 1 Mangel existiert; Berechtigter sieht die Wahrheit — kein Blanket-Deny). |

### Härtungskriterien

| # | Nachweis |
|---|---|
| AC-45βH-1 | Pentest X/X2/Y/Y2 + HTTP-404 auf Liste und Zähler. |
| AC-45βH-2 | Pentest B/C/D (Betrachter und Projekt-`editor`) + HTTP-403 auf `PATCH` und Statuswechsel + Trefferzahl 0 für alle Steuer-Knöpfe in der Betrachter-Sitzung. |
| AC-45βH-3 | Pentest I und **K** (Runde 2) + der 403 aus der Sitzung des Fertigmelders. |
| AC-45βH-4 | Pentest W1–W4 **als Mandanten-Administration**: direktes `INSERT` und Ereignis-`INSERT` → `42501`, `UPDATE`/`DELETE` → 0 Zeilen. Strukturell zusätzlich: **0** Schreib-Policies auf beiden Tabellen (live gezählt), RLS auf beiden aktiv. |
| AC-45βH-5 | Pentest Q1/Q2 (`42501`), Ausnahme durch Z belegt (D-β5). |
| AC-45βH-6 | Pentest E/F + PROJ-Y-45a-Wächter 9/9. |
| AC-45βH-7 | **Risiko 4**: 409 mit Nennung, am Enkel ausgelöst, kein 500. |
| AC-45βH-8 | **Vollständig geprüft, nicht als Stichprobe** (PROJ-Y-114a-Lehre): alle **acht** von der Migration erzeugten Funktionen **und** die **vier** geteilten, die sie neu schreibt (`can_read_audit_entry`, `_tracked_audit_columns`, `record_audit_changes`, `record_audit_lifecycle`) haben `has_function_privilege('anon', …) = false` **und keinen PUBLIC-Eintrag in der ACL** (`=X/` kommt in keiner der zwölf vor). Die beiden internen Wächter sind auch für `authenticated` nicht aufrufbar; die drei Auswertungen sind INVOKER, die drei Schreibwege DEFINER; alle zwölf tragen `search_path`. |
| AC-45βH-9 | Live-Pentest gegen Prod im Rollback-Muster; Nicht-Admin, Projekt-`viewer` und Projekt-`editor` werden synthetisiert (in Prod ist jedes Mandanten-Mitglied Admin und `is_tenant_admin` schließt die Rechteprüfung kurz — ein Smoke unter Admin wäre falsch-grün). Vektor **S2** belegt ausdrücklich, dass der lesende Nutzer kein Admin ist. |
| AC-45βH-10 | α-Pentest **16/16**, PROJ-Y-45a **9/9**, PROJ-103 **A–G 7/7** — alle wörtlich, alle unverändert. |
| AC-45βH-11 | Druckseite ohne Sitzung → Anmelde-Umleitung ohne Inhalt; mit Sitzung nur eigene Projekte (RLS `is_project_member`, Sitzungs-Client, kein Dienst-Schlüssel). |
| AC-45βH-12 | Nicht-Bau/Modul-aus verhält sich unverändert: **9/9 Visual-Baselines grün ohne Neuaufnahme**, α-Auth-Gates **18/18**, vitest 3240/3240. |

### Automatisierte Läufe

| Lauf | Ergebnis |
|---|---|
| Live-Pentest `tests/sql/PROJ-45-beta-construction-defects-pentest.sql` | **53/53 PASS, 0 FAIL** gegen Prod (32 + 14 + 7), 0 Rückstände |
| Regression α `PROJ-45-construction-trades-sections-pentest.sql` | **16/16** wörtlich |
| Regression `PROJ-Y-45a-reference-consistency-smoke.sql` | **9/9** wörtlich |
| Regression PROJ-103 (Engpass-Auswertung unberührt) | **A–G 7/7** wörtlich |
| Playwright `PROJ-45-beta-defects.spec.ts` (neu) | **18/18** chromium — 6 Auth-Gates, 3 Kettenschritte, 4 Risiken, 2 Anzeige, 3 Rot-Team |
| Playwright `PROJ-45-construction.spec.ts` (α-Regression) | **18/18** chromium |
| Beide zusammen, dreimal hintereinander | **36/36 · 36/36 · 36/36** |
| Playwright `PROJ-51-visual-regression-authenticated` | **9/9**, keine Baseline neu gezogen |
| `npx vitest run` | **3240/3240** (395 Dateien) |
| `npx eslint .` | **0** (Exit 0) |
| `npx tsc --noEmit` (nach `rm -rf .next`) | **13 = Baseline, 0 neu** |
| `npm run build` | clean; alle 5 neuen API-Routen und beide Seiten registriert |
| `npm run check:migration-naming` | 0 Fehler (218 Migrationen) |
| `npm run check:index-scope` | 0 Fehler |
| Supabase-Advisors | **0 ERROR** auf beiden Achsen (Security 144 WARN, Performance 15 WARN / 293 INFO) |

Die drei slice-bezogenen Security-WARN sind die drei Schreib-RPCs als `authenticated`-ausführbare
`SECURITY DEFINER`-Funktionen — dieselbe Kategorie, die α trägt und die den Schreibweg überhaupt
erst möglich macht; jede prüft die Rolle intern. Der einzelne `anon_security_definer`-WARN gehört
`seed_risk_categories_if_empty` und ist Bestand. Die acht Performance-Meldungen sind INFO: fünf
`unindexed_foreign_keys` auf Personen-Verweisen (die von PROJ-69 ausdrücklich als
„skip/delete-rare" triagierte Klasse, keine auf einem Leseweg) und drei `unused_index`, was bei 0
Zeilen in Prod zu erwarten ist.

### Register-Anker (Risiko 3)

Live nachgezählt, gegen die vier Nachbar-Slices, die an denselben Objekten arbeiten:
Objektarten **94**, Feld-Whitelist **76**, Lese-Tor **63** — genau die im Tech Design
vorhergesagten Werte. Die Ereignis-Tabelle steht in **keinem** der drei Register (dreifach
gegengeprüft), sie *ist* das Protokoll. Namentliche Geschwister-Gegenprobe über 18 Nachbar-Objekte
(`dd_findings`, `spa_issues`, `ma_valuations`, `communication_matrix_entries`, `raci_assignments`,
`document_extractions`, `document_summaries`, `audit_reader_grants`, `work_items`, `risks`, …):
alle Zweige erhalten. Zwei Abwesenheiten sind dokumentierter Bestand und kein Clobber-Schaden —
`project_skills` trägt bewusst keinen Whitelist-Zweig (PROJ-78) und `audit_reader_grants` bewusst
keinen Lesetor-Zweig (PROJ-130-γ2, fällt korrekt auf `else return false`). Die γ1-Klausel
(`_audit_entry_classified_ok`) und die γ2-Klausel (`has_audit_reader_grant`) stehen unverändert im
gemeinsamen Ausgang, und der `authenticated`-Grant auf `can_read_audit_entry` ist intakt.

### Befunde

**F-1 (Low, in `/qa` behoben) — ein Pentest-Vektor trug den Namen von AC-45β.12, ohne es zu
belegen.** Der Lauf zählte **52** wörtliche PASS-Marken, nicht die dokumentierten 53. Ursache:
`R_history_for_second_defect` **gab einen Wert aus statt zu prüfen** (`angelegt`) und konnte
strukturell nicht fehlschlagen; zusätzlich las er den **falschen** Mangel, weil Vektor M
`v_defect` zuvor auf einen frischen Mangel umbiegt — die Mehrrunden-Kette hing an der ersten
Zeile, deren Kennung niemand mehr hielt. Nicht die Zahl wurde nachjustiert, sondern der Vektor:
eine neue Variable `v_defect_rounds` hält den Mangel mit den Runden, und `R_multi_round_history`
prüft die Kette jetzt wörtlich gegen
`angelegt>fertiggemeldet>zurueckgewiesen>fertiggemeldet>geprueft`.

**Nachgemessen gegen Prod nach der Härtung:** Block 1 gibt **32/32 PASS** aus (vorher 31 PASS
plus eine Wertausgabe), Block 2 vierzehn, Block 3 sieben — **53/53 PASS, 0 FAIL**, und damit
erstmals 53 *Zusicherungen* statt 53 *Marken*. Das Produkt war nie falsch: der Verlauf war
korrekt, nur unbewiesen. Kein Produktivcode berührt. Nebenbefund derselben Prüfung: das
Header-Etikett listete `J0/J`, obwohl `J0` gar kein ausgegebener Vektor ist — auf `J` korrigiert,
die Gesamtzahl 53 war davon unberührt.

**F-2 (Low, offen → PROJ-Y-45d) — die Gewerk-Auswahl kippt von unkontrolliert auf kontrolliert.**
`construction-defect-dialog.tsx:241` übergibt beim leeren Feld `undefined`, React meldet beim
ersten Auswählen „Select is changing from uncontrolled to controlled". Bei jedem Öffnen der
Erfassen-Maske reproduziert. **Es ist die einzige Stelle dieser Form im ganzen Repo** (1 Treffer
in `src/`), also von β eingebracht — die beiden optionalen Auswahllisten unmittelbar darüber
machen es mit einem `NONE`-Wächter richtig. Wirkung ist Konsolenlärm, keine Fehlfunktion (18/18
laufen über genau diesen Pfad). Bewusst nicht in `/qa` behoben: der naheliegende Fix berührt das
Verhalten des Platzhalters „Gewerk wählen …", und dessen Prüfung gehört ins Frontend. Nebenbei:
der Konsolen-Wächter aus PROJ-Y-143e greift auf `console.error`, dies ist eine `console.warn` — er
konnte sie nicht fangen.

**F-3 (Info, in `/qa` behoben, eigener Fehler) — Aufräumen nach Laufkennzeichen löschte fremden
Blöcken die Daten weg.** Die erste Fassung des neuen Specs räumte je Block „alles mit diesem
Laufkennzeichen" ab. Playwright verteilt Blöcke auf parallele Worker und alle vier melden in
**dasselbe** Projekt — also verschwand der Mangel der Kette mitten im Test, und der Fehlschlag
sah aus wie „der Status wurde nicht aktualisiert". Behoben durch ein Kennzeichen je Block; danach
dreimal hintereinander 36/36. Dieselbe Klasse wie PROJ-Y-143o, eine Ebene weiter: nicht das
Verschlucken des Fehlers, sondern der **Geltungsbereich** des Aufräumens.

**F-4 (Info, offen → PROJ-Y-45e) — `audit_lifecycle_exempt` deckt den Feld-Audit nicht ab.** Die
drei committenden Durchläufe hinterließen **33** unlöschbare Zeilen in `audit_log_entries` (28 ×
`status`, 5 × `section_id`) plus eine aus dem Fixture-Seed. Das Flag aus PROJ-Y-130h unterdrückt
nur `record_audit_lifecycle`, nicht `record_audit_changes` — und `status` steht in der
Feld-Whitelist, weil AC-45β.7 es verlangt. `/qa` hat sie über den Runbook-Weg
(`session_replication_role = replica`, streng auf den Fixture-Mandanten begrenzt, mit
Vorbedingungen und Nachprüfung) entfernt und 0 Rückstände belegt; die Wächter aus PROJ-130-α sind
danach nachweislich wieder scharf (3/3 aktiv, `session_replication_role = origin`). Das ist ein
manueller Nachlauf, den der nächste Lauf erneut braucht.

**Kein Befund, aber festgehalten:** die α-Auth-Gate-Zusicherung war
`expect([307, 401, 403, 404]).toContain(status)` — vier erlaubte Werte, wo genau **einer**
auftritt. Gemessen gegen die laufende Anwendung antworten **alle** achtzehn Konstruktions-Endpunkte
(zwölf α, sechs β) mit exakt **307** und `location: /login?next=…`, weil der Proxy vor dem Handler
greift. Jeder überzählige Wert deckte eine andere Regression: `404` hielte den Test grün, wenn
eine Route **gelöscht** würde, `403` wenn das Tor seinen Charakter änderte, `401` wenn der Proxy
den Pfad nicht mehr träfe. Auf den einen Wert verschärft, in α und in β. Zusätzlich hatten die
fünf neuen β-**API**-Routen bisher **gar keinen** Auth-Gate-Test — `/frontend` β hatte nur die
zwei Seiten abgedeckt.

### Rückstände (Gegenabfrage, nicht Behauptung)

Der Browser-Durchlauf muss committen; ein zurückgerollter Vorgang kann ihn nicht abbilden. Nach
allen Läufen und dem Aufräumen, über zehn Zähler gegengeprüft:

`construction_defects` **0** · `construction_defect_events` **0** · Mängel mit `[E2E β]` **0** ·
Mängel im Bau-Projekt **0** · `audit_log_entries` für `construction_defects` **0** ·
`audit_log_entries` des Bau-Mandanten **0** · Mängel im **Kundenmandanten 0** (er wurde nie
berührt) · PROJ-130-α-Wächter **3/3 aktiv** · `session_replication_role` = `origin` ·
`audit_log_entries` gesamt **576** (Bestand anderer Mandanten, unangetastet).

**Bewusst stehen bleibt die Fixture-Lane selbst** — Mandant, Projekt, drei Mitgliedschaften, zwei
Projektrollen, ein Gewerk, eine Projektzuordnung, zwei Abschnitte. Das ist kein Rückstand, sondern
dieselbe dauerhafte, idempotent nachgesäte Fixture wie die Assistant- und die Visual-Lane;
`global-setup` stellt sie bei jedem Lauf wieder her. `audit_lifecycle_exempt` ist gesetzt.

### Abweichungen (`/qa`)

- **D-β15** Der Zwei-Personen-Durchlauf fährt die Zustandswechsel über die Oberfläche, die
  Negativ-Nachweise („darf der Server das auch wirklich nicht?") dagegen als direkte Anfrage aus
  **derselben authentifizierten Sitzung**. Das ist Absicht: der echte Anfragepfad wird benutzt,
  kein Dienst-Schlüssel, und der Nachweis hängt nicht daran, dass ein Knopf fehlt.
- **D-β16** Der Dienst-Schlüssel wird ausschließlich zum **Lesen** der erzeugten Kennungen und
  zum Aufräumen benutzt, nie zum Herstellen eines Zustands, den die Oberfläche herstellen soll.
- **D-β17** Mobile Safari bleibt umgebungsbedingt übersprungen (WebKit-Host-Bibliotheken,
  PROJ-67/F2). Firefox ist gar nicht konfiguriert; alle Zahlen sind chromium.
- **D-β18** Die UI-Hälfte des Leeren-Schalters ist für **ein** Feld (Ort) gefahren, nicht für alle
  fünf; die anderen vier sind über O0/O1/O2 auf Funktionsebene in allen drei Zuständen belegt. Der
  Ort ist bewusst gewählt, weil eine Auswahlliste der einzige Feldtyp ist, der ohne ausdrückliche
  Leer-Option gar nicht zurücksetzbar wäre.
- **D-β14 aufgelöst.** Die Deviation „kein authentifizierter Browser-Durchlauf" aus `/frontend` ist
  eingelöst und entfällt.

---

## PROJ-45-γ — Abnahmen (Requirements 2026-08-19)

**Status: Deployed** (2026-08-20, Tag `v2.70.0-PROJ-45-gamma`) · dritter Sub-Slice, baut auf dem deployten α (Gewerke +
Bauabschnitte) und β (Mängel) auf. Tech Design und `/backend`-Notizen stehen unten; alle sieben
Architekturfragen sind beantwortet, vier davon durch eine Messung statt durch eine Annahme.
**Kein CIA-Pass nötig** (Q-γ6). **Datenschicht, Anwendungsschicht und Oberfläche sind gebaut;
`/qa` steht aus.** Die Abnahme ist der Punkt, an dem Bauleistung rechtlich übergeht: sie setzt die
Gewährleistungsfrist in Gang, kehrt die Beweislast um und lässt Vorbehalte verfallen, die nicht
**bei** der Abnahme erklärt werden. Ohne sie bleibt die Extension eine Erfassungsfläche.

### Erdung — gegen den deployten Stand gemessen, nicht aus der Erstfassung übernommen

| Gemessen (2026-08-19, Prod) | Wert | Folge für γ |
|---|---|---|
| Lebende Bauprojekte | **1** — die β-QA-Fixture `[E2E] Bau-Projekt Mängel`, mit 0 Phasen, 0 Meilensteinen, 0 Arbeitspaketen | γ startet weiter auf grüner Wiese; kein Bestand zu migrieren, keine Rücksicht auf gewachsene Daten |
| `construction_defects` | **0 Zeilen** (β-QA hat rückstandsfrei aufgeräumt) | Die Vorbehalts-Kopplung ist neu zu bauen, nicht an Bestand anzupassen |
| `deliverables` / `deliverable_approvals` | **0 Zeilen** | Die in der α-Tabelle benannte Vorlage ist in Produktion **nirgends im Einsatz** — sie ist ein Muster, kein erprobter Betrieb |
| `deliverables_anchor_check` | `phase_id is not null or workstream_id is not null` | Das „mindestens ein Anker"-Muster ist deployt und für L17 direkt übertragbar |
| `milestones` (Kern, alle Projekttypen) | `target_date` · `actual_date` · vier Status | Trägt **kein** Protokoll: keine Teilnehmer, kein Ergebnis mit Abstufung, keine Vorbehalte, keine Frist |
| `external_document_links.entity_type` | **6** Werte live (`dd_question · dd_finding · work_item · deliverable · ma_valuation · spa_issue`) | γ bräuchte einen siebten — und einen Zweig im Auflöser `external_link_parent_ctx` |
| `external_link_parent_ctx` | gibt `(project_id, level)` zurück; **jeder** Zweig liest ein `confidentiality_level` | Bau hat per α-Entscheid **keine** Vertraulichkeitsachse → ein Bau-Zweig müsste konstant `standard` liefern (Q-γ1) |
| DMS-Knoten-Verweis | Vorbild ist `skill_knowledge_links` (PROJ-77-γ): FK auf `document_tree_nodes` + Mandanten-Konsistenz-Trigger | Der DMS-Beleg ist ein **Verweis auf einen vorhandenen Knoten**, kein zweiter Ablageweg |
| `work_item_documents` | trägt `kind/title/body/checklist/version` | **Keine** DMS-Verknüpfung — die naheliegende Namensgleichheit trügt, als Vorbild untauglich |

### Ein Befund vorweg: die benannte Vorlage trägt nur zur Hälfte

Die α-Tabelle nennt `deliverable_approvals` (PROJ-105) als Vorlage für γ. Am deployten Objekt
gemessen passt davon die **Form des Protokolls**, nicht die **Mechanik**:

| PROJ-105 | Abnahme |
|---|---|
| sequenzielle Stufen, je Stufe **ein** Freigeber, der Reihe nach | **ein gemeinsamer Termin** mit mehreren Anwesenden gleichzeitig |
| Ergebnis binär (`approve`/`reject`) | dreiwertig: abgenommen · **unter Vorbehalt** · verweigert |
| hängt an `deliverables` (M&A-Fläche, `confidentiality_level`, Anker Phase **oder** Workstream) | hängt an Gewerk oder Bauabschnitt (α) |
| kein Rechtsdatum | **setzt die Gewährleistungsfrist in Gang** |

Übernommen wird daher: die **unveränderliche Ereignis-Tabelle**, das **Schreiben ausschließlich über
Funktionen** (keine Schreib-Policies) und die Sperre „höchstens ein offener Vorgang je Bezug".
Nicht übernommen wird die Stufen-Maschinerie — sie hätte in γ keinen Adressaten.

**Und ein zweiter Befund:** `milestones` wäre die billige Antwort („eine Abnahme ist ein Meilenstein"),
trägt aber weder Ergebnisabstufung noch Teilnehmer, Vorbehalte oder Frist. Ein Meilenstein *kann* den
Abnahmetermin im Gantt spiegeln — das ist eine Anzeigefrage für **δ**, kein Datenmodell für γ.

### Nutzer-Locks (γ)

| # | Entscheidung | Begründung |
|---|---|---|
| **L17** | **Genau ein Bezug je Abnahme: Projekt-Gewerk *oder* Bauabschnitt.** Die Gesamtabnahme ist die Abnahme des Wurzel-Abschnitts. | Deckt die reale Teilabnahme in beiden Richtungen („Elektro ist abgenommen", „Haus A ist abgenommen") mit **einem** erprobten Muster (`deliverables_anchor_check`). Ein dritter, ankerloser Fall hätte in jeder Prüfung, Auswertung und Anzeige eine eigene Verzweigung erzwungen. |
| **L18** | **Zweistufig: angesetzt → Ergebnis.** Ein Termin wird zuerst angesetzt und später protokolliert; Absagen ist möglich. | Der angesetzte Termin ist der Zustand, den die Baustelle braucht („Abnahme steht an") und die Vorarbeit für die Terminsignale in **δ**. Ohne ihn entstünde der Datensatz erst rückwirkend und δ müsste ihn nachziehen. Eine dritte Stufe („Prüfung der Prüfung") entfällt: die Abnahme **ist** der Prüfschritt. |
| **L19** | **Ein Ergebnis ist endgültig.** Eine verweigerte Abnahme bleibt stehen; die Nachabnahme ist ein **neuer** Datensatz mit Verweis auf den vorigen. | Hausregel „Entscheidungen sind unveränderlich" (PROJ-20, Invariante #5) und Rechtslage: jede Abnahme ist ein eigener Akt mit eigenem Datum. Ein Protokoll mit zwei Abnahmedaten ist nicht sauber ausdruckbar — genau deshalb **nicht** das Runden-Modell aus β. |
| **L20** | **Vorbehalte koppeln an die β-Mängel.** Beim Protokollieren lassen sich bestehende offene Mängel als Vorbehalt anhaken **und** neue direkt erfassen; die neuen entstehen über die bestehende β-Anlegefunktion als echte Mängel. | Eine Wahrheit. Ein Freitext-Vorbehalt liefe an der Mängelverfolgung vorbei und würde nie nachgehalten — und ein Vorbehalt, der nicht nachgehalten wird, ist der teuerste Fehler dieser Domäne. Setzt den Spec-Satz „erzeugt prüfbare Vorschläge für Mangel" um. |
| **L21** | **Gewährleistung: Dauer wählbar, Fristende sichtbar — keine Überwachung.** | Abnahmedatum plus Dauer (VOB 4 Jahre · BGB 5 Jahre · frei) ergibt ein sichtbares Fristende im Protokoll und in der Liste. Ohne das verlöre die Abnahme ihren wichtigsten Zweck. Ablaufwarnung und Mängelverfolgung **über die Bauzeit hinaus** brauchen Auswertung, Anzeigeort und Zuständigkeit — das ist eine eigene Slice, nicht γ. |
| **L22** | **Protokollieren dürfen nur Projektleitung/Bauleitung oder Mandanten-Administration.** Betrachter dürfen hier **nicht** anlegen. | **Bewusste Abweichung von L15**, und zwar in die verschärfende Richtung: der Mangel wird beim Rundgang erfasst, die Abnahme ist eine rechtsverbindliche Erklärung. Dieselbe Regel wie beim Prüfen in β — damit lebt auf der Baufläche **eine** verschärfte Rolle, nicht zwei verschiedene. **Kein Vier-Augen-Tor**: die Abnahme ist ein Akt der Bauherrenseite, kein interner Freigabelauf. |
| **L23** | **Ausgabe: Protokoll als Druckseite; Beleg auf zwei Wegen; Teilnehmer strukturiert.** | Das unterschriebene Protokoll lebt je nach Kunde im eigenen System (externer Link, PROJ-115) **oder** auf der Plattform (DMS-Knoten, PROJ-79). Beide Wege werden angeboten, **einer** je Abnahme — die Gefahr zweier Wahrheiten ist erkannt und in Q-γ1 gestellt. Teilnehmer aus Projektmitgliedern, Stakeholdern (PROJ-8) und Nachunternehmern (PROJ-15), mit Freitext-Rückfall für Anwesende ohne Datensatz. |

### Prior Art für γ

| Bedarf | Vorlage | Anmerkung |
|---|---|---|
| Bezug „genau ein Anker" | `deliverables_anchor_check` (PROJ-104) | Deployt; γ verschärft von „mindestens einer" auf „genau einer" |
| Projekt-Konsistenz der Verweise | `PROJ-Y-45a` (α-Nachzug) | Zwei BEFORE-Wächter erzwingen, dass Gewerk und Abschnitt zum selben Projekt gehören — γ erbt die Pflicht |
| Unveränderlicher Verlauf | `construction_defect_events` (β), `deliverable_approval_events` (PROJ-105) | Ereignis-Tabelle **außerhalb** der drei Audit-Register (β-Begründung: sie *ist* das Protokoll) |
| Höchstens ein offener Vorgang | `deliverable_approvals_one_pending` (partieller Unique-Index) | Überträgt sich auf „ein angesetzter Termin je Bezug" |
| Schreiben nur über Funktionen | `dd_findings` (PROJ-114), β | Macht die verschärfte Rolle (L22) zu **einer** prüfbaren Stelle |
| Mangel anlegen aus γ heraus | `create_construction_defect(...)` (β) | Wird aufgerufen, nicht nachgebaut |
| Teilnehmer | `committee_meeting_attendees` (PROJ-117, stakeholder-zentriert) | γ braucht zusätzlich den **Nachunternehmer** — Gremien kennen keine Vendors |
| Protokoll-Druckseite | Mängelanzeige (β), PROJ-21-Muster | Sitzungs-Client, **nie** Dienst-Schlüssel |
| Beleg als externer Link | `external_document_links` (PROJ-115) | Siebter Objekttyp + Zweig im Auflöser (Q-γ1) |
| Beleg als DMS-Knoten | `skill_knowledge_links` (PROJ-77-γ) | Verweis auf vorhandenen Knoten; Upload bleibt der bestehende DMS-Weg |
| Entfernen-Sperre mit Nennung | β (409 statt 500, Teilbaum-Abfrage) | γ erweitert die bestehende Sperre, statt eine zweite danebenzustellen |

### User Stories (γ)

#### ST-45γ.1 — Abnahmetermin ansetzen
Als **Bauleitung** möchte ich einen Abnahmetermin für ein Gewerk oder einen Bauabschnitt ansetzen,
damit alle Beteiligten wissen, wann abgenommen wird, und der Termin nicht in einer E-Mail versandet.

- [ ] **AC-45γ.1** *(korrigiert im Tech Design, D-γ1)* Eine Abnahme wird auf **höchstens einen** Bezug angesetzt: ein Projekt-Gewerk **oder** einen Bauabschnitt (L17) — **oder keinen von beiden**, dann ist es die Gesamtabnahme des Projekts. **Beides zugleich** wird serverseitig abgewiesen. Die ursprüngliche Fassung („genau einer", Gesamtabnahme über den Wurzel-Abschnitt) war nicht baubar: ein Bauprojekt ohne Abschnittsbaum hat keinen Wurzelknoten, und der eigene Edge Case verlangt, dass es vollständig funktioniert.
- [ ] **AC-45γ.2** Auswählbar sind nur Gewerke und Abschnitte **dieses** Projekts; ein projektfremder Verweis wird serverseitig abgewiesen (PROJ-Y-45a-Pflicht).
- [ ] **AC-45γ.3** Pflicht beim Ansetzen sind Bezug und Termin; Titel, Bemerkung und Teilnehmer sind optional nachtragbar.
- [ ] **AC-45γ.4** Je Bezug ist höchstens **eine** Abnahme gleichzeitig angesetzt; ein zweiter Versuch wird mit benennender Meldung abgewiesen.
- [ ] **AC-45γ.5** Ein angesetzter Termin kann verschoben oder mit Pflichtbegründung abgesagt werden; beides steht im Verlauf.
- [ ] **AC-45γ.6** Jede Abnahme trägt eine fortlaufende Nummer je Projekt, damit das Protokoll eindeutig referenzierbar ist.

#### ST-45γ.2 — Abnahme protokollieren
Als **Bauleitung** möchte ich das Ergebnis der Abnahme festhalten,
damit der Übergang belegt ist und nicht später rekonstruiert werden muss.

- [ ] **AC-45γ.7** Das Ergebnis ist dreiwertig: **abgenommen** · **abgenommen unter Vorbehalt** · **verweigert**; „verweigert" verlangt eine Pflichtbegründung.
- [ ] **AC-45γ.8** Protokolliert werden dürfen nur Projektleitung/Bauleitung oder Mandanten-Administration; ein Betrachter kann weder ansetzen noch protokollieren (L22) — serverseitig abgewiesen, nicht nur in der Oberfläche ausgeblendet.
- [ ] **AC-45γ.9** *(präzisiert im Tech Design, D-γ4)* Ein protokolliertes Ergebnis ist **endgültig** und nicht mehr änderbar (L19); der Versuch wird serverseitig abgewiesen. **Ausgenommen ist der Belegverweis** — das unterschriebene Protokoll kommt naturgemäß erst **nach** der Abnahme zurück; ohne diese Ausnahme wäre AC-45γ.24 unerfüllbar.
- [ ] **AC-45γ.10** Nach einer verweigerten Abnahme lässt sich eine **neue** Abnahme auf denselben Bezug ansetzen; sie verweist auf die vorige, und die Kette ist im Protokoll und in der Liste sichtbar.
- [ ] **AC-45γ.11** Das tatsächliche Abnahmedatum ist getrennt vom angesetzten Termin erfassbar (die Abnahme findet oft an einem anderen Tag statt).
- [ ] **AC-45γ.12** Jeder Schritt — angesetzt, verschoben, abgesagt, protokolliert — steht mit Akteur und Zeitpunkt in einem unveränderlichen Verlauf.

#### ST-45γ.3 — Vorbehalte festhalten
Als **Bauleitung** möchte ich bei der Abnahme erklärte Vorbehalte festhalten,
damit sie nicht verfallen und die Nachbesserung nachgehalten wird.

- [ ] **AC-45γ.13** Beim Protokollieren lassen sich **bestehende offene Mängel** dieses Bezugs als Vorbehalt anhaken; die Liste schlägt sie von sich aus vor.
- [ ] **AC-45γ.14** **Neue Vorbehalte** lassen sich im selben Schritt erfassen und werden zu echten Mängeln über die bestehende β-Anlegefunktion — es entsteht **keine** zweite Mängelliste (L20).
- [ ] **AC-45γ.15** Ein Ergebnis „unter Vorbehalt" verlangt mindestens einen Vorbehalt; „abgenommen" verlangt, dass keiner offen ist oder die Abweichung ausdrücklich bestätigt wird.
- [ ] **AC-45γ.16** Das Protokoll listet jeden Vorbehalt mit Titel, Ort (falls gesetzt), Schweregrad und Nachbesserungsfrist.
- [ ] **AC-45γ.17** Wird ein als Vorbehalt verknüpfter Mangel später verworfen oder geprüft, bleibt das Protokoll unverändert — es hält den Stand **zum Abnahmezeitpunkt** fest.

#### ST-45γ.4 — Gewährleistungsfrist sehen
Als **Bauleitung** möchte ich sehen, wann die Gewährleistung für eine abgenommene Leistung endet,
damit ich vor Fristablauf handeln kann.

- [ ] **AC-45γ.18** Beim Protokollieren ist die Gewährleistungsdauer wählbar (VOB 4 Jahre · BGB 5 Jahre · frei in Monaten); Vorbelegung ist möglich, aber nichts wird stillschweigend gesetzt.
- [ ] **AC-45γ.19** Aus Abnahmedatum und Dauer ergibt sich ein Fristende, das im Protokoll und in der Abnahmeliste steht.
- [ ] **AC-45γ.20** Eine verweigerte Abnahme setzt **keine** Frist in Gang; das Feld bleibt leer statt auf einen Platzhalter zu zeigen.

#### ST-45γ.5 — Protokoll herausgeben und Beleg ablegen
Als **Bauleitung** möchte ich ein Abnahmeprotokoll ausgeben und das unterschriebene Exemplar ablegen,
damit der Vorgang außerhalb der Plattform belegbar ist.

- [ ] **AC-45γ.21** Aus einer Abnahme lässt sich ein Protokoll als chrome-lose Druckseite erzeugen; der Browser druckt nach PDF (L23).
- [ ] **AC-45γ.22** Das Protokoll enthält Projekt- und Abnahmeangaben, Bezug, angesetzten Termin und Abnahmedatum, Teilnehmer mit Rolle, Ergebnis, Vorbehalte, Gewährleistungsende sowie Unterschriftenzeilen.
- [ ] **AC-45γ.23** Das Protokoll respektiert die Projektzugehörigkeit: es zeigt ausschließlich, was der Aufrufer ohnehin sehen darf — der Sitzungs-Client trägt die Prüfung, **nie** der Dienst-Schlüssel.
- [x] **AC-45γ.24** *(korrigiert im Tech Design, D-γ2; **beide Wege seit 2026-08-21 erreichbar**, siehe „Followups 45d/45g/45i" unten — bis dahin war das Kriterium serverseitig erfüllt und für den Nutzer halb, registriert als PROJ-Y-45g)* An eine Abnahme lässt sich **ein** Beleg hängen: entweder eine externe Adresse **oder** ein vorhandener Dokumentknoten aus dem DMS (PROJ-79) — nicht beides nebeneinander. Die Ablage ist eine **eigene Bau-Tabelle**, nicht die geteilte Verknüpfung aus PROJ-115; wiederverwendet wird deren **Adressprüfung** (Statik, kein Server-Abruf), also die Stelle, an der die Sicherheitslogik sitzt.
- [ ] **AC-45γ.25** *(korrigiert im Tech Design, D-γ3)* Teilnehmer werden strukturiert erfasst, **genau eine Quelle je Zeile**: Stakeholder (PROJ-8), Nachunternehmer (PROJ-15) oder Freitext-Name — je mit Rolle im Termin. Das **Projektmitglied entfällt** als eigene Achse: ein anwesendes Mitglied ist fachlich ein Stakeholder, und der Bezug zum Konto hängt bereits dort (Hausregel „Stakeholder ≠ User", gleiche Grenze wie bei den Gremien-Teilnehmern in PROJ-117).

#### ST-45γ.6 — Sichtbarkeit und Sperren
- [ ] **AC-45γ.26** Abnahmen erscheinen nur in Bauprojekten mit aktivem Bau-Modul; bei abgeschaltetem Modul antwortet der Server gleichbleibend abweisend und die Oberfläche zeigt den neutralen „nicht aktiv"-Hinweis (α/β-Muster).
- [ ] **AC-45γ.27** Ein Gewerk oder Abschnitt, an dem Abnahmen hängen, lässt sich nicht aus dem Projekt entfernen; die Meldung benennt die betroffenen Abnahmen — als **Erweiterung** der bestehenden β-Sperre, nicht als zweite Quelle daneben.
- [ ] **AC-45γ.28** Mandanten- und Projekttrennung gilt unverändert: fremde Abnahmen sind unsichtbar, auch aggregiert und auch in Zählern je Gewerk.
- [ ] **AC-45γ.29** Die Abnahmeliste ist nach Bezug, Status, Ergebnis und Zeitraum filterbar; die α-Gewerkfläche zeigt je Gewerk den Abnahmestand.

### Edge Cases (γ)

- **Abnahme auf einem Gewerk mit offenen Mängeln.** Nicht verboten — aber die offenen Mängel werden als Vorbehalt vorgeschlagen, und „abgenommen" ohne Vorbehalt verlangt eine ausdrückliche Bestätigung (AC-45γ.15). Genau hier verfallen Vorbehalte in der Praxis.
- **Abnahmetermin in der Vergangenheit.** Erlaubt (Nacherfassung eines längst gelaufenen Termins), sonst ist der Erstpilot nicht abbildbar.
- **Abnahme verweigert, dann Nachabnahme, dann wieder verweigert.** Kette aus drei Datensätzen; jede Stufe bleibt lesbar und druckbar (L19).
- **Bezug wird nach der Abnahme umbenannt.** Das Protokoll zeigt den **aktuellen** Namen — der Bezug ist ein Verweis, kein kopierter Text (α-Lock L7 gilt weiter).
- **Gewerk wird im Katalog nur deaktiviert.** Bestehende Abnahmen bleiben sichtbar und druckbar; nur die Neuauswahl entfällt.
- **Nachunternehmer als Teilnehmer ist kein Plattformnutzer.** Regelfall — er wird über den Vendor-Bezug oder als Freitext geführt und unterschreibt auf dem Ausdruck, nicht in der Anwendung.
- **Bauprojekt ohne Abschnittsbaum.** Abnahme je Gewerk muss vollständig funktionieren; die Abschnittsauswahl bleibt schlicht leer.
- **Zwei Abnahmen desselben Bezugs am selben Tag.** Durch AC-45γ.4 ausgeschlossen, solange eine angesetzt ist; nach einem Ergebnis ist eine neue Abnahme zulässig.
- **Verworfener Vorbehalts-Mangel.** Das Protokoll bleibt, wie es war (AC-45γ.17) — sonst schriebe eine spätere Bewertung die Rechtslage zum Abnahmezeitpunkt um.
- **Abnahme ohne Teilnehmer.** Beim Ansetzen zulässig; beim Protokollieren verlangt das Protokoll mindestens einen Anwesenden, sonst wäre die Unterschriftenzeile eine leere Behauptung.

### Out of Scope (γ)

Gewährleistungs**verfolgung** über die Bauzeit hinaus inkl. Ablaufwarnung und Mängeln nach Abnahme
(L21 — eigene Slice) · fiktive und stillschweigende Abnahme nach VOB/B §12 Abs. 5 (Fristablauf,
Ingebrauchnahme) · Vertragsstrafen-Vorbehalt und Zahlungsfreigabe (berührt PROJ-22/24) ·
Restleistungs- und Aufmaßprüfung (VOB/C, dauerhaft außerhalb) · Fotodokumentation am Vorbehalt
(**ε**) · Abnahmetermin im Gantt und als Terminsignal (**δ**) · Versand des Protokolls über PROJ-13
(wie in β: der Nachunternehmer ist selten Plattformnutzer) · Unterschrift in der Anwendung
(Signaturpad, qualifizierte Signatur).

### Offene Fragen für `/architecture`

- **Q-γ1 — Zwei Belegwege, eine Wahrheit?** L23 lässt externen Link **und** DMS-Knoten zu. Zu entscheiden ist, ob das ein Feldpaar mit „genau einer"-Prüfung wird oder zwei getrennte Verknüpfungen. Dazu der gemessene Preis des externen Wegs: `external_document_links` bekäme einen **siebten** Objekttyp und `external_link_parent_ctx` einen Bau-Zweig — der Auflöser gibt heute je Zweig ein `confidentiality_level` zurück, das Bauprojekte per α-Entscheid **nicht** haben. Ein konstantes `standard` ist die naheliegende Antwort, muss aber ausgesprochen und geprüft werden, weil der Auflöser ein geteiltes Sicherheitsobjekt ist (Anker-Ersetzung aus der Live-Definition, Fail-Loud, Post-Verifikation).
- **Q-γ2 — Wo lebt „genau ein Anker"?** CHECK-Bedingung wie `deliverables_anchor_check`, aber verschärft auf Ausschluss — plus die zwei Projekt-Konsistenz-Wächter, die PROJ-Y-45a für dieselben Verweise bereits erzwingt. Zu prüfen: lässt sich der bestehende Wächter erweitern, oder braucht γ einen eigenen?
- **Q-γ3 — Teilnehmer-Modell.** Drei nullbare Verweise (Projektmitglied · Stakeholder · Vendor) plus Freitext mit „genau einer"-Prüfung, oder ein schlankeres Modell aus Freitext und optionalem Verweis? `committee_meeting_attendees` ist stakeholder-zentriert und kennt keine Vendors — die Übertragung ist keine Kopie.
- **Q-γ4 — Gewährleistung: gerechnet oder gespeichert?** Ein gerechnetes Fristende schriebe die Historie um, sobald jemand die Dauer ändert; ein gespeichertes kann von seinem Ausgangswert abdriften. Vorschlag: Dauer **und** Fristende zum Zeitpunkt des Protokollierens festschreiben, danach unveränderlich wie das Ergebnis selbst.
- **Q-γ5 — Sperre auf Entfernen (AC-45γ.27).** β liefert für Gewerk und Abschnitt bereits eine 409-Absage mit Nennung, für Abschnitte über eine Teilbaum-Abfrage. γ muss sich **in** diese Absage einreihen, nicht danebenstellen — sonst nennt die Meldung je nach Ursache mal Mängel, mal Abnahmen, nie beides.
- **Q-γ6 — Braucht γ einen CIA-Pass?** Keine neue Technologie, kein neues Paket, kein aufgeweichtes Rechte-Muster (L22 verschärft, β hat gelockert). CIA-relevant ist genau **ein** Punkt: der Eingriff in den geteilten Auflöser `external_link_parent_ctx` (Q-γ1). Fällt Q-γ1 auf „nur DMS-Knoten", entfällt der Anlass.

### Technische Anforderungen (γ)

Es gelten unverändert die Vorgaben aus **Technical Requirements** weiter unten — insbesondere:
Mandantentrennung mit `tenant_id`; Eintrag der neuen Tabellen in **alle vier** PROJ-130-Register per
**Anker-Ersetzung aus der Live-Definition** mit Fail-Loud-Guard und Re-Grant; Lebenszyklus-Protokoll
über `record_audit_lifecycle`; **keine Actor-Parameter** in Funktionen; `extensions.moddatetime`
schemaqualifiziert; **Live-RPC-Smoke ist Pflicht** vor `Approved`, mit Pentest unter
**synthetisiertem Nicht-Administrator** und null Rückständen. Die Ereignis-Tabelle bleibt wie in β
**außerhalb** der Register — sie *ist* das Protokoll. Kein neues Paket erwartet.

---

## Tech Design (γ) — Abnahmen, 2026-08-19

**Gegen den deployten Stand geerdet**, nicht aus der Anforderung abgeleitet. Der Durchgang hat
**vier** Befunde erbracht, von denen drei ein Akzeptanzkriterium korrigieren und einer einen
Bestandsfehler aufdeckt, den γ auslösen würde.

### Die sechs offenen Fragen, beantwortet

| Frage | Entscheidung | Grundlage |
|---|---|---|
| **Q-γ1** Beleg | **Eigene Bau-Ablage** — eine kleine Tabelle in γ, die **beide** Fälle trägt (externe Adresse **oder** Verweis auf einen Dokumentknoten). Die vorhandene Adressprüfung (kein Server-Abruf, nur Statik) wird als reine Funktion **wiederverwendet**, nicht nachgebaut. | Nutzer-Entscheid. Dieselbe Begründung wie α bei den Gewerken: das Primitiv aus PROJ-115 **ist** im Kern ein Vertraulichkeits-Auflöser mit sechs Bestandszweigen — Bau hat diese Achse per α-Entscheid nicht, bekäme also einen Zweig, der konstant `standard` zurückgibt, und dafür einen Eingriff in ein geteiltes Sicherheitsobjekt. |
| **Q-γ2** „genau ein Anker" | **CHECK auf höchstens einen Anker** (siehe Q-γ7) **plus** Projekt-Konsistenz **in den Funktionen**, kein neuer Wächter-Trigger. | Live gemessen: β prüft die Projektzugehörigkeit von Gewerk und Abschnitt **innerhalb** der Anlege-Funktion, weil auf der Mangel-Tabelle ohnehin keine Schreib-Regel existiert. Die Trigger aus PROJ-Y-45a sitzen auf `work_items` und `risks` — γ schreibt keine dieser Tabellen und braucht sie nicht. |
| **Q-γ3** Teilnehmer | **Stakeholder · Nachunternehmer · Freitext**, genau eine Quelle je Zeile. Das **Projektmitglied entfällt** als eigene Achse. | Nutzer-Entscheid. `stakeholders` ist projektbezogen und trägt bereits den Verweis auf das Benutzerkonto; eine vierte Achse wäre ein zweiter Weg zur selben Person und weichte die Hausregel „Stakeholder ≠ User" auf. PROJ-117 hat für Gremien-Teilnehmer dieselbe Grenze gezogen (dort stakeholder-only). |
| **Q-γ4** Gewährleistung | **Dauer und Fristende werden beim Protokollieren festgeschrieben** und sind danach so unveränderlich wie das Ergebnis. | Ein später gerechnetes Fristende schriebe die Rechtslage um, sobald jemand die Voreinstellung ändert. Die Frist ist Teil des Protokolls, nicht eine Ansicht darauf. |
| **Q-γ5** Entfernen-Sperre | γ reiht sich **in die bestehende Absage ein**. Die Auskunftsfunktion für Abschnitte wird um eine **Art**-Angabe erweitert, für Gewerke kommt eine gleichgebaute daneben; beide bleiben `SECURITY INVOKER`. Fehlercode und Meldung werden neutral. | **Bestandsbefund, siehe unten** — heute ist die Meldung nicht bloß unvollständig, sie würde **falsch**. |
| **Q-γ6** CIA-Pass | **Nicht erforderlich.** | Der einzige Anlass war Q-γ1. Mit der eigenen Bau-Ablage berührt γ kein geteiltes Sicherheitsobjekt, kein neues Paket, kein aufgeweichtes Rechte-Muster (L22 verschärft). Bleibt spec-folgendes Muster — wie β nach Auflösung seiner vier Fragen. |
| **Q-γ7** *(neu, aus der Erdung)* Gesamtabnahme | **Dritter Fall: Abnahme ohne Anker = das ganze Projekt.** | Nutzer-Entscheid. Siehe Befund 2. |

### Vier Befunde

**1. Die Entfernen-Meldung würde durch γ falsch — nicht bloß unvollständig.**
Beide Entfernen-Pfade aus α behandeln heute den Fremdschlüssel-Konflikt in einem Zweig, der
**wörtlich von Mängeln spricht**: der Fehlercode heißt `defects_present`, und die Meldung lautet
„Zu diesem Gewerk bestehen noch Mängel". Hängt künftig eine **Abnahme** am Gewerk, blockiert sie
das Entfernen genauso — und der Nutzer läse eine Meldung über Mängel, von denen es keine gibt.
Das ist die Klasse Fehler, die PROJ-Y-45b vorausgesagt hat („wer als nächster eine Sperre an diese
Achsen hängt, muss den Zweig erneut ergänzen"). γ löst ihn für seinen eigenen Fall mit: die
Auskunft nennt künftig **Art und Bezeichnung** des Blockierers, und der Fehlercode wird neutral.
Die Abschnittsseite behält dabei ihre Teilbaum-Abfrage — ein flacher Filter verfehlt genau den
Fall, in dem eine Abnahme am **Enkel** die Wurzel blockiert.

**2. „Gesamtabnahme = Wurzel-Abschnitt" ist nicht baubar.**
Die Anforderung löste die Gesamtabnahme über den Wurzel-Abschnitt auf. Der eigene Edge Case
verlangt aber, dass ein Bauprojekt **ohne Abschnittsbaum** vollständig funktioniert — und dort gibt
es keinen Wurzelknoten. Ein Bauherr müsste also eine Gliederung anlegen, nur um ein Protokoll
schreiben zu dürfen. **Folge: der Anker wird optional.** Genau ein Gewerk **oder** genau ein
Abschnitt **oder** keins von beidem; ohne Anker ist die Abnahme die des ganzen Projekts.
**AC-45γ.1 ist entsprechend korrigiert** (von „genau einem" auf „höchstens einen").

**3. Der Beleg darf nicht mit einfrieren.**
AC-45γ.9 friert das Ergebnis ein. Wörtlich angewandt würde das auch den Beleg sperren — und das
unterschriebene Protokoll kommt **nach** der Abnahme zurück. Der Einfrier-Wächter nimmt den
Belegverweis daher ausdrücklich aus; alles andere am protokollierten Datensatz bleibt gesperrt.
Ohne diese Ausnahme wäre AC-45γ.24 unerfüllbar.

**4. Die Teilnehmer-Achse „Projektmitglied" war doppelt.**
Siehe Q-γ3. **AC-45γ.25 ist korrigiert.**

### Komponentenstruktur

```
Projektraum eines Bauprojekts (Modul „construction" an, Projekttyp „construction")
+-- Gewerke            (α, bestehend)  -> bekommt Spalte „Abnahmestand" je Gewerk
+-- Bauabschnitte      (α, bestehend)
+-- Mängel             (β, bestehend)
+-- Abnahmen           (γ, NEU — vierter Reiter)
    +-- Kopfzeile: Zähler je Ergebnis (angesetzt / abgenommen / unter Vorbehalt / verweigert)
    +-- Filterleiste: Bezug · Status · Ergebnis · Zeitraum
    +-- Register (eine Zeile je Abnahme)
    |   +-- Nummer · Bezug (Gewerk / Abschnitt / ganzes Projekt) · Termin · Ergebnis
    |   +-- Gewährleistungsende (nur bei abgenommen / unter Vorbehalt)
    |   +-- Hinweis „Nachabnahme zu Nr. N" bei verwiesener Kette
    +-- Dialog „Abnahme ansetzen"      -> Bezug, Termin, Titel, Bemerkung
    +-- Dialog „Abnahme protokollieren"
    |   +-- Ergebnis (drei Schaltflächen, Begründung Pflicht bei Verweigerung)
    |   +-- Vorbehalte: offene Mängel dieses Bezugs zum Anhaken (vorausgewählt)
    |   +-- Vorbehalte: neue Zeilen erfassen -> werden zu echten Mängeln
    |   +-- Gewährleistung: Dauer wählen, Fristende wird gezeigt
    |   +-- Teilnehmer: Zeilen aus Stakeholder / Nachunternehmer / Freitext, je mit Rolle
    +-- Detailansicht (Seitenblende)
    |   +-- Kopf, Teilnehmer, Vorbehalte mit aktuellem Mangel-Status
    |   +-- Unveränderliche Zeitleiste (angesetzt · verschoben · abgesagt · protokolliert)
    |   +-- Beleg: externe Adresse ODER Dokumentknoten anhängen (auch nach der Abnahme)
    |   +-- „Protokoll drucken" -> eigene Druckseite
    +-- Druckseite „Abnahmeprotokoll" (ausserhalb der App-Hülle, wie die Mängelanzeige)
```

### Datenmodell (Klartext)

**Eine Abnahme** trägt: Mandant und Projekt · fortlaufende Nummer je Projekt · Titel · Bemerkung ·
**höchstens einen Bezug** (Projekt-Gewerk **oder** Bauabschnitt; keiner von beiden bedeutet
Gesamtabnahme) · angesetzten Termin · tatsächliches Abnahmedatum · **Status** mit fünf Werten
(angesetzt · abgenommen · abgenommen unter Vorbehalt · verweigert · abgesagt) · Begründung
(Pflicht bei Verweigerung und Absage) · Gewährleistungsdauer in Monaten und daraus festgeschriebenes
Fristende · Verweis auf die **vorige Abnahme** desselben Bezugs (die Nachabnahme-Kette) · Ersteller,
Protokollant und Zeitstempel.

**Ein Abnahme-Ereignis** trägt: die Abnahme · die Art (angesetzt · verschoben · abgesagt ·
protokolliert) · Status davor und danach · Begründung · Akteur und Zeitpunkt. **Unveränderlich** —
diese Zeilen *sind* der Verlauf.

**Ein Teilnehmer** trägt: die Abnahme · **genau eine** Quelle (Stakeholder · Nachunternehmer ·
Freitext-Name) · die Rolle im Termin (Auftraggeber · Auftragnehmer · Bauleitung · Sachverständiger ·
Sonstige) · Anwesenheitsvermerk.

**Ein Vorbehalt** ist ein Verweis von der Abnahme auf einen **bestehenden Mangel** — keine Kopie
seines Inhalts. Neue Vorbehalte werden beim Protokollieren über die **bestehende β-Anlegefunktion**
zu echten Mängeln und dann verwiesen. Es gibt keine zweite Mängelliste.

**Ein Beleg** trägt: die Abnahme · Bezeichnung · **entweder** eine externe Adresse **oder** einen
Verweis auf einen Dokumentknoten aus dem Dokumentenbaum — nie beides.

**Aufbewahrung und Regeln.** Fremde Abnahmen sind unsichtbar, auch in Zählern. Geschrieben wird
**ausschließlich über Funktionen**; Lesen erlaubt die Projektmitgliedschaft. Je Bezug ist höchstens
**eine** Abnahme im Zustand *angesetzt* — dreifach abgesichert, je einmal für Gewerk, Abschnitt und
Gesamtprojekt. Ein protokolliertes Ergebnis ist gesperrt; **einzige Ausnahme ist der Beleg**
(Befund 3). Ein Gewerk oder Abschnitt, an dem Abnahmen hängen, ist nicht entfernbar.

### Technische Entscheidungen und warum

| Entscheidung | Warum |
|---|---|
| Eigenes Bau-Objekt statt Freigabe-Vorgang aus PROJ-105 | Die Vorlage arbeitet **sequenziell mit einem Freigeber je Stufe** und binärem Ergebnis; eine Abnahme ist ein **gemeinsamer Termin** mit dreiwertigem Ergebnis, das eine Rechtsfrist auslöst. Übernommen wird die unveränderliche Ereignis-Tabelle, das Schreiben nur über Funktionen und „höchstens ein offener Vorgang je Bezug" — nicht die Stufen-Maschinerie. Zusatzbeleg: die Vorlage hat in Produktion **0 Zeilen**. |
| Kein Meilenstein-Modell | `milestones` trägt Zieldatum, Ist-Datum und vier Status — kein Ergebnis, keine Teilnehmer, keine Vorbehalte, keine Frist. Ein Meilenstein kann den Termin höchstens **spiegeln**; das ist eine Anzeigefrage für δ. |
| Nachabnahme als neuer Datensatz mit Verweis | L19. Ein Protokoll mit zwei Abnahmedaten ist nicht sauber druckbar. Bewusst **nicht** das Runden-Modell aus β: dort ist der Mangel ein fortlaufender Sachverhalt, hier ist jede Abnahme ein eigener Rechtsakt. |
| Vorbehalte als Verweis, nie als Kopie | L20. Eine Kopie wäre eine zweite Wahrheit und würde beim nächsten Statuswechsel des Mangels veralten. Dass das Protokoll trotzdem den **Stand zum Abnahmezeitpunkt** zeigen muss (AC-45γ.17), löst der Druck: er nennt den Mangel mit seinen Stammdaten, nicht mit seinem heutigen Status. |
| Neue Vorbehalte über die β-Funktion, nicht per Direkteinfügung | Die β-Funktion vergibt die fortlaufende Mangelnummer unter Sperre, prüft Gewerk und Abschnitt gegen das Projekt und schreibt das Anlege-Ereignis. Sie zu umgehen hieße, drei Regeln zu duplizieren. |
| Eigene Beleg-Ablage statt Erweiterung der geteilten Verknüpfung | Q-γ1. Die Adressprüfung wird als **Funktion** wiederverwendet — die Wiederverwendung liegt dort, wo die Sicherheitslogik sitzt, nicht in der Tabelle. |
| Deutsche Schlüsselwerte | α und β haben für dieselbe Fläche deutsch gewählt (`gruen/gelb/rot`, `offen/in_bearbeitung/...`). Anzeigetexte kommen aus einer Zuordnung, nicht aus der Datenbank. |
| Druckseite statt Renderer | Muster steht zweifach (PROJ-131/132, β). Eigene Route außerhalb der App-Hülle mit **Sitzungs-Client** — **nie** Dienst-Schlüssel, sonst zeigt das Protokoll mehr, als der Aufrufer sehen darf. Kein neues Paket. |
| Nav wie α und β | Ein Eintrag in der geteilten Navigations-Registry, mit Projekttyp **und** Modulschalter. Bekannter Merge-Hotspot — eine Zeile, kein Umbau. |

### Register-Eingriffe

Die Objektarten-Liste trägt heute **94** Einträge (live gezählt). Die Abnahme-Tabelle und ihre drei
Kind-Tabellen treten ihr bei, damit Anlage und Löschung protokolliert werden. Ein **Feld-Audit** und
einen Zweig im Lese-Tor bekommt **nur die Abnahme-Tabelle** — die Kind-Zeilen sind mit dem Ergebnis
eingefroren und aus dem Protokoll reproduzierbar. Die **Ereignis-Tabelle bleibt außerhalb aller
Register**: sie *ist* das Protokoll, ein zweites Mitschreiben verdoppelte es (β-Präzedenz).

**Alle Register-Änderungen als Anker-Ersetzung aus der Live-Definition**, mit Eindeutigkeitsprüfung
des Ankers, Fail-Loud bei Nicht-Treffer, Post-Verifikation und Re-Grant. **Zusicherungen als Delta,
nie als absolute Bestandszahl** — die Lehre aus PROJ-130-α, die α sich selbst schon einmal eingefangen
hat: eine absolute Schwelle ist in einer der beiden Umgebungen (Prod / frisch aus den Dateien) zwangs-
läufig falsch. Und kein Anker darf auf Text prüfen, den dieselbe Migration zuvor selbst geschrieben hat
(der α-Fehler, der die Arbeitspaket-Whitelist still übersprang).

### Pflicht-Härtungskriterien (blockierend)

- **AC-45γH-1** Jede neue Tabelle trägt `tenant_id` und ist über die Haus-Helfer abgesichert; **keine** Schreib-Regeln, geschrieben wird nur über Funktionen.
- **AC-45γH-2** Keine Funktion nimmt einen Akteur-Parameter; der Aufrufer wird intern gelesen.
- **AC-45γH-3** `anon` **und PUBLIC** haben auf **keiner** neuen Funktion Ausführungsrecht — vollständig geprüft, nicht stichprobenhaft (PROJ-Y-114a-Lehre).
- **AC-45γH-4** Auswertungen sind `SECURITY INVOKER`, Schreibwege `SECURITY DEFINER`; alle mit gesetztem Suchpfad.
- **AC-45γH-5** Live-Pentest gegen Produktion mit **null Rückständen**, gegengeprüft über Zähler je berührter Tabelle.
- **AC-45γH-6** Der Pentest führt die verschärfte Rolle in **beide** Richtungen: ein Projekt-`editor` kann **nicht** ansetzen und **nicht** protokollieren; ein Betrachter erst recht nicht — belegt, nicht behauptet.
- **AC-45γH-7** Der Pentest prüft die Sperre am **Enkel**: eine Abnahme an einem Unterabschnitt blockiert das Entfernen der Wurzel, und die naive Ein-Knoten-Abfrage findet sie **nicht**.
- **AC-45γH-8** Aggregat-Leck-Probe: ein Fremder sieht in den Zählern **0**, obwohl Abnahmen existieren; mit Gegenprobe, dass die Probe nicht leer läuft.
- **AC-45γH-9** Der Einfrier-Wächter ist beidseitig belegt: ein protokolliertes Ergebnis lässt sich nicht ändern, ein Beleg **danach** sehr wohl.
- **AC-45γH-10** Regressionen **wörtlich** grün: α-Pentest, PROJ-Y-45a, **β-Pentest 53/53** und PROJ-103 A–G. β ist die engste Nachbarschaft — γ ruft seine Anlegefunktion.
- **AC-45γH-11** Register-Anker mit Post-Verifikation; die Geschwister-Zweige werden namentlich gegengeprüft.
- **AC-45γH-12** Der Nicht-Administrator im Feld-Audit-Vektor ist **synthetisiert**; unter Mandanten-Administration schließt das Lese-Tor kurz und der Vektor wäre falsch-grün.

### Risiken für `/qa`

1. **Verschachtelter Aufruf.** Das Protokollieren ruft die β-Anlegefunktion. Deren eigene Rollenprüfung ist *lockerer* (jedes Mitglied) als die von γ (nur Bauleitung/Administration) — der strengere Aufrufer entscheidet, aber das muss geprüft sein, nicht angenommen. Ebenso die Nummernvergabe unter Sperre innerhalb derselben Transaktion.
2. **Drei Sperren gegen Doppel-Termine.** Gewerk, Abschnitt und Gesamtprojekt brauchen je eine eigene Absicherung; die dritte ist die leicht zu vergessende.
3. **Die Kette.** Verweigert → Nachabnahme → verweigert muss lesbar und **druckbar** bleiben; jede Stufe behält ihr eigenes Datum.
4. **Frist-Randfälle.** Eine verweigerte Abnahme setzt **keine** Frist; das Feld bleibt leer statt auf einen Platzhalter zu zeigen.
5. **Die neutrale Entfernen-Meldung.** Nach der Verallgemeinerung muss der **β-Fall unverändert** funktionieren: blockiert nur ein Mangel, muss die Meldung weiterhin von Mängeln sprechen. Rot-Grün in beide Richtungen.

### Abweichungen von den Anforderungen

- **D-γ1** **AC-45γ.1** korrigiert: „genau ein Bezug" → **höchstens einer**; ohne Anker ist die Abnahme die des ganzen Projekts (Befund 2, Nutzer-Entscheid Q-γ7).
- **D-γ2** **AC-45γ.24** korrigiert: der Beleg lebt in einer **eigenen Bau-Ablage**, die beide Wege trägt, statt in der geteilten Verknüpfung aus PROJ-115 (Q-γ1). Die Adressprüfung wird wiederverwendet.
- **D-γ3** **AC-45γ.25** korrigiert: Teilnehmerquellen sind **Stakeholder · Nachunternehmer · Freitext**; das Projektmitglied entfällt als eigene Achse (Q-γ3).
- **D-γ4** **AC-45γ.9** präzisiert: das Einfrieren nimmt den **Belegverweis** aus, sonst wäre AC-45γ.24 unerfüllbar (Befund 3).
- **D-γ5** Die Verallgemeinerung der Entfernen-Meldung ist **Bestandsarbeit an α/β-Code** und damit streng genommen über den γ-Umfang hinaus. Sie wird trotzdem hier erledigt, weil γ sie sonst **falsch** machen würde (Befund 1). Der breitere Fall bleibt **PROJ-Y-45b**.

### Abhängigkeiten (Pakete)

**Keine.** Baumdarstellung, Druckseiten-Muster, Adressprüfung, Dokumentknoten-Auswahl und
Datumsfelder sind sämtlich im Bestand.

### Reihenfolge

`/backend` → `/frontend` → `/qa`, wie in β. Der Protokoll-Dialog ist ohne die Funktionen nicht
sinnvoll baubar, und die Vorbehalts-Kopplung entscheidet sich in der Datenschicht.

---

## Implementierungsnotizen — /backend γ (2026-08-19)

**Status: In Progress** · Datenschicht und Anwendungsschicht stehen, Oberfläche
und `/qa` offen. Zwei Migrationen in Prod, Live-Pentest **56/56 + 4/4 Nachlauf**,
null Rückstände über 13 Zähler.

### Was gebaut wurde

Migration `20260819120000_proj45_gamma_construction_acceptances` (in Prod):
vier Tabellen (`construction_acceptances` · `…_events` unveränderlich ·
`…_participants` · `…_reservations`), **nur Lese-Regeln** (geschrieben wird
ausschliesslich über Funktionen, β-/`dd_findings`-Rezept), neun Funktionen
(sechs Schreibwege `SECURITY DEFINER`, drei Auswertungen `SECURITY INVOKER`),
fünf Trigger, Register-Eingriffe per Anker-Ersetzung aus der Live-Definition.
Objektarten **94 → 95** wie vorhergesagt, Feld-Whitelist und Lese-Tor um je
einen Zweig, Ereignis-/Teilnehmer-/Vorbehalts-Tabellen bewusst **ausserhalb**
der Register.

Anwendungsschicht: sechs Routen (Liste mit sechs Server-Filtern · Ansetzen ·
Detail mit Teilnehmern/Vorbehalten/Verlauf · Ändern · Absagen/Protokollieren ·
Teilnehmer · Beleg · Kopfzahlen), Typen, Client-Wrapper, **33 Route-Tests** und
**10 Lib-Tests**. Kein neues Paket.

### Vier Befunde

**B-γ1 — die eigene Post-Condition war falsch, nicht die Rechte.** Der erste
Anwendungsversuch brach ab: *„schedule_construction_acceptance is still
executable by anon or PUBLIC"*. Die Prüfung suchte `%=X/%` im zusammengefügten
ACL-Text — das trifft auch `postgres=X/postgres` und `authenticated=X/postgres`
und meldete damit **jede korrekt vergebene** Funktion als Verstoss. PUBLIC
rendert mit **leerem Empfänger**, also als Eintrag, der mit `=` *beginnt*;
geprüft wird jetzt elementweise. Die Migration lief **atomar zurück** (0
Tabellen, 0 Funktionen, Register unverändert bei 94 — nachgemessen, nicht
angenommen). Ohne die Post-Condition wäre nichts passiert; sie hat einen Fehler
gefunden, nur eben ihren eigenen.

**B-γ2 — die α-Regression war seit einem Tag scope-blind.** Block 2 des
α-Pentests meldete drei FAIL. Diagnose statt Wertung: der als „fremd" gewählte
Nutzer ist der geteilte E2E-Nutzer — **kein** Mitglied des Zielmandanten
(`IT-Couch GmbH`), aber sehr wohl Mitglied von `[E2E] Bau Test`, und dort liegen
seit der β-QA vom 2026-08-19 **alle** Bau-Zeilen in Prod (1 Gewerk, 2
Abschnitte). Die Vektoren zählten **global** und behaupteten damit „sieht
nirgends etwas". Die RLS war korrekt, die Zusicherung war es nicht — dieselbe
Klasse wie PROJ-96/F-1 und PROJ-Y-78e. **Gehärtet statt abgeschwächt:** auf den
Zielmandanten begrenzt, plus ein schärferer Vektor „keine Zeile eines fremden
Mandanten sichtbar" und eine Gegenprobe, dass die Sonde nicht leer läuft — live
**5/5 PASS**. Block 1 des α-Pentests lief wörtlich **11/11**.

**B-γ3 — das Teilnehmer-Modell hätte die Stammdatenpflege blockiert.** Beim
Gegenlesen vor dem Anwenden gefunden: die erste Fassung verlangte „mindestens
eine der drei Quellen" und liess den Namen nur als Rückfall zu. Wird ein
Stakeholder später gelöscht, setzt `on delete set null` den Verweis auf leer —
die Zeile hätte **null** Quellen, die Bedingung schlüge zu, und **das Löschen
des Stakeholders wäre gescheitert**. Ein Protokoll darf keine Stammdatenpflege
verhindern. Gelöst durch einen **Namensschnappschuss** (`display_name` immer
gesetzt, aus der Quelle aufgelöst) — was für ein Abnahmeprotokoll ohnehin richtig
ist: es hält fest, wer an *jenem Tag* anwesend war. Dieselbe Begründung wie beim
eigenen Nachunternehmer-Bezug des Mangels in β. Pentest-Vektor **R3** belegt es.

**B-γ4 — eine Parallel-Session hat β's Wächter gehärtet, γ hatte die schwache
Form geerbt.** Beim Abgleich der Migrations-Zeitstempel fielen zwei fremde
Einträge desselben Tages auf; am Funktionsrumpf nachgelesen: PROJ-Y-148d hat
`enforce_construction_defect_event_immutability` den **Kaskaden-Ausstieg**
genommen (wirft jetzt bedingungslos). γs Wächter war nach β's **alter** Vorlage
gebaut und trug den Ausstieg noch. Der Kaskadenweg `projects →
construction_acceptances → _events` braucht keine Lösch-Regel und entfernt die
Elternzeile **zuerst** — ein Ausstieg auf Elternabwesenheit greift also bei
**jedem** Projekt-Abriss. γ hätte die gerade geschlossene Lücke eine Tabelle
weiter neu aufgerissen, ausgerechnet bei dem Objekt, das Gefahrenübergang und
Fristbeginn belegt. Fix-forward `20260819170000_…_no_cascade_exit` in Prod;
Nachlauf-Vektoren **P3/P4 PASS** (Projekt-Löschen wird mit `42501` abgelehnt,
Wächter ohne Ausstieg).

**Folge, die nicht liegen bleiben durfte:** damit ist
`construction_acceptance_events` die **sechste** unveränderliche Insel aus
PROJ-Y-148a. Der Registry-Eintrag ist ergänzt — mit **gemessenem**
`blocksHardDelete: true` (Rollback-Sonde gegen Prod) — und die drei
eingefrorenen Listen im zugehörigen Test sind nachgezogen. Der Einfrier-Test hat
dabei **von selbst** angeschlagen; das war sein Zweck („eine sechste Insel kann
nicht unbemerkt hereinrutschen"). Ohne diesen Nachzug wäre die ehrliche Absage
aus PROJ-Y-148a an γ vorbeigelaufen und der Nutzer hätte wieder einen rohen 500
bekommen.

### Bestandsarbeit: die Entfernen-Meldung (Tech-Design Befund 1)

Beide α-Entfernen-Pfade sprachen im `23503`-Zweig **wörtlich von Mängeln**
(Code `defects_present`). Mit γ wäre die Meldung **falsch** geworden, nicht bloss
unvollständig. Verallgemeinert über zwei neue INVOKER-Auskünfte
(`construction_trade_blocking_refs` / `construction_section_blocking_refs`), die
**Art und Bezeichnung** nennen, plus eine geteilte Meldungs-Lib: bei nur einer
Art bleibt der β-Wortlaut unverändert, bei beiden werden beide genannt, ohne
benennbare Zeilen nennt sie die zwei Arten, die den Bezug überhaupt halten
können. Neuer Fehlercode `references_present`. Die Teilbaum-Abfrage bleibt — ein
flacher Filter verfehlt genau die Abnahme am **Enkel** (Vektoren T2/T3).

β's Funktion `construction_section_blocking_defects` bleibt **bewusst bestehen**:
zwischen dem Anwenden der Migration und dem Ausliefern des Codes ruft die
deployte Route noch sie; sie zu ziehen wäre ein Bruch in genau diesem Fenster.
Aufräumen ist Folgearbeit (**PROJ-Y-45f**).

### Live-Nachweise (gegen Prod, alles zurückgerollt)

| Lauf | Ergebnis |
|---|---|
| γ-Pentest Block 1 (Rechte · Anker · Doppel-Termin · Protokoll · Einfrieren · Verlauf) | **31/31 PASS** |
| γ-Pentest Block 2 (Sperren · Umgehung · Fremdsicht · Aggregat-Leck) | **14/14 PASS** |
| γ-Pentest Block 3 (Rechtevergabe · Sicherheitsmodus) | **11/11 PASS** |
| γ-Pentest Block 4 (Ereignis-Wächter nach Fix-forward) | **4/4 PASS** |
| α-Pentest Block 1 wörtlich | **11/11 PASS** |
| α-Pentest Block 2 nach Härtung (B-γ2) | **5/5 PASS** |
| β-Pentest Block 3 wörtlich (Rechte/Modi — die geteilte Fläche) | **7/7 PASS** |
| Rückstände | **0** über 13 Zähler; Testmandant unverändert 20 Projekte |

Tragende Einzelvektoren: **C/C2** der Projekt-`editor` kann weder ansetzen noch
protokollieren (die verschärfende Richtung, belegt statt behauptet) · **I** die
dritte Absicherung greift, eine zweite **Gesamtabnahme** wird abgelehnt · **M**
Einfrieren und **M2** Beleg-Nachtrag in derselben Probe (beide Richtungen von
D-γ4) · **K2/K3** ein neuer Vorbehalt wird über die **β-Anlegefunktion** zu einem
echten Mangel mit Projekt, Gewerk und Status · **T2/T3** die naive Ein-Knoten-
Abfrage findet die Abnahme am Enkel **nicht**, die Teilbaum-Auskunft schon ·
**W/W2** Aggregat-Leck-Probe mit Gegenprobe · **U1–U4** kein Schreibweg an den
Funktionen vorbei, geprüft als **Mandanten-Admin**.

### Gates

ESLint **0** · tsc **13 = Baseline / 0 neu** (auch nach `rm -rf .next`, gegen
die PROJ-Y-143e-Messfalle) · vitest **3383/3383** (davon **43 neu** in dieser
Slice) · Build clean, **alle 6 Routen registriert** · migration-naming 0 Fehler ·
index-scope 0 Fehler · Advisors **0 ERROR** (die 6 γ-WARN sind die beabsichtigten
`authenticated`-ausführbaren Schreib-RPCs, dieselbe Kategorie wie α/β).

Rot-Grün ausgeführt statt behauptet, über Dateikopie zurückgesetzt (nie
`git checkout` — PROJ-130-δ2/F-3): ohne die `P0001`-Abbildung fallen 2 Tests,
ohne die Projektzugehörigkeits-Prüfung 1, danach wieder 33/33.

### Abweichungen vom Tech Design

- **D-γ6** Der **Beleg liegt als drei Spalten** auf der Abnahme, nicht in einer
  eigenen Tabelle. AC-45γ.24 verlangt *genau einen* Beleg je Abnahme — eine
  1:1-Tabelle wäre übernormalisiert, und die Spaltenform bringt drei Dinge
  geschenkt: der Beleg fällt automatisch in die Feld-Whitelist (die Änderung
  **nach** der Abnahme ist damit auditiert, und genau das ist der einzige nach
  dem Einfrieren erlaubte Schreibvorgang), der Einfrier-Wächter muss nur Spalten
  ausnehmen statt eine Tabelle, und es entsteht keine zusätzliche Objektart.
- **D-γ7** Die Adressprüfung wird als **Funktion** aus PROJ-115 wiederverwendet
  (`validateExternalUrl`), die Ablage selbst ist eigen — die Wiederverwendung
  liegt dort, wo die Sicherheitslogik sitzt. Kein serverseitiger Abruf, nirgends.
- **D-γ8** Die Liste gatet `view`, die Schreibrouten `edit`; die **verschärfte**
  Regel (nur Projektleitung/Bauleitung oder Mandanten-Administration) lebt
  ausschliesslich in den Funktionen. Bewusst anders als β, das `view` gaten muss,
  weil dort auch Betrachter anlegen dürfen.
- **D-γ9** Die Teilnehmerzeile trägt einen **Namensschnappschuss** (B-γ3).
- **D-γ10** Der Fehlercode der Entfernen-Absage heisst jetzt
  `references_present` statt `defects_present`; zwei Bestands-Route-Tests sind
  entsprechend nachgezogen — die alte Zusicherung wäre mit γ **falsch** gewesen.
- **D-γ11** `P0001` ist gegenüber β **neu** in der Fehlerabbildung (→ 409). β
  kannte den Code nicht und hätte die drei benennenden Absagen auf 500 gelegt.

### Nicht in dieser Slice gebaut

Oberfläche (Reiter „Abnahmen", Ansetzen-/Protokoll-Maske, Detailansicht,
Druckseite „Abnahmeprotokoll", Zähler auf der α-Gewerkfläche) → `/frontend`.
Authentifizierter Browser-Durchlauf, Regressionen wörtlich in voller Breite und
die 12 Härtungskriterien als geschlossene Abnahme → `/qa`. Der
Playwright-Auth-Gate-Spec (`tests/PROJ-45-gamma-acceptances.spec.ts`, 8 Fälle)
ist geschrieben, aber in diesem Schritt **nicht ausgeführt**.

### Neue Folgearbeit

- **PROJ-Y-45f** — `construction_section_blocking_defects` (β) ist nach dem
  γ-Deploy ohne Aufrufer und kann gezogen werden. Bewusst nicht jetzt: zwischen
  Migration und Code-Deploy ruft die deployte Route sie noch.

---

## Implementierungsnotizen — /frontend γ (2026-08-20)

**Status: In Progress** · Oberfläche steht, `/qa` offen. Keine Migration, kein
neues Paket, kein neuer Backend-Code — **eine** Ausnahme, und die ist ein
gefundener Fehler (siehe F-γ1).

### Was gebaut wurde

Projektraum-Reiter **„Abnahmen"** (`abnahmen`) mit Kopfzahlen je Ergebnis, drei
serverseitigen Filtern (Status · Bezug · Gewerk) und Zeilenaktionen; **eine**
Maske für Ansetzen *und* Ändern; eine eigene Maske für das **Protokollieren**;
Detailansicht als Seitenblende mit unveränderlicher Zeitleiste, Vorbehalten,
Teilnehmern, Beleg und Absage; chrome-lose **Druckseite** „Abnahmeprotokoll"
ausserhalb der App-Hülle (Sitzungs-Client, nie Dienst-Schlüssel); **ein**
Eintrag in der geteilten Navigations-Registry; Abnahmestand je Gewerk auf der
α-Fläche.

### F-γ1 — die Fristrechnung existierte zweimal und wich ab (gemessen, behoben)

Die Gewährleistungsfrist wird beim Protokollieren in der Datenbank
**festgeschrieben**; die Maske muss sie schon vorher zeigen. Damit existiert die
Rechnung zwangsläufig zweimal — und die naive TypeScript-Fassung war falsch:

| | Postgres `+ make_interval(months => n)` | naives `setUTCMonth` |
|---|---|---|
| 2026-01-31 + 1 Monat | **2026-02-28** | 2026-03-03 |
| 2026-08-31 + 6 Monate | **2027-02-28** | 2027-03-03 |

Postgres **klemmt** am Monatsende, JavaScript **läuft über**. Die Maske hätte dem
Nutzer also ein anderes — rechtlich relevantes — Fristende angezeigt als
danach gespeichert wird. Behoben durch eine geteilte Lib
(`src/lib/construction/acceptances.ts`) mit ausdrücklicher Klemmung; die fünf
Datumspaare sind **live gegen Prod gemessen** und im Test eingefroren. Rot-Grün
ausgeführt: ohne die Klemmung fallen 3 der 10 Fälle.

Das war der Grund, überhaupt eine Lib anzulegen — nicht Aufräumen: der Test
braucht einen Angriffspunkt, und eine Funktion im Dialog hat keinen.

### Entscheidungen, die die Oberfläche treffen musste

**Der dritte Bezug ist eine benannte Wahl, kein „nichts ausgewählt".** Die
Auswahl bietet „Ein Gewerk / Ein Bauabschnitt / **Das ganze Projekt
(Gesamtabnahme)**" an. Die ankerlose Abnahme als Abwesenheit zu bauen hätte
genau die Verwechslung eingebaut, die D-γ1 beseitigt hat.

**Beim Ändern verschwindet der Bezug — und das wird gesagt.** Er gehört zur
Identität der Abnahme, und die Änderungs-Funktion nimmt ihn gar nicht an. Statt
ihn auszugrauen erklärt die Maske es.

**Teilnehmer werden VOR dem Ergebnis gesendet.** Sie frieren mit dem Ergebnis
ein; die Datenbank nimmt sie danach nicht mehr an. Die Maske sendet sie darum
zuerst und dann das Ergebnis. Schlägt das Protokollieren fehl, bleibt die
Teilnehmerliste erhalten und der Vorgang ist wiederholbar — die Reihenfolge ist
bewusst gewählt, nicht zufällig.

**Der Einfrier-Zustand wird ausgesprochen.** Nach dem Ergebnis verschwinden die
Zeilenaktionen, und die Detailansicht sagt: „Ergebnis, Termin, Teilnehmer und
Vorbehalte sind festgeschrieben; nur der Beleg lässt sich noch nachtragen."
Ohne diesen Satz wäre die einzige erlaubte Ausnahme (D-γ4) nicht erkennbar.

**Nach einer Verweigerung wird „Nachabnahme" angeboten, nicht „bearbeiten".**
Die Maske übernimmt den Bezug und verweist auf die alte Abnahme, die
unverändert stehen bleibt (L19).

**Die Abdeckung des Abschnitts-Teilbaums wird NICHT im Browser nachgebaut.** Die
Maske schlägt die Mängel des direkten Abschnitts als Vorbehalt vor; die
Teilbaum-Prüfung bleibt allein in der Datenbank. Ein zweiter Baumlauf im Browser
wäre eine zweite Wahrheit — und die naive Ein-Knoten-Variante ist genau der
Fehler, den Pentest-Vektor T2 festhält.

**Das Rechte-Gate ist erklärt, nicht nachgebaut.** Die Fläche fragt das
bestehende Hausprädikat `manage_members` (= `admin | lead`) — deckungsgleich mit
der Prüfung in den Funktionen und bewusst **nicht** `edit_master`, das den
Projekt-`editor` einschliesst, den L22 ausschliesst. Entschieden wird weiter in
der Datenbank; die Oberfläche blendet nur aus.

### Nachweise

| Lauf | Ergebnis |
|---|---|
| Playwright γ-Auth-Gates (8 Routen + 2 Seiten) | **10/10** chromium |
| Playwright α/β-Konstruktions-Auth-Gates, wörtlich | **18/18** |
| Visual-Regression (authentifiziert) | **3× 9/9**, **keine Baseline neu aufgenommen** |
| vitest | **3393/3393** (+10 in diesem Schritt) |

Der **erste** Visual-Lauf meldete 2 Fehlschläge (Stammdaten, Mandanten-
Einstellungen) — er lief direkt nach `rm -rf .next && npm run build`, also auf
kaltem Kompilat; drei Folgeläufe waren durchgehend grün. Kaltstart-Klasse
(PROJ-67/AC-9, PROJ-138), kein Produktbefund. Festgehalten statt weggelassen,
weil ein einzelner grüner Wiederholungslauf allein nichts belegt.

Die neue Navigations-Sektion kam **ohne Testanpassung** durch
(`method-templates` 125/125): α hat die Invariante damals auf ihre Absicht
umgestellt („mindestens eine Sektion je Modul") statt auf genau eine — der
Nutzen zeigt sich jetzt zum zweiten Mal.

### Gates

ESLint **0** (repo-weit) · tsc **13 = Baseline / 0 neu**, auch nach dem Build ·
vitest **3393/3393** · Build clean, **alle 6 Routen und beide Seiten
registriert** · migration-naming 0 · index-scope 0.

### Abweichungen (/frontend γ)

- **D-γ12** Die Fristrechnung liegt **doppelt** vor (SQL + TypeScript) — nicht
  vermeidbar, weil die Maske sie vor dem Speichern zeigen muss. Beide Seiten
  sind über fünf live gemessene Datumspaare gepinnt; die TS-Seite klemmt
  ausdrücklich wie Postgres (F-γ1).
- **D-γ13** Der Beleg ist in dieser Slice nur als **externe Adresse**
  anhängbar. Der zweite von L23 zugelassene Weg (Verweis auf einen
  Dokumentknoten) ist in der Datenbank vollständig vorhanden und geprüft
  (Spalte, Fremdschlüssel, Projekt-Konsistenz im Wächter, `set`-Funktion), hat
  aber noch keine Auswahl in der Oberfläche → **PROJ-Y-45g**. Bewusst so
  geschnitten: der Knoten-Picker ist eine eigene, testbare Fläche, und der
  externe Weg deckt den Regelfall „unterschriebenes Exemplar liegt im System des
  Kunden".
- **D-γ14** Die Detailansicht nutzt eine kleine Funktion-im-JSX, um TypeScript
  beide Verengungen (`detail` und `detail.acceptance`) zugleich sehen zu lassen.
  Unschön, aber typsicher — die Alternative wäre eine nicht-null-Behauptung
  gewesen, und die hätte den Nutzen der Prüfung aufgegeben.
- **D-γ15** Kein authentifizierter Browser-Durchlauf in diesem Schritt: die
  Fläche ist projekttyp- **und** modul-gegatet, und der geteilte E2E-Mandant hat
  `construction` aus. Das Einschalten hätte die frisch stabilisierten
  Visual-Baselines berührt (PROJ-Y-143f/143l) → `/qa`, dort mit eigener
  Bau-Fixture wie in β.
- **D-γ16** `loading` im Detail-Hook ist **abgeleitet**, nicht gesetzt
  (`react-hooks/set-state-in-effect` ist Hausregel-verboten). Nebeneffekt und
  Absicht: ein `refresh()` zeigt weiter den vorhandenen Stand statt eines
  Skelett-Aufblitzens.

### Nicht in dieser Slice gebaut

Authentifizierter Zwei-Personen-Durchlauf, echter Druck nach PDF, die 12
Härtungskriterien als geschlossene Abnahme und die Regressionen in voller Breite
→ `/qa`. Dokumentknoten-Auswahl für den Beleg → PROJ-Y-45g.

### Neue Folgearbeit

- **PROJ-Y-45g** — Beleg als **Dokumentknoten** auswählbar machen
  (DMS-Picker-Muster aus PROJ-77-γ). Datenbankseite steht und ist geprüft, es
  fehlt allein die Auswahl in der Oberfläche.

---

## QA Test Results — γ (2026-08-20)

**Verdikt: PASS — 0 Critical / 0 High / 0 Medium in γ.** 29/29 Akzeptanzkriterien,
12/12 Härtungskriterien (eines mit **benannter, nicht von γ verursachter**
Abweichung). Status → **Approved**.

Der von `/frontend` offen gelassene Kern ist ausgeführt: der **authentifizierte
Durchlauf in echten Sitzungen** (Betrachter → Bauleitung → Protokoll →
Einfrieren → Beleg → Druck), ein **echter Druck nach PDF**, die Regressionen in
voller Breite und ein Rot-Team über den Pentest hinaus.

### Live gegen Prod — alles zurückgerollt oder aufgeräumt

| Lauf | Ergebnis |
|---|---|
| γ-Pentest Block 1 (Rechte · Anker · Doppel-Termin · Protokoll · Einfrieren · Verlauf) | **31/31 PASS** |
| γ-Pentest Block 2 (Sperren · Umgehung · Fremdsicht · Aggregat-Leck) | **14/14 PASS** |
| γ-Pentest Block 3 (Rechtevergabe · Sicherheitsmodus) | **11/11 PASS** |
| γ-Pentest Block 4 (Ereignis-Wächter nach Fix-forward) | **4/4 PASS** |
| **Rot-Team-Supplement O–W2** (neu in `/qa`) | **11/11 PASS** |
| Regression α (Block 1 + gehärteter Block 2) | **18/18 PASS** |
| Regression PROJ-Y-45a | **9/9 PASS verbatim** |
| Regression β (Block 1 · Block 2 · Block 3) | im QA-Lauf **52/53** (`Z` fiel, Ursache PROJ-Y-148d, nicht γ); auf dem Deploy-Stand **53/53** — 148d hat `Z` an die geänderte Zusage angepasst, `Z_project_hard_delete_blocked=PASS(42501)` nachgemessen (siehe F-γ4) |
| Regression PROJ-103 A–G | **7/7 PASS verbatim** |
| Rückstände | **0** über 14 Zähler; Fixture unverändert (1 Katalog-Gewerk · 2 Abschnitte · 1 Projekt-Gewerk), 29 lebende Projekte, **0 deaktivierte Trigger** |

### Der authentifizierte Durchlauf (schliesst D-γ15)

`tests/PROJ-45-gamma-acceptance-chain.spec.ts`, **3× 3/3 chromium**, in der
Bau-Fixture-Lane aus β (eigener Mandant, `construction` an, eigene Bauleitung
und eigener Betrachter — der geteilte `[E2E]`-Mandant wurde bewusst **nicht**
angefasst, PROJ-Y-143f/143l).

Tragend sind die **negativen** Zusicherungen:

- **Der Betrachter bekommt „Termin ansetzen" gar nicht zu sehen** — und im
  selben Test wird gegengeprüft, dass derselbe Betrachter beim **Mangel**
  „Mangel erfassen" sehr wohl sieht. Ohne diese zweite Hälfte belegte der Test
  nur „Knopf fehlt", nicht „hier strenger als dort" — und genau das ist L22.
- **Nach dem Protokollieren verschwinden die Zeilenaktionen** (kein
  „Protokollieren", kein „Termin ändern").
- **Der Beleg geht danach trotzdem** — die einzige Ausnahme (D-γ4), und die
  Datenbank bestätigt, dass das Ergebnis dabei **nicht** mitgewandert ist.
- **Nach einer Verweigerung** erscheint „Nachabnahme", **nicht** „Bearbeiten",
  und die Datenbank hält **keine** Frist (AC-45γ.20).
- Die **Gesamtabnahme** (ankerloser Fall, D-γ1) ist über die Oberfläche
  angesetzt und in der Datenbank mit `trade_id IS NULL AND section_id IS NULL`
  gegengeprüft — der Fall, den die ursprüngliche Anforderung über den
  Wurzel-Abschnitt lösen wollte und der so nicht baubar war.

**Echter Druck nach PDF:** die Druckseite wird geöffnet, die vier
Pflichtbestandteile aus AC-45γ.22 einzeln geprüft (Abnahmedatum,
Gewährleistung, der verknüpfte Vorbehalt **mit seinem Titel**,
Unterschriftenzeile), und `page.pdf()` liefert einen Puffer mit `%PDF-`-Kopf und
> 1000 Byte.

### Nachweise je Akzeptanzkriterium

| AC | Nachweis |
|---|---|
| AC-45γ.1 | Pentest **D** (beide Anker → 23514) + **E** (ankerlos = Gesamtabnahme) + Route-Test „refuses both anchors" + **Browser**: Gesamtabnahme angesetzt und in der DB ankerlos gegengeprüft |
| AC-45γ.2 | Pentest **F** (projektfremdes Gewerk → 23514), Rot-Team **O** (fremdes Projekt → 42501) |
| AC-45γ.3 | Pentest **A** (Termin Pflicht, Titel/Bemerkung optional), Maske: `#acc-date` erforderlich |
| AC-45γ.4 | Pentest **H** (zweiter Termin am Gewerk → P0001) + **I** (zweite **Gesamtabnahme** → P0001, die dritte Absicherung) |
| AC-45γ.5 | Pentest **P**-Reihe + Detailansicht: Absage mit Pflichtbegründung |
| AC-45γ.6 | Pentest **A** (`nr=1`), Nummer je Projekt fortlaufend |
| AC-45γ.7 | Pentest **L** (verweigert ohne Begründung → 23514), **J2**, **K2**; Rot-Team **P** (Injektion im Ergebniswert → 22023) |
| AC-45γ.8 | Pentest **B** (Betrachter) + **C/C2** (Projekt-**Editor** kann weder ansetzen noch protokollieren) + **Browser**: Betrachter sieht den Knopf nicht |
| AC-45γ.9 | Pentest **M** (42501) + **Browser**: Zeilenaktionen verschwinden |
| AC-45γ.10 | Pentest **O** (nur nach Verweigerung) + **O2** (Kette verweist) + **Browser**: „Nachabnahme" statt „Bearbeiten" |
| AC-45γ.11 | Pentest **J2** (`accepted_on` getrennt vom Termin), Maske zeigt den angesetzten Termin als Hinweis |
| AC-45γ.12 | Pentest **Q** (`angesetzt>verschoben`), Detailansicht: unveränderliche Zeitleiste |
| AC-45γ.13 | **Browser**: die offenen Mängel des Bezugs sind **vorausgewählt** (geprüft, nicht gesetzt) |
| AC-45γ.14 | Pentest **K2/K3** (neuer Vorbehalt wird über die β-Anlegefunktion ein **echter** Mangel mit Projekt, Gewerk, Status) + **Browser**: der Vorbehalt zeigt auf den Mangel dieses Laufs |
| AC-45γ.15 | Pentest **K** (unter Vorbehalt ohne Vorbehalt → 23514) + **J** (abgenommen bei offenem Mangel → P0001) + **J2** (mit Bestätigung) |
| AC-45γ.16 | **Druck**: jeder Vorbehalt mit Titel, Ort, Schweregrad, Frist |
| AC-45γ.17 | Druckseite liest die **Stammdaten** des Mangels, ausdrücklich **nicht** seinen heutigen Status (im Code festgehalten und begründet) |
| AC-45γ.18 | **Browser**: Dauer wählbar, nichts vorbelegt; Pentest **N** (48 Monate) |
| AC-45γ.19 | Pentest **N** (Fristende = Abnahmedatum + Monate, gegen `make_interval` geprüft) + Liste/Protokoll zeigen es |
| AC-45γ.20 | Pentest **L2** (Frist bei Verweigerung → 23514) + **L3** (kein Fristende) + **Browser**-Gegenprobe in der DB |
| AC-45γ.21 | **Echter `page.pdf()`** mit `%PDF-`-Kopf |
| AC-45γ.22 | Vier Pflichtbestandteile einzeln im Browser geprüft |
| AC-45γ.23 | Druckseite nutzt den Sitzungs-Client; Auth-Gate-Spec: ohne Sitzung 307 und **weder Überschrift noch Inhalt** im Rumpf |
| AC-45γ.24 | Pentest **M2** (Beleg nach dem Einfrieren) + Route-Tests (SSRF-Prüfung, Adresse **oder** Knoten) + Rot-Team **R** (http → 23514) und **S** (fremder Dokumentknoten → 23514) + **Browser** |
| AC-45γ.25 | Pentest **R** (zwei Quellen → 23514) + **R2** (Namensschnappschuss) + **R3** (Stakeholder löschbar) |
| AC-45γ.26 | Route-Tests (Modul-Absage durchgereicht) + Auth-Gate-Spec |
| AC-45γ.27 | Pentest **S** (Gewerk) + **T** (Wurzel wegen **Enkel**) + **T2** (naive Abfrage findet nichts) + **T3/T4** (Auskunft benennt die Art) |
| AC-45γ.28 | Pentest **V/V2** (Fremder sieht nichts) + **W** (Aggregat-Leck) + **W2** (Gegenprobe) + Rot-Team **W/W2** (fremde Auswertung leer) |
| AC-45γ.29 | Route-Tests: sechs Filter serverseitig, `gesamt` über **beide** Ankerspalten; bogus-Werte ignoriert |

### Härtungskriterien

| # | Ergebnis |
|---|---|
| AC-45γH-1 | ✅ `tenant_id` überall, **0 Schreib-Policies** auf allen vier Tabellen (Block 3 / G6) |
| AC-45γH-2 | ✅ keine Funktion nimmt einen Akteur-Parameter (Signaturen geprüft) |
| AC-45γH-3 | ✅ `anon` **und PUBLIC** ohne EXECUTE über **alle 11** Funktionen — vollständig, nicht stichprobenhaft (G1/G1b) |
| AC-45γH-4 | ✅ 3 Auswertungen INVOKER, 6 Schreibwege DEFINER, alle 11 mit `search_path` (G4a/G4b/G5) |
| AC-45γH-5 | ✅ Live-Pentest, **0 Rückstände** über 14 Zähler |
| AC-45γH-6 | ✅ **C/C2** — der Projekt-`editor` kann weder ansetzen noch protokollieren; Betrachter erst recht nicht (**B**), im Browser gegengeprüft |
| AC-45γH-7 | ✅ **T/T2/T3** — die Abnahme am **Enkel** blockiert die Wurzel, die naive Ein-Knoten-Abfrage findet sie **nicht** |
| AC-45γH-8 | ✅ **W** (Fremder sieht `total=0`) mit **W2** als Gegenprobe (Berechtigter sieht 2) |
| AC-45γH-9 | ✅ **M** (eingefroren) **und M2** (Beleg danach) in derselben Probe — beide Richtungen |
| AC-45γH-10 | ✅ α 18/18, PROJ-Y-45a 9/9, PROJ-103 7/7, **β 53/53** — alle wörtlich grün. Im QA-Lauf war β 52/53; der eine Fehlschlag (`Z`) war von **PROJ-Y-148d** verursacht und nachweislich nicht von γ. 148d hat den Vektor inzwischen an die geänderte Zusage angepasst; auf dem Deploy-Stand `Z_project_hard_delete_blocked=PASS(42501)` nachgemessen (siehe F-γ4) |
| AC-45γH-11 | ✅ Register-Anker mit Post-Verifikation; Geschwister-Zweige namentlich geprüft; Objektarten 94 → **95** wie vorhergesagt |
| AC-45γH-12 | ✅ der Nicht-Administrator ist **synthetisiert**; `S2_not_admin=PASS` in der β-Regression schliesst Falsch-Grün aus |

### Befunde

**F-γ1 (Low, offen — NICHT γ):** die Konsole meldet auf dem durchlaufenen Pfad
`Select is changing from uncontrolled to controlled`. **Zugeordnet, nicht
vermutet:** das Muster `value={… : undefined}` existiert im ganzen Repo genau
**einmal** — in `construction-defect-dialog.tsx:241`, dem bereits registrierten
Befund **PROJ-Y-45d** aus β. Alle sieben γ-Selects übergeben eine Zeichenkette.
Durch Ausschluss bestätigt: nur der Test, der β's Dialog öffnet, erzeugt die
Meldung; die beiden rein-γ-Tests nicht. **Nebennutzen:** γs Ketten-Spec
reproduziert PROJ-Y-45d jetzt zuverlässig — der Befund hat damit erstmals einen
Regressionslauf.

**F-γ2 (Low, offen → PROJ-Y-45i):** die **Detailansicht hat im Ladezustand
keinen zugänglichen Namen.** Radix meldet `DialogContent requires a DialogTitle`
und eine fehlende Beschreibung. Ursache im eigenen Code: `SheetHeader`/
`SheetTitle` stehen nur im geladenen Zweig, der Skelett-Zweig hat keinen Titel.
**Nur unter Last sichtbar** — im isolierten Lauf lädt das Detail schnell genug,
dass der getitelte Zweig zuerst rendert; im 3-Worker-Lauf tritt es auf. WCAG-
relevant (ein Bildschirmleser bekommt einen namenlosen Dialog), fachlich
harmlos, trivial zu beheben (verdeckter Titel im Skelett-Zweig). Bewusst
**nicht** in `/qa` behoben — Bugfixes gehören in `/frontend`.

**F-γ3 (Info, in `/qa` behoben — eigener Testfehler):** die erste Fassung der
Ketten-Spec nagelte die Zahl der Vorbehalte auf **1**. Beim zweiten Lauf fiel
sie: die Maske hakt **alle** offenen Mängel des Gewerks vor (AC-45γ.13,
korrektes Verhalten), und wie viele das sind, hängt am Bestand. **Das Produkt
war richtig, die Zusicherung war rückstandsabhängig.** Umgestellt auf „der
Mangel dieses Laufs ist verknüpft, und jeder Vorbehalt zeigt auf einen echten
Mangel"; danach **3× 3/3**.

**F-γ4 (fremd verursacht; Hälfte 1 im Deploy-Lauf als erledigt nachgemessen,
Hälfte 2 offen → Folgearbeit im 148d-Zweig):**
**PROJ-Y-148d hat β's QA-Infrastruktur gebrochen**, an zwei Stellen, beide
gemessen:

1. **β's Pentest-Vektor `Z`** sicherte zu, dass ein Projekt-Hard-Delete *trotz*
   Mängeln und unveränderlichen Ereignissen **gelingt**. Im QA-Lauf meldete er
   `FAIL(42501)` — 148d hatte dem Wächter den Kaskaden-Ausstieg genommen, also
   galt die Zusage nicht mehr.
   **Erledigt, im `/deploy`-Lauf nachgemessen (2026-08-20):** 148d hat den
   Vektor in seinem eigenen Merge (`b38c11d`) **umgedreht** statt ihn stehen zu
   lassen — er erwartet jetzt die Blockade und meldet auf dem rebasten
   Deploy-Stand gegen Prod `Z_project_hard_delete_blocked=PASS(42501)`.
   **β ist damit wieder 53/53.** Die im QA-Abschnitt festgehaltene Zahl 52/53
   war zum Messzeitpunkt richtig und ist überholt; sie bleibt zur
   Nachvollziehbarkeit stehen.
2. **β's authentifizierte Spec** fällt in ihrem **Teardown** — **weiter offen**,
   auf dem Deploy-Stand erneut gemessen: **5 failed / 1 did not run /
   12 passed**, Stacktrace unverändert auf `deleteOrThrow → removeRunDefects`.
   `construction_defects` ist nicht mehr löschbar. 148d hat `b38c11d` nur den
   Pentest angefasst, **nicht** `tests/PROJ-45-beta-defects.spec.ts` und nicht
   `tests/fixtures/cleanup.ts` (am Merge-Diff geprüft). `deleteOrThrow` tut
   dabei genau das, wofür PROJ-Y-143o ihn eingebaut hat — laut scheitern statt
   still anhäufen. Die Rückstände dieses Messlaufs sind über den
   Runbook-Weg entfernt (0 Mängel, 0 Ereignisse, 0 Audit-Zeilen,
   0 deaktivierte Wächter).

**Ursache belegt, nicht geschlussfolgert:** γs beide Migrationen enthalten
**0 Definitionen** von `enforce_construction_defect_event_immutability`; der
einzige Treffer ist ein **Kommentar**. Die Rückstände dieses β-Laufs wurden über
den Runbook-Weg entfernt (0 Rückstände nachgemessen).

### Betriebsbefund: γs Zeilen sind by design nicht löschbar

Der γ-Fix-forward macht `construction_acceptance_events` append-only **ohne**
Kaskaden-Ausstieg (Gleichzug zu PROJ-Y-148d). Gemessen: `delete from
construction_acceptances` → **42501**, auch als Dienst-Schlüssel; unter
`session_replication_role = replica` geht es (1 Zeile). Fachlich richtig — ein
Abnahmeprotokoll soll nicht verschwinden, und der vorgesehene Weg für einen
Fehl-Eintrag ist „absagen". **Folge für die Testinfrastruktur:** ein
authentifizierter γ-Durchlauf kann sich nicht selbst aufräumen. Diese QA hat die
Zeilen deshalb über den Runbook-Weg entfernt, streng auf den Bau-Mandanten und
auf `[E2E γ]`-Kennungen begrenzt, mit Vorbedingungen (Mandantenname, gesammelte
Kennungen, Zählerstand fremder Projekte) und Nachprüfung (0 Rückstände, **0
deaktivierte Trigger**). Als **PROJ-Y-45h** registriert.

### Automatisierte Läufe

| Suite | Ergebnis |
|---|---|
| vitest | **3393/3393** (408 Dateien) |
| Playwright γ-Auth-Gates (8 Routen + 2 Seiten) | **10/10** chromium |
| Playwright γ-Kette (authentifiziert, 3 Sitzungsrollen) | **3× 3/3** chromium |
| Playwright α/β-Konstruktions-Auth-Gates | **18/18** wörtlich |
| Visual-Regression (authentifiziert) | **9/9 ohne Neuaufnahme** |
| ESLint · tsc · Build · migration-naming · index-scope | 0 · **13 = Baseline/0 neu** · clean · 0 · 0 |
| Supabase-Advisors | **0 ERROR** / 149 WARN, davon 6 γ-bezogen und alle aus **einer** beabsichtigten Kategorie (`authenticated`-ausführbare Schreib-RPCs) |

### Abweichungen (`/qa`)

- **D-γ17** Mobile Safari bleibt umgebungsbedingt übersprungen (WebKit-Host-
  Bibliotheken, PROJ-67/F2); Firefox ist gar nicht konfiguriert. Alle Zahlen
  sind chromium.
- **D-γ18** Der Beleg ist nur als **externe Adresse** durchgefahren; der
  Dokumentknoten-Weg ist auf DB-Ebene geprüft (Rot-Team **S**), hat aber noch
  keine Auswahl in der Oberfläche (D-γ13 → PROJ-Y-45g).
- **D-γ19** Die Teilnehmer-Erfassung ist über die **Funktionen** und die
  Pentest-Vektoren R/R2/R3 belegt, nicht über die Maske: der Browser-Durchlauf
  protokolliert ohne Teilnehmer, weil die Repeater-Zeilen keine stabilen
  Kennungen tragen. Die Maske selbst wurde beim Durchlauf gerendert und
  bedient; die Zusicherung liegt auf der Datenschicht.
- **D-γ20** `deleteOrThrow` ist in der γ-Kette bewusst **nicht** benutzt — er
  würde bei jedem Lauf zu Recht scheitern (siehe Betriebsbefund). Der Verzicht
  ist im Kopf der Datei begründet, damit niemand ihn für Nachlässigkeit hält.
- **D-γ21** Der erste Visual-Lauf dieses Tages meldete zwei Fehlschläge auf
  kaltem Kompilat direkt nach `rm -rf .next`; danach durchgehend grün
  (Kaltstart-Klasse PROJ-67/AC-9). Festgehalten, weil ein einzelner grüner
  Wiederholungslauf allein nichts belegt.
- **Messnotiz:** `--reporter=line | tail -1` kann eine **veraltete**
  Fortschrittszeile zeigen (der Reporter überschreibt sie). Zwei Läufe meldeten
  so „2 passed", der `list`-Reporter wies 3/3 aus. Keine Produktaussage, aber
  eine Falle für künftige Messungen.

### Neue Folgearbeit

- **PROJ-Y-45h** — Teardown für die Bau-E2E-Lane: γs Abnahmen und β's Mängel
  sind nicht mehr löschbar, beide Specs brauchen einen sanktionierten,
  mandantengebundenen Aufräumschritt (Klasse PROJ-Y-45e / PROJ-Y-130h).
- **PROJ-Y-45i** — verdeckter Titel im Ladezustand der Abnahme-Detailansicht
  (F-γ2).
- **Für den 148d-Zweig** (nicht γ): β's **QA-Teardown** gehört an die geänderte
  Zusage angepasst (F-γ4, Hälfte 2 — Hälfte 1, der Pentest-Vektor `Z`, ist von
  148d selbst erledigt und im `/deploy`-Lauf grün nachgemessen). Sachlich
  dieselbe Lücke wie **PROJ-Y-45h**, nur eine Slice früher.

---

## PROJ-45-δ — Bauspezifische Terminsignale (Requirements 2026-08-20)

**Status: Planned** · vierter Sub-Slice, baut auf dem deployten α (Gewerke + Bauabschnitte),
β (Mängel) und γ (Abnahmen) auf. Enthält **AC-45β.18**, die aus β zurückgestellte ursprüngliche
Anforderung — und damit den Grund, dass PROJ-45 heute `alpha` statt `full` trägt.

Bis hierher ist die Extension eine **Erfassungsfläche**: Gewerke, Abschnitte, Mängel und Abnahmen
lassen sich anlegen und einzeln durchsehen. Was fehlt, ist der Blick, mit dem eine Bauleitung
morgens auf die Baustelle schaut: *welches Gewerk hängt, welcher Abschnitt kommt nicht voran,
was ist diese Woche fällig.* δ liefert genau diesen Blick — und nichts weiter.

### Erdung — gegen den deployten Stand gemessen, nicht aus der Erstfassung übernommen

Die Erstfassung (2026-05-06) sagt „Abschnittsfortschritt und Gewerk-Blocker **in Gantt und
Berichten**". Sieben Messungen gegen Prod und den Code; **vier widerlegen eine naheliegende Lesart**:

| Gemessen (2026-08-20) | Wert | Folge für δ |
|---|---|---|
| Datumsfelder auf `construction_sections` | **0** (`id · tenant_id · project_id · parent_id · label · description · sort_order · path · created_by · created_at · updated_at`) | „Abschnittsfortschritt" ist **abgeleitet, nicht gespeichert**. Es gibt kein `planned_start`/`planned_end`/`progress`/`status`. |
| Quellen für die Ableitung | 2: `construction_section_phases` (M:N) und `work_items.section_id` | Beide sind real, beide sind heute leer. |
| `construction_section_phases`-Zeilen in Prod | **0** | Die α-Verknüpfung Abschnitt↔Phase ist unbenutzt. |
| `work_items` mit `section_id` / mit `trade_id` / `risks` mit `trade_id` | **0 / 0 / 0** | **Alle drei additiven α-Verweise sind unbenutzt.** Der Leerzustand ist der Normalfall, nicht der Ausnahmefall. |
| Bauprojekte mit Bauachse **und** Terminen | **0** | Das einzige lebende Bauprojekt ist die β/γ-QA-Fixture (`project_method = null`, 0 Arbeitspakete, 0 Phasen, 0 Meilensteine, aber 2 Abschnitte + 1 Gewerk). Die drei mit Phasen/Meilensteinen (6/5) sind **weich gelöscht** und haben 0 Abschnitte. |
| Zeilenarten im Gantt (`GanttView`, 1809 Zeilen) | **3** — Phasen, Meilensteine, Arbeitspakete (`kind='work_package'`) | Eine vierte Art wäre ein Eingriff hoher Reichweite in Ziehen/Größenänderung/Abhängigkeiten, und die Balken müssten wegen Zeile 1 gerechnet werden. |
| Auswertungsflächen, die ein Bauprojekt erreicht | **0 von 5** — Maßnahmen · Engpässe · DD-Bericht · Operatives Reporting · Steering-Dashboard sind **alle** `requiresProjectType: "ma"` | „in Berichten" hat im naheliegenden Sinn **kein Haus**. |
| `requiresProjectType` | **einwertig** (`?: ProjectType`), Filter vergleicht `===`, 22 Sektionen nutzen es, 125 Registry-Tests, **5** pinnen genau diesen Filter | AC-45β.18 ist über die geteilte Registry nur mit Typänderung erreichbar. |
| `project_task_bottlenecks` (live gelesen, nicht aus dem Register übernommen) | `sql` · STABLE · **INVOKER** · `search_path` gesetzt · 3092 Zeichen · Schlüssel `summary · tasks · top_bottlenecks` · `summary = {open_total, blocked_total, overdue_total, due_today_total, due_this_week_total}` · **0** Vorkommen von `construction` | Die M&A-Auswertung kennt Mängel nicht und liest allein `work_items`. |

**Ein Haus ist offen, und es ist nicht das erwartete.** `ReportsSection` (PROJ-21, Status-Report +
Executive-Summary) sitzt auf der **Übersicht** (`tabPath: ""`), die jede Methoden-Konfiguration
führt und die **nicht** projekttyp-gegatet ist. Ihr Inhalt ist ein typisierter, erweiterbarer
Schnappschuss (`SnapshotContent`: `header · traffic_light · phases · upcoming_milestones ·
top_risks · top_decisions · overdue_open_items · work_item_counts · ki_summary · manual_summary ·
readiness`). Ein additiver Bau-Abschnitt ist dort möglich, ohne eine deployte M&A-Fläche zu berühren.

**Ein zweiter Befund, der eine naive Umsetzung falsch machen würde: β und γ führen bewusst *zwei
verschiedene* Offen-Begriffe, und δ braucht beide.**

| Begriff | Herkunft | Statuswerte | Warum verschieden |
|---|---|---|---|
| „überfällig" | β, `isDefectOverdue` + SQL-Zwilling | `offen` · `in_bearbeitung` — **ohne** `erledigt` | Bei `erledigt` wartet die Prüfung; die Verspätung läge bei der Bauleitung, nicht beim Nachunternehmer. Daneben steht β's eigenes Signal `isDefectAwaitingReview`. |
| „Vorbehalt offen" | γ, `ACCEPTANCE_OPEN_DEFECT_STATUSES` | `offen` · `in_bearbeitung` · **`erledigt`** | Kommentar im Code: „für eine Abnahme ist fertiggemeldet **nicht** erledigt" — solange niemand nachgesehen hat, ist der Vorbehalt nicht erfüllt. |

Beide sind bereits **doppelt gepinnt** (SQL + TypeScript, je mit denselben Grenzfällen). δ verwendet
jeden an seinem Platz und erfindet **keinen dritten**. Wer für beide Zwecke denselben Begriff nimmt,
liegt an genau einer der beiden Stellen falsch — und zwar unauffällig.

### Eine δ zugewiesene Entscheidung ist gegenstandslos, nicht offen

Das Followup-Register führt bei δ die Achsen-Frage aus dem α-CIA-Review (**F-4**): „welche Achse
führt eine Auswertung, wenn ein Projekt sowohl Workstreams als auch Gewerke trägt". Gemessen:
`workstreams` hat **0 Zeilen** in Prod, und alle fünf Workstream-Auswertungen sind M&A-gegatet —
**ein Bauprojekt ruft keine davon auf.** Der Konflikt hat heute keinen erreichbaren Fall. δ
entscheidet ihn daher nicht, sondern hält fest, dass er nicht entscheidbar ist, solange die beiden
Achsen sich nirgends treffen. Er wird real, sobald eine Auswertung für **beide** Projekttypen
freigegeben wird; dann gehört er zu jener Slice, nicht zu dieser.

### Nutzer-Locks (δ)

| # | Lock | Begründung |
|---|---|---|
| **L24** | **Eigene Fläche „Terminsignale" plus ein optionaler Bau-Abschnitt im PROJ-21-Status-Report. Der Gantt bleibt unberührt.** | Die Erstfassung nennt den Gantt, aber Abschnitte haben keine Termine (Erdung Zeile 1) und der Gantt hat drei fest verdrahtete Zeilenarten in 1809 Zeilen Interaktionslogik. Eine vierte Art wäre teuer **und** würde für jedes heutige Projekt leer rendern (0 Arbeitspakete mit Bauachse). Die eigene Fläche ist sofort nützlich und trägt genau die drei Signale, für die Daten existieren. |
| **L25** | **AC-45β.18 wird in der δ-Fläche erfüllt, nicht in der M&A-Engpass-Sicht.** | Der Wortlaut nennt PROJ-103; erreichbar ist die Fläche für ein Bauprojekt nicht (einwertiges Gate). Die Alternative wäre eine Typänderung am geteilten `requiresProjectType`, am Filter, an 5 Registry-Tests und an einer deployten M&A-Auswertung — dazu eine Pflicht-Regression auf einen Pentest, der **absolute Zahlen** festnagelt. Die **Absicht** des Kriteriums (überfällige Mängel werden in einer Engpass-Übersicht sichtbar) wird an einem Ort erfüllt, den ein Bauprojekt erreicht. **Abweichung wird dokumentiert, nicht umgeschrieben.** |
| **L26** | **Das gerechnete Gewerk-Signal steht *neben* der manuellen α-Ampel, nicht an ihrer Stelle.** | Zwei Angaben, zwei Bedeutungen: „so hat die Bauleitung es bewertet" und „das sagen die Daten". Weichen sie ab, ist genau das die interessante Information. Die α-Zusage „manuelle Ampel" bleibt wörtlich gültig. |
| **L27** | **Ein Gewerk ist blockiert bei: überfälligen Mängeln · verweigerter Abnahme · angesetzter Abnahme mit verstrichenem Termin · Abnahme unter Vorbehalt mit noch offenen Vorbehalten.** „Abgesagt" blockiert **nicht**. | γ hat „absagen" ausdrücklich als Korrekturweg gebaut (die Zeilen sind nicht löschbar) — ein Tippfehler im Termin darf keinen dauerhaften Blocker erzeugen. Der Vorbehalts-Fall löst sich von selbst, weil Vorbehalte **Verweise** auf β-Mängel sind. |
| **L28** | **Abschnittsfortschritt aus verknüpften Arbeitspaketen; fehlen sie, aus verknüpften Phasen. Die Fläche sagt, aus welcher Quelle die Zahl kommt.** | Ohne Quellenangabe ist „0 %" nicht von „nichts verknüpft" zu unterscheiden — und *das* ist in Prod heute der Normalfall (0 von beidem). Beide α-Verknüpfungen werden genutzt, keine bleibt reine Dokumentation. |
| **L29** | **„Überfällig" behält β's Bedeutung. Ein Mangel ohne Frist wird getrennt gezählt und blockiert nicht.** | β hat „überfällig" an eine gesetzte Frist gebunden und in SQL **und** TypeScript mit denselben Grenzfällen gepinnt. Eine Kulanzspanne wäre eine zweite Definition im Produkt. Der fristlose Mangel wird trotzdem **benannt**, damit die Zahl auf der δ-Fläche nicht kleiner ist als die in der Mängelliste. |
| **L30** | **δ legt keine neue Tabelle an und speichert keinen Signalzustand.** | Alle Signale sind aus β/γ/α und dem Kern ableitbar. Ein gespeicherter Zustand wäre eine zweite Wahrheit, die veralten kann, und bräuchte die vier Register aus PROJ-130. |

### Prior Art für δ

| Baustein | Woher | Was übernommen wird |
|---|---|---|
| Auswertungsfunktion | `construction_defect_summary` / `construction_acceptance_summary` (β/γ) | `SECURITY INVOKER`, `stable`, `search_path` gesetzt, `jsonb`-Rückgabe, `anon`-EXECUTE entzogen. Aggregate erben die Sichtbarkeit vom Aufrufer (Aggregat-Leck-Invariante). |
| Engpass-Form | `project_task_bottlenecks` (PROJ-103) | Die **Form** `{summary, <listen>, top_*}` — nicht die Funktion selbst. Mängel gehören in einen **eigenen Schlüssel**, nicht unter `tasks`: jeder `tasks`-Eintrag trägt ein `kind` (einen Arbeitspaket-Typ, den ein Mangel nicht hat) → sonst brechen die Typisierung im Frontend und der CSV-Export. |
| Überfälligkeit | β, `isDefectOverdue` + SQL-Zwilling | **Wörtlich wiederverwendet**, nicht nachgebaut. |
| Vorbehalts-Offenheit | γ, `ACCEPTANCE_OPEN_DEFECT_STATUSES` | **Wörtlich wiederverwendet**, nicht mit der Überfälligkeitsregel verwechselt. |
| Fristrechnung / Datumsvergleich | γ, `src/lib/construction/acceptances.ts` | `YYYY-MM-DD`-Vergleich lexikographisch, Klemmung am Monatsende — die F-γ1-Lehre gilt weiter. |
| Berichts-Erweiterung | PROJ-21 `SnapshotContent` + PROJ-56-ε `readiness` | Additiver **optionaler** Block. Vorbild ist, wie PROJ-56-ε seinen Readiness-Block eingehängt hat. |
| Fläche + Navigation | α/β/γ-Reiter | Ein Eintrag in der geteilten Registry, `requiresProjectType: "construction"` **und** `requiresModule: "construction"`, Routen gaten `view`. |
| Leerzustand mit Grund | PROJ-Y-143f `ModuleUnavailableNotice`-Muster | Ein Leerzustand darf nicht „alles in Ordnung" behaupten, wenn nichts verknüpft ist. |

### User Stories (δ)

**ST-δ1 — Bauleitung: „Welches Gewerk hängt?"**
Als Bauleitung möchte ich auf einen Blick sehen, welche Gewerke meines Projekts blockiert sind und
woran, damit ich weiß, wo ich heute eingreifen muss — ohne vier Listen einzeln durchzugehen.

**ST-δ2 — Bauleitung: „Kommt der Abschnitt voran?"**
Als Bauleitung möchte ich je Bauabschnitt den Fortschritt und die Zahl der überfälligen Vorgänge
sehen, damit ich Verzug auf der Ortsachse erkenne und nicht nur auf der Gewerkeachse.

**ST-δ3 — Bauleitung: „Was ist diese Woche fällig?"**
Als Bauleitung möchte ich die nächsten Fristen aus Mängeln und Abnahmen in einer Liste sehen,
damit ich Termine wahrnehme, bevor sie verstreichen.

**ST-δ4 — Projektleitung: „Überfällige Mängel als Engpass"** *(erfüllt AC-45β.18)*
Als Projektleitung möchte ich die überfälligen Mängel als Engpass-Übersicht mit den dringendsten
zuerst sehen, damit ich Eskalationen priorisieren kann.

**ST-δ5 — Sponsor: „Steht das im Bericht?"**
Als Sponsor möchte ich im Status-Report einen Bau-Abschnitt sehen, der Gewerk-Blocker und
Abschnittsfortschritt zusammenfasst, damit ich den Bauteil ohne Zugriff auf den Projektraum
beurteilen kann.

**ST-δ6 — Bauleitung: „Warum ist hier nichts?"**
Als Bauleitung möchte ich bei leerer Fläche erklärt bekommen, **warum** kein Signal erscheint
(nichts verknüpft vs. nichts zu melden), damit ich Ruhe nicht mit Blindheit verwechsle.

### Akzeptanzkriterien (δ)

**Gewerk-Signal**

- [ ] **AC-45δ.1** Die Fläche listet **alle** Projekt-Gewerke, auch die ohne Befund; ein Gewerk ohne Blocker wird ausdrücklich als „ohne Befund" gekennzeichnet, nicht weggelassen.
- [ ] **AC-45δ.2** Je Gewerk stehen die von α gesetzte **manuelle Ampel** und das **gerechnete Signal** nebeneinander, beide beschriftet, sodass erkennbar ist, welche Angabe woher kommt (L26).
- [ ] **AC-45δ.3** Ein Gewerk gilt als blockiert bei mindestens einem von: überfälliger Mangel · verweigerte Abnahme · angesetzte Abnahme mit verstrichenem Termin · Abnahme unter Vorbehalt mit noch offenen Vorbehalten (L27). Der Grund wird **benannt**, nicht nur die Farbe gezeigt.
- [ ] **AC-45δ.4** Eine **abgesagte** Abnahme blockiert nicht (L27).
- [ ] **AC-45δ.5** Je Gewerk werden zusätzlich benannt: Zahl der überfälligen Mängel, der Mängel **ohne Frist**, und der Mängel, die auf Prüfung warten (L29). Die drei Zahlen sind getrennt und nicht addiert.
- [ ] **AC-45δ.6** „Überfällig" verwendet **wörtlich** β's Regel (gesetzte Frist verstrichen, Status `offen` oder `in_bearbeitung`); „Vorbehalt offen" verwendet **wörtlich** γ's Regel (Status `offen`, `in_bearbeitung` **oder** `erledigt`). Es entsteht keine dritte Definition.

**Abschnittsfortschritt**

- [ ] **AC-45δ.7** Je Bauabschnitt werden Fortschritt und Zahl der überfälligen Vorgänge gezeigt; die Hierarchie aus α bleibt sichtbar (Kinder unter ihren Eltern).
- [ ] **AC-45δ.8** Der Fortschritt kommt aus verknüpften **Arbeitspaketen**; fehlen sie, aus verknüpften **Phasen** (L28).
- [ ] **AC-45δ.9** Die verwendete **Quelle wird angezeigt** („aus 7 Arbeitspaketen" / „aus 2 Phasen").
- [ ] **AC-45δ.10** Ist nichts verknüpft, erscheint **kein** Fortschritt von 0 %, sondern ein Hinweis mit Handlungsaufforderung (L28, ST-δ6).

**Nächste Fristen**

- [ ] **AC-45δ.11** Eine Liste der nächsten Fristen aus Mängeln (`due_date`) und Abnahmen (`scheduled_for`) im vorausschauenden Fenster, aufsteigend nach Datum, mit Art, Gewerk und Bezug.
- [ ] **AC-45δ.12** Bereits verstrichene Fristen erscheinen **oberhalb** der künftigen und sind als verstrichen gekennzeichnet.
- [ ] **AC-45δ.13** Eine künftige, angesetzte Abnahme erscheint hier — und **nicht** als Blocker (L27, AC-45δ.3).

**Engpass-Sicht (erfüllt AC-45β.18)**

- [ ] **AC-45δ.14** Die überfälligen Mängel erscheinen als Engpass-Übersicht mit den am längsten überfälligen zuerst; je Zeile stehen Tage über Frist, Gewerk, Ort und Verantwortlicher.
- [ ] **AC-45δ.15** Eine Kopfzeile nennt die Gesamtzahlen (überfällig · ohne Frist · wartet auf Prüfung · offene Blocker), berechnet über **alle** Zeilen, nicht nur die angezeigten.
- [ ] **AC-45δ.16** *(AC-45β.18, Erfüllungsnachweis)* Die Anforderung „überfällige Mängel in der Engpass-Sicht" ist erfüllt; der **Ort** weicht vom Wortlaut ab (δ-Fläche statt PROJ-103-Fläche) und die Abweichung ist in der Spec und im Register benannt (L25).

**Bericht**

- [ ] **AC-45δ.17** Der PROJ-21-Status-Report trägt einen **optionalen** Bau-Abschnitt mit Gewerk-Blockern und Abschnittsfortschritt.
- [ ] **AC-45δ.18** Der Abschnitt erscheint **nur**, wenn das Projekt ein Bauprojekt mit belegter Bauachse ist; sonst ist der Bericht **byte-identisch** zu heute.
- [ ] **AC-45δ.19** Bestehende Schnappschüsse bleiben lesbar; der neue Block ist optional und wird bei alten Berichten nicht erwartet.
- [ ] **AC-45δ.20** Der Bericht ist ein **eingefrorener** Schnappschuss: der Block zeigt den Stand zum Erzeugungszeitpunkt und ändert sich nicht rückwirkend.

**Fläche, Rechte, Gates**

- [ ] **AC-45δ.21** Ein Projektraum-Reiter „Terminsignale", gegatet auf `project_type='construction'` **und** das Modul `construction`; ein Lesezugriff bei inaktivem Modul antwortet 404 (Lese-Absicht verrät die Fläche nicht).
- [ ] **AC-45δ.22** Die Fläche ist **lesend**. Sie mutiert nichts; jede Aktion ist ein Sprung auf die zuständige Fläche (Mangel, Abnahme, Arbeitspaket).
- [ ] **AC-45δ.23** Jedes Projektmitglied mit Leserecht sieht die Fläche; es gibt **keine** verschärfte Rolle (anders als β/γ beim Schreiben — hier wird nichts geschrieben).
- [ ] **AC-45δ.24** Der Gantt ist **unverändert**: keine neue Zeilenart, keine neue Zeichnung, keine Änderung an Ziehen/Größenänderung/Abhängigkeiten (L24).

**Härtungskriterien (blockierend)**

- [ ] **AC-45δH-1** Jede neue Auswertungsfunktion ist `SECURITY INVOKER`, `stable`, mit gesetztem `search_path`, ohne Actor-Parameter, und `anon` **sowie PUBLIC** haben kein EXECUTE (PROJ-Y-114a-Lehre: vollständig prüfen, nicht als Stichprobe).
- [ ] **AC-45δH-2** **Aggregat-Leck-Probe** ist Pflicht: ein Nicht-Mitglied und ein Mandantenfremder erhalten in **jeder** Kopfzahl und **jeder** Liste 0 — inklusive einer Gegenprobe, die belegt, dass der wahre Wert ≠ 0 ist.
- [ ] **AC-45δH-3** Die Prüfung läuft unter einem **synthetisierten Nicht-Admin** (in Prod ist jedes Mandanten-Mitglied Admin; ein Lauf unter Admin wäre falsch-grün).
- [ ] **AC-45δH-4** Keine neue Tabelle, kein Register-Eingriff, kein gespeicherter Signalzustand (L30). Wird das verletzt, gelten die vier PROJ-130-Register-Pflichten in derselben Migration.
- [ ] **AC-45δH-5** Regressionen **wörtlich** grün: α-Pentest, PROJ-Y-45a, β-Pentest, γ-Pentest und **PROJ-103 A–G**. Letzteres besonders: der PROJ-103-Pentest nagelt **absolute Zahlen** fest (PROJ-130-α-Lehre), und δ darf ihn nicht bewegen.
- [ ] **AC-45δH-6** Die Registry-Tests (125) bleiben grün **ohne** Abschwächung einer Invariante; `requiresProjectType` bleibt einwertig (L25).
- [ ] **AC-45δH-7** Die beiden Offen-Begriffe werden aus den bestehenden Libs **importiert**, nicht kopiert; ein Test friert ein, dass `erledigt` bei „überfällig" **aus**- und bei „Vorbehalt offen" **ein**geschlossen ist.
- [ ] **AC-45δH-8** Der Bericht ohne Bauachse ist **byte-identisch** zu heute — gemessen, nicht behauptet (AC-45δ.18).
- [ ] **AC-45δH-9** Ein authentifizierter Durchlauf in der Bau-Fixture-Lane belegt mindestens einen echten Blocker und einen echten Leerzustand mit Grund; die Lane räumt hinterher auf (Grenze: γs Zeilen sind nicht löschbar → PROJ-Y-45h).

### Edge Cases (δ)

| Fall | Erwartetes Verhalten |
|---|---|
| Projekt ohne Gewerke | Fläche erscheint, erklärt den Leerzustand und verweist auf die Gewerke-Fläche. Kein „alles grün". |
| Gewerk ohne Mängel und ohne Abnahme | „ohne Befund" — ausdrücklich, nicht durch Abwesenheit (AC-45δ.1). |
| Mangel ohne Frist | Getrennt gezählt, blockiert nicht (L29). |
| Mangel im Status `erledigt` (fertiggemeldet) | Nicht überfällig (β), aber „wartet auf Prüfung". Zählt als offener Vorbehalt, wenn er an einer Abnahme hängt (γ). Derselbe Mangel erscheint also in zwei Zahlen mit zwei Bedeutungen — beide beschriftet. |
| Abnahme unter Vorbehalt, alle Vorbehalte erledigt | Kein Blocker mehr; löst sich ohne Zutun (L27). |
| Abnahme angesetzt, Termin heute | Nicht überfällig (Vergleich `< heute`, wie β und γ). Erscheint unter „Nächste Fristen". |
| Abgesagte Abnahme, kein neuer Termin | Kein Blocker (L27). Erscheint auch nicht unter den Fristen. |
| Abschnitt mit Kindern, nur Kinder haben Verknüpfungen | Eltern zeigen den zusammengefassten Stand des Teilbaums; die Quelle wird als „aus N Arbeitspaketen im Teilbaum" benannt. |
| Abschnitt mit Arbeitspaketen **und** Phasen | Arbeitspakete führen (L28); die Phasen werden als weitere Angabe genannt, nicht stillschweigend verworfen. |
| Arbeitspaket ohne Termine, aber mit `section_id` | Zählt in den Fortschritt (Status), nicht in „überfällig" (kein Datum). |
| Bauprojekt mit `project_method = null` | Fläche funktioniert; sie hängt nicht an einer Methode. (Gemessen: das einzige lebende Bauprojekt ist genau dieser Fall.) |
| Modul `construction` aus | 404 auf den Routen, Hinweis statt Fehlerkasten auf der Fläche (PROJ-Y-143f-Muster). |
| Nicht-Bauprojekt | Reiter erscheint nicht; die Routen antworten 404. |
| Bericht ohne Bauachse | Kein Bau-Abschnitt, Ausgabe byte-identisch (AC-45δ.18). |
| Alter Schnappschuss ohne Bau-Block | Bleibt lesbar (AC-45δ.19). |

### Out of Scope (δ)

| Nicht in δ | Warum | Wohin |
|---|---|---|
| Bauabschnitte als Gantt-Zeilenart | L24 — Abschnitte haben keine Termine, der Gantt hat 1809 Zeilen Interaktionslogik | eigene Slice, falls ein Pilot es verlangt |
| Marker auf bestehenden Gantt-Zeilen | Würde heute leer bleiben (0 Arbeitspakete mit Bauachse) | eigene Slice, wenn die Achse belegt ist |
| Eigene Termine auf `construction_sections` | Wäre eine zweite Terminwahrheit neben Phasen und Arbeitspaketen | bewusst nicht vorgesehen |
| Benachrichtigung / Eskalation bei Fristablauf | δ **zeigt**, δ **meldet nicht** — Versand ist PROJ-13, Fälligkeits-Inbox ist PROJ-64 | eigene Slice |
| Gewährleistungs-Ablaufwarnung | γ hat sie ausdrücklich ausgenommen („gerechnet und gezeigt, nicht überwacht") | eigene Slice |
| Freigabe der M&A-Engpass-Sicht für Bau | L25 | eigene Slice, dann mit Typänderung und PROJ-103-Regression |
| Fotodokumentation | ε | PROJ-45-ε |
| Achsen-Entscheidung Workstreams ↔ Gewerke | Hat heute keinen erreichbaren Fall (siehe oben) | jene Slice, die eine Auswertung für beide Typen freigibt |

### Offene Fragen für `/architecture`

1. **Eine Auswertungsfunktion oder drei?** Die Fläche trägt vier Blöcke (Gewerke · Abschnitte · Fristen · Engpässe). β/γ haben je eine `*_summary`-Funktion; PROJ-103 bündelt vier Dinge in einer. Eine Funktion bedeutet einen Aufruf und eine Kopfzahl-Wahrheit, aber einen größeren Rumpf.
2. **Wie wird der Abschnitts-Teilbaum aggregiert?** α hat `construction_sections.path` (und einen `repath`-Trigger). Reicht `path` für die Teilbaum-Summe, oder braucht es eine rekursive Abfrage wie in `construction_section_blocking_refs`?
3. **Fenster für „Nächste Fristen".** Vorschlag 14 Tage vorausschauend, verstrichene ohne Grenze. Zu bestätigen oder zu ersetzen.
4. **Wo genau hängt der Bau-Block im Schnappschuss?** `SnapshotContent` ist typisiert; der Block muss optional sein und die Aggregation in `aggregateSnapshotData` braucht einen projekttyp-abhängigen Zweig. Zu prüfen, ob PROJ-56-ε dort ein Muster gesetzt hat.
5. **Trägt δ eine CSV-Ausgabe?** PROJ-103 und PROJ-132 haben eine; β/γ nicht. Falls ja, gilt das Formel-Escaping-Muster.
6. **Braucht δ einen CIA-Pass?** Nach den Locks entsteht keine neue Tabelle, keine neue Abhängigkeit und kein Eingriff in eine deployte Fläche außer dem additiven Berichts-Block. Vermutlich nicht — zu bestätigen bei `/architecture`.

### Technische Anforderungen (δ)

- **Kein neues Paket.** Alles ist Wiederverwendung.
- **Keine neue Tabelle**, kein Register-Eingriff (L30) — sonst greifen die vier PROJ-130-Register-Pflichten in derselben Migration, als Anker-Ersetzung aus der Live-Definition mit Fail-Loud-Guard und Re-Grant.
- **Auswertungen sind `SECURITY INVOKER`.** Ein `SECURITY DEFINER`-Aggregat über gegatete Zeilen ist ein Leck, auch wenn die Zeilenliste korrekt verborgen ist.
- **Kein Actor-Parameter**; `auth.uid()` wird intern gelesen. `anon` und PUBLIC ohne EXECUTE.
- **Delta- statt Absolutzusicherungen** in Migrations-Post-Conditions (PROJ-130-α-Lehre).
- **Live-Pentest ist Pflicht** vor `Approved`, nach dem DO-Block-Muster mit Rollback-Marker und **null Rückständen**, mit synthetisiertem Nicht-Admin und Aggregat-Leck-Probe samt Gegenprobe.
- **Regressionen wörtlich**: α · PROJ-Y-45a · β · γ · **PROJ-103 A–G** (absolute Zahlen!).
- **Migration nur falls nötig**; dann Dateiname zuerst, `apply_migration`-`name` = Dateistamm (PROJ-134), `extensions.moddatetime` schema-qualifiziert.
- **Funktions-Inventar** (`supabase/prod-inventory/functions.txt`) am Ende der Slice auffrischen (PROJ-Y-148e).

### Abhängigkeiten

- **Erfordert:** PROJ-45-α (Gewerke, Abschnitte, `construction_section_phases`, die drei additiven Verweise) · PROJ-45-β (Mängel, `due_date`, Überfälligkeitsregel) · PROJ-45-γ (Abnahmen, `scheduled_for`, Vorbehalts-Verweise) — **alle deployed**.
- **Nutzt:** PROJ-19 (Phasen) · PROJ-9 (Arbeitspakete) · PROJ-21 (`SnapshotContent`) · PROJ-17 (Modul-Gate) · PROJ-28 (Navigations-Registry).
- **Berührt nicht:** PROJ-25/53 (Gantt) · PROJ-103 (Engpass-Sicht) · PROJ-131/132 (M&A-Berichte).

---

## Tech Design (Solution Architect) — δ, 2026-08-20

Gegen den deployten Stand geerdet in **vier parallelen Messläufen** (Funktions-Granularität + CSV ·
Teilbaum-Aggregation · Berichts-Block · Wiederverwendungs-Inventar). Zwei Nutzer-Locks vorab gesetzt:
Vorausschau-Fenster **14 Tage** (verstrichene ohne Grenze), **kein CIA-Pass** — es entsteht kein neues
Paket, keine neue Tabelle und kein Register-Eingriff, und der einzige Eingriff in eine deployte Fläche
ist der additive Berichts-Block.

### Die sechs offenen Fragen — beantwortet

| Frage | Antwort | Tragender Grund (gemessen) |
|---|---|---|
| **Q1** Eine Auswertungsfunktion oder drei? | **Eine**, mit vier Top-Level-Schlüsseln und je Block eigener Kopfzahl | Nicht Sparsamkeit, sondern **ein Zeitbezug**: alle vier Blöcke rechnen gegen `current_date`. Vier getrennte Aufrufe können über Mitternacht auseinanderfallen und die Fläche zeigte dann Kopfzahlen, die zu ihren Listen nicht passen. Hausmuster ist ohnehin gebündelt (PROJ-131 4 Blöcke, PROJ-132 5, PROJ-103 3). |
| **Q2** Teilbaum über `path` oder rekursiv? | **Rekursives CTE über `parent_id`**, wie β/γ | α hat `path` als echtes `ltree` **mit GiST-Index** angelegt, und `<@` wäre die elegantere Abfrage — aber β und γ lösen dieselbe Frage am **selben Baum** rekursiv, `path` ist `nullable` **ohne CHECK**, und Perf ist bei diesen Baumgrößen keine Frage. Eine dritte Technik innerhalb von PROJ-45 wäre die Drift, nicht der Gewinn. |
| **Q3** Fenster „Nächste Fristen" | **14 Tage** vorausschauend, verstrichene ohne Grenze | Nutzer-Lock. Als **Konstante** in der Funktion, nicht als Parameter — ein Parameter vergrößert die Pentest-Matrix ohne Nutzen, solange kein Umschalter existiert. |
| **Q4** Wo hängt der Bau-Block im Schnappschuss? | Optionales Feld **neben `readiness`**, Aggregation im eigenen Fehler-Zweig, Rendering per Guard, **nur** im Status-Report | PROJ-56-ε hat genau dieses Muster gesetzt; die Exec-Summary führt `readiness` bewusst nicht. Rückwärtskompatibilität ist **gratis**: das `content` wird beim Lesen gar nicht validiert (keine Zod-Prüfung), unbekannte Felder werden ignoriert. |
| **Q5** CSV? | **Ja**, eine Route mit Abschnitts-Parameter | Aus dem Bestand begründet, nicht aus Prinzip: δ liefert die Engpass-Sicht, die PROJ-103 für Aufgaben hat — **und die hat einen Export**. Ohne δ-CSV könnte derselbe Nutzer überfällige Aufgaben exportieren, überfällige Mängel nicht. α/β/γ haben bisher keine einzige Export-Route. |
| **Q6** CIA-Pass? | **Nein** | Nutzer-Entscheid, gestützt auf die Messung: kein Paket, keine Tabelle, kein Register. |

### Drei Befunde, die eine Vorlage oder ein Kriterium korrigieren

**1. Der Funktionsname in den δ-Anforderungen war falsch.** Die Prior-Art-Tabelle nennt
`construction_defects_summary`; deployt ist **`construction_defect_summary`** (Singular, β-Migration
Block 14). Im Anforderungstext korrigiert. Ein Name, der erst beim Bauen auffällt, kostet einen
Migrationslauf — dieselbe Klasse wie der falsch angenommene Helfer in PROJ-45-β.

**2. Die naheliegende Umsetzung von AC-45β.18 widerspricht L25 und wird abgelehnt.** Der Messlauf
empfahl, die überfälligen Mängel per Anker-Ersetzung als eigenen Schlüssel in
`project_task_bottlenecks` zu hängen. Das ist technisch sauber und **fachlich wirkungslos**: die
PROJ-103-Fläche trägt `requiresProjectType: "ma"`, ein Bauprojekt erreicht sie nicht — die Zahl
entstünde an einem Ort, an dem sie niemand sieht, und der PROJ-103-Pentest nagelt absolute Zahlen
fest. δ erfüllt die **Absicht** des Kriteriums in der eigenen Fläche (L25) und lässt
`project_task_bottlenecks` **unberührt**. Die Abweichung wird dokumentiert, nicht umgeschrieben.

**3. „Byte-identisch" (AC-45δ.18) ist heute nicht messbar — δ bringt das Messwerkzeug mit.** Der
Schnappschuss-Aggregator hat **keinen** Unit-Test, der Route-Test mockt ihn weg, und **keine**
Visual-Baseline fotografiert die Report-Fläche. Ein Kriterium ohne Instrument ist eine Behauptung.
δ liefert daher einen Wächter, der für ein Nicht-Bauprojekt die **eingefrorene Feldliste** des
Schnappschuss-Inhalts prüft und dass der Bau-Schlüssel **abwesend** ist — mit Rot-Grün-Gegenprobe.

### Architektur

#### A) Fläche (Komponentenbaum, PM-lesbar)

```
Projektraum → Reiter „Terminsignale"   (nur Bauprojekt + Modul „construction")
+-- Kopfzeile: vier getrennte Zahlen
|     überfällig · ohne Frist · wartet auf Prüfung · offene Blocker
|     (über ALLE Zeilen gerechnet, nicht über die angezeigten)
+-- Block 1 „Gewerke"
|   +-- je Gewerk eine Zeile, auch ohne Befund („ohne Befund" ausdrücklich)
|   |     manuelle Ampel (α)  |  gerechnetes Signal  |  Grund im Klartext
|   |     drei Zahlen: überfällig · ohne Frist · wartet auf Prüfung
|   +-- Sprung auf Mängel- bzw. Abnahme-Fläche (keine Mutation)
+-- Block 2 „Bauabschnitte"  (eingerückter Baum wie α, Kinder unter Eltern)
|   +-- je Abschnitt: Fortschritt + QUELLE („aus 7 Arbeitspaketen im Teilbaum")
|   +-- nichts verknüpft → Hinweis mit Handlungsaufforderung, KEIN „0 %"
+-- Block 3 „Nächste Fristen" (14 Tage)
|   +-- verstrichene oben und gekennzeichnet, dann künftige aufsteigend
|   +-- Art · Gewerk · Bezug
+-- Block 4 „Engpässe: überfällige Mängel"   (erfüllt AC-45β.18)
|   +-- am längsten überfällige zuerst: Tage über Frist · Gewerk · Ort · Verantwortlicher
+-- CSV-Ausgabe je Block
```

Die Fläche ist **lesend**. Jede Aktion ist ein Sprung auf die zuständige Fläche — kein
Schreibpfad, kein verschärftes Rollen-Gate (anders als β/γ beim Schreiben; hier wird nichts
geschrieben, also gilt `view`).

#### B) Was gespeichert wird: nichts

δ legt **keine Tabelle** an und hält **keinen Signalzustand**. Alle vier Blöcke sind aus dem
Bestand ableitbar:

| Block | Quelle |
|---|---|
| Gewerk-Signal | β-Mängel + γ-Abnahmen, je Projekt-Gewerk; Zählspalten aus den beiden vorhandenen Auswertungen |
| Abschnittsfortschritt | verknüpfte Arbeitspakete (α-Verweis), ersatzweise verknüpfte Phasen (α-M:N-Tabelle) |
| Nächste Fristen | Mangel-Frist und Abnahme-Termin |
| Engpässe | β-Mängel mit verstrichener Frist |

Ein gespeicherter Zustand wäre eine zweite Wahrheit, die veralten kann, und zöge die vier
Register-Pflichten aus PROJ-130 nach sich.

#### C) Eine Auswertungsfunktion

Eine neue Funktion je Projekt, `SECURITY INVOKER`, `stable`, `search_path` gesetzt, **ohne**
Akteur-Parameter, `anon` **und PUBLIC** ohne Ausführungsrecht. Sie gibt vier Blöcke plus je Block
eine Kopfzahl über die **ungefilterte** Menge zurück — das Vorbild dafür ist PROJ-103, wo die
Zusammenfassung ausdrücklich über die Grundmenge und nicht über die sortierte Auswahl rechnet.

**Wiederverwendung statt Nachbau** (die eigentliche Substanz des Entwurfs):

| Baustein | Herkunft | δ macht daraus |
|---|---|---|
| Überfälligkeitsregel in SQL | β-Helfer `_construction_defect_is_overdue` | **aufrufen** — keine dritte Kopie des Prädikats |
| Überfälligkeit + „wartet auf Prüfung" in TypeScript | β-Bibliothek `defects.ts` | **importieren** für Zeilen-Abzeichen |
| „Vorbehalt offen" | γ, heute **inline** in der Protokollier-Funktion (genau eine Stelle) | siehe **D-δ4** |
| Zählungen je Gewerk | `construction_defect_summary` · `construction_acceptance_summary` | **aufrufen** und verbinden, statt ein drittes Mal zu zählen |
| Datumsvergleich | β/γ, `YYYY-MM-DD` lexikographisch, `<` nicht `<=` | derselbe Rand für „Termin verstrichen" |
| Teilbaum | γ, `construction_section_blocking_refs` | dieselbe rekursive Technik |

Beim Verbinden der beiden Auswertungen ist ein gemessener Stolperstein zu beachten: die
Gewerk-Listen tragen **unterschiedliche Schlüsselnamen** (β `project_trade_id`, γ `trade_id`). Die
α-Fläche führt sie bereits zusammen; genau diese Fundstelle ist das Vorbild.

#### D) Rechte und Gates

Reihenfolge wie in allen Bau-Routen: Kennung prüfen → Anmeldung → **Projektzugriff `view`** (liefert
erst die Mandanten-Kennung) → **danach** Modul-Tor. Lese-Absicht wird auf **404** abgebildet, damit
die Fläche ihre Existenz nicht verrät; die Oberfläche zeigt dafür einen Hinweis statt eines
Fehlerkastens, und der Hook meldet den Zustand im vorhandenen Feld `moduleInactive` (so heißt es im
Bestand — nicht `unavailable`).

Der Navigations-Eintrag ist der **fünfte** dieser Art und kommt **ohne Testanpassung** dazu: α hatte
die Registry-Invariante damals von „genau eine Sektion je Modul" auf ihre Absicht umgestellt. Das ist
der zweite Nutzen jener Änderung; die fünf Fälle, die den Projekttyp-Filter festnageln, bleiben
unberührt und `requiresProjectType` bleibt **einwertig**.

#### E) Berichts-Block

Ein **optionales** Feld neben `readiness`, gefüllt nur wenn (a) das Projekt ein Bauprojekt ist und
(b) die Bauachse belegt ist; sonst bleibt es **abwesend**. Drei Dinge sind dabei nicht verhandelbar:

- **Abwesend heißt abwesend.** Ein leerer Wert statt Abwesenheit legt den Schlüssel im gespeicherten
  Inhalt ab und verletzt AC-45δ.18.
- **Der Projekttyp fehlt heute in der Abfrage des Aggregators** — er liest die Methode, nicht den Typ.
  Ohne diese Ergänzung ist die Gate-Bedingung nicht auswertbar.
- **Fehler dürfen nicht durchschlagen.** Der Bau-Block bekommt denselben Fehler-Zweig wie der
  Readiness-Block; nur der Projekt-Lookup selbst darf die Schnappschuss-Erzeugung abbrechen.

Der PDF-Weg braucht **keine** Änderung (er rendert dieselbe Druckseite). Der Schnappschuss ist
strukturell eingefroren: die Tabelle hat weder eine Änderungs- noch eine Löschregel — AC-45δ.20 ist
damit ohne Zutun erfüllt.

### Neue Entscheidungen (δ)

- **D-δ1** Eine gebündelte Auswertungsfunktion, vier Schlüssel, je Block eigene Kopfzahl über die
  ungefilterte Menge, **ein** Zeitbezug.
- **D-δ2** Die beiden vorhandenen Auswertungen werden **aufgerufen und verbunden**, nicht nachgezählt;
  die abweichenden Gewerk-Schlüsselnamen werden nach dem α-Vorbild zusammengeführt.
- **D-δ3** Teilbaum **rekursiv über `parent_id`**, nicht über den `ltree`-Operator. Der GiST-Index
  bleibt vorerst ungenutzt; die Konsolidierung samt `path`-Pflichtfeld ist als **PROJ-Y-45j**
  registriert, weil sie α/β/γ betrifft und nicht in eine Lesefläche gehört.
- **D-δ4** Das Prädikat „Vorbehalt offen" wird ein **geteilter SQL-Helfer**, und γs **einzige**
  Inline-Stelle wird per Anker-Ersetzung aus der Live-Definition darauf umgestellt — damit es in SQL
  genau **eine** Autorität gibt (die TypeScript-Konstante bleibt der Zwilling, wie bei β). Alternative
  war „Helfer daneben stellen und γ nicht anfassen"; sie wurde verworfen, weil dann drei Kopien
  derselben Statusliste existieren und die gefährliche Verwechslung mit der Überfälligkeitsregel
  unauffällig bleibt. **Preis und Absicherung:** δ berührt damit einen deployten Schreibpfad; das Tor
  dafür ist der **γ-Pentest wörtlich** (60/60) plus ein neuer Vektor, der beweist, dass die
  Protokollier-Funktion nach der Umstellung dieselbe Entscheidung trifft.
- **D-δ5** Fortschritt = erledigte Arbeitspakete gegen alle nicht gelöschten, **ohne die
  verworfenen**. Das weicht von PROJ-102 ab, das verworfene im Nenner behält: auf einer operativen
  Bau-Fläche wäre ein Fortschritt, der 100 % nie erreichen kann, irreführend. Ersatzweise über Phasen:
  „abgeschlossen" zählt, „verworfen" fällt aus dem Nenner, „geplant/laufend/ausgesetzt" zählen als
  offen. Beide Formeln werden mit Grenzfällen eingefroren.
- **D-δ6** Der Berichts-Block spiegelt das Readiness-Muster; Abwesenheit statt Leerwert; der
  Projekttyp wird in die Aggregator-Abfrage aufgenommen; nur Status-Report, nicht Exec-Summary; die
  Abschnittsliste im Kopfkommentar des Renderers wird **mitgepflegt** (PROJ-56-ε hat das versäumt).
- **D-δ7** Eine CSV-Route mit Abschnitts-Parameter, dieselbe Auswertung wie die Ansicht,
  Formel-Neutralisierung und Umfangs-Kopfzeile wie im Bestand. Die Escaping-Hilfe wird **kopiert**,
  nicht vereinheitlicht — eine Vereinheitlichung berührte mindestens fünf Dateien und wäre damit
  CIA-pflichtig; als **PROJ-Y-45k** registriert.
- **D-δ8** `project_task_bottlenecks` bleibt **unberührt** (Befund 2).
- **D-δ9** Das Fenster ist eine Konstante, kein Parameter.
- **D-δ10** Die Fläche gatet `view`; es gibt bewusst **kein** verschärftes Rollen-Gate.

### Zusätzliche Härtungskriterien (blockierend, zu AC-45δH-1…9)

- [ ] **AC-45δH-10** Nach der Umstellung aus **D-δ4**: γ-Pentest **wörtlich** grün, plus ein Vektor,
      der einen fertiggemeldeten Mangel als offenen Vorbehalt führt und belegt, dass Protokollier-Weg
      und δ-Signal **dieselbe** Entscheidung treffen. Anker-Ersetzung mit Treffer-Eindeutigkeit,
      Fail-Loud und Post-Verifikation aus der Live-Definition.
- [ ] **AC-45δH-11** Der Wächter für AC-45δ.18 existiert und ist **rot-grün belegt**: eingefrorene
      Feldliste des Schnappschuss-Inhalts und Abwesenheit des Bau-Schlüssels bei einem
      Nicht-Bauprojekt.
- [ ] **AC-45δH-12** **Je Route** ein eigener Modul-Gate-Test. α musste das Tor in alle sieben Routen
      nachziehen, weil die Registry es voraussetzt — ohne eigenen Test wird das neue Tor nur weggemockt.
- [ ] **AC-45δH-13** Der Teilbaum-Fall ist mit einem **Enkel** geprüft: die Verknüpfung hängt am
      Kindeskind, die naive Ein-Knoten-Abfrage findet sie **nicht**, die Teilbaum-Abfrage schon.
      Genau diese Falle hat β/γ je einen Vektor gekostet.
- [ ] **AC-45δH-14** Funktions-Inventar am Ende der Slice aufgefrischt; die Zahl wird gegen Prod
      **gegengezählt**, nicht aus der Migration übernommen.

### Risiken für `/qa`

| # | Risiko | Prüfung |
|---|---|---|
| R-δ1 | **D-δ4 berührt einen deployten Schreibpfad.** Eine falsch verankerte Ersetzung würde die Protokollier-Funktion still verändern. | γ-Pentest wörtlich + AC-45δH-10; Anker zählt seine Treffer und bricht bei ≠1 ab |
| R-δ2 | **Die zwei Offen-Begriffe werden vermischt.** Wer für Blocker und Überfälligkeit denselben nimmt, liegt an genau einer Stelle falsch — unauffällig. | eingefrorener Test: `erledigt` bei „überfällig" **aus**, bei „Vorbehalt offen" **ein** |
| R-δ3 | **Aggregat-Leck.** Eine Auswertung als `SECURITY DEFINER` über gegatete Zeilen leckt, auch wenn die Zeilenliste stimmt. | Leck-Probe **je Block** samt Gegenprobe (wahrer Wert ≠ 0), unter **synthetisiertem Nicht-Admin** |
| R-δ4 | **Leerzustand behauptet Ruhe.** In Prod sind alle drei additiven α-Verweise bei null Zeilen — der Leerzustand ist der Normalfall. | AC-45δ.10 + ST-δ6: Hinweis mit Grund, nie „0 %" |
| R-δ5 | **Fortschrittsformel weicht von PROJ-102 ab** (D-δ5) und könnte als Fehler gelesen werden. | Grenzfälle eingefroren, Abweichung in der Spec benannt |
| R-δ6 | **Fixture-Lane räumt nicht vollständig auf**: γ-Zeilen sind by design nicht löschbar. | Bau-Lane aus der β-QA wiederverwenden, Grenze über PROJ-Y-45h führen; **nicht** das Modul im geteilten Test-Mandanten einschalten (verschiebt die stabilisierten Visual-Baselines) |

### Abhängigkeiten und Reihenfolge

**Kein neues Paket.** Keine neue Tabelle, kein Register-Eingriff. Eine Migration (Auswertungsfunktion,
geteilter Helfer aus D-δ4, Anker-Ersetzung an γs Protokollier-Funktion); Dateiname zuerst, der
Migrationsname gleich dem Dateistamm.

Reihenfolge **`/backend` → `/frontend` → `/qa`**: die Fläche ist ohne die Auswertungsfunktion nicht
sinnvoll baubar, und der Berichts-Block hat einen Backend- und einen Frontend-Anteil.

---

## `/backend` — δ live 2026-08-20

Migration **`20260820180000_proj45_delta_construction_schedule_signals`** in Prod (registriert unter
`20260820155944`; die Versionsdrift ist benign — die Datei besteht durchgängig aus `create or replace`
und idempotenten DO-Blöcken und bricht `supabase db push` nicht, PROJ-134-Domäne). **Keine neue
Tabelle, kein Register-Eingriff, kein gespeicherter Signalzustand** — L30 gehalten.

Geliefert: drei neue Funktionen (`_construction_defect_is_open`, `_construction_reservation_is_open`,
beide `immutable`; `construction_schedule_signals` als `SECURITY INVOKER`, `stable`, mit gesetztem
`search_path`, ohne Actor-Parameter, `anon` **und PUBLIC** ohne EXECUTE), zwei Anker-Ersetzungen aus
der Live-Definition, eine Typdatei, zwei Routen (Daten + CSV), Client-Wrapper, reine Anzeige-Lib und
der Backend-Anteil des Berichts-Blocks. Die Migration prüft ihr eigenes Ergebnis: Modus, Volatilität
und `search_path` je neuer Funktion, dazu `anon`/PUBLIC/`authenticated` über **fünf** Funktionen
(die drei neuen plus die zwei umgestellten).

### Der Auftrag D-δ4 wurde nach einer Messung erweitert — zwei Umstellungen statt einer

Live gemessen tragen **vier** Funktionen das Wort `in_bearbeitung`, und nur zwei davon sind
Regel-Kopien: `_construction_defect_is_overdue` (1× die Paar-Liste) und
`record_construction_acceptance` (1× die Dreier-Liste) wurden umgestellt;
`construction_defect_summary` (1× als Einzelstatus-**Zählung**) und
`transition_construction_defect_status` (4× als **Zustandsübergänge**) sind keine und bleiben
unberührt. Der Grund für die Erweiterung ist konkret: δ braucht für „Mangel **ohne Frist**" die
Statuspaar-Liste, und der β-Helfer gibt sie nicht her (er verlangt ein Datum). Ohne den neuen
`_construction_defect_is_open` hätte δ sie ein **drittes** Mal tippen müssen — genau das, was D-δ4
verhindern soll. In SQL gibt es jetzt je Begriff **eine** Autorität; die TypeScript-Konstanten bleiben
die Zwillinge wie bei β.

### Zwei Messungen haben Entwurfsannahmen korrigiert

**1. D-δ2 war zu stark formuliert.** „Die beiden vorhandenen Auswertungen aufrufen statt nachzuzählen"
ist für den Gewerk-Block **nicht** möglich: `construction_defect_summary.by_trade` gruppiert über die
**Mängel** und listet damit nur Gewerke **mit** Befund — AC-45δ.1 verlangt ausdrücklich alle, auch die
„ohne Befund". δ baut die Gewerk-Liste deshalb aus `project_construction_trades` und wiederverwendet
die **Prädikate** statt der Gruppierung. Damit die zweite Gruppierung nicht auseinanderläuft, prüft
Pentest-Vektor **J** die überlappende Zahl gegen die β-Auswertung.

**2. Die abweichenden Schlüsselnamen sind nur Namen.** β nennt das Feld `project_trade_id`, γ
`trade_id` — beide Fremdschlüssel zeigen auf `project_construction_trades.id` (am Katalog gemessen,
nicht angenommen). Es war also kein Umschlüsseln nötig, nur Aufmerksamkeit beim Verbinden.

### Live-Pentest: 46/46 PASS gegen Prod, 0 Rückstände

`tests/sql/PROJ-45-delta-schedule-signals-pentest.sql` (Block 1 **21** · Block 2 **16** · Block 3 **9**),
jeder Block endet im `raise` und rollt zurück. Tragend sind:

- **D/D2 — der Enkel-Fall (AC-45δH-13):** die Wurzel zählt die Arbeitspakete ihres **Kindeskindes**
  (`source_count=2`), und die naive Ein-Knoten-Abfrage findet **0**. Genau diese Falle hat β und γ je
  einen Vektor gekostet.
- **E — verworfene Arbeitspakete fallen aus dem Nenner** (D-δ5): 1 erledigt von 2 zählbaren = 50 %,
  bei 3 verknüpften. Ohne diese Regel wäre 33 % herausgekommen und 100 % nie erreichbar.
- **G — nichts verknüpft ergibt kein „0 %"**, sondern Abwesenheit (`progress_source` und
  `progress_percent` beide leer). Das ist in Prod heute der Normalfall.
- **B — eine abgesagte Abnahme blockiert nicht** (L27), auch mit verstrichenem Termin.
- **H6 — der fertiggemeldete Mangel ist keine Frist** (β-Regel), zählt aber als offener **Vorbehalt**
  (γ-Regel): derselbe Mangel in zwei Zahlen mit zwei Bedeutungen, beide getrennt geführt.
- **L/L2 + M/M2 — Aggregat-Leck-Probe mit Gegenprobe (AC-45δH-2):** ein Nicht-Mitglied erhält in
  **jeder** Kopfzahl 0 und in **jeder** Liste nichts, während dieselbe Abfrage ohne Rollenwechsel
  Werte ≠ 0 liefert; dasselbe für einen fremden Mandanten (dort 1 Gewerk / 2 Abschnitte in Wahrheit).
- **K2 — der Leser ist nachweislich kein Admin (AC-45δH-3).** Ohne diesen Vektor wäre K falsch-grün:
  in Prod ist jedes Mandanten-Mitglied `admin`.
- **Q/Q2/R/R2 — die Parität der Umstellung (AC-45δH-10):** ein fertiggemeldeter Mangel blockiert das
  Protokollieren einer Abnahme weiterhin (`P0001`), die ausdrückliche Bestätigung hebt es weiterhin
  auf, δ sieht denselben Mangel als offenen Vorbehalt — und nach `geprueft` **löst sich der Blocker
  ohne Zutun**. Beide Seiten hängen jetzt an derselben Liste, und das ist gemessen, nicht behauptet.
- **P/P2 — Verhaltenstabellen statt Textprüfung** über beide Prädikate (7 bzw. 5 Kombinationen).

Beim ersten Lauf gefangen: `phases.sequence_number` ist `NOT NULL` — die Fixture hätte sonst nur
scheinbar geseedet.

### Regressionen wörtlich grün

**β 53/53 · γ 60/60 · α 18/18 · PROJ-Y-45a 9/9 · PROJ-103 7/7**, jeweils 0 Rückstände und **0**
deaktivierte Trigger auf den `construction%`-Tabellen. Bei γ ist zusätzlich belegt, dass die
Umstellung in Prod **wirklich aktiv** ist (der Helfer existiert und der Aufruf steht im
Funktionsrumpf) — der Lauf ist also nicht am alten Prädikat vorbeigelaufen; ohne diesen Nachweis
hätte „60/60 grün" auch bedeuten können, dass gar nichts umgestellt war. PROJ-103 hält seine
**absoluten** Zahlen: δ hat die M&A-Engpass-Auswertung nachweislich nicht angefasst (D-δ8).

### Ein Befund an der Nahtstelle, den kein Typ gefangen hätte

Die Datenroute antwortet `{ signals: … | null }`; der erste Client-Wrapper las die Antwort als nackte
Nutzlast und hätte in Produktion ein Objekt aus lauter `undefined`-Feldern geliefert — **beide** Seiten
tragen nur eine `as`-Zusicherung, der Compiler schweigt dazu. Korrigiert auf das Auspacken der Hülle
(deckungsgleich mit dem γ-Wrapper in derselben Datei); drei Tests pinnen die Form. Bewusst **kein**
erfundenes Leer-Objekt: `as_of` ist der eine Zeitbezug, ein ausgedachter Zeitstempel wäre eine
Falschaussage genau auf der Fläche, die „nichts da" von „0" trennen soll.

### Der Wächter für AC-45δ.18 existiert und beisst

Die Zusage „byte-identisch" hatte kein Messwerkzeug (der Schnappschuss-Aggregator hatte **keinen**
Unit-Test, der Route-Test mockt ihn weg, keine Visual-Baseline zeigt die Report-Fläche). Jetzt prüft
ein Test für ein Nicht-Bauprojekt die **eingefrorene Schlüsselliste** *und* die Abwesenheit des
Bau-Schlüssels. **Rot-grün in drei Richtungen ausgeführt:** unbedingtes `null` → 3 rot, unbedingtes
`{}` → 3 rot, und nach Umsortierung der Zusicherungen fällt auch die `in`-Prüfung selbst — sie war
sonst nie *nachweislich* wirksam, weil der Listenvergleich strikt stärker ist und immer zuerst
zuschlägt. Der Block wird per **bedingtem Spread** gesetzt, nicht als Schlüssel mit `undefined`.

### Neue Entscheidungen aus dem Bauen

- **D-δ11** „Überfällig" bei Arbeitspaketen folgt der Engpass-Auswertung aus PROJ-103 **wörtlich**:
  gesetztes `due_date`, vor heute, Status `todo`/`in_progress`/`blocked`. Kein `planned_end`-Rückfall —
  δ erfindet keine zweite Überfälligkeitsregel neben den beiden, die es schon gibt.
- **D-δ12** Neben `source_count` (gezählte Vorgänge) trägt jeder Abschnitt `linked_count`
  (verknüpfte inkl. verworfener). Ohne die zweite Zahl wäre „verknüpft, aber nichts zählbar" von
  „nichts verknüpft" nicht zu unterscheiden — beide würden ohne Fortschritt erscheinen, obwohl nur
  einer ein Handlungsproblem ist.
- **D-δ13** Der Berichts-Block ist eine **Auswahl** (Blocker je Gewerk, Fortschritt je Abschnitt,
  Kopfzahlen), nicht die ganze Nutzlast: Termine und Mängel-Einzelzeilen gehören in die Fläche, nicht
  in einen eingefrorenen Bericht.
- **D-δ14** Die CSV-Route weist einen unbekannten `section`-Wert mit **400** ab statt auf den Default
  zurückzufallen — ein Tippfehler bekäme sonst eine plausible, aber falsche Datei.
- **D-δ15** Kein Zugriffs-Protokoll-Eintrag (PROJ-130-δ2): die Bau-Erweiterung trägt per α-Entscheid
  **keine** Vertraulichkeitsstufe, es gibt also keine Stufe zu protokollieren.
- **D-δ16** `manual_status` ist im Typ der α-Typ `ConstructionRagStatus`, keine vierte Kopie derselben
  drei Werte (beim Gegenlesen der Typdatei gefunden und sofort behoben).

### Gates

vitest **3469/3469** (413 Dateien) · ESLint **0** repo-weit · tsc **13 = Baseline / 0 neu** (auch nach
dem Build gemessen, PROJ-Y-143e-Messfalle) · Build clean mit **beiden** Routen registriert ·
`check:migration-naming` 0 Fehler · `check:index-scope` 0 Fehler · Funktions-Inventar **283 → 286**
(gegen Prod gegengezählt, AC-45δH-14) · Advisors **149 WARN / 0 ERROR**, und **keine** der Meldungen
betrifft eine der drei δ-Funktionen — sie sind INVOKER mit gesetztem `search_path`, erzeugen also
weder eine `function_search_path_mutable`- noch eine DEFINER-Warnung.

Offen: **`/frontend`** (Reiter „Terminsignale" mit den vier Blöcken, CSV-Knöpfe, Sprünge, plus der
JSX-Guard für den Berichts-Block und die Pflege der Abschnittsliste im Kopfkommentar des Renderers)
und danach **`/qa`** (authentifizierter Durchlauf in der Bau-Fixture-Lane, AC-45δH-9).

---

## `/frontend` — δ live 2026-08-20

Keine Migration, kein neues Paket, kein Backend-Diff. Geliefert: der Projektraum-Reiter
**„Terminsignale"** (`terminsignale`) als **fünfte** Bau-Fläche hinter demselben **einen** Modul-Schalter
(Q4), ein Hook mit dem Bestandsfeld `moduleInactive`, fünf Block-Komponenten plus eine reine
Baum-Hilfe, und der **Rendering**-Anteil des Berichts-Blocks.

Die Fläche trägt die vier Blöcke des Tech Designs: Kopfzeile mit den vier getrennten Zahlen ·
Gewerke mit **manueller α-Ampel und gerechnetem Signal nebeneinander, beide beschriftet** (L26) und
**benannten** Blocker-Gründen · Bauabschnitte als eingerückter Baum mit **Quellenangabe** statt „0 %"
· nächste Fristen mit verstrichenen oben und gekennzeichnet · Engpass-Sicht der überfälligen Mängel ·
CSV je Block. Sie ist **rein lesend**: jede Aktion ist ein Sprung auf die zuständige Fläche, und sie
fragt bewusst **nicht** `manage_members` ab — das ist γs Schreib-Gate und hier falsch (AC-45δ.23,
D-δ10).

**Der Navigations-Eintrag kam ohne Testanpassung dazu.** α hatte die Registry-Invariante damals von
„genau eine Sektion je Modul" auf ihre **Absicht** umgestellt (mindestens eine, Dedup auf der
Sektions-Kennung); das zahlt sich hier zum dritten Mal aus — die 125 Registry-Fälle und die fünf, die
den Projekttyp-Filter festnageln, bleiben unberührt, `requiresProjectType` bleibt einwertig
(AC-45δH-6).

Der Berichts-Block sitzt **hinter den Meilensteinen und vor den Risiken**: er ist die bauspezifische
Fortsetzung der generischen Terminachse, und blockierte Gewerke sind benannte Ausnahmen, die vor die
generische Governance gehören. Der Guard lässt den Abschnitt bei fehlendem Feld **ganz weg** statt ihn
leer zu rendern — der `isEmpty`-Pfad wäre für „kein Bauprojekt" die falsche Zusage. **D-δ6 ist
erledigt und zwar doppelt:** der Bau-Block **und** der von PROJ-56-ε nie eingetragene
`readiness`-Block stehen jetzt in der „locked order" des Kopfkommentars.

### Eine Entscheidung, die eine Wiederverwendung bewusst ablehnt

**D-δ-FE-1:** der Bericht ruft `describeProgressSource` **nicht**. Die Funktion braucht
`source_count`/`linked_count`/`phase_linked_count` — genau die drei Zahlen lässt der eingefrorene
Block bewusst weg (D-δ13). Mit Platzhalter-Nullen zu rufen hieße, Zahlen zu behaupten, die im
Schnappschuss nie standen. Der Bericht formuliert die Quelle daher **ohne Mengenangabe**, unterscheidet
aber weiterhin die zwei Null-Fälle („nichts verknüpft" vs. „verknüpft, nichts zählbar") und zeigt
**nie** „0 %", wo nichts gemessen wurde. Die Blocker-**Gründe** kommen unverändert aus der geteilten
Konstante, und der Test vergleicht gegen die Konstante statt gegen abgeschriebene Zeichenketten — eine
Umformulierung *in der Bibliothek* darf den Test nicht brechen, eine zweite Formulierung *im Bericht*
muss.

### Zwei eigene Fehler, beide von den Gates gefangen

1. **Die Auth-Gate-Zusicherung war falsch, nicht das Produkt.** Der erste Lauf meldete einen
   Fehlschlag auf `overdue_defects` — das ist ein **Sektionsname** und steht im gespiegelten
   `?next=…?section=overdue_defects`, also in der **Eingabe des Aufrufers**. Genau diese Verwechslung
   von „Abwesenheit von Inhalt" und „Abwesenheit des Pfades" warnt der γ-Spec im Kommentar an, und ich
   bin hineingelaufen. Geprüft werden jetzt nur Marken, die ausschließlich in der Nutzlast auftreten
   können (`blocker_reasons`, `progress_source`, `days_overdue`, `trade_label`), plus dass eine
   CSV-Route ohne Sitzung keinen CSV-Rumpf liefert.
2. **Drei ESLint-Fehler** (`react/no-unescaped-entities`) an deutschen Schlusszeichen im JSX-Text.
   Behoben mit der **typografischen** Form `„…“` statt `&quot;` — das ist die Form, die der Bestand
   ohnehin verwendet, und liest sich neben dem öffnenden `„` richtig.

### Ein Fund, der nicht zu δ gehört, aber jede lokale Messzahl dieses Abends berührt

Im **Wurzelverzeichnis des Repos** liegt seit heute Abend ein **fremdes, untracked Projekt**
(`U-Know/`, **4,1 GB**). `tsconfig.json` zieht `**/*.ts(x)` ein, deshalb gilt lokal:

- `npx tsc` meldet **4632** Fehler statt 13 — **alle** aus `U-Know/`; ohne diese Fläche gezählt sind es
  **13 = Baseline / 0 neu**.
- `npm run build` **schlägt fehl** in der Typprüfungs-Phase, mit einem fehlenden Modul in
  `U-Know/src/app/dashboard/achievements/page.tsx`.
- `npx vitest run` meldet **86 fehlgeschlagene Dateien / 34 Tests** — ebenfalls sämtlich aus `U-Know/`.

Weil eine Zahl, die man nicht erklären kann, kein Gate ist, wurde der Build in einem **frischen
git-Worktree** auf demselben Commit gemessen (hartverlinktes `node_modules`, Hausrezept): dort
**tsc 13 = Baseline** und **Build clean mit allen drei Flächen registriert**
(`/projects/[id]/terminsignale` plus die zwei API-Routen). Das Verzeichnis ist **nicht** committet und
erreicht CI also nicht; es wurde bewusst **nicht** angefasst (4,1 GB fremder Arbeitsstand). Sollte es
dauerhaft dort bleiben, gehört es in `.gitignore` **und** in `tsconfig.exclude` — das ist eine
Entscheidung des Repo-Eigners, keine dieser Slice.

### Nachweise

- **Auth-Gates δ: 6/6** chromium (Auswertung + vier CSV-Sektionen + Reiter), nach der Korrektur oben.
- **Visual-Regression: 9/9 ohne Neuaufnahme** — gemessen, nicht geschlossen. Die neue Sektion ist auf
  `project_type='construction'` **und** das Modul gegatet, und der Visual-Mandant hat beides nicht;
  die Erwartung „keine Baseline bewegt sich" ist damit belegt statt behauptet.
- **α/γ-Auth-Gates unverändert grün** im gemeinsamen Lauf.
- **vitest 3484/3484 in 415 Dateien** (ohne `U-Know/`), ESLint **0** über `src` und `tests`.

### Eine Regression, die nicht δ gehört

`tests/PROJ-45-beta-defects.spec.ts` fällt mit **5 failed / 1 did not run / 12 passed**, Stacktrace auf
`removeRunDefects → deleteOrThrow` — **byte-identisch** zu der Signatur, die schon der γ-`/qa`- und der
γ-`/deploy`-Lauf gemessen und als **PROJ-Y-45h** registriert haben (Ursache: PROJ-Y-148d hat
`construction_defects` unlöschbar gemacht, der Teardown der Spec kennt den sanktionierten Weg noch
nicht). **Strukturell belegt, dass δ es nicht sein kann:** die δ-Migration enthält **0** DDL-Anweisungen
(kein `alter table`, `create table`, `create policy`, `create trigger`, `drop`) und nennt
`construction_defects` nur an zwei Stellen — beide lesend innerhalb der Auswertung.

### Abweichungen

- **D-δ-FE-1** Bericht ohne `describeProgressSource` (oben begründet).
- **D-δ-FE-2** Kein shadcn-Primitive im Berichts-Block: die Report-Fläche ist druckoptimiert und
  rendert durchgehend nackte semantische Tabellen mit Tailwind — auch der `readiness`-Block. Eine Card
  mitten im PDF wäre der Stilbruch, nicht die Regelbefolgung.
- **D-δ-FE-3** Unbekannte Enum-Werte im eingefrorenen Block werden **roh** ausgegeben statt
  verschwiegen: ein alter Schnappschuss kann Werte tragen, die dieser Build nicht kennt.
- **D-δ-FE-4** **Kein authentifizierter Browser-Durchlauf in diesem Schritt** — die Fläche ist
  projekttyp- **und** modul-gegatet, und das Modul im geteilten `[E2E]`-Mandanten einzuschalten hätte
  die frisch gemessenen Visual-Baselines verschoben (PROJ-Y-143f/143l). Gehört mit der Bau-Fixture-Lane
  nach `/qa` (AC-45δH-9), zusammen mit dem Befund, dass die Lane **von sich aus nur den Leerzustand**
  hergibt: live gemessen liefert sie 1 Gewerk ohne Befund, 2 Abschnitte ohne Verknüpfung, 0 Fristen,
  0 Engpässe — ein echter Blocker muss dort geseedet werden, sonst prüft der Durchlauf nur die leere
  Hälfte.

Offen: **`/qa`**.

---

## `/qa` — δ PASS 2026-08-21 (0 Critical / 0 High / 0 Medium → Approved)

**24/24 Akzeptanzkriterien, 14/14 Härtungskriterien.** Kein Kriterium bleibt offen; die zwei, die
eine Nachweismatrix als „nur Code" ausgewiesen hat, sind in diesem Lauf mit Tests unterlegt worden.

### Der Kern: der Durchlauf, den `/frontend` offen gelassen hat — mit geseedetem Blocker

`tests/PROJ-45-delta-signals-chain.spec.ts`, **3× 2/2 chromium**. Die Fixture-Lane gibt von sich aus
**nur** den Leerzustand her (live gemessen: 1 Gewerk ohne Befund, 2 Abschnitte ohne Verknüpfung, 0
Fristen, 0 Engpässe) — ein Durchlauf darauf hätte von den vier Blöcken **keinen** im gefüllten
Zustand belegt. Die Kette seedet daher einen echten Blocker und prüft **beide Hälften gegeneinander**:

- **gefüllt:** überfälliger Mangel → Gewerk „Blockiert" mit **benanntem** Grund, die drei getrennten
  Zahlen, „aus 2 Arbeitspaketen im Teilbaum" an der **Wurzel** (die Arbeitspakete hängen am Kind),
  50 % Fortschritt, die Frist als **verstrichen**, die Engpass-Zeile mit „6 Tage";
- **leer, mit Grund:** ein Abschnitt ohne Verknüpfung zeigt weder Balken noch „0 %", sondern den Satz,
  warum nichts messbar ist.

**Zwei negative Zusicherungen tragen den Rechte-Teil**, weil eine Kette, die nur den Glückspfad geht,
über ein Tor nichts beweist: der **Betrachter** sieht die Fläche vollständig (AC-45δ.23 — hier gibt es
bewusst **keine** verschärfte Rolle, anders als bei γ), und sie bietet ihm **keinen** Schreibweg —
während derselbe Betrachter im **gleichen Test** auf der Mängel-Fläche „Mangel erfassen" sehr wohl
sieht (β/L15). Ohne diese Gegenprobe belegte „kein Knopf" nur die Abwesenheit eines Knopfes.

### Live gegen Prod: 199 PASS / 0 FAIL über sechs Dateien, 0 Rückstände

| Datei | Ergebnis |
|---|---|
| **δ** `PROJ-45-delta-schedule-signals-pentest.sql` | **52/52** (21 + 16 + 9 + 2 + 4) |
| **δ Rot-Team** `PROJ-45-delta-redteam-supplement.sql` | **21/21** (neu in `/qa`) |
| β | **53/53** wörtlich |
| γ | **60/60** wörtlich |
| α | **18/18** wörtlich |
| PROJ-Y-45a | **9/9** wörtlich |
| PROJ-103 | **7/7** wörtlich — die **absoluten** Zahlen halten, δ hat die M&A-Engpass-Auswertung nicht angefasst |

Rückstandsfreiheit über neun Zähler; **0** deaktivierte Trigger (mit Gegenprobe „19 Trigger vorhanden,
19 aktiv" — sonst hieße „0 Treffer" auch „keine Trigger gefunden"). Der Bestand von 14 Mängeln und 24
Ereignissen im Bau-Mandanten ist **zugeordnet** statt unerklärt gelassen: β/γ-QA-Fixture vom 2026-08-20.

**Das Tor der Slice ist belegt, nicht bloß grün:** beide Prädikat-Umstellungen sind in Prod aktiv
(je 1 Aufruf im Rumpf, das alte Literal im β-Helfer nachweislich verschwunden, die Geschwister-Zweige
der γ-Funktion erhalten), beide Helfer `immutable` mit `search_path`, `anon` **und PUBLIC** ohne
EXECUTE. Ohne diesen Nachweis hätte „60/60 grün" auch „nichts umgestellt" heißen können.

### Was `/qa` selbst nachgebessert hat

Eine Nachweismatrix über alle 38 Kriterien hat drei Lücken benannt, alle in diesem Lauf geschlossen:

1. **AC-45δ.2 und AC-45δ.15 waren „nur Code".** Keine Testdatei rendert die Fläche; die zwei
   Kriterien, die am leisesten kippen, hingen an Kommentaren. Neu: **19 Komponenten-Fälle** in drei
   Dateien, jeweils **rot-grün belegt**. Der schärfste ist die Kopfzeile: die Zusammenfassung sagt
   7/5/3/2, die Listen tragen **eine** Zeile und ein unblockiertes Gewerk — nur eine Kopfzeile, die
   aus `summary` liest, kann das anzeigen. Würde eine künftige Fassung aus den Listen rechnen (die
   benannte Gefahr), stünde dort 1 bzw. 0. Dazu: die Summe 15 darf **nicht** vorkommen, weil sie
   denselben Mangel mehrfach zählte. Beim Schreiben fiel auf, dass „Überfällig" **zweimal** im DOM
   steht (Kachel und Gewerk-Zähler) — ein `getByText` war mehrdeutig und ist auf „Beschriftung mit
   dem Wert aus `summary`" präzisiert.
2. **Die Aggregat-Leck-Probe deckte vier von sechs Kopfzahlen.** `defects_without_due_date` und
   `defects_awaiting_review` waren in **keinem** Leck-Vektor zugesichert. Neuer Block 2b: der Seed
   macht alle drei Mangel-Zähler ungleich 0 (sonst wäre die Zusicherung trivial erfüllt) und die
   Prüfung **iteriert über die Schlüssel** — ein künftiger siebter Zähler kann nicht stillschweigend
   ungeprüft bleiben.
3. **AC-45δ.20 hing an einem Strukturargument** („`report_snapshots` hat keine UPDATE/DELETE-Policy").
   Neuer Block 4 macht daraus Verhalten: **42501** auf beiden Wegen, und S3 belegt, dass die Zeile für
   denselben Nutzer **lesbar** ist — ohne das wären S1/S2 auch bei unsichtbarer Zeile grün.

### Befunde

- **F-δ1 (Low, in `/qa` behoben).** Der CSV-Knopf trug als **zugänglichen** Namen nur den Blocknamen
  („Gewerke") — im gleichnamigen Block doppelt und ohne Hinweis, dass eine Datei kommt. Jetzt
  `aria-label` „… als CSV herunterladen"; die Kette prüft darauf.
- **F-δ2 (Low, offen → PROJ-Y-45l).** Der Rekursions-Riegel der Auswertung (`depth < 20`)
  **unterberichtet still**: bei 25 verschachtelten Abschnitten zählt die Wurzel nur bis Ebene 20, der
  tiefe Knoten sieht sein eigenes Arbeitspaket (also kein Fehler, kein Hängen) — aber der Fortschritt
  an der Wurzel ist zu niedrig, ohne dass die Oberfläche es sagen könnte. Gemessen, nicht vermutet;
  reale Abschnittsbäume haben 2–4 Ebenen, die Fixture zwei.
- **F-δ3 (Info, offen → PROJ-Y-45m).** Die Auswertung joint `projects` nicht und filtert daher
  `is_deleted` nicht: Zeilen eines **weich gelöschten** Projekts erscheinen, wenn man die Kennung
  kennt. Kein Rechteproblem (RLS und Projekt-Mitgliedschaft unverändert) und **konsistent mit den
  Geschwister-Flächen** — deshalb Info und cross-cutting, nicht δ-Defekt.
- **F-δ4 (Info) — eine Korrektur an einem registrierten Followup.** PROJ-Y-45h ist **enger** als
  notiert: ein Mangel ist nicht grundsätzlich unlöschbar, sondern erst **mit** Verlaufszeilen. Die
  fünf Zeilen dieses Laufs ließen sich mit einem gewöhnlichen `DELETE` entfernen — **kein** Runbook-Weg,
  **0** deaktivierte Trigger. Was β's Teardown bricht, ist die unveränderliche **Historie**, nicht die
  Mangel-Zeile; damit ist auch die Richtung für 45h klarer.
- **F-δ5 (Info, eigener Fehler).** Zwei meiner Zusicherungen waren falsch, nicht das Produkt: die
  Auth-Gate-Marke `overdue_defects` ist ein **Sektionsname** und steht im gespiegelten `?next=`
  (genau die Verwechslung, vor der der γ-Spec im Kommentar warnt), und die Quellenangabe hatte ich
  erfunden statt nachgelesen („aus N Arbeitspaketen im Teilbaum"). Beide korrigiert; die Testdateien
  tragen die Begründung, damit die nächste Fassung nicht wieder hineinläuft.

### Gates

vitest **3496/3496** in 419 Dateien · ESLint **0** über `src` und `tests` · tsc **13 = Baseline / 0
neu** · Playwright **36/36** chromium (δ-Auth-Gates 6 + δ-Kette 2 + α 18 + γ 10) · **Visual 9/9 ohne
Neuaufnahme** · Advisors **149 WARN / 0 ERROR**, davon **keine** zu einer der drei δ-Funktionen ·
`check:index-scope` 0 · `check:migration-naming` 0 · Funktions-Inventar **286**, gegen Prod
gegengezählt.

Alle lokalen Zahlen sind **ohne** das fremde, untracked `U-Know/` im Wurzelverzeichnis gemessen (siehe
`/frontend`-Notiz); der Build wurde dafür erneut in einem frischen Worktree auf demselben Commit
gefahren.

### Abweichungen

- **D-δ-QA-1** Mobile Safari env-übersprungen (WebKit-Host-Bibliotheken fehlen, PROJ-67/F2).
- **D-δ-QA-2** Kein Durchlauf der β-**authentifizierten** Spec: sie fällt weiterhin mit
  **5 failed / 1 did not run / 12 passed** im Teardown (`removeRunDefects → deleteOrThrow`) — die
  bereits als **PROJ-Y-45h** registrierte Signatur aus PROJ-Y-148d. Strukturell belegt, dass δ es
  nicht sein kann: die δ-Migration enthält **0** DDL-Anweisungen und nennt `construction_defects` nur
  lesend. F-δ4 präzisiert die Ursache.
- **D-δ-QA-3** Der Rot-Team-Lauf ist DB-Ebene; die CSV-Formel-Neutralisierung ist über die
  Route-Tests belegt, nicht über einen authentifizierten Abruf mit Datei-Download.

---

## Followups 45d / 45g / 45i — erledigt 2026-08-21

Drei Kleinbefunde aus β/γ, zusammen erledigt weil sie **dieselben zwei Bau-Komponenten** anfassen. Kein
Backend, keine Migration, kein neues Paket.

### PROJ-Y-45g — der Beleg ist jetzt auch als Dokumentknoten wählbar *(schließt eine Auslassung)*

Das ist die einzige der drei mit Scope-Bedeutung: **AC-45γ.24** verlangt „entweder eine externe Adresse
**oder** ein vorhandener Dokumentknoten aus dem DMS" und war bis heute **serverseitig erfüllt und für den
Nutzer halb**.

**Die Registerangabe „es fehlt allein der Picker" habe ich nachgeprüft, nicht übernommen — sie stimmte:**
Datenbank (`document_node_id`, Einzel-Beleg-CHECK), Route **und** Zod-Schema (`acceptanceDocumentSchema`
mit drei `refine`-Regeln: nie beides, nie Entfernen-plus-Setzen, nie leer), Client-Wrapper und sogar die
**Anzeige** („Dokument im Dokumentenbaum") trugen den zweiten Weg von Anfang an. Es fehlte wirklich nur
der Eingabeweg.

Geliefert: die Quelle ist eine **benannte Wahl** („Externe Adresse" / „Dokument aus dem
Dokumentenbaum"), keine Ableitung aus „welches Feld ist gefüllt" — dieselbe Entscheidung wie bei γs
drittem Bezug („Das ganze Projekt" statt „nichts ausgewählt"), und die einzige, die zum CHECK passt, der
beides zugleich ablehnt. Die Liste zeigt **nur Dateien, keine Ordner** (ein Beleg ist *ein*
unterschriebenes Protokoll), lädt **erst bei Auswahl der Quelle** und hat einen ehrlichen Leerzustand mit
Verweis auf „Dokumente" statt einer leeren Auswahlliste.

**Eine Kopie vermieden statt angelegt:** die Pfad-Beschriftung stand inline in
`skill-knowledge-links-section` (PROJ-77-γ). Sie ist als reine Funktion `nodePathOptions` nach
`lib/dms/tree.ts` gezogen und **beide** Verbraucher nutzen sie — hätte ich sie kopiert, wäre das der
Anfang von genau dem Muster, das PROJ-Y-45k mit sieben CSV-Kopien beklagt. 5 neue Lib-Tests, darunter
Zyklus-Abbruch und Lücke-in-der-Kette (der Wächter verhindert Zyklen, eine **teilweise** geladene Liste
kann aber einen Knoten ohne Vorfahr enthalten).

### PROJ-Y-45d — der Gewerk-Select kippt nicht mehr von unkontrolliert auf kontrolliert

`construction-defect-dialog.tsx` übergab `undefined`, solange nichts gewählt war; React entscheidet die
Kontrolliertheit an der ersten Render-Runde und meldete bei der ersten Auswahl „Select is changing from
uncontrolled to controlled". Die Datei hatte die richtige Konstante `NONE` **schon** und benutzte sie für
`section_id` und `vendor_id` — nur `trade_id` fiel heraus.

**Ein Befund, der die Registerangabe korrigiert.** Dort steht „die einzige Stelle dieser Form im ganzen
Repo". Das trifft auf die **wörtliche** Form zu (`value={… .length > 0 ? … : undefined}`, gemessen 1
Treffer), **nicht** auf die Defektklasse: fünf weitere Selects übergeben `… ?? undefined`
(`release-page-client`, `method-header`, `sprint-state-dialog`, `step-ma-foundation`,
`ma-foundation-card`). Sie sind **nicht** mitgefixt — jede liegt in einer fremden Slice, und
`method-header` rendert auf **jeder** Projektraum-Seite, also unter der Visual-Baseline `project-room`.
Registriert als **PROJ-Y-45n**, mit der gemessenen Liste.

Der Regressionsschutz ist deshalb ein **struktureller** Wächter
(`src/test/select-controlled-value.contract.test.ts`, Muster `audit-report-view.contract.test.ts` aus
PROJ-Y-130p) und keine Radix-Interaktion in jsdom: der Fehler ist eine Verdrahtung, keine Laufzeitlogik.
Er hält die Mangel-Maske fest, sperrt die ganze Bau-Fläche, und die fünf stehen als **erschöpfende**
Ausnahmeliste darin — ein *neuer* solcher Select macht den Lauf rot. Ein vierter Fall prüft, dass der
Sucher nicht ins Leere greift (sonst wären die drei negativen Zusicherungen trivial grün — dieselbe
Falle wie PROJ-130-δ1/F-1).

### PROJ-Y-45i — die Abnahme-Detailansicht hat im Ladezustand einen Namen

`SheetHeader`/`SheetTitle` standen im `else`-Zweig der Ladeverzweigung; solange geladen wurde, hatte das
Fenster **keinen** zugänglichen Namen. Die Geschwister-Fläche `construction-defect-detail-sheet` rendert
ihren Kopf seit β **unbedingt** und ihr Skeleton nur innen — γ ist damit jetzt strukturell gleich, statt
einen zweiten Platzhalter-Titel danebenzustellen.

Der Test prüft `getByRole("dialog", { name })`, also den **zugänglichen** Namen und nicht sichtbaren Text;
ein `getByText` wäre auch grün, wenn der Text irgendwo im Rumpf stünde, ohne das Fenster zu benennen — und
genau das war der Defekt. Ein zweiter Fall sichert die Gegenrichtung (nach dem Laden benennt der Titel die
konkrete Abnahme und der Ladetitel ist **weg**), sonst wäre der erste Fall auch mit einem dauerhaft
gerenderten Platzhalter grün.

### Nachweise

**Rot-Grün für beide Fixes ausgeführt**, Rücksetzung über eine Dateikopie statt `git checkout` (das hat in
dieser Kette schon einmal uncommittete Arbeit gelöscht, PROJ-130-δ2/F-3):

- 45d: ohne den Fix fallen **alle 4** Wächter-Fälle; danach 4/4 grün.
- 45i: ohne den Fix fällt **genau** der Ladezustands-Fall, der geladene bleibt grün — der Test trifft also
  den Defekt und nicht die Komponente allgemein.

Gates im eigenen Worktree gemessen, also **ohne** das fremde untracked `U-Know/` im Wurzelverzeichnis des
Primär-Checkouts, das jede lokale Zahl dort verfälscht: vitest **3573/3573** in 425 Dateien (+11) ·
ESLint **0** über `src` und `tests` · tsc **13 = Baseline / 0 neu**, auch **nach** dem Build (PROJ-Y-143e-Falle)
· Build clean.

**Zwei ESLint-Funde an eigenem Code, beide nach Hausmuster gelöst statt per Ausnahme:** das synchrone
`setTreeLoading(true)` im Effektkörper ist seit PROJ-67/AC-4 verboten → Zustand erst **nach** dem `await`
(`treeLoaded`), Ladezustand daraus abgeleitet (`use-tenant-members`-Muster aus PROJ-130-γ2b); und ein
deutsches Schlusszeichen im JSX-Text mit der **typografischen** Form behoben, nicht mit `&quot;` — das ist
die Form des Bestands (δ `/frontend`).

**Nicht bewiesen und so benannt:** kein authentifizierter Browser-Durchlauf des neuen Pickers. Er bräuchte
im Bau-Mandanten eine Datei im Dokumentenbaum **und** eine Abnahme mit Ergebnis; das DMS ist dort leer
(PROJ-80 hat 0 Dokumente in Prod gemessen). Belegt sind die Verdrahtung über Komponenten- und Lib-Tests
und die Serverseite durch γs Rot-Team-Vektor **S** (fremder Knoten → `23514`).

---

## Followups 45f / 45l / 45m — erledigt 2026-08-21 (DB-Gruppe)

Drei Registereinträge, zusammen erledigt weil sie **denselben Abschnittsbaum** betreffen. Eine Migration
(`20260821120000_projy45_db_group_hygiene`), keine neue Tabelle, kein neues Paket, kein CIA-Pass
(Fehlerbehebung, keine Architekturänderung).

**Die Messung hat die Prämisse von 45l umgekehrt und die von 45m widerlegt.** Beide Registereinträge
waren als „entscheiden oder dokumentieren" formuliert; keine der dort genannten Optionen war nach der
Messung noch richtig.

### PROJ-Y-45f — die tote β-Auskunft ist gezogen

`construction_section_blocking_defects(uuid)` stand seit dem γ-Deploy ohne Aufrufer in Prod. Vor dem
Ziehen **gemessen statt vermutet**: 0 Aufrufer in Funktionskörpern, Views, Policies, CHECK-Bedingungen
und Spalten-Defaults (eine Abfrage über alle fünf Fundstellen-Arten), 0 in `src/`. Die Migration bringt
diese Abfrage als **Vorbedingung** mit und bricht laut ab, falls doch jemand ruft.

**Nebenfund:** der TypeScript-Typ `ConstructionSectionBlockingDefect` hatte seine Funktion überlebt und
war ebenfalls unbenutzt (0 Verwender) — mit gezogen. Ein Typ ohne Funktion und ohne Verwender ist genau
die Art Rest, die später jemand wieder anschließt.

**Drei Testdateien nachgezogen, keine abgeschwächt:**
- β's Vektoren V2/V3 rufen jetzt `construction_section_blocking_refs` und prüfen dabei **zusätzlich die
  Art** des Blockers (`kind='mangel'`) — die Nachfolge-Auskunft liefert sie mit, die Zusicherung wird
  also schärfer statt bloß umgehängt. Neu ist **V4**: die gezogene Funktion ist wirklich weg.
- β's ACL-/`search_path`-Listen verlieren den Namen (6 → 5 aufrufbare, 3 → 2 lesende Funktionen). Keine
  Abdeckungslücke: der γ-Pentest führt beide Nachfolge-Auskünfte in seinen eigenen Listen.
- γ's Vektor **G8 ist umgedreht**. Er sicherte zu, β's Funktion existiere weiter, „weil die deployte
  Route sie im Fenster zwischen Migration und Code-Deploy ruft" — dieses Fenster ist mit dem γ-Deploy
  geschlossen. Jetzt prüft er den Endzustand, **G8b** neu, dass die Nachfolge steht (sonst wäre die
  Auskunft entfernt statt ersetzt).

### PROJ-Y-45l — der Tiefen-Riegel war **nicht** dekorativ

Der Registereintrag nannte drei Wege und begründete sie mit „Zyklen sind durch
`construction_sections_no_self_loop` und den `<@`-Zyklustest im α-Wächter strukturell ausgeschlossen".
**Diese Begründung trägt nicht — live in zurückgerollten Transaktionen belegt:**

| Messung | Ergebnis |
|---|---|
| Zyklus mit gesetztem `path` | abgelehnt, `23514` ✔ |
| `update construction_sections set path = null` | **gelingt** — `path` ist nullable ohne CHECK und steht **nicht** in der Spaltenliste des Wächter-Triggers |
| derselbe Zyklus danach | **gelingt**, 2 Zyklus-Kanten |
| Spaltenrecht `UPDATE (path)` für `authenticated` | **vorhanden** — der Weg ist aus dem Browser-Client erreichbar (Projektleitung/Mandanten-Admin) |
| δ-Auswertung auf dem Zyklus | terminiert (`subtree_depth` = Riegelhöhe) |
| γ-Auskunft `construction_section_blocking_refs` auf demselben Zyklus | **hängt** (`57014` Statement-Timeout) — und die ruft die deployte „Abschnitt entfernen"-Route |

Der Zyklus-Zweig hing an `OLD.path is not null` und wurde übersprungen, sobald `path` genullt war. Der
Riegel war damit das Einzige, was die Terminsignale vor dem Hängen bewahrt hat — **den Riegel zu
entfernen (Option 1 des Registereintrags) hätte die Slice verschlechtert**, nicht verbessert.

**Deshalb zwei Eingriffe statt einem:**

1. **Ursache.** Der Zyklus-Test läuft jetzt `path`-unabhängig: ein begrenzter Lauf aufwärts über
   `parent_id`, der abbricht, wenn er die eigene Zeile trifft. Das ist die Prüfung, die der Wächter
   gemeint hat. Der Wächter ist dafür **ganz neu geschrieben** statt anker-ersetzt — die Hausnorm
   (Anker-Ersetzung aus der Live-Definition) schützt Funktionen mit über Slices angesammelten Zweigen,
   dieser hat vier Bedingungen und genau ein `raise` je Bedingung; alle Bestandszweige sind wörtlich
   übernommen und die Migration prüft ihre Anwesenheit nach.
2. **Symptom.** Der Riegel bleibt (jetzt aus gemessenem Grund), steigt von 20 auf **50** und die Kappung
   wird **ausgewiesen** statt verschwiegen: `section_depth_cap` in der Nutzlast, `subtree_truncated` je
   Abschnitt, Abzeichen „Teilbaum gekappt ab Ebene N" auf der Fläche, Spalte `teilbaum_gekappt` in der
   CSV. Die Grenze ist **exakt**, nicht geschätzt: die Schließung läuft eine Ebene **tiefer** als
   gezählt wird, ein Baum genau in Riegelhöhe gilt also **nicht** als gekappt (Pentest B1/B2).

**Bewusst NICHT getan:** der ungekappten γ-Auskunft ebenfalls einen Riegel geben. Sie benennt die
Blocker einer Entfernen-Sperre; ein Riegel dort würde in genau dieser Meldung unterberichten — also die
Defektklasse einführen, die 45l gerade beseitigt. Mit dem geschlossenen Wächter ist ihr Hängen
unerreichbar, und die Migration prüft nach, dass der Bestand keine Zyklus-Kante trägt (Prod: 0).

**`path` bleibt manipulierbar** (Wert desynchronisierbar, Zyklus nicht mehr) — die Spalte
schreibgeschützt zu machen hätte einen Trigger auf `path` gebraucht, und der hätte den Repath-Trigger
bei Zweigen ab drei Ebenen gebrochen: der Wächter rechnet je Zeile aus dem **Vor-Stand** des
Elternteils, während der Repath alle Nachfahren in einer Anweisung umschreibt. Pflichtfeld und
`ltree`-Konsolidierung bleiben bei **PROJ-Y-45j**, wo sie schon geführt sind.

### PROJ-Y-45m — produktweite Konvention, kein δ-Defekt (keine Codeänderung an δ)

Der Registereintrag verlangte zu prüfen, ob die Geschwister-Flächen dasselbe tun. **Gemessen: ja,
ausnahmslos** — und die entscheidende Stelle lag woanders als vermutet.

- **11 von 11** projektbezogenen Auswertungsfunktionen filtern `projects.is_deleted` nicht (nur
  `steering_report` liest `projects` überhaupt, und auch sie filtert nicht).
- **4 von 4** Bau-RLS-Policies gaten auf `is_project_member(project_id)`, ohne Papierkorb-Prüfung.
- **Aber:** `requireProjectAccess` selektiert `.eq("is_deleted", false)` und antwortet für ein
  Papierkorb-Projekt mit **404** — für alle drei Aktionen und damit für jede Route, die den Helfer
  benutzt, die Terminsignal-Routen eingeschlossen. Der Papierkorb **ist** durchgesetzt, an genau
  **einer** Stelle.

δ ist damit kein Ausreißer, und ein `is_deleted`-Filter in die eine Funktion zu kopieren wäre falsch:
er schützt nichts (das Mitglied liest die Quellzeilen ohnehin direkt), wäre strenger als die Tabellen,
die er liest, und wäre die elfte Kopie einer Regel, die genau dadurch driftet.

**Geliefert wurde deshalb das, was fehlte:** die Konvention ist als
[ADR `soft-delete-enforcement-scope.md`](../docs/decisions/soft-delete-enforcement-scope.md)
niedergeschrieben (samt verworfener Alternative und der akzeptierten Folge, dass ein direkter
`supabase.rpc(...)`-Aufruf die 404 umgeht) und die **einzige** Durchsetzungsstelle ist festgenagelt:
`route-helpers.soft-delete.test.ts` prüft das Verhalten (404 statt 403/500, alle drei Aktionen) **und
strukturell**, dass der Filter angewandt wird. Ohne die zweite Hälfte bliebe der Test grün, wenn der
Filter verschwindet — rot-grün belegt: entfernt man ihn, fällt genau die strukturelle Hälfte.

### Nachweise

**Neuer Live-Pentest `tests/sql/PROJ-Y-45-db-group-pentest.sql` 16/16 PASS gegen Prod, 0 Rückstände.**
Tragend: **A3** die Umgehung ist zu (derselbe Zyklus, der vorher gelang, wird abgelehnt) mit **A3b** als
Gegenprobe, dass `path` wirklich null war — ohne sie prüfte A3 nur A2 ein zweites Mal; **A4** der
mehrstufige Zyklus (Grossvater unter Enkel); **A5** der Repath ist unberührt; **B1/B2** die exakte
Grenze der Kappung in beide Richtungen; **C3** `anon` **und** PUBLIC ohne EXECUTE über den ACL-Eintrag,
der mit `=` **beginnt** (γ-Lehre B-γ1).

**Regressionen wörtlich grün, je 0 Rückstände:** α **18/18** · β **54/54** (32+15+7, mit V4 neu) ·
γ **61/61** (31+14+12+4, mit G8b neu) · δ **53/53** (22+16+9+2+4, mit D4 neu) · PROJ-Y-45a **9/9**.
Prod-Zustand vor und nach den Läufen identisch (2 Abschnitte, 14 Mängel, 0 Abnahmen, 52 Projekte,
0 `path`-Nullwerte, 0 Zyklus-Kanten, 19 Bau-Trigger, **0** deaktiviert).
**Advisors 149 WARN / 0 ERROR** — keine einzige Meldung nennt eine der zwei neu geschriebenen Funktionen.

**Rot-Grün dreimal ausgeführt** (jeweils über eine Dateikopie zurückgesetzt, nie `git checkout` —
PROJ-130-δ2/F-3): ohne den `is_deleted`-Filter fällt die strukturelle Hälfte des 45m-Wächters; ohne das
Kappungs-Abzeichen fällt der UI-Fall; ohne die CSV-Zelle fällt der Export-Fall.

**Gates:** ESLint **0** · tsc **13 = Baseline / 0 neu** (auch nach dem Build gemessen, `.next`-Falle
aus PROJ-Y-143e vermieden) · vitest **3580/3580** in 426 Dateien (+7) · Build clean mit allen drei
δ-Flächen registriert · migration-naming 0 Fehler · index-scope 0 Fehler.

### Der Funktions-Inventar-Wächter hat zugeschlagen — und das ist der Ertrag

Der erste CI-Lauf war rot: **`Verify prod function inventory vs migration files`** (PROJ-Y-148e).
Genau sein Zweck, und er hat zwei Dinge sichtbar gemacht.

**1. Das Inventar musste aufgefrischt werden** — Pflicht am Ende jeder Slice mit Migration
(`docs/production/function-inventory.md`), von mir zunächst versäumt. Der Diff ist **genau eine Zeile**:
`construction_section_blocking_defects` verschwindet, **286 → 285**. Nichts Unerklärtes tauchte auf —
das ist die Aussage, für die das Auffrischen da ist. Die gezogene Funktion erscheint jetzt korrekt in
der *informativen* Zeile „im Repo angelegt, aber nicht im Prod-Inventar (gedroppt …)": β's Migration
legt sie an (append-only), meine zieht sie.

**2. Ein vorbestehender Fehlschlag auf `main`, nachgemessen statt vermutet.** Mit main's Inventar und
main's Wächter fällt derselbe Lauf — Ursache ist **PROJ-Y-114as Merge** (PR #400): sein
`pending_merge`-Wegwerf-Eintrag ist damit überflüssig, genau wie sein eigener Kommentar es
vorhergesagt hat („sobald sie landet, meldet der Wächter ihn als veraltet und er ist zu entfernen").
Eintrag entfernt, der pinnende Test führt die Liste jetzt ohne ihn — bewusst **ohne Ersatz**: sie soll
leer laufen, nicht gepflegt werden.

**Denselben Defekt im Wächter hat eine Parallel-Session zuerst behoben — und meine Fassung ist
verworfen.** Die Staleness-Bedingung hat **zwei** Zweige (`!prod.has(n) || repo.has(n)`), die Meldung
nannte immer nur den ersten und war für einen gemergten `pending_merge`-Eintrag damit **sachlich
falsch** („existiert nicht mehr im Prod-Inventar", obwohl die Funktion sehr wohl in Prod steht). Ich
hatte das unabhängig gemessen und behoben; während dieser Slice landete **PROJ-Y-114f** (#443) mit
derselben Diagnose auf `main`, in besserer Form: ein eigener Helfer `describeStaleException`, vier
zusätzliche Testfälle und die Schnittstelle von `analyzeInventory` **unberührt** — meine Fassung hatte
sie um ein Feld erweitert. Beim Rebase habe ich die drei Wächter-Dateien deshalb **wörtlich von `main`
übernommen** und meine Änderung fallen gelassen. Aus dieser Slice bleibt nur, was allein ihr gehört:
die Inventar-Auffrischung. Festgehalten, weil zwei Sessions denselben Fund gemacht haben — der Wächter
war auf `main` rot und färbte jeden offenen PR mit, was genau die Art ist, wie ein Wächter ignoriert
wird.

**Nebenbefund am eigenen Vorgehen, festgehalten:** ein `git stash -u` in einem Baum ohne
uncommittete Arbeit stasht nichts — das folgende `git stash pop` hat deshalb einen **fremden, älteren
Stash** einer anderen Session ausgepackt und einen Konflikt an `CLAUDE.md`/`AGENTS.md` erzeugt (genau
die Symlink-Falle, vor der CLAUDE.md warnt). Kein Schaden: `pop` behält den Eintrag bei Konflikt, der
Konflikt wurde verworfen, alle drei Stashes sind unversehrt und `AGENTS.md` ist wieder ein Symlink.
Lehre: für einen Blick auf fremde Dateiversionen `git show <ref>:<pfad>` statt stash/checkout.

### Abweichungen

- **D-Y45db.1** Der Wächter ist neu geschrieben statt anker-ersetzt (Begründung oben); die Migration
  prüft dafür beides nach — der neue Lauf ist da **und** der `path`-abhängige Zweig ist weg. Nur
  „hinzugefügt" hätte die Umgehung stehen gelassen.
- **D-Y45db.2** Der Riegel steigt von 20 auf 50. Für reale Bäume (2–4 Ebenen) ohne Wirkung; er ist
  jetzt eine zweite Reihe hinter dem geschlossenen Wächter, nicht die erste.
- **D-Y45db.3** 45m ändert keinen Produktivcode an δ — geliefert sind ADR und Wächter. Wer eine
  Codeänderung erwartet hat, findet die Begründung im ADR.
- **D-Y45db.4** Kein authentifizierter Browser-Durchlauf: die Kappung ist ab 51 Abschnittsebenen
  sichtbar, das reale Fixture hat zwei. Belegt sind Datenbank (Pentest B1/B2), Oberfläche
  (Komponenten-Test, rot-grün) und CSV (Route-Test, rot-grün) — nicht die Verkettung im Browser.
- **D-Y45db.5** `path` bleibt für Projektleitung/Admin desynchronisierbar (Zyklus nicht mehr) →
  **PROJ-Y-45j**.

---

## PROJ-45-ε — Fotodokumentation (Requirements, 2026-08-24)

Die **letzte offene Slice** der Bau-Erweiterung und seit dem δ-Deploy der **einzige** Grund, warum
PROJ-45 den Scope `alpha` statt `full` trägt: eine zurückgestellte Original-Story (L4) mit Ziel-ID
schliesst `full` aus, und „Waived criterion" scheitert an seiner ersten Bedingung („nothing was
deferred").

### Was die Messung gegen den deployten Stand ergeben hat

Acht Messungen; **drei widerlegen eine naheliegende Lesart von L4** („Fotos hängen sich später an das
DMS"):

| Messung | Ergebnis | Folge |
|---|---|---|
| DMS-Bestand in Prod | **0** Dokumente, **0** Baumknoten, **0** Storage-Objekte — drei Wochen nach dem PROJ-79-α-Deploy | Der „Anhängen"-Weg aus 45g (Knoten auswählen) setzt einen Baum voraus, den es nicht gibt |
| Erlaubte Bildformate | `image/png` + `image/jpeg` — im **Bucket und im Code**, mit Magic-Byte-Prüfung. **Kein** HEIC/HEIF, kein WebP | iPhones fotografieren standardmässig HEIC → heute abgewiesen |
| Bildverarbeitung im Produktivcode | **keine.** `sharp` ist nur Next.js' eigener Optimierer; der einzige Grep-Treffer war das englische Wort „sharper" in einem Kommentar | Vorschaubilder und HEIC-Umwandlung brauchen ein neues Paket |
| DMS-Download | Signed URL, 120 s, **mit `download: true`** | Rendert im Browser als Datei-Download, **nicht** als `<img>`; `next.config` hat zudem keine `images.remotePatterns` |
| Druck-Rendering | `puppeteer-render` setzt einen Cookie-Kopf (`setExtraHTTPHeaders`) | Eine gleich-origin Inline-Route ist aus dem PDF-Lauf **erreichbar** — L33 ist baubar |
| PROJ-80-α-Pipeline | läuft per `after()` bei **jedem** DMS-Upload, unbedingt; `mime_unsupported_for_rag` steht für **alle neun** erlaubten Formate hart auf `false` | Jedes Foto bekäme einen `failed`-Auszug. Der Kommentar der Datei sagt selbst, das Feld existiere genau für diesen Fall |
| Quintessenz-Gate | startet **nur** bei `extracted` | Kein verschwendeter Modell-Aufruf — aber eine dauerhafte Fehlanzeige |
| Anker-Bestand | `construction_defects` hat **keine** Dokument-Spalten (18 Spalten); `construction_acceptances` trägt das 45g-Tripel mit **0** Zeilen | Beides sind **Einzel**-Verweise; Fotos sind viele → Verknüpfungstabelle, nicht Spalten |

Zwei Vorbilder, beide gemessen: `skill_knowledge_links` (PROJ-77-γ) ist die DMS-Verknüpfung des Hauses
(`document_node_id`, Mandanten-Konsistenz-Trigger), und `construction_acceptances.document_node_id`
(PROJ-Y-45g, gestern) ist das jüngste Bau-Beispiel. Beide verknüpfen **einen** Knoten — für eine
Fotostrecke trägt das nicht.

**Vertraulichkeit:** Bauprojekte haben per α-Entscheid **keine** Vertraulichkeitsachse. Die Fotos landen
im DMS auf `standard`, das PROJ-Y-115c-Gate ist für sie damit wirkungslos — bewusst, und ε führt **keine**
zweite Achse ein. Das ist dieselbe Begründung wie bei Q-γ1.

### Nutzer-Locks (L31–L38)

| # | Lock | Begründung |
|---|---|---|
| **L31** | **DMS als Ablage, Zielordner automatisch.** Das Foto ist ein echter `documents`-Eintrag; ε legt den Ordner selbst an, die Verknüpfung läuft über eine Bau-Tabelle | Erbt Quota, Magic-Byte-Prüfung, Papierkorb und Vertraulichkeits-Gate von PROJ-79 statt sie neu zu bauen. Der Preis (Fotos erscheinen im Dokumentenbaum) ist für eine Bauleitung eher Merkmal als Fehler. **Keine Ordnerwahl beim Erfassen** — der entscheidende Unterschied zum 45g-Muster |
| **L32** | **Drei Anker: Mangel, Abnahme, Bauabschnitt** — genau einer je Foto-Verknüpfung | Der Wortlaut der Erstfassung nennt den Mangel; ein Abnahmeprotokoll ohne Fotos ist der halbe Nachweis (Zustand bei Gefahrenübergang), und Baufortschritt je Abschnitt ist der klassische Bautagebuch-Fall. XOR-Bedingung wie γ sie für seinen Bezug schon führt |
| **L33** | **Fotos erscheinen im Ausdruck** — Mängelanzeige (β) und Abnahmeprotokoll (γ) | Eine Mängelanzeige ohne Bild ist der halbe Nachweis. Kostet eine **Inline-Ausliefer-Route**, weil die Signed URL `download: true` trägt (gemessen) |
| **L34** | **HEIC wird serverseitig nach JPEG umgewandelt** | iPhones fotografieren standardmässig HEIC; abweisen hiesse, jeden Bauleiter erst die Kameraeinstellung ändern zu lassen. **Neue Abhängigkeit → CIA-Pass bei `/architecture` verbindlich** (`.claude/rules/continuous-improvement.md`) |
| **L35** | **Zwei abgeleitete Grössen:** kleine Vorschau für die Galerie, mittlere für den Ausdruck; das Original bleibt unangetastet und herunterladbar | Acht 8-MB-Originale sind >60 MB Galerie-Last und ein unbrauchbar grosses PDF. Mit dem Paket aus L34 ist das fast gratis |
| **L36** | **EXIF: nur die Aufnahmezeit** (`DateTimeOriginal`), alles andere wird verworfen — kein GPS, keine Geräteangaben in der Datenbank | „Wann wurde das aufgenommen" ist der eigentliche Nachweiswert. Standortdaten sind eine eigene datenschutzrechtliche Achse, und Bau trägt keine Vertraulichkeitsstufe — die wird **nicht** nebenbei eröffnet. Das Original behält seine EXIF-Daten wie jede hochgeladene Datei |
| **L37** | **Verschieben und Umbenennen im Dokumentenbaum bleiben erlaubt; das Löschen eines verknüpften Fotos wird mit Nennung abgewiesen** | Die Verknüpfung zeigt auf die Kennung, nicht auf den Pfad (α-Lock L7). Die Löschsperre ist dieselbe Linie wie β/γ beim Entfernen eines Gewerks mit Mängeln: ein Nachweis darf nicht unbemerkt aus einer bereits gedruckten Anzeige verschwinden |
| **L38** | **`mime_unsupported_for_rag` wird für Bilder richtig gesetzt und die PROJ-80-Pipeline darauf gegatet** — kein Extraktionsversuch, kein `failed`, ein eigener ehrlicher Zustand | Behebt einen vorbestehenden Fehler an genau der Stelle, für die das Feld laut eigenem Kommentar gebaut wurde. Bestandsarbeit in einer fremden Slice — deren Tests sind das Tor |

### User Stories

- **ST-45ε.1 (Bauleitung)** Ich fotografiere einen Mangel und hänge das Bild in **einem** Schritt an den
  Mangel — ohne vorher einen Ordner anzulegen oder auszuwählen.
- **ST-45ε.2 (Bauleitung)** Ich sehe alle Fotos eines Mangels als Strecke mit Bildunterschrift und
  Aufnahmedatum und kann die Reihenfolge festlegen, in der sie in der Anzeige erscheinen.
- **ST-45ε.3 (Bauleitung)** Beim Abnahmetermin dokumentiere ich den Zustand und die Vorbehalte mit
  Fotos, die im **Abnahmeprotokoll** mitgedruckt werden.
- **ST-45ε.4 (Bauleitung)** Ich halte den Baufortschritt je Bauabschnitt fotografisch fest.
- **ST-45ε.5 (Projektleitung)** Ich drucke eine Mängelanzeige mit Bildern und übergebe sie dem
  Nachunternehmer als vollständigen Nachweis.
- **ST-45ε.6 (Betrachter)** Ich sehe die Fotos, kann sie herunterladen, aber keine hinzufügen oder
  entfernen.

### Akzeptanzkriterien

#### ST-45ε.1 — Erfassen in einem Schritt
- [ ] **AC-45ε.1** Am Mangel, an der Abnahme und am Bauabschnitt gibt es „Foto hinzufügen"; der Upload
  verlangt **keine** Ordnerwahl. ε legt den Zielordner im Dokumentenbaum selbst an und findet ihn beim
  zweiten Foto **wieder** (idempotent, kein zweiter Ordner gleichen Namens).
- [ ] **AC-45ε.2** Mehrere Dateien in einem Vorgang sind zulässig; jede wird einzeln geprüft, und eine
  abgewiesene Datei bricht die übrigen **nicht** ab — die Antwort benennt je Datei das Ergebnis.
- [ ] **AC-45ε.3** Abgewiesen wird, was PROJ-79 schon abweist: Datei > 50 MB, überschrittene
  Mandanten-Quota (413), Datei, deren Magic Bytes nicht zum erlaubten Satz passen (415). ε **senkt keine**
  dieser Schranken.
- [ ] **AC-45ε.4** Ein **HEIC/HEIF**-Bild wird angenommen und serverseitig nach JPEG umgewandelt; das
  gespeicherte Dokument trägt `image/jpeg`, und die Galerie zeigt es (L34).
- [ ] **AC-45ε.5** Schlägt die Umwandlung fehl, wird die Datei **abgewiesen** mit einer Meldung, die den
  Grund nennt — es entsteht **kein** halb angelegtes Dokument und kein Rückstand im Bucket.

#### ST-45ε.2 — Fotostrecke
- [ ] **AC-45ε.6** Die Fotos eines Ankers erscheinen als Strecke in festgelegter Reihenfolge; die
  Reihenfolge ist änderbar und wird gespeichert.
- [ ] **AC-45ε.7** Je Foto sind **Bildunterschrift** (frei, optional) und **Aufnahmedatum** sichtbar und
  änderbar. Das Aufnahmedatum wird beim Upload aus `DateTimeOriginal` vorbelegt; fehlt es, bleibt das
  Feld leer und ist nachtragbar — es wird **nicht** stillschweigend auf „heute" gesetzt (L36).
- [ ] **AC-45ε.8** Aus den EXIF-Daten wird **ausschliesslich** die Aufnahmezeit übernommen. Weder GPS
  noch Geräteangaben landen in der Datenbank; ein Foto **mit** GPS-EXIF beweist das im Test (L36).
- [ ] **AC-45ε.9** Die Galerie lädt die **Vorschaugrösse**, nicht das Original; das Original ist über
  „Herunterladen" erreichbar (L35).
- [ ] **AC-45ε.10** Ein Foto lässt sich vom Anker **lösen**, ohne die Datei zu löschen — und löschen,
  wobei die Datei in den DMS-Papierkorb wandert. Beide Wege sind unterscheidbar benannt.

#### ST-45ε.3 / ST-45ε.5 — Ausdruck
- [ ] **AC-45ε.11** Die **Mängelanzeige** (β-Druckseite) zeigt die Fotos des Mangels mit Bildunterschrift
  und Aufnahmedatum; ohne Fotos bleibt sie **byte-identisch** zu heute (kein leerer Abschnitt).
- [ ] **AC-45ε.12** Das **Abnahmeprotokoll** (γ-Druckseite) zeigt die Fotos der Abnahme, ebenso ohne
  leeren Abschnitt bei null Fotos.
- [ ] **AC-45ε.13** Der Ausdruck bettet die **Druckgrösse** ein, nicht das Original (L35), und der
  erzeugte PDF-Lauf bleibt innerhalb der bestehenden Zeitgrenze der Schnappschuss-Erzeugung.
- [ ] **AC-45ε.14** Ein Foto, das der Aufrufer nicht sehen darf, erscheint **nicht** im Ausdruck — die
  Druckseite läuft wie die drei bestehenden über die Sitzung des Aufrufers, nicht über den
  Dienst-Schlüssel.

#### ST-45ε.4 — Baufortschritt
- [ ] **AC-45ε.15** Am Bauabschnitt gibt es eine Fotostrecke; auf der α-Abschnittsfläche ist je Abschnitt
  erkennbar, **ob** Fotos vorhanden sind (Zahl), ohne die Bilder zu laden.

#### ST-45ε.6 — Rechte und Sichtbarkeit
- [ ] **AC-45ε.16** *(korrigiert in `/backend` 2026-08-24 — die Erstfassung widersprach AC-45ε.17)*
  **Betrachter** sehen, laden und **fügen hinzu**, können aber nicht ändern, lösen oder löschen. Die
  Erstfassung schloss das Hinzufügen für Betrachter aus und stand damit im Widerspruch zu AC-45ε.17
  („β-Regel"), das jedem Projektmitglied das Erfassen zugesteht. Aufgelöst zugunsten der β-Regel: L15
  lässt Betrachter ausdrücklich Mängel erfassen, und ein Foto ist dieselbe Art Beobachtung — wer den
  Mangel melden darf, darf ihn auch fotografieren. Für Ändern, Lösen und Löschen bietet die Oberfläche
  die Aktionen gar nicht an; der Server weist sie unabhängig davon ab.
- [ ] **AC-45ε.17** Hinzufügen und Ändern folgen der **β-Regel** (jedes Projektmitglied darf erfassen,
  Ändern und Entfernen nur Projektleitung/Bauleitung oder Mandanten-Administration) — **nicht** der
  strengeren γ-Regel. Die Abweichung ist bewusst und wird begründet: ein Foto ist eine Beobachtung wie
  ein Mangel, kein rechtsverbindlicher Vorgang wie eine Abnahme.
- [ ] **AC-45ε.18** Die Fotoflächen erscheinen nur in Bauprojekten mit aktivem Bau-Modul; bei
  abgeschaltetem Modul antwortet der Server gleichbleibend abweisend und die Oberfläche zeigt den
  neutralen „nicht aktiv"-Hinweis (α/β/γ/δ-Muster).
- [ ] **AC-45ε.19** Mandanten- und Projekttrennung gilt unverändert: fremde Fotos sind unsichtbar, auch
  aggregiert und auch in den Zählern je Abschnitt.

#### Löschsperre und PROJ-80-Wechselwirkung
- [ ] **AC-45ε.20** Ein verknüpftes Foto lässt sich im **Dokumentenbaum nicht löschen**; die Meldung
  benennt, woran es hängt (Mangel/Abnahme/Abschnitt samt Bezeichnung) — dieselbe Form wie die
  γ-verallgemeinerte Entfernen-Absage (`references_present`).
- [ ] **AC-45ε.21** **Verschieben und Umbenennen** im Dokumentenbaum lassen die Verknüpfung unberührt;
  die Galerie zeigt das Foto danach unverändert (L37).
- [ ] **AC-45ε.22** Ein Bild löst **keinen** Extraktionsversuch aus: es trägt
  `mime_unsupported_for_rag = true`, die PROJ-80-Pipeline überspringt es, und der Zustand heisst nicht
  `failed`, sondern benennt „Bild — kein Textauszug" (L38).
- [ ] **AC-45ε.23** Die bestehenden PROJ-80-Fälle bleiben **wörtlich** grün: ein PDF/DOCX wird
  unverändert extrahiert und zusammengefasst.

### Blockierende Härtungskriterien

- [ ] **AC-45εH-1** Live-Pentest gegen Prod, 0 Rückstände, mit **synthetisiertem Nicht-Admin** (in Prod
  ist jedes Mandanten-Mitglied Admin — ein Lauf unter Admin wäre falsch-grün).
- [ ] **AC-45εH-2** **Aggregat-Leck-Probe mit Gegenprobe** auf den Fotozähler je Abschnitt: ein Fremder
  sieht 0, während wahr ≠ 0 ist.
- [ ] **AC-45εH-3** `anon` **und PUBLIC** ohne EXECUTE auf **allen** neuen Funktionen, geprüft über den
  ACL-Eintrag, der mit `=` **beginnt** (γ-Lehre B-γ1) — nicht über ein `%=X/%`-Muster.
- [ ] **AC-45εH-4** Kein Schreibweg an den Funktionen vorbei, geprüft **als Mandanten-Admin**.
- [ ] **AC-45εH-5** Register-Eingriffe (Objektarten, Feld-Whitelist, Lese-Tor) als **whitespace-tolerante
  Anker-Ersetzung aus der Live-Definition** mit Treffer-Eindeutigkeit **und** Post-Verifikation, dazu
  namentliche Gegenprüfung der Geschwister-Zweige.
- [ ] **AC-45εH-6** Die **Inline-Ausliefer-Route** gibt Bytes nur an Berechtigte: ein Nicht-Projektmitglied
  bekommt 404, und die Route trägt **kein** Dienst-Schlüssel-Client.
- [ ] **AC-45εH-7** Die Umwandlung läuft **gebunden**: Grössen-, Pixel- und Zeitgrenze, und ein
  präpariertes Bild („Dekompressionsbombe", riesige Pixelmasse bei kleiner Datei) wird abgewiesen statt
  den Speicher der Funktion zu sprengen. Vorbild sind die PROJ-70-γ-Härtungen (Seiten-Deckel,
  ZIP-Bomben-Wächter, 20-s-Grenze).
- [ ] **AC-45εH-8** **Magic-Byte-Prüfung vor** der Umwandlung, nicht danach — eine als `.heic` benannte
  Datei mit fremdem Inhalt erreicht das Bildpaket nicht.
- [ ] **AC-45εH-9** Regressionen **wörtlich** grün, je 0 Rückstände: α, β, γ, δ, PROJ-Y-45a, PROJ-79-DMS,
  PROJ-80-α.1, PROJ-Y-115c.
- [ ] **AC-45εH-10** Visual-Regression **ohne Neuaufnahme** — und wenn eine Aufnahme nötig wird, im Bild
  geprüft und per Dateilöschung gezogen (`--update-snapshots` ist unter der Toleranz ein stiller No-op).
- [ ] **AC-45εH-11** Das **Funktions-Inventar** wird am Ende der Slice aufgefrischt; der Diff wird gelesen
  und benannt (`docs/production/function-inventory.md`).
- [ ] **AC-45εH-12** Rot-Grün ausgeführt für jede neue Zusicherung, Rücksetzung über eine **Dateikopie**,
  nie `git checkout` (PROJ-130-δ2/F-3).

### Edge Cases

- **Foto ohne EXIF** (Screenshot, WhatsApp-Weiterleitung). Aufnahmedatum bleibt leer und nachtragbar —
  **nicht** stillschweigend „heute" (AC-45ε.7).
- **HEIC-Datei, die gar kein HEIC ist.** Magic Bytes entscheiden, nicht die Endung (AC-45εH-8).
- **Dekompressionsbombe.** Kleine Datei, riesige Pixelmasse → abgewiesen, bevor das Bildpaket sie
  entpackt (AC-45εH-7).
- **Quota reisst mitten in einem Mehrfach-Upload.** Die bereits angelegten Fotos bleiben, die übrigen
  werden mit 413 benannt — keine halbe Transaktion (AC-45ε.2).
- **Foto am Mangel, Mangel wird verworfen.** Die Fotos bleiben am Mangel und im Ausdruck sichtbar; ein
  verworfener Mangel ist Historie, kein Löschgrund.
- **Abnahme ist protokolliert und damit eingefroren.** Fotos sind danach **nicht** mehr änderbar — die
  einzige nachträglich erlaubte Änderung an einer protokollierten Abnahme bleibt der Beleg (γ, AC-45γ.9).
  Zu entscheiden bei `/architecture`, ob Fotos wie der Beleg behandelt werden oder mit einfrieren.
- **Abschnitt wird gelöscht, Fotos hängen dran.** Fällt unter die verallgemeinerte Entfernen-Absage aus
  γ; die Meldung nennt jetzt auch die Art „Foto" (AC-45ε.20).
- **Dasselbe Foto an zwei Ankern.** Zulässig — dieselbe Datei, zwei Verknüpfungen; die Löschsperre nennt
  beide.
- **Bau-Modul wird abgeschaltet, Fotos bleiben im DMS.** Die Fotoflächen verschwinden, die Dateien
  bleiben über `/dokumente` erreichbar — der DMS-Reiter ist Kern und **nicht** modul-gegatet (gemessen).
  Das ist gewollt und wird gesagt, nicht verschwiegen.
- **Druck mit 20 Fotos.** Die Zeitgrenze der Schnappschuss-Erzeugung gilt unverändert; zu entscheiden bei
  `/architecture`, ob eine Höchstzahl je Ausdruck nötig ist — und falls ja, wird die Kappung
  **ausgewiesen**, nicht verschwiegen (Lehre aus PROJ-Y-45l).

### Out of Scope (ε)

Mobiles Offline-Bautagebuch (dauerhaft ausserhalb, Erstfassung) · Verortung des Fotos im Bauplan
(dauerhaft ausserhalb) · Annotationen im Bild (Pfeile, Markierungen) · Videos · Foto-Vergleich
„vorher/nachher" als eigene Ansicht · automatische Bilderkennung · GPS-Auswertung (L36) ·
Wasserzeichen · Foto direkt aus der Kamera im Browser aufnehmen (`capture`-Attribut) — das ist eine
eigene, kleine Erweiterung, sobald die Ablage steht.

### Offene Architekturfragen für `/architecture`

1. **Q-ε1 — Welches Bildpaket?** HEIC-Umwandlung (L34) und zwei abgeleitete Grössen (L35) brauchen eine
   neue Abhängigkeit, die in einer Vercel-Funktion läuft (Speicher, Laufzeit, 50-MB-Eingaben). **Der
   CIA-Pass ist hier verbindlich** — `.claude/rules/continuous-improvement.md`, „neue Technologien".
   Mitzubewerten: `sharp` ist als Prod-Abhängigkeit ohnehin vorhanden (Next.js-Optimierer), trägt aber
   HEIC nur mit `libheif`; die 5-GB-Paketgrenze der Vercel-Funktionen ist kein Hindernis.
2. **Q-ε2 — Wo liegt der automatische Ordner und wie wird er wiedergefunden?** Name, Verschachtelung
   (`/Fotos/Mangel 12`?), Verhalten bei umbenanntem Mangel, Kollision mit einem gleichnamigen Ordner, den
   ein Nutzer selbst angelegt hat. Idempotenz ist AC-45ε.1.
3. **Q-ε3 — Form der Inline-Ausliefer-Route.** Bytes streamen gegen Daten-URI in der Druckseite. Zu
   klären: Zwischenspeicherung, Verhalten im Puppeteer-Lauf (Cookie ist gesetzt — gemessen) und ob die
   Route auch die Galerie bedient oder nur den Druck.
4. **Q-ε4 — Wie wird die Löschsperre durchgesetzt?** Der DMS-Löschweg ist ein **weiches** Löschen über
   `dms_soft_delete_subtree` — ein Fremdschlüssel feuert dort **nicht**. Also Wächter im RPC oder
   Erweiterung des RPC selbst; beides berührt eine deployte fremde Funktion.
5. **Q-ε5 — Wie fügt sich „Foto" in die bestehende Entfernen-Absage?** γ hat sie über
   `references_present` verallgemeinert und nennt Art plus Bezeichnung; ε bringt die dritte Art. Zu
   prüfen, ob die Teilbaum-Abfrage der Abschnitte die Fotos mit erfasst (der Enkel-Fall hat β und γ je
   einen Vektor gekostet).
6. **Q-ε6 — Wohin gehören die abgeleiteten Grössen?** Eigene `documents`-Zeilen (dann erscheinen sie im
   Baum und zählen dreifach in die Quota) gegen Storage-Objekte neben dem Dokument (dann braucht die
   Quota-Buchhaltung einen Zweig). Beides hat Folgen für den Papierkorb.
7. **Q-ε7 — Frieren Fotos mit der protokollierten Abnahme ein?** γ friert alles außer dem Beleg ein.
   Fotos sind fachlich näher am Beleg (kommen nach dem Termin zurück) als am Ergebnis.

**Kein CIA-Pass nötig für:** die Ablage-Entscheidung (L31 folgt dem gemessenen Muster von α/γ), die
Anker (L32), den Ausdruck (L33). **CIA-pflichtig ist genau Q-ε1** — und damit vor `/backend` zu klären.

**Reihenfolge:** `/architecture` (mit CIA-Pass zu Q-ε1) → `/backend` → `/frontend` → `/qa`.

---

### Tech Design (Solution Architect) — ε, 2026-08-24

**Alle sieben Architekturfragen beantwortet.** Sechs davon hat die Messung entschieden, eine (Q-ε1) der
Nutzer nach einem CIA-Review, den ich als Halt-und-Frage-Checkpoint geführt habe (Sub-Agenten in dieser
Sitzung aus; `.claude/rules/continuous-improvement.md` sieht das ausdrücklich vor).

#### Was gebaut wird — Bausteine der Oberfläche

```
Mangel-Detailansicht (β)                    Abnahme-Detailansicht (γ)
+-- … Bestand unverändert …                 +-- … Bestand unverändert …
+-- Fotostrecke                             +-- Fotostrecke  (dieselbe Komponente)
    +-- Kachel je Foto                          +-- nach dem Protokollieren:
    |   +-- Vorschaubild                            „Ergänzen möglich, Entfernen nicht"
    |   +-- Bildunterschrift (bearbeitbar)
    |   +-- Aufnahmedatum (bearbeitbar)
    +-- „Foto hinzufügen"  (kein Ordner-Dialog)
    +-- Leerzustand: „Noch keine Fotos"

Bauabschnitte-Fläche (α)                    Druckseiten
+-- Baum, Bestand unverändert               +-- Mängelanzeige (β)  -> Foto-Abschnitt
    +-- je Abschnitt: Fotozahl              +-- Abnahmeprotokoll (γ) -> Foto-Abschnitt
    +-- Abschnitts-Detail: Fotostrecke          (beide: fehlt ein Bild, wird das GESAGT)

Dokumentenbaum (PROJ-79, unverändert)
+-- Ordner „Baufotos"   <- von ε angelegt, nicht vom Nutzer gewählt
    +-- die Bilddateien
```

**Eine** Fotostrecken-Komponente für alle drei Anker — nicht drei. Die Anker unterscheiden sich nur im
Bezug und in der Schreibregel, nicht in der Darstellung; drei Fassungen würden auseinanderlaufen (die
Lehre aus den doppelten Fortschritts-Formeln in δ).

#### Wo die Daten liegen — im Klartext

**Die Bilddatei selbst** ist ein gewöhnliches DMS-Dokument (PROJ-79). Damit erbt ε ohne eine Zeile
eigener Härtung: die Magic-Byte-Prüfung, die 50-MB-Grenze, die Mandanten-Quota, den Papierkorb, das
Vertraulichkeits-Gate und den Feld-Audit.

**Neu ist genau eine Tabelle: die Verknüpfung.** Sie hält je Eintrag:

- den Mandanten und das Projekt (für die Konsistenzprüfung, wie bei allen Bau-Tabellen),
- **genau einen** Bezug — Mangel **oder** Abnahme **oder** Bauabschnitt (die Bedingung „genau einer"
  wird erzwungen, dasselbe Muster, das γ für den Abnahme-Bezug schon führt),
- den Verweis auf das Dokument,
- Bildunterschrift (frei, optional), Aufnahmedatum (optional), Reihenfolge.

**Nicht** in der Tabelle: Standortdaten, Geräteangaben, Bildmaße, Prüfsummen. Aus den EXIF-Daten wird
ausschliesslich die Aufnahmezeit übernommen (L36); alles andere bleibt in der Originaldatei und
erreicht die Datenbank nicht.

**Die abgeleiteten Größen** (Galerie-Vorschau, Druckgröße) liegen als Geschwister-Dateien neben dem
Original im selben Ablagefach — **nicht** als eigene DMS-Dokumente. Grund ist gemessen: die
Quota-Buchhaltung addiert je Dokumentzeile beim Anlegen, ein Foto würde also **dreifach** zählen und
**dreifach** im Dokumentenbaum erscheinen. Sie zählen nach Nutzer-Entscheid **nicht** in die Quota,
weil sie jederzeit neu erzeugbar und um einen festen Faktor begrenzt sind — und weil die Quota ohnehin
„Summe des je Hochgeladenen" misst und beim Löschen nie sinkt (ebenfalls gemessen). Diese Begründung
gehört sichtbar in die Oberfläche, nicht nur in dieses Dokument.

#### Die sieben Entscheidungen

| Frage | Entscheidung | Warum — gemessen, nicht angenommen |
|---|---|---|
| **Q-ε1** Bildpaket | **Erst messen, dann entscheiden.** `/backend` prüft als **ersten** Schritt mit einer echten HEIC-Datei, ob das vorhandene `sharp` sie liest. Gelingt es, ist L34 ohne neues Paket erfüllt. Gelingt es nicht, wird HEIC mit erklärender Meldung abgewiesen und die Umwandlung wird ein eigener Followup **mit Lizenzklärung** | Der Vorschau-Teil braucht ohnehin kein neues Paket (`sharp@0.35.3` ist Prod-Abhängigkeit). Für HEIC ist die Lage per Inspektion **nicht** entscheidbar: `sharp.format.heif` nennt als Endung nur `.avif`, die Zeichenketten-Gegenprobe im gelinkten libvips ist zweideutig (HEVC-Treffer stammen aus dem Container-Parser). Der Blocker ist ausserdem nicht Können, sondern **Lizenz**: der Prod-Baum hat **1166 Pakete und keine einzige GPL-only**, die HEIC-Dekoder bündeln libde265 (dual GPL/kommerziell). Eine Lizenzentscheidung unter Zeitdruck wäre die schlechteste Form dieser Entscheidung |
| **Q-ε2** Automatischer Ordner | **Ein** Ordner je Projekt („Baufotos"), **kein** Unterordner je Mangel. Wiedergefunden über eine feste Kennung, nicht über den Anzeigenamen | Der Dokumentenbaum hat gemessen zwei Eindeutigkeits-Indizes — je Projekt für Wurzelordner, je Elternordner für Kinder. Ein Wurzelordner mit fester Kennung ist damit **per Konstruktion** eindeutig: das Anlegen ist von sich aus wiederholbar, es braucht **keine** Sperre und hat **kein** Wettlauf-Fenster. Ein Ordner je Mangel hätte bei 200 Mängeln 200 Ordner erzeugt, und die Zuordnung steht ohnehin in der Verknüpfung — der Ordner ist ein Ort, kein Ordnungsprinzip |
| **Q-ε3** Auslieferung fürs Bild | **Eine** Route liefert die Bytes, für Galerie **und** Druck — dieselbe Quelle, sitzungsgebunden. Keine Signed URL, kein `next/image`, keine Daten-URI | Die DMS-Signed-URL trägt gemessen `download: true` und rendert deshalb als Datei-Download, nicht als Bild; Remote-Bildhosts sind nicht konfiguriert. **Und der Druck-Renderer wartet schon heute auf Bilder** (er sammelt alle `<img>` und die Schriften) — dieser Teil muss also gar nicht gebaut werden. Zwei Routen (eine für die Galerie, eine für den Druck) wären zwei Wahrheiten über dieselbe Berechtigung |
| **Q-ε4** Löschsperre | **Wächter am Dokument**, der das Setzen des Papierkorb-Merkers verweigert, solange eine Bau-Verknüpfung besteht — **nicht** eine Änderung der deployten Lösch-Funktion | Das DMS löscht **weich**; ein Fremdschlüssel feuert dabei gar nicht (gemessen an der Funktion). Der Wächter ist rein **additiv**, fasst keine fremde deployte Funktion an und greift auf **jedem** Weg — auch bei einer direkten Änderung durch einen Administrations-Client, die eine Prüfung nur in der Funktion verfehlt hätte. Wichtig und geprüft: er erzeugt **keinen** neuen Hart-Lösch-Blocker, weil der Projekt-Abriss über echtes Löschen kaskadiert und den Wächter nicht auslöst — genau die Klasse Fehler, die PROJ-148 behoben hat |
| **Q-ε5** Entfernen-Absage | Die **Abschnitts**-Auskunft bekommt eine dritte Art „Foto"; die **Gewerk**-Auskunft bleibt unberührt. Die Teilbaum-Abfrage bleibt | Gemessen: genau zwei Routen rufen diese Auskünfte und bilden auf den Code `references_present` ab. Fotos hängen nie an einem Gewerk, also wäre eine Erweiterung dort toter Zweig. Die Teilbaum-Abfrage bleibt, weil ein Foto am **Enkel** die Wurzel blockiert — dieser Fall hat β und γ je einen Vektor gekostet |
| **Q-ε6** Abgeleitete Größen | Geschwister-Dateien neben dem Original, **keine** eigenen Dokumentzeilen, **nicht** in der Quota | Siehe Datenmodell: die Quota-Buchhaltung addiert je Dokumentzeile, drei Zeilen hiessen dreifache Zählung und dreifache Anzeige im Baum |
| **Q-ε7** Protokollierte Abnahme | **Ergänzen ja, Entfernen nein** | Gemessen: der Einfrier-Wächter der Abnahme vergleicht die **Spalten der Abnahmezeile** und nimmt dabei nur den Beleg aus — eine Verknüpfungstabelle sieht er **gar nicht**. Ohne ausdrückliche Regel wären Fotos nach dem Protokollieren also frei löschbar. Fotos kommen wie der Beleg erst nach dem Termin vom Telefon, dürfen aber aus einem bereits gedruckten Protokoll nicht verschwinden — Nachweise nachreichen ja, verschwinden lassen nein |

#### Was wiederverwendet wird und was neu ist

**Wiederverwendet** (Bausteine, nicht Routen): die Magic-Byte-Prüfung, die Ablage- und Signier-Helfer,
die Quota-Vorprüfung und die Kennungs-Bildung des DMS; die Rechteprüfung des Hauses; die
Entfernen-Absage aus γ; der Druck-Renderer samt seiner bereits vorhandenen Bild-Warteschleife; `sharp`
für die abgeleiteten Größen.

**Neu:** eine Verknüpfungstabelle, ein Wächter für die Löschsperre, eine Erweiterung der
Abschnitts-Auskunft, eine eigene Upload-Route (die die DMS-Bausteine zusammensetzt und die
Foto-Schritte ergänzt — **nicht** die DMS-Route erweitert, weil ein Foto in **einem** Vorgang
umgewandelt, verkleinert, gespeichert **und** verknüpft werden muss), eine Auslieferungs-Route für die
Bytes, eine Fotostrecken-Komponente, zwei Druckabschnitte.

**Bestandsarbeit in einer fremden Slice:** der Kennsatz „für die Auswertung nicht parsebar" wird für
Bilder richtig gesetzt und die Auswertungs-Pipeline darauf gegatet (L38). Tor sind die Tests jener
Slice; ein Textdokument muss danach **wörtlich** unverändert ausgewertet und zusammengefasst werden.

#### Zusätzliche Härtungskriterien aus dem Design

- [ ] **AC-45εH-13** Die HEIC-Fähigkeit wird als **erster** `/backend`-Schritt mit einer echten Datei
  gemessen, und das Ergebnis wird festgehalten — nicht aus der Paketbeschreibung geschlossen.
- [ ] **AC-45εH-14** Ein Bild, das im Druck **nicht** geladen werden konnte, wird im PDF als fehlend
  **benannt**. Der Renderer wartet gemessen höchstens **drei Sekunden** und läuft dann still weiter;
  ohne dieses Kriterium fielen Fotos lautlos aus dem Nachweis — genau die Klasse, die 45l beseitigt hat.
- [ ] **AC-45εH-15** Der Lösch-Wächter erzeugt **keinen** neuen Hart-Lösch-Blocker: ein
  Projekt-Abriss mit verknüpften Fotos gelingt weiterhin (belegt, nicht behauptet — die PROJ-148-Lehre).
- [ ] **AC-45εH-16** Der automatische Ordner wird beim zweiten Foto **wiedergefunden**, auch bei zwei
  gleichzeitigen Uploads, und ein vom Nutzer in den Papierkorb gelegter Ordner führt **nicht** zu
  unerreichbaren Fotos, ohne dass die Fläche das sagt.
- [ ] **AC-45εH-17** Die abgeleiteten Größen erscheinen **nicht** im Dokumentenbaum und **nicht** in der
  Quota-Anzeige; die Oberfläche erklärt, was die Quota zählt.

#### Risiken für `/qa`

1. **Der Druck ist der schwierigste Nachweis.** Drei-Sekunden-Grenze, stiller Fehlerpfad, echte
   Bilddaten — hier gehört ein **echter** Druck nach PDF mit sichtbaren Fotos hin, nicht ein Test, der
   die Bilder wegmockt.
2. **Der Lösch-Wächter sitzt auf einer geteilten Tabelle.** Ein zu breiter Wächter bricht das Löschen
   gewöhnlicher Dokumente. Beide Richtungen prüfen: verknüpftes Foto gesperrt, unverknüpftes Dokument
   weiterhin löschbar.
3. **Die Bestandsarbeit an der fremden Auswertungs-Pipeline.** Deren Tests sind das Tor; ein Textdokument
   muss danach wörtlich unverändert durchlaufen.
4. **Rechte weichen je Anker ab** — Ergänzen an einer protokollierten Abnahme ist erlaubt, Entfernen
   nicht, sonst gilt die β-Regel. Drei Anker × drei Rollen ist die Matrix, die auszufahren ist.
5. **Die Aufnahmezeit ist doppelt bestimmt** (aus der Datei vorbelegt, danach von Hand änderbar). Wie
   bei der Gewährleistungsfrist in γ ist die Frage nicht „stimmt der Wert", sondern „stimmen beide Wege
   überein" — und ein Foto ohne EXIF darf **kein** Datum erfinden.
6. **Umwandlung und Verkleinerung laufen in einer Funktion mit Speichergrenze.** Ein präpariertes Bild
   (kleine Datei, riesige Pixelmasse) muss abgewiesen werden, bevor es entpackt wird.

#### Abhängigkeiten

**Keine neue** — der Vorschau- und Verkleinerungsteil nutzt `sharp`, das als Produktions-Abhängigkeit
bereits vorhanden ist. Ob HEIC ein zusätzliches Paket braucht, entscheidet die Messung in `/backend`
(Q-ε1); fällt sie negativ aus, wird **kein** Paket aufgenommen und die Umwandlung wird ein Followup mit
vorgeschalteter Lizenzklärung.

**Reihenfolge:** `/backend` → `/frontend` → `/qa`. Ein weiterer CIA-Pass ist nur nötig, wenn die
Messung in `/backend` negativ ausfällt **und** entschieden wird, ein Paket aufzunehmen.

### `/backend` — Datenschicht live 2026-08-24 (Anwendungsschicht offen)

**Was steht.** Migration `20260824140000_proj45_epsilon_construction_photos` in Prod:
`construction_photos` als **Verknüpfung** (die Bilddatei bleibt ein gewöhnliches DMS-Dokument, wodurch ε
Magic-Byte-Prüfung, 50-MB-Grenze, Quota, Papierkorb, Vertraulichkeits-Gate und Feld-Audit erbt),
**0 Schreib-Policies** (Schreiben nur über Funktionen, β/γ-Rezept), XOR-Bedingung für genau einen Bezug,
5 Trigger, 8 Funktionen, Objektarten **95 → 96**. Dazu **L38** (der gemessene Bestandsdefekt) und der
**Q-ε1-Zweig** für HEIC.

**Q-ε1 ist entschieden — durch Messung an einer echten Datei, wie der Lock es verlangt (AC-45εH-13).**
Zwei echte HEIC-Dateien (eine iPhone-Kameraaufnahme, eine Mehrbild-Datei) gegen das installierte `sharp`
gefahren. Der Verlauf ist lehrreich, weil ich **zweimal** fast das Falsche berichtet hätte:

1. Erster Versuch: `Security limit exceeded: Number of references in iref box (48) exceeds … 16`. Also
   **kein** Codec-Fehler, sondern eine Sicherheitsgrenze. Ursache am Container belegt statt vermutet:
   `grid`-Box + **49** `hvc1`-Items + 52 `infe`-Einträge — iPhone speichert ein Foto als **Kachelraster**
   aus HEVC-Kacheln, deren `iref/dimg`-Verweise die libheif-Standardgrenze von 16 zwangsläufig reissen.
2. Mit `{ unlimited: true }` **gelingt** das Lesen: `heif 3024x4032`. An dieser Stelle sah es aus, als
   könne sharp HEIC.
3. Die Umwandlung scheitert dann aber mit **`heif: Decoder plugin generated an error`** — der Container
   wird gelesen, die Pixel nicht. Das deckt sich mit sharps **eigener** Typdefinition: „Support for
   patent-encumbered HEIC images requires the use of a globally-installed libvips compiled with support
   for libheif, libde265 and x265."

**Ergebnis: negativ, HEIC wird abgewiesen — aber mit erklärender Meldung** (eigener Fehlercode
`heif_not_supported`, Text nennt den einmaligen iPhone-Handgriff). Die Datei wird vom Sniffer korrekt als
`image/heic` erkannt (gemessen), der Zweig sitzt also **vor** der generischen „nicht erlaubtes
Format"-Absage. Die Umwandlung bleibt ein Followup **mit vorgeschalteter Lizenzklärung**
(→ **PROJ-Y-45o**), weil der Prod-Baum **1166 Pakete und keine einzige GPL-only** trägt.

**Nebenbefund zu L35, festgehalten:** `{ unlimited: true }` schaltet die Speicher-Schutzgrenzen ab. Ein
künftiger HEIC-Weg müsste die Pixelgrenze also **selbst** wieder ziehen (AC-45εH-7 wird dadurch
strenger, nicht laxer).

**L38 — der gemessene Bestandsdefekt ist behoben.** `mime_unsupported_for_rag` stand für **alle neun**
erlaubten Formate hart auf `false`, obwohl `image/png` und `image/jpeg` seit α in der Allowlist stehen
und keinen Textauszug hergeben; der Kopfkommentar der Datei nannte selbst genau diesen Fall als Zweck
des Feldes. **Der Statuswert `unsupported_type` war im CHECK von `document_extractions` von Anfang an
vorhanden** — PROJ-80-α hatte den Fall bedacht, nur Flag und Tor fehlten, deshalb **keine** zweite
Migration. Jetzt: Flag für Bilder gesetzt, `runDocumentExtraction` gatet darauf, `privacy_class` bleibt
bewusst 3 (fail-closed: ohne gelesenen Text ist keine Klassifikation belegt). Der irreführende
Kopfkommentar ist **korrigiert**, nicht stehengelassen. Alle **83** Bestandstests von PROJ-79/PROJ-80
bleiben grün; **rot-grün belegt**: ohne die Änderung fallen genau die drei neuen Zusicherungen, die drei
Kontrollfälle bleiben grün.

**L36 — Aufnahmezeit dep-frei.** Eigener Leser für **ein** Feld (`DateTimeOriginal`), weil ein
EXIF-Paket den ganzen Metadaten-Baum mitbrächte, GPS und Geräteangaben eingeschlossen — also genau das,
was L36 heraushalten soll. Ein Leser, der nur ein Feld kennt, kann auch nur ein Feld ausleiten; die
Signatur (`string | null`) ist der tragende Nachweis, und ein Test fährt ein Bild **mit**
GPS-EXIF gegen sie. Rückgabe ist ein **Tagesdatum**: der EXIF-Wert trägt keine Zeitzone, und daraus eine
Zeitmarke zu bauen hiesse, eine Zone zu erfinden. Ein Bild ohne EXIF bekommt **kein** erfundenes Datum.
**Eine eigene Annahme dabei widerlegt:** ich hatte den `exif`-Block von sharp für den blanken TIFF-Kopf
gehalten — er enthält das `Exif\0\0`-Präfix, der Kopf beginnt bei Byte 6. Die erste Fassung las „Ex" als
Bytefolge-Marke und gab **still `null`** zurück; gefunden, weil die Tests am echten sharp-Bild liefen und
nicht an einem Mock (PROJ-142-Lehre). Code **und** falscher Kommentar korrigiert.

**Ein Widerspruch in den eigenen Kriterien, in `/backend` gefunden und aufgelöst:** AC-45ε.16 schloss das
Hinzufügen für Betrachter aus, AC-45ε.17 gestand es per β-Regel jedem Projektmitglied zu. Aufgelöst
zugunsten der β-Regel (L15 lässt Betrachter ausdrücklich Mängel erfassen; ein Foto ist dieselbe Art
Beobachtung) — AC-45ε.16 ist korrigiert, nicht still übergangen.

**Live-Pentest `tests/sql/PROJ-45-epsilon-construction-photos-pentest.sql` gegen Prod, 0 Rückstände über
zehn Zähler.** Block 1 **12/13**, Block 2 **6/6**. Tragend: **A** Betrachter darf verknüpfen, **B/C**
derselbe Betrachter darf nicht ändern und nicht entfernen (die Gegenrichtung, belegt statt behauptet),
**F** die Löschsperre greift **und** benennt den Bezug, **G** derselbe Weg über die deployte
DMS-Funktion ist ebenfalls gesperrt — der Punkt von Q-ε4, weil das DMS **weich** löscht und ein
Fremdschlüssel dabei gar nicht feuert, **K** Projekt-Hart-Löschen gelingt trotz Fotos (**kein** neuer
Blocker der PROJ-148-Klasse). **Das eine FAIL ist kein Produktfehler:** der Zielmandant trägt seit
PROJ-Y-143o `audit_lifecycle_exempt`, der Lebenszyklus-Pfad schreibt dort bewusst nichts — der Vektor
war blind dafür. Statt ihn abzuschwächen hebt Block 2 die Ausnahme **innerhalb der zurückgerollten
Transaktion** auf und beweist den Pfad positiv (**L3/L4**: `__created` und `__deleted` werden
geschrieben) — das ist der Vektor, der zählt, weil er belegt, dass der gemeinsame Audit-Auflöser mit der
neuen Tabelle umgehen kann (PROJ-Y-130g-Falle).

**Der Anker-Wächter hat zugeschlagen und die Migration atomar zurückgerollt:** `'document_node_id']`
kommt **zweimal** in `_tracked_audit_columns` vor — auch `skill_knowledge_links` (PROJ-77-γ) trägt einen
Dokumentknoten. Anker um die drei vorangehenden Abnahme-Spalten erweitert, alle drei Anker **vorab**
als eindeutig gemessen, danach angewendet. Ohne den Wächter wäre der Zweig an der falschen Stelle
gelandet. Zwei weitere eigene Fehler fing die Post-Condition bzw. der erste Lauf: die erwartete
Trigger-Zahl war 4 statt 5, und `documents.checksum` ist NOT NULL.

**Gates:** ESLint **0** · tsc **13 = Baseline / 0 neu** · vitest **3612/3612** (12 neu) ·
migration-naming 0 · Advisors nach dem Anwenden noch zu erheben (`/qa`).

### `/backend` — Anwendungsschicht live 2026-08-25

Die Datenschicht war lauffähig geprüft, aber über HTTP unerreichbar. Geliefert sind jetzt **vier
Routendateien** (Sammlung mit Upload und Liste · Einzelfoto mit Ändern und Entfernen · Inline-Bytes ·
Zähler), die abgeleiteten Größen, der automatische Ordner, der EXIF-Leser als Aufrufer, Typen,
Client-Wrapper und **41 Routentests**. Keine Migration, kein neues Paket.

**Die Zählung weicht vom Entwurf ab, und das ist kein Rundungsfehler:** dort standen „fünf Routen", hier
sind es vier Dateien — Upload und Liste teilen naturgemäß eine Adresse (`POST`/`GET` auf derselben
Sammlung), und der Zähler ist im Entwurf gar nicht als eigene Route geführt. Fünf **Endpunkte** in vier
Dateien, plus der Zähler als fünfte Fläche.

#### Der geteilte Aufnahmekern — eine Autorität statt einer zweiten Kopie

Die Fotoaufnahme braucht dieselbe Reihenfolge wie PROJ-79 (Knoten → Objekt → Dokumentzeile, mit
Rücknahme bei jedem Fehlschlag danach) und dieselbe Quota-Regel. Diesen Block zu **kopieren** wäre genau
die zweite Wahrheit, die diese Slice an anderen Stellen beseitigt: das Aufräumen verwaister Knoten stünde
dann zweimal im Repo und könnte auseinanderlaufen. Er ist deshalb nach `src/lib/dms/ingest.ts`
**herausgelöst**; `POST /api/projects/[id]/documents` ist jetzt ein dünner Aufrufer (PROJ-144-Präzedenz,
wo `create-work-item` aus der Route gezogen wurde).

**Dabei ist ein blinder Bestandstest aufgefallen** — und er ist genau der Grund, warum die Extraktion
nachweisbar ist statt bloß plausibel. Der Fall „rolls back the node when the documents insert fails"
prüfte **nur**, dass das gespeicherte Objekt entfernt wird, nicht dass der verwaiste Knoten gelöscht wird;
gegengeprüft, indem das Knotenaufräumen entfernt wurde: **der Test blieb grün**. Dieselbe Klasse wie
β/F-1 (ein Vektor trug die Marke von AC-45β.12, ohne sie zu belegen) und wie δ2/F-1 in PROJ-130. Die
Mock-Vorrichtung schreibt jetzt die Tabellenzugriffe mit, die Zusicherung prüft **beide** Hälften, und
Rot-Grün ist belegt (ohne das Knotenaufräumen fällt genau dieser eine Fall). Die acht Bestandsfälle sind
danach wörtlich grün — der Beweis, dass die Herauslösung verhaltensgleich ist.

#### Vier Messungen, die den Entwurf bestätigt oder korrigiert haben

**Der Ablageweg der abgeleiteten Größen ist autorisiert — live gemessen, nicht aus dem Muster
geschlossen.** Sie liegen als Geschwister unter `…/{knoten}/_derived/`. Ob die Bucket-Regel dort noch
greift, entscheidet `_dms_object_access`: sie liest die Segmente **1–3** (Mandant/Projekt/Knoten) und
ignoriert tiefere. Probe in einer zurückgerollten Transaktion, **6/6**: **A** Original erlaubt · **B** der
`_derived`-Weg ebenfalls (der tragende Vektor) · **C** auch beliebig tiefer · **D** fremdes
Projekt-Segment abgelehnt **trotz** gültigem Knoten · **E** Nicht-Mitglied bekommt auch die abgeleitete
Größe nicht, mit **E2** als Gegenprobe, dass der Nutzer wirklich kein Mitglied ist (sonst wäre D/E
falsch-grün). Wäre B negativ ausgefallen, hätte der Entwurf einen unerreichbaren Ablageweg vorgesehen.

**AC-45εH-17 ist per Konstruktion erfüllt, nicht per Zusage.** Die Quota-Buchhaltung hängt an
`_dms_bump_storage_usage`, einem AFTER-INSERT-Trigger auf `documents` — gemessen. Objekte ohne
Dokumentzeile werden also weder gezählt noch im Baum angezeigt; die abgeleiteten Größen sind genau das.

**Die zweite Hälfte von AC-45εH-16 löst der Lösch-Wächter, nicht die Ordner-Neuanlage.** Erwartet war der
Fall „Nutzer legt den Ordner in den Papierkorb, Fotos werden unerreichbar". Gemessen:
`dms_soft_delete_subtree` setzt `documents.deleted_at` für den **ganzen** Teilbaum und löst damit
`documents_construction_photo_lock` aus — das Papierkorbieren des Ordners **scheitert**, solange darin ein
verknüpftes Foto liegt. Der befürchtete Zustand ist also unerreichbar. Ehrliche Nebenwirkung: die Meldung
nennt dann das **Foto**, nicht den Ordner; sachlich richtig, für `/qa` festgehalten.

**Die Ordner-Eindeutigkeit kommt aus dem Index, nicht aus einer Sperre.**
`document_tree_nodes_root_slug_uk` ist unique über `(project_id, slug)` für `parent_id is null and
deleted_at is null` — live gelesen. Zwei gleichzeitige Uploads können keine zwei Ordner anlegen; der
Verlierer bekommt `23505` und liest den Gewinner. Kein Advisory-Lock, und ein Test fährt genau diesen
Wettlauf.

#### Entscheidungen, die die Routen selbst treffen mussten

**Die Quota wird je Datei fortgeschrieben, nicht je Vorgang.** Der naive Weg liest den Stand einmal und
prüft jede Datei dagegen — acht Dateien à 6 MB kämen bei 10 MB Restplatz **alle** durch. Ein Test fährt
den Grenzfall (zwei Dateien, die einzeln passen und gemeinsam nicht).

**Die Bytes gehen durch die Route, nicht über eine Signed URL.** `createDocumentSignedUrl` setzt
`download: true`; der Browser speichert die Datei dann statt sie zu zeichnen — für `<img>` und damit für
Galerie **und** Ausdruck unbrauchbar. Gelesen wird mit dem **Sitzungs-Client**, die Berechtigung
entscheidet also die Bucket-Regel, nicht diese Route.

**Der Ablageweg verlässt die API nicht.** Die Liste flacht den Dokument-Join ein und lässt
`storage_path` weg: ihn mitzuliefern wäre eine Einladung, an der Ausliefer-Route vorbei zu signieren.

**Erfassen gatet auf `view`, nicht auf `edit`** — die β-Regel (AC-45ε.16/.17): wer einen Mangel melden
darf, darf ihn auch fotografieren. Ändern und Entfernen sind strenger und leben **in den Funktionen**, die
Route gatet einheitlich `view` (D-β9-Muster, damit das Recht eine prüfbare Stelle bleibt).

**Scheitert die Verknüpfung, wird das Dokument zurückgenommen.** Sonst bliebe im Baum eine Datei stehen,
die niemand angefordert hat.

#### Rot-Grün über acht Zusicherungsklassen

Jede Umkehrung landet auf **genau einem** Fall — kein Test läuft leer, keiner ist zu breit. Zurückgesetzt
über Dateikopien, nie über `git checkout` (PROJ-130-δ2/F-3-Lehre): Erfassen auf `edit` verschärft · erste
Absage bricht die Serie ab · Quota nicht fortgeschrieben · Bildprüfung entfernt · Ablageweg durchgereicht ·
`DELETE` löscht die Datei ohne Parameter · fremdes Projekt in der Adresse erlaubt · Galerie zieht das
Original. Danach wieder **37/37**.

#### Gates

| Prüfung | Ergebnis |
|---|---|
| ESLint (repo-weit) | **0**, Exit 0 |
| `tsc --noEmit` | **13 = Baseline / 0 neu** |
| `npx vitest run` | **3653/3653** (434 Dateien) |
| `npm run build` | clean; **alle vier** Fotoflächen im Routen-Manifest |
| `check:migration-naming` | 0 Fehler |
| `check:index-scope` | 0 Fehler |
| Prod-Rückstände | **0** (0 Fotos, 0 Dokumente, 0 Fotoordner, 0 Sondenprojekte) |

#### Was offen bleibt — benannt, nicht gerundet

- **AC-45ε.4 und AC-45ε.5 sind unerfüllt** (HEIC/HEIF wird nach JPEG umgewandelt). Das ist die Folge des
  Nutzer-Entscheids zu Q-ε1: die Messung an einer echten Datei fiel negativ aus, HEIC wird deshalb mit
  **erklärender** Meldung abgewiesen (der Text nennt JPEG als Ausweg), und die Umwandlung braucht eine
  **Lizenzklärung** vor einem Paket. Registriert als **PROJ-Y-45o**. AC-45ε.5 („schlägt die Umwandlung
  fehl, wird abgewiesen ohne halbes Dokument") ist damit gegenstandslos, solange es keine Umwandlung gibt —
  die Abweisung selbst ist gebaut und getestet.
- **Die Oberfläche fehlt** (`/frontend`): Fotostrecken an Mangel, Abnahme und Bauabschnitt, Zähler auf der
  α-Abschnittsfläche, Bilder in den beiden Druckseiten (L33, AC-45ε.11–.14) samt der
  Drei-Sekunden-Absicherung aus AC-45εH-14.
- **Kein authentifizierter Browser-Durchlauf** in diesem Schritt. Die Flächen sind modul- und
  projekttyp-gegatet, und der Bau-Mandant trägt **0 Dokumente** — der Nachweis gehört in `/qa` mit der
  Bau-Fixture-Lane aus β.
- Advisors sind nach der Datenschicht erhoben; für die reinen Routen entsteht keine neue DB-Fläche.


### `/frontend` — Fotoflächen live 2026-08-25

Geliefert: **eine** Fotostrecke für alle drei Anker (Mangel · Abnahme ·
Bauabschnitt), ein Client-Eiland für die beiden Druckseiten, Fotozähler auf der
α-Abschnittsfläche, zwei Hooks und die reine Strecken-Lib. **Keine Migration,
kein neues Paket, keine neue Route.** 29 neue Tests plus ein Auth-Gate-Spec.

#### Ein Befund, der ein Härtungskriterium umdeutet

**AC-45εH-14 verlangt, dass „der Renderer gemessen höchstens drei Sekunden
wartet und dann still weiterläuft" — auf diese zwei Druckseiten trifft das
nicht zu.** `renderSnapshotPdf` baut seine Adresse **fest verdrahtet** als
`/reports/snapshots/{id}/print` (`puppeteer-render.ts:105`); die Mängelanzeige
und das Abnahmeprotokoll werden von **niemandem** durch Puppeteer geschickt,
sondern per Verweis im Browser geöffnet und dort gedruckt — genau so, wie β und
γ ihren „echten Druck nach PDF" in `/qa` geführt haben. Die
Drei-Sekunden-Grenze (`ASSET_READY_TIMEOUT_MS`) gehört zum Schnappschuss-Lauf
und ist hier gegenstandslos; das Warten auf Bilder übernimmt der Browser des
Nutzers.

Damit bleibt die **tragende** Hälfte des Kriteriums, und die ist gebaut: ein
Bild, das nicht geladen werden konnte, wird **benannt** (Dateiname statt leerer
Kasten), und die Bildunterschrift bleibt stehen — der Nachweis sagt also, *was*
fehlt. Ein lautlos ausfallendes Foto wäre genau die Klasse, die PROJ-Y-45l
beseitigt hat. Sieben Fälle pinnen das, darunter „ein Fehlschlag betrifft nur
sein eigenes Bild".

**Nicht** stillschweigend übergangen: hätte ich das Kriterium wörtlich als
erfüllt gebucht, wäre die Zusage an einen Renderer gebunden, der diese Seiten
nie besucht.

#### Entscheidungen, die die Oberfläche treffen musste

**Der Anker wird per `key` gewechselt, nicht im Effect zurückgesetzt.** Ein
`setState` im Effect-Rumpf ist im Haus verboten (`react-hooks/set-state-in-effect`
schlug beim ersten Entwurf zu); die Antwort ist dieselbe wie in γ beim
Protokoll-Formular und in PROJ-70-β: der Aufrufer montiert die Strecke neu.

**Die Einfrier-Achse stammt aus dem deployten Wächter, nicht aus einer Annahme.**
`construction_photo_removal_guard` wurde live gelesen: er weist bei genau
`abgenommen`, `abgenommen_unter_vorbehalt` und `verweigert` mit `42501` ab. Das
neue Prädikat `isAcceptanceRecorded` leitet sich aus der schon vorhandenen
Konstante `CONSTRUCTION_ACCEPTANCE_RESULTS` ab statt aus einer zweiten
Werteliste — eine Kopie liefe beim nächsten Ergebnis-Wert auseinander. Und weil
der Wächter **allein am Löschen** hängt, bleiben Bildunterschrift, Datum und
Reihenfolge änderbar: das ist die Ergänzung, die Q-ε7 ausdrücklich zulässt.

**Umsortieren sind zwei Schreibvorgänge, nicht N.** Die ganze Strecke
durchzunummerieren wäre bei einem Fehlschlag in der Mitte halb umsortiert.
Sonderfall gepinnt: bei **gleichen** Ordnungswerten (Löschen hinterlässt Lücken)
wird gezielt verschoben, sonst wäre der Tausch wirkungslos.

**Leeren geht über den ausdrücklichen Schalter, nicht über ein weggelassenes
Feld** — „weglassen" heisst serverseitig UNVERÄNDERT (der in PROJ-122 live
aufgetretene Defekt, den β und γ schon so behandeln). Gesendet wird ausserdem nur
das wirklich Geänderte.

**Kein Abzeichen, wenn die Zahl unbekannt ist.** Der Zähler kommt aus **einer**
Abfrage für die ganze Abschnittsliste (AC-45ε.15 verlangt „ohne die Bilder zu
laden"); solange sie fehlt, erscheint gar kein Abzeichen statt einer erfundenen
Null — „keine Fotos" und „noch nicht geladen" dürfen nicht gleich aussehen
(PROJ-64 AC-9).

**Die Galerie lädt die Vorschau, der Ausdruck die Druckgrösse, das Original hängt
am Herunterladen-Knopf** (AC-45ε.9/.13). Beide Adressen sind im Test festgenagelt,
weil der Unterschied nur dort ablesbar ist und die falsche Wahl zweistellige
Megabyte je Ansicht kostet.

**Die Fläche erklärt, was die Quota zählt** (AC-45εH-17): nur die Originaldatei.
Ohne diesen Satz wäre die Anzeige richtig und unverständlich.

#### Die Rechteweiche ist als PAAR bewiesen

Der Test belegt nicht nur, dass dem Betrachter Ändern und Entfernen fehlen,
sondern im **selben** Zustand, dass ihm „Foto hinzufügen" angeboten wird. Nur die
eine Hälfte belegte „Knopf fehlt", nicht „hier bewusst anders als bei der
Abnahme" — genau die Lücke, die der γ-QA-Lauf an seinem eigenen Test gefunden
hat. Herunterladen bleibt dem Betrachter ebenfalls (AC-45ε.16).

#### Rot-Grün über sechs Zusicherungsklassen

Jede Umkehrung landet, und die Trefferzahlen sind aussagekräftig: Hinzufügen an
`canManage` binden trifft **2** Fälle (beide Hälften des Paars), die Einfrier-Achse
aushebeln **2** (Lib und DOM), das Fehlbild verschweigen **3**, Ausdruck auf das
Original umstellen **1**, Galerie auf das Original **1**, abgewiesene Dateien nicht
benennen **2**. Zurückgesetzt über Dateikopien, nie über `git checkout`.

#### Gates

| Prüfung | Ergebnis |
|---|---|
| ESLint (repo-weit) | **0**, Exit 0 |
| `tsc --noEmit` | **13 = Baseline / 0 neu** |
| `npx vitest run` | **3729/3729** (438 Dateien, +29) |
| `npm run build` | clean; beide Druckseiten im Routen-Manifest |
| Visual-Regression | **13/13 ohne Neuaufnahme** (AC-45εH-10) |
| α/β-Bau-Auth-Gates | **18/18 wörtlich** |
| ε-Auth-Gates (neu) | **9/9** |
| `check:index-scope` · `check:migration-naming` | je 0 Fehler |

**Ein eigener Messfehler, festgehalten:** der erste Visual-Lauf meldete 9
Fehlschläge. Ursache war meine Aufrufform — mit `127.0.0.1` als Basisadresse
blockiert Next.js den Zugriff auf Dev-Ressourcen, das erzeugt einen
Konsolenfehler, und der Wächter aus PROJ-Y-143e schlägt zu Recht an. Mit
`localhost` sind es 13/13. Kein Produktfehler; die Lehre ist, dass ein
Sammel-Fehlschlag über neun unabhängige Flächen zuerst nach Infrastruktur
aussieht und nicht nach der eigenen Änderung.

**Der neue ε-Auth-Gate-Spec schliesst vorbeugend die Lücke, die β's QA gefunden
hat** (dort hatten die fünf neuen API-Routen bis zur Abnahme gar keinen
Gate-Test). Tragender Fall ist die Ausliefer-Route: geprüft wird nicht nur der
Status **307**, sondern dass weder ein Bild-Inhaltstyp noch JPEG-/PNG-Magic-Bytes
im Rumpf stehen — ein Leck mit korrektem Status sieht eine reine Statusprüfung
nicht.

#### Was offen bleibt

- **AC-45ε.4/.5** (HEIC → JPEG) unverändert unerfüllt → **PROJ-Y-45o**
  (Lizenzklärung vor einem Paket).
- **Kein authentifizierter Browser-Durchlauf und kein echter Druck nach PDF mit
  sichtbaren Fotos.** Prod trägt **0 Dokumente** und **0 Fotos**; der Nachweis
  braucht die Bau-Fixture-Lane aus β samt geseedeten Bildern und gehört nach
  `/qa` — dort liegt auch der von den eigenen Risiken als schwierigster benannte
  Fall. Ungeprüft ist damit insbesondere, ob `next/image` mit `unoptimized` im
  Druckkontext wirklich Bytes zieht; die Adresse und der Fehlerpfad sind
  getestet, der Ladevorgang selbst nicht.
- **AC-45ε.6 zur Hälfte über die Lib belegt:** dass die Reihenfolge *gespeichert*
  wird, prüft der Routentest der Datenschicht; dass die Strecke sie *anzeigt*,
  folgt aus der serverseitigen Sortierung und ist im Browser nicht nachgemessen.

## QA Test Results — ε (2026-08-25)

**Verdikt beim Abschluss des Laufs: 0 Critical · 1 High · 0 Medium → nicht
produktionsreif.** **Nach der Behebung durch PROJ-Y-45q (2026-08-26): 0 Critical ·
0 High · 1 Medium (vorbestehend, PROJ-Y-45p) → produktionsreif.** Der High-Befund
war eine nicht erfüllte Zusage an eine ganze Rolle, kein Randfall — siehe
Abschnitt „F-1 behoben" unten.

### Was dieser Lauf geleistet hat

Der von `/backend` und `/frontend` ausdrücklich offen gelassene Kern ist
ausgeführt: **der authentifizierte Durchlauf in der β-Bau-Lane mit echten
Bilddateien** und ein **echter Druck nach PDF mit sichtbarem Foto**
(45.039 Byte, `%PDF-`-Kopf). Neue Datei
`tests/PROJ-45-epsilon-photo-chain.spec.ts`, **11 grün / 1 als Befund markiert**,
dreimal hintereinander stabil.

Die Bilder werden **zur Laufzeit erzeugt** statt eingecheckt
(`tests/fixtures/photo-fixtures.ts`, PROJ-Y-142b-Muster): eine Binärdatei im Repo
wäre nicht nachvollziehbar, und `sharp` ist ohnehin Produktions-Abhängigkeit. Der
EXIF-Inhalt ist dabei der Zweck — ohne Geräteangaben und GPS-Marke im Original
liesse sich AC-45ε.8 nicht belegen.

### F-1 (High) — die β-Regel ist Ende-zu-Ende nicht erreichbar

**Befund.** AC-45ε.16/.17 sagen zu, dass **jedes** Projektmitglied Fotos
hinzufügen darf, Betrachter eingeschlossen. Über die echte Route ist das nicht
möglich: der Betrachter erhält **422** mit
`create_failed: new row violates row-level security policy for table
"document_tree_nodes"`, während dieselbe Anfrage als Bauleitung mit **201**
antwortet. Beides live gemessen, im selben Mandanten, mit derselben Datei.

**Ursache — ein Widerspruch zwischen zwei Nutzer-Locks, kein Tippfehler.** L31
legt das Foto als echtes DMS-Dokument ab; PROJ-79s `document_tree_nodes_insert`
erlaubt INSERT nur `lead`/`editor`/Mandanten-Admin (an der Migration
nachgelesen, Zeile 84–88: `pm.role in ('lead','editor')`), `documents_insert`
ebenso. Die Fotostrecke ist damit strenger, als ihr eigenes Kriterium behauptet.

**Warum die bisherigen Nachweise das nicht sahen — alle drei prüfen daneben:**

| Nachweis | Warum er die Lücke verfehlt |
|---|---|
| Pentest-Vektor **A** („Betrachter darf verknüpfen") | verknüpft ein Dokument, das der **Admin** geseedet hat — geprüft wird `link_construction_photo`, nicht der DMS-Einfügepfad |
| Routentests | mocken `ingestDocumentFile` vollständig weg |
| Komponententest | belegt, dass der Knopf **angeboten** wird, nicht dass er wirkt |

Genau diese Schichtung ist der Grund, warum ε einen echten Durchlauf verlangt —
und dieselbe Klasse, die in PROJ-135 ein Kriterium ein Vierteljahr unbemerkt
unerfüllt liess. Der DMS-Regressionslauf bestätigt die Policy unabhängig
(`VIEWER-ins viewer insert blocked (42501)`).

**Wirkung.** Fail-closed, kein Sicherheitsbefund, kein Datenabfluss. Aber: die
Oberfläche bietet die Handlung an, der Nutzer bekommt rohen Datenbanktext, und
die fachliche Absicht („wer den Mangel melden darf, darf ihn fotografieren") ist
für die Rolle aufgehoben, für die sie geschrieben wurde. Ausweg heute: eine
Bauleitung lädt hoch. **Nicht in `/qa` behoben** — die Entscheidung ist eine
Architekturfrage (Einfügen über eine DEFINER-Funktion wie alles andere in dieser
Slice, oder das Kriterium verengen) und gehört nicht in einen Testlauf.
Als Befund im Spec-Test `test.fixme` markiert, damit die Lücke registriert ist
statt versteckt.

### F-2 (Medium, vorbestehend aus PROJ-79-α, von ε verschärft)

**Der Speicherplatz-Zähler geht nur hoch, nie herunter.**
`_dms_bump_storage_usage` addiert bei jedem `documents`-INSERT; im ganzen Repo
existiert **kein** Dekrement und **kein** Neuberechnungspfad (`grep` über
Migrationen und `src/`: nur Lese- und Additionsstellen). `last_recomputed_at`
wird geschrieben, aber nichts berechnet je neu.

**Schon vor diesem Lauf in Prod eingetreten, nicht hergeleitet:** beide
Test-Mandanten behaupten Verbrauch bei **null** gespeicherten Byte —
`[E2E] Projektplattform Test` 1.176 Byte / 0 tatsächlich,
`[E2E] Bau Test` 1.344 / 0. Mein Lauf hob den Bau-Wert auf 108.390 und ich habe
**nur meinen eigenen Beitrag** zurückgenommen (auf 1.344): die vorbestehende
Abweichung bleibt stehen, sie ist der Befund und nicht mein Rückstand.

**Warum ε das verschärft:** PROJ-79 machte Uploads gelegentlich, ε macht sie zur
Routine. Eine Bauleitung, die täglich fotografiert und aufräumt, verliert
Speicherplatz dauerhaft. Registriert als **PROJ-Y-45p**.

### F-3 (Info) — PROJ-Y-45h ist eingetreten, mit Messwert

Der Teardown der Kette scheiterte im ersten Lauf an
`construction defect events are append-only`: seit PROJ-Y-148d hat der
Ereignis-Wächter seinen Kaskaden-Ausstieg verloren, ein Mangel mit Verlauf ist
nicht mehr löschbar. Genau die in PROJ-Y-45h registrierte Lücke, jetzt mit
konkretem Fehlschlag belegt. Der Spec löscht deshalb **nur** die Fotozeilen
(laut, per `deleteOrThrow`) und **nicht** den Mangel; die 17 zurückgebliebenen
Mängel dieses Laufs sind über den Runbook-Weg entfernt
(`session_replication_role = replica`, auf Fixture-Projekt und eigene Titel
begrenzt, mit Vorbedingungen und Nachprüfung). Nachher: 14 Bestandsmängel,
**0** von mir, **0** deaktivierte Trigger.

### Live-Nachweise gegen Prod — 172 Zusicherungen, 0 FAIL, 0 Rückstände

| Datei / Sonde | Ergebnis |
|---|---|
| ε-Pentest `PROJ-45-epsilon-construction-photos-pentest.sql` | **18/18** (Block 1 12, Block 2 6) |
| α `PROJ-45-construction-trades-sections-pentest.sql` | **18/18** wörtlich (11 + 7) |
| β `PROJ-45-beta-construction-defects-pentest.sql` | **54/54** wörtlich (32 + 15 + 7) |
| γ `PROJ-45-gamma-construction-acceptances-pentest.sql` | Blöcke 3 + 4 **16/16** wörtlich |
| PROJ-Y-45a `reference-consistency-smoke.sql` | **9/9** wörtlich |
| PROJ-Y-45 `db-group-pentest.sql` | **16/16** wörtlich (7 + 5 + 4) |
| PROJ-79 `dms-pentest.sql` | **16/16** wörtlich |
| PROJ-80 `document-extractions-pentest.sql` | **10/10** wörtlich |
| Gezielte Nachbar-Sonde (neu, diese QA) | **15/15** |

Tragende Vektoren des ε-Pentests: **A** Betrachter darf auf RPC-Ebene verknüpfen
(die Ebene, auf der die β-Regel hält — F-1 sitzt eine Schicht darüber) · **B/C**
derselbe Betrachter darf nicht ändern und nicht entfernen · **F** die Löschsperre
greift **und benennt** den Bezug · **G** derselbe Weg über die deployte
DMS-Funktion ist ebenfalls gesperrt (weiches Löschen lässt keinen Fremdschlüssel
feuern) · **K** Projekt-Hart-Löschen gelingt trotz Fotos.

Die Nachbar-Sonde prüft genau die Flächen, die ε angefasst hat: alle vier
geteilten Register mit **namentlich** gegengeprüften Geschwister-Zweigen
(`construction_defects`, `construction_acceptances`, `spa_issues`,
`ma_valuations`, `document_tree_nodes`, `skill_knowledge_links`), Funktionsformen
(Auswertungen INVOKER, Schreibwege DEFINER, alle mit `search_path`), **0**
Schreib-Policies über alle fünf Bau-Objekttabellen, `anon` **und** PUBLIC ohne
EXECUTE über **alle** `construction%`-Funktionen, sowie γs Einfrier-Wächter mit
angehängtem Foto.

**Q-ε7 verhaltensmässig belegt:** an der protokollierten Abnahme ist Entfernen
gesperrt (**42501**), ein **anderes** Foto nachtragen geht (R10b), Bildtext
ändern geht (R11) — und dieselbe Datei zweimal am selben Anker wird abgewiesen
(**23505**, R10c). Der erste Versuch von R10 war mein Sondenfehler: ich hängte
dasselbe Dokument zweimal an dieselbe Abnahme und traf
`construction_photos_acceptance_doc_uk`. Produkt richtig, Vektor falsch.

**Ein Ergebnis ist bewusst INFO statt FAIL:** das Projekt-Hart-Löschen scheitert
in der Sonde mit `42501`, weil dieses Projekt eine **Abnahme mit Ereignissen**
trägt — γs unveränderliche Insel aus PROJ-Y-148a, nicht ein ε-Regress. Der
ε-Pentest belegt mit Vektor K, dass Fotos allein **keinen** neuen Blocker
erzeugen.

### Abdeckungslücke, benannt statt gerundet

**AC-45εH-9 ist nur teilweise erfüllt.** Wörtlich nachgefahren sind α, β,
PROJ-Y-45a, db-group, PROJ-79 und PROJ-80 vollständig sowie γ Blöcke 3–4.
**Nicht** wörtlich nachgefahren: **γ Blöcke 1–2** und **δ Blöcke 1–5**.

Was das abdeckt und was nicht: δs Auswertung `construction_schedule_signals` ist
durch die db-group-Blöcke **B0–B4 wörtlich** exerziert (dieselbe Funktion,
inklusive Tiefen-Riegel) und durch Sonden-Vektor R12 mit Fotos im Projekt; γs
Rechte-, ACL- und Wächterfläche durch Blöcke 3–4 plus die Einfrier-Vektoren.
**Offen bleibt** die wörtliche Wiederholung von γs Abnahme-Ablauf und δs
Signal-Buchhaltung. Das ist eine echte Lücke gegenüber dem Wortlaut des
Kriteriums, kein erledigter Punkt.

### Akzeptanzkriterien

| AC | Ergebnis |
|---|---|
| **45ε.1** Foto hinzufügen an allen drei Ankern, kein Ordnerwahl, Ordner idempotent | ✅ Kette 1c + Abschnitts-Block; Ordner-Wettlauf per Unit-Test |
| **45ε.2** Mehrfach, eine Abweisung bricht nicht ab, Ergebnis je Datei | ✅ 2 durch / 2 abgewiesen, beide namentlich |
| **45ε.3** 50-MB-, Quota- und Magic-Byte-Schranken unverändert | ✅ Routentests + Kette (Text-als-`.jpg` und PDF abgewiesen) |
| **45ε.4 / .5** HEIC → JPEG | ❌ **zurückgestellt** → PROJ-Y-45o (Q-ε1 negativ gemessen, Lizenzklärung) |
| **45ε.6** Reihenfolge änderbar und gespeichert | ✅ Tausch in der DB gegengeprüft |
| **45ε.7** Aufnahmedatum vorbelegt, sonst leer, nachtragbar | ✅ mit EXIF `2026-03-14`, ohne EXIF **NULL** (nicht „heute") |
| **45ε.8** ausschliesslich die Aufnahmezeit | ✅ Original trägt Geräteangaben + GPS-Marke (auf **Bytes** geprüft), Zeile trägt nur das Datum |
| **45ε.9** Galerie lädt Vorschau, Original per Download | ✅ Adressen im DOM festgenagelt |
| **45ε.10** lösen ohne Dateiverlust, löschen in den Papierkorb | ✅ Dokumentzahl unverändert, `deleted_at` null |
| **45ε.11** Mängelanzeige zeigt Foto, Bildtext, Datum | ✅ plus `naturalWidth > 0` — die Bytes kommen an |
| **45ε.12** Abnahmeprotokoll zeigt Fotos | ⚠️ nur über die Struktur (Prod hat 0 Abnahmen mit Fotos; Route und Island sind dieselben wie bei .11) |
| **45ε.13** Druckgrösse eingebettet, Zeitgrenze | ✅ `size=print`, PDF 45.039 Byte |
| **45ε.14** kein Foto ohne Berechtigung im Ausdruck | ✅ Sitzungs-Client; Auth-Gate-Spec belegt, dass ohne Sitzung nichts durchkommt |
| **45ε.15** Fotostrecke am Abschnitt, Zahl in der Liste | ✅ Zähler 1 nach Upload, Anker in der DB gegengeprüft |
| **45ε.16 / .17** β-Regel | ✅ **seit PROJ-Y-45q** — der Betrachter lädt wirklich hoch (Kette 1b, Pentest A/B), und die Enge ist als Paar belegt (C–G). Vorher ❌ als F-1 |
| **45ε.18** Modul-Gate | ✅ Routentests + Auth-Gates |
| **45ε.19** Mandanten-/Projekttrennung, auch aggregiert | ✅ ε-Pentest + Nachbar-Sonde |
| **45ε.20** verknüpftes Foto nicht löschbar, Bezug benannt | ✅ Vektor F (nennt „Mangel") und G |
| **45ε.21** Verschieben/Umbenennen unberührt | ⚠️ strukturell (Verknüpfung zeigt auf die Kennung); PROJ-79 `MOVE-OK` wörtlich grün |
| **45ε.22** Bild löst keine Extraktion aus | ✅ L38-Tests, ungemockt |
| **45ε.23** PROJ-80-Fälle wörtlich grün | ✅ 10/10 |

**Härtungskriterien:** H-1 ✅ (Nicht-Admin synthetisiert) · H-2 ✅ (Aggregat-Leck
mit Gegenprobe) · H-3 ✅ (`anon` **und** PUBLIC über alle) · H-4 ✅ (kein
Schreibweg an den Funktionen vorbei, als Mandanten-Admin) · H-5 ✅ (Register mit
Zweig-Gegenprobe) · H-6 ✅ (Ausliefer-Route ohne Sitzung: 307, kein Bild-Typ,
keine Magic Bytes) · H-7 ✅ (Pixelgrenze vor dem Entpacken) · H-8 ✅ · **H-9 ⚠️
teilweise** (siehe Abdeckungslücke) · H-10 ✅ (Visual 13/13 ohne Neuaufnahme) ·
H-11 ✅ (Inventar in `/backend` aufgefrischt, 285 → 293) · H-12 ✅ (Rot-Grün
14 Klassen über Backend und Frontend) · H-13 ✅ · **H-14 ⚠️** (Renderer-Hälfte
gegenstandslos, in `/frontend` gemessen und begründet; die Benennungs-Hälfte ist
gebaut und getestet) · H-15 ✅ (Vektor K) · H-16 ✅ · H-17 ✅

### Gates

| Prüfung | Ergebnis |
|---|---|
| `npx vitest run` | **3729/3729** (438 Dateien) |
| ESLint repo-weit | **0**, Exit 0 |
| `tsc --noEmit` | **13 = Baseline / 0 neu** (nach `rm -rf .next`) |
| Playwright ε-Kette | **11 grün / 1 Befund-`fixme`**, 3× stabil |
| Playwright ε-Auth-Gates | **9/9** |
| Playwright α/β-Bau-Auth-Gates | **18/18** wörtlich |
| Visual-Regression | **13/13** ohne Neuaufnahme |
| Advisors (Security) | **152 WARN / 0 ERROR**; die 3 ε-WARN sind die beabsichtigte Kategorie mit 149 Bestandsfällen |
| Prod-Rückstände | **0** (0 Fotos, 0 Dokumente, 0 Knoten, 0 eigene Mängel, Quota zurückgesetzt, 0 deaktivierte Trigger) |

### Zwei eigene Messfehler, festgehalten

**Der erste Kettenlauf meldete drei Fehlschläge, die keine Produktfehler waren.**
Mein Aufräumen löschte projektweit, Playwright fährt `describe`-Blöcke aber
parallel — ein fertiger Block nahm einem laufenden die Fotos weg. Dieselbe Klasse,
die β mit Bereichsbuchstaben gelöst hat; hier nicht lösbar (ein Foto trägt keinen
Titel), also läuft die Datei ganz seriell.

**Die GPS-Zusicherung war falsch, nicht die Fixture.** EXIF speichert numerische
Tag-Kennungen, keine Namen — eine Textsuche nach `GPSLatitudeRef` schlägt
zwangsläufig fehl, auch wenn GPS-Daten vorhanden sind. Jetzt wird der
GPS-IFD-Zeiger `0x8825` in der vom TIFF-Kopf angesagten Bytefolge gesucht,
hinter dem `Exif\0\0`-Präfix.

Dazu die aus PROJ-Y-143e bekannte Falle erneut angetroffen: eine halb
geschriebene `.next/dev/types/validator.ts` liess `tsc` mit **3** statt 13
Fehlern abbrechen — **weniger** Fehler sah wie eine Verbesserung aus. Nach
`rm -rf .next` wieder 13.

### Abweichungen

- **D-ε.qa.1** — die Kettendatei läuft **ganz** seriell und ist nur als Ganzes
  aussagekräftig; ein einzelner Block per `-g` scheitert, weil er auf den Upload
  des Vortests aufbaut.
- **D-ε.qa.2** — AC-45ε.12 und .21 sind strukturell belegt, nicht durchfahren
  (Prod trägt keine Abnahme mit Fotos; Route und Island sind dieselben wie .11).
- **D-ε.qa.3** — Mobile Safari env-übersprungen (PROJ-67/F2).
- **D-ε.qa.4** — die 17 Mängel des Laufs über den Runbook-Weg entfernt, weil
  PROJ-Y-45h den regulären Weg versperrt.

### F-1 behoben — PROJ-Y-45q (2026-08-26)

**Nutzer-Entscheid: über eine `SECURITY DEFINER`-Funktion lösen, L31 bleibt.**
Die Alternative (AC-45ε.16/.17 auf `lead`/`editor` verengen) hätte L15s
Begründung zurückgenommen — wer einen Mangel melden darf, darf ihn auch
fotografieren. **Verdikt damit: 0 Critical / 0 High / 1 Medium (vorbestehend) →
produktionsreif.**

#### Die Reihenfolge ist geblieben, weil zwei Messungen sie festlegen

Naheliegend wäre gewesen, zuerst hochzuladen und Knoten plus Dokumentzeile
danach in einem Zug zu schreiben. Beides scheidet aus, und zwar gemessen:
`documents_bucket_insert` prüft `_dms_object_access(name)` mit
`p_allow_orphan = false` — ein Hochladen **vor** dem Knoten wird abgewiesen; und
die Dokumentzeile zuerst zu schreiben wäre schlechter, weil der Quota-Trigger auf
ihrem INSERT feuert und es kein Dekrement gibt (Befund F-2). Ein fehlgeschlagener
Upload hätte dann dauerhaft Speicherplatz gekostet. Also unverändert
**Knoten → Objekt → Dokumentzeile**, wie PROJ-79 sie hat.

#### Die Sicherheitsaussage ist die Enge, nicht das „DEFINER"

Migration `20260826090000_projy45q_photo_document_definer`, drei Funktionen —
und jede trägt genau eine Einschränkung, die sie vom allgemeinen Schreibrecht
trennt:

| Funktion | Was sie eng hält |
|---|---|
| `create_construction_photo_node` | der Zielordner wird **gesetzt, nicht gewählt** — der Aufrufer kann nicht bestimmen, wo der Knoten entsteht |
| `record_construction_photo_document` | nur an einem Knoten, dessen Elternteil **genau der Fotoordner** des eigenen Projekts ist, und nur für JPEG/PNG |
| `discard_construction_photo_node` | nur ein **halb** angelegter Knoten ohne Datei — kein Löschpfad für Inhalte |

**PROJ-79 bleibt unangetastet.** Die Migration prüft das selbst: eine
Post-Condition scheitert laut, wenn `document_tree_nodes_insert` oder
`documents_insert` ihre `lead`/`editor`-Bedingung verloren hätten. Verlöre diese
Slice die Enge, verlöre sie ihre Begründung.

#### Live gegen Prod: 19/19, und der Nachweis ist ein Paar

`tests/sql/PROJ-Y-45q-photo-document-definer-pentest.sql`, Block 1 **14/14** +
Block 2 **5/5**, 0 Rückstände. Nur zu zeigen, dass der Betrachter durchkommt,
wäre gefährlich — dann bliebe offen, ob er jetzt überall schreiben darf:

- **A/B** der Betrachter legt den Knoten an und schreibt die Dokumentzeile
  (vorher `42501`) · **A2** der Ordner ist wirklich der Fotoordner · **A3**
  idempotent · **B2** L38-Flag steht
- **C** ein fremder Knoten ausserhalb des Fotoordners ist unerreichbar (42501) ·
  **C2** kein Nicht-Bild (22023)
- **D/D2** direktes INSERT in `document_tree_nodes` und `documents` bleibt für
  denselben Betrachter gesperrt (42501) — **PROJ-79 ist nicht aufgeweicht**
- **E** ein Knoten mit Datei ist über die Rücknahme nicht löschbar · **E2** ein
  halber schon · **E3** ein fremder Knoten nicht
- **F** fremdes Projekt trotz Mandanten-Mitgliedschaft (42501) · **G/G2** ein
  echter Fremder bekommt gar nichts · **H** Gegenprobe, dass der Betrachter kein
  Admin ist (sonst wäre alles falsch-grün)

**Regression PROJ-79-DMS 16/16 wörtlich** — darunter
`VIEWER-ins viewer insert blocked (42501)`, also derselbe Nachweis von der
anderen Seite.

#### Ein blinder Vektor in meiner eigenen Sonde, gefunden und benannt

Der erste Lauf meldete **G_stranger = FAIL(erlaubt!)** und sah wie ein Loch aus.
Es war keins: mein „Fremder" wurde als *erster Nutzer ohne Mandanten-Mitgliedschaft*
gewählt — und das war genau der Nutzer, den die Sonde zwei Zeilen später selbst
zum Betrachter macht. Live gegengeprüft (gewählter Fremder = `…000006` = `v_low`).
Klasse B-γ2 / PROJ-Y-78e. Der Vektor liegt jetzt in einem eigenen Block, schliesst
beide bekannten Kennungen aus, **bricht ab, wenn kein echter Fremder existiert**
(statt blind grün zu werden) und belegt vorab, dass der Gewählte weder Mandanten-
noch Projektmitglied ist.

#### Anwendungsschicht

Neu `src/lib/construction/photo-ingest.ts` (foto-spezifisch); `dms/ingest.ts`
bleibt für gewöhnliche Dokumente **unverändert** — dort ist die engere Regel
richtig. `photo-folder.ts` ist auf **Lesen** reduziert: das Anlegen macht die
Datenbank, gelesen wird nur die Ordner-Kennung, damit `dedupeFilename` die eine
Autorität für Kennungen bleibt. Der Rücknahmepfad ruft nicht mehr
`dms_soft_delete_subtree` (für Betrachter gesperrt und damit genau am Zweck
vorbei), sondern entfernt erst die Objekte und dann den halben Knoten.

**Ein eigener Fehler beim Gegenlesen gefangen, vor dem ersten Lauf:** die erste
Fassung übergab `tenantId: ""` mit der Begründung, der Ablageweg käme aus der
Knoten-Kennung. Falsch — `uploadDocumentFile` baut `{tenant}/{projekt}/{knoten}/…`,
ein leeres erstes Segment hätte die Bucket-Policy abgelehnt.

#### Der authentifizierte Nachweis

Der `test.fixme` ist ersetzt: **1b fährt den Betrachter-Upload wirklich durch**
(Bild erscheint als Vorschau, `naturalWidth > 0`, und im selben Zustand fehlen
Ändern und Entfernen). Kette **12/12**, auch aus **kaltem** `.next`.

Dabei ein Kaltstart-Fall, der nicht überdeckt wurde: 1b ist jetzt der erste Test,
der die Ausliefer-Route berührt, und ein Lauf scheiterte an deren Kompilat statt
an den Bytes. Der Test stellt jetzt eine Anfrage vorweg — damit ist getrennt, was
getrennt gehört („Route noch nicht kompiliert" gegen „Bytes kommen nicht an"),
statt nur länger zu warten.

#### Gates

vitest **3729/3729** · ESLint 0 · tsc **13 = Baseline / 0 neu** (nach
`rm -rf .next`) · Build clean · migration-naming 0 · index-scope 0 ·
**Funktions-Inventar 293 → 296** aufgefrischt (Restliste des Wächters 9 → 6, die
bekannten Bestandsfälle) · Prod-Rückstände **0** (0 Fotos, 0 Dokumente, 0 Knoten,
0 eigene Mängel, Quota zurückgesetzt, **0 deaktivierte Trigger**).

#### Was das nicht behebt

**F-2 (PROJ-Y-45p)** bleibt offen: der Speicherplatz-Zähler hat weiterhin kein
Dekrement. Diese Slice hat ihn nicht angefasst — und weil die Reihenfolge
unverändert bleibt, wird er nur bei **erfolgreichen** Uploads erhöht, nicht bei
abgebrochenen. **AC-45ε.4/.5** (HEIC) unverändert → PROJ-Y-45o. **AC-45εH-9**
bleibt teilweise erfüllt (γ Blöcke 1–2, δ Blöcke 1–5 nicht wörtlich).

---

## Deployment — δ (2026-08-21)

**Tag `v2.73.0-PROJ-45-delta` · PR #435 (squash) → main `cde35eb` · Feature-Scope bleibt `alpha`.**

### Der Scope — und warum δ ihn *fast* hebt

Aus den Belegen klassifiziert, nicht aus dem Etikett. δ beseitigt den Grund, der β und γ auf `alpha`
gehalten hat: **AC-45β.18 ist erfüllt** (AC-45δ.16, Block 4 der Auswertung; der **Ort** weicht per L25
vom Wortlaut ab und die Abweichung ist dokumentiert, nicht umgeschrieben). Damit ist die zurückgestellte
ursprüngliche Anforderung aus β **abgetragen** und ihre Registerzeile geschlossen.

**`full` bleibt trotzdem ausgeschlossen — durch genau eine Sache.** Die Spec führt drei zurückgestellte
Original-Stories der Erstfassung: Abnahmen (γ, erledigt), Terminsignale (δ, hiermit erledigt),
**Fotodokumentation (ε, offen)**. ε ist keine spätere Erweiterung, sondern eine Story der Erstfassung —
die Regel erlaubt offene Erweiterungen nur, „only if they do not defer … an original in-scope acceptance
criterion". Die Ausnahme **„Waived criterion" greift nicht**: sie verlangt „nothing was deferred", und ε
ist mit Ziel-ID registriert; es existiert sehr wohl ein Arbeitspaket, das die Anforderung erfüllen würde.

**`mvp` gegen `alpha`:** δ ist ein **benannter Sub-Slice** der Reihe α/β/γ/δ/ε mit eigenen 24
Akzeptanzkriterien, eigenem QA-Durchlauf und eigener Deploy-Evidenz, und der verbleibende Slice ε ist
namentlich geführt — wörtlich die `alpha`-Definition, keine MVP-Grenze. Dieselbe Einordnung wie α/β/γ aus
demselben Grund. **`tooling-only` fällt weg:** δ liefert produktive Laufzeitfähigkeit (drei
Datenbankfunktionen, Routen, eine fünfte Bau-Fläche, ein Berichts-Block).

### Die gelieferte Grenze

Terminsignale als **rein lesende** fünfte Bau-Fläche hinter demselben einen Modul-Schalter: Kopfzahlen,
Gewerk-Signale mit **benannten** Gründen (das gerechnete Signal steht **neben** der manuellen α-Ampel —
die Abweichung ist der Ertrag, L26), Bauabschnitte als eingerückter Baum mit **Quellenangabe** statt eines
irreführenden „0 %", nächste Fristen (verstrichene oben und gekennzeichnet), Engpass-Sicht der überfälligen
Mängel (= AC-45β.18), CSV je Block, plus ein optionaler Bau-Block im PROJ-21-Status-Report. Jede Aktion ist
ein **Sprung** auf die zuständige Fläche — kein Schreibpfad, und bewusst **kein** verschärftes Rollen-Gate
(anders als γ): der Betrachter sieht die Fläche vollständig, bekommt aber keinen Schreibweg.

**Nicht** geliefert: Fotodokumentation (ε), Gantt-Integration (per Nutzer-Entscheid L24 unberührt —
eine vierte Zeilenart würde für jedes heutige Projekt leer rendern), Kostenschätzung je Mangel (L14,
Out of Scope).

### Kein Runtime-DB-Change beim Merge

Die Migration `20260820180000_proj45_delta_construction_schedule_signals` liegt seit `/backend`
(2026-08-20) in Prod; der Merge liefert ausschließlich Code. Vercel deployt automatisch von `main`.

### Prod eigenständig nachgemessen, nicht aus den QA-Notizen übernommen

| geprüft | Ergebnis |
|---|---|
| `construction_schedule_signals` | **INVOKER**, `stable`, `search_path=public, pg_temp` — INVOKER ist der Aggregat-Leck-Schutz: die Auswertung rechnet im Rechtekontext des Aufrufers |
| `_construction_defect_is_open` (D-δ4) | INVOKER, **immutable**, `search_path` gesetzt |
| `_construction_reservation_is_open` (D-δ4) | INVOKER, **immutable**, `search_path` gesetzt |
| `anon` EXECUTE über alle **29** Bau-Funktionen | **keine** |
| **PUBLIC** in der ACL über alle 29 | **keine** — PROJ-Y-114a-Lehre vollständig, nicht als Stichprobe |
| Funktionen ohne `search_path` | **0** |

Damit sind die drei δ-Funktionen als *drei* belegt und nicht bloß gezählt: zwei Prädikat-Autoritäten
(`immutable`, weil sie nur über ihre Argumente entscheiden) und eine Auswertung.

### Deploy-Nachweis

Vercel-Produktions-Deployment `dpl_5142o56yE2QPtKRV8F36FZ842nNF`, **`target: production`**, gebaut aus
**genau diesem SHA** (`githubCommitSha cde35eb…`) — nicht bloß „ein Deployment existiert". Post-Deploy-Smoke
über die neuen Flächen: siehe unten.

### Was offen bleibt

- **PROJ-45-ε** (Fotodokumentation) — zurückgestellte **Original-Story** der Erstfassung und ab jetzt der
  **einzige** Grund, dass PROJ-45 `alpha` statt `full` trägt.
- **PROJ-Y-45l** (Low, aus δ-QA) — der Rekursions-Riegel `depth < 20` unterberichtet **still**.
- **PROJ-Y-45m** (Info, cross-cutting) — weich gelöschte Projekte werden von den Bau-Auswertungen nicht
  ausgeblendet; konsistent mit den Geschwister-Flächen, deshalb cross-cutting statt δ-Defekt.
- **PROJ-Y-45b/45c/45d/45e/45f/45g/45h/45i/45j/45k** unverändert; **PROJ-Y-45h** ist durch F-δ4 **enger**
  gefasst als notiert (unlöschbar ist ein Mangel erst **mit** Verlaufszeilen, nicht grundsätzlich).

---

## Deployment — γ (2026-08-20)

**Tag `v2.70.0-PROJ-45-gamma` · PR #422 (squash) → main `31aef7f` · Deployment Scope `alpha`.**

### Was ausgeliefert wurde

Die Abnahme als eigenes Bau-Objekt: zweistufig **angesetzt → Ergebnis**, dreiwertiges Ergebnis
(abgenommen · unter Vorbehalt · verweigert), Vorbehalte als **Verweise** auf β-Mängel (bestehende
anhaken und neue über β's Anlegefunktion — keine zweite Mängelliste), gerechnete
Gewährleistungsfrist, unveränderliche Ereigniskette, strukturierte Teilnehmer, ein Beleg je
Abnahme und ein Abnahmeprotokoll als Druckseite. Ein Ergebnis ist endgültig; die Nachabnahme ist
ein **neuer** Datensatz mit Verweis (Invariante #5).

**Kein Runtime-DB-Change beim Merge** — beide Migrationen (`20260819120000` /
Prod-Version `20260819163906` und `20260819170000`) liegen seit `/backend` in Prod. Der Merge
liefert die Anwendungsschicht aus.

### Auslieferung belegt, nicht angenommen

Vercel-Produktions-Deployment **`dpl_3UYP2FbCNTuzuPowxsrZVnB3reaf` READY**, gebaut aus genau
`githubCommitSha 31aef7f85d9663cef413637e056a102896c478df` — nicht bloß „ein Deployment existiert".
Fehler-Logs über die gesamte Lebensdauer dieses Deployments (READY 11:05:37 UTC bis zur Messung):
**keine**. Das Fenster ist mit ~9 Minuten kurz, weil eine Parallel-Slice unmittelbar danach ein
neueres Produktions-Deployment auslöste; ein längeres Fenster für **diesen** SHA existiert nicht,
und das wird hier gesagt statt gerundet.

**Alle sechs Pflicht-Checks grün**, darunter der **Schema-Drift-Wächter** — der belegt unabhängig,
dass die Register-Anker-Ersetzungen auch in einer **frisch aus den Migrationsdateien** gebauten
Datenbank greifen, nicht nur gegen die gewachsene Prod-Definition. Ebenfalls grün: der neue
**Funktions-Inventar-Wächter** (PROJ-Y-148e) — das Inventar wurde von 272 auf **283** Einträge
aufgefrischt und gegen Prod gegengezählt (283).

### Post-Deploy-Smoke: 13 Flächen, exakt 307, kein Leck

Alle sechs API-Routen (`GET`/`POST` Liste · `GET`/`PATCH` Detail · `POST` Statuswechsel ·
`PUT` Teilnehmer · `PUT` Beleg · `GET` Zähler), beide Seiten (`/abnahmen`,
`/abnahmeprotokoll/print`) und drei α/β-Flächen als Nicht-Regression antworten mit **307**,
Rumpf exakt `Redirecting...`; kein Vorkommen von Projekt-/Abnahme-Kennung, „Abnahme", „Gewerk",
`warranty`, `accepted_on` oder `construction` im Rumpf.

**Die Existenz der Routen ist ausdrücklich nicht daraus gefolgert.** Gegenprobe: ein erfundener
Pfad antwortet **ebenfalls 307** — 307 allein beweist nichts. Der Beleg kommt aus dem **Build-Log
des ausgelieferten Deployments**, in dem alle **acht** neuen Flächen als registrierte Routen
stehen (`ƒ /api/projects/[id]/construction-acceptances`, `…/[aid]`, `…/[aid]/document`,
`…/[aid]/participants`, `…/[aid]/status`, `…/summary`, `ƒ /projects/[id]/abnahmen`,
`ƒ /projects/[id]/abnahmeprotokoll/print`) — und in dem die **17** α/β-Flächen unverändert
mitgeführt sind.

### Prod eigenständig nachgemessen

| | gemessen |
|---|---|
| Tabellen (`relkind='r'`) | **4**, alle mit aktivem RLS |
| Policies | **4** — je Tabelle genau eine Lese-Policy |
| **Schreib-Policies** | **0** — geschrieben wird ausschließlich über Funktionen |
| Funktionen | **11** (8 DEFINER-Schreibwege/Wächter, **3 INVOKER**-Auswertungen) |
| `anon`-EXECUTE / PUBLIC-Eintrag in der ACL | **0 / 0** über alle 11 (PROJ-Y-114a-Lehre vollständig, nicht als Stichprobe) |
| Funktionen ohne `search_path` | **0** |
| Trigger | **5** (4 auf `construction_acceptances`, 1 auf den Ereignissen) |
| Deaktivierte Bau-Trigger | **0** |
| Objektarten-Register | **95** wie vorhergesagt (94 → 95) |
| Rückstände (Abnahmen · Ereignisse · Mängel) | **0 · 0 · 0** |
| Advisors | **0 ERROR**; die 6 γ-WARN sind eine einzige beabsichtigte Kategorie (`authenticated`-aufrufbare `SECURITY DEFINER`-Schreibwege — dieselbe wie α/β und 141 Bestandsfälle) |

**Ein Messfehler in der eigenen ersten Abfrage, festgehalten statt stillschweigend korrigiert:**
`pg_class` enthält auch Indizes, die erste Zählung meldete darum „20 Tabellen". Mit
`relkind='r'` sind es **4**. Die Zahl war nie falsch verwendet — sie wurde nachgezählt, bevor sie
irgendwo behauptet wurde.

### Warum `alpha` und nicht `full`

Der Scope steht am **Feature** PROJ-45, nicht an der Teilscheibe, und wird aus den Belegen
klassifiziert. Alle vier Bedingungen der Ausnahme „Waived criterion" einzeln geprüft:

1. **„Nothing was deferred" — trifft nicht zu.** **AC-45β.18** (überfällige Mängel in der
   PROJ-103-Engpass-Sicht) ist eine zurückgestellte **ursprüngliche** Anforderung mit Ziel-ID
   (D-β1, nach δ). Damit ist die Ausnahme schon an der ersten Bedingung erschöpft.
2. Nicht unerreichbar oder obsolet — δ wird sie liefern.
3. Es gibt eine schriftliche Annahme, aber als **Zurückstellung**, nicht als Verzicht.
4. Die Substanz ist **nicht** anderweitig erfüllt — die Engpass-Sicht zeigt die Mängel heute nicht.

Dazu bleiben zwei Stories der Erstfassung offen: **Terminsignale (δ)** und **Fotodokumentation (ε)**.
γs eigene 29 Kriterien sind sämtlich erfüllt; das hebt den Feature-Scope nicht, weil `full` sich auf
**alle** aktuellen in-scope-Kriterien des Features bezieht.

**Die gelieferte Grenze wird gegenüber β breiter:** Abnahmevorgänge mit Termin und dreiwertigem
Ergebnis, Vorbehalte gekoppelt an die Mängel statt dupliziert, gerechnete Gewährleistungsfrist,
Nachabnahme als verwiesene Kette, unveränderlicher Verlauf, Teilnehmer, Beleg und Druckprotokoll.

### Offene Folgearbeit nach γ

**PROJ-45-δ** (Terminsignale, enthält AC-45β.18) · **PROJ-45-ε** (Fotodokumentation) ·
**PROJ-Y-45b/45c/45d/45e** (aus α/β) · **PROJ-Y-45f** (β's
`construction_section_blocking_defects` ist nach diesem Deploy ohne Aufrufer) · **PROJ-Y-45g**
(Beleg als Dokumentknoten auswählbar — die Datenbankseite steht und ist geprüft, es fehlt allein
der Picker) · **PROJ-Y-45h** (Teardown für die Bau-E2E-Lane) · **PROJ-Y-45i** (verdeckter Titel im
Ladezustand, WCAG). **Nicht γ:** β's QA-Teardown im 148d-Zweig (F-γ4, Hälfte 2).

---

## Out of Scope (α) — benannte Folge-Slices

| Slice | Inhalt | Vorlage |
|---|---|---|
| **PROJ-45-β** | **Mängelmanagement**: eigenes Objekt mit Lebenszyklus offen → in Bearbeitung → erledigt → **geprüft**, Nachbesserungsfrist, Pflicht-Gewerk, Ort (Abschnitt), verantwortlicher Nachunternehmer; Mängelanzeige als PDF (L3) | `dd_findings` (PROJ-114) + PROJ-21 |
| **PROJ-45-γ** | **Abnahmen**: Abnahmeprotokoll mit Status, Termin, verantwortlicher Rolle und Belegverweis; fehlgeschlagene Abnahme erzeugt prüfbare Vorschläge für Mangel oder Risiko. **Spezifiziert 2026-08-19** — siehe Abschnitt „PROJ-45-γ — Abnahmen" oben (29 AC, Locks L17–L23) | `deliverable_approvals` (PROJ-105) — **nur die Protokollform**, siehe Befund im γ-Block |
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

## Deployment — β (2026-08-19)

**Deployed 2026-08-19 · Tag `v2.61.0-PROJ-45-beta` · PR #402 (squash) → main `740b16b`**

**Deployment Scope: `alpha`.** Aus den Belegen klassifiziert, nicht aus dem Etikett und nicht aus
der Vorab-Einordnung. Der Reihe nach an `.claude/rules/general.md`:

- **`tooling-only` fällt weg** — β liefert produktive Laufzeitfähigkeit (zwei Tabellen, fünf
  API-Routen, zwei Seiten, eine Bedienfläche), nicht Werkzeug/CI/Tests.
- **`full` ist ausgeschlossen.** Die Regel verlangt *jedes* aktuell in Umfang stehende
  Akzeptanzkriterium; **AC-45β.18** ist von `/qa` ausdrücklich als „OFFEN — nicht erfüllt" geführt
  und per Nutzer-Entscheid (D-β1) nach **PROJ-45-δ** verschoben. Genau dieser Fall ist in der Regel
  benannt: spätere Erweiterungen dürfen offen bleiben, „only if they do not defer … an original
  in-scope acceptance criterion".
- **Die Ausnahme „Waived criterion" greift nicht** — sie verlangt **alle vier** Bedingungen
  kumulativ, und drei sind verletzt:
  1. *„Nothing was deferred."* **Verletzt** — AC-45β.18 ist zurückgestellt und mit Ziel-ID in
     `features/OPEN-DEFERRED-STATUS.md` (δ-Zeile) registriert. Es gibt sehr wohl ein Arbeitspaket,
     das das Kriterium erfüllen würde.
  2. *Nachweislich unerreichbar oder obsolet.* **Verletzt** — die Engpass-Auswertung
     `project_task_bottlenecks` ist deployed und erweiterbar; sie ist nur *noch nicht* erweitert.
     Die Erhebung dazu liegt in der δ-Zeile bereits vor.
  3. *Schriftliche Abnahme, die das Kriterium benennt.* **Erfüllt** — QA-Verdikt und D-β1.
  4. *Die Substanz ist durch andere Messung gedeckt.* **Verletzt** — überfällige Mängel erscheinen
     in der Engpass-Sicht gar nicht; der PROJ-103-Pentest belegt im Gegenteil, dass β sie
     **unberührt** gelassen hat. Der Zweck des Kriteriums ist damit nicht erreicht, nur seine
     Nachbarschaft (Überfälligkeit in der Mängelliste, AC-45β.17/.19).
- **`mvp` gegen `alpha`:** β ist ein **benannter Sub-Slice** der Reihe α/β/γ/δ/ε mit eigenen 22
  Akzeptanzkriterien, eigenem QA-Durchlauf und eigener Deploy-Evidenz, und die verbleibenden Slices
  γ/δ/ε sind namentlich geführt — das ist wörtlich die `alpha`-Definition, keine MVP-Grenze.
  Dieselbe Einordnung wie α aus demselben Grund.

**Die gelieferte Grenze.** Mängel als eigenes Bau-Objekt (L9) mit Zwei-Akteur-Prüfung: erfassen darf
jedes Projektmitglied inklusive Betrachter (L15), ändern und prüfen nur Projektleitung/Bauleitung
oder Mandanten-Administration — der Projekt-`editor` ist bewusst **ausgeschlossen** (D-β2, strenger
als das Hausrecht `edit`). Kette offen → in Bearbeitung → erledigt → geprüft, mit Rückweisung und
Pflichtbegründung, unveränderlicher Ereignis-Historie über mehrere Runden, Vier-Augen-Tor **ohne**
Umgehungspfad (D-β4). Dazu: fünf serverseitige Filter, Überfälligkeitskennzeichen, Zähler je Gewerk,
Entfernen-Sperre mit Nennung der blockierenden Mängel auch am **Enkel** (409, nicht 500), und die
Mängelanzeige als chrome-lose Druckseite (L11). **Nicht** geliefert: Anbindung an die Engpass-Sicht
(AC-45β.18 → δ), Abnahmen (γ), Fotodokumentation (ε), Kostenschätzung je Mangel (L14, Out of Scope),
echter Versand über PROJ-13 (L11, Out of Scope).

**Kein Runtime-DB-Change beim Merge:** die Migration `20260818104358_proj45_beta_construction_defects`
liegt seit `/backend` (2026-08-18) in Prod; der Merge liefert ausschließlich Code. Vercel deployt
automatisch von `main`, es gibt keine Vercel-CLI auf diesem Host.

### Vercel-Deployment (nicht „ein Deployment existiert", sondern dieses)

`dpl_C9Mk4gxt68CRPzZ9AEUtioe96iU9` — **`state: READY`**, **`target: production`**, gebaut aus
**`githubCommitSha: 740b16b…`** auf `githubCommitRef: main`, Signatur `verified`, fertig
**2026-08-19T06:51:59Z**; es ist zugleich das **neueste** Deployment, also der aktuelle
Produktionsstand. Build-Log: „Build Completed … Deployment completed". **Runtime-Fehler im
24-h-Fenster über den Deploy: 0** — mit der ehrlichen Einschränkung, dass das Beobachtungsfenster
nach dem Deploy erst wenige Minuten umfasst.

### Prod-Verifikation (eigenständig gegen Prod gemessen, nicht aus den `/backend`-Notizen übernommen)

| Prüfung | Ergebnis |
|---|---|
| Migration in Prod | `20260818104358` = `proj45_beta_construction_defects`, Version deckt sich mit dem Repo-Dateinamen |
| Tabellen + RLS | `construction_defects` **RLS aktiv**, `construction_defect_events` **RLS aktiv** |
| Policies | genau **2**, beide `SELECT`, beide `PERMISSIVE` — **keine einzige Schreib-Policy** auf beiden Tabellen (geschrieben wird ausschließlich über Funktionen) |
| Funktionen | **8** von der Migration erzeugt: 3 Schreibwege `DEFINER` (`create_` / `update_` / `transition_…_status`), **3** Auswertungen `INVOKER` (`construction_defect_summary`, `construction_section_blocking_defects`, `_construction_defect_is_overdue`), 2 Wächter `DEFINER`; alle 8 tragen `search_path` |
| Trigger | **5** auf den beiden Tabellen, alle `ENABLED`: Unveränderlichkeit (Ereignisse), Wächter, `moddatetime`, Feld-Audit, Lebenszyklus — siehe Befund D-45β-DEPLOY-1 |
| `anon` EXECUTE | **false** auf **allen 15** `%construction%`-Funktionen und auf den 4 geteilten Audit-Funktionen |
| PUBLIC EXECUTE | **0 PUBLIC-Einträge** in der ACL aller 19 geprüften Funktionen (über `aclexplode`, `grantee = 0`) — die PROJ-Y-114a-Lehre vollständig, nicht als Stichprobe |
| interne Wächter | `construction_defect_guard` und `enforce_construction_defect_event_immutability` sind auch für `authenticated` **nicht** aufrufbar |
| Register | Objektarten **94** · Feld-Whitelist **76** · Lese-Tor **63** — exakt die im Tech Design vorhergesagten Werte; `construction_defects` in allen drei, `construction_defect_events` in **keinem** |
| Geschwister-Zweige | **14** Nachbar-Objekte namentlich gegengeprüft, alle erhalten; die zwei Abwesenheiten sind der dokumentierte Bestand (`project_skills` ohne Whitelist-Zweig, PROJ-78; `audit_reader_grants` ohne Lesetor-Zweig, PROJ-130-γ2). γ1-Klausel `_audit_entry_classified_ok` und γ2-Klausel `has_audit_reader_grant` unverändert im gemeinsamen Ausgang, `authenticated`-Grant auf `can_read_audit_entry` intakt |
| Advisors | **0 ERROR** auf beiden Achsen (Security 144 WARN, Performance 15 WARN / 293 INFO). Die 3 slice-bezogenen Security-WARN sind die drei Schreib-RPCs als `authenticated`-ausführbare `SECURITY DEFINER`-Funktionen — die Kategorie, die den Schreibweg überhaupt trägt. Der einzelne `anon_security_definer`-WARN gehört `seed_risk_categories_if_empty` und ist **Bestand** (PROJ-107), keine Bau-Funktion. Die 8 slice-bezogenen Performance-Meldungen sind INFO |
| Rückstände | `construction_defects` **0** · `construction_defect_events` **0** · `audit_log_entries` für `construction_defects` **0** · Mängel im **Kundenmandanten 0** · PROJ-130-α-Wächter **3/3 aktiv** · `session_replication_role` = `origin` · `audit_log_entries` gesamt **576** (Bestand anderer Mandanten, unangetastet). Die Bau-Fixture-Lane bleibt bewusst stehen |

### Post-Deploy-Smoke (Produktions-URL, alle sieben neuen Flächen)

Acht Methoden/Pfad-Kombinationen über die fünf API-Routen und die zwei Seiten. Erwartung auf **genau
einen** Wert verschärft, wie `/qa` es für die α-Gates getan hat — nicht auf eine Liste zulässiger
Codes:

| Fläche | Aufruf | Ergebnis |
|---|---|---|
| Mängelliste | `GET /api/projects/{id}/construction-defects` | **307** → `/login?next=…` |
| Mangel anlegen | `POST` dieselbe Route | **307** |
| Zähler je Gewerk | `GET …/construction-defects/summary` | **307** |
| Mangel ändern | `PATCH …/construction-defects/{did}` | **307** |
| Statuswechsel | `POST …/construction-defects/{did}/status` | **307** |
| Verlauf | `GET …/construction-defects/{did}/events` | **307** |
| Mängel-Seite | `GET /projects/{id}/maengel` | **307** |
| Mängelanzeige-Druck | `GET /projects/{id}/maengelanzeige/print` | **307** |

Der Rumpf ist in allen acht Fällen **exakt** `Redirecting...` (15 Byte); ein Raster über
`construction_defect · maengel · mangel · trade_id · severity · geprueft · fertiggemeldet ·
vendor_id · defects_present` findet **keinen** Treffer — kein Struktur-, Status- oder Datenleck.

**Was dieser Smoke nicht beweist, und wie die Lücke geschlossen wurde.** Der Proxy-Matcher greift auf
praktisch jeden Pfad, also antwortet auch ein **erfundener** Pfad mit 307 (gegengeprüft:
`/api/projects/{id}/gibt-es-nicht-xyz` und `/projects/{id}/erfundene-seite-xyz` → beide **307**).
Ein 307 belegt damit das Auth-Tor, aber **nicht** die Existenz der Route — genau die Blindheit, die
`/qa` beim α-Gate für `404` beschrieben hat, eine Ebene weiter. Geschlossen nicht durch Schlussfolgern
vom lokalen Build, sondern am **Build-Log des ausgelieferten Deployments**: es listet alle sieben
Flächen namentlich (`/api/projects/[id]/construction-defects`, `…/[did]`, `…/[did]/events`,
`…/[did]/status`, `…/summary`, `/projects/[id]/maengel`, `/projects/[id]/maengelanzeige/print`).

### Gates auf dem gemergten `main`-Stand

| Gate | Ergebnis |
|---|---|
| `npx eslint .` | **0** (Exit 0) |
| `npx tsc --noEmit` (nach `rm -rf .next`) | **13 = Baseline, 0 neu** |
| `npx vitest run` | **3240/3240** (395 Dateien) |
| `npm run build` | clean; alle **7** Flächen im Routen-Manifest registriert |
| `npm run check:migration-naming` | **0 Fehler** (218 Migrationen, 90 Bestands-Warnungen) |
| `npm run check:index-scope` | **0 Fehler** (1 Warnung: 117 Altzeilen ohne Klassifikation — die von PROJ-145 bewusst sichtbar gehaltene Buchführungsschuld) |

### Befund aus diesem Schritt

**D-45β-DEPLOY-1 (Dokumentationsfehler, hier behoben) — die Migration erzeugt fünf Trigger, nicht
sechs.** Die `/backend`-Notiz führte „Zwei Tabellen, acht Funktionen, **sechs** Trigger". In Prod
stehen **5** nicht-interne Trigger auf den beiden Tabellen, und die Migrationsdatei enthält genau
**5** `create trigger`-Anweisungen; ihr eigener Post-Condition-Block prüft vier davon namentlich. Die
Zahl war nie irgendwo geprüft — dieselbe Klasse wie F-1 aus `/qa`, wo ein Vektor die Marke von
AC-45β.12 trug, ohne sie zu belegen. Kein Produktfehler und keine fehlende Absicherung: alle fünf
Trigger sind vorhanden und aktiv, die Zahl in der Notiz war falsch. Auf **fünf** korrigiert statt
stehen gelassen.

### Was offen bleibt

- **AC-45β.18** — überfällige Mängel in der Engpass-Sicht (PROJ-103). Zurückgestellte
  **ursprüngliche** Anforderung, Ziel **PROJ-45-δ**, mit Quell-AC und der bereits erhobenen
  Vorarbeit in `features/OPEN-DEFERRED-STATUS.md` geführt. Der Grund, dass β **nicht** `full` ist.
- **PROJ-45-γ** (Abnahmen), **PROJ-45-δ** (Terminsignale), **PROJ-45-ε** (Fotodokumentation) —
  zurückgestellte Original-Stories der Erstfassung.
- **PROJ-Y-45d** (Low, aus β) — die Gewerk-Auswahlliste kippt von unkontrolliert auf kontrolliert;
  Konsolenlärm, keine Fehlfunktion.
- **PROJ-Y-45e** (Info, cross-cutting) — `audit_lifecycle_exempt` deckt den **Feld**-Audit nicht ab;
  ein committender Durchlauf über die Zustandsmaschine lässt den append-only Trail wachsen und braucht
  bis zur Klärung einen manuellen Nachlauf.
- **PROJ-Y-45b** (aus α) — der rohe 500-Pfad der beiden Entfernen-Routen bleibt für *künftige*
  Verweise bestehen; β hat ihn nur für Mängel auf 409 gebracht.
- **PROJ-Y-45c** (cross-cutting, in β belegt) — Prod/Repo-Divergenz bei `_project_teardown_active()`.

---

## Deployment — α (2026-08-14)

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
