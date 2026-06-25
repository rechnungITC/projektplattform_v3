---
id: PROJ-112
title: "Due-Diligence-Streams konfigurieren und steuern"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["A2", "C2", "G2", "G3", "G4", "F1"]
roles: ["Deal Lead", "Stream Leads (Commercial, Financial, Tax, Legal, HR, IT)", "PMO-Lead", "Externe Berater (lesend / mitwirkend)"]
summary_for_jira: "[G1] Due-Diligence-Streams konfigurieren und steuern"
---

# PROJ-112: Due-Diligence-Streams konfigurieren und steuern

## Status: Approved (QA PASS 2026-06-25 — 0 Critical/High; Live-RLS-Pentest 10/10 + Live-RPC-Smoke 10/10 + Playwright 10/10 + vitest 2037/2037. Backbone-ACs voll; Findings/Q&A-Counts + Prüfpunktliste + Gate-5 bewusst an PROJ-113/114/110 deferred. → /deploy)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND-Foundation** · Andockpunkt: neues DD-Backbone. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `A2`, `C2`, `G2`, `G3`, `G4`, `F1`

**User Story:**

Als Deal Lead möchte ich die sechs Due-Diligence-Streams (Commercial, Financial, Tax, Legal, HR, IT) pro Deal aktivieren, konfigurieren und mit Verantwortlichen, Zeitfenstern und Pflichtartefakten versehen, damit die DD strukturiert und vergleichbar gesteuert werden kann.

**Beschreibung / Kontext:**

Phase 5 des Modells ist die Due Diligence mit definierten Streams. Jeder Stream hat eigene Prüfpunkte und Deliverables. Die Plattform muss diese Streams als Steuerungsobjekte abbilden, ihnen Stream-Leads zuordnen, Statusinformationen erfassen und einen Gesamtüberblick zur DD-Reife geben.

**Akzeptanzkriterien:**

- [ ] Pro Projekt können DD-Streams aus einer konfigurierbaren Vorlage (mindestens Commercial, Financial, Tax, Legal, HR, IT) aktiviert werden, weitere Streams sind ergänzbar (z. B. ESG, Operations).
- [ ] Pro Stream sind hinterlegt: Stream-Lead, Zeitfenster, Pflicht-Deliverables (Report, Red-Flag-Log etc.), Prüfpunktliste aus Vorlage.
- [ ] Stream-Status kann gepflegt werden (nicht gestartet, gestartet, in Prüfung, Findings konsolidiert, abgeschlossen).
- [ ] Eine DD-Übersicht zeigt für jeden Stream den Status, die Anzahl offener Findings (G3), die Anzahl offener Q&A-Punkte (G2) und die Restzeit.
- [ ] Streams sind mit der Phase 'Due Diligence' (A2) verknüpft und werden in der Stage-Gate-Vorbereitung Gate 5 (siehe F1) ausgewertet.

**Abgrenzungen (Out of Scope):**

- Die Plattform stellt keinen virtuellen Datenraum bereit (siehe Annahme A1) – sie verlinkt nur (G4).
- Inhaltliche Prüfung ist Aufgabe der Stream-Verantwortlichen, nicht der Plattform.

**Offene Fragen:**

- Welche zusätzlichen Streams werden organisationsweit als Standard erwartet (z. B. ESG, Compliance, Insurance)?
- Sollen Vorlagen pro Branche/Deal-Größe variieren?

**Definition of Ready:**

- [ ] Standard-Vorlage je Stream (Prüfpunkte, Pflichtdeliverables) ist abgestimmt.
- [ ] Datenmodell für Stream-Status ist definiert.

**Definition of Done:**

- [ ] Streams können aktiviert, befüllt und gefiltert werden.
- [ ] Übersichtssicht zeigt korrekte Live-Daten.
- [ ] Eine Vorlage kann zentral geändert und an Folgeprojekte vererbt werden.

**Abhängigkeiten:**

- A2
- C2 – Workstreams
- G2
- G3
- G4
- F1

**Betroffene Rollen:**

- Deal Lead
- Stream Leads (Commercial, Financial, Tax, Legal, HR, IT)
- PMO-Lead
- Externe Berater (lesend / mitwirkend)

---

## Tech Design (Solution Architect) — 2026-06-24

