> **Inherited from V2** — Decision still applies to V3. Stack-specific references (FastAPI, Redis, etc.) are historical; Supabase/Next.js V3 implementations follow the same principle.

# Entscheidung: Offene Product-Punkte vor Sprint 1
Datum: 2026-04-20  
Status: entschieden  
Betrifft: F01.1, F01.5  
Auslöser: review_wave-1-delivery-plan_v1.md — drei Blocker vor Sprint-1-Start

---

## Übersicht

| # | Thema | Entscheidung | Betroffene Stories |
|---|---|---|---|
| D-P1 | Archivierung vs. Lifecycle-Status | „Archiviert" = „Abgeschlossen" — ein Status, eine Aktion | S01.1.4, S01.5.3 |
| D-P2 | Projektsichtbarkeit | Alle Projekte der Organisation für alle authentifizierten Nutzer sichtbar | S01.1.3 |
| D-P3 | Projektnummer | Optional, Freitext, kein Formatzwang | S01.1.1 |

---

## D-P1 — Archivierung vs. Lifecycle-Status „Abgeschlossen"

### 1. Entscheidungsfrage

Ist „archiviert" ein eigener sechster Lifecycle-Status, eine boolesche Flag zusätzlich zum Status „Abgeschlossen", oder ist „Archivieren" lediglich die UI-Bezeichnung für den Lifecycle-Übergang zu „Abgeschlossen"?

Diese Frage blockiert S01.1.4 und S01.5.3 vollständig, weil beide Stories auf unterschiedlichen Modellannahmen aufbauen.

### 2. Optionen

**Option A — „Archiviert" als eigener sechster Status**  
Statusmodell: Entwurf → Aktiv → Pausiert → Abgeschlossen → Abgebrochen → Archiviert  
Problem: Unklare Abgrenzung zwischen „Abgeschlossen" und „Archiviert". Würde „Abgeschlossen" dann noch in der aktiven Liste erscheinen? Zwei Statuswerte für dasselbe Ergebnis (nicht mehr aktiv, Daten erhalten). Schafft Governance-Drift-Risiko: Was unterscheidet Abschluss von Archivierung fachlich?

**Option B — „Archiviert" als boolesche Flag (`is_archived`)**  
Lifecycle-Status bleibt fünfwertig, zusätzlich eine Flag. Vorteil: Auch „Abgebrochene" Projekte können archiviert (ausgeblendet) werden. Nachteil: Zwei Konzepte (Status + Flag) für eine Frage (soll das Projekt sichtbar sein?). Erhöht Datenmodellkomplexität in Welle 1 unnötig.

**Option C — „Archivieren" als Aktion, die Status „Abgeschlossen" setzt**  
„Archivieren" ist die UI-Bezeichnung der Nutzeraktion; das technische Ergebnis ist Lifecycle-Status `Abgeschlossen`. Kein zusätzliches Datenbankfeld, kein zusätzlicher Status. „Abgebrochene" Projekte werden durch den bestehenden Lifecycle-Filter (Standardansicht blendet `Abgeschlossen` und `Abgebrochen` aus) bereits automatisch aus der aktiven Liste entfernt — kein separater Archivierungsschritt notwendig.

### 3. Empfohlene Entscheidung

**Option C.** „Archivieren" ist die Nutzeraktion, die den Lifecycle-Status auf `Abgeschlossen` setzt. „Archiviert" ist kein eigener Status und keine separate Flag.

### 4. Begründung

- S01.5.5 (Lifecycle-Filter) blendet `Abgeschlossen` und `Abgebrochen` bereits in der Standardansicht aus — das gewünschte Verhalten von „Archivieren" ist damit strukturell bereits im Statusmodell enthalten.
- Ein sechster Status oder eine separate Flag löst kein fachliches Problem, das nicht bereits durch das bestehende Fünf-Status-Modell abgedeckt ist.
- Option B wäre nur sinnvoll, wenn „Abgeschlossen" künftig in der Standardansicht erscheinen soll — das widerspricht S01.5.5.
- Option A würde eine Abgrenzungsfrage erzeugen, die fachlich nicht beantwortet werden kann: Was unterscheidet ein abgeschlossenes von einem archivierten Projekt?
- „Archivieren" als Aktionsbezeichnung bleibt in der UI nutzbar — es ist ein verständlicher Begriff. Er beschreibt nur die Nutzerintention, nicht einen eigenen Systemzustand.

### 5. Auswirkungen auf bestehende Stories

