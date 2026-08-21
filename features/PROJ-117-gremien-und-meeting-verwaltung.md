---
id: PROJ-117
title: "Gremien- und Meeting-Verwaltung"
issue_type: Story
epic_code: H
epic_title: "Kommunikation, Gremien & Stakeholder"
priority: Medium
priority_source: "Should"
labels: ["ma-platform", "epic-h", "should-have"]
dependencies: ["B2", "C1", "F2", "L3"]
roles: ["PMO-Lead", "Deal Lead", "Steering Committee", "Workstream Leads", "Communications Lead"]
summary_for_jira: "[H1] Gremien- und Meeting-Verwaltung"
---

# PROJ-117: Gremien- und Meeting-Verwaltung

## Status: Deployed (2026-07-21, Tag `v2.14.0-PROJ-117`)
## Deployment Scope: full

> **Scope-Klassifikation (PROJ-Y-145b, Tranche 3, 2026-08-20):** QA 2026-07-21: **AC1…AC4 ✅**, Pentest A–I 9/9, 0 Critical/High. **AC5 ist in der Spec ausdrücklich „optional … (offene Frage)"** und wurde per PO-Entscheid mit dem authentifizierten ICS-Download bedient; der volle Zwei-Wege-Kalender-Sync (PROJ-Y-117a) ist damit eine Erweiterung, keine zurückgestellte Anforderung.

> **Deployed 2026-07-21:** Tag `v2.14.0-PROJ-117`; Code live via PR #242 (squash → main `d5a0180`); Migration `20260721155102` seit /backend in Prod; Vercel auto-deploy from main. Post-Deploy-Smoke: meetings-list/commit/`meetings/ics` + committee-templates/seed + committees/from-template → alle 307 Auth-Gate ohne Leck. Kein neuer Env/Secret. Deploy-Fix: `moddatetime` → `extensions.moddatetime` schema-qualifiziert (bare Form bestand Prod, brach aber den Schema-Drift-Shadow-DB-Build; Prod-Trigger idempotent nachgezogen). Kein Nav-Konflikt mit PROJ-109 (Meetings hängen an der bestehenden Gremien-Fläche). Offene Followups: PROJ-Y-117a (Kalender-Sync), 117b (Datei-Upload/PROJ-79), 117c (Terminserien), 117d (Meeting→PROJ-13-Versand).

> **QA PASS 2026-07-21 (0 Critical/0 High → PRODUCTION-READY).** Live-Pentest `tests/sql/PROJ-117-committee-meetings-pentest.sql` **A–I 9/9 PASS** gegen aktuellen Prod re-verifiziert, 0 Residue (create+Floor-Lift, attendee+cross-project-reject, document, commit→2 neutrale decisions+1 task+3 outcomes ohne Minutes-Leak, non-manager-deny, **need-to-know hide→grant**, cross-tenant-iso, templates seed+idempotent+apply, audit). Playwright `tests/PROJ-117-committee-meetings.spec.ts` **13/13 chromium** (Auth-Gates: meetings list/create/detail/PATCH/DELETE + attendees + documents + commit + `meetings/ics` + committee-templates GET/POST/seed + committees/from-template). Advisors 0 ERROR/0 rls_disabled. vitest 2299/2299, lint 0, tsc 14 baseline/0 neu, build clean.
>
> **AC-Abdeckung:** AC1 ✅ (6 Standard-Vorlagen seed + apply + custom). AC2 ✅ (Termin mit Datum/Teilnehmer/Agenda/Pre-Read-Links/Protokoll + Beschlüsse/Maßnahmen). AC3 ✅ (commit_meeting_minutes → neutrale PROJ-20-decisions + PROJ-101-tasks, HIGH-2 vertraulicher Protokolltext bleibt am Termin). AC4 ✅ (Terminliste je Gremium, nach Datum sortiert, Status-Badge — erweiterte Filter/Vergangen-Kommend-Toggle = leichter Followup). AC5 ✅ (authentifizierter ICS-Export; volle 2-Wege-Sync → PROJ-Y-117a). **Hardening H1–H7 alle ✅** (Tenant-Iso, Need-to-know, Audit-CHECK-in-Migration, impersonationssicher, RLS-Bypass-Kontrakt, Floor, Live-Smoke). **Deviations/Followups:** PROJ-Y-117a (volle M365/Graph+Google-Kalender-Sync + öffentl. ICS-Feed), PROJ-Y-117b (Datei-Upload via PROJ-79), PROJ-Y-117c (Terminserien/Recurrence), PROJ-Y-117d (Meeting→PROJ-13-Versand), + kein separater Stammdaten-Vorlagen-Katalog (Verwaltung im Projektraum-Dialog). **Env:** Mobile-Safari-E2E übersprungen (WebKit-Host-Libs, PROJ-67/F2).