> **Klasse EXTEND-Foundation** ([ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md), Reuse-Matrix Zeile 112). PROJ-112 ist das **DD-Backbone**, auf dem PROJ-113 (Q&A), PROJ-114 (Findings), PROJ-108 (Red-Flags), PROJ-110 (Gate 5) und PROJ-116 (DD-Report) aufsetzen. Erste Pilotwert-Stufe von Release 2.

### Grundidee in einem Satz

Ein **DD-Stream** ist ein eigenständiges Steuerungsobjekt pro M&A-Projekt (Commercial / Financial / Tax / Legal / HR / IT, erweiterbar): es trägt Stream-Lead, Zeitfenster, Status und Vertraulichkeitsstufe und ist die Hülle, an die später Q&A (113), Findings (114) und Red-Flags (108) hängen. Es wird aus einer **tenant-weiten Vorlage** aktiviert (Copy-on-create), nicht neu erfunden je Projekt.

### A) Komponenten-Struktur

```
Stammdaten (Tenant-Admin)
+-- "DD-Stream-Vorlagen"  (neuer Katalog, analog Berechtigungsprofile/Stakeholder-Typen)
    +-- 6 Standard-Streams vorbelegt: Commercial · Financial · Tax · Legal · HR · IT
    +-- erweiterbar (ESG, Operations, Compliance …), aktiv/inaktiv, Sortierung

M&A-Projektraum  (project_type='ma')
+-- Navigationseintrag "Due Diligence" (nur project_type='ma', requiresProjectType)
    +-- DD-Übersicht (Default-View)
    |   +-- je Stream: Status-Badge · Stream-Lead · Zeitfenster + Restzeit
    |   +-- Spalten "offene Findings" / "offene Q&A" (forward-compatible:
    |   |     zeigen "—" bis PROJ-113/114 live; dann Live-Counts)
    |   +-- Vertraulichkeits-Badge (Need-to-know-Stufe je Stream)
    +-- Aktion "Stream aktivieren"  (aus Vorlage wählen → Copy-on-create)
    +-- Stream-Detail / Bearbeiten
    |   +-- Stream-Lead setzen · Zeitfenster · Scope-Text · Vertraulichkeitsstufe
    |   +-- Status-Transition (5-Status-Maschine)
    |   +-- (Platzhalter-Sektionen für Q&A/Findings → PROJ-113/114)
    +-- Historie (PROJ-10 HistoryTab, entity_type='dd_streams')
```

### B) Datenmodell in Klartext