**S01.1.4 (Projekt archivieren)**  
- AC „Aktion setzt den Lifecycle-Status auf 'Abgeschlossen' oder legt den Archivierungsstatus explizit gesondert ab" → Zweite Option entfällt. Eindeutig: Aktion setzt Lifecycle-Status auf `Abgeschlossen`.
- AC „Archivieren ist reversibel" bleibt, aber präzisiert: entspricht S01.5.3 AC „Reaktivierung durch explizite Bestätigung".
- Offene Frage „Ist 'archiviert' ein eigener Lifecycle-Status oder eine Flag?" → ENTSCHIEDEN: Weder noch. „Archivieren" = UI-Aktion für Lifecycle-Übergang zu `Abgeschlossen`.
- Story bleibt eigenständig als nutzerorientierter Einstiegspunkt für die Aktion. Verweist auf S01.5.3 für das Lifecycle-Verhalten.

**S01.5.3 (Projekt abschließen)**  
- AC „Ein abgeschlossenes Projekt kann reaktiviert werden" bleibt.
- Offene Frage „Ist 'Archiviert' ein eigener Lifecycle-Status oder eine Flag?" → ENTSCHIEDEN (s. o.).
- Story-Titel kann ergänzt werden: „Projekt abschließen / archivieren" — beide Bezeichnungen sind gültige UI-Label für dieselbe Aktion.

### 6. Auswirkungen auf Sprint 1

Keine Auswirkung auf Sprint-1-Inhalt. S01.1.4 und S01.5.3 bleiben in Sprint 4. Der Blocker ist aufgelöst: beide Stories sind nach dieser Entscheidung implementierungsreif.

### 7. Risiken, wenn offen gelassen

- S01.1.4 und S01.5.3 können nicht implementiert werden — zwei Stories mit kollidierten Annahmen erzeugen widersprüchliche Datenbankschemas.
- Entwickler müssen selbst entscheiden, ob `archived`-Flag oder 6. Status gebaut wird — Gefahr divergierender Implementierungen.
- Spätere Governance-Features (E04) bauen auf dem Lifecycle-Statusmodell auf. Ein nachträglicher sechster Status würde alle Transition-Regeln aufbrechen.

### 8. Konkrete Änderungsbedarfe an Story-Dateien

**story_projektstammdaten.md — S01.1.4:**
- AC: „Aktion setzt den Lifecycle-Status auf 'Abgeschlossen'" — zweite AC-Option entfernen
- Offene Fragen: Eintrag ersetzen durch: „ENTSCHIEDEN (D-P1, 2026-04-20): 'Archivieren' ist die Nutzeraktion für den Lifecycle-Übergang zu 'Abgeschlossen'. Kein eigener Status, keine separate Flag."

**story_lifecycle-status.md — S01.5.3:**
- Titel ergänzen: „Projekt abschließen / archivieren"
- Offene Fragen: Eintrag ersetzen durch: „ENTSCHIEDEN (D-P1, 2026-04-20): 'Archiviert' ist kein eigener Lifecycle-Status. 'Archivieren' und 'Abschließen' sind synonyme Bezeichnungen für dieselbe Lifecycle-Aktion."

---

## D-P2 — Projektsichtbarkeit

### 1. Entscheidungsfrage

Sieht ein authentifizierter Nutzer in der Projektliste alle Projekte der Organisation, oder nur die Projekte, denen er als Mitglied oder Verantwortlicher zugeordnet ist?

Diese Entscheidung bestimmt, ob RBAC in Welle 1 einen Row-Level-Sichtbarkeitsfilter braucht — oder nur Bearbeitungsrechte steuert.

### 2. Optionen

**Option A — Alle Projekte der Organisation sichtbar**  
Jeder authentifizierte Nutzer sieht alle Projekte. RBAC steuert Bearbeitungsrechte (wer darf ein Projekt anlegen, bearbeiten, löschen), nicht Lesezugriff. Keine Mitgliedschaftslogik notwendig.

**Option B — Nur eigene / zugewiesene Projekte sichtbar**  
Nutzer sieht nur Projekte, bei denen er als Verantwortlicher, Mitglied oder Stakeholder eingetragen ist. Benötigt ein Mitgliedschaftsmodell (Projekt ↔ Nutzer-Zuordnung) — das in Welle 1 noch nicht existiert (F03.3 Stakeholder ist blockiert).

**Option C — Alle sichtbar, aber filterbar nach „meine Projekte"**  
Alle Projekte sichtbar; zusätzlicher Filter „Meine Projekte" zeigt nur eigene. Mittelweg, aber erzeugt sofort die Frage, was „eigen" bedeutet — dasselbe Mitgliedschaftsproblem wie Option B.

