---
id: PROJ-113
title: "DD-Fragenkatalog und Q&A-Prozess"
issue_type: Story
epic_code: G
epic_title: "Due Diligence"
priority: Highest
priority_source: "Must (MVP)"
labels: ["ma-platform", "epic-g", "mvp"]
dependencies: ["G1", "G3", "G4", "L2", "B4"]
roles: ["Stream Leads", "Deal Lead", "Externe Berater", "Target-Vertreter (indirekt, via Export)"]
summary_for_jira: "[G2] DD-Fragenkatalog und Q&A-Prozess"
---

# PROJ-113: DD-Fragenkatalog und Q&A-Prozess

## Status: Approved (QA PASS 2026-06-26 — 0 Critical/High; Live-RLS-Pentest 13/13 + Live-RPC-Smoke 11/11 + Playwright 6/6 + vitest 2080/2080 + Advisor 0 ERROR. Backbone-ACs voll; Eskalation→Finding deferred an PROJ-114. → /deploy)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic G — Due Diligence)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **EXTEND** · Andockpunkt: neue `dd_questions`. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** G — Due Diligence  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP)  
> **Labels:** `ma-platform` · `epic-g` · `mvp`  
> **Abhängigkeiten:** `G1`, `G3`, `G4`, `L2`, `B4`

**User Story:**

Als Stream Lead möchte ich Fragen an die Verkäuferseite strukturiert stellen, deren Beantwortung verfolgen und Folgen ableiten können, damit der Q&A-Prozess transparent gesteuert wird und keine Frage verloren geht.

**Beschreibung / Kontext:**

Ein zentrales Element jeder DD ist der Q&A-Prozess. Die Plattform muss Fragen je Stream sammeln, an die Gegenseite (oder den Vermittler) weitergeben, Antworten erfassen und Status sowie Folgemaßnahmen verfolgen. Die Plattform muss dabei auch das im Modell geforderte Need-to-know-Prinzip respektieren (siehe L2).

**Akzeptanzkriterien:**

- [ ] Fragen können je Stream mit Titel, Detail, Frist, Priorität und Adressat erfasst werden.
- [ ] Eine Frage durchläuft die Stati: offen, in Beantwortung, beantwortet, nachgefragt, geschlossen.
- [ ] Eine Antwort kann inkl. Anlagen oder Verlinkungen (z. B. in den externen Datenraum) hinterlegt werden.
- [ ] Eine Frage kann zu einem Finding (G3) eskaliert werden; die Verknüpfung ist sichtbar.
- [ ] Q&A-Sichten sind nach Stream, Status, Frist und Owner filterbar; eine Export-Funktion liefert eine Frageliste für die Gegenseite.
- [ ] Sichtbarkeit der Q&A-Inhalte folgt dem Need-to-know-Prinzip (siehe L2).

**Abgrenzungen (Out of Scope):**

- Die Plattform stellt keine direkte VDR-Q&A-Integration bereit; Q&A wird parallel oder per Export gespiegelt (offene Frage).
- Automatische Klassifikation von Fragen ist nicht in Scope.

**Offene Fragen:**

- Soll eine Schnittstelle zu gängigen VDR-Q&A-Tools (z. B. Datasite, Intralinks, ansarada) realisiert werden?
- Wie wird mit vertraulichen 'Clean-Team'-Fragen umgegangen?

**Definition of Ready:**

- [ ] Q&A-Prozess (Verantwortlichkeiten, Eskalationswege) ist mit Legal/M&A abgestimmt.
- [ ] Sichtbarkeitsregeln (Need-to-know) sind dokumentiert.

**Definition of Done:**

- [ ] Erfassen, Beantworten, Eskalieren und Filtern funktionieren.
- [ ] Sichtbarkeit ist gemäß Berechtigungskonzept B4 durchgesetzt.
- [ ] Export-Funktion erzeugt eine externe Fragenliste.

**Abhängigkeiten:**

- G1
- G3
- G4
- L2
- B4

**Betroffene Rollen:**

- Stream Leads
- Deal Lead
- Externe Berater
- Target-Vertreter (indirekt, via Export)

