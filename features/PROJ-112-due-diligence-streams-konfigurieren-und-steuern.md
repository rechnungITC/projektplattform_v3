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

## Status: Architected (Tech-Design 2026-06-24, CIA GO mit ADJUST eingearbeitet — DD-Backbone: `dd_streams` + `dd_stream_templates`, Confidentiality-Rezept, Status-RPC, voll-verdrahtetes Audit; standalone, keine Abhängigkeit auf ungebaute 95/102/104/110/113/114. → /backend)
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

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · G — Due Diligence_
