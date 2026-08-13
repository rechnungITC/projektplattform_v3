# PROJ-45: Construction Extension — Gewerke & Bauabschnitte

## Status: Architected
## Deployment Scope: —

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
- [ ] **AC-45.1** Ein Administrator kann Gewerke anlegen, umbenennen, deaktivieren und sortieren; jedes trägt eine mandantenweit eindeutige Kennung und eine Bezeichnung.
- [ ] **AC-45.2** Nicht-Administratoren sehen den Katalog, können ihn aber nicht ändern; der Schreibversuch wird serverseitig abgewiesen, nicht nur in der Oberfläche ausgeblendet.
- [ ] **AC-45.3** Ein Gewerk, das in mindestens einem Projekt zugeordnet ist, lässt sich **nicht löschen**; die Fehlermeldung benennt die betroffenen Projekte und verweist auf „deaktivieren" (L7).
- [ ] **AC-45.4** Ein deaktiviertes Gewerk verschwindet aus der Auswahl neuer Zuordnungen, bleibt aber in bestehenden Projekten sichtbar und ausgewertet.
- [ ] **AC-45.5** Eine Umbenennung im Katalog wirkt sofort in allen Projekten (L7) — es wird kein Name in die Projektzuordnung kopiert.
- [ ] **AC-45.6** Der Katalog ist mandantengetrennt: ein fremder Mandant sieht ihn nicht und kann nicht darauf verweisen.

### ST-45.2 — Gewerke einem Bauprojekt zuordnen
Als **Bauleiter** möchte ich die für mein Projekt zutreffenden Gewerke auswählen und je Gewerk
Verantwortung, ausführenden Nachunternehmer und eine Ampel führen, damit die Lage auf einen Blick
lesbar ist.

**Akzeptanzkriterien**
- [ ] **AC-45.7** Ein Projekt-Gewerk trägt: Verweis auf den Katalogeintrag, verantwortliche Person, optionalen Nachunternehmer aus PROJ-15, Ampel (`gruen` · `gelb` · `rot`, Vorgabe `gruen`), optionale Notiz (L8).
- [ ] **AC-45.8** Die Ampel wird **manuell** gesetzt und nie automatisch überschrieben (L8).
- [ ] **AC-45.9** Dasselbe Katalog-Gewerk kann einem Projekt nur **einmal** zugeordnet werden.
- [ ] **AC-45.10** Zuordnen, Ändern und Entfernen ist auf Projektleitung und Mandanten-Administration beschränkt; Betrachter sehen die Liste unverändert lesend.
- [ ] **AC-45.11** Änderungen an Verantwortlichem, Nachunternehmer und Ampel sind im Feld-Audit (PROJ-10) nachvollziehbar.

### ST-45.3 — Bauabschnitte gliedern
Als **Bauleiter** möchte ich das Bauvorhaben räumlich mehrstufig gliedern (Bauteil → Geschoss →
Einheit), damit Arbeit dort verortet werden kann, wo sie stattfindet.

**Akzeptanzkriterien**
- [ ] **AC-45.12** Bauabschnitte sind je Projekt frei tief schachtelbar (Selbstverweis) und als Baum darstellbar (L5).
- [ ] **AC-45.13** Ein Abschnitt kann umbenannt, verschoben (Elternwechsel) und gelöscht werden; die Reihenfolge unter einem Elternknoten ist bestimmbar.
- [ ] **AC-45.14** Ein Abschnitt kann nicht sein eigener Vorfahre werden — der Zyklus wird serverseitig abgewiesen.
- [ ] **AC-45.15** Beim Löschen eines Abschnitts mit Unterabschnitten wird die Folge vorher benannt und bestätigt; verwaiste Unterabschnitte entstehen nicht.
- [ ] **AC-45.16** Bauabschnitte sind projekt- und mandantengetrennt.

### ST-45.4 — Arbeit auf beiden Achsen verorten
Als **Bauleiter** möchte ich Arbeitspakete, Phasen und Risiken einem Gewerk und einem Bauabschnitt
zuordnen, damit „Elektro-Grobinstallation in Haus A, 2. OG" als Filter existiert und nicht nur im
Titel steht.

