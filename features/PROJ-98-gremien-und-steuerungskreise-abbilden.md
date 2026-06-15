---
id: PROJ-98
title: "Gremien und Steuerungskreise abbilden"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: Medium
priority_source: "Should (für SteerCo-fähigen Betrieb wichtig)"
labels: ["ma-platform", "epic-b", "should-have"]
dependencies: ["A1", "B1", "F1", "F2", "H1"]
roles: ["Deal Lead", "PMO-Lead", "Executive Sponsor", "Steering-Committee-Mitglieder"]
summary_for_jira: "[B2] Gremien und Steuerungskreise abbilden"
---

# PROJ-98: Gremien und Steuerungskreise abbilden

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic B — Rollen, Gremien & Governance)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `committees`-Tabelle (M&A-Lücke). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** B — Rollen, Gremien & Governance  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should (für SteerCo-fähigen Betrieb wichtig)  
> **Labels:** `ma-platform` · `epic-b` · `should-have`  
> **Abhängigkeiten:** `A1`, `B1`, `F1`, `F2`, `H1`

**User Story:**

Als PMO-Lead möchte ich Gremien wie Steering Committee, Core Team, Workstream Meetings und Integration Management Office mit Mitgliedern, Terminen und Entscheidungskompetenzen anlegen, damit das Governance-Modell des Deals nachvollziehbar abgebildet ist.

**Beschreibung / Kontext:**

Das Modell sieht eine klare Gremienlogik vor (Executive Sponsor, SteerCo, Deal Core Team, Workstreams, IMO). Diese Gremien tagen in unterschiedlichen Frequenzen, treffen unterschiedliche Entscheidungen und sind unterschiedlich besetzt.

**Akzeptanzkriterien:**

- [ ] Gremien sind je Projekt anlegbar mit Name, Zweck, Frequenz, Mitgliedern und Entscheidungskompetenz.
- [ ] Pro Gremium ist erkennbar, welche Stage-Gates (F1) es entscheidet und welche Eskalationen es bearbeitet.
- [ ] Termine eines Gremiums sind mit Meeting-Protokollen (H1) verknüpfbar.
- [ ] Standard-Gremien sind aus dem Template (A3) vorbelegt.
- [ ] Eine Gremienübersicht zeigt aktuelle Besetzung und nächste Termine.

**Abgrenzungen (Out of Scope):**

- Kalenderintegration ist Erweiterung (siehe Open Questions), nicht zwingend MVP.
- Gesellschaftsrechtliche Vorgaben (Aufsichtsrat etc.) werden nicht durch die Plattform geprüft.

**Offene Fragen:**

- Sollen Gremientermine mit Outlook/Google Kalender synchronisiert werden?
- Sollen Entscheidungskompetenzen als Schwellenwerte abgebildet werden (z. B. 'SteerCo bis 50 Mio. EUR Kaufpreis')?
- Wie wird Vertraulichkeit zwischen Gremien gesteuert (z. B. AR sieht keine operativen DD-Details)?

**Definition of Ready:**

- [ ] Gremienstruktur ist mit Geschäftsführung abgestimmt.
- [ ] Entscheidungskompetenzen sind definiert.

**Definition of Done:**

- [ ] Gremien sind anlegbar, befüllbar und mit Stage-Gates und Meetings verknüpfbar.
- [ ] Übersicht ist verfügbar.
- [ ] Berechtigungen je Gremium sind technisch wirksam.

**Abhängigkeiten:**

- A1 – Projektanlage
- B1 – Rollen
- F1, F2 – Stage-Gates, Entscheidungslog
- H1 – Meetings

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Executive Sponsor
- Steering-Committee-Mitglieder

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · B — Rollen, Gremien & Governance_
