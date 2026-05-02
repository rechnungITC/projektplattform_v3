# Domain-Wissen: Erweitertes Stakeholder-Management

> **Status:** Domain-Knowledge — **nicht** PROJ-X-Spec.
> **Promotion-Pfad:** dieses Material dient als Eingabe für eine spätere `/requirements`-Session, die das Konzept in **3-4 separate** PROJ-Specs zerlegen muss (Stammdaten-Erweiterung / Kommunikations-Tracking / KI-Coaching-Purpose / kritischer-Pfad-Indikator). CIA-Review zwingend, weil der Scope **PROJ-8 (Stakeholders, deployed)**, **PROJ-13 (Communication, deployed)** und den AI-Router (PROJ-12 / PROJ-30) anfasst.
> **Lizenz-Klärung erforderlich** (DISG-Modell, Harvard-Konzept) bevor Implementation startet.
> **Original-Autor:** Manus AI · **Empfangen:** 2026-05-02 · **Diagramme:** auf Manus-CDN (signed-URLs entfernt — ablauf 2027).

---

## 1. Executive Summary

Das erweiterte Stakeholder-Management-Feature hebt die bestehende Projektplattform auf die nächste Stufe der Projektsteuerung. Während die aktuelle Lösung bereits grundlegende Stammdaten (Name, E-Mail, Rolle, Kosten, FTE, Zuordnung zu Arbeitspaketen) sowie eine einfache Stakeholder-Matrix (Einfluss/Impact) abdeckt, fehlen entscheidende qualitative und prädiktive Elemente.

Dieses neue Feature führt **tiefgreifende Profilierungs- und Bewertungsmechanismen** ein. Stakeholder erhalten ein detailliertes Skill- und Persönlichkeitsprofil (visualisiert als Netzdiagramm). Darüber hinaus wird die **Kommunikation (Meetings, E-Mails)** systematisch ausgewertet, um die Wechselwirkungen mit Arbeitspaketen und dem kritischen Pfad dynamisch zu berechnen. Eine integrierte **KI-Assistenz** unterstützt den Projektleiter durch konkrete Handlungsempfehlungen, passgenaue Kommunikationsentwürfe und Eskalationsstrategien nach anerkannten Methoden (z.B. Harvard-Konzept).

---

## Systemarchitektur: Datenmodell

> _[Datenmodell-Diagramm aus Manus-AI-CDN entfernt (signed-URL läuft 2027 ab). Wird bei /requirements + /architecture neu erzeugt.]_

---

## 2. Erweiterung der Stakeholder-Stammdaten & Matrix

Die bestehende Anlage eines Stakeholders wird um qualitative Felder erweitert, um nicht nur das "Wie stark", sondern auch das "Warum" zu erfassen.

| Feldname | Datentyp | Beschreibung |
|---|---|---|
| **Einfluss (Influence)** | Integer (1-10) | Bestehendes Feld: Wie viel Macht hat die Person im Projekt? |
| **Auswirkung (Impact)** | Integer (1-10) | Bestehendes Feld: Wie stark ist die Person vom Projekt betroffen? |
| **Begründung / Treiber** | Text (Rich Text) | **NEU:** Freitextfeld zur Dokumentation, *warum* dieser Einfluss oder Impact besteht (z.B. "Budgetverantwortlicher", "Hauptanwender des Altsystems"). |
| **Stakeholder-Typ** | Dropdown | **NEU:** Kategorisierung (z.B. Promotor, Supporter, Kritiker, Blockierer). |

---

## 3. Skill- und Persönlichkeitsprofile (Netzdiagramme)

Um Stakeholder besser einschätzen und zielgerichtet einsetzen zu können, werden zwei neue Profil-Dimensionen eingeführt. Beide Profile werden visuell als **Netzdiagramme (Radar Charts)** dargestellt und erlauben den Vergleich zwischen Eigeneinschätzung (Self-Assessment) und Fremdeinschätzung durch den Projektleiter.

### 3.1 Fachliches Skill-Profil
Dieses Profil bewertet die fachlichen Kompetenzen des Stakeholders in Bezug auf das Projekt.

| Dimension | Skala | Beschreibung |
|---|---|---|
| **Domänenwissen** | 0-100% | Fachliche Expertise im Projektkontext (z.B. ERP-Prozesse, Bauvorschriften). |
| **Methodenkompetenz** | 0-100% | Beherrschung von Projektmethoden (Agil, Wasserfall, Scrum). |
| **IT-/Tool-Affinität** | 0-100% | Technisches Verständnis und Umgang mit Software. |
| **Verhandlungsgeschick** | 0-100% | Fähigkeit, Kompromisse zu erzielen und Budgets zu verhandeln. |
| **Entscheidungskraft** | 0-100% | Fähigkeit und Befugnis, schnelle und bindende Entscheidungen zu treffen. |

### 3.2 Persönlichkeitsprofil (angelehnt an das DISG-Modell)
Dieses Profil hilft dem Projektleiter, den Kommunikationsstil des Stakeholders zu verstehen.

| Dimension | Skala | Ausprägung |
|---|---|---|
| **Dominanz (D)** | 0-100% | Ergebnisorientiert, direkt, fordernd, entscheidungsfreudig. |
| **Initiative (I)** | 0-100% | Kommunikativ, enthusiastisch, netzwerkend, optimistisch. |
| **Stetigkeit (S)** | 0-100% | Teamorientiert, geduldig, beständig, harmoniebedürftig. |
| **Gewissenhaftigkeit (G)** | 0-100% | Analytisch, detailorientiert, systematisch, qualitätsbewusst. |

