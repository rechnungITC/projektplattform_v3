---
id: PROJ-108
title: "Red-Flag-Log für die Due Diligence"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Highest
priority_source: "Must (MVP für die DD-Phase)"
labels: ["ma-platform", "epic-e", "mvp"]
dependencies: ["E1", "G1", "G3", "I2", "J1"]
roles: ["DD-Stream-Leads", "Deal Lead", "Legal Counsel", "CFO / Finance Lead", "Steering Committee"]
summary_for_jira: "[E2] Red-Flag-Log für die Due Diligence"
---

# PROJ-108: Red-Flag-Log für die Due Diligence

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: DD-spezifisch auf PROJ-20 risks. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP für die DD-Phase)  
> **Labels:** `ma-platform` · `epic-e` · `mvp`  
> **Abhängigkeiten:** `E1`, `G1`, `G3`, `I2`, `J1`

**User Story:**

Als DD-Verantwortlicher möchte ich während der Due Diligence Red Flags strukturiert erfassen und ihnen einen Schweregrad (potenzieller Deal Breaker, kaufpreisrelevant, vertraglich abdeckbar, akzeptierbar) zuordnen, damit die DD-Findings die Verhandlung und Bewertung konsequent steuern.

**Beschreibung / Kontext:**

Das Modell hebt das Red-Flag-Log als zentrales Steuerungsinstrument der DD-Phase hervor. Red Flags sind eine Sonderform von Risiken mit eigenem Workflow und besonderem Bezug zu Bewertung und Vertrag.

**Akzeptanzkriterien:**

- [ ] Red Flag anlegbar mit: DD-Stream, Beschreibung, Quelle/Dokumentenverweis, Schweregrad, Empfehlung (Abbruch / Nachverhandeln / Vertrag / Akzeptieren), Owner.
- [ ] Red Flags sind zwingend einem DD-Stream (G1) zugeordnet.
- [ ] Red Flags können in die Bewertungslogik (I2) und SPA-Issues-Liste (J1) übernommen werden.
- [ ] Ein dedizierter Red-Flag-Report ist exportierbar (PDF/Excel) für SteerCo-Vorlagen.
- [ ] Schweregrad 'potenzieller Deal Breaker' löst Pflicht-Information an Deal Lead und Sponsor aus.

**Abgrenzungen (Out of Scope):**

- Inhaltliche Bewertung bleibt fachliche Verantwortung der DD-Teams.
- Keine automatische Verknüpfung zu rechtlichen Quellsystemen.

**Offene Fragen:**

- Wer entscheidet final über die Klassifikation als 'Deal Breaker'?
- Wie wird ein Red Flag nach Closing weitergeführt (Übernahme in PMI-Risikoregister)?
- Sollen Red Flags in einer separaten Sicht für SteerCo zusammengefasst werden?

**Definition of Ready:**

- [ ] Klassifikationsschema und Eskalationsregeln sind freigegeben.

**Definition of Done:**

- [ ] Red-Flag-Log ist funktional, exportierbar, mit Bewertung und SPA-Issues-Liste verknüpfbar.
- [ ] Eskalation bei Deal Breaker funktioniert.

**Abhängigkeiten:**

- E1 – Risikoregister
- G1, G3 – DD-Streams, Findings
- I2 – Kaufpreis-Bridge
- J1 – SPA Issues List

**Betroffene Rollen:**

- DD-Stream-Leads
- Deal Lead
- Legal Counsel
- CFO / Finance Lead
- Steering Committee

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_