## Status (QA vorher): In Review (Backend + Frontend gebaut 2026-07-21; QA läuft)

> **Backend-DB gebaut 2026-07-21:** Migration `20260721155102_proj117_committee_meetings` in Prod. 5 Tabellen (`committee_meetings` mit Floor-Trigger ≥ committee + can_access_classified-Gate; `committee_meeting_attendees`/`_documents`/`_outcomes` erben den Gate transitiv via bare EXISTS(committee_meetings); `committee_templates` tenant-scoped). 11 RPCs (create/update/delete_committee_meeting, set/remove_meeting_attendee, add/remove_meeting_document, `commit_meeting_minutes` [atomar → neutrale PROJ-20-decisions + PROJ-101-tasks + outcome-Reverse-Links, H5 RLS-Bypass-Kontrakt], seed_committee_templates, create_committee_template, create_committee_from_template) — alle SECURITY DEFINER, auth.uid()-only, anon-revoked; Floor-Trigger-Fn trigger-only-revoked. Audit-Trio aus LIVE-Defs neu gebaut (inkl. PROJ-79 document_tree_nodes/documents erhalten) + entity_type-CHECK in derselben Migration + authenticated-Grant re-granted. **Pflicht-Live-RPC-Smoke `tests/sql/PROJ-117-committee-meetings-pentest.sql` A–I 9/9 PASS gegen Prod, 0 Residue** (create+floor-lift, attendee+cross-project-reject, document, commit→2 neutrale decisions+1 task+3 outcomes ohne Minutes-Leak, non-manager-deny, need-to-know hide→grant, cross-tenant-iso, templates seed+idempotent+apply, audit). Advisors 0 ERROR/0 rls_disabled. **TS-API-Layer gebaut 2026-07-21:** 11 Routen unter `committees/[committeeId]/meetings/*` (GET-list + POST-create, GET-detail[+attendees/documents/outcomes]/PATCH/DELETE, attendees POST + [attendeeId] DELETE, documents POST + [documentId] DELETE, commit POST, `meetings/ics` GET authentifizierter ICS-Export RFC5545) + `committee-templates` GET/POST + `/seed` POST + `committees/from-template` POST; alle gaten auf `requireProjectAccess "view"` (Autorität/Clearance in den RPCs). Client `lib/ma-project/committee-meetings-api.ts` + Typen. 12 Route-Tests (auth-gate/happy/error-mapping) grün. Gates: lint 0, tsc 14 baseline/0 neu, vitest 2299/2299, build clean (11 Routen registriert). **Frontend gebaut 2026-07-21:** Meetings-UI an der bestehenden „Gremien"-Fläche (kein neuer Nav-Eintrag). Pro Gremium-Karte „Termine"-Button → `CommitteeMeetingsSheet` (Termin-Liste + Anlegen + ICS-Download; Detail-Panel: Status/Agenda/Protokoll editieren+speichern, Teilnehmer add/remove mit Anwesenheit present/absent/guest, Pre-Read-/Anhang-Links add/remove, „Protokoll festhalten"-Dialog mit dynamischen Beschluss-/Maßnahmen-Zeilen → `commit_meeting_minutes`, Outcomes-Zusammenfassung). Header-Button „Aus Vorlage" → `CommitteeTemplatesDialog` (6 Standard-Vorlagen lazy-seed + Anlegen-aus-Vorlage + eigene Vorlage — AC1). Alle Mutationen edit-gated via `useProjectAccess("manage_members")`; Lesen member-level. React-Compiler-safe (await-first IIFE Effects, kein set-state-in-effect). Reuse shadcn Sheet/Dialog/Select/Table/Textarea; kein neues Dep. Gates: lint 0, tsc 14/0 neu, vitest 2299/2299, build clean. **Deviation:** kein separater Stammdaten-Vorlagen-Katalog — die Vorlagen-Verwaltung (seed/create/apply) liegt im „Aus Vorlage"-Dialog am Projektraum; dedizierter Admin-Katalog = optionaler Followup. **Offen:** /qa (Need-to-know-Pentest re-verify + Playwright Auth-Gates) → /deploy.

## Status (vorher): Architected (Tech-Design 2026-07-21, CIA GO-mit-ADJUST — EXTEND auf PROJ-98 committees; Meetings + confirm-gated Minutes-Commit → PROJ-20/PROJ-101. → /backend)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic H — Kommunikation, Gremien & Stakeholder)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: meetings auf PROJ-13 Communication. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** H — Kommunikation, Gremien & Stakeholder  
> **Priorität (Jira):** Medium · **Quell-Priorität:** Should  
> **Labels:** `ma-platform` · `epic-h` · `should-have`  
> **Abhängigkeiten:** `B2`, `C1`, `F2`, `L3`

**User Story:**

Als PMO-Lead möchte ich die im Modell vorgesehenen Regelgremien (Deal Core Team, Workstream Meetings, Steering Committee, Red-Flag-Review, Integration Readiness Review, Synergy Review) inkl. Frequenz, Teilnehmern, Agenda und Protokoll zentral verwalten, damit Steuerung und Nachvollziehbarkeit sichergestellt sind.

**Beschreibung / Kontext:**

Das Modell definiert eine explizite Regelkommunikationsstruktur. Die Plattform muss diese Gremien als Steuerungsobjekte abbilden – nicht als Kalender-Tool-Ersatz, sondern als verbindliche Verbindung zwischen Entscheidungen, Aufgaben, Risiken und Beschlusslage.

**Akzeptanzkriterien:**

- [ ] Gremientypen sind aus Vorlage konfigurierbar (Deal Core Team, Workstream, Steering, Red-Flag-Review, Integration Readiness, Synergy Review).
- [ ] Pro Termin sind Datum, Teilnehmer, Agenda, Pre-Read-Links, Protokoll, Beschlüsse und Maßnahmen erfassbar.
- [ ] Beschlüsse aus Meetings werden automatisch ins Entscheidungslog (F2) übernommen; Maßnahmen werden zu Aufgaben (C1).
- [ ] Eine Übersicht über vergangene und kommende Termine je Gremium ist filterbar.
- [ ] Eine Schnittstelle zu Outlook/M365/Google Calendar wird optional unterstützt (offene Frage).

**Abgrenzungen (Out of Scope):**

- Keine Videokonferenz-Integration in der Erst-Story.
- Keine automatische Protokollerstellung aus Audio/Transkript.

**Offene Fragen:**

- Welche Kalender-Schnittstellen werden für den Roll-out priorisiert?
- Soll die Protokoll-Erstellung in der Plattform oder in M365/Confluence/etc. erfolgen?

**Definition of Ready:**

- [ ] Gremien-Vorlagen und Pflichtfelder sind abgestimmt.
- [ ] Schnittstellenanforderungen (falls relevant) liegen vor.

**Definition of Done:**

- [ ] Anlegen, Pflegen und Filtern von Gremien und Terminen funktioniert.
- [ ] Automatische Übernahme in Entscheidungslog und Aufgabenliste ist getestet.

**Abhängigkeiten:**

- B2
- C1
- F2
- L3

**Betroffene Rollen:**

- PMO-Lead
- Deal Lead
- Steering Committee
- Workstream Leads
- Communications Lead

---

## Tech Design (Solution Architect) — 2026-07-21 · CIA GO-mit-ADJUST

> **Klasse EXTEND** auf dem live **PROJ-98 `committees`**-Backbone (Meetings waren PROJ-98s bewusster Followup **PROJ-Y-2** → diese Spec). **Reuse-Matrix-Drift bestätigt & verworfen:** die Zeile „meetings auf PROJ-13 Communication" stammt vom 2026-06-15, bevor `committees` (2026-07-03) existierte; PROJ-13 ist die *Sende-/Kanal*-Schicht (Outbox), kein Governance-Objekt-Anker. Ein Meeting ist ein Steuerungsobjekt mit Need-to-know, keine Nachricht → es hängt an `committees`. Kein neues Datenkonzept, **kein neuer npm-Dep**.

### Grundidee in einem Satz

Ein **Meeting** ist ein Termin eines PROJ-98-Gremiums; das Protokoll wird vom PMO **explizit committed** (kein stilles Mutieren, Invariante #2) über EINE atomare RPC, die je Beschluss eine **neutrale** PROJ-20-`decisions`-Zeile und je Maßnahme eine PROJ-101-`work_items`-Aufgabe erzeugt und beides per Reverse-Link am Meeting rückverweist — der vertrauliche Protokolltext bleibt RLS-gated am Meeting (HIGH-2-Muster aus PROJ-110).

### A) Komponenten-Struktur

```
M&A-Projektraum → bestehender Nav-Eintrag "Gremien" (PROJ-98, KEIN neuer Top-Level)
+-- Gremien-Liste (PROJ-98 committees, unverändert)
    +-- pro Gremium: Tab/Sektion "Termine" (NEU)
        +-- Termin-Liste (vergangene / kommende, filterbar — AC4)
        +-- Termin-Detail
        |   +-- Datum, Status (geplant/gehalten/abgesagt), Agenda, Vertraulichkeit
        |   +-- Teilnehmer (present/absent/guest, aus Gremienbesetzung vorbelegbar)
        |   +-- Pre-Read-Links + Protokoll-Anhang-Links (Verlinkung, kein Upload)
        |   +-- Protokoll (Freitext, need-to-know-gated)
        |   +-- "Protokoll festhalten" → Beschlüsse + Maßnahmen erfassen → Commit
        +-- Übernommene Beschlüsse (→ Entscheidungslog PROJ-111) + Maßnahmen (→ Aufgaben PROJ-101)
+-- Stammdaten → "Gremien-Vorlagen" (Tenant-Admin, 6 Standardtypen — AC1)
```

### B) Datenmodell in Klartext (5 neue Tabellen, alle `tenant_id NOT NULL`, EXTEND-Rezept)

1. **`committee_meetings`** — ein Termin je Gremium. `committee_id` (FK `committees`, ON DELETE CASCADE), `title`, `scheduled_at`, `ended_at` (nullable), `status` (geplant/gehalten/abgesagt), `agenda` (Text), `minutes` (Text, vertraulich), `confidentiality_level` (Floor ≥ Gremium), `sort_order`. Need-to-know via 2 SELECT-Policies (permissive `is_project_member` + RESTRICTIVE `can_access_classified`) + **Floor-Write-Trigger** (mirror PROJ-113 dd_questions: Meeting kann nie unter Gremien-Stufe fallen).
2. **`committee_meeting_attendees`** — Teilnahme je Termin, **stakeholder-zentriert** (`stakeholder_id NOT NULL`, Invariante #4), `attendance` (present/absent/guest). Eigene Tabelle statt `committee_members` weil: Members = stehende Besetzung, Attendees = per-Termin-Anwesenheit inkl. Gäste + Status. Sichtbarkeit erbt transitiv über EXISTS-Subquery auf `committee_meetings` (kein zweites Gate). Beim Anlegen optional aus `committee_members` vorbefüllbar.
3. **`committee_meeting_documents`** — Pre-Read-/Protokoll-**Verlinkung** (`label`, `url`, `kind` pre_read|minutes_attachment), analog `deliverable_documents`. Kein Binärspeicher — Datei-Upload folgt mit PROJ-79 (Deferral).
4. **`committee_meeting_outcomes`** — **Reverse-Link** (statt neuer Spalte an der Kern-Tabelle `decisions`): `meeting_id`, `outcome_type` (decision|action), `decision_id` (nullable FK), `work_item_id` (nullable FK). Hält vertraulichen Kontext auf der Meeting-Seite, lässt `decisions` unangetastet (kein Immutability/Audit/Zod-Churn auf PROJ-20), niedriger Blast-Radius. Task-Provenance zusätzlich weich über `work_items.attributes.source_meeting_id` (kein Schema-Change auf der Hot-Tabelle).
5. **`committee_templates`** — Tenant-Admin-Katalog (AC1), lazy-seed 6 Standardtypen (Deal Core Team, Workstream, Steering, Red-Flag-Review, Integration Readiness, Synergy Review) mit `name/purpose/cadence/default_confidentiality/default_decision_scope`; **Copy-on-create** in eine `committees`-Instanz (Muster `dd_stream_templates`/PROJ-95). Template setzt NUR Committee-Defaults — **keine** Terminserien/Recurrence (bewusst ausgeklammert → PROJ-Y-117c).

### C) Kern-RPC (der ADJUST-Punkt) — `commit_meeting_minutes`

SECURITY DEFINER, `auth.uid()`-only, **atomar** (eine TX): validiert Autorität (`is_tenant_admin OR is_project_lead`) + `can_access_classified` auf Meeting-Level; erzeugt je Beschluss eine **neutrale** PROJ-20-`decisions`-Zeile (neutraler Titel/`decision_text`, KEIN vertraulicher Protokolltext — mirror `decide_stage_gate`), je Maßnahme ein `work_items kind='task'` (setzt `tenant_id/project_id/kind/status='todo'/title/created_by/`+ optional `responsible_user_id/due_date/phase_id/workstream_id`), schreibt `committee_meeting_outcomes`-Rückverweise. **RLS-Bypass-Kontrakt (H5):** weil DEFINER die `work_items`-RLS umgeht, repliziert die RPC alle Insert-Invarianten explizit (die Zod-Route läuft im TS-Layer, nicht in der RPC). `gitnexus_impact` auf die work_items-Insert-Kette vor Build. Atomare RPC gewählt über „Decision-in-RPC + Tasks-per-Folge-Call" (letzteres gibt Atomizität auf → halb-committete Protokolle).

### D) Tech-Entscheidungen (Fork-Verdikte, CIA)

| Fork | Verdikt |
|---|---|
| 1 Meeting-Anker | **GO** — `committee_meetings` auf PROJ-98; PROJ-13-Zeile = verworfene Drift |
| 2 AC3 Auto-Übernahme | **GO** — confirm-gated atomare RPC, neutrale Decision, vertraulicher Text am Meeting (HIGH-2) |
| 2b Provenance | **Reverse-Link-Tabelle** `committee_meeting_outcomes` statt neuer `decisions`-Spalte |
| 3 Teilnahme | **GO** — eigene `committee_meeting_attendees` (stakeholder-zentriert), nicht committee_members, nicht JSON |
| 4 Vertraulichkeits-Floor | **GO** — `≥ committee`-Write-Trigger + can_access_classified, transitive Vererbung |
| 5 Agenda/Protokoll/Pre-Read | **GO** — Text + Link-Tabelle; Upload deferred (PROJ-79) |
| 6 AC1 „aus Vorlage" | **GO jetzt** — `committee_templates` lazy-seed 6 Typen, copy-on-create (billig, sonst AC1 offen) |
| 7 AC5 Kalender | **PO-Entscheidung 2026-07-21: ICS-Export JETZT (read-only, dep-frei).** Authentifizierter, RLS/need-to-know-gescoped **ICS-Download** je Gremium (`text/calendar`, RFC 5545, Bordmittel — nur sichtbare Meetings). Ein *öffentlich abonnierbarer* tokenisierter Feed würde den Need-to-know-Gate umgehen → **bleibt deferred** (PROJ-Y-117a) zusammen mit dem vollen M365/Graph+Google-Zwei-Wege-Sync (Schwere wie PROJ-49/133). |
| 8 work_items-Blast | **ADJUST** — RPC prüft Autorität + setzt alle Invarianten selbst (H5) + gitnexus_impact |

### E) Pflicht-Hardening-ACs

- **H1 Tenant-Isolation** — alle 5 Tabellen `tenant_id NOT NULL`; Cross-Tenant im Live-Pentest 0 Zeilen.
- **H2 Need-to-know-Pentest** — nicht-cleared Member sieht strict-Meeting/-Attendees/-Outcomes = 0; nach Clearance kippt Sichtbarkeit; Aggregat-Leak-Probe auf die Übersicht (AC4).
- **H3 Audit-entity_type-CHECK in DERSELBEN Migration** — alle 5 Tabellen in `audit_log_entity_type_check` **vor** dem ersten Trigger-Feuern (PROJ-114-H-1) + `can_read_audit_entry`-Zweige + **authenticated-EXECUTE nach Recreate re-granten**.
- **H4 Impersonationssichere RPCs** — kein actor-Param, `auth.uid()`-only, `execute` von public/anon revoked.
- **H5 RLS-Bypass-Kontrakt** — `commit_meeting_minutes` prüft Autorität + can_access_classified explizit + setzt alle work_items/decisions-Pflichtfelder selbst.
- **H6 Vertraulichkeits-Floor** — Live: Meeting nicht unter Gremien-Level setzbar; neutrale Decision ohne vertraulichen Protokolltext.
- **H7 Pflicht-Live-RPC-Smoke gegen Prod** — Happy-Path (Meeting → commit_minutes → 1 neutrale decision + N tasks + outcome-Links, 0 Residue) + Negativ (non-manager, cross-project attendee-reject, cross-tenant, Floor-Verletzung).

### F) Abhängigkeiten

- **Live:** PROJ-98 (committees), PROJ-20/111 (decisions), PROJ-101 (work_items/tasks), PROJ-100a (can_access_classified), PROJ-10 (Audit), PROJ-8 (stakeholders).
- **Neue npm-Pakete:** keine.

### G) Bewusste Deferrals (PROJ-Y-Kandidaten)

- **PROJ-Y-117a** — voller M365/Graph + Google Zwei-Wege-Kalender-Sync + *öffentlich abonnierbarer tokenisierter ICS-Feed* (AC5). Der schlanke authentifizierte ICS-**Download** ist in DIESER Slice (PO-Entscheidung 2026-07-21); die abonnierbare Variante bleibt deferred (Need-to-know-Gate-Bypass).
- **PROJ-Y-117b** — Datei-Upload für Pre-Reads/Protokolle über PROJ-79 DMS.
- **PROJ-Y-117c** — Recurrence/Terminserien für Regelgremien.
- **PROJ-Y-117d** — Meeting → Kommunikations-Versand (PROJ-13 Einladung/Protokoll-Verteilung), Brücke zu PROJ-118/119.

### H) Handoff

1 Migration (5 Tabellen + Floor-Trigger + Audit-CHECK/Trio in derselben Migration + RPCs `create/update/delete_committee_meeting`, `set_meeting_attendee`, `commit_meeting_minutes`) → **`/backend`** mit Pflicht-Live-Smoke → **`/frontend`** (Termine-Sektion am bestehenden „Gremien"-Nav-Eintrag + Vorlagen-Katalog in Stammdaten) → **`/qa`** (Need-to-know-Pentest inkl. H2/H6). ~4–5 PT.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · H — Kommunikation, Gremien & Stakeholder_
