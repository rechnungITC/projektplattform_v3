---
id: PROJ-101
title: "Aufgaben mit Verantwortlichkeit und Frist verwalten"
issue_type: Story
epic_code: C
epic_title: "Aufgaben & Workstreams"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-c", "mvp"]
dependencies: ["A1", "A2", "B1"]
roles: ["Workstream Lead", "Deal Lead", "PMO-Lead", "Aufgabenverantwortliche (alle Workstreams)"]
summary_for_jira: "[C1] Aufgaben mit Verantwortlichkeit und Frist verwalten"
---

# PROJ-101: Aufgaben mit Verantwortlichkeit und Frist verwalten

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic C — Aufgaben & Workstreams)
**Priority:** P1

> **Epic:** C — Aufgaben & Workstreams  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-c` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `B1`

**User Story:**

Als Workstream Lead möchte ich Aufgaben mit Verantwortlichem, Frist, Status und Bezug zu Phase und Workstream anlegen und nachverfolgen können, damit die operative Steuerung des Deals durchgängig nachvollziehbar ist.

**Beschreibung / Kontext:**

Aufgaben sind die kleinste Steuerungseinheit. Sie entstehen entlang aller Phasen und müssen mit Phasen, Workstreams, Deliverables und Risiken verknüpfbar sein.

**Akzeptanzkriterien:**

- [ ] Aufgabe lässt sich anlegen mit Pflichtfeldern Titel, Verantwortlicher, Frist und Workstream.
- [ ] Aufgaben sind einer Phase und optional einem Deliverable, einem Risiko und einer Entscheidung zuordenbar.
- [ ] Status: offen, in Arbeit, blockiert, erledigt, verworfen.
- [ ] Fristüberschreitungen werden farblich hervorgehoben und können als Benachrichtigung an den Verantwortlichen gesendet werden.
- [ ] Aufgaben sind nach Verantwortlichem, Phase, Workstream, Fristfenster und Status filterbar.

**Abgrenzungen (Out of Scope):**

- Kein vollständiges Projektmanagement-Modul (Gantt, Ressourcenplanung) in dieser Story.
- Keine direkte Kostenerfassung pro Aufgabe.

**Offene Fragen:**

- Sollen Aufgaben in ein bestehendes Ticketsystem (Jira) synchronisiert werden?
- Welche Eskalationsregeln gelten bei wiederholter Fristüberschreitung?
- Wie werden wiederkehrende Aufgaben (z. B. wöchentlicher SteerCo-Vorbereitungs-Task) abgebildet?

**Definition of Ready:**

- [ ] Pflichtfelder und Statusmodell sind abgestimmt.
- [ ] Benachrichtigungsregeln sind definiert.

**Definition of Done:**

- [ ] Aufgaben können angelegt, bearbeitet, verknüpft, gefiltert und exportiert werden.
- [ ] Benachrichtigungen funktionieren.
- [ ] Performance-Test mit ≥ 10.000 Aufgaben pro Projekt bestanden.

**Abhängigkeiten:**

- A1 – Projektanlage
- A2 – Phasenmodell
- B1 – Rollen

**Betroffene Rollen:**

- Workstream Lead
- Deal Lead
- PMO-Lead
- Aufgabenverantwortliche (alle Workstreams)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
