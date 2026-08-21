---
id: PROJ-122
title: "SPA Issues List und Vertragsverhandlungspunkte"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-j", "mvp"]
dependencies: ["G3", "I2", "J2", "F1", "L2", "L3"]
roles: ["Legal Counsel", "Deal Lead", "CFO / Finance Lead", "Externe M&A-Berater", "Executive Sponsor"]
summary_for_jira: "[J1] SPA Issues List und Vertragsverhandlungspunkte"
---

# PROJ-122: SPA Issues List und Vertragsverhandlungspunkte

## Status: Deployed (2026-08-11)
## Deployment Scope: mvp

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** **AC-3 ⚠ teilweise** — Finding- und Risiko-Verknüpfung gebaut, Kaufpreis-Bridge (PROJ-121) und Closing Conditions (PROJ-123) sind `Planned` und daher nicht verknüpfbar (D-3 → PROJ-Y-122a). AC-1/2/4/5 ✅ + H1–H9 9/9, Pentest A–Z 26/26.

**Deployed:** 2026-08-11 — Closure-Deploy, Tag `v2.41.0-PROJ-122`. Code lag bereits auf main (Merge `481a5a7`, PR #303), beide Migrationen seit `/backend` in Prod → kein Runtime-Deploy nötig (Vercel deployt automatisch von main). Verifiziert auf main `265cccb`: ESLint 0 · `npm run build` clean · `check:migration-naming` 0 Errors · Post-Deploy-Smoke gegen Prod: alle neuen Flächen 307 Auth-Gate, kein Leck.
**Nachtrag PROJ-Y-122a:** die Audit-Anchor-Patches dieser Migration (Z. 119–144) liefen ohne Verifikation nach dem `replace()`; nachgerüstet durch die Reconcile-Migration `20260811090000` (PROJ-Y-122a, Tag `v2.40.0`) samt Live-Smoke. Kein Eingriff in diese Datei — sie ist geshippt.
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic J — Vertrag, Signing & Closing)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (an PROJ-20 Open-Items denkbar). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** J — Vertrag, Signing & Closing  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-j` · `mvp`  
> **Abhängigkeiten:** `G3`, `I2`, `J2`, `F1`, `L2`, `L3`

**User Story:**

Als Legal Counsel möchte ich offene Vertrags- und Verhandlungspunkte (SPA Issues List) strukturiert führen, Positionen beider Seiten dokumentieren und Verhandlungsfortschritte verfolgen, damit die Vertragsverhandlung diszipliniert und nachvollziehbar geführt wird.

**Beschreibung / Kontext:**

Phase 7 (Vertragsverhandlung) verlangt das Pflichtartefakt 'SPA Issues List'. Die Plattform muss diese Liste als strukturierten, versionierbaren Bestandteil führen, der mit Findings (G3), Kaufpreislogik (I2) und Closing Conditions (J2) verzahnt ist.

**Akzeptanzkriterien:**

- [ ] Pro Issue können Titel, Klauselbezug (SPA-Abschnitt), eigene Position, Gegenposition, Verhandlungsstand, Risiko bei Nichteinigung, empfohlene Lösung erfasst werden.
- [ ] Issues haben einen Status (offen, in Verhandlung, geeinigt, eskaliert, geschlossen).
- [ ] Issues können mit Findings (G3), Garantien/Freistellungen, Kaufpreis-Bridge (I2) und Closing Conditions (J2) verknüpft werden.
- [ ] Vor Stage-Gate 6 (Signing) wird automatisch ein Hinweis erzeugt, wenn noch Issues im Status 'offen' oder 'eskaliert' bestehen.
- [ ] Vertraulichkeit folgt L2 (typischerweise 'Inner Circle').

**Abgrenzungen (Out of Scope):**

- Keine Vertragstext-Bearbeitung; SPA selbst wird außerhalb der Plattform redigiert.
- Keine automatische Klauselgenerierung.

**Offene Fragen:**

- Sollen Issues auf Klausel-Ebene verlinkt werden (z. B. Verweis auf konkrete Klausel-ID im Vertragsentwurf)?
- Wird eine Schnittstelle zu Vertrags-Management-Tools (CLM) angestrebt?

**Definition of Ready:**

- [ ] Datenmodell und Statusmodell sind mit Legal abgestimmt.
- [ ] Inner-Circle-Sichtbarkeitsregeln sind dokumentiert.

**Definition of Done:**

- [ ] Issue-Liste kann erfasst, verknüpft, gefiltert und exportiert werden.
- [ ] Hinweis bei offenen Issues an Stage-Gate 6 ist getestet.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- G3
- I2
- J2
- F1
- L2
- L3

**Betroffene Rollen:**

- Legal Counsel
- Deal Lead
- CFO / Finance Lead
- Externe M&A-Berater
- Executive Sponsor

---

## Tech Design (Solution Architect)

**Erstellt:** 2026-08-07 · **CIA-reviewed:** ja (6 Forks, Verdikt „Umsetzen mit ADJUST")

### 1. Reuse-Prüfung — warum eine neue Tabelle

Die ADR klassifiziert PROJ-122 als **EXTEND**. Vor dem Neubau wurden alle fünf Kandidaten geprüft; jeder scheitert an einem harten Punkt:

| Kandidat | Warum es nicht trägt |
|---|---|
| `work_items` (PROJ-9) | Die erlaubten Arten sind fest verdrahtet (`epic … work_package`) und werden von den KI-Backlog-Routinen je Projektmethode einzeln aufgezählt. Die SPA-Felder müssten in ein freies JSON-Feld, das der Feld-Audit **nicht** mitschreibt — die DoD „Audit-Trail aktiv" wäre nur scheinbar erfüllt. Auch das Statusmodell passt nicht. |
| `decisions` (PROJ-20/111) | Bewusst unveränderlich: außer einem Revisions-Flag lässt sich kein Feld mehr ändern. Ein Verhandlungspunkt lebt aber genau davon, dass sich Positionen und Stand fortlaufend ändern. Jede Änderung erzwänge eine neue Zeile — das Entscheidungslog würde unbrauchbar. |
| `risks` (PROJ-20/107) | Modelliert Eintrittswahrscheinlichkeit × Auswirkung einer Gefahr. Kein Platz für zwei gegenüberstehende Verhandlungspositionen, kein passender Statuslebenszyklus. |
| `dd_findings` (PROJ-114) | Hängt zwingend an einem Due-Diligence-Stream. SPA-Punkte entstehen in der Vertragsphase, oft nachdem die DD-Streams geschlossen sind. |
| `open_items` (PROJ-20) | Leichtgewichtiger Sammelkorb **ohne Vertraulichkeitsstufe** — AC5 (Need-to-know) wäre strukturell unerfüllbar. Er ist der natürliche *Zulieferer*, nicht der Wirt. |

**Ergebnis:** eigene Tabelle `spa_issues`, gebaut exakt nach dem etablierten M&A-Rezept (`dd_findings`), damit sie sich in Vertraulichkeit, Audit und Schreibpfad wie die übrigen M&A-Objekte verhält.

### 2. Was gespeichert wird (Klartext)

**Ein SPA-Issue besteht aus:**
- fortlaufender **Nummer** je Projekt (I-1, I-2 …) — Legal referenziert Punkte in Verhandlungsrunden über eine stabile Nummer
- **Titel** und **Klauselbezug** (z. B. „§ 8.2 Garantien") als Freitext
- **eigene Position**, **Gegenposition**, **empfohlene Lösung**, **Risiko bei Nichteinigung** — vier Langtextfelder
- **Verhandlungsstand**: offen · in Verhandlung · geeinigt · eskaliert · geschlossen
- **Kategorie** (Garantie, Freistellung, Kaufpreis, Haftung, Bedingung, Sonstiges) — deckt „Garantien/Freistellungen" aus AC3 als Klassifizierung ab
- **Wichtigkeit** (niedrig/mittel/hoch/kritisch), **Verantwortlicher**, **Frist**
- **Verknüpfungen**: auf ein DD-Finding und auf ein Risiko
- **Vertraulichkeitsstufe** (Standard/Vertraulich/Streng)

**Nicht gespeichert:** Vertragstext, Klauselinhalte, Redlines (bewusst außerhalb der Plattform — siehe Out-of-Scope der Spec). Dokumente werden nur *verlinkt*.

### 3. Komponenten-Struktur

```
Projektraum (M&A-Projekt)
+-- Sidebar: neuer Eintrag "SPA Issues"
    +-- Seite: SPA Issues List
        +-- Kopfzeile: Zusammenfassung (offen / in Verhandlung / eskaliert / geeinigt)
        |   +-- Warnhinweis, wenn offene ODER eskalierte Punkte existieren
        +-- Filterleiste (Status · Kategorie · Wichtigkeit · Verantwortlicher · Volltext)
        +-- CSV-Export-Knopf
        +-- Tabelle der Issues
        |   +-- Nr · Titel · Klausel · Kategorie · Status · Wichtigkeit · Frist · Vertraulichkeit
        |   +-- Zeilenaktion: Bearbeiten (nur mit Schreibrecht)
        +-- Dialog "Issue anlegen / bearbeiten"
            +-- Grunddaten · beide Positionen · Lösung/Risiko
            +-- Verknüpfungen (DD-Finding, Risiko)
            +-- Abschnitt "Externe Dokumente" (Wiederverwendung PROJ-115)