---

## Tech Design (Solution Architect) — 2026-06-25

> **Klasse EXTEND** ([ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md), Reuse-Matrix Zeile 113: neue `dd_questions`). Hängt am **PROJ-112 DD-Backbone** (`dd_streams.id` ist der stabile Anker, Backbone-Kontrakt F-2 in PROJ-112). Folgt dem 112-Rezept (neue Tabelle + Status-RPC + 100a-Confidentiality + PROJ-10-Audit) — kein neues Pattern.

### Grundidee in einem Satz

Eine **DD-Frage** hängt an einem DD-Stream, durchläuft eine 5-Status-Q&A-Maschine (offen → in Beantwortung → beantwortet → nachgefragt → geschlossen), trägt eine Antwort (Text + Datenraum-Link) und eine eigene Vertraulichkeitsstufe (Clean-Team-fähig); sie ist filter- und exportierbar und kann später zu einem Finding (PROJ-114) eskaliert werden.

### A) Komponenten-Struktur

```
M&A-Projektraum > Due Diligence  (PROJ-112)
+-- Stream-Detail / neuer Tab "Fragen & Antworten"
    +-- Q&A-Liste (Filter: Stream · Status · Frist · Owner · Vertraulichkeit)
    |   +-- je Frage: Titel · Adressat · Priorität · Frist + Restzeit · Status-Badge · Vertraulichkeit
    +-- Aktion "Frage erfassen" (Titel/Detail/Adressat/Priorität/Frist/Owner/Stufe)
    +-- Frage-Detail
    |   +-- Antwort (Text + Datenraum-Link) erfassen
    |   +-- Status-Transition (5-Status-Maschine)
    |   +-- (Platzhalter "Zu Finding eskalieren" → aktiv mit PROJ-114)
    +-- Aktion "Exportieren" (CSV-Fragenliste für die Gegenseite, RLS-gefiltert)
    +-- Historie (PROJ-10 HistoryTab, entity_type='dd_questions')
```

### B) Datenmodell in Klartext