**`dd_stream_templates` — Tenant-Vorlagenkatalog** (erfüllt DoD „zentral änderbar + an Folgeprojekte vererbt")
- Tenant-Bezug, `stream_key` (z. B. `commercial`), Label, Beschreibung, Sortierung, aktiv/inaktiv
- Pro Tenant beim ersten Zugriff mit den 6 Standard-Streams vorbelegt (Seed); Admin kann ergänzen/deaktivieren
- Reine Tenant-Konfiguration (Tenant-RLS), keine Need-to-know-Klassifikation, kein Projektbezug
- Muster: identisch zu PROJ-100b Berechtigungsprofile / PROJ-Stakeholder-Typen (Admin-CRUD-Katalog)

**`dd_streams` — DD-Stream-Instanz pro Projekt** (das Backbone)
- Projekt- und Tenant-Bezug (Multi-Tenant-Invariante)
- `stream_key` + Label (beim Aktivieren aus der Vorlage kopiert — Copy-on-create, Fork 5 der ADR)
- **Stream-Lead:** `stream_lead_user_id` (nullable, FK auf Profile — gleiche Konvention wie `responsible_user_id` in work_items/risks/advisor; KEINE PROJ-57-Abhängigkeit nötig)
- **Zeitfenster:** `planned_start`, `planned_end` → „Restzeit" wird daraus abgeleitet (kein gespeicherter Wert)
- **Status:** 5-Status-Enum `not_started · started · in_review · findings_consolidated · completed`
- **Scope-Text** (frei), Notizen, Sortierung
- **Vertraulichkeit:** `confidentiality_level` (PROJ-100a `ma_confidentiality_level`, default `standard`)
- **Phasen-Link:** `phase_id` (nullable FK auf `phases`) — optionale, weiche Verknüpfung zur „Due Diligence"-Phase. **Bewusst nullable, weil PROJ-95 (M&A-Phasenmodell) noch nicht gebaut ist** → 112 blockiert nicht auf 95; der Link wird befüllbar, sobald 95 die Phase anlegt.
- Eindeutig je `(project_id, stream_key)`
- Field-Level-Audit (PROJ-10) auf Lead/Status/Zeitfenster/Vertraulichkeit/Scope

**Status-Transition** über eine `transition_dd_stream_status`-RPC (SECURITY DEFINER) — kein direktes UPDATE auf `status` (gleiches Muster wie `transition_phase_status` / `transition_project_status`).

### C) Tech-Entscheidungen (für PM begründet)

- **Eigenständiges Backbone, keine Abhängigkeit auf ungebaute Slices.** PROJ-95 (Phasen), 102 (Workstreams), 104 (Deliverables), 113 (Q&A), 114 (Findings), 110 (Gate 5) sind noch nicht gebaut. 112 wird so geschnitten, dass es **allein lauffähig** ist: Phasen-Link nullable, Findings-/Q&A-Counts „forward-compatible" (zeigen `—`/0, bis die Tabellen existieren), Gate-5-Auswertung bleibt PROJ-110.
- **Vertraulichkeit von Tag 1.** DD-Inhalte sind sensibel → `dd_streams` übernimmt das PROJ-100a Need-to-know-Rezept (Stufen-Spalte + 3 RESTRICTIVE-Policies über `can_access_classified`). Externe-Berater-/NDA-/Mandats-Gate (PROJ-99/128) greift dadurch automatisch mit. Tenant-RLS bleibt die äußere Schranke.
- **Vorlage als Tenant-Katalog (Copy-on-create), nicht als hartes Template-System.** Erfüllt die DoD-Vererbung ohne PROJ-96 abzuwarten; reiht sich ins bestehende Admin-CRUD-Katalog-Muster (Berechtigungsprofile) ein.
- **Status-Maschine als RPC**, konsistent mit dem etablierten State-Machine-Pattern (kein direktes Status-UPDATE, auditierbar).
- **Audit vollständig verdrahtet inkl. `can_read_audit_entry`-Zweig** für `dd_streams` (sonst Default-Deny → unsichtbare Historie; gelernt aus PROJ-99 Historie-Lücke).

### D) Bewusste Scope-Cuts (an Folge-Slices delegiert)

| AC-Bestandteil | Wohin | Begründung |
|---|---|---|
| Prüfpunktliste je Stream | **PROJ-113** (DD-Fragenkatalog/Q&A) | Das IST der Fragenkatalog; gehört nicht doppelt ins Backbone |
| Pflicht-Deliverables (Report, Red-Flag-Log) tracken | **PROJ-104** (Deliverables) / **PROJ-108** (Red-Flag-Log) | Deliverable-Objekt existiert noch nicht; 112 hält nur den Scope-Text |
| Offene-Findings-/Q&A-Counts (live) | **forward-compatible** auf PROJ-113/114 | Tabellen fehlen; Übersicht zeigt `—`, bis sie da sind |
| Auswertung in Gate 5 | **PROJ-110** (Stage-Gate) | 112 macht Stream-Status nur abfragbar |
| Workstream-Gruppierung | **PROJ-102** | optionale Roll-up-Achse, nicht MVP-kritisch |

### E) Abhängigkeiten

- **Muss vorhanden sein (alle live):** PROJ-94 (`project_type='ma'`), PROJ-19 (`phases`), PROJ-100a (Need-to-know-Gate), PROJ-10 (Audit), PROJ-4 (`is_project_member`/`requireProjectAccess`).
- **Forward-compatible (nicht blockierend):** PROJ-95 (Phasen-Link nullable), PROJ-113/114 (Counts), PROJ-110 (Gate 5), PROJ-102 (Workstreams).
- **Neue npm-Pakete:** keine.

### F) Architektur-Forks — CIA-Review 2026-06-24 (GO mit ADJUST)

CIA-Verdikt: **GO** für den Backbone-Schnitt + Fork 1/2/5; **ADJUST** für Fork 3 + 4 (vor /backend eingearbeitet, siehe unten).

1. **Vorlagen-Tiefe → GO (Katalog).** Code-Konstante erfüllt die DoD „zentral änderbar **+** vererbt" nicht (nicht zur Laufzeit pro Tenant änderbar). `dd_stream_templates` reiht sich ins bestehende Admin-CRUD-Katalog-Muster (PROJ-100b Berechtigungsprofile / Stakeholder-Typen) → kein neues Pattern, kein YAGNI. **Klarstellung:** „vererbt" = **Copy-on-create** (neue Folgeprojekte erben den neuen Vorlagenstand; **laufende** Projektstreams werden NICHT retroaktiv mutiert — Audit-Stabilität). /qa testet gegen diese Semantik.
2. **Phasen-Link → GO/keep (nullable FK, ON DELETE SET NULL).** Korrekt als forward-compatible Anker; `phase_key`-Textanker wäre schlechter (keine referenzielle Integrität). **Klarstellung:** Die *Befüllung* von `phase_id` ist **PROJ-95-Scope**, nicht 112; 112 knüpft **kein Verhalten** an `phase_id` (kein Filter, keine Pflicht) → keine tote UI-Erwartung bis PROJ-95 live ist.
3. **Findings/Q&A-Counts → ADJUST (wichtigster Punkt).** `0` würde als „Stream sauber" fehlgelesen, solange PROJ-113/114 nicht gebaut sind. **Auflage eingearbeitet:** Backend liefert für diese Spalten **`null`** (nicht `0`), Frontend zeigt **`—` mit Tooltip „verfügbar mit DD-Q&A/Findings"**, niemals `0`. **AC4 (Counts) ist explizit DEFERRED bis PROJ-113/114** (kein implementierter Stub). → [[PROJ-Y-112a]].
4. **Single-Responsibility → ADJUST (Backbone-Kontrakt explizit machen).** Scope-Schnitt korrekt; ergänzt um Abschnitt **F-2 (Backbone-Kontrakt)**, damit 113/114/108 ein stabiles Anker-Pattern erben statt eines neu zu erfinden.
5. **Stream-Lead = `profiles`-FK → GO** (MVP); PROJ-57-Participant-Pfad später.

### F-2) Backbone-Kontrakt für PROJ-113 / 114 / 108

- **`dd_streams.id` ist der stabile Anker.** 113 (Q&A), 114 (Findings), 108 (Red-Flags) hängen ihre Objekte über eine eigene `dd_stream_id`-FK (in *deren* Tabellen, deren Scope) an einen Stream.
- **Counts** der DD-Übersicht (offene Findings / offene Q&A) werden als **Aggregat über `dd_stream_id`** in 113/114 berechnet und in genau die hier vorgesehenen Übersichts-Spalten eingehängt (bis dahin `null`/`—`).
- **Status `findings_consolidated`** ist der semantische Übergabepunkt an die Findings-Konsolidierung (114) und die Gate-5-Auswertung (110).

### F-3) Migrations-Pflicht-Auflagen (CIA Fork 5)

- **`audit_log_entity_type_check` VOR dem ersten Write erweitern** (Reihenfolge: CHECK → Tabelle → Trigger). CHECK wird **verbatim neu erstellt** (kein `ADD VALUE`) → volle bestehende Werteliste kopieren **+ `dd_streams`** ergänzen. (PROJ-100a-H-1-Lektion.)
- **`can_read_audit_entry`-Zweig für `dd_streams`** (`when 'dd_streams' then select project_id …`) — sonst Default-Deny → unsichtbare Historie (PROJ-99-Lektion).
- **`dd_stream_templates` bekommt KEINEN PROJ-10-Audit-Trigger** (tenant-weite Config ohne Projektbezug → `can_read_audit_entry` hätte keinen Anker). Damit entfällt auch ein `entity_type`-Eintrag für die Vorlagentabelle. (Resolved CIA-Offene-Frage 1.)
- **Idempotente DDL** (`create table if not exists`) + Migrations-`name` == Repo-Dateiname-Stamm (PROJ-134-Drift-Vermeidung).
- **Lazy-Seed der 6 Standard-Vorlagen pro Tenant race-safe** via `INSERT … ON CONFLICT (tenant_id, stream_key) DO NOTHING` (kein globaler Cross-Tenant-Seed).

### F-4) Autoritäts-Schwellen (resolved)

- **Stream aktivieren / bearbeiten / löschen** und **Vorlagenkatalog pflegen:** manager-gegatet (`requireProjectAccess(… "manage_members")` bzw. Tenant-Admin für den Katalog) — konsistent mit advisors/NDAs.
- **Status-Transition** (`transition_dd_stream_status`): MVP ebenfalls manager-gegatet. *Optionaler Follow-up:* Stream-Lead darf den Status des **eigenen** Streams transitionieren (Self-Service) — bewusst nicht im MVP, um die Autoritätslogik schlank zu halten.

### G) Handoff

Nach Approval: `/backend` (Migration: 2 Tabellen + Status-RPC + Confidentiality-Policies + Audit-Wiring + Seed; APIs + Client-Wrapper) → `/frontend` (Stammdaten-Katalog + DD-Übersicht/Detail im Projektraum) → `/qa` (Negativtests: Confidentiality-Gate je Stream, Status-Maschine, Cross-Tenant, Audit-Sichtbarkeit).

## Implementation Notes — Backend (2026-06-24)

**Kein neuer Dep.** Migration `20260624105317_proj112_dd_streams_backbone.sql` (Repo-Dateiname == prod-registrierte Version per PROJ-134; idempotent) **live in Prod**:

- **`dd_streams`** (per-Projekt-Backbone): `stream_key`/`label`/`stream_lead_user_id`(FK profiles, ON DELETE SET NULL)/`status`(5-Status-CHECK)/`planned_start`-`end`/`scope`/`notes`/`confidentiality_level`(100a)/`phase_id`(nullable FK phases, ON DELETE SET NULL)/`sort_order`. Unique `(project_id, stream_key)`. Permissive RLS (SELECT=`is_project_member`, INSERT/UPDATE/DELETE=`is_tenant_admin OR is_project_lead`) + **3 RESTRICTIVE Need-to-know-Gate-Policies** (`can_access_classified`) → Advisor-/NDA-Gate (PROJ-99/128) wrappt automatisch. `moddatetime`-`updated_at` + PROJ-10-UPDATE-Audit-Trigger.
- **`dd_stream_templates`** (Tenant-Katalog): `stream_key`/`label`/`description`/`sort_order`/`is_active`. Unique `(tenant_id, stream_key)`. RLS SELECT=Tenant-Member, Write=Tenant-Admin. **Kein Audit-Trigger** (Tenant-Config ohne Projekt-Anker — CIA-resolved).
- **`transition_dd_stream_status(p_stream_id, p_to_status, p_comment)`** RPC (SECURITY DEFINER, **kein actor-param** — PROJ-94-Impersonation-Lektion; `auth.uid()` only, execute von public/anon revoked): Authority `is_tenant_admin OR is_project_lead` (sonst 42501), 5-Status-Maschine (linear vorwärts + 1-Schritt-Revert + Reopen, illegale → 23514).
- **`ensure_default_dd_stream_templates(p_tenant_id)`** RPC (SECURITY DEFINER, `is_tenant_member`-gegatet): race-safe Lazy-Seed der 6 Standards via `ON CONFLICT DO NOTHING`.
- **Audit-Verdrahtung (CIA-Pflicht-Auflagen):** `audit_log_entity_type_check` VOR den Tabellen um `dd_streams` erweitert (verbatim-Liste + 1; Templates NICHT); `_tracked_audit_columns` + `can_read_audit_entry` aus den **Live-Definitionen** rekonstruiert + `dd_streams`-Zweig (bewahrt die advisor/nda-Zweige des parallelen PROJ-99-Followups).

**APIs** (mirror advisors-Pattern): `GET/POST /api/projects/[id]/dd-streams`, `PATCH/DELETE …/[streamId]`, `POST …/[streamId]/status` (RPC, 42501→403 / 23514·22023→400 / P0002→404); Tenant-Katalog `GET/POST /api/dd-stream-templates` (GET lazy-seedet) + `PATCH/DELETE …/[templateId]` (admin). Client-Wrapper `src/lib/ma-project/dd-streams-api.ts`. **Forward-compatible (CIA-ADJUST):** Stream-Liste liefert `open_findings`/`open_questions` = **`null`** (nicht 0) bis PROJ-113/114 → FE rendert `—`.

**Pflicht-Live-Smoke gegen Prod (10/10, 0 Residue, transaktional zurückgerollt):** Seed (6 + idempotent), Aktivierung, valide Transition `not_started→started`, illegale `started→completed` geblockt (23514), **Nicht-Member-Transition geblockt (42501)**, Audit-Trigger feuert auf Label-UPDATE, `can_read_audit_entry('dd_streams')`=true, Confidentiality-Gate (Admin-Bypass strict=true / Nicht-Member confidential=false).

**Quality-Gates:** ESLint 0, vitest +22 (dd-streams 9 / status 7 / templates 6), tsc 0 neue Errors (14 Baseline-Test-File-Errors), `next build` clean.

**Offen → /frontend:** DD-Übersicht (Status/Lead/Restzeit + `—`-Counts) + Stream-Detail/Status-UI im M&A-Projektraum (neuer Nav-Eintrag „Due Diligence", `requiresProjectType='ma'`) + Stammdaten-Katalog „DD-Stream-Vorlagen". → /qa Negativtests (Confidentiality-Gate je Stream, Status-Maschine, Cross-Tenant, Audit-Sichtbarkeit).

## Implementation Notes — Frontend (2026-06-24)

**Kein neuer Dep, shadcn/ui-first.** Reine UI auf den live-APIs + `dd-streams-api.ts`.

- **Nav:** neuer `MA_DUE_DILIGENCE_SECTION` („Due Diligence", `tabPath='due-diligence'`, `requiresProjectType='ma'`) in `method-templates/index.ts`, injiziert via `withMaFoundation` direkt nach „Governance & Zugriff" — erscheint nur in M&A-Projekten (type-gefiltert in beiden Renderern).
- **Projektraum-Seite** `/projects/[id]/due-diligence` → `due-diligence-streams-page.tsx`: Übersichtstabelle (Stream · Status · Lead · Zeitfenster + **Restzeit** · Vertraulichkeits-Badge · Findings · Q&A · Aktionen). **Sichtbar für Projekt-Mitglieder** (GET view-gegatet); Aktivieren/Bearbeiten/Status/Löschen nur bei `useProjectAccess(…, "manage_members")`. **Findings/Q&A-Spalten zeigen `—`** (API liefert `null`, nicht `0` — CIA-ADJUST, Tooltip „verfügbar mit PROJ-113/114"). Status-Wechsel via inline-`Select` mit genau den erlaubten Folgezuständen (`allowedDdTransitions` spiegelt die Server-State-Maschine). „Stream aktivieren"-Dialog lädt den Vorlagen-Katalog (nur aktive, noch nicht aktivierte) → Copy-on-create. Edit-Dialog: Lead (Projekt-Member-Picker), Zeitfenster, Vertraulichkeit, optionale Phase (PROJ-19), Scope, Notizen.
- **Stammdaten-Katalog** `/stammdaten/dd-stream-vorlagen` → `dd-stream-templates-page-client.tsx` + `dd-stream-template-form-dialog.tsx` (Muster: Berechtigungsprofile): Admin-CRUD, GET lazy-seedet die 6 Standards, `stream_key` nach Anlage fest, Deaktivieren/Reaktivieren/Löschen. Neue Kachel im Stammdaten-Index (`adminOnly`).
- **Labels-Helper** `dd-stream-labels.ts`: DE-Status-/Level-Labels, Badge-Varianten, `allowedDdTransitions` (Mirror der RPC-Maschine), `remainingTime` (Restzeit aus `planned_end`, deterministisches `today` via `useMemo`).

**Quality-Gates:** ESLint 0, tsc 0 neue Errors (14 Baseline), `next build` clean (2 neue Routen: `/projects/[id]/due-diligence` + `/stammdaten/dd-stream-vorlagen`). vitest unverändert (Backend-Route-Tests decken die kritischen Pfade; reine UI-Slice). Playwright-Auth-Gate-Smoke + Live-Negativtests → /qa.

## QA Test Results — 2026-06-25

**Verdikt: PRODUCTION-READY** — 0 Critical / 0 High. DD-Backbone (Tabellen + RPCs + Confidentiality + Audit) live in Prod, RLS unter echtem `authenticated`-Rollen-Kontext bewiesen.

### Akzeptanzkriterien
| AC | Ergebnis | Nachweis |
|---|---|---|
| AC1 Streams aus konfigurierbarer Vorlage aktivieren (min 6, erweiterbar) | ✅ | `dd_stream_templates` 6-Standards-Lazy-Seed + Admin-CRUD (ESG etc.) + Aktivieren-Dialog (Copy-on-create); Live-Smoke V1/V6 |
| AC2 Stream-Lead + Zeitfenster | ✅ | Edit-Dialog (Lead-Picker/Datumsfenster/Scope) · **Pflicht-Deliverables → PROJ-104, Prüfpunktliste → PROJ-113 (bewusst deferred, ADR-konform)** |
| AC3 Stream-Status (5 Zustände) pflegbar | ✅ | `transition_dd_stream_status`-RPC + inline-Status-`Select`; Live-Smoke valide/illegale Transition (23514) |
| AC4 DD-Übersicht: Status + Restzeit | ✅ | Übersichtstabelle Status-Badge + `remainingTime`; **Findings/Q&A-Counts `—` (null, nicht 0) bis PROJ-113/114 — CIA-ADJUST** |
| AC5 Phasen-Link (A2) + Gate-5 (F1) | ✅ (forward-compat) | nullable `phase_id`-FK (Befüllung = PROJ-95-Scope); **Gate-5-Auswertung → PROJ-110** |

### Security / Red-Team — Live-RLS-Pentest (`tests/sql/PROJ-112-dd-streams-pentest.sql`, 10/10, echtes `authenticated`-Rollen, 0 Residue)
| Vektor | Ergebnis |
|---|---|
| Uncleared Member sieht `standard`-Stream, **NICHT** `confidential` (Need-to-know-Gate, kein Existenz-Leak) | ✅ V1a/V1b |
| Cleared Member sieht `confidential` nach Clearance-Grant | ✅ V2 |
| Cross-Tenant: T2-Admin sieht 0 T1-Streams | ✅ V3 |
| Write-Gate: Editor (≠ lead/admin) kann Stream nicht updaten | ✅ V4 |
| RPC-Authority: Editor-Transition geblockt (42501) | ✅ V5 |
| Template-Tenant-Isolation (gleicher `stream_key` cross-tenant getrennt) | ✅ V6a/V6b |
| Audit-Read-Gate: Nicht-Member denied, Admin allowed | ✅ V7a/V7b |

Ergänzend: **Backend-Live-RPC-Smoke 10/10** (Seed/idempotent, State-Machine, 42501, Audit-Trigger, Gate-Bypass/Deny). **PROJ-100a-Pentest** bleibt grün (Gate-Prädikat unverändert; dd_streams reusen es verbatim).

### Tests
- **Playwright** `tests/PROJ-112-dd-streams.spec.ts` **10/10 chromium** — Auth-Gates auf 8 API-Routen + 2 Seiten (Projektraum `/due-diligence` + Stammdaten `/dd-stream-vorlagen`).
- **vitest 2037/2037** (inkl. 22 neue: dd-streams 9 / status 7 / templates 6); keine Regression.
- ESLint 0, tsc 0 neue Errors (14 Baseline), `next build` clean.

### Findings (alle Low/Info, nicht-blockierend)
- **F-1 (Low):** `remainingTime` nutzt ein beim Mount fixiertes `today` (`useMemo`) → „Restzeit" aktualisiert sich nicht, wenn der Tab über Mitternacht offen bleibt. Kosmetisch.
- **F-2 (Info):** Phasen-Picker im Edit-Dialog ist leer, solange PROJ-95 keine M&A-Phasen anlegt (erwartetes forward-compat-Verhalten; `phase_id` bleibt null).
- **D-1 (Env):** Mobile-Safari/WebKit-E2E übersprungen (Host-Libs fehlen — `sudo npx playwright install-deps webkit`), wie in PROJ-67/88/135. Chromium grün.

### Followups (PROJ-Y, nicht-blockierend)
- **PROJ-Y-112a:** DD-Übersicht-Live-Counts aktivieren, sobald PROJ-113/114 die `dd_stream_id`-Tabellen liefern (heute `—`).
- **PROJ-Y-112b:** `phase_id`-Befüllung an die DD-Phase bei PROJ-95-Build.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
