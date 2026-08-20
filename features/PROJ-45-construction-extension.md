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
> **γ ist abgenommen (`/qa` PASS 2026-08-20, 0 Critical / 0 High / 0 Medium) und nicht deployed.**
> Anforderungen, Tech Design, `/backend`-, `/frontend`- und QA-Notizen stehen weiter unten, Status
> dort **Approved**. 29/29 AC, **12/12** Härtungskriterien. Datenschicht seit 2026-08-19 in Prod,
> Oberfläche seit 2026-08-20; γ-Pentest **60/60**, Rot-Team **11/11**, authentifizierte Kette
> **3× 3/3** inkl. echtem PDF-Druck, Regressionen α 18/18 · PROJ-Y-45a 9/9 · PROJ-103 7/7 ·
> β **53/53** (im QA-Lauf 52/53; PROJ-Y-148d hat Vektor `Z` inzwischen umgedreht, auf dem
> Deploy-Stand wörtlich grün nachgemessen), **0 Rückstände** über 14 Zähler. Die Zeile in
> `features/INDEX.md` bleibt unverändert `Deployed` / `alpha`: γ ändert die **gelieferte** Grenze
> erst mit `/deploy`.
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

**Status: Approved** (2026-08-20) · dritter Sub-Slice, baut auf dem deployten α (Gewerke +
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
- [ ] **AC-45γ.24** *(korrigiert im Tech Design, D-γ2)* An eine Abnahme lässt sich **ein** Beleg hängen: entweder eine externe Adresse **oder** ein vorhandener Dokumentknoten aus dem DMS (PROJ-79) — nicht beides nebeneinander. Die Ablage ist eine **eigene Bau-Tabelle**, nicht die geteilte Verknüpfung aus PROJ-115; wiederverwendet wird deren **Adressprüfung** (Statik, kein Server-Abruf), also die Stelle, an der die Sicherheitslogik sitzt.
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
