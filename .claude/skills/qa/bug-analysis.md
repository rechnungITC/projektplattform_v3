> Originally from V2 (`.claude/skills/bug-analysis.md`). Stack-specific references retained; treat as principle, not literal.

# bug-analysis.md

## Zweck

Diese Skill-Datei beschreibt, wie Bugs strukturiert analysiert werden sollen, bevor Änderungen vorgeschlagen oder umgesetzt werden.

Ziel ist nicht schnelles Raten, sondern belastbare Fehleranalyse mit klarer Eingrenzung, nachvollziehbarer Ursache und sauberer Ableitung der nächsten Schritte.

---

## Einsatzfälle

Diese Skill-Datei verwenden, wenn:
- ein Fehler gemeldet wurde
- ein Verhalten unerwartet ist
- ein Datenfehler oder Statusfehler auftritt
- ein Fehler nur unter bestimmten Bedingungen reproduzierbar ist
- unklar ist, ob die Ursache im Core, in einer Extension, in einer Integration oder in der Ausgabeebene liegt

---

## Vorgehensweise

### 1. Problem sauber beschreiben
Immer zuerst festhalten:
- beobachtetes Verhalten
- erwartetes Verhalten
- betroffene Funktion
- betroffener Kontext
- Reproduzierbarkeit
- Zeitpunkt und mögliche Auslöser

### 2. Fachliche Ebene prüfen
Vor technischer Analyse prüfen:
- Ist das Verhalten wirklich ein Bug?
- Oder handelt es sich um unklare Fachlogik, fehlende Abgrenzung oder fehlerhafte Erwartung?

### 3. Ursache eingrenzen
Mögliche Ursachen systematisch prüfen:
- Eingabedaten
- Statuslogik
- Abhängigkeitslogik
- Rechte / Rollen
- Projektkontext
- Extension-spezifische Logik
- Integrationspunkt
- UI-/Darstellungsebene
- Persistenz / Datenmodell

### 4. Fehlerklasse bestimmen
Bug einer Klasse zuordnen:
- Datenfehler
- Statusfehler
- Logikfehler
- Zuordnungsfehler
- UI-/Darstellungsfehler
- Berechtigungsfehler
- Integrationsfehler
- Performance- oder Timing-Problem

### 5. Auswirkungen bewerten
Dokumentieren:
- fachliche Auswirkung
- technische Auswirkung
- betroffene Nutzergruppen
- betroffene Projekttypen
- Risiko für Folgefehler

### 6. Fix-Ansatz ableiten
Erst nach sauberer Analyse:
- vermutete Root Cause
- empfohlener Fix-Bereich
- Risiken des Fixes
- notwendige Tests
- mögliche Seiteneffekte

---

## Ausgabeformat

Jede Bug-Analyse soll diese Struktur haben:

1. Bug-Beschreibung
2. Erwartetes vs. tatsächliches Verhalten
3. Reproduktionskontext
4. Betroffener Bereich
5. Wahrscheinliche Ursache
6. Root-Cause-Hypothese
7. Risiken und Seiteneffekte
8. Empfohlene nächste Schritte
9. Testhinweise

---

## Qualitätsregeln

- Keine vorschnellen Fixes ohne Eingrenzung
- Keine Vermischung von Symptom und Ursache
- Fachliche und technische Sicht sauber trennen
- Wenn die Ursache unklar bleibt, Hypothesen klar kennzeichnen
- Immer mögliche Seiteneffekte benennen
