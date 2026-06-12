---
id: PROJ-105
title: "Freigabe-Workflow für Deliverables"
issue_type: Story
epic_code: D
epic_title: "Deliverables & Artefakte"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-d", "should-have"]
dependencies: ["D1", "B1", "L3"]
roles: ["PMO-Lead", "Workstream Leads", "Deal Lead", "Geschäftsführung (als Freigeber)"]
summary_for_jira: "[D2] Freigabe-Workflow für Deliverables"
---

# PROJ-105: Freigabe-Workflow für Deliverables

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic D — Deliverables & Artefakte)
**Priority:** P1

> **Epic:** D — Deliverables & Artefakte  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-d` · `should-have`  
> **Abhängigkeiten:** `D1`, `B1`, `L3`

**User Story:**

Als Verantwortlicher eines Deliverables möchte ich es zur Review einreichen, kommentieren lassen und durch den definierten Freigeber freigeben lassen, damit Deliverables nachvollziehbar autorisiert werden.

**Beschreibung / Kontext:**

Viele Deliverables (LOI, indikatives Angebot, DD-Bericht, SPA) müssen formell durch festgelegte Rollen freigegeben werden. Diese Freigabe muss dokumentiert und auditierbar sein.

**Akzeptanzkriterien:**

- [ ] Pro Deliverable kann ein Freigabeworkflow konfiguriert werden (1- oder mehrstufig).
- [ ] Beim Einreichen werden definierte Reviewer benachrichtigt.
- [ ] Reviewer können kommentieren, freigeben oder zur Überarbeitung zurückweisen.
- [ ] Finaler Freigabestatus inkl. Datum und freigebender Person wird gespeichert.
- [ ] Eine Freigabehistorie ist je Deliverable einsehbar (auch im Audit-Trail L3).

**Abgrenzungen (Out of Scope):**

- Keine inhaltliche Online-Bearbeitung des Dokuments.
- Keine elektronische Signatur (gehört zu J3).

**Offene Fragen:**

- Müssen mehrstufige parallele Freigaben (Legal und Tax parallel) unterstützt werden?
- Soll die Freigabe an ein gesellschaftsrechtlich verbindliches Beschlussformat gekoppelt sein?
- Wie wird mit Rückweisungen umgegangen (neue Versionsnummer? siehe D3)?

**Definition of Ready:**

- [ ] Workflow-Varianten sind abgestimmt.
- [ ] Benachrichtigungsregeln liegen vor.

**Definition of Done:**

- [ ] Freigabe-Workflow funktioniert einstufig und mehrstufig.
- [ ] Audit-Trail enthält Freigaben.

**Abhängigkeiten:**

- D1 – Deliverable-Katalog
- B1 – Rollen
- L3 – Audit-Trail

**Betroffene Rollen:**

- PMO-Lead
- Workstream Leads
- Deal Lead
- Geschäftsführung (als Freigeber)

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · D — Deliverables & Artefakte_
