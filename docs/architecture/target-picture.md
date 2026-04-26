# Target Picture

> **V3 Adaptation**: V3 simplifies V2's stack to Next.js + Supabase. The target picture's principles (modular extensions, AI as proposal layer, governance-as-product) still apply; specific tech references to FastAPI/Redis/S3 are historical.


## 1. Zielbild

Die Plattform ist als **KI-gestützte Projektorchestrierungsplattform** konzipiert. Sie soll nicht nur Projektinformationen speichern, sondern aus fachlichem Kontext verwertbare Struktur, Steuerungslogik und Management-Artefakte ableiten.

Das Zielbild ist eine Plattform, die:

- unterschiedliche Projekttypen auf einer gemeinsamen Kernlogik unterstützt
- projekttyp-spezifische Besonderheiten sauber als Erweiterungen modelliert
- Dokumente, E-Mails und Meeting-Protokolle als verwertbare Kontextquellen einbindet
- aus diesem Kontext Vorschläge für Aufgaben, Abhängigkeiten, Risiken, Entscheidungen und Folgeeffekte ableitet
- operative und Management-Ausgaben aus dem tatsächlichen Projektzustand erzeugt
- auf einem modernen Python+TypeScript-Stack (FastAPI, Next.js, PostgreSQL, Redis, S3, MCP) schrittweise ausgebaut wird

Die Plattform soll strukturell so geschnitten werden, dass spätere Erweiterungen nicht zu einem Umbau des Kerns führen.

---

## 2. Architekturprinzipien

### 2.1 Gemeinsamer Core vor Speziallogik
Alles, was für jeden Projekttyp gilt, gehört in den Core.

### 2.2 Erweiterung statt Sonderfall
Bau-, Software- und ERP-spezifische Logik wird nicht in den Kern gemischt, sondern als projekttyp-spezifische Erweiterung modelliert.

### 2.3 Kontext als eigener Eingangskanal
Dokumente, E-Mails und Meeting-Protokolle sind keine Nebendaten, sondern zentrale Eingangsquellen für Ableitung und Steuerung.

### 2.4 KI als Vorschlagslogik
Die KI schreibt nicht unkontrolliert direkt in den Projektkern. Sie erzeugt nachvollziehbare Vorschläge mit Quelle, Confidence und Review-Logik.

### 2.5 Ausgabeebene als eigene Schicht
Operative Ansichten und Management-Artefakte werden aus dem Projektzustand und dem Kontext abgeleitet, nicht manuell parallel gepflegt.

### 2.6 Evolution statt Einmaldesign
Die Plattform wird schrittweise ausgebaut. Architektur und Domänenzuschnitt müssen daher frühe und spätere Stufen gemeinsam tragen.

---

## 3. Zielarchitektur im Überblick

Die Zielarchitektur besteht aus vier fachlich-technischen Ebenen:

1. **Core**
2. **Projekttyp-Erweiterungen**
3. **Kontext- und KI-Orchestrierung**
4. **Ausgabe- und Artefaktebene**

### 3.1 Übersicht

```text
Shared Foundation
  ├── Auth / RBAC
  ├── Audit / Logging
  ├── File / Upload Handling
  └── bestehende technische Basismodule

Core
  ├── Projects
  ├── Phases
  ├── Milestones
  ├── Tasks
  ├── Dependencies
  ├── Risks
  ├── Stakeholders
  ├── Governance
  └── Decisions

Extensions
  ├── ERP
  ├── Construction
  └── Software

Context & AI
  ├── Context Sources
  ├── Semantic Analysis
  ├── Proposal Logic
  ├── Review Logic
  └── Orchestration Hints

Outputs
  ├── Operational Views
  ├── Management Summaries
  ├── Gantt / Kanban Foundations
  ├── Decision Templates
  └── Presentation Foundations
```

---

## 4. Core-Bereiche

Der Core bildet die gemeinsame Grundlogik für alle Projekttypen.

### 4.1 Projektkern
- Projekt
- Projekttyp
- Status
- Phasen
- Meilensteine
- Aufgaben
- Abhängigkeiten
- Basis-Zeitlogik

