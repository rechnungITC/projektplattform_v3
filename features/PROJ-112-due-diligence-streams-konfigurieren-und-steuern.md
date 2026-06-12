---
id: PROJ-112
title: "Due-Diligence-Streams konfigurieren und steuern"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["A2", "C2", "G2", "G3", "G4", "F1"]
roles: ["Deal Lead", "Stream Leads (Commercial, Financial, Tax, Legal, HR, IT)", "PMO-Lead", "Externe Berater (lesend / mitwirkend)"]
summary_for_jira: "[G1] Due-Diligence-Streams konfigurieren und steuern"
---

# PROJ-112: Due-Diligence-Streams konfigurieren und steuern

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `A2`, `C2`, `G2`, `G3`, `G4`, `F1`

**User Story:**

Als Deal Lead möchte ich die sechs Due-Diligence-Streams (Commercial, Financial, Tax, Legal, HR, IT) pro Deal aktivieren, konfigurieren und mit Verantwortlichen, Zeitfenstern und Pflichtartefakten versehen, damit die DD strukturiert und vergleichbar gesteuert werden kann.

**Beschreibung / Kontext:**

Phase 5 des Modells ist die Due Diligence mit definierten Streams. Jeder Stream hat eigene Prüfpunkte und Deliverables. Die Plattform muss diese Streams als Steuerungsobjekte abbilden, ihnen Stream-Leads zuordnen, Statusinformationen erfassen und einen Gesamtüberblick zur DD-Reife geben.

**Akzeptanzkriterien:**

- [ ] Pro Projekt können DD-Streams aus einer konfigurierbaren Vorlage (mindestens Commercial, Financial, Tax, Legal, HR, IT) aktiviert werden, weitere Streams sind ergänzbar (z. B. ESG, Operations).
- [ ] Pro Stream sind hinterlegt: Stream-Lead, Zeitfenster, Pflicht-Deliverables (Report, Red-Flag-Log etc.), Prüfpunktliste aus Vorlage.
- [ ] Stream-Status kann gepflegt werden (nicht gestartet, gestartet, in Prüfung, Findings konsolidiert, abgeschlossen).
- [ ] Eine DD-Übersicht zeigt für jeden Stream den Status, die Anzahl offener Findings (G3), die Anzahl offener Q&A-Punkte (G2) und die Restzeit.
- [ ] Streams sind mit der Phase 'Due Diligence' (A2) verknüpft und werden in der Stage-Gate-Vorbereitung Gate 5 (siehe F1) ausgewertet.

**Abgrenzungen (Out of Scope):**

- Die Plattform stellt keinen virtuellen Datenraum bereit (siehe Annahme A1) – sie verlinkt nur (G4).
- Inhaltliche Prüfung ist Aufgabe der Stream-Verantwortlichen, nicht der Plattform.

**Offene Fragen:**

- Welche zusätzlichen Streams werden organisationsweit als Standard erwartet (z. B. ESG, Compliance, Insurance)?
- Sollen Vorlagen pro Branche/Deal-Größe variieren?

**Definition of Ready:**

- [ ] Standard-Vorlage je Stream (Prüfpunkte, Pflichtdeliverables) ist abgestimmt.
- [ ] Datenmodell für Stream-Status ist definiert.

**Definition of Done:**

- [ ] Streams können aktiviert, befüllt und gefiltert werden.
- [ ] Übersichtssicht zeigt korrekte Live-Daten.
- [ ] Eine Vorlage kann zentral geändert und an Folgeprojekte vererbt werden.

**Abhängigkeiten:**

- A2
- C2 – Workstreams
- G2
- G3
- G4
- F1

**Betroffene Rollen:**

- Deal Lead
- Stream Leads (Commercial, Financial, Tax, Legal, HR, IT)
- PMO-Lead
- Externe Berater (lesend / mitwirkend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
