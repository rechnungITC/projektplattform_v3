---
id: PROJ-97
title: "Projektrollen und Verantwortlichkeiten verwalten"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Highest
priority_source: "Must (MVP – Voraussetzung jeder Aufgaben- und Deliverable-Steuerung)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["A1", "B4"]
roles: ["Deal Lead", "PMO-Lead", "Workstream Leads", "HR-Vertretung (lesend)"]
summary_for_jira: "[B1] Projektrollen und Verantwortlichkeiten verwalten"
---

# PROJ-97: Projektrollen und Verantwortlichkeiten verwalten

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – Voraussetzung jeder Aufgaben- und Deliverable-Steuerung)  
> **Labels:** `ma-platform` · `epic-b` · `mvp`  
> **Abhängigkeiten:** `A1`, `B4`

**User Story:**

Als Deal Lead möchte ich Projektrollen (intern und extern) anlegen, Personen zuweisen und Verantwortlichkeiten pro Phase, Workstream und Artefakt sichtbar machen, damit jederzeit klar ist, wer für was zuständig ist.

**Beschreibung / Kontext:**

Das Modell unterscheidet diverse M&A-Rollen (Executive Sponsor, Deal Lead, CFO/Finance, Legal, Tax, HR, IT, Communications, externe Berater, Target Management). Die Plattform muss diese Rollen abbilden und mit RACI-Logik je Aufgabe und Deliverable verknüpfen.

**Akzeptanzkriterien:**

- [ ] Eine Rollenliste mit Beschreibung ist je Projekt pflegbar und aus dem Template (A3) vorbefüllt.
- [ ] Personen können einer oder mehreren Rollen zugeordnet werden; gleiche Person kann mehrere Rollen tragen.
- [ ] Pro Aufgabe (C1) und Deliverable (D1) kann eine RACI-Zuordnung gepflegt werden.
- [ ] Sichtbar ist, wer aktuell für welche Aufgaben/Deliverables 'Accountable' ist.
- [ ] Externe Berater werden klar als 'extern' markiert (siehe B3) und haben standardmäßig eingeschränkte Sichtbarkeit.

**Abgrenzungen (Out of Scope):**

- Keine Anbindung an ein HR-System für Mitarbeiterstammdaten in dieser Story (siehe Open Questions).
- Komplexe Skill-Matching-Logik ist nicht Teil der Plattform.

**Offene Fragen:**

- Soll die Personenverwaltung über das interne Identity-Provider-System (AD, Entra ID) erfolgen?
- Wie werden Rollenwechsel während eines Deals historisiert?
- Müssen rechtliche Stellvertretungsregelungen abgebildet werden?

**Definition of Ready:**

- [ ] Rollenkatalog ist mit M&A, HR und Legal abgestimmt.
- [ ] RACI-Modell ist definiert.
- [ ] Identity-Provider-Frage ist geklärt.

**Definition of Done:**

- [ ] Rollen sind anlegbar, Personen zuweisbar, RACI je Artefakt setzbar.
- [ ] Verantwortungs-Ansicht zeigt korrekte Zuordnung.
- [ ] Historisierung von Rollenwechseln ist nachweisbar.

**Abhängigkeiten:**

- A1 – Projektanlage
- B4 – Berechtigungskonzept

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Workstream Leads
- HR-Vertretung (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
