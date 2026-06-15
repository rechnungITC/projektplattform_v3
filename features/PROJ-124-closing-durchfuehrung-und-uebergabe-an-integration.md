---
id: PROJ-124
title: "Closing-Durchführung und Übergabe an Integration"
issue_type: Story
epic_code: J
epic_title: "Vertrag, Signing & Closing"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-j", "should-have"]
dependencies: ["J2", "A2", "K1", "K2", "L3"]
roles: ["Deal Lead", "Legal Counsel", "CFO / Finance Lead", "PMO-Lead", "Integration Lead / IMO", "Executive Sponsor"]
summary_for_jira: "[J3] Closing-Durchführung und Übergabe an Integration"
---

# PROJ-124: Closing-Durchführung und Übergabe an Integration

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic J — Vertrag, Signing & Closing)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neu (PMI-Brücke). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** J — Vertrag, Signing & Closing  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-j` · `should-have`  
> **Abhängigkeiten:** `J2`, `A2`, `K1`, `K2`, `L3`

**User Story:**

Als Deal Lead möchte ich am Closing-Tag eine strukturierte Closing-Sicht (Agenda, Zahlungsanweisungen, Closing Accounts, Übergabeprotokolle, Closing-Memorandum) abrufen und nach erfolgreichem Closing die Übergabe an das IMO (K2/K3) auslösen können.

**Beschreibung / Kontext:**

Phase 8 endet mit dem Closing als rechtlich-wirtschaftlichem Vollzug, gefolgt vom Übergang in die Integration. Das Modell sieht eine 'Closing Agenda' und einen 'Closing Memorandum' vor. Die Plattform muss diesen Übergang sicherstellen und Wissen aus Deal-Team an Integrationsteam überführen.

**Akzeptanzkriterien:**

- [ ] Eine 'Closing-Day-Sicht' bündelt: Status aller Closing Conditions (J2), Closing-Agenda, Zahlungs- und Eigentumsschritte, Verantwortliche, Closing-Memorandum-Link.
- [ ] Nach erfolgreichem Closing wird das Projekt automatisch auf die Folgephase 'Integrationsplanung' (A2) gesetzt; das Deal Core Team kann eine Übergabe-Checkliste an das IMO abarbeiten.
- [ ] Die Übergabe-Checkliste umfasst mindestens: DD-Findings, Synergie-Hypothesen, offene Garantien/Freistellungen, kritische Schlüsselpersonen, IT-/Carve-out-Aufgaben, Kommunikationsstand.
- [ ] Eine 'Lessons-Learned-Vorlage' wird angelegt und auf die Phase 10 verschoben.
- [ ] Audit-Trail (L3) erfasst den Phasenwechsel und die Übergabe.

**Abgrenzungen (Out of Scope):**

- Keine Echtzeit-Banktransaktionsabwicklung.
- Keine elektronische Notariatsanbindung.

**Offene Fragen:**

- Soll am Closing-Tag eine 'War-Room-Sicht' (Live-Status) realisiert werden?
- Welche Daten werden in welcher Form an ein Linien-System (z. B. Konzern-Stammdaten) übergeben?

**Definition of Ready:**

- [ ] Closing-Day-Layout und Übergabe-Checkliste sind abgestimmt.
- [ ] Lessons-Learned-Vorlage ist definiert.

**Definition of Done:**

- [ ] Sicht und Übergabe-Workflow funktionieren End-to-End.
- [ ] Phasenwechsel ist automatisiert.
- [ ] Audit-Trail (L3) ist aktiv.

**Abhängigkeiten:**

- J2
- A2
- K1
- K2
- L3

**Betroffene Rollen:**

- Deal Lead
- Legal Counsel
- CFO / Finance Lead
- PMO-Lead
- Integration Lead / IMO
- Executive Sponsor

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · J — Vertrag, Signing & Closing_