### 4.2 Steuerungslogik
- Risiken
- Stakeholder
- Zuständigkeiten
- Entscheidungen
- offene Punkte
- Freigabe- und Eskalationsgrundlagen

### 4.3 Kontextbezug
- Dokument-Referenzen
- Kommunikations-Referenzen
- Nachvollziehbarkeit, aus welcher Quelle Informationen stammen

### 4.4 Grundsätze für den Core
Der Core darf:
- keine ERP-, Bau- oder Software-Spezialregeln enthalten
- keine projekttyp-spezifischen Statusmodelle direkt einbetten
- keine KI- oder Ausgabe-Logik mit fachlicher Kernlogik vermischen

---

## 5. Projekttyp-spezifische Erweiterungen

### 5.1 ERP-Einführungsprojekte
ERP ist der erste fachliche Schwerpunkt.

Enthalten bzw. vorzubereiten:
- Vendor-Auswahlprozess
- Anforderungserhebung
- Bewertungsmatrix
- ERP-Module
- Gap-Kontext
- Datenmigrationskontext
- Trainingskontext
- Hypercare-Kontext
- ERP-spezifische Entscheidungs- und Governance-Situationen

### 5.2 Bauprojekte
Bauprojekte werden früh fachlich mitgedacht, aber später schrittweise aktiviert.

Typische Erweiterungen:
- Gewerke
- Bauabschnitte
- Abnahmen
- Mängel
- Tages- und Fortschrittsbezug

### 5.3 Softwareprojekte
Softwareprojekte werden ebenfalls als Erweiterung vorbereitet.

Typische Erweiterungen:
- Epics
- Stories
- Sprints
- Releases
- Test- und Abnahmebezug

### 5.4 Regel für Erweiterungen
Erweiterungen:
- referenzieren den Core
- ergänzen ihn fachlich
- verändern seine Grundstruktur nicht
- dürfen neue Fachlogik einführen, aber keine Core-Objekte semantisch umdefinieren

---

## 6. Kontext- und KI-Orchestrierung

Diese Ebene macht aus Rohinformationen verwertbare Struktur.

### 6.1 Kontextquellen
Die Plattform soll mindestens folgende Quellen strukturiert verarbeiten können:
- Dokumente
- E-Mails
- Meeting-Protokolle

Später zusätzlich möglich:
- Tickets
- Chat-Nachrichten
- strukturierte Fremdquellen

### 6.2 Vorverarbeitung
Vor der semantischen Analyse werden Quellen normalisiert und dem Projektkontext zugeordnet.

Dazu gehören:
- Metadaten
- Abschnittslogik
- Quelltyp
- fachlicher Bezug
- Zeitpunkt
- Absender / Beteiligte

### 6.3 KI-Vorschlagslogik
Aus Kontextquellen sollen Vorschläge abgeleitet werden für:
- Aufgaben
- Folgeaufgaben
- Abhängigkeiten
- Risiken
- Entscheidungen
- offene Punkte
- Zeitbezüge
- Nebenschauplätze
- Wechselwirkungen

### 6.4 Review-Logik
Jeder KI-Vorschlag muss:
- einer Quelle zugeordnet sein
- einen Confidence-Hinweis tragen
- reviewbar sein
- nachvollziehbar übernommen, verändert oder verworfen werden können

### 6.5 Architekturregel
KI erzeugt **Vorschläge**, keine unkontrollierten Direktänderungen.

---

## 7. Ausgabe- und Artefaktebene

Die Ausgabeebene bereitet Projektzustand und Kontext für unterschiedliche Zielgruppen auf.

### 7.1 Operative Sichten
- Aufgabenstruktur
- Statussicht
- Abhängigkeitssicht
- Risikosicht
- offene Punkte

### 7.2 Management-Sichten
- verdichteter Projektstatus
- Top-Risiken
- Entscheidungsbedarfe
- kritische Termine
- Status der nächsten Schritte

### 7.3 Artefakte
- Gantt-Grundlagen
- Kanban-Grundlagen
- Entscheidungsvorlagen
- Management Summary
- Steering- / Lenkungsausschuss-Grundlagen
- Präsentationsstruktur für PowerPoint, Canva oder Miro