### 3. Empfohlene Entscheidung

**Option A.** In Welle 1 sieht jeder authentifizierte Nutzer alle Projekte der Organisation. RBAC steuert ausschließlich Bearbeitungsrechte.

### 4. Begründung

- Option B setzt ein Projekt-Mitgliedschaftsmodell voraus, das in Welle 1 noch nicht existiert. F03.3 (Stakeholder-Management) ist blockiert. Option B jetzt umzusetzen, bedeutet entweder F03.3 vorzuziehen (was andere Abhängigkeiten erzeugt) oder ein provisorisches Mitgliedschaftsmodell zu bauen, das später aufgeräumt werden muss.
- Die Plattform richtet sich an Organisations-interne Nutzer auf einem gemeinsamen System. Vollständige Sichtbarkeit aller Projekte ist in Enterprise-Umgebungen bei internen Tools die häufigste Grundeinstellung — differenzierte Sichtbarkeit ist ein Governance-Feature, kein Core-Feature.
- Row-Level-Sichtbarkeitsfilter kann in Welle 2 sauber nachgerüstet werden, wenn F03.3 (Stakeholder, Projektzugehörigkeit) implementiert ist.
- Option A ermöglicht S01.1.3 sofort ohne Zusatzkomplexität.

### 5. Auswirkungen auf bestehende Stories

**S01.1.3 (Projektliste einsehen)**  
- AC: „Die Projektliste zeigt alle Projekte, auf die der angemeldete Nutzer Zugriff hat" → präzisieren: „Die Projektliste zeigt alle Projekte der Organisation. In Welle 1 haben alle authentifizierten Nutzer Lesezugriff auf alle Projekte. Bearbeitungsrechte werden über RBAC gesteuert."
- Offene Frage „Welche Projekte sieht ein Nutzer: nur eigene oder alle der Organisation?" → ENTSCHIEDEN.

**S01.1.2 (Projekt bearbeiten)**  
Keine Änderung. AC „Bearbeitung nur für berechtigte Nutzer über RBAC" ist bereits korrekt.

**S01.5.x (Lifecycle-Statuswechsel)**  
Statuswechsel-Aktionen (Starten, Pausieren, Abschließen) setzen RBAC-Berechtigungen voraus — diese bleiben unverändert.

### 6. Auswirkungen auf Sprint 1

S01.1.3 ist mit dieser Entscheidung **vollständig bereit** für Sprint 1. Keine Row-Level-Filter-Implementierung nötig. Die RBAC-Integration (Kategorie A, direkt verfügbar) wird für Bearbeitungsrechte genutzt, nicht für Lesefilter.

### 7. Risiken, wenn offen gelassen

- S01.1.3 kann nicht implementiert werden, weil unklar ist, welche Abfrage die Projektliste zurückgeben soll.
- Entwickler könnten eigenständig eine Row-Level-Logik einbauen, die später mit F03.3 (Stakeholder-Mitgliedschaft) inkompatibel ist.
- Jede Story, die die Projektliste zeigt oder einen Listeneintrag referenziert (S01.2.x, S01.5.5), hängt von dieser Entscheidung ab.

### 8. Konkrete Änderungsbedarfe an Story-Dateien

**story_projektstammdaten.md — S01.1.3:**
- AC 1: Formulierung präzisieren: „Die Projektliste zeigt alle Projekte der Organisation. Welle 1: Lesezugriff für alle authentifizierten Nutzer; Bearbeitungsrechte über RBAC."
- Offene Fragen: Eintrag ersetzen durch: „ENTSCHIEDEN (D-P2, 2026-04-20): Alle Projekte der Organisation sind für alle authentifizierten Nutzer sichtbar. Row-Level-Sichtbarkeitsfilter kommt mit F03.3 (Stakeholder-Mitgliedschaft) in Welle 2."

---

## D-P3 — Projektnummer

### 1. Entscheidungsfrage

Ist die Projektnummer ein Pflichtfeld oder ein optionales Feld? Gibt es ein erzwungenes Format (Präfix, Nummerierung), oder ist das Feld freier Text?

### 2. Optionen

**Option A — Optional, Freitext, kein Format**  
Keine Projektnummer: vollgültig. Projektnummer: freier String, kein Format erzwungen. Nachträgliches Setzen und Ändern möglich.

