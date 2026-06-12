---
id: PROJ-106
title: "Versionierung und Änderungshistorie von Deliverables"
issue_type: Story
epic_code: D
epic_title: "Deliverables & Artefakte"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-d", "should-have"]
dependencies: ["D1", "D2", "L3"]
roles: ["PMO-Lead", "Workstream Leads", "Compliance", "Datenschutzbeauftragter"]
summary_for_jira: "[D3] Versionierung und Änderungshistorie von Deliverables"
---

# PROJ-106: Versionierung und Änderungshistorie von Deliverables

## Status: Planned
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic D — Deliverables & Artefakte)
**Priority:** P1

> **Epic:** D — Deliverables & Artefakte  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-d` · `should-have`  
> **Abhängigkeiten:** `D1`, `D2`, `L3`

**User Story:**

Als PMO-Lead möchte ich, dass Deliverables und ihre verknüpften Dokumente versioniert werden, damit jederzeit nachvollziehbar ist, welche Version wann und durch wen freigegeben wurde.

**Beschreibung / Kontext:**

Insbesondere SPA, LOI, Bewertungsmodelle und DD-Berichte durchlaufen mehrere Versionen. Versionssicherheit ist Audit- und Compliance-Anforderung.

**Akzeptanzkriterien:**

- [ ] Beim Hochladen einer neuen Datei zu einem Deliverable wird automatisch eine neue Versionsnummer vergeben.
- [ ] Frühere Versionen bleiben einsehbar und unveränderlich gespeichert.
- [ ] Pro Version wird Datum, Uploader und Kommentar erfasst.
- [ ] Die 'aktuelle Version' ist klar gekennzeichnet.
- [ ] Versionen können mit Freigabeentscheidungen (D2) verknüpft werden.

**Abgrenzungen (Out of Scope):**

- Bei DMS-Integration übernimmt das DMS die Versionierung – die Plattform spiegelt den aktuellen Stand.
- Keine Diff-Anzeige zwischen Dokumentversionen.

**Offene Fragen:**

- Wer entscheidet Aufbewahrungsfristen je Deliverable-Typ?
- Soll die Plattform die Aufbewahrung auch nach Projektabschluss übernehmen oder in ein Archiv migrieren?

**Definition of Ready:**

- [ ] Aufbewahrungs- und Löschstrategie ist definiert.
- [ ] DMS-Anbindungs-Strategie ist entschieden.

**Definition of Done:**

- [ ] Versionierung ist funktionsfähig.
- [ ] Audit-Trail erfasst Versionswechsel.

**Abhängigkeiten:**

- D1, D2
- L3 – Audit-Trail

**Betroffene Rollen:**

- PMO-Lead
- Workstream Leads
- Compliance
- Datenschutzbeauftragter

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · D — Deliverables & Artefakte_