### 7.4 Architekturregel
Die Ausgabeebene liest aus Core, Extensions und Kontextlogik, schreibt aber nicht unkontrolliert zurück.

---

## 8. Zielbild der schrittweisen Umsetzung

### Stufe 1 – tragfähiger Kern
- Projektkern
- Aufgaben
- Abhängigkeiten
- Risiken
- Stakeholder
- Governance-Grundlage
- Dokument-/Kontextbezug

### Stufe 2 – ERP-Fachvertiefung
- Vendor-Prozess
- Anforderungs- und Bewertungslogik
- ERP-Module und Gaps
- migrations- und trainingsbezogene Fachstruktur

### Stufe 3 – Kontext zu Vorschlag
- E-Mails, Dokumente, Meeting-Protokolle
- semantische Voranalyse
- Vorschlagslogik
- Review-Logik

### Stufe 4 – Projektzustand zu Artefakt
- operative Sichten
- Management Summary
- Gantt / Kanban-Grundlagen
- Entscheidungsvorlagen

### Stufe 5 – zusätzliche Projekttypen
- Bau-Erweiterung aktivieren
- Software-Erweiterung aktivieren

### Stufe 6 – fortgeschrittene Orchestrierung
- vertiefte Konflikterkennung
- Wechselwirkungsanalyse
- weitergehende Governance- und Eskalationsunterstützung

---

## 9. Architekturentscheidungen, die jetzt feststehen

1. **Tech-Stack ist fixiert**
   Next.js + FastAPI + eigenes Orchestrator-Modul + PostgreSQL + Redis + MCP + S3.
   Monorepo mit pnpm- und uv-Workspaces.

2. **Orchestrierung ist Eigenbau**
   LangGraph-kompatibel entworfen, aber nicht LangGraph-gebunden. Externer Engine-Adapter bleibt optional.

3. **Core und Extensions werden strikt getrennt**
   Speziallogik gehört nicht in den gemeinsamen Kern.

4. **ERP ist der erste aktiv vertiefte Projekttyp**
   Bau und Software werden strukturell mitgedacht, aber später aktiviert.

5. **Kontextquellen sind ein eigener fachlicher Baustein**
   Nicht nur Anhänge oder Kommentare, sondern auswertbare Eingangslogik.

6. **KI arbeitet vorschlagsbasiert**
   Mit Quelle, Confidence und Review. MCP-first für Tool-Anbindung.

7. **Ausgaben sind ein eigener Architekturbaustein**
   Operative und Management-Artefakte werden aus dem Projektmodell abgeleitet.

8. **Die Plattform wächst stufenweise**
   Anforderungen werden vollständig erfasst, Umsetzung erfolgt inkrementell.

---

## 10. Kritische Architekturfehler, die vermieden werden müssen

- Vermischung von Core und projekttyp-spezifischer Speziallogik
- ERP-Fokus so tief in den Kern zu schneiden, dass andere Projekttypen später nicht sauber passen
- KI als magische Direktlogik ohne Review zu behandeln
- Artefakte und Reports getrennt vom eigentlichen Projektmodell zu pflegen
- spätere Bau- und Softwarelogik zu spät zu berücksichtigen
- Orchestrierung zu früh an LangGraph oder eine andere externe Engine zu binden
- FastAPI-Router mit Business-Logik zu überladen anstatt sie in `domain/` und `services/` zu halten

---

## 11. Empfehlung

Die Zielarchitektur sollte als **erweiterbarer Plattformkern mit klaren Erweiterungspunkten** umgesetzt werden.

Der sinnvollste Weg ist:
- zuerst den gemeinsamen Core tragfähig machen
- dann ERP als erste echte Fachvertiefung aktivieren
- danach Kontextverarbeitung und KI-Vorschlagslogik anschließen
- anschließend operative und Management-Ausgaben ableiten
- erst danach weitere Projekttypen vertiefen

So bleibt die Plattform fachlich konsistent, technisch sauber aufgebaut und strukturell erweiterbar.
