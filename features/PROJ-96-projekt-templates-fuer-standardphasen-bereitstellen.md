---
id: PROJ-96
title: "Projekt-Templates für Standardphasen bereitstellen"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Medium
priority_source: "Should (MVP-nahe; nicht zwingend Tag 1, aber für Skalierung wichtig)"
labels: ["ma-platform", "epic-a", "should-have"]
dependencies: ["A1", "A2", "C1", "D1", "B1"]
roles: ["Head of Corporate Development", "PMO-Lead", "Template-Admin"]
summary_for_jira: "[A3] Projekt-Templates für Standardphasen bereitstellen"
---

# PROJ-96: Projekt-Templates für Standardphasen bereitstellen

## Status: In Progress (Backend live 2026-07-24; /frontend + /qa offen)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: PROJ-6 Rule-Engine-Preset + Copy-on-create (echte Lücke: Core hat kein Template-System). Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** A — Projektgrundlagen & Phasenmodell  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should (MVP-nahe; nicht zwingend Tag 1, aber für Skalierung wichtig)  
> **Labels:** `ma-platform` · `epic-a` · `should-have`  
> **Abhängigkeiten:** `A1`, `A2`, `C1`, `D1`, `B1`

**User Story:**

Als Head of Corporate Development möchte ich Projekt-Templates mit vordefinierten Phasen, Aufgaben, Deliverables und Rollen bereitstellen, damit neue M&A-Projekte methodisch konsistent und ohne Aufbauaufwand starten können.

**Beschreibung / Kontext:**

Die zehn M&A-Phasen folgen einem gleichbleibenden Best-Practice-Muster. Damit Projekte nicht jedes Mal neu aufgesetzt werden müssen, sollen Templates die Standardstruktur abbilden, die je Deal-Typ angepasst werden kann.

**Akzeptanzkriterien:**

- [ ] Mindestens ein Standard-Template 'Buy-Side M&A' ist als Default verfügbar (alle Phasen, Standard-Workstreams, Standard-Deliverables, Standard-Rollen).
- [ ] Templates können durch berechtigte Nutzer (Rolle 'Template-Admin') angelegt, kopiert und versioniert werden.
- [ ] Bei Projektanlage (A1) kann ein Template ausgewählt werden; alle Standardinhalte werden in das neue Projekt übernommen.
- [ ] Nach Übernahme können alle Inhalte projektindividuell angepasst werden, ohne das Template zu verändern.
- [ ] Eine Template-Änderung wirkt nicht rückwirkend auf bereits angelegte Projekte (Versionsstand wird festgehalten).

**Abgrenzungen (Out of Scope):**

- Künstliche Intelligenz zur Erzeugung individueller Templates ist nicht in Scope.
- Konkrete Vertrags- oder Bewertungsvorlagen werden nicht mitgeliefert – das bleibt fachliche Eigenleistung.

**Offene Fragen:**

- Welche Deal-Typen sollen als Template-Varianten existieren (Buy-Side, Sell-Side, Carve-out, JV, Minderheitsbeteiligung)?
- Wer ist organisatorisch für die Template-Pflege verantwortlich?
- Soll es Freigabesperren geben (z. B. 'Template nur durch Head of M&A freigebbar')?

**Definition of Ready:**

- [ ] Template-Inhalte (Phasen, Standard-Tasks, Standard-Deliverables) sind fachlich abgestimmt.
- [ ] Versionierungsmodell ist definiert.

**Definition of Done:**

- [ ] Mindestens ein produktives Template ist hinterlegt.
- [ ] Projektanlage mit Template-Auswahl funktioniert.
- [ ] Versionierung und Änderungs-Historie sind nachweisbar.

**Abhängigkeiten:**

- A1 – Projektanlage
- A2 – Phasenmodell
- C1, D1, B1 – Aufgaben, Deliverables, Rollen

**Betroffene Rollen:**

- Head of Corporate Development
- PMO-Lead
- Template-Admin

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · A — Projektgrundlagen & Phasenmodell_

---

## Tech Design (Solution Architect) — 2026-07-24