**`dd_questions` — eine DD-Frage** (am Stream verankert)
- Projekt-/Tenant-Bezug (Multi-Tenant-Invariante) + **`dd_stream_id`** (FK → `dd_streams`, ON DELETE CASCADE — Fragen gehören zum Stream)
- `title`, `detail`, `addressee` (Adressat = Gegenseite/Vermittler, Freitext — kein Plattform-User), `priority` (low/medium/high), `due_date`, `responsible_user_id` (Owner, FK profiles nullable)
- **`status`** (5-Status-CHECK): `open · in_answering · answered · followup · closed`
- **Antwort am Row** (MVP, eine aktuelle Antwort; Verlauf via Audit): `answer_text`, `answer_link` (https-validierter Datenraum-Link), `answered_at`, `answered_by`, **`answer_round` smallint default 1** (CIA Fork 4 — kennt die Runde, damit ein späterer Thread-Backfill [[PROJ-Y-113a]] sie kennt; Export/Report kontrahieren gegen Status-Maschine + aktuelle Antwort, NIE gegen „die einzige Antwort")
- **`confidentiality_level`** (PROJ-100a `ma_confidentiality_level`) — **per-Frage**, damit Clean-Team-Fragen strenger eingestuft werden können als ihr Stream. **Floor (CIA R-1):** Default = **Stream-Stufe erben** (nicht hart `standard`); ein BEFORE-INSERT/UPDATE-Trigger erzwingt `>= dd_streams.confidentiality_level` der Eltern-Zeile (Frage darf anheben, nie unterschreiten — sonst Existenz-Leak des Streams über eine niedriger eingestufte Frage-Zeile). Cross-Row → Trigger statt deklaratives CHECK, analog PROJ-135-`GREATEST`-Re-Stamp.
- **`escalated_finding_id`** — **bewusst NICHT in 113**: die Eskalations-Verknüpfung lebt in PROJ-114 (`dd_findings.source_dd_question_id` FK, downstream-Pattern wie der 112-Backbone-Kontrakt). 113 liefert nur den stabilen `dd_questions.id`-Anker.
- Eindeutigkeit: kein natürlicher Key (Fragen sind frei); PK = id. Field-Level-Audit (PROJ-10) auf title/detail/status/priority/due_date/answer_*/confidentiality_level/responsible.

**Status-Transition** via `transition_dd_question_status`-RPC (SECURITY DEFINER, kein actor-param — PROJ-94-Lektion): vorwärts + 1-Schritt-Revert + Reopen, analog `transition_dd_stream_status`.

### C) Tech-Entscheidungen

- **Anker am Backbone:** `dd_stream_id`-FK (CASCADE) — kein Projekt-nur-Bezug; Fragen sind streamgebunden. Erfüllt den 112-Backbone-Kontrakt.
- **Per-Frage-Confidentiality (Fork-Entscheidung):** eigene `confidentiality_level`-Spalte + 3 RESTRICTIVE-Policies (100a-Rezept) statt Vererbung vom Stream. Grund: Clean-Team-/streng-vertrauliche Einzelfragen in einem sonst `confidential`-Stream (offene Frage der Spec). Advisor-/NDA-Gate (PROJ-99/128) wrappt automatisch. Default `standard`.
- **Antwort am Row, Verlauf via Audit:** kein separates Answers-Thread-Table im MVP; „nachgefragt"-Status + PROJ-10-Historie decken Mehrrunden ab. (Echtes Multi-Turn-Thread = Later.)
- **Owner/Adressat getrennt:** `responsible_user_id` = interner Owner (FK profiles); `addressee` = externe Gegenseite (Freitext, kein User — Target-Vertreter sind keine Plattform-Nutzer).
- **Write-Gate `edit` (nicht manage_members):** Q&A ist operative Tagesarbeit der Stream-Leads/Editoren → `requireProjectAccess(edit)` (lead/editor/admin), nicht das Governance-`manage_members`-Gate von 112. **Confidentiality-Gate auf ALLEN Achsen (CIA R-3):** SELECT **und** INSERT/UPDATE/DELETE laufen durch 3 RESTRICTIVE `can_access_classified`-Policies — das `edit`-Gate ist nur die permissive Achse; ein Editor mit niedriger Clearance kann eine `strict`-Frage weder sehen noch updaten.
- **Status-Maschine als RPC**, konsistent mit dem State-Machine-Pattern.
- **Audit vollständig inkl. `can_read_audit_entry`-Zweig** für `dd_questions` (PROJ-99/112-Lektion).
- **Export = schlankes CSV-Endpoint** (RLS-gefiltert → liefert nur, was der Aufrufer sehen darf, Need-to-know bleibt gewahrt). Volle PROJ-21-Output-Engine-Integration deferred.

### D) Bewusste Scope-Cuts (an Folge-Slices delegiert)

| AC-Bestandteil | Wohin | Begründung |
|---|---|---|
| AC4 Frage → Finding eskalieren (Verknüpfung) | **PROJ-114** | `dd_findings` existiert noch nicht; 114 trägt `source_dd_question_id`-FK + die Eskalations-Aktion (downstream-Pattern). 113 liefert den stabilen `dd_questions.id`-Anker + UI-Platzhalter. |
| AC3 „Anlagen" (echte Datei-Uploads) | **PROJ-79 DMS** | MVP: Datenraum-/Dokument-**Link** (`answer_link`), kein File-Upload (ADR Fork 4). |
| VDR-Q&A-Integration (Datasite/Intralinks/ansarada) | **Could/Later** | Spec-Abgrenzung; Export-Spiegelung statt Live-Integration. |
| Export als gerendertes Dokument (PDF/Branding) | **PROJ-21** | MVP: CSV. |

### E) Abhängigkeiten

- **Muss vorhanden sein (alle live):** PROJ-112 (`dd_streams`), PROJ-94 (`project_type='ma'`), PROJ-100a (Need-to-know-Gate), PROJ-10 (Audit), PROJ-4 (Access-Helper).
- **Forward-compatible (nicht blockierend):** PROJ-114 (Eskalation), PROJ-79 (Datei-Anlagen), PROJ-21 (Export-Rendering).
- **Neue npm-Pakete:** keine.

### F) Architektur-Forks — CIA-Review 2026-06-25 (GO mit ADJUST)

CIA-Verdikt: **GO**; zwei blockierende Auflagen (Fork 1 + 3) vor /backend eingearbeitet, vier leichtgewichtige Klarstellungen.

1. **Per-Frage-Confidentiality → ADJUST (eingearbeitet, blockierend R-1 HOCH).** Per-Frage korrekt (Clean-Team), **aber Floor-Constraint Pflicht**: BEFORE-INSERT/UPDATE-Trigger erzwingt `>= Eltern-Stream-Stufe`, Default = Stream-Stufe erben. Verhindert Need-to-know-Existenz-Leak über eine niedriger eingestufte Frage in einem `strict`-Stream. → /qa-Pentest-AC (Frage-unter-Stream geblockt; Frage-über-Stream erlaubt).
2. **Eskalation→Finding deferral → GO.** Sauber an PROJ-114 (downstream-FK `dd_findings.source_dd_question_id`); 113 liefert nur den stabilen `dd_questions.id`-Anker. UI-Platzhalter „Zu Finding eskalieren" **disabled + Tooltip** (analog 112 `—`-Counts; KEIN FK-loser Stub). → [[PROJ-Y-113c]] an 114.
3. **Write-Gate `edit` → GO (eingearbeitet, R-3).** Korrekt operativ; **RESTRICTIVE Confidentiality-Policies explizit auf INSERT/UPDATE/DELETE** (nicht nur SELECT) — siehe Datenmodell oben.
4. **Antwort am Row → GO/ADJUST (eingearbeitet).** Row-Antwort + Audit-Verlauf MVP; **`answer_round`** mitgeführt + Export/Report-Kontrakt gegen Status-Maschine, nicht „einzige Antwort". Echter Multi-Turn-Thread → [[PROJ-Y-113a]] (bei Pilot-Bedarf).
5. **CSV-Export-RLS → GO.** Export unter User-RLS (Need-to-know gewahrt). **Auflage:** Export-Header/Dateiname kennzeichnet die Sicht-Ebene („nur für Sie sichtbare Fragen, Stand X") gegen Vollständigkeits-Illusion. Export-Audit-Eintrag → [[PROJ-Y-113b]].
6. **Scope/Migration → GO.** 112-F-3-Migrations-Auflagen gelten verbatim (siehe F-3 unten).

### F-2) „Offen"-Aggregat-Kontrakt für PROJ-112-112a / PROJ-116

Damit PROJ-112s `open_questions`-Spalte (heute `null`) und der PROJ-116-DD-Report dieselbe Semantik erben:
- **„offen" = `open` + `in_answering` + `followup`** · **„erledigt" = `answered` + `closed`**.
- Counts werden als Aggregat über `dd_stream_id` berechnet (RLS-gefiltert), eingehängt in 112s `open_questions`-Spalte.

### F-3) Migrations-Pflicht-Auflagen (verbatim aus PROJ-112 F-3)

- **`audit_log_entity_type_check` VOR dem ersten Write um `dd_questions` erweitern** (verbatim-Liste kopieren + `dd_questions`; `dd_streams` etc. **bewahren**). PROJ-100a-H-1-Lektion.
- **`can_read_audit_entry`-Zweig für `dd_questions`** (`when 'dd_questions' then select project_id …`) — die bestehenden Zweige (dd_streams + advisor/nda + ma_project_profiles) **bewahren**, nicht überschreiben. Basis = Live-Definition (`pg_get_functiondef`).
- **PROJ-134:** Migrations-`name` == Repo-Dateiname-Stamm; idempotente DDL (`create table if not exists`).

### G) Handoff

`/backend` (Migration: `dd_questions` + Floor-Trigger + Status-RPC + 3 RESTRICTIVE Confidentiality-Policies + Audit-Wiring; APIs CRUD + Status + CSV-Export; Client-Wrapper; Pflicht-Live-RPC-Smoke + Floor-Probe) → `/frontend` (Q&A-Tab im Stream-Detail + Liste/Filter/Antwort/Status/Export + disabled Eskalations-Platzhalter) → `/qa` (Pentest-Vektoren: Floor-Constraint, Confidentiality-Gate je Frage auf allen Achsen, Status-Maschine, Cross-Tenant, Export-RLS-Vollständigkeit, Audit-Sichtbarkeit).

## Implementation Notes — Backend (2026-06-25)

**Kein neuer Dep.** Migration `20260625124849_proj113_dd_questions.sql` (Repo-Dateiname == prod-registrierte Version, PROJ-134; idempotent) **live in Prod**:

- **`dd_questions`** — `dd_stream_id`-FK (CASCADE) ans 112-Backbone + `project_id`/`tenant_id`, `title`/`detail`/`addressee`/`priority`(low/medium/high)/`due_date`/`responsible_user_id`, 5-Status-CHECK (`open/in_answering/answered/followup/closed`), `answer_text`/`answer_link`/`answered_at`/`answered_by`/`answer_round`, `confidentiality_level`(100a). Indizes inkl. `(dd_stream_id, status)` für die 116/112a-Counts.
- **FLOOR-Trigger** `enforce_dd_question_confidentiality_floor` (BEFORE INSERT/UPDATE, R-1): `confidentiality_level := GREATEST(NEW, Stream-Stufe)` (Default `standard` ⇒ erbt Stream-Stufe; nie darunter) + Tenant/Projekt-Konsistenz mit dem Stream (sonst 23514).
- **RLS:** permissive SELECT=`is_project_member`, INSERT/UPDATE/DELETE=`edit` (`is_tenant_admin OR is_project_lead OR has_project_role(…,'editor')`) **+ 3 RESTRICTIVE `can_access_classified`-Policies auf SELECT+INSERT+UPDATE+DELETE** (R-3). `moddatetime`-`updated_at` + PROJ-10-UPDATE-Audit-Trigger.
- **`transition_dd_question_status`**-RPC (SECURITY DEFINER, kein actor-param): edit-Authority **UND `can_access_classified`-Re-Check** (siehe Live-Smoke-Fund unten) + 5-Status-Maschine (vorwärts + 1-Schritt-Revert + Reopen). revoke public/anon.
- **Audit-Verdrahtung:** `audit_log_entity_type_check` (+`dd_questions`, verbatim aus Live), `_tracked_audit_columns` + `can_read_audit_entry` aus **Live-Definitionen** rekonstruiert + `dd_questions`-Zweig (bewahrt dd_streams/advisor/nda/raci/clearance-Zweige des parallelen Tracks).

**APIs** (mirror dd-streams): `GET/POST /api/projects/[id]/dd-questions` (GET-Filter streamId/status/ownerId), `PATCH/DELETE …/[questionId]` (PATCH stempelt answered_at/by + bumpt `answer_round` bei Re-Antwort), `POST …/[questionId]/status` (RPC, 42501→403 / 23514·22023→400 / P0002→404), `GET …/dd-questions/export` (CSV, RLS-gefiltert, Sicht-Ebene im Dateinamen + `X-Export-Scope`-Header, Formel-Injection-neutralisiert). `answer_link` https-validiert. Client-Wrapper `src/lib/ma-project/dd-questions-api.ts`.

**Pflicht-Live-Smoke gegen Prod (11/11, 0 Residue, transaktional zurückgerollt):** FLOOR (standard-in-confidential → confidential geklemmt; raise-to-strict bleibt), 5-Status-Maschine (valide + illegale 23514), Confidentiality-Gate (uncleared editor sieht/updatet confidential Frage NICHT, cleared editor sieht sie), Audit-Trigger + `can_read_audit_entry`. **Sicherheits-Fund + Fix in-Smoke:** der Status-RPC ist SECURITY DEFINER und umging die RESTRICTIVE-Gate-Policy → ein **uncleared Editor konnte den Status einer confidential Frage blind transitionieren**. Fix: RPC re-checkt `can_access_classified` (admin/cleared passieren, uncleared → 42501); re-verifiziert (blocked + cleared-ok). *(Latente Schwester-Lücke in PROJ-112 `transition_dd_stream_status` notiert → [[PROJ-Y-112c]].)*

**Quality-Gates:** ESLint 0, vitest +17 (route 9 / status 6? — dd-questions 5 / status 6 / export 3, gesamt 17), tsc 0 neue Errors (14 Baseline), `next build` clean (4 neue Routen).

**Offen → /frontend:** Q&A-Tab im DD-Stream-Detail (Liste/Filter/Frage erfassen/Antwort/Status/CSV-Export + disabled „Zu Finding eskalieren"-Platzhalter). → /qa Pentest (Floor, Gate je Achse, Status-RPC-Clearance, Cross-Tenant, Export-RLS, Audit).

## Implementation Notes — Frontend (2026-06-25)

**Kein neuer Dep, shadcn/ui-first.** Reine UI auf den live-APIs + `dd-questions-api.ts`.

- **Einstieg:** in der DD-Übersicht (`due-diligence-streams-page.tsx`) öffnet ein Klick auf das Stream-Label (mit `MessageSquare`-Icon) das Q&A-Sheet — **für alle Projekt-Mitglieder sichtbar** (Lesen); Schreiben/Antworten/Status/Löschen via `useProjectAccess(…, "edit_master")` (= Server-`edit`-Gate: admin/lead/editor).
- **`dd-questions-sheet.tsx`** (`Sheet`): Status-Filter + CSV-Export-Button (download-Link auf `ddQuestionsExportUrl`, cookie-authentifiziert, RLS-gefiltert) + „Frage erfassen". Fragen-Liste mit Titel (klickbar → Detail), Prioritäts-/Vertraulichkeits-Badge, inline Status-`Select` (nur `edit`; erlaubte Folgezustände aus `allowedDdQuestionTransitions`, Mirror der RPC-Maschine), Owner/Adressat/Frist+Restzeit, Löschen. **Create-Dialog** (Titel/Detail/Adressat/Priorität/Frist/Owner/Vertraulichkeit — Hinweis auf Need-to-know-Floor). **Detail-Dialog**: Antwort (Text + https-Datenraum-Link, `edit`-gated), `answer_round`-Hinweis bei Mehrrunden, **disabled „Zu Finding eskalieren"-Platzhalter** (Tooltip „Verfügbar mit DD-Findings (PROJ-114)") — analog 112-`—`-Counts, kein FK-Stub.
- **`dd-question-labels.ts`**: DE-Status-/Prioritäts-Labels, Badge-Varianten, `allowedDdQuestionTransitions`. Reuse `DD_LEVEL_LABEL`/`fmtDate`/`remainingTime` aus `dd-stream-labels`.

**Quality-Gates:** ESLint 0, tsc 0 neue Errors (14 Baseline), `next build` clean. vitest unverändert (Backend-Route-Tests + Live-Smoke decken die kritischen Pfade; reine UI-Slice). Playwright-Auth-Gate-Smoke + Live-Pentest → /qa.

## QA Test Results — 2026-06-26

**Verdikt: PRODUCTION-READY** — 0 Critical / 0 High. DD-Q&A live in Prod, RLS unter echtem `authenticated`-Rollen-Kontext bewiesen.

### Akzeptanzkriterien
| AC | Ergebnis | Nachweis |
|---|---|---|
| AC1 Fragen je Stream (Titel/Detail/Frist/Priorität/Adressat) | ✅ | POST + Create-Dialog; Pentest-Seed |
| AC2 5-Status (offen/in Beantwortung/beantwortet/nachgefragt/geschlossen) | ✅ | `transition_dd_question_status`-RPC + inline-Select; Pentest valide/illegal(23514) |
| AC3 Antwort inkl. Anlagen/Verlinkungen | ✅ | `answer_text` + https-validierter `answer_link` + `answer_round`; **Datei-Upload → PROJ-79 (Link-MVP)** |
| AC4 Frage → Finding eskalieren | ⏳ **deferred PROJ-114** | downstream-FK `dd_findings.source_dd_question_id`; UI-Platzhalter disabled+Tooltip (ADR-konform) |
| AC5 Filter (Stream/Status/Frist/Owner) + Export | ✅ | GET-Filter + CSV-Export (RLS-gefiltert, Sicht-Ebene im Dateinamen + `X-Export-Scope`) |
| AC6 Need-to-know-Sichtbarkeit (L2) | ✅ | per-Frage Confidentiality + FLOOR + RESTRICTIVE-Gate (Pentest, s.u.) |

### Security / Red-Team — Live-RLS-Pentest (`tests/sql/PROJ-113-dd-questions-pentest.sql`, 13/13, echtes `authenticated`-Rollen, 0 Residue)
| Vektor | Ergebnis |
|---|---|
| FLOOR: `standard`-Frage in `confidential`-Stream → auf `confidential` geklemmt; explizit `strict` bleibt | ✅ |
| Gate SELECT: uncleared Editor sieht confidential Frage nicht | ✅ |
| Gate INSERT: uncleared Editor kann nicht in confidential Stream einfügen (42501) | ✅ |
| Gate UPDATE/DELETE: uncleared Editor 0 rows | ✅ |
| Status-RPC: uncleared Editor blockiert (42501) — RPC re-checkt `can_access_classified` | ✅ |
| Cleared Editor: sieht + transitioniert | ✅ |
| Cross-Tenant: T2-Admin sieht 0 T1-Fragen | ✅ |
| Export-RLS-Vollständigkeit: uncleared sichtbare Menge (= Export-Inhalt) = 0 | ✅ |
| Audit: Trigger feuert + `can_read_audit_entry` admin=true | ✅ |

Ergänzend: **Backend-Live-RPC-Smoke 11/11** (fand+fixte die Status-RPC-Clearance-Lücke). **PROJ-Y-112c-Fix** (Schwester-Lücke in `transition_dd_stream_status`) live-verifiziert. **Supabase-Security-Advisor: 0 ERROR** (56 WARN = Projekt-Baseline; `transition_dd_question_status` mit explizitem `search_path` in derselben Klasse wie alle Core-RPCs).

### Tests
- **Playwright** `tests/PROJ-113-dd-questions.spec.ts` **6/6 chromium** — Auth-Gates auf alle 6 API-Routen (CRUD + Status + Export).
- **vitest 2080/2080** (inkl. 17 neue: dd-questions 5 / status 6 / export 3 + …); keine Regression.
- ESLint 0, tsc 0 neue Errors (14 Baseline), `next build` clean (4 neue Routen).

### Findings (alle Low/Info, nicht-blockierend)
- **F-1 (Low, in-QA gefixt):** Floor-Trigger-Funktion `enforce_dd_question_confidentiality_floor` behielt `anon`/`authenticated` EXECUTE (Supabase-Default-Privileges; `revoke from public` allein reicht nicht) → auf `revoke from public, anon, authenticated` gehärtet (Posture wie `record_audit_changes`). Nicht ausnutzbar (Trigger-Funktion, Direktaufruf erroriert), aber Hardening-konform. Migration-Datei nachgezogen.
- **F-2 (in-/backend gefixt, dokumentiert):** Status-RPC-Clearance-Lücke (uncleared Editor) — Fix `can_access_classified`-Re-Check.
- **D-1 (Env):** Mobile-Safari/WebKit-E2E übersprungen (Host-Libs fehlen), wie PROJ-67/88/112/135. Chromium grün.
- **Info:** `answer_round`-Bump nutzt einen Read-then-Write im PATCH (nicht atomar) — bei gleichzeitigen Re-Antworten theoretisch eine verpasste Runde; reines UX-Feld, kein Sicherheits-/Datenintegritätsrisiko.

### Followups (PROJ-Y, nicht-blockierend)
- **PROJ-Y-113a:** echtes Multi-Turn-`dd_question_answers`-Thread (bei Pilot-Bedarf).
- **PROJ-Y-113b:** Export-Audit-Eintrag.
- **PROJ-Y-113c (an PROJ-114):** Eskalations-Aktion + `source_dd_question_id`-FK.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