---

## 4. Kommunikationsauswertung & Dynamische Wechselwirkung

Die statische Stakeholder-Matrix wird durch die kontinuierliche Auswertung der Interaktionen dynamisiert. Das System analysiert den Kommunikationsverlauf und berechnet daraus den aktuellen Einfluss auf das Projekt.

### 4.1 Erfassung von Interaktionen
Der Projektleiter kann Meetings, Korrespondenzen (E-Mails) und informelle Gespräche protokollieren. Jede Interaktion wird anhand folgender Kriterien bewertet (manuell oder KI-gestützt):
- **Tonalität/Stimmung:** Positiv, Neutral, Negativ, Eskalierend.
- **Kooperationsbereitschaft:** Hoch, Mittel, Niedrig, Blockierend.
- **Reaktionszeit:** Schnell, Angemessen, Verzögert.

### 4.2 Wechselwirkung mit Arbeitspaketen und kritischem Pfad
Die Plattform verknüpft die Kommunikationsdaten mit den zugewiesenen Arbeitspaketen (Work Packages) und User Stories.

| Indikator | Berechnungsgrundlage | Auswirkung auf das Projekt |
|---|---|---|
| **Paket-Risiko** | Hoher Einfluss (Matrix) + Niedrige Kooperation (Kommunikation) | Arbeitspaket wird als "Risikobehaftet" (Gelb/Rot) markiert. |
| **Kritischer Pfad-Alarm** | Stakeholder ist auf dem kritischen Pfad + Verzögerte Reaktionszeit | Warnmeldung an den Projektleiter: "Kritischer Pfad gefährdet durch Verzögerung bei Stakeholder X". |
| **Einfluss-Trend** | Historie der Interaktionen über Zeit | Zeigt an, ob ein Kritiker langsam zum Supporter wird (Trendlinie). |

---

## 5. KI-Assistenz für Stakeholder-Management

Die integrierte Künstliche Intelligenz nutzt die gesammelten Daten (Matrix, Skillset, Persönlichkeit, Kommunikationshistorie), um den Projektleiter aktiv zu coachen.

### 5.1 KI-Logik-Architektur

> _[KI-Logik-Diagramm aus Manus-AI-CDN entfernt (signed-URL läuft 2027 ab).]_

### 5.2 Handlungsempfehlungen & Eskalationsstrategien
Die KI generiert proaktive Vorschläge, wie mit einem Stakeholder umzugehen ist. Sie stützt sich dabei auf anerkannte Konfliktlösungs- und Verhandlungsmethoden [1].

- **Präventive Maßnahmen:** "Stakeholder X (Hohe Dominanz, Kritiker) ist für das nächste Arbeitspaket entscheidend. Binden Sie ihn frühzeitig in die Entscheidungsfindung ein."
- **Klärungsgespräche:** Bereitstellung eines Leitfadens für 1:1 Gespräche (z.B. basierend auf der Gewaltfreien Kommunikation nach Rosenberg).
- **Eskalationspfade:** Wenn die Kooperation dauerhaft niedrig ist, schlägt die KI vor, wann und wie eskaliert werden muss (z.B. nach dem Harvard-Konzept: Trennung von Person und Problem).

### 5.3 KI-gestützte Kommunikationsentwürfe
Der Projektleiter kann die KI anweisen, Nachrichten (E-Mails, Messenger-Texte) für Stakeholder zu entwerfen.

- **1:1 Kommunikation:** Die KI formuliert den Text exakt passend zum Persönlichkeitsprofil. (Beispiel: Für einen "gewissenhaften" Stakeholder wird die E-Mail datengetrieben und detailliert formuliert; für einen "dominanten" Stakeholder kurz, prägnant und ergebnisorientiert).
- **Mehrfach-Empfänger (Broadcast):** Wenn eine Nachricht an mehrere Stakeholder mit unterschiedlichen Profilen gesendet wird, generiert die KI einen **neutralen, ausbalancierten Text**, der alle Einflüsse berücksichtigt, ohne eine Partei zu brüskieren.

---

## 6. UX-Flow: Anlage und Pflege eines Stakeholders

> _[UX-Flow-Diagramm aus Manus-AI-CDN entfernt (signed-URL läuft 2027 ab).]_


1. **Basis-Anlage:** Projektleiter gibt E-Mail, Name, Rolle, Kosten/FTE und Intern/Extern-Status ein.
2. **Matrix-Einordnung:** Projektleiter setzt Einfluss und Impact (1-10) und dokumentiert die Begründung.
3. **Zuweisung:** Stakeholder wird Projekten, Arbeitspaketen oder Stories zugeordnet.
4. **Profilierung:** Projektleiter füllt das Skill- und Persönlichkeitsprofil aus (Schieberegler). Das Netzdiagramm baut sich in Echtzeit auf. Optional: Versand eines Self-Assessment-Links an den Stakeholder.
5. **Laufende Pflege:** Nach jedem Meeting trägt der Projektleiter eine kurze Bewertung der Interaktion ein.
6. **KI-Dashboard:** Ein spezielles Dashboard zeigt dem Projektleiter Warnungen (z.B. kritischer Pfad gefährdet) und bietet KI-generierte Handlungsempfehlungen an.

---

## Referenzen
[1] Fisher, R., Ury, W., & Patton, B. (2011). *Getting to Yes: Negotiating Agreement Without Giving In* (Harvard-Konzept). Penguin Books.
