---
id: PROJ-110
title: "Stage-Gate-Workflow mit strukturierter Freigabe"
issue_type: Story
epic_code: F
epic_title: "Entscheidungen & Stage-Gates"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-f", "mvp"]
dependencies: ["A2", "B2", "D1", "E2", "F2", "L3"]
roles: ["Executive Sponsor", "Steering Committee", "Deal Lead", "PMO-Lead", "Workstream Leads (lesend)"]
summary_for_jira: "[F1] Stage-Gate-Workflow mit strukturierter Freigabe"
---

# PROJ-110: Stage-Gate-Workflow mit strukturierter Freigabe

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic F — Entscheidungen & Stage-Gates)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-31 Approval-Gates + PROJ-19 Phasen-Transition. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** F — Entscheidungen & Stage-Gates  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-f` · `mvp`  
> **Abhängigkeiten:** `A2`, `B2`, `D1`, `E2`, `F2`, `L3`

**User Story:**

Als Executive Sponsor möchte ich an jedem der neun Stage-Gates strukturiert und nachvollziehbar entscheiden können (Fortsetzen, Anpassen, Abbrechen), damit das M&A-Projekt diszipliniert geführt wird und Risiken nicht unbemerkt in die nächste Phase übertragen werden.

**Beschreibung / Kontext:**

Das Best-Practice-Modell sieht neun Stage-Gates vor (Gate 1 'M&A-Strategie' bis Gate 9 'Value Realization'). Die Plattform muss diese Gates pro Projekt instanziieren, an Phasenübergänge koppeln, die für die Entscheidung notwendigen Inhalte (Deliverables, Risiken, offene Punkte, Empfehlung) zusammenführen und die Freigabe protokollieren.

**Akzeptanzkriterien:**

- [ ] Pro Projekt werden alle neun Stage-Gates aus dem Modell automatisch angelegt und können konfigurativ erweitert werden.
- [ ] Jedes Gate hat eine Pre-Read-Sicht, die automatisch verlinkte Pflicht-Deliverables (siehe D1), offene Red Flags (E2), offene Aufgaben (C1) und die Entscheidungsempfehlung des Deal Leads anzeigt.
- [ ] Vor einer Gate-Entscheidung weist die Plattform auf nicht erfüllte Pflicht-Deliverables und auf aktive Risiken ohne Maßnahme hin (siehe E3).
- [ ] Ein Gate kann mit einer der drei Entscheidungen abgeschlossen werden: Freigabe, Auflage (bedingte Freigabe mit Pflichten), Abbruch.
- [ ] Bei Freigabe wird die nächste Phase aktiviert (siehe A2); bei Abbruch wird das Projekt in den Status 'Beendet' überführt mit Pflicht zur Begründung.
- [ ] Jede Gate-Entscheidung erzeugt einen unveränderbaren Eintrag im Entscheidungslog (F2) und im Audit-Trail (L3).

**Abgrenzungen (Out of Scope):**

- Die Plattform trifft selbst keine Entscheidung – sie strukturiert die Entscheidungsvorbereitung.
- Eine inhaltliche Bewertung der Deliverables ist nicht in Scope.
- Eine elektronische Signatur des Gate-Beschlusses ist Erweiterung (siehe offene Frage).

**Offene Fragen:**

- Soll die Plattform eine qualifizierte elektronische Signatur am Gate verpflichtend einbinden?
- Sollen Gates Mehrfachunterschriften (z. B. Sponsor + CFO + Legal) erzwingen?
- Sind kundenspezifische Zusatzgates erlaubt (z. B. Beirats-Vorgate)?

**Definition of Ready:**

- [ ] Stage-Gate-Konfigurationsmodell und Pflichtinhalte je Gate liegen vor.
- [ ] Verknüpfung zu Phasen (A2) und Deliverables (D1) ist spezifiziert.
- [ ] Eskalationsregeln bei abgelehnten Gates sind dokumentiert.

**Definition of Done:**

- [ ] Alle neun Gates sind im System konfiguriert.
- [ ] Pre-Read-Sicht und Warnhinweise sind funktional und getestet.
- [ ] Entscheidungen erscheinen revisionssicher im Log und im Audit-Trail.
- [ ] Mind. ein End-to-End-Testszenario von Gate 1 bis Gate 9 ist durchlaufen.

**Abhängigkeiten:**

- A2 – Phasenmodell
- B2 – Steering Committee
- D1 – Deliverables
- E2 – Red Flags
- F2 – Entscheidungslog
- L3 – Audit-Trail

**Betroffene Rollen:**

- Executive Sponsor
- Steering Committee
- Deal Lead
- PMO-Lead
- Workstream Leads (lesend)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · F — Entscheidungen & Stage-Gates_