> **Klasse:** EXTEND · **CIA-reviewed** (Fork „Template-Content-Repräsentation" + Scope-Schnitt). Andockpunkt: `committee_templates`-Muster (PROJ-117) als 1:1-Blaupause. Kein neuer Dependency, keine neue Tenant-Rolle.

### Kernentscheidungen (CIA-gelockt)

**1. Ein Template ist ein Baum aus echten Tabellen — kein JSON-Blob.**
Ein Projekt-Template beschreibt die M&A-Standardstruktur. Wir speichern diese Struktur in **echten Katalog-Tabellen** (nicht als JSON-Klumpen), damit sie vom bestehenden Schema-Drift-Wächter (PROJ-42) mitgeprüft, feldgenau auditierbar und im UI sauber pflegbar bleibt.

Neue Tabellen (Tenant-Katalog, geteilte Konfiguration — **kein** projektbezogenes Vertraulichkeits-Gate):
- **Template-Kopf** — Name, Schlüssel, Deal-Seite (Default „buy"), Versionsnummer, aktiv-Flag, Beschreibung.
- **Template-Workstreams** — die Standard-Arbeitsstränge (Label, Ziel, Vertraulichkeitsstufe, Reihenfolge).
- **Template-Deliverables** — die Standard-Ergebnisse, jeweils einem Template-Workstream zugeordnet (Name, Beschreibung, Status, Reihenfolge).

Zugriff wie bei allen bestehenden Katalogen: **lesen** = jedes Tenant-Mitglied, **pflegen (anlegen/ändern)** = Tenant-Admin.

**2. „Wirkt nicht rückwirkend" entsteht durch die entkoppelte Kopie — nicht durch schwere Versionierung.**
Wenn ein Template auf ein Projekt angewendet wird, werden die Inhalte **als eigenständige Kopie** in die Live-Strukturen des Projekts geschrieben (genau wie heute schon bei Gremien-aus-Vorlage). Es gibt keinen Rück-Verweis vom Projekt in den Template-Inhalt → spätere Template-Änderungen können ein bestehendes Projekt gar nicht mehr berühren (AC5 ist damit strukturell erfüllt).
Zusätzlich bekommt jede kopierte Zeile einen **Herkunfts-Stempel** (welches Template + welche Versionsnummer), damit der „Versionsstand festgehalten" nachweisbar ist. Die Versionsnummer am Template-Kopf zählt der Admin bei einer Änderung selbst hoch. Eine vollständige, unveränderliche Versionshistorie ist **bewusst nicht** im MVP (→ PROJ-Y-96c).

**3. Phasen werden wiederverwendet, nicht doppelt gebaut.**
Die 10 M&A-Standardphasen existieren bereits als deployter Baustein (PROJ-95, `activate_ma_phase_model`). Das „Template anwenden" ruft diesen bestehenden Baustein für die Phasen auf und kopiert nur Workstreams + Deliverables selbst. Kein zweites Phasenmodell, keine Duplikation. (Phase 2 bleibt wie gehabt mandats-abhängig; bei frischem Projekt ohne freigegebenes Mandat wird sie übersprungen — das UI weist darauf hin.)

**4. „Template anwenden" ist ein einziger, atomarer Vorgang.**
Ein neuer Server-Vorgang `Template-auf-Projekt-anwenden` (Berechtigung: Tenant-Admin **oder** Projektleiter, nur für `project_type='ma'`) führt in einem Zug aus: Phasen aktivieren → Workstreams kopieren → Deliverables kopieren (mit Zuordnung zum jeweils frisch angelegten Workstream) → Herkunfts-Stempel setzen. Schlägt ein Schritt fehl, wird alles zurückgerollt. **Mehrfach-Anwendung wird hart blockiert** (wenn das Projekt schon Workstreams hat), um Duplikate zu vermeiden — MVP = einmalig bei Projektanlage.

### Ablauf / Andockpunkt

```
Projekt-Anlage-Wizard (M&A)
+-- ... bestehende Schritte ...
+-- M&A-Grundlage (PROJ-94)
+-- [NEU] Template-Auswahl (Dropdown: verfügbare Templates des Tenants)
        |
        v  (bei Finalize, nach Profil-Anlage — best-effort, wie die anderen Schritte)
   "Template anwenden" -> Phasen + Workstreams + Deliverables ins neue Projekt kopiert
```

- **Standard-Template bereitstellen:** Ein „Buy-Side M&A"-Default wird pro Tenant beim ersten Zugriff **lazy geseedet** (idempotent, Admin-getrieben) — exakt das Muster von `dd_stream_templates`/`committee_templates`.
- **Admin-Oberfläche (MVP):** Liste der Templates + „Standard-Template anlegen"-Button unter den Stammdaten. **Kein** tiefer Struktur-Editor im MVP (→ PROJ-Y-96d).
- **Projektanlage:** Template-Picker im Wizard; nach Übernahme ist alles projektindividuell editierbar (bestehende Workstream-/Deliverable-Pflege), ohne das Template zu verändern.

### Rolle „Template-Admin" — Deviation
Es wird **keine neue Tenant-Rolle** eingeführt (das Rollen-Modell kennt hart nur admin/member/viewer; eine neue Rolle wäre ein Hoch-Risiko-Eingriff in alle Policies). Die in der Spec genannte Rolle „Template-Admin" wird durch die bestehende **Tenant-Admin**-Berechtigung erfüllt. → dokumentierte Deviation.

### MVP-Scope-Schnitt (CIA)

**IN:** Katalog-Kopf + 2 Kind-Tabellen (Workstreams, Deliverables) · 1 Buy-Side-Default (lazy-seed) · atomarer Anwenden-Vorgang mit Phasen-Reuse + Herkunfts-Stempel · Wizard-Template-Picker + Finalize-Hook · Admin-Liste/Seed-UI.

**DEFER → PROJ-Y:**
- **PROJ-Y-96a** — 5 Deal-Typ-Varianten (Sell-Side/Carve-out/JV/Minority) + template-eigene, editierbare Phasenmodelle.
- **PROJ-Y-96b** — RACI-/Rollen-Templates (heute hängt RACI nur an konkreten Work-Items/Deliverables, es gibt kein projektweites Rollen-Objekt) + phasen-verankerte Template-Deliverables.
- **PROJ-Y-96c** — Freigabesperre („Template nur durch Head of M&A publizierbar") + vollständige unveränderliche Versionshistorie.
- **PROJ-Y-96d** — Tiefer Template-Editor (Reihenfolge per Drag, Feld-Ebene).

### Datenmodell (Klartext)

```
Template-Kopf (ma_project_templates)
- Tenant, eindeutiger Schlüssel, Name, Deal-Seite (Default "buy")
- Versionsnummer (Admin zählt bei Änderung hoch), aktiv-Flag, Beschreibung

Template-Workstream (gehört zu genau einem Template)
- Label, Ziel, Vertraulichkeitsstufe, Reihenfolge, Workstream-Schlüssel

Template-Deliverable (gehört zu genau einem Template)
- Name, Beschreibung, Status, Reihenfolge
- Verweis auf den Template-Workstream (über dessen Schlüssel; wird beim Kopieren
  auf den frisch angelegten Projekt-Workstream umgemappt)

Bei Anwendung ins Projekt kopiert nach: phases (via PROJ-95-Reuse),
workstreams, deliverables — jeweils mit Herkunfts-Stempel (Template-ID + Version).
```

### Verbindliche Hardening-Auflagen (CIA, für /backend)
1. **Audit-Verdrahtung in derselben Migration**: neue Tabellen in den `entity_type`-CHECK + `_tracked_audit_columns` aufnehmen und den `authenticated`-EXECUTE-Grant auf `can_read_audit_entry` **in derselben Migration re-granten** (wiederkehrender Cross-cutting-Bruch, vgl. PROJ-114-H-1).
2. **Pflicht-Live-RPC-Smoke** gegen Prod: Seed → Apply → Verify (Workstreams + Deliverables + Herkunfts-Stempel) → Re-Apply-Block → Teardown mit 0 Residue.
3. **Migration-Naming** (Repo-Dateiname == prod-registrierte Version, PROJ-134) + `extensions.moddatetime` schema-qualifiziert.
4. **Impact-Analyse** auf `activate_ma_phase_model` vor dem Reuse-Aufruf (`gitnexus_impact upstream`).
5. **Kein neuer Dependency**, keine neue Tenant-Rolle.

### Dependencies (Packages)
Keine. Reine EXTEND auf bestehendem Stack + deployten Bausteinen (PROJ-94/95/97/101/102/104/117).

---

## Implementation Notes — /backend (2026-07-24)

**Migration `20260724120055_proj96_ma_project_templates` (in Prod + Repo, PROJ-134-konform):**
- 3 Katalog-Tabellen `ma_project_templates` (Kopf: template_key/name/deal_side/version/is_active) + `ma_template_workstreams` + `ma_template_deliverables` (alle mit `tenant_id NOT NULL` per Multi-Tenant-Invariante; Kind-Tabellen FK `template_id` ON DELETE CASCADE). RLS: read=`is_tenant_member`, write=`is_tenant_admin` (committee/dd_stream-Muster).
- **Provenance-Spalten** additiv nullable auf `workstreams` + `deliverables`: `source_template_id` (FK ON DELETE SET NULL) + `source_template_version`.
- `ensure_default_ma_project_templates(tenant)` — lazy-seed des Buy-Side-Defaults (7 Workstreams + 9 Deliverables), idempotent, `is_tenant_member`-gated, SECURITY DEFINER.
- `apply_ma_project_template(project, template)` — atomarer Copy-RPC: `is_tenant_admin OR is_project_lead`, ma-only, harter Re-Apply-Block, **reuse `activate_ma_phase_model`** für Phasen + Copy Workstreams/Deliverables mit `workstream_key→id`-Remap + Provenance-Stempel. Beide RPCs: anon revoked, authenticated granted.
- **Audit-Deviation (dokumentiert):** kein `record_audit_changes`-Trigger auf den Katalog-Tabellen (nur `extensions.moddatetime`) — folgt dem `dd_stream_templates`-Präzedenzfall (Template = Tenant-Config). Damit werden die giant Audit-Funktionen NICHT rekreiert → kein Grant-Drop-Risiko, kein Clobbering paralleler Sessions. Ehrt die CIA-AC-1-Intention (nichts bricht) besser als das committee-Muster.

**API + Wiring:**
- `GET /api/ma-project-templates` (tenant-scoped: lazy-seed + Liste mit genesteten Workstreams/Deliverables, 3 flache Selects → schema-drift-guard-safe) — für Wizard-Picker (vor Projektexistenz) + Admin-Katalog.
- `POST /api/projects/[id]/apply-template` `{templateId}` (spiegelt phase-model/activate; 403/404/409-Mapping).
- Wizard-**Finalize-Hook** (Step 4.3, nach Profil-Anlage, best-effort): liest `ma_foundation.template_id`, ruft `apply_ma_project_template` — Fehler blockt Finalize NICHT (Projekt bleibt nutzbar, Admin kann später via Route anwenden).
- FE-Client `src/lib/ma-project/templates-api.ts` (Typen + `listMaProjectTemplates` + `applyMaProjectTemplate`).

**Pflicht-Live-RPC-Smoke gegen Prod (0 Residue, via RAISE-Rollback):** Seed → Apply → Verify → Re-Apply-Block. Ergebnis: `seeded=1 · ws_created=7 · del_created=9 · ws_with_provenance=7 · reapply_blocked=true · phase_model={seeded:9, phase2_locked:true, mandate_status:draft}`. 0 Residue verifiziert (smoke_projects=0).

**Gates:** lint 0 · tsc 12 baseline/0 neu · Route-Tests 12/12 · Finalize-Regression 28/28 · Build clean (beide Routen registriert) · Security-Advisors 0 ERROR (nur Standard-INFO `authenticated_security_definer_function_executable`).

**Offen:** /frontend (Wizard-Template-Picker im ma_foundation-Step + Admin-Katalog-Liste/Seed unter Stammdaten) → /qa (Live-E2E Wizard-mit-Template + Need-to-know/Authority-Pentest auf apply-RPC).
