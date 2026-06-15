---
id: PROJ-117
title: "Gremien- und Meeting-Verwaltung"
issue_type: Story
epic_code: H
epic_title: "Kommunikation, Gremien & Stakeholder"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-h", "should-have"]
dependencies: ["B2", "C1", "F2", "L3"]
roles: ["PMO-Lead", "Deal Lead", "Steering Committee", "Workstream Leads", "Communications Lead"]
summary_for_jira: "[H1] Gremien- und Meeting-Verwaltung"
---

# PROJ-117: Gremien- und Meeting-Verwaltung

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic H — Kommunikation, Gremien & Stakeholder)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: meetings auf PROJ-13 Communication. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** H — Kommunikation, Gremien & Stakeholder  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-h` · `should-have`  
> **Abhängigkeiten:** `B2`, `C1`, `F2`, `L3`

**User Story:**

Als PMO-Lead möchte ich die im Modell vorgesehenen Regelgremien (Deal Core Team, Workstream Meetings, Steering Committee, Red-Flag-Review, Integration Readiness Review, Synergy Review) inkl. Frequenz, Teilnehmern, Agenda und Protokoll zentral verwalten, damit Steuerung und Nachvollziehbarkeit sichergestellt sind.

**Beschreibung / Kontext:**

Das Modell definiert eine explizite Regelkommunikationsstruktur. Die Plattform muss diese Gremien als Steuerungsobjekte abbilden – nicht als Kalender-Tool-Ersatz, sondern als verbindliche Verbindung zwischen Entscheidungen, Aufgaben, Risiken und Beschlusslage.

**Akzeptanzkriterien:**

- [ ] Gremientypen sind aus Vorlage konfigurierbar (Deal Core Team, Workstream, Steering, Red-Flag-Review, Integration Readiness, Synergy Review).
- [ ] Pro Termin sind Datum, Teilnehmer, Agenda, Pre-Read-Links, Protokoll, Beschlüsse und Maßnahmen erfassbar.
- [ ] Beschlüsse aus Meetings werden automatisch ins Entscheidungslog (F2) übernommen; Maßnahmen werden zu Aufgaben (C1).
- [ ] Eine Übersicht über vergangene und kommende Termine je Gremium ist filterbar.
- [ ] Eine Schnittstelle zu Outlook/M365/Google Calendar wird optional unterstützt (offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine Videokonferenz-Integration in der Erst-Story.
- Keine automatische Protokollerstellung aus Audio/Transkript.

**Offene Fragen:**

- Welche Kalender-Schnittstellen werden für den Roll-out priorisiert?
- Soll die Protokoll-Erstellung in der Plattform oder in M365/Confluence/etc. erfolgen?

**Definition of Ready:**

- [ ] Gremien-Vorlagen und Pflichtfelder sind abgestimmt.
- [ ] Schnittstellenanforderungen (falls relevant) liegen vor.

**Definition of Done:**

- [ ] Anlegen, Pflegen und Filtern von Gremien und Terminen funktioniert.
- [ ] Automatische Übernahme in Entscheidungslog und Aufgabenliste ist getestet.

**Abhängigkeiten:**

- B2
- C1
- F2
- L3

**Betroffene Rollen:**

- PMO-Lead
- Deal Lead
- Steering Committee
- Workstream Leads
- Communications Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · H — Kommunikation, Gremien & Stakeholder_
