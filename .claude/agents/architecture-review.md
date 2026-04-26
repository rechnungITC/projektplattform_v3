> Originally from V2 (`.claude/skills/architecture-review.md`). Stack-specific references retained; treat as principle, not literal.

# architecture-review.md

## Zweck

Diese Skill-Datei beschreibt, wie Architekturentscheidungen, Zielbilder und Strukturvorschläge bewertet werden sollen.

Ziel ist es, früh zu erkennen, ob eine Lösung tragfähig, erweiterbar und mit dem bestehenden System realistisch umsetzbar ist.

---

## Einsatzfälle

Diese Skill-Datei verwenden, wenn:
- Zielarchitekturen bewertet werden
- neue Module oder Subsysteme vorgeschlagen werden
- Core-vs-Extension-Fragen offen sind
- KI- oder Outputlogik architektonisch eingeordnet werden muss
- spätere Erweiterbarkeit geprüft werden soll

---

## Bewertungsdimensionen

### 1. Passung zum Zielbild
Prüfen:
- passt die Architektur zur Produktlogik?
- unterstützt sie unterschiedliche Projekttypen sauber?
- berücksichtigt sie den ERP-Startfokus ohne andere Typen auszuschließen?

### 2. Trennung von Verantwortlichkeiten
Prüfen:
- ist der Core klar abgegrenzt?
- ist Speziallogik sauber ausgelagert?
- ist Kontext-/KI-Logik getrennt von Kernobjekten?
- ist die Ausgabeebene sauber isoliert?

### 3. Evolutionsfähigkeit
Prüfen:
- kann die Architektur stufenweise wachsen?
- erzwingt sie später Umbauten?
- lassen sich Bau- und Softwarelogik später anschließen?

### 4. Realistische Umsetzbarkeit
Prüfen:
- passt die Architektur zum fixierten Zielstack (Next.js + FastAPI + internes Orchestrator-Modul + PostgreSQL + Redis + MCP + S3)?
- setzt sie stillschweigend externe Frameworks voraus, die nicht Teil des Stacks sind (LangGraph-Bindung, Laravel-Muster etc.)?
- ist sie für das Team beherrschbar?

### 5. Risiko- und Komplexitätsniveau
Prüfen:
- ist die Architektur unnötig komplex?
- ist sie zu früh zu tief?
- entstehen gefährliche Kopplungen?
- gibt es problematische Grauzonen in der Verantwortlichkeit?

---

## Review-Fragen

- Was gehört klar in den Core?
- Was ist besser als Extension modelliert?
- Wo droht Vermischung?
- Wo fehlt ein expliziter Erweiterungspunkt?
- Welche spätere Funktion würde mit dieser Architektur schwer anschließbar?
- Ist die KI-Schicht sauber als Vorschlagslogik modelliert?
- Ist die Ausgabeebene nur Konsument oder greift sie unklar zurück in die Domänenlogik?

---

## Ausgabeformat

Ein Architektur-Review soll diese Struktur haben:

1. Gesamturteil
2. Stärken der Architektur
3. Kritische Schwächen
4. Risiken für spätere Erweiterung
5. Risiken für aktuelle Umsetzung
6. Unklare Verantwortlichkeiten
7. Empfehlung zur Nachschärfung

---

## Qualitätsregeln

- Nicht nur theoretische Schönheit bewerten
- Bestehendes System ernst nehmen
- Erweiterbarkeit und Entkopplung höher gewichten als reine Modellschönheit
- Früh auf Vermischung von Core und Speziallogik hinweisen
