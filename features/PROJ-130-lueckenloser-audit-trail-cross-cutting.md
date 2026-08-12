---
id: PROJ-130
title: "Lückenloser Audit-Trail (Cross-Cutting)"
issue_type: Story
epic_code: L
epic_title: "Vertraulichkeit, NDA & Audit"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-l", "mvp"]
dependencies: ["B4", "L2"]
roles: ["Compliance/Revision", "IT-Sicherheit", "Datenschutzbeauftragter", "PMO-Lead", "Externe Prüfer (lesend)"]
summary_for_jira: "[L3] Lückenloser Audit-Trail (Cross-Cutting)"
---

# PROJ-130: Lückenloser Audit-Trail (Cross-Cutting)

## Status: In Progress (α + β + γ komplett bis auf UI + δ1 + δ2 live; γ2b/ε offen)
**Created:** 2026-06-10
**Architected:** 2026-08-11 (CIA-reviewed, GO-mit-Auflagen — Tech Design unten)
**α /backend:** 2026-08-11 — Migration in Prod, Live-Pentest 19/19, 0 Residuen (gemergt, `537f727`)
**β /backend:** 2026-08-11 — Migration in Prod, Live-Pentest 12/12, 0 Residuen (gemergt, `b2a82df`)
**γ1 /backend:** 2026-08-11 — Migration in Prod, Live-Pentest 9/9, 0 Residuen (gemergt, `52111f3`)
**γ2 + γ4 /backend:** 2026-08-11 — Migration in Prod, Live-Pentest 11/11, 0 Residuen (gemergt, PR #329)
**γ3 /backend:** 2026-08-11 — Objektarten-Register 15 to 88, Drift strukturell geschlossen (gemergt, PR #330)
**PROJ-Y-130h:** 2026-08-11 — Test-Mandanten-Ausnahme, Live-Pentest 8/8 (gemergt, PR #331)
**δ1 /backend:** 2026-08-11 — Zugriffsprotokoll fuer austretende Inhalte, Live-Pentest 10/10, 0 Residuen
**Origin:** M&A-Platform Backlog (Epic L — Vertraulichkeit, NDA & Audit)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-10 Audit (vollständig vorhanden) — nur M&A-Objekte in `_tracked_audit_columns`. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** L — Vertraulichkeit, NDA & Audit  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-l` · `mvp`  
> **Abhängigkeiten:** `B4`, `L2`

**User Story:**

Als Compliance/Audit-Verantwortlicher möchte ich für jedes M&A-Projekt eine unveränderbare, vollständige Aufzeichnung aller relevanten Aktionen (wer, wann, was, von welcher Quelle) abrufen können, damit die regulatorischen und internen Prüfanforderungen erfüllt sind.

**Beschreibung / Kontext:**

Ein M&A-Projekt ist regelmäßig Gegenstand interner und externer Prüfungen. Die Plattform muss durchgehend nachvollziehbar machen, welche Aktion welche Folge hatte. Audit-Trail ist in praktisch jeder anderen Story referenziert – diese Story definiert die zentrale Funktion.

**Akzeptanzkriterien:**

- [ ] Jede schreibende Aktion (Anlage, Änderung, Löschung, Statuswechsel, Klassifikationsänderung, Freigabe, Zugriff auf Strictly Confidential) wird mit Zeitstempel, Benutzer, betroffenem Objekt und Vor-/Nach-Wert protokolliert.
- [ ] Audit-Einträge sind nicht änderbar und nicht löschbar.
- [ ] Eine Suche nach Benutzer, Objekt, Zeitraum und Aktionstyp ist möglich.
- [ ] Ein Export der Audit-Daten ist für externe Audits möglich (z. B. CSV).
- [ ] Die Speicherdauer ist konfigurierbar (Mindestaufbewahrung muss DSGVO und intern definierte Compliance-Vorgaben erfüllen – offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine SIEM-Anbindung in der Erst-Story (kann ergänzt werden).
- Keine echtzeitbasierte Anomalie-Erkennung.

**Offene Fragen — alle vier am 2026-08-11 vom Product Owner gelockt:**

- ~~Welche Aufbewahrungsfrist gilt organisationsweit?~~ → **Unbegrenzt, kein Purge.** Betroffenenrechte über die bestehende Export-Redaktion, nicht über Löschung.
- ~~Soll der Trail in eine WORM-Lösung exportiert werden?~~ → **Nein.** Manipulationsschutz DB-seitig plus Hash-Verkettung; kein externer WORM-Speicher (keine Storage-Entscheidung nötig).
- ~~Wer darf den Trail einsehen?~~ → **Tenant-Admin + neue read-only Revisions-Rolle „Auditor" + zeitlich befristeter externer Prüfer.**
- ~~Protokollumfang?~~ → **Schreibvorgänge vollständig UND Lese-Zugriffe auf `strict`-Inhalte.**

**Definition of Ready:**

- [ ] Audit-Datenmodell ist mit Compliance, Security und Datenschutz abgestimmt.
- [ ] Liste der protokollpflichtigen Aktionen ist vollständig.

**Definition of Done:**

- [ ] Audit-Trail ist für alle protokollpflichtigen Aktionen aktiv.
- [ ] Unveränderbarkeit, Suche und Export funktionieren.
- [ ] Externer Audit-Testfall (mind. ein End-to-End-Szenario) ist erfolgreich durchlaufen.

**Abhängigkeiten:**

- B4
- L2

**Betroffene Rollen:**

- Compliance/Revision
- IT-Sicherheit
- Datenschutzbeauftragter
- PMO-Lead
- Externe Prüfer (lesend)

## Tech Design (Solution Architect)

_Erstellt 2026-08-11. Grundlage: Live-Erhebung gegen die Produktions-DB + CIA-Review (Verdikt GO-mit-Auflagen, 10 Auflagen)._

### Der wichtigste Befund: die Story-Prämisse stimmt heute nicht

PROJ-130 wurde als „M&A-Objekte in den bestehenden Audit-Trail eintragen" geplant. Die Erhebung zeigt: der Trail selbst hält seine eigenen Zusagen nicht. Drei Punkte, die den Zuschnitt bestimmen:

1. **Es wird täglich gelöscht.** Ein produktiver nächtlicher Job entfernt Audit-Einträge, die älter sind als die Aufbewahrungsfrist des Mandanten (Standard: zwei Jahre). Zusätzlich löscht das Offboarding eines Mandanten dessen kompletten Trail mit. „Lückenlos" ist damit strukturell falsch — unabhängig von jedem Manipulationsschutz.
2. **Anlage und Löschung von Objekten werden nicht protokolliert.** Alle 59 überwachten Tabellen sind ausschließlich auf *Änderungen* verdrahtet. Wer ein Projekt, ein Risiko oder ein Deliverable neu anlegt oder löscht, hinterlässt keine Spur. Auch das „in den Papierkorb legen" der vier Kernobjekte (Projekt, Phase, Milestone, Arbeitspaket) ist unsichtbar.
3. **Vier Register beschreiben denselben Sachverhalt und driften auseinander.** Welche Objektarten überhaupt auditierbar sind, steht an vier Stellen — mit 80, 63, 57 und 15 Einträgen. Diese Drift ist die eigentliche Ursache der Lückenhaftigkeit: jede vergangene Slice hat ein Register gepflegt und andere vergessen. Ein Objekttyp ist dadurch schon jetzt eine tickende Bombe (Trigger vorhanden, aber im Vokabular fehlend — sobald jemand ihn scharf stellt, schlägt jeder Mandatswechsel mit einem Datenbankfehler fehl).

**Konsequenz für die Reihenfolge:** Manipulationsschutz vor Löschstopp wäre wertlos — man würde eine Hash-Kette über Zeilen legen, die der Cron nachts entfernt. Deshalb dreht dieses Design die Reihenfolge der Akzeptanzkriterien um.

### Zuschnitt: fünf Sub-Slices, ~9,5 PT

| Slice | Titel | Inhalt | PT | Priorität |
|---|---|---|---|---|
| **α** | Nichts geht mehr verloren | Löschpfade schließen, Schreibschutz auf DB-Ebene, die vier Register in Einklang bringen | 1,5 | **pilot-kritisch, zuerst** |
| **β** | Schreibvorgänge vollständig | Anlage + Löschung + Papierkorb protokollieren, zwei fehlende Statuswechsel, Begründungs-Konvention | 2,5 | **pilot-kritisch** |
| **γ** | Leseberechtigung + Need-to-know | Auditor-Rolle, befristeter externer Prüfer, Need-to-know-Gate im Trail, Suche/Export für alle Objektarten öffnen | 2,0 | vor erstem externen Audit |
| **δ** | Lese-Zugriffe auf `strict` | Zugriffsprotokoll für vertrauliche Inhalte, mit veröffentlichter Positivliste | 2,0 | vor erstem Pilot mit `strict`-Inhalten |
| **ε** | Manipulationsnachweis | Hash-Verkettung über periodische Anker + Verifikationslauf | 1,5 | zuletzt |

Warum diese Grenzen: **ε setzt eine stabile Zeilenmenge voraus** — jede β-Änderung an der Protokoll-Semantik würde eine bereits gebildete Verkettung neu ankern müssen. Und **80 % der Manipulationsschutz-Wirkung liefert α**, nicht die Kette: der Schreibschutz auf Datenbankebene verhindert Veränderung, die Kette macht sie lediglich *nachweisbar*.

### Zuordnung der Akzeptanzkriterien

| AC | Slice | Anmerkung |
|---|---|---|
| AC-1 Schreibvorgänge lückenlos | β (Anlage/Löschung/Status) | Freigaben liegen heute in sechs separaten, unveränderbaren Ereignis-Tabellen; vier davon sind aus der zentralen Suche nicht erreichbar → γ macht sie auffindbar, sie werden **nicht** dupliziert |
| AC-1 Zugriff auf Strictly Confidential | δ | mit expliziter Negativliste, siehe unten |
| AC-2 nicht änderbar/löschbar | **α** (wirksamer Schutz) + ε (Nachweis) | |
| AC-3 Suche nach Nutzer/Objekt/Zeitraum/**Aktionstyp** | γ | Aktionstyp-Filter ist heute unmöglich — das Datenmodell hat kein Feld dafür; β legt es an |
| AC-4 CSV-Export | vorhanden, γ härtet ihn | Export existiert bereits inkl. Redaktion und Export-Protokollierung |
| AC-5 konfigurierbare Speicherdauer | **α, als bewusste Umkehr** | Lock: unbegrenzt. Das AC wird nicht erfüllt, sondern begründet aufgehoben — siehe Abweichungen |

### Datenmodell in Klartext

**Bestehend, bleibt die Wahrheit:** ein Audit-Eintrag beschreibt heute *eine Feldänderung an einem Objekt* — wer, wann, welches Objekt, welches Feld, Wert davor, Wert danach, optionale Begründung. Daran wird nicht gerüttelt.

**Neu in β:** Anlage und Löschung erhalten **einen Eintrag pro Objekt**, nicht pro Feld. Der Eintrag trägt eine Kennzeichnung „angelegt" bzw. „gelöscht" und als Wert eine knappe Objektbezeichnung (Titel oder Name) — **ausdrücklich nicht** den kompletten Datensatz. Grund: ein vollständiger Datensatz-Abzug würde personenbezogene Klartextdaten ins Protokoll spülen und die bestehende Redaktion beim Export umgehen. Pro-Feld-Einträge bei Anlage würden das Protokoll über 410 überwachte Spalten aufblähen.

**Neu in γ:** eine Freigabe-Tabelle für Leseberechtigte am Trail — wer, für welchen Mandanten, von wem freigegeben, gültig bis wann. Die Befristung des externen Prüfers ist damit ein Datum, kein neues Einladungsverfahren.

**Neu in δ:** ein **eigenes** Zugriffsprotokoll, getrennt vom Änderungsprotokoll. Begründung: andere Semantik (es gibt kein „Feld" und kein „davor/danach") und eine völlig andere Mengenkurve.

**Neu in ε:** eine Anker-Tabelle. Jeder Anker fasst ein abgeschlossenes Zeitfenster eines Mandanten zu einem Prüfwert zusammen und verweist auf den Prüfwert des Vorgängers. Die Anker bilden die Kette — nicht die Einträge selbst.

### Entschiedene Weichenstellungen (und warum)

**Anlage/Löschung additiv, nicht durch Umbau.** Die bestehende Protokoll-Funktion wird **nicht** angefasst. Sie ist über 43 Migrationen gewachsen, wurde zweimal versehentlich beschädigt, und ein Umbau müsste alle 59 Verdrahtungen in einer einzigen Migration abreißen und neu setzen — bricht die ab, bleibt ein halb entkoppeltes System zurück. Stattdessen eine **zweite** Funktion mit eigener Verdrahtung, Tabelle für Tabelle nachrüstbar. Die Logik, die aus einer Datenzeile Mandant und Objekt-Identität ableitet, wird dabei **einmal** herausgezogen und von beiden Funktionen genutzt — sonst entstünde ein fünftes driftendes Register.

**Reihenfolge der Nachrüstung nach Schutzbedarf, nicht alphabetisch.** 74 Tabellen sind unabgedeckt; β rüstet zuerst die rechte- und geheimnistragenden nach (Mitgliedschaften und damit Rollenwechsel, Vertraulichkeits-Freischaltungen, alle Freigabe-Tabellen, KI-Provider-Zugänge, Zugriffs-Token, Mandanten-Geheimnisse, hochgeladene Kontextquellen). Der Rest wird als nicht-blockierende Lücke ausgewiesen und in einem Followup geschlossen — **ausdrücklich** ausgewiesen, damit nicht dieselbe Statuslüge entsteht, die PROJ-141-γ1 bei PROJ-96 aufgedeckt hat.

**Hash-Verkettung über periodische Anker statt pro Zeile.** Eine Kette pro Eintrag müsste jede Geschäfts-Transaktion auf die Kettenspitze serialisieren. Da eine einzelne Änderung leicht 5–15 Einträge erzeugt, würde die Sperre über die gesamte Transaktionsdauer gehalten: zwei parallele Deal-Bearbeitungen im selben Mandanten blockieren sich vollständig, und auf der eingesetzten Serverless-Plattform mit vielen kurzen Parallel-Anfragen entsteht ein harter Durchsatzdeckel plus Verklemmungsrisiko. Anker über abgeschlossene Zeitfenster haben **null** Zusatzlast im Schreibpfad. Bewusster Trade-off: Manipulation *innerhalb* des noch offenen Fensters ist nicht nachweisbar — akzeptabel, weil die eigentliche Barriere der Schreibschutz aus α ist. Das Fenster braucht eine Sicherheitsmarge, die länger ist als die längste Transaktion, sonst meldet der Verifikationslauf Manipulation, wo nur eine spät abgeschlossene Buchung nachgerückt ist.

**Schreibschutz über Wächter, nicht über pauschalen Rechteentzug.** Vier produktive Codepfade schreiben Audit-Einträge bewusst selbst (Budget-Buchungen, Buchungs-Stornos, Kostenprotokoll, Tagessätze). Ein pauschaler Entzug von Schreibrechten würde diese sofort brechen. Der Wächter unterscheidet darum zwischen legitimem Hinzufügen und dem, was verboten sein soll: Verändern und Löschen.

**Auditor als Freigabe, nicht als vierte Mandanten-Rolle.** Die Mandanten-Rolle ist die Achse hinter praktisch jeder Zugriffsregel im System. Ein vierter Rollenwert würde den Auditor automatisch zum Mandanten-Mitglied machen — und damit überall lesend durchlassen, wo nur Mitgliedschaft geprüft wird. Das ist das Gegenteil einer rein lesenden Revision. Stattdessen eine separate Freigabe plus **ein** zusätzlicher Zweig in der Leseprüfung des Trails: modul-lokaler Eingriff statt globalem Regelwerk-Durchlauf. Das bestehende Muster für externe Berater (Mandat + Vertraulichkeitsvereinbarung) wird **nicht** wiederverwendet — es bedeutet „externer Berater in einem Deal", nicht „Revisor über den Mandanten", und würde die Vertraulichkeitsprüfung semantisch überladen.

**Wertmaskierung: der Trail darf kein Seitenkanal sein.** _(Beim Bau von γ1 widerlegt und durch das strengere Zeilen-Verbergen ersetzt — Begründung in den γ1-Implementation-Notes. Der Absatz bleibt als Entscheidungshistorie stehen.)_ Heute liest ein Mandanten-Administrator den gesamten Trail bedingungslos — einschließlich der Vorher-/Nachher-Werte von Objekten, die nach Need-to-know für ihn gesperrt sind. Mit einem Auditor und einem externen Prüfer verschärft sich das. γ maskiert deshalb die Werte, wo die Vertraulichkeitsprüfung negativ ausfällt, und lässt die Metadaten (wer, wann, welches Objekt, welches Feld) sichtbar. Die Maskierung sitzt in der Leseschicht, damit sie alle drei Leseflächen trifft — Objekt-Historie, Bericht, Export — und nicht in der Oberfläche.

**Löschstopp mit Rücksicht auf Bestand.** Der nächtliche Job bleibt bestehen, sein Audit-Löschblock entfällt und die Antwort weist den Rückbau ausdrücklich aus (ein stiller Rückbau sieht später wie ein Fehler aus). Das Frist-Feld wird in der Mandanten-Oberfläche deaktiviert und begründet, aber **nicht** aus der Schema-Prüfung entfernt: bestehende Werte würden sonst ungültig und das Speichern der Mandanten-Einstellungen bräche. Die Kopplung, über die ein Mandanten-Offboarding den Trail mitlöscht, wird aufgehoben — der Mandantenbezug bleibt als schlichter Verweis erhalten. Genau diese Begründung ist im Zugriffsprotokoll aus PROJ-119 bereits verankert: ein forensisches Protokoll muss die Löschung seines Bezugsobjekts überleben.

**Drift-Wächter, aber erst nach dem Aufräumen.** Ein Prüflauf im Build vergleicht die vier Register gegeneinander — nicht durch Rekonstruktion aus 43 Migrationsdateien, sondern gegen die bereits vorhandene Schatten-Datenbank des Schema-Drift-Wächters. Er prüft **Konsistenz innerhalb der eingetragenen Menge**, nicht Vollständigkeit; die 74 unabgedeckten Tabellen sind dadurch per Definition grün. Die 15 heute vorhandenen Inkonsistenzen (6 wirkungslose Verdrahtungen, 9 verwaiste Register-Einträge) müssen in α fallen, **bevor** der Wächter scharf gestellt wird — sonst entsteht dasselbe Baseline-Problem wie bei PROJ-29.

### Was bewusst NICHT geloggt wird (δ, Negativliste — gehört in die Freigabe)

Listenansichten, Baumansichten, Dashboards und Suchergebnisse; alle Inhalte der Stufe `standard`. Bei Datei-Downloads ist ausschließlich der Zeitpunkt der Link-Ausgabe protokollierbar, nicht der tatsächliche Abruf — die signierte Adresse wird außerhalb der Anwendung eingelöst. Bei den drei Auswertungs-Funktionen wird **ein** Ereignis pro Aufruf protokolliert (wer, welche Auswertung, wie viele vertrauliche Objekte enthalten), nicht pro gelesener Zeile: ein Protokoll „hat eine Summe gelesen" wäre wahr und wertlos, pro Zeile würde es explodieren. Protokolliert wird nur oberhalb von `standard`, damit Nicht-M&A-Mandanten keine Zusatzlast tragen. Ausfallverhalten: bei `strict` blockiert ein fehlgeschlagenes Protokollieren den Zugriff, bei `confidential` nicht — sonst wird das Protokoll selbst zum Ausfallrisiko.

### Abweichungen von der Spec

- **AC-5 wird umgekehrt, nicht erfüllt.** Die Spec fordert eine konfigurierbare Speicherdauer; der Lock ist „unbegrenzt". Das Feld bleibt aus Kompatibilitätsgründen im Schema, verliert aber seine Wirkung.
- **Kein Legal-Hold.** Ohne Löschpfad ist eine Löschsperre redundante Komplexität. Betroffenenrechte laufen über die bestehende Export-Redaktion plus eine dokumentierte, manuell auditierte Ausnahmeprozedur.
- **Kein WORM-Export** (Lock). Die WORM-Frage der Spec ist damit mit „nein" beantwortet.
- **Freigabe-Ereignisse werden nicht in den zentralen Trail kopiert**, sondern auffindbar gemacht. Duplizierung wäre ein zweites Register mit eigener Driftgefahr.
- **Vollständige Abdeckung aller 132 Tabellen ist nicht Teil von β**, sondern ein ausgewiesener Followup.

### Abhängigkeiten (Pakete)

Keine. Weder neue Bibliothek noch neuer Dienst. Prüfwert-Bildung und Zeitsteuerung nutzen vorhandene Datenbank- und Plattform-Mittel.

### Auflagen aus dem CIA-Review (verbindlich für /backend)

1. α vor allem anderen — Löschstopp und Register-Abgleich vor jedem Hash-Thema.
2. Verkettung über periodische Anker, nur über abgeschlossene Fenster mit Sicherheitsmarge.
3. Anlage/Löschung additiv über eine zweite Funktion; bestehende Funktion und alle 59 Verdrahtungen bleiben unberührt; gemeinsame Identitäts-Auflösung.
4. Keine pauschalen Rechteentzüge — die vier legitimen Schreibpfade müssen weiterlaufen.
5. Zugriffsprotokoll mit veröffentlichter Positiv- **und** Negativliste in dieser Spec.
6. Auditor als Freigabe-Tabelle, kein neuer Mandanten-Rollenwert; die Redaktions-Abschaltung im Export ist für Auditor und externen Prüfer gesperrt.
7. Wertmaskierung gegen Need-to-know in γ.
8. Audit-Funktionen ausschließlich per Anker-Ersetzung aus der Live-Definition mit Rechte-Wiederherstellung und anschließender Zweig-Zählung; **PROJ-130-Migrationen erst nach dem Merge von PR #304 (PROJ-120)**, nicht parallel.
9. Legal-Hold-Verzicht als bewusste Abweichung dokumentiert (siehe oben).
10. Drift-Wächter erst scharf, nachdem α die 15 Inkonsistenzen bereinigt hat.

### Followups (PROJ-Y-Kandidaten, aus dem CIA-Review)

- **PROJ-Y-130a** — toter Rollenzweig `editor` an 24 Regel-Stellen (wirkt heute als „nur Administrator").
- **PROJ-Y-130b** — `set_sprint_state`: Actor-Parameter entfernen (Impersonations-Muster) und Audit nachrüsten.
- **PROJ-Y-130c** — kontenlose externe Prüfer über das bestehende Einmal-Link-Muster aus PROJ-31.
- **PROJ-Y-130d** — Audit-Abdeckung der verbleibenden unabgedeckten Tabellen.
- **PROJ-Y-130e** — Blätterung für Bericht und Export (heute hartes Limit 500 ohne Fortsetzung).
- **PROJ-Y-130f** — **Prod/Repo-Divergenz in der Audit-Abdeckung** (Fund aus α, siehe unten): Prod hat zwei auditierte Tabellen mehr, als die Migrationsdateien herstellen. Genau bestimmbar erst mit einer lokalen Shadow-DB (blockiert durch den offenen Docker/WSL-Handoff aus PROJ-67/F6).
- **PROJ-Y-130k** — `communication_access_log` (PROJ-119) traegt einen FK auf `projects`; sein Protokoll verschwindet bei einer Projekt-Loeschung mit. An die FK-freie Linie von α und δ1 angleichen.
- **PROJ-Y-130j** — suchbare Combobox statt 88-Eintrag-Select im Audit-Bericht (γ3-Nebeneffekt).
- **PROJ-Y-130i** — **Auditor sieht keine mandantenweiten Katalogänderungen** (bewusste γ2-Grenze): Zweige des Lesetors, die direkt `is_tenant_member(...)` oder `return false` liefern, umgehen den gemeinsamen Ausgang. Ausweitung = 9 weitere Einzel-Ersetzungen, gehört nicht in dieselbe Migration.
- ~~**PROJ-Y-130h**~~ — **erledigt 2026-08-11** (PO-Entscheidung: Test-Mandanten ausnehmen). Siehe eigenen Abschnitt unten.
- **PROJ-Y-130g** — **`stakeholder_interaction_participants` bricht die Feld-Audit-Funktion** (Fund aus β): kein einspaltiger `id`-PK, aber Trigger + 7 getrackte Spalten → `entity_id` wird NULL → `NOT NULL`-Verstoß. Ein UPDATE einer getrackten Spalte schlägt in Prod fehl; es passiert nur nie. Der neue β-Resolver behandelt den Fall korrekt, die Altfunktion bleibt wegen CIA-Auflage 3 unangetastet.

### Handoff

α und β sind rein serverseitig (Datenbank + Auswertungs-Schicht) → nächster Schritt ist `/backend`. γ und δ bringen Oberflächenanteile (Freigabe-Verwaltung, Maskierungs-Darstellung) → dort `/frontend` nach dem jeweiligen Backend-Teil. ε ist wieder rein serverseitig.

## Implementation Notes — α (2026-08-11, `/backend`)

**Migration `20260811093000_proj130_alpha_audit_trail_integrity.sql` in Prod angewendet** (MCP-`name` = Repo-Dateiname-Stamm, PROJ-134). Vier Blöcke:

1. **entity_type-CHECK 80 → 81 Werte.** `ma_project_profiles` ergänzt — die latente Prod-Bombe ist entschärft. Anker-Ersetzung an der Live-Definition mit Fail-Loud-Guard; bei unerwarteter Form bricht die Migration ab statt zu raten.
2. **`_tracked_audit_columns` 63 → 69 Zweige.** Die sechs stummen Trigger haben jetzt Spalten: `ma_project_profiles` (11), `project_goals` (8), `releases` (6), `sprints` (6), `stakeholder_coaching_recommendations` (2), `dependencies` (2). Whitespace-toleranter Regex-Anker auf das abschließende `else array[]::text[]`, Zweig-Zählung als Post-Condition, `execute` nur nach erfolgreicher Ersetzung. Explizites Re-Grant in derselben Migration.
   **Nebeneffekt: zwei der β-Statuslücken sind damit geschlossen** — `transition_mandate_status` (über `ma_project_profiles.mandate_status`) und `set_sprint_state` (über `sprints.state`) protokollieren jetzt. β behält nur noch die Actor-Parameter-Bereinigung (→ PROJ-Y-130b).
3. **8 waise Whitelist-Zweige verdrahtet** (59 → **67** auditierte Tabellen): `tenant_memberships`, `role_rates`, `vendor_documents`, `ma_nda_assignments`, `committee_templates`, `communication_templates`, `committee_meeting_attendees`, `committee_meeting_documents`. **Rollenwechsel im Mandanten sind damit erstmals nachvollziehbar.** `budget_postings` bleibt bewusst ohne Trigger — die Buchungs-Routen schreiben ihre Audit-Zeilen selbst; ein Trigger wäre ein zweiter Schreibpfad auf denselben Sachverhalt (dokumentierte Ausnahme für den Drift-Guard).
4. **Löschstopp + Schreibschutz.** Mandanten-FK (`audit_log_tenant_fkey`, war `ON DELETE CASCADE`) entkoppelt; drei Guard-Trigger (`audit_log_no_update`/`_no_delete`/`_no_truncate`) blockieren mit `42501` für **jede** Rolle inklusive `service_role` und `postgres`; DML-Rechte von `anon` und `authenticated` entzogen, `SELECT` bleibt. Kein pauschaler Rechteentzug (CIA-Auflage 4) — vorab verifiziert, dass `audit_undo_field` und `audit_restore_entity` den Trail nur lesen und neue Zeilen schreiben.

**App-Seite:** `/api/cron/apply-retention` purged nicht mehr, sondern meldet `audit_purge: "disabled"` samt Begründung und konstruiert **gar keinen** DB-Client mehr; Cron-Eintrag und Route bleiben bestehen, damit die Abschaltung beobachtbar ist statt wie ein verlorener Job auszusehen. Das Feld „Audit-Log-Aufbewahrung" in den Mandanten-Einstellungen ist deaktiviert und erklärt, bleibt aber im Zod-Schema (Bestandswerte würden sonst ungültig und der PROJ-17-Settings-PUT bräche).

**Live-Pentest `tests/sql/PROJ-130-audit-trail-integrity-pentest.sql` gegen Prod: 19/19 PASS, 0 Residuen** (487 Audit-Zeilen vor und nach dem Lauf, neuester Eintrag älter als der Test). Vektoren: UPDATE/DELETE/TRUNCATE auf Audit-Einträge je `42501` blockiert · `INSERT` mit `entity_type='ma_project_profiles'` erlaubt (Bombe entschärft) · unbekannter `entity_type` weiter `23514` · vier vormals stumme bzw. neu verdrahtete Trigger schreiben nachweislich je eine Zeile · `authenticated` kann nicht mehr schreiben, liest aber weiter · Katalog-Prüfungen (FK weg, 3 Wächter, 67 Tabellen, 8 neue Trigger) · **Clobber-Prüfung: alle 22 Sibling-Zweige der Nachbar-Slices unverändert.**

**Zwei Test-Vektoren mussten dem Prod-Seed angepasst werden** (ehrlich dokumentiert, nicht stillschweigend):
- Ein Rollenwechsel ist auf diesem Seed nicht auslösbar — jeder Mandant hat genau einen Admin und `enforce_admin_invariant` blockiert die Herabstufung mit `23514`. Der Vektor bewegt deshalb die zweite getrackte Spalte (`organization_unit_id`); die Trigger-Anbindung selbst ist katalogseitig belegt (K4).
- Für `ma_project_profiles` existiert in Prod keine Zeile (0 Profile). Die entschärfte CHECK-Bombe wird darum direkt am Constraint bewiesen (synthetischer Audit-Insert), nicht über einen Mandatswechsel.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2750/2750** (352 Dateien, +4 neue) · Build clean · `check:migration-naming` **0 Fehler** · Supabase-Advisors **0 ERROR** und **kein einziger** audit_log-bezogener Lint (die neue Guard-Funktion trägt `set search_path`).

**Betriebshinweis:** Die Migration ist in Prod, der Code-Rückbau des Purges deployt erst mit dem Merge. Zwischen Anwendung und Merge würde der 03:30-Cron einen `delete` versuchen und am Guard-Trigger scheitern — er **fällt sicher aus** (HTTP 500 `delete_failed`, nichts wird gelöscht) statt still zu truncaten. Bei Merge am selben Tag entsteht dieses Fenster gar nicht.

**Fund aus dem CI-Replay (neu, → PROJ-Y-130f):** Der Schema-Drift-Guard baut die Shadow-DB allein aus den Migrationsdateien auf und erreichte dort **65** auditierte Tabellen, während Prod nach α **67** hat. Es gibt also zwei Audit-Trigger in Prod, die die Migrationsdateien nicht herstellen — eine Prod/Repo-Divergenz, genau die Klasse, für die PROJ-42-γ („Prod-Drift") zurückgestellt wurde. Welche zwei Tabellen es sind, ist **nicht** bestimmt: die Trigger-Statements sind mehrzeilig, ein Datei-Grep ist dafür untauglich, und eine lokale Shadow-DB ist durch den offenen Docker/WSL-Handoff (PROJ-67/F6) nicht verfügbar. Die Zahl 65 vs. 67 ist belegt, die Zuordnung nicht — bewusst nicht geraten.

**Daraus die eine echte Korrektur in α:** die Abdeckungsprüfung war als **absolute** Schwelle (`>= 67`) geschrieben und damit in genau einer der beiden Umgebungen zwangsläufig falsch — sie hat den Guard rot gemacht (`ERROR: >= 67 auditierte Tabellen erwartet, 65 gefunden`), obwohl die Migration inhaltlich korrekt durchlief und die Anker-Ersetzung sauber griff. Ersetzt durch eine **relative** Delta-Prüfung im Verdrahtungs-Block (zähle vorher, zähle wie viele der 8 Ziele einen Trigger vermissen, prüfe nachher auf genau dieses Delta). Das ist in beiden Umgebungen korrekt, bleibt bei Wiederholung grün (Delta 0) und sagt mehr aus als eine Schwelle. Die verbindliche Prüfung bleibt die Zweig-für-Zweig-Prüfung; die Gesamtzahl wird nur noch protokolliert. Idempotent gegen Prod nachgezogen, damit Datei und Prod-Wirkung übereinstimmen.

**Lehre für β–ε:** in einer Umgebung gemessene absolute Bestandszahlen gehören nicht in Migrations-Assertions, solange Prod und Repo-Replay nachweislich auseinanderliegen. Relative Deltas und Existenzprüfungen pro Objekt sind die tragfähige Form.

**Offen in α:** nichts.

## Implementation Notes — β (2026-08-11, `/backend`)

**Migration `20260811104500_proj130_beta_lifecycle_audit.sql` in Prod angewendet.** Additiv: `record_audit_changes` und ihre 67 UPDATE-Trigger sind unangetastet (Post-Condition prüft das).

1. **Zweite Trigger-Funktion `record_audit_lifecycle()`** — EINE Zeile pro Objekt, `field_name` als Sentinel (`__created` / `__deleted`), Wert = kompakte Kennung (Titel/Name/Label/Code, gekappt auf 200 Zeichen) statt Row-Abzug. Ein Row-Abzug hätte personenbezogenen Klartext ins Protokoll gespült und die Redaktion im Export umgangen.
2. **Gemeinsamer Resolver `_audit_entity_context`** für Objekt- und Mandanten-Identität, inklusive der Tabellen ohne einspaltigen `id`-PK.
3. **entity_type-CHECK 81 → 87.** Sechs Zustands-/Zugangs-Tabellen ergänzt, deren Anlage/Löschung ein Governance-Ereignis ist: `mcp_access_tokens`, `tenant_secrets`, `context_sources`, `deliverable_approvals`, `deliverable_approval_stages`, `decision_approval_state`.
4. **Papierkorb sichtbar (β2):** `is_deleted` in die Whitelist-Zweige von `projects`, `phases`, `milestones`, `work_items` — der fachliche Löschvorgang der vier Kernobjekte war unprotokolliert.
5. **75 Tabellen mit Lifecycle-Trigger** (UPDATE-Abdeckung unverändert bei 67).

**Drei bewusste Ausnahmen, live erhoben statt geraten.** Eine Abfrage über alle Trigger, die in `audit_log_entries` schreiben, ergab genau drei Tabellen, die Anlage/Löschung schon eigenständig protokollieren — ohne diese Prüfung hätte β dort Doppel-Einträge erzeugt:
- `dependencies` — eigene INSERT- **und** DELETE-Audit-Trigger → gar nicht verdrahtet
- `decisions` — eigener INSERT-Audit-Trigger → **nur DELETE** verdrahtet
- `budget_postings` — die Buchungs-Routen schreiben ihre Zeilen selbst (dieselbe Ausnahme wie in α) → gar nicht verdrahtet

Nebenbefund: `audit_escalation_patterns` auf `stakeholders` schreibt entgegen der ersten Annahme **nicht** in den Trail — `stakeholders` ist also unbedenklich verdrahtet.

**Abweichung von der CIA-Empfehlung (F2).** CIA wollte, dass **beide** Trigger-Funktionen den gemeinsamen Resolver nutzen. Das würde `record_audit_changes` anfassen und damit Auflage 3 verletzen. Der Resolver ist deshalb zunächst nur Autorität für die neue Funktion; damit daraus kein fünftes driftendes Register wird, prüft dieselbe Migration, dass `record_audit_changes` keinen Sonderfall kennt, den der Resolver nicht hat — und schlägt laut fehl, sobald jemand dort einen Zweig ergänzt.

**Zwei Folgeprobleme, vor dem Ausliefern gefunden:**
- **Verlaufs-Tab zeigte Sentinels roh.** Ohne Behandlung hätte dort „__created" als Feldname gestanden. Neu: `src/lib/audit/lifecycle.ts` (Sentinel-Menge, Anzeigename, Undo-Eignung) plus Darstellung als Badge „Angelegt"/„Gelöscht" mit der Kennung statt eines Vorher/Nachher-Paares.
- **Undo-Affordanz auf Anlage-Einträgen.** `audit_undo_field` sucht eine Spalte namens `__created`, findet keine und meldet `entity_not_found` — beschädigt nichts, aber der Button hätte irreführend fehlgeschlagen. Undo ist für Lifecycle-Einträge jetzt ausgeblendet; 5 Unit-Tests pinnen die Abgrenzung (`is_deleted` bleibt bewusst *undo-fähig*, es ist eine echte Feldänderung).
- **`audit_restore_entity` ist by construction sicher** — es iteriert über `_tracked_audit_columns` und kennt die Sentinels darum nicht. Verifiziert an der Live-Definition, nicht angenommen (CIA-Risiko 4).

**Neuer Fund → PROJ-Y-130g:** `stakeholder_interaction_participants` hat keinen einspaltigen `id`-PK (PK ist `interaction_id` + `stakeholder_id`), trägt aber einen Audit-Trigger und 7 getrackte Spalten. Die bestehende Funktion löst `entity_id` über `NEW.id` auf → NULL → `NOT NULL`-Verstoß. Ein UPDATE einer getrackten Spalte dort **würde in Prod fehlschlagen**; es passiert nur nie. Dieselbe Defektklasse wie die in α entschärfte CHECK-Bombe. Der neue Resolver behandelt den Fall korrekt (Elternobjekt = Interaktion); die Inline-Auflösung der Altfunktion bleibt wegen Auflage 3 unangetastet.

**Mengenrechnung (weil es keinen Purge mehr gibt):** ein Audit-Eintrag ist ~200 Byte. Die vier Kernobjekte nutzen Soft-Delete, echte Hard-Deletes sind selten; der größte Verstärker ist ein Mandanten-Offboarding, das über ~130 Tabellen kaskadiert. Selbst 1 Mio. Lifecycle-Zeilen wären ~200 MB. Das ist kein Grund, Löschungen ungeloggt zu lassen.

**Betriebliche Folge:** jede **committende** Live-Aktion hinterlässt jetzt dauerhafte Anlage-Einträge, die nicht mehr löschbar sind. Live-Smokes müssen deshalb konsequent im Rollback-Muster laufen (wie α und β es tun) — ein committender Seed verschmutzt den Trail unwiderruflich.

**Live-Pentest `tests/sql/PROJ-130-beta-lifecycle-pentest.sql` gegen Prod: 12/12 PASS, 0 Residuen** (0 Lifecycle-Zeilen in Prod nach dem Lauf). Vektoren: Anlage → genau eine `__created`-Zeile mit korrekter Kennung · Löschung → genau eine `__deleted`-Zeile · Soft-Delete eines Arbeitspakets → `is_deleted`-Zeile · neu in den CHECK aufgenommene Tabelle schreibt wirklich · `decisions` nur DELETE-verdrahtet (kein Doppel-Eintrag) · `dependencies`/`budget_postings` gar nicht verdrahtet · α-Wächter weiter wirksam · Katalog-Prüfungen · Resolver-Drift-Wächter · Nachbar-Zweige unverändert.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2755/2755** (353 Dateien, +5) · Build clean · `check:migration-naming` **0 Fehler**.

**Offen in β:** nichts.

## Implementation Notes — γ1 (2026-08-11, `/backend`) — Need-to-know im Trail

**Migration `20260811120000_proj130_gamma1_audit_need_to_know.sql` in Prod angewendet.**

**Die Live-Erhebung hat die geplante Wertmaskierung widerlegt.** Das Tech Design sah vor, Werte zu maskieren und Metadaten sichtbar zu lassen. Zwei Fakten sprechen dagegen:

1. **`can_access_classified` gibt für Tenant-Admins unbedingt `true` zurück** — produktweit, seit PROJ-100a. Ein Admin kann jedes `strict`-Objekt ohnehin öffnen. Werte im Trail für Admins zu maskieren hätte nichts geschützt und eine zweite, abweichende Semantik neben PROJ-100a gestellt.
2. **Es gibt sechs Leseflächen auf den Trail**, nicht drei: Historie, Bericht, Export **plus** Stakeholder-Risk-Trend, Undo und Restore. Eine Maskierung pro Route hätte drei davon verfehlt.

**Der echte Befund ist enger und schärfer:** 20 Tabellen tragen `confidentiality_level`, 17 davon haben einen Zweig in `can_read_audit_entry` — aber nur **drei** Zweige prüfen die Stufe (alle aus PROJ-Y-115c). Die übrigen **16** lösen nur das Projekt auf. Ein Projektmitglied ohne Freischaltung konnte damit die Vorher-/Nachher-Werte von `strict`-Objekten lesen, die es nicht öffnen darf. Umsetzung deshalb: **Zeile verbergen statt Werte maskieren** — strenger (auch die Metadaten verraten die Existenz eines vertraulichen Vorgangs nicht mehr), konsistent mit PROJ-100a, und über die RLS-Policy für alle sechs Leseflächen gleichzeitig wirksam. Kein Eingriff in eine einzige Route.

**Ein Anker statt 21 Ersetzungen.** Die naive Variante wäre gewesen, in 21 Zweigen je einen Gate-Aufruf einzuflechten — 21 formabhängige Regexe auf der historisch am häufigsten geclobberten Funktion des Projekts. Stattdessen: die Stufen-Auflösung in **eine** neue Funktion `_audit_entry_classified_ok` (24 Zweige: eigene Stufe oder vom Elternobjekt geerbt), und `can_read_audit_entry` an genau **einer** Stelle erweitert — an ihrem gemeinsamen Ausgang.

**Ein Fehler, den ich dabei fast gemacht hätte:** `if v_project is null then return false` kommt auch im `vendor_invoices`-Zweig vor, und `regexp_replace` ersetzt ohne `'g'` nur das **erste** Vorkommen. Hätte das Muster zweimal gepasst, wäre die falsche Stelle erweitert worden, der Ausgang ungegated geblieben — und die Zweig-Zählung hätte es nicht bemerkt. Die Migration zählt deshalb die Anker-Treffer und bricht bei ≠ 1 ab.

**Das neue Register ist prüfbar, anders als die vier bestehenden.** Welche Tabellen die Stufen-Auflösung abdecken muss, ist aus dem Katalog **berechenbar**: Spalte `confidentiality_level` **und** Zweig in `can_read_audit_entry`. Genau das prüft die Migration am Ende — nicht gegen eine gepflegte Liste, sondern gegen die Datenbank.

**Live-Pentest `tests/sql/PROJ-130-gamma1-need-to-know-pentest.sql` gegen Prod: 9/9 PASS, 0 Residuen.** Kern-Beweis: Mitglied ohne Freigabe sieht für das `strict`-Objekt **0** Zeilen, für das `standard`-Objekt weiter **1** (kein Blanket-Deny), nach Freischaltung **1** (das Tor öffnet wirklich); Tenant-Admin sieht beides (bewusster produktweiter Bypass); Nicht-Mitglied 0; `anon` 42501; 57 Zweige unverändert; α-Wächter intakt. Das Nicht-Admin-Mitglied musste synthetisiert werden — im Prod-Seed ist jedes Mandanten-Mitglied Admin, und an Admins ist das Tor nicht prüfbar. (`tenant_memberships.user_id` referenziert `profiles`, nicht `auth.users` — erst der FK-Fehler hat das gezeigt.)

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2755/2755** (unverändert, γ1 ist rein DB-seitig) · Build clean · `check:migration-naming` **0 Fehler**.

**Beobachtung, die die β-Warnung bestätigt:** Zwischen den Läufen sind in Prod **7 Audit-Zeilen aus einem fremden Live-Testlauf** aufgetaucht (11:25 UTC, 3× `context_sources` angelegt und gelöscht, 1 Projekt angelegt). Der Test hat seine Daten aufgeräumt — das Protokoll des Aufräumens bleibt dauerhaft, weil es keinen Löschpfad mehr gibt. Test-Rauschen sammelt sich also unwiderruflich in einem Compliance-Artefakt. → **PROJ-Y-130h**.

**Offen nach γ1:** γ2 Auditor-Grant · γ3 TS-Enum-Öffnung · γ4 `redaction_off`.

## Implementation Notes — δ1 (2026-08-11, `/backend`) — Zugriffsprotokoll, erste Stufe

**Migration `20260811180000_proj130_delta1_confidential_read_log.sql` in Prod angewendet.**

**Die Bestandsaufnahme hat den geplanten Zuschnitt widerlegt.** Das Tech Design sah eine Positivliste „Detailansichten" und eine Negativliste „Listenansichten" vor. Die Erhebung zeigt: es gibt **fast keine Einzelobjekt-Routen**. `dd_findings`, `dd_questions`, `ma_valuations`, `spa_issues` und `deliverable_documents` werden ausschließlich **als Listen** gelesen — die Anwendung holt Sammlungen und filtert clientseitig. Die geplante Positivliste bezieht sich damit auf Flächen, die nicht existieren, und die Negativliste würde wörtlich genommen bedeuten, in der App praktisch nichts zu protokollieren.

**Die Grenze, die stattdessen trägt:** δ1 protokolliert die Flächen, an denen vertrauliche Inhalte das System **verlassen** — als Datei oder als Download-Link. Forensisch ist das der Kern („wer hat die Daten herausgetragen"), die Stufe ist dort pro Zeile exakt bekannt, und die Menge ist klein und begründbar.

**Umgesetzt (3 Flächen):**
- **DMS-Download** — die Stufe hängt seit PROJ-Y-115c am Baumknoten, nicht am Dokument; der Knoten wird für die Projekt-Prüfung ohnehin eingebettet, das Mitlesen kostet **keine** zusätzliche Abfrage. Die Aktion heißt `download_url_issued` und **nicht** `download`: protokollierbar ist nur die Ausgabe des signierten Links (120 s Gültigkeit), eingelöst wird er außerhalb der Anwendung. Das Protokoll sagt „Zugriff wurde ermöglicht", nicht „Datei wurde geladen" — dieser Unterschied muss in der Auswertung sichtbar bleiben.
- **DD-Fragen-CSV-Export** und **SPA-Issues-CSV-Export** — beide führen die Stufe pro Zeile im Ergebnis. Protokolliert wird **ein** Ereignis pro Export mit der höchsten Stufe und der Anzahl der vertraulichen Zeilen, nicht eine Zeile pro Datensatz.

**Ausfallverhalten nach Stufe:** bei `strict` fail-closed (schlägt das Protokollieren fehl, gibt es weder Link noch Datei), bei `confidential` best-effort. Sonst würde das Protokoll selbst zum Ausfallrisiko für die gutartige Mehrheit der Zugriffe. Die Entscheidung liegt beim Aufrufer, weil sie von der Stufe abhängt — der Helfer `mustBlockOnLogFailure` macht die Regel an einer Stelle nachlesbar.

**Kein Fremdschlüssel auf `tenants`/`projects`** — ein forensisches Protokoll muss die Löschung seines Gegenstands überleben, dieselbe Begründung wie beim Mandanten-FK in α. Das ist eine **Abweichung von `communication_access_log`** (PROJ-119), das noch einen FK auf `projects` trägt und dessen Protokoll bei einer Projekt-Löschung mitverschwindet → **PROJ-Y-130k**.

**Bewusst noch nicht (→ δ2):** die Listen-GETs (die eigentliche In-App-Lesefläche) und die drei Report-RPCs mit ihren Exporten. Der Grund für Letztere ist nicht Bequemlichkeit, sondern **ungleiche Ableitbarkeit**: `steering_report` führt die Stufe an 5 Stellen und ist exakt auswertbar, `operative_report` lässt den Q&A-Abschnitt ohne Stufe (nur teilweise), und `dd_report_consolidated` führt sie **gar nicht** — dort bräuchte es eine Zweitabfrage. Diese Ungleichheit gehört in eine eigene Slice, nicht in eine Fußnote.

**Dauerhafte Negativliste** (gehört in die Freigabe): alles auf Stufe `standard` (damit trägt ein Nicht-M&A-Mandant null Zusatzlast) · Baum-, Dashboard- und Suchansichten · bei Downloads der **tatsächliche** Abruf.

**Live-Pentest `tests/sql/PROJ-130-delta1-confidential-read-pentest.sql` gegen Prod: 10/10 PASS, 0 Residuen.** Aussagekräftig sind: **B** `standard` wird still verworfen · **C** ein Fremder kann mit geratenen Projekt-IDs nichts schreiben (42501) · **D** ein Prüfer mit γ2-Freigabe darf protokollieren, **ohne** Projektmitglied zu sein (genau der Fall „externer Prüfer exportiert") · **F** ein gewöhnliches Projektmitglied darf das Protokoll **nicht** lesen · **H** Direkt-INSERT umgeht den RPC nicht · **I1** kein Fremdschlüssel.

**Zwei eigene Fehler unterwegs, beide korrigiert:** mein schmales Client-Interface passte strukturell nicht auf Supabases generisches `rpc` (jetzt ein Callback — typsicher **und** testbar ohne Client-Nachbau). Und ich habe Prettier über drei Dateien laufen lassen, obwohl das Projekt **keine** Prettier-Konfiguration hat und der Bestand ohne Semikolons schreibt — das hat 193 statt 20 Zeilen angefasst und wurde zurückgenommen; der Diff liegt jetzt bei 101 Einfügungen.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2786/2786** (357 Dateien, +9) · Build clean · `check:migration-naming` **0 Fehler**.

## Implementation Notes — PROJ-Y-130h (2026-08-11) — Test-Mandanten-Ausnahme

**Migration `20260811160000_projy130h_test_tenant_lifecycle_exempt.sql` in Prod angewendet.** PO-Entscheidung auf die aus γ1 gemeldete Beobachtung.

**Diagnose zuerst.** Alle 7 Streuzeilen gehörten dem Mandanten `e2e00000-0000-4e2e-8e2e-000000000002` („[E2E] Projektplattform Test"). Es gibt **zwei** solche Test-Mandanten; der Produktivmandant „IT-Couch GmbH" hatte 436 Audit-Zeilen und **null** Lifecycle-Rauschen. Die Ausnahme trifft also genau das, was sie treffen soll.

**Eine Ausnahme im Trail ist die Sorte stille Lücke, gegen die PROJ-130 antritt** — wird ein ausgenommener Mandant je für echte Daten benutzt, ist sein Protokoll unvollständig und ein späterer Prüfer sieht das nicht. Deshalb drei Sicherungen, ohne die ich das nicht gebaut hätte:

1. **Sichtbares Feld statt Trigger-Konstante:** `tenants.audit_lifecycle_exempt`. Kein magischer UUID-Vergleich im Trigger, den niemand mehr findet.
2. **Das Setzen ist selbst auditiert** — und zwar über den Feld-Audit-Pfad, der von der Ausnahme **nicht** betroffen ist. Wer die Ausnahme setzt, kann seine eigene Spur nicht damit verwischen. Die Migration prüft zusätzlich, dass der Feld-Audit-Trigger auf `tenants` überhaupt existiert; sonst wäre das Flag nominell getrackt, aber stumm.
3. **Bericht und Export weisen sie aus.** Damit das auch für die Zielgruppe funktioniert, brauchte es einen schmalen DEFINER-Helper `tenant_audit_lifecycle_exempt`: ein Blick auf `tenants` genügt nicht, weil die RLS dort Mitgliedschaft verlangt — und ein externer Prüfer mit γ2-Freigabe ist bewusst **kein** Mitglied, hätte den Hinweis also gerade nicht bekommen.

**Eng gefasst:** die Ausnahme gilt nur für Anlage/Löschung. Feldänderungen, Statuswechsel und Klassifikationsänderungen werden auch in Test-Mandanten weiter protokolliert — dort entsteht das Rauschen nicht, und der Verzicht hätte die Tests selbst weniger prüfbar gemacht.

**Kennzeichnung über den Namen (`[E2E]%`)**, nicht über eine UUID-Liste: so profitieren auch frisch aufgebaute Umgebungen, und die Post-Condition kann prüfen, dass **nichts ohne Test-Kennung** ausgenommen ist. Genau diese Prüfung ist der Grund für die Namenslösung.

**CSV-Hinweis nur im Ausnahmefall.** Ein gewöhnlicher Export bleibt byte-identisch (keine Parser brechen); nur beim ausgenommenen Mandanten steht eine `#`-Zeile voran. Ein Export, der als vollständiger Prüfnachweis durchgeht, muss den Vorbehalt in der Datei tragen, nicht nur in der Oberfläche.

**Live-Pentest `tests/sql/PROJ-Y-130h-test-tenant-exempt-pentest.sql` gegen Prod: 8/8 PASS, 0 Residuen.** Kern: **A** nur Test-Mandanten ausgenommen · **B** dort keine Anlage-Zeile · **C** Feldänderung dort trotzdem geloggt · **D** Produktivmandant unverändert · **E** Flag-Änderung selbst auditiert · **F** nach Widerruf protokolliert er wieder · **G** α-Wächter und γ1/γ2-Lesetor unberührt.

**Mein eigener Test hat dabei eine Regression gefangen:** die Export-Route ruft jetzt eine zweite RPC, und die Zusicherung „der Admin-Pfad ruft gar keine RPC" war zu grob. Präzisiert auf „nicht die Freigabe-RPC" — die Ausnahme-RPC gehört zur Antwort, nicht zur Autorisierung.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2777/2777** (+2) · Build clean · `check:migration-naming` **0 Fehler**.

## Implementation Notes — γ3 (2026-08-11, `/backend`) — Objektarten-Register

**Keine Migration, keine DB-Änderung.** γ3 behebt einen reinen TypeScript-Defekt mit sehr konkreter Wirkung.

**Der Befund, quantifiziert:** In Prod tragen **22** Objektarten tatsächlich Audit-Zeilen. Das TS-Register kannte **15** Werte, von denen sich nur **8** mit den vorhandenen Daten überschnitten. **14 der 22 real protokollierten Objektarten waren über die API überhaupt nicht abfragbar** — darunter `tenants`, `tenant_settings`, `role_rates`, `budget_postings`, `resources`, `organization_units`, `context_sources` und `tenant_ai_providers`. Beide Audit-Routen validieren mit `z.enum(AUDIT_ENTITY_TYPES)`, ein Filter auf eine dieser Arten gab also **400**, und im Dropdown fehlten sie. Die Einträge existierten, waren aber unerreichbar.

**Der strukturelle Teil ist wichtiger als die Liste.** Vorher waren Union und Array **zwei handgepflegte Kopien**, und das Array war als `readonly AuditEntityType[]` typisiert — womit der `as const`-Tupel-Charakter verloren ging. Ein Wert in der Union ohne Array-Eintrag kompilierte sauber und wurde danach still mit 400 abgelehnt. Genau dieses Loch hat die Drift auf 15-gegen-88 wachsen lassen. Die Union wird jetzt **aus dem Array abgeleitet** (`(typeof AUDIT_ENTITY_TYPES)[number]`); die beiden können nicht mehr auseinanderlaufen. `AUDIT_ENTITY_LABELS` bleibt ein totaler `Record` und erzwingt damit ein deutsches Label pro neuem Wert.

**Was TypeScript nicht prüfen kann**, ist die Übereinstimmung mit dem DB-CHECK. Dafür ein Test gegen einen eingefrorenen Constraint-Abzug (88 Werte): läuft er rot, ist entweder eine Migration ohne TS-Nachzug gelandet oder umgekehrt. Dazu Tests auf Label-Vollständigkeit, keine Labels für Unbekannte, Duplikatfreiheit, erhaltener Tupel-Charakter (via `@ts-expect-error` auf einen erfundenen Wert) und Abdeckung der von α/β/γ2 neu hinzugekommenen Arten.

**Nebeneffekt der Verbreiterung:** das Filter-Dropdown wuchs von 15 auf 88 Einträge und war nach *technischem* Namen sortiert, während es deutsche Labels anzeigt — also scheinbar willkürlich geordnet. Einmal nach Label sortiert (`localeCompare` mit `de`). Eine suchbare Combobox wäre bei 88 Optionen die bessere Lösung → **PROJ-Y-130j**.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** (kein einziger Konsument brach — es gibt im Bestand keine erschöpfenden `switch`-Anweisungen über die Union) · vitest **2775/2775** (356 Dateien, +6) · Build clean.

**Offen in γ:** nur noch γ2b, die Verwaltungs-Oberfläche für die Revisions-Freigaben (heute über `GET/POST/DELETE /api/tenants/[id]/audit-readers` bedienbar).

## Implementation Notes — γ2 + γ4 (2026-08-11, `/backend`) — Revisions-Leseberechtigung

**Migration `20260811140000_proj130_gamma2_audit_reader_grants.sql` in Prod angewendet.**

**Keine vierte Mandanten-Rolle.** `tenant_memberships.role` ist die Achse hinter `is_tenant_member`/`has_tenant_role` und damit hinter praktisch jeder Zugriffsregel. Ein Wert `'auditor'` hätte den Revisor automatisch zum Mandanten-Mitglied gemacht — überall lesend, wo nur Mitgliedschaft geprüft wird. Das ist das Gegenteil einer rein lesenden Revision. Stattdessen die Tabelle **`audit_reader_grants`** nach dem Muster von `ma_confidentiality_clearances`: genau eine SELECT-Policy, **keine** schreibenden Policies, alle Writes über `grant_audit_reader` / `revoke_audit_reader` (SECURITY DEFINER, admin-gated, kein Actor-Parameter, `anon` EXECUTE entzogen). `valid_until` nullbar — damit ist der befristete externe Prüfer ein Datum, **kein neues Token-Verfahren**.

**Der wichtigste Zusammenhang: die Freigabe ersetzt die Mitgliedschaft, nicht die Klassifikation.** Im Lesetor steht jetzt `is_project_member(projekt) OR has_audit_reader_grant(mandant)`, und **dahinter unverändert** die γ1-Prüfung. Ein Auditor ohne Vertraulichkeits-Freischaltung sieht `strict`-Einträge also weiterhin nicht. Wieder genau **ein** Anker — die Zeile, die γ1 eingefügt hat — mit Eindeutigkeits-Zählung und Zweig-Zahl-Kontrolle.

**Die Freigabe ist selbst auditpflichtig.** Wer wem Einsicht in den Trail gibt, ist ein Governance-Ereignis: entity_type-CHECK 87 → 88, Whitelist-Zweig (`valid_from`/`valid_until`/`note` — Identitätsspalten bewusst nicht), plus Feld- und Lifecycle-Trigger. Eine `can_read_audit_entry`-Zweig braucht die Tabelle nicht: sie fällt auf `else return false` und ist damit korrekt admin-only.

**γ4 fiel dabei fast von selbst an.** Der Export ist der Kern des Prüfer-Auftrags, war aber `requireTenantAdmin`-gegated — ein externer Prüfer kam nicht heran. Neuer Helper `requireAuditRead` (Admin **oder** gültige Freigabe) ersetzt das Gate, und `redaction_off` bleibt **Admin-Vorbehalt**: sonst wäre die Class-3-Redaktion über einen befristeten Zugang aushebelbar. Die Absage kommt **vor** der Abfrage, es wird also weder gelesen noch protokolliert.

**Die Berichts-Route brauchte keine Änderung** — sie hat gar keine Mitgliedschaftsprüfung, und `requireModuleActive` fällt bei unsichtbaren Settings bewusst offen zurück. Dort gatet ausschließlich RLS, und die kennt die Freigabe jetzt. Verifiziert am Code, nicht angenommen.

**Bekannte Grenze, bewusst so.** Zweige des Lesetors, die direkt `is_tenant_member(...)` oder `return false` liefern, umgehen den gemeinsamen Ausgang — ein Auditor **ohne** Mandanten-Mitgliedschaft sieht deshalb keine mandantenweiten Katalogänderungen (Lieferanten, Skills, Vorlagen) und keine der admin-only Objektarten. Für den Deal-Prüfungsauftrag (projektbezogene Vorgänge) ist das die richtige Grenze; die Ausweitung wäre 9 weitere Einzel-Ersetzungen und gehört nicht in dieselbe Migration. → **PROJ-Y-130i**.

**Live-Pentest `tests/sql/PROJ-130-gamma2-audit-reader-pentest.sql` gegen Prod: 11/11 PASS, 0 Residuen.** Kern-Paar: **D** der Prüfer sieht Einträge **ohne** Projektmitgliedschaft · **E** er sieht `strict` **nicht** (γ1 hält). Dazu: ohne Freigabe nichts sichtbar; Nicht-Admin darf nicht vergeben (42501); Admin vergibt über den echten RPC; die Freigabe erzeugt ihren eigenen `__created`-Eintrag; fremde Freigaben sind für Dritte unsichtbar; **abgelaufene Freigabe wirkt nicht**; Admin widerruft; `anon` 42501; Lesetor trägt γ1 **und** γ2.

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2769/2769** (355 Dateien, +14: 9 Freigabe-Route, 5 Export-Gate) · Build clean (neue Route registriert) · `check:migration-naming` **0 Fehler**.

**Offen in γ:** γ3 TS-Enum-Öffnung (15 von 88 Werten sichtbar; `AUDIT_ENTITY_LABELS` ist der einzige Exhaustiveness-Zwang, und das Array ist als `readonly AuditEntityType[]` typisiert — ein neuer Union-Wert ohne Array-Eintrag kompiliert sauber und wird dann still mit 400 abgelehnt) · Verwaltungs-Oberfläche für die Freigaben (heute nur über die API) → **γ2b**.

## Tech Design — δ2 (2026-08-12) — Auswertungen und In-App-Lesen

δ1 hat zwei Flächenklassen ausdrücklich offen gelassen: die drei Auswertungs-Funktionen samt Exporten und Druckseiten, und die Listen-GETs als eigentliche In-App-Lesefläche. δ2 schließt beide.

**Der Widerspruch, den δ2 auflösen muss.** Die veröffentlichte Negativliste (CIA-Auflage 5) nennt „Listenansichten, Baumansichten, Dashboards und Suchergebnisse" als *nie* protokolliert — δ1 hat die Listen-GETs aber nach δ2 verschoben, weil die geplante Positivliste „Detailansichten" auf Flächen zeigte, die es nicht gibt. Der Bestand bestätigt das erneut: von den Einzelobjekt-Routen hat **nur `risks/[rid]` überhaupt einen GET-Handler**, alle anderen (`dd-questions/[qid]`, `spa-issues/[issueId]`, `dd-streams/[streamId]`, `committees/[cid]`, `tree/nodes/[nodeId]`) sind reine Schreibpfade. Wer „nie Listen" wörtlich nimmt, protokolliert in der Anwendung nichts — und AC-1 („Zugriff auf Strictly Confidential wird protokolliert") bleibt unerfüllt.

**Die Regel, die stattdessen gilt** — eine Zeile, an einer Stelle im Code, in der Freigabe veröffentlicht:

> **Austritt** (Download-Link, CSV-Export, Druckseite) wird ab `confidential` protokolliert. **In-App-Lesen** (Listen, Auswertungs-Ansicht) wird **nur bei `strict`** protokolliert.

Das amendiert die Negativliste **eng und sichtbar**: Listenansichten bleiben unprotokolliert, *außer* die Antwort enthält `strict`-Inhalte. Begründung: `strict` ist die Stufe, für die überhaupt Rechenschaft zugesagt ist; sie ist selten, also bleibt die Mengenkurve flach und ein Nicht-M&A-Mandant trägt weiterhin **null** Zusatzlast. Bei `confidential` wäre das Gegenteil der Fall — `ma_valuations` trägt `confidential` als Default, jede Bewertungsliste würde schreiben.

**Entprellung statt Mengenexplosion.** Wiederholtes Lesen derselben Fläche (Neuladen, React-Refetch, zweifacher Server-Render einer Druckseite) erzeugt genau **eine** Zeile pro 15-Minuten-Fenster je (Akteur, Projekt, Objektart, Aktion, Stufe). Die Entprellung sitzt **in der RPC**, nicht im Aufrufer, und ist an die Aktion gebunden (`list_read`/`report_read`) statt an einen neuen Parameter — die Signatur bleibt damit unverändert, `create or replace` genügt. Bewusster Verlust: Wiederholungen innerhalb des Fensters sind nicht einzeln nachweisbar. Das Protokoll bleibt **append-only** (keine Zähler-Updates), sonst wäre der forensische Wert beschädigt.

**Die Stufe kommt aus der Auswertung selbst, nicht aus ihrer Nutzlast.** Der naheliegende Weg — die Route summiert die Stufen der zurückgegebenen Zeilen wie bei δ1 — trägt für Auswertungen **nicht**: `steering_report` aggregiert Stage-Gates in `stage_gate_summary` und `pre_read`, `operative_report` und `dd_report_consolidated` aggregieren Findings und Fragen zu Zählern. Deren Stufen erscheinen in der Nutzlast nie, und ein aus der Nutzlast gerechneter Höchstwert würde **unterberichten** — die gefährliche Richtung für ein forensisches Protokoll. Deshalb liefert jede der drei Funktionen einen neuen Schlüssel `confidentiality` = `{max_level, confidential_count}`, berechnet über **genau die Quellen, die sie liest, in der Granularität, in der sie sie liest** (Auswertung läuft INVOKER → nur was der Aufrufer sehen darf). `dd_report_consolidated` führte die Stufe bislang an **null** Stellen; damit ist die von δ1 gemeldete „ungleiche Ableitbarkeit" beseitigt, ohne die Nutzlast mit Zeilen-Stufen aufzublähen.

**Eingriff in die drei live Funktionen: Anker am Ende, nicht Neutippen.** Alle drei enden identisch auf `\n  );\n$function$`. Die Migration liest `pg_get_functiondef`, fügt den neuen Schlüssel **vor** diesem Ende ein und führt das Ergebnis aus — Eindeutigkeits-Zählung des Ankers, harter Abbruch bei unerwarteter Form, Idempotenz-Sprung wenn der Schlüssel schon da ist, und eine **verhaltensbasierte** Post-Condition (Funktion aufrufen, Schlüssel muss existieren). Kein Retypen von 27 KB Funktionskörper (Transkriptionsrisiko), keine Regex-Chirurgie im Inneren.

**Kein Drift-Register, sondern ein Wächter.** 12 Inhalts-Listen zu verdrahten heißt: die nächste neue vertrauliche Liste wird es vergessen — genau die Krankheit, die PROJ-130 behandelt. Ein datengetriebener Test zählt darum alle Routen, die `confidentiality_level` lesen, und verlangt für jede entweder eine Protokollierung **oder** einen benannten Eintrag in einer Ausnahmeliste mit Grund. Neue Fläche ohne Entscheidung → roter Test.

**Ausnahmen (mit Grund, nicht stillschweigend):** `access-explain`/`access-overview` (Governance-Sichten ohne Inhalte — sie *sind* die Need-to-know-Auskunft) · `documents/tree` (Baumansicht = dauerhafte Negativliste; der Austritt ist über den Download aus δ1 gedeckt) · `communication-entries` inkl. Export (**eigenes** Protokoll aus PROJ-119 — Doppelprotokollierung wäre ein zweites driftendes Register) · `ma-project-templates` (Mandanten-Katalog, keine Projektinhalte).

**Ausfallverhalten** bleibt die δ1-Regel, jetzt auch für Listen und Auswertungen: schlägt das Protokollieren von `strict` fehl, wird nicht ausgeliefert (Liste → 500, Druckseite → 404). Bei `confidential` best-effort.

**Abgrenzung.** Kein Frontend-Anteil (die Auswertungs-Sicht der Protokollzeilen ist γ2b/ε-Thema) · keine Retention (α: unbegrenzt) · `risks`-Einzelroute wird mitgenommen, weil sie der einzige echte Detail-GET ist.

## Implementation Notes — δ2 (2026-08-12, `/backend`) — Auswertungen und In-App-Lesen

**Migration `20260812093000_proj130_delta2_report_and_list_reads.sql` in Prod angewendet** (registrierte Version `20260812092101`, Drift benign — die Migration ist durchgängig idempotent: `drop constraint if exists`, `create or replace`, Marker-gesteuerter Idempotenz-Sprung; PROJ-134-Domäne). Der angewendete Text entspricht der Repo-Datei in **jeder Anweisung**; die Repo-Datei trägt zusätzliche Kommentarblöcke.

**Der Widerspruch war echt und ist eng aufgelöst.** Die veröffentlichte Negativliste sagt „Listenansichten nie", δ1 hatte sie nach δ2 verschoben. Der Bestand bestätigt δ1s Befund erneut: von den Einzelobjekt-Routen hat **nur `risks/[rid]` einen GET-Handler**, alle anderen sind reine Schreibpfade. Neue Regel, an **einer** Stelle im Code (`shouldLogRead`) und hier veröffentlicht:

| Fläche | Schwelle | Aktion |
|---|---|---|
| Download-Link, CSV-Export, Druckseite (**Austritt**) | ab `confidential` | `download_url_issued` · `export` · `report_read` |
| Liste, Auswertungs-Ansicht (**In-App**) | **nur `strict`** | `list_read` · `report_read` |

Damit bleibt die Negativliste im Kern gültig (Listen protokollieren nicht) mit der genannten Ausnahme. Bei `confidential` wäre das Gegenteil passiert: `ma_valuations` trägt `confidential` als Default — jede Bewertungsliste hätte geschrieben.

**Entprellung in der RPC, nicht im Aufrufer.** `list_read`/`report_read` erzeugen eine Zeile pro 15-Minuten-Fenster je (Akteur, Projekt, Objektart, Aktion, Stufe). An die **Aktion** gebunden statt an einen neuen Parameter → Signatur unverändert, `create or replace` genügt, und die Regel greift auch, wenn ein künftiger Aufrufer den TS-Helfer umgeht. Austritts-Aktionen werden **nicht** entprellt (jeder Export ist ein eigener Vorgang). Das Protokoll bleibt append-only — kein Zähler-Update, das den forensischen Wert beschädigen würde.

**Die Stufe kommt aus der Auswertung, nicht aus ihrer Nutzlast — und das ist keine Stilfrage.** `steering_report` aggregiert Stage-Gates in `stage_gate_summary`/`pre_read`, `operative_report` und `dd_report_consolidated` aggregieren Findings und Fragen zu Zählern; deren Stufen erscheinen in der Nutzlast **nie**. Ein aus der Nutzlast gerechneter Höchstwert würde damit **unterberichten** — die gefährliche Richtung für ein forensisches Protokoll. Jede der drei Funktionen liefert deshalb `confidentiality = {max_level, confidential_count}`, berechnet über genau die Quellen, die sie liest, in der Granularität, in der sie sie liest. `dd_report_consolidated` führte die Stufe vorher an **null** Stellen — die von δ1 gemeldete „ungleiche Ableitbarkeit" ist damit beseitigt.

**Eingriff in drei live Funktionen über EINEN Anker.** Alle drei enden identisch auf `\n  );\n$function$`; die Migration liest `pg_get_functiondef`, zählt den Anker (≠1 → harter Abbruch, keine Blindpatchung), springt bei vorhandenem Marker, führt das Ergebnis aus und prüft danach **verhaltensbasiert** (Funktion aufrufen, Schlüssel muss existieren) plus katalogseitig, dass alle drei weiterhin `SECURITY INVOKER`/`STABLE` sind. Kein Neutippen von 27 KB Funktionskörper, keine Regex-Chirurgie im Inneren.

**Was das TS-Pflichtfeld gefangen hat.** `confidentiality` ist in allen drei Report-Typen **Pflicht** (γ3-Lehre: was nicht kompiliert, driftet nicht). Der erste `tsc`-Lauf deckte damit **vier** Konstruktionsstellen auf, die ich nicht auf dem Schirm hatte — die drei Client-Wrapper (`fetchDdReport`, `fetchOperativeReport`, `fetchSteeringReport`) mit eigenen Leer-Fallbacks — und die Operativ-Route trug zusätzlich eine **untypisierte lokale Kopie** von `EMPTY_OPERATIVE_REPORT`, die das neue Feld still ignoriert hätte; sie ist jetzt durch die geteilte, typisierte Konstante ersetzt. Die beiden CSV-Export-Routen führen bewusst eigene schmale Interfaces — die schweigen nicht mehr über die Stufe.

**Abdeckungs-Wächter statt fünftes Register.** 17 verdrahtete Leseflächen wären ohne Wächter die nächste Drift. `src/lib/audit/confidential-read-coverage.test.ts` zählt alle Routen, die `confidentiality_level` lesen, und verlangt für jede eine **Entscheidung**: protokollieren oder benannte Ausnahme mit Grund. Zweite Regel: wer eine Auswertungs-RPC aufruft, muss protokollieren (fängt die Druckseiten, die keine Stufe im Code führen). **Rot-Grün bewiesen** — Import aus `deliverables/route.ts` entfernt → roter Test mit Handlungsanweisung; Import aus der Steering-Druckseite entfernt → zweite Regel schlägt an.

**Verdrahtet (17):** 12 Inhalts-Listen (DD-Streams · DD-Fragen · DD-Findings · Eskalationen · SPA-Issues · Bewertungen · Deliverables · Risiken · Workstreams · Gremien · Sitzungen · M&A-Grundlage) + 2 Einzelobjekt-GETs (Risiko-Detail, Sitzungs-Detail) + 3 Auswertungen × 3 Flächen (Ansicht, CSV, Druck). Der δ1-Download nutzt jetzt denselben Helfer statt einer inline-Kopie der Regel.

**Begründete Ausnahmen (6):** `documents/tree` (Baumansicht = Negativliste; Austritt via Download gedeckt) · `access-overview`/`access-explain` (Governance-Auskunft ohne Inhalte) · `communication-entries` + dessen Export (**eigenes** Protokoll aus PROJ-119 — Doppelprotokollierung wäre das zweite driftende Register) · `ma-project-templates` (Mandanten-Katalog).

**Live-Nachweise gegen Prod, alle mit Rollback und 0 Residuen** (nachgezählt: 0 Protokollzeilen, 0 gesäte Streams/Findings, 0 Pentest-Mandanten, 0 Freigaben, 0 Clearances):
- **δ2-Pentest `tests/sql/PROJ-130-delta2-report-read-pentest.sql`: A–K 11/11 PASS.** Kern sind E/F/G — die **Aggregat-Leck-Probe über alle drei Auswertungen**: ein Mitglied mit `confidential`-Freigabe sieht in `confidentiality.max_level` **`confidential`**, der Administrator **`strict`** (DD-Bericht zusätzlich `1` gegen `2` vertrauliche Objekte). Die Zusammenfassung entsteht also im Aufrufer-Kontext und verrät die Existenz des strengsten Objekts nicht. H beweist, dass der Klassifikations-Filter auch auf die Zusammenfassung wirkt (Filter `standard` → `standard`, obwohl `strict` existiert). C/D beweisen Entprellung und ihre Abwesenheit beim Austritt.
- **Regressionen verbatim:** PROJ-116 **A–H 8/8** · PROJ-131 **A–G 7/7** · PROJ-132 **A–I 9/9** · PROJ-130-δ1 **A–I 10/10**. Zusatz-Vektoren aus δ2 in denselben Läufen: die Zusammenfassung fällt für einen fremden Mandanten auf `standard` und — aussagekräftig — **auch für einen externen Berater mit abgelaufenem Mandat**, obwohl seine Clearance intakt ist (das Berater-Tor aus PROJ-99/141-γ8 wirkt also auch auf die neue Zusammenfassung).
- Advisors **0 ERROR** / 137 WARN; der einzige δ2-bezogene WARN ist der beabsichtigte `authenticated_security_definer_function_executable` auf `log_confidential_read` (der einzige Schreibweg muss aufrufbar sein — unverändert seit δ1).

**Gates:** ESLint **0** · tsc **13 vorbestehend / 0 neu** · vitest **2802/2802** (358 Dateien, +16: 11 Regel-/Helfer-Tests, 5 Abdeckungs-Wächter) · Build clean · `check:migration-naming` **0 Fehler**.

**Drei Funde, ehrlich protokolliert:**
- **F-1 (δ1-Altlast, behoben):** δ1s Pentest-Vektor B („`standard` wird still verworfen") zählte **in der Mitglieds-Rolle** — die das Protokoll per RLS gar nicht lesen darf (Vektor F desselben Tests beweist das). Er hätte also auch dann PASS gemeldet, wenn `standard`-Zeilen geschrieben würden. Ein Test, der immer besteht, ist schlimmer als keiner; die Zählung läuft jetzt als `postgres`, der Vektor ist danach **echt** grün.
- **F-2 (eigener Fehler, vor jeder Schlussfolgerung behoben):** derselbe blinde Zählpfad steckte im ersten δ2-Pentest-Lauf (A/C/D meldeten „0 Zeilen"). Erkannt, weil Vektor J im selben Lauf genau diese RLS-Sperre bewies — die Zahlen widersprachen sich, nicht das Produkt.
- **F-3 (Prozess):** ein `git checkout <datei>` zum Zurücksetzen eines Rot-Grün-Experiments hat die noch **uncommitteten** δ2-Änderungen in zwei Dateien mitgelöscht. Sofort neu angewendet und verifiziert; Lehre: Experimente auf noch nicht committeter Arbeit über eine Kopie zurücknehmen, nicht über `git checkout`.

**Abweichungen:**
- Die **veröffentlichte Negativliste ist amendiert** (Listen protokollieren bei `strict`) — eng, begründet und in dieser Spec sichtbar, nicht stillschweigend.
- `confidential_count` einer Auswertung ist eine **Obergrenze innerhalb ihres Umfangs**: die Zusammenfassung respektiert Projekt-Umfang und den Klassifikations-Filter, ignoriert aber die Verengung nach Workstream/Verantwortlichem/Phase. Sie kann damit über-, aber **nie** unterberichten — die einzige Richtung, die für ein forensisches Protokoll vertretbar ist.
- Wiederholungen innerhalb von 15 Minuten sind nicht einzeln nachweisbar (Preis der Entprellung).
- Kein Frontend-Anteil: die Auswertungs-Sicht auf die Protokollzeilen bleibt γ2b/ε.

**Offen in PROJ-130:** γ2b (Verwaltungs-Oberfläche für die Revisions-Freigaben) und ε (Hash-Anker + Verifikationslauf).

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
