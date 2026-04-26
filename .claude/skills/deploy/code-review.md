> Originally from V2 (`.claude/skills/code-review.md`). Stack-specific references retained; treat as principle, not literal.

# code-review.md

## Zweck

Diese Skill-Datei beschreibt, wie Code-Reviews für das Projekt durchzuführen sind.

Ziel ist nicht nur Stilkorrektur, sondern die Prüfung, ob Änderungen fachlich passen, architektonisch sauber eingeordnet sind und spätere Erweiterbarkeit erhalten bleibt.

---

## Einsatzfälle

Diese Skill-Datei verwenden, wenn:
- neue Funktionen eingebracht werden
- bestehende Logik geändert wird
- Bugfixes Seiteneffekte haben könnten
- Core- oder Extension-Code angepasst wird
- Integrationen oder KI-bezogene Logik erweitert werden

---

## Review-Dimensionen

### 1. Fachliche Korrektheit
Prüfen:
- passt die Änderung zur beschriebenen Fachlogik?
- wird Core und Speziallogik korrekt getrennt?
- werden Annahmen explizit gemacht?

### 2. Architekturelle Einordnung
Prüfen:
- liegt die Änderung im richtigen Modul?
- gehört sie in Core, Extension, Kontext-/KI-Ebene oder Output?
- wird bestehende Struktur respektiert?
- entsteht neue Kopplung, die später problematisch wird?

### 3. Technische Qualität
Prüfen:
- Lesbarkeit
- Verständlichkeit
- Verantwortlichkeit je Klasse / Funktion
- unnötige Komplexität
- Wiederverwendbarkeit
- Risiko versteckter Seiteneffekte

### 4. Erweiterbarkeit
Prüfen:
- kann die Änderung spätere Ausbaustufen tragen?
- ist sie zu stark auf den aktuellen Spezialfall zugeschnitten?
- blockiert sie spätere Projekttypen oder Erweiterungen?

### 5. Testbarkeit
Prüfen:
- ist das Verhalten nachvollziehbar testbar?
- wurden wichtige Randfälle berücksichtigt?
- gibt es offensichtliche Lücken?

---

## Review-Fragen

Bei jedem Review mindestens beantworten:
- Ist die Änderung fachlich richtig eingeordnet?
- Ist sie architektonisch am richtigen Ort?
- Macht sie den Core ungewollt projekttyp-spezifisch?
- Führt sie neue technische Schulden ein?
- Ist die Änderung unnötig komplex?
- Welche Seiteneffekte sind denkbar?
- Welche Tests fehlen?

---

## Ausgabeformat

Jedes Code-Review soll diese Struktur haben:

1. Kurzbewertung
2. Positiv aufgefallene Punkte
3. Kritische Punkte
4. Architekturhinweise
5. Fachliche Risiken
6. Technische Risiken
7. Testlücken
8. Empfehlung vor Freigabe

---

## Qualitätsregeln

- Keine reine Stilpolizei
- Kritik priorisieren nach Risiko und Relevanz
- Fachlichkeit vor Mikrokosmetik
- Änderungen im Core besonders streng auf Entkopplung prüfen
- Erweiterungslogik besonders auf Isolation und Anschließbarkeit prüfen