**Akzeptanzkriterien**
- [ ] **AC-45.17** Ein Arbeitspaket (`work_items`) kann je einem Gewerk und einem Bauabschnitt zugeordnet werden; beide Angaben sind optional (L6).
- [ ] **AC-45.18** Eine Phase kann mit mehreren Bauabschnitten verknüpft werden und ein Abschnitt mit mehreren Phasen (M:N, L6).
- [ ] **AC-45.19** Ein Risiko kann einem Gewerk zugeordnet werden (L6).
- [ ] **AC-45.20** Die Arbeitspaket-Liste ist serverseitig nach Gewerk und nach Bauabschnitt filterbar; ein Abschnittsfilter schließt dessen Unterabschnitte ein.
- [ ] **AC-45.21** Alle Verknüpfungen sind **additiv**: ohne Bau-Modul und außerhalb von Bauprojekten verhält sich der Kern unverändert — nachzuweisen durch eine grüne Regression der bestehenden Work-Item-, Phasen- und Risiko-Tests.
- [ ] **AC-45.22** Wird ein Gewerk aus dem Projekt entfernt oder ein Abschnitt gelöscht, verlieren die verknüpften Objekte nur den Verweis; kein Arbeitspaket, keine Phase und kein Risiko wird gelöscht.

### ST-45.5 — Sichtbarkeit nur dort, wo sie hingehört
Als **Mandanten-Administrator** möchte ich, dass Bau-Funktionen ausschließlich in Bauprojekten und nur
bei aktivem Modul erscheinen, damit ERP-, Software- und M&A-Projekte unverändert bleiben.

**Akzeptanzkriterien**
- [ ] **AC-45.23** Die Bau-Navigation erscheint nur bei `project_type = "construction"` **und** aktivem Bau-Modul; sie ist über `active_modules` abschaltbar.
- [ ] **AC-45.24** Bei abgeschaltetem Modul antwortet der Server auf die Bau-Endpunkte gleichbleibend abweisend, ohne die Existenz der Fläche zu verraten — und die Oberfläche zeigt den neutralen „nicht aktiv"-Hinweis aus PROJ-Y-143f, **nicht** einen Leerzustand und **nicht** eine Fehlermeldung.
- [ ] **AC-45.25** Das `construction`-Profil im Katalog (PROJ-6) verliert seinen Platzhalter-Status und benennt die Bau-Module.
- [ ] **AC-45.26** Bestehende Projekte anderer Typen zeigen keine Bau-Elemente; nachzuweisen an einem ERP- und einem M&A-Projekt.

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
| **Q1** Standard-Gewerke vorbefüllen? | **Ja**, VOB/C-nahe Standardliste als Lazy-Seed beim ersten Katalogaufruf; alles umbenennbar und deaktivierbar. | Nutzer-Entscheid. Muster: `seed_risk_categories_if_empty` (PROJ-107), `ensure_default_ma_project_templates` (PROJ-96). In Produktion existieren bereits 3 Bauprojekte — ein leerer Katalog wäre der erste Eindruck. |
| **Q2** `workstreams` generalisieren? | **Nein — spiegeln (Option B).** Eigene Bau-Tabellen nach dem PROJ-112/102-Rezept. | CIA-Review 2026-08-13, Nutzer bestätigt. Tragender Grund unten. |
| **Q3** Matrix Gewerk × Abschnitt? | **Später.** α liefert zwei Achsen + Filter; die Kreuzansicht wird erst mit Mängeln (β) und Abnahmen (γ) inhaltsvoll. | Nutzer-Entscheid. Reine Darstellung, nachlegbar ohne Modelländerung. |
| **Q4** Modulschnitt | **Ein Schalter `construction`** für die ganze Extension. | Nutzer-Entscheid, CIA-konform: feinere Schalter erzeugen Kombinationen, die weder Test noch QA vollständig abdecken. |

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
_To be added by /qa_

## Deployment
_To be added by /deploy_