Stage-Gates-Seite (bestehend, PROJ-110)
+-- Pre-Read je Gate
    +-- NEUE Zeile: "Offene SPA-Issues"
    +-- NEUER Hinweisblock ab Gate 7 (SPA-Verhandlung) / Gate 8 (Signing)
```

### 4. Entscheidungen und Begründung (CIA-Verdikte)

**D1 — Das richtige Stage-Gate (Spec-Korrektur, blockierend).**
Die AC nennt „Stage-Gate 6 (Signing)". Das deployte Gate-Preset kennt aber: Gate 6 = *Bewertung & verbindliches Angebot*, Gate 7 = *SPA / Vertragsverhandlung*, **Gate 8 = Signing**. Die Spec-Angabe ist in Nummer *und* Bezeichnung falsch. Fachlich gemeint ist **Signing = Gate 8**.
Umsetzung: Der Zähler wird **für jedes Gate** ermittelt (kein fest verdrahteter Gate-Schlüssel in der Datenbank), weil die Gate-Schlüssel beim Projektstart kopiert werden und pro Mandant abweichen können. Die besondere Hervorhebung passiert in der Oberfläche ab Gate-Reihenfolge 7 — damit ist der Hinweis auch für die Verhandlungs-Freigabe selbst nutzbar und bleibt robust, wenn ein Mandant seine Gates umbenennt.

**D2 — Hinweis, nicht Blockade.**
Der bestehende Pre-Read liefert bereits ein Sammel-Flag „blockierende Bereitschaft". Das neue Signal wird bewusst **nicht** in dieses Flag gefaltet: Die AC verlangt einen *Hinweis*, keine Sperre; das Flag ist an einen fest verdrahteten Oberflächentext gebunden („offene Risiken ohne Maßnahme oder Red-Flags"), der durch eine stille Erweiterung inhaltlich falsch würde. Der SPA-Hinweis bekommt einen eigenen, ehrlichen Text. Die Gate-Freigabe wertet den Pre-Read ohnehin nicht aus — sie bleibt unverändert.

**D3 — Vertraulichkeit: „Inner Circle" ist ein Sprachbild, kein neuer Wert.**
Die Skala kennt Standard/Vertraulich/Streng; ein Wert „Inner Circle" wird **nicht** ergänzt. Der Datenbank-Standardwert bleibt „Standard" (Hausnorm aller M&A-Tabellen), aber Erfassungsmaske und Schreib-Routine belegen **„Vertraulich" vor**. Grund: Ein harter Datenbank-Standard auf „Vertraulich" würde Legal-Nutzer ohne Freigabe aus ihren eigenen, gerade angelegten Einträgen aussperren — sie „verschwänden" sofort nach dem Speichern. Den eigentlichen Schutz liefert nicht der Vorgabewert, sondern die Freigabe-Prüfung auf dem Schreibpfad (D5).

**D4 — Nur baubare Verknüpfungen.**
Kaufpreis-Bridge (PROJ-121) und Closing Conditions (PROJ-123) sind beide noch *Planned* — es gibt dafür keine Tabellen. Gebaut werden jetzt die Verknüpfungen zu **DD-Finding** und **Risiko**. Die beiden fehlenden Verweise werden später als zusätzliche, optionale Verweisfelder ergänzt; das ist eine additive Erweiterung ohne Umbau. Bewusst **kein** Vorrats-Verweismodell mit Platzhalter-Zieltypen: Solche Ziele lassen sich nicht prüfen und würden PROJ-121/123 die Modellfreiheit nehmen. → Followup **PROJ-Y-122a**.

**D5 — Schreiben nur über geprüfte Datenbank-Routinen.**
Die Tabelle bekommt **keine** Schreibrechte-Regeln; jedes Anlegen/Ändern läuft über gesicherte Routinen, die vor dem Schreiben Rolle *und* Vertraulichkeitsfreigabe prüfen. Das verhindert, dass jemand ein Issue auf eine Stufe hebt, für die er selbst keine Freigabe hat (Selbst-Ausschluss bei gleichzeitigem Zähler-Leck). Es folgt dem `dd_findings`-Vorbild und umgeht die im Repo bekannte Fehleranfälligkeit von Schreib-Regeln (offener Punkt PROJ-Y-107c). Der Statuswechsel bekommt eine eigene Routine (Hausnorm `transition_*`).

**D6 — Dokument-Verlinkung ja, Risiko-Verweisliste nein.**
Der bestehende Mechanismus für externe Dokumentverweise wird um den Typ „SPA-Issue" erweitert — ohne ihn bliebe der Klauselbezug ohne Beleg (Vertragsentwürfe/Redlines liegen im Datenraum). Die *zusätzliche* Aufnahme in die Risiko-Verweisliste unterbleibt: Sie wäre doppelt zum direkten Risiko-Verweis und öffnet einen bekannten Rückschluss-Kanal auf vertrauliche Legal-Daten (offener Punkt PROJ-Y-107b). → Followup **PROJ-Y-122b**.

### 5. Zusätzliche Pflicht-Akzeptanzkriterien (Härtung, aus CIA)

- [ ] **AC-122-H1** Spec-Korrektur: Signing = Gate 8. Das Signal ist gate-schlüssel-unabhängig; die Hervorhebung erfolgt ab Gate-Reihenfolge 7.
- [ ] **AC-122-H2** Die Pre-Read-Routine wird **aus ihrer Live-Definition heraus** erweitert (Anker-Ersetzung), nicht als Volltext überschrieben. Platzhalter „Pflicht-Deliverables" und die Bedeutung des Blockade-Flags bleiben unverändert. Ausführungsrecht danach erneut vergeben. Migration idempotent.
- [ ] **AC-122-H3** Keine Schreib-Regeln auf der Tabelle; Schreiben ausschließlich über gesicherte Routinen; anonymer Zugriff entzogen.
- [ ] **AC-122-H4** Jede schreibende Routine prüft die Vertraulichkeitsfreigabe **vor** dem Schreiben — Selbst-Hochstufung ausgeschlossen.
- [ ] **AC-122-H5** Datenbank-Standard „Standard", Vorbelegung „Vertraulich"; Skala nicht erweitert; „Inner Circle" als Abweichung dokumentiert.
- [ ] **AC-122-H6** Audit-Verdrahtung per Anker-Ersetzung aus der Live-Definition; Zweige paralleler Slices bleiben erhalten; Leserecht danach erneut vergeben.
- [ ] **AC-122-H7** Live-Sicherheitstest inkl. **Summen-Leck-Probe**: Ein Mitglied ohne Freigabe sieht im Pre-Read „0" für vertrauliche Issues. Mandantentrennung geprüft, keine Testdatenreste.
- [ ] **AC-122-H8** Bestehende Sicherheitstests von PROJ-110 und PROJ-115 laufen unverändert grün nach.
- [ ] **AC-122-H9** CSV-Export läuft serverseitig unter den Rechten des Aufrufers und entschärft Formel-Einschleusung.

### 6. Abhängigkeiten (Pakete)

**Keine.** Kein neues npm-Paket. Alles baut auf vorhandenen Bausteinen auf (Oberflächen-Bibliothek, Datenbank-Hilfsfunktionen, CSV-Muster aus bestehenden Exporten).

### 7. Migration

Eine Migration im zugewiesenen Versionsfenster `20260807 11xxxx`, die ausschließlich eigene Objekte anlegt und die drei geteilten Flächen (Audit-Verdrahtung, Pre-Read, Dokumentverweis-Auflöser) nur additiv per Anker-Ersetzung anfasst.

### 8. Bewusste Abgrenzungen

- Keine Klausel-Ebenen-Verknüpfung in den Vertragsentwurf (offene Frage der Spec) — Klauselbezug bleibt Freitext + Dokumentverweis.
- Keine CLM-Schnittstelle (offene Frage der Spec) — nicht im MVP.
- Garantien/Freistellungen als eigenständige Objekte → Followup **PROJ-Y-122c**; hier zunächst als Kategorie abgebildet.
- Versionierung einzelner Verhandlungsrunden: über den Feld-Audit abgedeckt, keine eigene Runden-Historie.

---

## Implementation Notes

**Slice gebaut 2026-08-07/08** (Branch `proj-122/spa-issues-list`, worktree `pv3-proj122`).

### Gebaute Flächen

**Datenbank** — 2 Migrationen:
- `20260807110000_proj122_spa_issues.sql` (prod-registriert als `20260808142651` / `proj122_spa_issues`)
  — Tabelle `spa_issues` (21 Spalten, 6 Indizes, `unique(project_id, issue_number)`); 2 SELECT-Policies
  (permissiv `is_project_member` + RESTRICTIVE `can_access_classified`), **keine** Write-Policies;
  `moddatetime` + `record_audit_changes` Trigger; Audit-Trio per Anchor-Replace erweitert (14 getrackte
  Spalten) + `can_read_audit_entry`-Grant erneuert; 4 RPCs (`create_spa_issue`, `update_spa_issue`,
  `transition_spa_issue_status` als SECURITY DEFINER, `spa_issues_summary` als **SECURITY INVOKER**);
  `stage_gate_prereadiness` additiv um `open_spa_issues` erweitert; `external_document_links` um den
  5. Typ `spa_issue` erweitert (CHECK + Resolver + Cleanup-Trigger).
- `20260807111000_proj122_spa_issue_clear_semantics.sql` (prod: `proj122_spa_issue_clear_semantics`)
  — Fix, siehe „In QA gefundener Defekt" unten.

**API** — 6 Routen unter `/api/projects/[id]/spa-issues` (GET Liste mit 4 Server-Filtern, POST create,
PATCH update, POST `/status`, GET `/summary`, GET `/export` CSV) + `_schema.ts` (Zod).

**Frontend** — Nav-Section „SPA Issues" (`tabPath: spa-issues`, `requiresProjectType: ma`, nach
DD-Bericht), Route, `spa-issues-page.tsx` (Tabelle + 3 Filter + Inline-Statuswechsel + Offen-Banner +
CSV-Button), `spa-issue-dialog.tsx` (Create/Edit + eingebettete PROJ-115-Dokumentlinks),
`spa-issue-labels.ts`, `use-spa-issues.ts`, `spa-issues-api.ts`.
**Stage-Gate-Integration:** neue Pre-Read-Zeile „Offene SPA-Issues" + eigener Hinweisblock ab
Gate-Reihenfolge ≥ 7.

### In QA gefundener Defekt (selbst gefunden, behoben, live nachgewiesen)

**D-1 (wäre MEDIUM):** `update_spa_issue` nutzte `coalesce(p_x, x)` für **alle** optionalen Textfelder,
während die Oberfläche für ein geleertes Feld `null` sendet. Ergebnis: Klauselbezug, eigene Position,
Gegenposition, empfohlene Lösung und Risiko-Text ließen sich **nie löschen** — der alte Text überlebte
das Speichern stillschweigend und wurde beim erneuten Öffnen wieder angezeigt. Auf einem
Verhandlungsobjekt ist das aktiv irreführend: eine zurückgezogene Position läse sich weiter als aktuell.
**Fix:** eindeutiges Sentinel für Textspalten — `NULL` = „nicht übergeben, Wert behalten", `''` = „explizit
leeren". `create_spa_issue` normalisiert `''` beim Anlegen zu `NULL`, sodass nie ein Leerstring gespeichert
wird. Live gegen Prod bewiesen (4/4, rolled back) + Regressionstest in der Route-Testsuite.

### Bewusste Deviations

- **D-2 (AC-4, Spec-Korrektur):** Die AC nennt „Stage-Gate 6 (Signing)". Das deployte Gate-Preset hat
  `gate_6` = Bewertung/verbindliches Angebot, `gate_7` = SPA/Vertragsverhandlung, **`gate_8` = Signing** —
  die Spec-Angabe ist in Nummer *und* Bezeichnung falsch. Umgesetzt: Zähler gate-schlüssel-**unabhängig**
  (Schlüssel werden pro Projekt kopiert und können je Mandant abweichen), Hervorhebung in der Oberfläche
  ab Reihenfolge ≥ 7.
- **D-3 (AC-3, teilweise):** Verknüpfung zu DD-Finding und Risiko gebaut. Kaufpreis-Bridge (PROJ-121) und
  Closing Conditions (PROJ-123) sind beide noch *Planned* — es gibt keine Tabellen. Nachrüstung als
  additive optionale Verweisfelder → **PROJ-Y-122a**. Garantien/Freistellungen sind als Kategorie
  abgebildet, nicht als eigene Objekte → **PROJ-Y-122c**.
- **D-4 (Schreibrecht):** Anlegen/Ändern ist für Tenant-Admin **oder** Projekt-Lead **oder** Projekt-Editor
  offen, nicht nur für Manager wie bei `dd_findings`. Grund: Legal Counsel — die Rolle, der das Artefakt
  gehört — ist typischerweise Editor, ein reines Manager-Gate hätte das Feature für seinen Hauptnutzer
  unbrauchbar gemacht. Viewer bleiben read-only (live geprüft, Fälle D + U).
- **D-5 (AC-5):** „Inner Circle" ist ein Sprachbild der Spec, kein fehlender Skalenwert. Die Skala
  (Standard/Vertraulich/Streng) wurde **nicht** erweitert; DB-Standard bleibt `standard`, Vorbelegung in
  RPC und Maske ist `confidential`.
- **D-6:** `risk_links` wurde bewusst **nicht** um `spa_issue` erweitert (redundant zur direkten
  Risiko-Verknüpfung und öffnet einen bekannten Rückschluss-Kanal, PROJ-Y-107b) → **PROJ-Y-122b**.
- **D-7 (Umgebung):** Mobile Safari übersprungen (fehlende WebKit-Host-Bibliotheken, PROJ-67/F-2).
- **D-8 (Migrations-Versionsdrift):** MCP registrierte `20260808142651` statt des Repo-Dateinamens
  `20260807110000`. Benigne — die Migration ist durchgängig idempotent (`create table if not exists`,
  `create or replace`, guarded do-Blöcke), bricht also `supabase db push` nicht; Präzedenzfälle
  PROJ-109/131/132/106. PROJ-134-Domäne.

## QA Test Results

**Datum:** 2026-08-08 · **Ergebnis: PASS — 0 Critical / 0 High → Approved**

### Akzeptanzkriterien

| AC | Ergebnis | Nachweis |
|----|----------|----------|
| AC-1 Felder je Issue | ✅ | Alle 7 Spec-Felder als typisierte Spalten; Pentest A |
| AC-2 Statusmodell (5 Werte) | ✅ | CHECK + `transition_*`-RPC; Pentest N/O (ungültig → 23514) |
| AC-3 Verknüpfungen | ⚠️ teilweise | Finding + Risiko gebaut (Pentest Q); I2/J2 nicht baubar → D-3 |
| AC-4 Hinweis vor Signing-Gate | ✅ | `open_spa_issues` im Pre-Read + UI-Block ab Gate ≥ 7; Pentest J |
| AC-5 Vertraulichkeit nach L2 | ✅ | RESTRICTIVE-Gate; Pentest F/H/V/W |
| DoD erfassen/verknüpfen/filtern/exportieren | ✅ | 4 Server-Filter + CSV-Route (Playwright 6) |
| DoD Audit-Trail aktiv | ✅ | 14 getrackte Spalten; Pentest P (2 Audit-Zeilen) |
| AC-122-H1 … H9 (Härtung) | ✅ 9/9 | siehe Pentest + Advisors unten |

### Live-Pentest (gegen Prod, rolled back)

`tests/sql/PROJ-122-spa-issues-pentest.sql` — **A–Z 26/26 PASS, 0 Residue** (7 Tabellen geprüft).
Kern-Nachweise:
- **Zwei Aggregat-Leck-Proben:** Mitglied ohne Freigabe sieht in `spa_issues_summary` **1** statt 4 (I)
  **und** im Stage-Gate-Pre-Read `open_spa_issues = 1` statt 4 (J) — vertrauliche Punkte lassen sich also
  auch nicht über Zähler erschließen.
- **Keine Selbst-Hochstufung** auf beiden Schreibpfaden: create (F) und update (W) → 42501.
- **Kein Bearbeiten ohne Lesefreigabe** (V), **Viewer read-only** bei create (D) und Status (U).
- **Schreiben nur über RPC:** direktes INSERT abgewiesen (L), direktes UPDATE trifft 0 Zeilen (M).
- **Mandantentrennung:** 0 Zeilen (K) und UPDATE per Fremd-ID blockiert (X).
- **Regression:** PROJ-110-Pre-Read behält alle Ursprungsschlüssel und sein Blockade-Flag bleibt `false`
  (T); PROJ-115-Dokumentlink am SPA-Issue funktioniert und ist gegated (S).

### Automatisierte Tests

| Gate | Ergebnis |
|------|----------|
| ESLint | **0 Fehler** |
| TypeScript | **13** — exakt Baseline, 0 neu |
| Vitest | **2630/2630** (340 Dateien; +25 gegenüber Baseline 2605) |
| Build | clean, alle 6 Routen registriert |
| `check:migration-naming` | **0 Fehler** (188 Migrationen) |
| Supabase-Advisors | **0 ERROR** (3 neue WARN = etablierter SECURITY-DEFINER-Standard, 121 gleichartige Bestandsfälle) |
| Playwright (chromium) | **8/8** — alle 5 API-Routen + Seite auth-gated, CSV-Route gibt anonym keinen CSV-Body |

### Nicht-Regression auf geteilten Flächen (parallele Slices)

Während des Baus landete PROJ-120 `ma_valuation` in denselben geteilten Objekten. Nach meiner Migration
verifiziert: `external_document_links`-CHECK trägt **6** Werte (inkl. `ma_valuation` **und** `spa_issue`);
alle **7** Zweige des Resolvers `external_link_parent_ctx` (inkl. `ma_valuation` und Unknown-Fallback)
parsen und liefern korrekt; `audit_log_entity_type_check` hat 80 Einträge mit erhaltenen Geschwister-Werten;
`_tracked_audit_columns` liefert für `dd_findings`/`skill_knowledge_links` unverändert.

### Followups

- **PROJ-Y-122a** — Verknüpfung zu Kaufpreis-Bridge (PROJ-121) und Closing Conditions (PROJ-123), sobald
  die Tabellen existieren.
- **PROJ-Y-122b** — `risk_links += spa_issue`, gebündelt mit PROJ-Y-107b.
- **PROJ-Y-122c** — Garantien/Freistellungen als eigene Objekte statt Kategorie.
- **PROJ-Y-110b** (aus CIA) — `has_blocking_readiness` + der hartkodierte Oberflächentext auf eine
  datengetriebene Signalliste umstellen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
