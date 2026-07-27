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

## Status: Architected (Option A resumed 2026-07-27 — PROJ-79 blocker cleared; CIA-locked design promoted, no new CIA pass)
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

---

## Tech Design (Solution Architect) — Option A promoted, resumed 2026-07-27

> **Wiederaufnahme:** Der PROJ-79-Blocker ist diese Session gefallen (DMS Foundation α Deployed `v2.18.0`). Die CIA-gelockte Option A (2026-07-21) wird hier zum aktiven Tech-Design promotet — **kein neuer CIA-Pass** (spec-following, Muster = Core-Immutable-Supersede + M&A-EXTEND-Rezept). Live-Schema gegen PROJ-104/105 verifiziert: `deliverable_documents(id, tenant_id, deliverable_id, title, url, tag_keys, created_by, created_at)` + `deliverable_approval_events(id pk, …)` existieren.

### Was gebaut wird (WAS, nicht WIE)
**Versionskette pro Dokument-Slot auf `deliverable_documents`** (additive Erweiterung, keine neue Tabelle — Shared-Core, Invariante #5 analog `decisions.supersedes_*`):
- `version_no` — fortlaufende Nummer je Kette (Start 1). **AC1.**
- `supersedes_document_id` (nullable FK → `deliverable_documents`) — Zeiger auf die vorige Version; eine Kette = „derselbe" Dokument-Slot.
- `is_current` — genau eine Version je Kette ist die aktuelle. **AC4.**
- `version_comment` — Kommentar je Version. **AC3** (Datum = `created_at`, Uploader = `created_by`, bereits vorhanden).
- `approved_in_event_id` (nullable FK → PROJ-105 `deliverable_approval_events`) — verknüpft eine Version mit der Freigabeentscheidung. **AC5.** FK-Richtung: Version kennt ihr Event, die immutable Events-Tabelle wird **nicht** angefasst.

**„Neue Version" = ein atomarer RPC** (`auth.uid()`, edit-gated, mirror M&A-RPC-Muster): INSERT neue Row (`version_no` = Vorgänger+1, `supersedes_document_id` = Vorgänger, `is_current=true`) **+** Flip des alten `is_current=false` in einer TX → **ein sauberer Audit-Eintrag** (DoD „Audit erfasst Versionswechsel" gratis).

**Unveränderlichkeit früherer Versionen (AC2):** Immutability-Guard-Trigger blockt UPDATE der Inhaltsspalten (`title/url/version_no/version_comment/created_by/supersedes_document_id`); erlaubt bleibt nur der kontrollierte `is_current`-Flip + das `approved_in_event_id`-Stempeln.

### Datenmodell / Security
Keine neue Tabelle, kein neuer Dep. **Need-to-know erbt** über die bestehende RESTRICTIVE-Policy von `deliverable_documents` (an der Parent-`deliverables`-Vertraulichkeit) — die Versionsspalten sind additiv auf derselben Tabelle → gleicher Gate. Audit-Trio (`audit_log_entity_type_check` + `_tracked_audit_columns` + `can_read_audit_entry`) **non-destruktiv in derselben Migration** aus den Live-Defs neu gebaut (M&A-EXTEND-Rezept: alle Sibling-Entities erhalten, `authenticated`-Grant re-granted). Pflicht-Live-RPC-Smoke + Need-to-know-Pentest.

### Scope-Schnitt
- **MVP (jetzt):** Link-/Metadaten-Versionskette + `add_deliverable_document_version`-RPC + nullable Approval-Link + Immutability-Guard + UI-Versionsliste (Current-Badge, Uploader, Datum, Kommentar, Approval-Bezug).
- **Deferred → PROJ-Y-106b:** echter Binär-Upload/Storage-Bucket + Binär-Retention/Archiv (setzt auf PROJ-79-Storage auf).
- **Out-of-Scope (Spec):** Diff-Anzeige (PROJ-Y-106c); DMS-als-Store-of-Record (bestehende Klausel).

### Abhängigkeiten (verifiziert Deployed)
D1 = PROJ-104 (deliverables + deliverable_documents) ✅ · D2 = PROJ-105 (deliverable_approval_events) ✅ · L3 = PROJ-10/Core-Audit ✅. Kein neues npm-Paket, 1 Migration.

### Handoff
`/backend` (Migration: 5 Spalten + Immutability-Trigger + `add_deliverable_document_version`-RPC + Audit-Trio-Extend + Live-Smoke) → `/frontend` (Versionsliste je Dokument-Slot + „Neue Version"-Dialog) → `/qa` (Need-to-know-Pentest + Immutability-Probe + Playwright) → `/deploy`. ~2–3 PT.

> **Hinweis:** PROJ-79s eigene Out-of-Scope-Liste stellt „Document version history (for now overwrite-with-rename)" ebenfalls zurück — PROJ-106 bleibt also auch nach PROJ-79 die dedizierte Versionierungs-Slice, die auf dem dann existierenden Storage aufsetzt.
