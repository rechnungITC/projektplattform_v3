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

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **DUP→REUSE** · Andockpunkt: PROJ-10 Field-Level-Versioning. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

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

---

## Architecture Note — Deferred pending PROJ-79 (CIA 2026-07-21)

`/architecture` gestartet, dann **bewusst zurückgestellt**: PROJ-106 wartet auf echten Datei-Storage aus **PROJ-79 (DMS Foundation)**. User-Entscheidung 2026-07-21 — erst PROJ-79 bauen. Die CIA-Analyse ist hier konserviert, damit sie bei Wiederaufnahme nicht verloren geht.

**CIA-Kernkorrektur:** Die Spec-Klassifikation *„DUP→REUSE, Andockpunkt PROJ-10"* ist teilweise falsch. PROJ-10-Audit protokolliert nur Feld-Diffs und kennt **kein** nummeriertes Versions-Objekt mit `is_current`-Marker + Approval-Bezug → AC1/AC4/AC5 nicht abgedeckt (Option C scheidet aus). Ein Deliverable-Record-Snapshot (Option B) wäre redundant zum bereits aktiven `deliverables`-Audit → Shared-Core-Verstoß.

**Empfohlener Weg bei Wiederaufnahme (Option A im „D-Framing"):** Versionskette pro Dokument-Slot über das Core-Immutable-Supersede-Muster (Invariante #5, analog `decisions.supersedes_*`). `deliverable_documents` additiv erweitern: `version_no`, `supersedes_document_id`, `is_current`, `version_comment`, `approved_in_event_id` (nullable FK → PROJ-105 `deliverable_approval_events`, = AC5). „Neue Version" = INSERT neue Row + `is_current`-Flip der alten (ein sauberer Audit-Eintrag → DoD „Audit erfasst Versionswechsel" gratis). Immutability-Guard-Trigger für AC2. Audit-Trio non-destruktiv in derselben Migration erweitern (M&A-EXTEND-Rezept). FK-Richtung: Version kennt ihr Approval-Event, nicht umgekehrt (immutable events-Tabelle nicht anfassen).

**Scope-Schnitt (bei Wiederaufnahme):**
- **MVP (nach PROJ-79):** Link-/Metadaten-Versionskette + INSERT-Version-RPC (`auth.uid()`) + nullable Approval-Link + Immutability-Guard + UI-Versionsliste (Current-Badge/Uploader/Datum/Kommentar).
- **Deferred → PROJ-79/DMS:** echter Binär-Upload + Storage-Bucket, Binär-Retention/Archiv.
- **Out-of-Scope (Spec):** Diff-Anzeige.

**DoR-Defaults (kein Hard-Blocker):** (1) DMS-Strategie = bestehende Out-of-Scope-Klausel (DMS wird Store-of-Record sobald PROJ-79 landet, Plattform spiegelt). (2) Retention = folgt Projekt-Lifecycle bis Tenant-Offboarding (PROJ-17); per-Typ-Fristen warten mit Binär-Storage.

**Followup-Kandidaten:** PROJ-Y-106a (Auto-Stempel der aktuellen Version beim finalen PROJ-105-Approve), PROJ-Y-106b (Binär-Versionierung + Retention, mit PROJ-79-DMS), PROJ-Y-106c (Versions-Diff-Ansicht).

> **Hinweis:** PROJ-79s eigene Out-of-Scope-Liste stellt „Document version history (for now overwrite-with-rename)" ebenfalls zurück — PROJ-106 bleibt also auch nach PROJ-79 die dedizierte Versionierungs-Slice, die auf dem dann existierenden Storage aufsetzt.
