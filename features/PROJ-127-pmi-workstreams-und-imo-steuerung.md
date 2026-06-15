---
id: PROJ-127
title: "PMI-Workstreams und IMO-Steuerung"
issue_type: Story
epic_code: K
epic_title: "Post-Merger-Integration"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-k", "should-have"]
dependencies: ["C1", "E1", "K1", "K2", "M1", "L3"]
roles: ["Integration Lead / IMO", "Workstream Leads PMI", "HR Lead", "IT Lead", "CFO / Finance Lead", "Executive Sponsor"]
summary_for_jira: "[K3] PMI-Workstreams und IMO-Steuerung"
---

# PROJ-127: PMI-Workstreams und IMO-Steuerung

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic K — Post-Merger-Integration)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **REUSE** · Andockpunkt: = PROJ-102 Workstreams im PMI-Kontext (merge). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** K — Post-Merger-Integration  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-k` · `should-have`  
> **Abhängigkeiten:** `C1`, `E1`, `K1`, `K2`, `M1`, `L3`

**User Story:**

Als Integration Lead / IMO möchte ich PMI-Workstreams (HR, IT, Finance, Operations, Sales, Communications, Risk & Compliance) mit eigenen Verantwortlichen, Aufgaben und Reporting-Punkten steuern, damit das IMO eine vollständige Sicht auf den Integrationsfortschritt hat.

**Beschreibung / Kontext:**

Phase 10 fordert ein eigenständiges Integration Management Office mit dedizierten Workstreams. Diese unterscheiden sich teilweise von den DD-Streams: Sie sind operativer, langfristiger und mit Linienverantwortung verzahnt.

**Akzeptanzkriterien:**

- [ ] PMI-Workstreams sind als eigener Typ neben DD-Streams (G1) konfiguriert; eine Standardvorlage aus dem Modell ist hinterlegt.
- [ ] Pro PMI-Workstream können Stream-Lead, Aufgabenliste (C1), Synergie-Initiativen (K2), Risiken (E1), Statusbericht erfasst werden.
- [ ] Eine IMO-Sicht aggregiert alle PMI-Workstreams in einem Ampel-Status (grün/gelb/rot) basierend auf konfigurierbaren KPIs (z. B. Synergie-Erreichungsgrad, offene Pflichtaufgaben, Risikoindex).
- [ ] Ein Übergangs-Status 'in Linie übergeben' kann je Workstream gesetzt werden, was die Steuerung in die Linienorganisation überführt.
- [ ] Audit-Trail (L3) erfasst Statusänderungen und Übergänge.

**Abgrenzungen (Out of Scope):**

- Keine HR-Stammdaten- oder Vergütungslogik in der Plattform.
- Keine ERP-Migrationssteuerung; IT-Migration wird über Aufgaben (C1) abgebildet.

**Offene Fragen:**

- Welche Standard-KPIs sollen den Ampel-Status auslösen?
- Sollen PMI-Workstreams nach einem konfigurierbaren Reifegradmodell (z. B. CMMI-light) bewertet werden?

**Definition of Ready:**

- [ ] Workstream-Vorlage und Ampel-Logik sind abgestimmt.
- [ ] Übergabekriterien an die Linie sind dokumentiert.

**Definition of Done:**

- [ ] PMI-Workstreams können angelegt, gepflegt und übergeben werden.
- [ ] IMO-Sicht liefert korrekte Live-Daten.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- C1
- E1
- K1
- K2
- M1
- L3

**Betroffene Rollen:**

- Integration Lead / IMO
- Workstream Leads PMI
- HR Lead
- IT Lead
- CFO / Finance Lead
- Executive Sponsor

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · K — Post-Merger-Integration_
