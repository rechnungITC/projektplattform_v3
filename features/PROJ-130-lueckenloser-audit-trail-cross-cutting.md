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

## Status: Architected
**Created:** 2026-06-10
**Architected:** 2026-08-11 (CIA-reviewed, GO-mit-Auflagen — Tech Design unten)
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
| **γ** | Leseberechtigung + Maskierung | Auditor-Rolle, befristeter externer Prüfer, Wertmaskierung gegen Need-to-know, Suche/Export für alle Objektarten öffnen | 2,0 | vor erstem externen Audit |
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

**Wertmaskierung: der Trail darf kein Seitenkanal sein.** Heute liest ein Mandanten-Administrator den gesamten Trail bedingungslos — einschließlich der Vorher-/Nachher-Werte von Objekten, die nach Need-to-know für ihn gesperrt sind. Mit einem Auditor und einem externen Prüfer verschärft sich das. γ maskiert deshalb die Werte, wo die Vertraulichkeitsprüfung negativ ausfällt, und lässt die Metadaten (wer, wann, welches Objekt, welches Feld) sichtbar. Die Maskierung sitzt in der Leseschicht, damit sie alle drei Leseflächen trifft — Objekt-Historie, Bericht, Export — und nicht in der Oberfläche.

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

### Handoff

α und β sind rein serverseitig (Datenbank + Auswertungs-Schicht) → nächster Schritt ist `/backend`. γ und δ bringen Oberflächenanteile (Freigabe-Verwaltung, Maskierungs-Darstellung) → dort `/frontend` nach dem jeweiligen Backend-Teil. ε ist wieder rein serverseitig.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · L — Vertraulichkeit, NDA & Audit_
