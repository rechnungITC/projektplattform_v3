---
id: PROJ-111
title: "Entscheidungslog für Management-Entscheidungen"
issue_type: Story
epic_code: F
epic_title: "Entscheidungen & Stage-Gates"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-f", "mvp"]
dependencies: ["F1", "E1", "G3", "D1", "L3"]
roles: ["Deal Lead", "PMO-Lead", "Executive Sponsor", "Workstream Leads", "Legal Counsel (lesend)"]
summary_for_jira: "[F2] Entscheidungslog für Management-Entscheidungen"
---

# PROJ-111: Entscheidungslog für Management-Entscheidungen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic F — Entscheidungen & Stage-Gates)
**Priority:** P1

> **Epic:** F — Entscheidungen & Stage-Gates  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-f` · `mvp`  
> **Abhängigkeiten:** `F1`, `E1`, `G3`, `D1`, `L3`

**User Story:**

Als PMO-Lead möchte ich alle wesentlichen Managemententscheidungen eines M&A-Projekts zentral, nachvollziehbar und revisionssicher dokumentieren, damit jederzeit klar ist, wer was wann auf welcher Grundlage entschieden hat.

**Beschreibung / Kontext:**

Das M&A-Modell fordert ein explizites Entscheidungslog als zentrales Artefakt. Entscheidungen entstehen nicht nur an Stage-Gates, sondern laufend (z. B. Kaufpreisanpassung, Annahme eines Risikos, Anpassung der Verhandlungsposition). Die Plattform muss alle Entscheidungen einheitlich erfassen und verknüpfen können.

**Akzeptanzkriterien:**

- [ ] Entscheidungen können mit Titel, Beschreibung, Entscheidungsdatum, Entscheider, Entscheidungsgremium, Begründung und Entscheidungsoptionen erfasst werden.
- [ ] Jede Entscheidung kann mit Risiken (E1), Findings (G3), Deliverables (D1) oder Phasen (A2) verknüpft werden.
- [ ] Stage-Gate-Entscheidungen (F1) werden automatisch in das Entscheidungslog übernommen.
- [ ] Entscheidungen sind nach Erfassung nicht mehr inhaltlich änderbar; Korrekturen erfolgen ausschließlich durch neue Entscheidungen mit Verweis auf die alte (Korrektureintrag).
- [ ] Eine Filter-Sicht erlaubt es, alle Entscheidungen eines Workstreams, einer Phase oder eines Entscheiders zu listen.
- [ ] Export der Entscheidungen als Liste ist möglich (Reporting, siehe M1).

**Abgrenzungen (Out of Scope):**

- Entscheidungen werden inhaltlich nicht durch die Plattform validiert.
- Eine Workflow-Steuerung im Sinne von Approval-Chains ist Erweiterung; die Erst-Story dokumentiert nur.

**Offene Fragen:**

- Sollen geheime/sensible Entscheidungen nur einem eingeschränkten Personenkreis sichtbar sein (z. B. 'Deal-Inner-Circle')?
- Müssen Korrektureinträge eine Genehmigung durch den Sponsor erfordern?

**Definition of Ready:**

- [ ] Datenmodell für Entscheidungen ist abgestimmt.
- [ ] Verknüpfungspunkte zu anderen Objekten sind spezifiziert.

**Definition of Done:**

- [ ] Erfassung, Verknüpfung, Sperre nach Erfassung und Filter funktionieren.
- [ ] Audit-Trail liefert lückenlosen Nachweis (L3).
- [ ] Export funktioniert in mind. einem Standardformat.

**Abhängigkeiten:**

- F1
- E1
- G3
- D1
- L3

**Betroffene Rollen:**

- Deal Lead
- PMO-Lead
- Executive Sponsor
- Workstream Leads
- Legal Counsel (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · F — Entscheidungen & Stage-Gates_
