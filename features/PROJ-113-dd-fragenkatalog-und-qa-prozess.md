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

## Status: Architected (Tech-Design 2026-06-25 — `dd_questions` auf dem PROJ-112 DD-Backbone; per-Frage Confidentiality + Status-RPC + Audit + CSV-Export; Eskalation→Finding forward-compatible an PROJ-114. → CIA → /backend)
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

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
