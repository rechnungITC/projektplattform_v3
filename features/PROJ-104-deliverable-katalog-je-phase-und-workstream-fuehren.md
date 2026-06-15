---
id: PROJ-104
title: "Deliverable-Katalog je Phase und Workstream führen"
issue_type: Story
epic_code: D
epic_title: "Deliverables & Artefakte"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-d", "mvp"]
dependencies: ["A1", "A2", "A3", "B1", "C1", "C2"]
roles: ["PMO-Lead", "Workstream Leads", "Deal Lead"]
summary_for_jira: "[D1] Deliverable-Katalog je Phase und Workstream führen"
---

# PROJ-104: Deliverable-Katalog je Phase und Workstream führen

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic D — Deliverables & Artefakte)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `deliverables` (an PROJ-79 DMS). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** D — Deliverables & Artefakte  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-d` · `mvp`  
> **Abhängigkeiten:** `A1`, `A2`, `A3`, `B1`, `C1`, `C2`

**User Story:**

Als PMO-Lead möchte ich für jede Phase und jeden Workstream einen Katalog der zu erstellenden Deliverables (LOI, DD-Berichte, SPA, Closing Checklist) verwalten, damit verbindlich erkennbar ist, was bis wann zu liefern ist und wer dafür verantwortet.

**Beschreibung / Kontext:**

Das Modell listet pro Phase Deliverables (LOI, DD-Reports, SPA, Closing Memorandum, Day-1-Plan etc.). Diese sind die wesentlichen Steuerungsobjekte zur Fortschrittsbewertung.

**Akzeptanzkriterien:**

- [ ] Deliverable kann angelegt werden mit Name, Beschreibung, Phase, Workstream, Verantwortlichem (RACI), Solltermin, Status.
- [ ] Status: geplant, in Arbeit, in Review, freigegeben, ausgesetzt.
- [ ] Deliverables sind aus Template (A3) vorbelegbar.
- [ ] Ein Deliverable kann mit Dokumenten verknüpft werden (Datei-Upload oder Link zu DMS/Datenraum).
- [ ] Eine 'Deliverable-Ampel' im Workstream-Dashboard (C2) zeigt überfällige und kritische Deliverables.

**Abgrenzungen (Out of Scope):**

- Inhaltliche Qualitätsprüfung des Deliverables ist nicht Aufgabe der Plattform.
- Keine eigene Dokumentenerstellung.

**Offene Fragen:**

- Welches DMS / welcher Datenraum wird primär angebunden?
- Müssen Deliverables zwingend versioniert sein (siehe D3) oder reicht externe Versionierung im DMS?
- Wer entscheidet bei fehlenden Standard-Deliverables (z. B. neuer Deal-Typ)?

**Definition of Ready:**

- [ ] Standard-Deliverable-Liste je Phase ist mit M&A abgestimmt.
- [ ] Anbindungs-Strategie zu DMS/Datenraum ist entschieden.

**Definition of Done:**

- [ ] Deliverables sind anlegbar, befüllbar, verknüpfbar.
- [ ] Status und Frist sind nachverfolgbar.
- [ ] Vorbelegung aus Template funktioniert.

**Abhängigkeiten:**

- A1, A2, A3 – Projekt, Phase, Template
- B1 – Rollen
- C1, C2 – Aufgaben, Workstreams

**Betroffene Rollen:**

- PMO-Lead
- Workstream Leads
- Deal Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · D — Deliverables & Artefakte_