**Option B — Pflichtfeld, Freitext, kein Format**  
Jedes Projekt muss eine Nummer haben. Problem: Nutzer müssen beim Schnellanlegen eine Nummer erfinden. Friction ohne Mehrwert; keine Auto-Generierung in Welle 1 vorgesehen.

**Option C — Optional, mit Formatvalidierung**  
Feld optional, aber wenn ausgefüllt, muss ein Muster (z. B. „PROJ-###") eingehalten werden. Erhöhte Komplexität für einen Komfort-Feature in Welle 1.

**Option D — Automatisch generiert (Pflicht)**  
Explizit ausgeschlossen in S01.1.1: „Automatisch vergebene Projektnummer → bleibt manuell in Welle 1."

### 3. Empfohlene Entscheidung

**Option A.** Die Projektnummer ist optional, Freitext, ohne Formatvalidierung.

### 4. Begründung

- Die Plattform soll diverse Organisationen unterstützen — manche verwenden Projektnummern (z. B. „2024-ERP-007"), manche verwenden keine. Ein Pflichtfeld ohne Auto-Generierung erzwingt manuelle Nummerierung bei jedem Projektstart und schafft Friction ohne Nutzwert.
- Option B ist nur sinnvoll, wenn Projektnummern für externe Referenzierung (ERP-System, Buchhaltung) zwingend gebraucht werden. Das ist ein Welle-2-Thema (ERP-Extension), nicht ein Core-Pflichtfeld.
- Option C ist eine sinnvolle Welle-2-Funktion, wenn Organisationen Projektnummernkonventionen einführen wollen (z. B. via Admin-Konfiguration). Für Welle 1 zu früh.
- Option A ist vollständig rückwärtskompatibel: Wenn eine Organisation Pflicht-Projektnummern einführen will, kann das Feld in Welle 2 auf „required" gesetzt werden, ohne bestehende Daten zu verletzen.

### 5. Auswirkungen auf bestehende Stories

**S01.1.1 (Projekt anlegen)**  
- AC: „Ein Projekt kann mit folgenden Feldern angelegt werden: Name (Pflicht), Beschreibung (optional), Verantwortlicher (Pflicht), Projektnummer (optional, frei eingebbar)" → bereits korrekt formuliert; Entscheidung bestätigt diesen AC.
- Offene Fragen: Einträge zu Format und Pflichtfeld-Status ersetzen durch: „ENTSCHIEDEN (D-P3, 2026-04-20): Optional, Freitext, kein erzwungenes Format."

**S01.1.2 (Projekt bearbeiten)**  
- AC: „Die Projektnummer kann nachträglich gesetzt oder geändert werden" → korrekt, keine Änderung.

### 6. Auswirkungen auf Sprint 1

S01.1.1 ist mit dieser Entscheidung **vollständig bereit** für Sprint 1. Das Datenbankfeld `project_number` ist nullable VARCHAR — keine Formatvalidierung, kein NOT NULL.

### 7. Risiken, wenn offen gelassen

- S01.1.1 kann implementiert werden, aber das Datenbankschema (nullable vs. NOT NULL, Format-Check ja/nein) ist unklar — führt zu einer technischen Annahme, die später refactored werden müsste.
- Wenn Entwickler eigenständig ein NOT NULL setzen, müssen alle bestehenden Projekte bei späterem Entspannen migriert werden.

### 8. Konkrete Änderungsbedarfe an Story-Dateien

**story_projektstammdaten.md — S01.1.1:**
- Offene Fragen: Beide Einträge ersetzen durch: „ENTSCHIEDEN (D-P3, 2026-04-20): Projektnummer ist optional. Freitext, kein erzwungenes Format. Pflicht-Projektnummern mit Format sind eine Welle-2-Funktion (z. B. über Admin-Konfiguration)."

---

## Zusammenfassung der Sprint-1-Auswirkungen

| Story | Vorher | Nachher |
|---|---|---|
| S01.1.1 | BEDINGT BEREIT | **BEREIT** — D-P3 klärt Projektnummer-Feld |
| S01.1.3 | BEDINGT BEREIT | **BEREIT** — D-P2 klärt Sichtbarkeitslogik |
| S01.1.4 | BLOCKIERT | **ENTSPERRT für Sprint 4** — D-P1 löst Kollision auf |
| S01.5.3 | BLOCKIERT | **ENTSPERRT für Sprint 4** — D-P1 löst Kollision auf |

Sprint 1 (9 Stories: S01.1.1–S01.1.3, S01.2.1–S01.2.2, S01.5.1–S01.5.2, S01.5.4–S01.5.5) ist nach diesen drei Entscheidungen vollständig implementierungsbereit.
