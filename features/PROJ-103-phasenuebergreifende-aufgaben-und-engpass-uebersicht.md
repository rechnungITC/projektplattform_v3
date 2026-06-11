---
id: PROJ-103
title: "Phasenübergreifende Aufgaben- und Engpass-Übersicht"
issue_type: Story
epic_code: C
epic_title: "Aufgaben & Workstreams"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-c", "should-have"]
dependencies: ["C1", "C2"]
roles: ["Deal Lead", "PMO-Lead", "Workstream Leads"]
summary_for_jira: "[C3] Phasenübergreifende Aufgaben- und Engpass-Übersicht"
---

# PROJ-103: Phasenübergreifende Aufgaben- und Engpass-Übersicht

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic C — Aufgaben & Workstreams)
**Priority:** P1

> **Epic:** C — Aufgaben & Workstreams  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-c` · `should-have`  
> **Abhängigkeiten:** `C1`, `C2`

**User Story:**

Als Deal Lead möchte ich eine projektweite Sicht über alle offenen, überfälligen und blockierten Aufgaben über alle Workstreams sehen, damit ich Engpässe und Eskalationsbedarfe erkennen kann.

**Beschreibung / Kontext:**

Im Verlauf eines Deals laufen Hunderte Aufgaben parallel. Ohne phasenübergreifende Sicht ist Engpassmanagement nicht möglich.

**Akzeptanzkriterien:**

- [ ] Eine Cross-Workstream-Tabelle zeigt: Aufgabentitel, Workstream, Phase, Verantwortlicher, Frist, Status, Tage über Frist.
- [ ] Schnellfilter: 'Überfällig', 'Heute fällig', 'Diese Woche', 'Blockiert', 'Nach Verantwortlichem', 'Nach Workstream'.
- [ ] Top-3-Engpässe (z. B. die ältesten überfälligen Aufgaben) werden auf dem Projekt-Dashboard angezeigt.
- [ ] Export als Excel/CSV ist möglich.

**Abgrenzungen (Out of Scope):**

- Keine automatische Eskalationsfunktion.
- Keine KI-gestützte Priorisierung.

**Offene Fragen:**

- Welche Eskalationsregeln (z. B. nach 7 Tagen automatische Info an Deal Lead) sind gewünscht?
- Soll diese Übersicht auch für Externe gefiltert sichtbar sein?

**Definition of Ready:**

- [ ] Filterlogik und Spaltenstruktur sind freigegeben.
- [ ] Performance-Erwartung ist definiert.

**Definition of Done:**

- [ ] Übersicht ist verfügbar, performant und exportierbar.

**Abhängigkeiten:**

- C1, C2

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Workstream Leads

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · C — Aufgaben & Workstreams_
