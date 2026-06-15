---
id: PROJ-109
title: "Maßnahmen-Tracking und Owner-Verantwortung"
issue_type: Story
epic_code: E
epic_title: "Risiken & Red Flags"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-e", "should-have"]
dependencies: ["E1", "E2", "C1", "F1"]
roles: ["Risiko-Owner", "PMO-Lead", "Deal Lead"]
summary_for_jira: "[E3] Maßnahmen-Tracking und Owner-Verantwortung"
---

# PROJ-109: Maßnahmen-Tracking und Owner-Verantwortung

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic E — Risiken & Red Flags)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-20 Open-Items + PROJ-9. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** E — Risiken & Red Flags  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-e` · `should-have`  
> **Abhängigkeiten:** `E1`, `E2`, `C1`, `F1`

**User Story:**

Als Risiko-Owner möchte ich Maßnahmen zu meinen Risiken und Red Flags definieren, terminieren und im Status verfolgen, damit klar ist, ob ein Risiko aktiv adressiert wird oder offen bleibt.

**Beschreibung / Kontext:**

Risiken ohne Maßnahmen sind im M&A-Umfeld ein häufiges Problem. Die Plattform muss erzwingen oder zumindest unterstützen, dass jedes nicht-akzeptierte Risiko mindestens eine Maßnahme hat oder begründet ohne Maßnahme bleibt.

**Akzeptanzkriterien:**

- [ ] Pro Risiko und Red Flag kann mindestens eine Maßnahme angelegt werden, die als Aufgabe (C1) referenziert ist.
- [ ] Maßnahmen haben Status (geplant, in Umsetzung, umgesetzt, verworfen) und Frist.
- [ ] Werden Risiken auf Status 'aktiv' geführt, prüft die Plattform vor Stage-Gate-Übergang (F1), ob Maßnahmen oder begründete Akzeptanz vorliegen, und gibt Hinweise.
- [ ] Eine Maßnahmen-Übersicht ist je Risiko, je Risiko-Owner und je Workstream verfügbar.

**Abgrenzungen (Out of Scope):**

- Wirtschaftlichkeitsbewertung der Maßnahmen ist nicht in Scope.
- Plattform erzwingt keine Maßnahme zwingend, sondern weist hin.

**Offene Fragen:**

- Soll der Maßnahmen-Hinweis bei Stage-Gate hart blockierend oder weich beratend sein?

**Definition of Ready:**

- [ ] Verknüpfung Risiko ↔ Maßnahme ist konzeptionell geklärt.

**Definition of Done:**

- [ ] Verknüpfung und Übersicht funktionieren.

**Abhängigkeiten:**

- E1, E2
- C1
- F1

**Betroffene Rollen:**

- Risiko-Owner
- PMO-Lead
- Deal Lead

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · E — Risiken & Red Flags_
