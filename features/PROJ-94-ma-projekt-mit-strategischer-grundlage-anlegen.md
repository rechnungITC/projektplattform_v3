---
id: PROJ-94
title: "M&A-Projekt mit strategischer Grundlage anlegen"
issue_type: Story
epic_code: A
epic_title: "Projektgrundlagen & Phasenmodell"
priority: Highest
priority_source: "Must (MVP – ohne diese Story funktioniert keine weitere)"
labels: ["ma-platform", "epic-a", "mvp"]
dependencies: ["B1", "B4", "L3"]
roles: ["Deal Lead (Corporate Development)", "Executive Sponsor / Geschäftsführung", "PMO-Lead", "Legal Counsel (lesend)", "IT-Administration (technisch)"]
summary_for_jira: "[A1] M&A-Projekt mit strategischer Grundlage anlegen"
---

# PROJ-94: M&A-Projekt mit strategischer Grundlage anlegen

## Status: In Progress (backend + frontend built 2026-06-22; QA pending)
**Created:** 2026-06-10
**Origin:** M&A-Platform Backlog (Epic A — Projektgrundlagen & Phasenmodell)
**Priority:** P1

> **V3 Core Reuse (CIA 2026-06-15 · [ma-domain-architecture ADR](../docs/decisions/ma-domain-architecture.md) · [Sequencing](../docs/ma-epic-sequencing-2026-06-15.md)):** Klasse **REUSE** · Andockpunkt: PROJ-2 CRUD + PROJ-5 Wizard + PROJ-6 `project_type='m&a'`. Nicht neu bauen, was der Core schon hat — diese Spec MUSS die ADR + Reuse-Matrix respektieren.

> **Epic:** A — Projektgrundlagen & Phasenmodell  
> **Priorität (Jira):** Highest · **Quell-Priorität:** Must (MVP – ohne diese Story funktioniert keine weitere)  
> **Labels:** `ma-platform` · `epic-a` · `mvp`  
> **Abhängigkeiten:** `B1`, `B4`, `L3`

**User Story:**

Als Deal Lead möchte ich ein neues M&A-Projekt mit den strategischen Grunddaten (Deal-Rationale, Zielbild, Suchprofil, Investitionsrahmen) anlegen können, damit alle Beteiligten von Anfang an dieselbe verbindliche Projektgrundlage verwenden.

**Beschreibung / Kontext:**

Phase 1 des M&A-Modells verlangt eine eindeutige strategische Ausgangslage. Die Plattform muss ein Projekt als Container für alle nachfolgenden Phasen bereitstellen und die kritischen Eckdaten (Mandat, Suchkriterien, Ausschlusskriterien, Investitionsrahmen, Governance-Modell) strukturiert hinterlegen.

**Akzeptanzkriterien:**

- [ ] Ein neues M&A-Projekt kann mit Pflichtfeldern Projektname, Sponsor, Deal Lead, Zielsetzung und Mandatsstand angelegt werden.
- [ ] Strategische Grunddaten können als strukturierte Felder UND als verlinkbares Dokument hinterlegt werden (Deal-Rationale, Suchprofil, Ausschlusskriterien, Investitionsrahmen).
- [ ] Das Projekt erhält eine eindeutige Projekt-ID, die in allen Folgeartefakten referenziert wird.
- [ ] Der Status 'Mandat freigegeben' kann gesetzt werden und schaltet Phase 2 ('Target-Screening') frei.
- [ ] Eine Änderungshistorie der strategischen Grunddaten wird automatisch geführt (Wer, Wann, Was).

**Abgrenzungen (Out of Scope):**

- Inhaltliche Bewertung der Deal-Rationale ist nicht Aufgabe der Plattform – sie speichert und versioniert nur.
- Erstellung eines vollständigen Business Case ist nicht Teil dieser Story (separate Story I1).
- Anbindung an ein externes Strategie-Tool (z. B. OKR-Tool) ist nicht in Scope.

**Offene Fragen:**

- Soll die Plattform mehrere Projektarten unterscheiden (Buy-Side, Sell-Side, Joint Venture)?
- Welche Pflichtfelder fordert die interne Governance verbindlich (z. B. durch Compliance)?
- Müssen Projektnummern aus einem ERP/Controlling-System übernommen werden?

**Definition of Ready:**

- [ ] Pflichtfelder sind mit Stakeholdern (M&A, Legal, Finance, Compliance) abgestimmt.
- [ ] Berechtigungskonzept liegt vor (siehe B4).
- [ ] Datenfeldlängen, Validierungen und Statuswerte sind dokumentiert.
- [ ] UI/UX-Designvorgaben liegen vor.

**Definition of Done:**

- [ ] Funktion ist in Test- und Produktivumgebung verfügbar.
- [ ] Automatisierte Tests decken Anlage, Bearbeitung, Pflichtfeldvalidierung und Statuswechsel ab.
- [ ] Audit-Trail für alle Änderungen funktioniert nachweislich.
- [ ] Anwenderdokumentation ist erstellt.
- [ ] Datenschutz- und IT-Sicherheits-Freigabe liegt vor.

**Abhängigkeiten:**

- B1 – Rollen und Verantwortlichkeiten
- B4 – Berechtigungskonzept
- L3 – Audit-Trail (übergreifend)

**Betroffene Rollen:**

- Deal Lead (Corporate Development)
- Executive Sponsor / Geschäftsführung
- PMO-Lead
- Legal Counsel (lesend)
- IT-Administration (technisch)

---

## Tech Design (Solution Architect) — 2026-06-19

> **ADR-Bindung:** Folgt [`ma-domain-architecture.md`](../docs/decisions/ma-domain-architecture.md) Fork 1 (M&A = ein `project_type`, kein Modul), Fork 2 (Need-to-Know als RLS-Sublayer) und dem Extension-Prinzip („M&A-Objekte sind Extensions, nie Ersatz des Core"). Reuse-Klasse **REUSE** (PROJ-2 CRUD + PROJ-5 Wizard + PROJ-6 Katalog). Kein neuer CIA-Pass nötig — diese Spec implementiert die bereits gelockte Domänen-ADR.

### Grundidee in einem Satz

M&A wird ein neuer `project_type='m&a'` im bestehenden Projekttyp-Katalog; die strategische Grundlage (Deal-Rationale, Suchprofil, Ausschlusskriterien, Investitionsrahmen, Mandatsstand) lebt in **einer schlanken 1:1-Erweiterungstabelle neben `projects`** — mit feldgenauer Audit-Historie (PROJ-10) und Need-to-Know-Schutz (PROJ-100a) — angelegt über den vorhandenen Wizard. Phasenmodell, Rollen-RACI und DD sind ausdrücklich **nicht** Teil dieser Story (PROJ-95 / PROJ-97 / PROJ-112ff).

### Gelockte Entscheidungen (User 2026-06-19)

1. **Deal-Variante** → **ein** `project_type='m&a'` + strukturiertes Feld `deal_side` (`buy` / `sell` / `jv` / `carve_out`). Keine separaten Typen. Varianten steuern später (PROJ-95) unterschiedliche Phasen-Presets.
2. **Strategische Grunddaten** → **dedizierte Erweiterungstabelle** (1:1 zu `projects`), nicht das `type_specific_data`-JSONB. Begründung: AC-5 verlangt feldgenaue Änderungshistorie (Wer/Wann/**Was**), die der PROJ-10-Audit nur auf echten Spalten liefert; folgt dem ADR-Extension-Pattern; setzt das Muster für die späteren DD-/Bewertungs-Extensions.
3. **Projektnummer** → bestehendes `projects.project_number`, manuelles Freitextfeld. ERP-/Controlling-Übernahme ist **Later** (PROJ-14-Connector).

### A) Komponenten-Struktur (was die UI bekommt)

Der bestehende Projekt-Anlage-Wizard (PROJ-5) wird **erweitert**, nicht ersetzt:

```
Projekt-Anlage-Wizard (bestehend, PROJ-5)
+-- Step "Basics"        (bestehend — Name, Beschreibung=Zielsetzung, Projektnummer, Termine, Deal Lead)
+-- Step "Typ"           (bestehend — neuer Eintrag „M&A-Projekt" erscheint in der Typ-Auswahl)
+-- Step "Methode"       (bestehend — M&A nutzt vorerst eine Methode aus dem Katalog; Phasen-Preset = PROJ-95)
+-- Step "M&A-Grundlage" (NEU, nur sichtbar wenn Typ = M&A — analog zum konditionalen KI-Backlog-Step)
|   +-- Deal-Variante (buy/sell/jv/carve-out)
|   +-- Sponsor (Auswahl aus Tenant-Mitgliedern)         [Pflicht]
|   +-- Mandatsstand (Entwurf / eingereicht / freigegeben) [Default: Entwurf]
|   +-- Deal-Rationale (mehrzeilig)
|   +-- Suchprofil (mehrzeilig)
|   +-- Ausschlusskriterien (mehrzeilig)
|   +-- Investitionsrahmen (Betrag/Währung + Notiz)
|   +-- Verlinktes Strategie-Dokument (URL)              [optional]
|   +-- Vertraulichkeitsstufe (standard/confidential/strict)
+-- Step "Review"        (bestehend — zeigt M&A-Grunddaten in der Zusammenfassung)

Projekt-Raum (bestehend) — nach Anlage:
+-- Reiter/Karte "Strategische Grundlage"  (NEU — zeigt + editiert die M&A-Profil-Felder)
|   +-- Button „Mandat freigeben"          (setzt Mandatsstand → freigegeben; auditiert)
|   +-- Änderungshistorie-Ansicht          (bestehend, PROJ-10 — pro Feld)
```

> **Mandats-Gate (AC-4):** Diese Story liefert **nur** das setzbare, auditierte Feld `mandate_status='approved'`. Das tatsächliche „Phase 2 (Target-Screening) freischalten" konsumiert dieses Flag in **PROJ-95** (Phasenmodell). PROJ-94 stellt den Schalter bereit, PROJ-95 reagiert darauf.

### B) Datenmodell (Klartext, kein Code)

**Bestehende `projects`-Tabelle** — minimale Erweiterung:
- `project_type` bekommt den zusätzlichen erlaubten Wert `m&a` (Erweiterung der CHECK-Liste).
- Sonst **keine** neuen Spalten. Zielsetzung = bestehendes `description` (zugleich KI-Grounding-Feld aus PROJ-91), Deal Lead = bestehendes `responsible_user_id`, Projektnummer = bestehendes `project_number`, Vertraulichkeit auf Projektebene = bestehendes `confidentiality_level` (PROJ-100a).

**Neue Erweiterungstabelle „M&A-Projektprofil"** (genau eine Zeile pro M&A-Projekt):
```
Jedes M&A-Projektprofil hat:
- Verweis auf das Projekt (1:1)            — Pflicht, eindeutig
- Mandant (tenant_id)                       — Pflicht  (Multi-Tenant-Invariante)
- Deal-Variante: buy | sell | jv | carve_out
- Sponsor (Verweis auf Tenant-Mitglied)     — Pflicht
- Mandatsstand: draft | submitted | approved — Default draft
- Deal-Rationale            (Text)
- Suchprofil                (Text)
- Ausschlusskriterien       (Text)
- Investitionsrahmen        (Betrag + Währung + Freitext-Notiz)
- Strategie-Dokument-Link   (URL, optional)
- Vertraulichkeitsstufe     (standard | confidential | strict)  — Need-to-Know (PROJ-100a)
- Wer/Wann angelegt + zuletzt geändert
```

**Mandatsstand-Statusmaschine** (analog der bestehenden Lifecycle-RPC, kein direktes UPDATE):
```
draft     → submitted, approved
submitted → approved, draft (Rückgabe zur Überarbeitung)
approved  → (terminal für MVP; Rücknahme = Later)
```
Gesetzt über eine SECURITY-DEFINER-RPC (Muster wie `transition_project_status`); berechtigt sind Deal Lead, Sponsor oder Tenant-Admin; jeder Übergang schreibt einen Audit-Eintrag.

**Schutz & Historie der neuen Tabelle** (Wiederverwendung bestehender Rezepte):
- **Tenant-Isolation:** Standard-RLS über `is_tenant_member` / `has_tenant_role` (Pflicht-Invariante).
- **Need-to-Know:** zusätzliche RESTRICTIVE Policy über `can_access_classified(project_id, confidentiality_level)` — exakt das PROJ-100a-Rezept; das M&A-Profil ist die **erste neue Tabelle**, die den Sublayer übernimmt.
- **Audit (AC-5):** die strategischen Spalten kommen in die `_tracked_audit_columns()`-Whitelist → feldgenaue Wer/Wann/Was-Historie über den bestehenden PROJ-10-Trigger; in der UI über die vorhandene Historien-Ansicht sichtbar.

**Class-3-Abgrenzung (ADR Fork 3):** Diese Felder sind *Deal-Strategie*, in der Regel **nicht** Class-3 (keine personenbezogenen Target-Daten). Class-3 (PII → externe Modelle geblockt) und M&A-Confidentiality (Need-to-Know) bleiben getrennte Achsen. KI-Vorschläge auf diesen Feldern sind nicht Teil dieser Story.

### C) Tech-Entscheidungen (Begründung)

- **Warum Erweiterungstabelle statt JSONB?** AC-5 + DoD („Audit-Trail nachweislich") verlangen feldgenaue Historie; der PROJ-10-Trigger arbeitet spaltenbasiert. JSONB liefert nur grobe Blob-Diffs. Zusätzlich braucht das Profil eine eigene Vertraulichkeitsstufe und folgt damit sauber dem ADR-Extension-Prinzip — das setzt zugleich die Vorlage für DD-Streams/Findings (PROJ-112ff).
- **Warum ein `project_type` + `deal_side`-Feld statt vier Typen?** ADR Fork 1; vermeidet 4-fachen Katalog- und Method-Pflegeaufwand; Buy/Sell/JV-Unterschiede sind Phasen-Preset-Sache (PROJ-95), keine Typ-Sache.
- **Warum den bestehenden Wizard erweitern?** PROJ-5 hat bereits konditionale Steps (KI-Backlog) und einen typ-/methodengetriebenen Followups-Mechanismus. Ein zusätzlicher, nur bei M&A sichtbarer Step fügt sich nahtlos ein; Finalize legt in derselben Transaktion Projekt **und** Profilzeile an (SECURITY-DEFINER-RPC für Atomarität + RLS).
- **Warum Mandatsstand als eigenes Feld statt Lifecycle-Status?** Der Lifecycle (draft/active/…) bleibt universell und orthogonal; Mandatsfreigabe ist ein **fachliches Governance-Ereignis** der M&A-Domäne, das Phase 2 öffnet — es gehört ins M&A-Profil, nicht in den generischen Projekt-Lifecycle.
- **Scope-Disziplin:** Rollen/RACI über reine Sponsor-/Deal-Lead-Felder hinaus = PROJ-97. 10-Phasen-Modell = PROJ-95. DD = PROJ-112ff. Strategie-Dokument als echter DMS-Upload statt URL = Later (PROJ-79). Diese Story bleibt bewusst die schmale „Container + Grundlage"-Wurzel.

### D) Abhängigkeiten (neue Pakete)

**Keine.** Alles über bestehenden Stack (Supabase RLS/RPC, Next.js API-Routes, shadcn/ui-Formularprimitive, react-hook-form + Zod). Eine neue Migration (Erweiterungstabelle + RLS-Policies + Audit-Whitelist-Eintrag + `project_type`-CHECK-Erweiterung + Mandats-RPC).

### E) Abnahme-Mapping (welche AC welcher Baustein erfüllt)

| AC | Erfüllt durch |
|---|---|
| Pflichtfelder Name/Sponsor/Deal-Lead/Zielsetzung/Mandatsstand | Wizard-Step „M&A-Grundlage" + projects(name, responsible_user_id, description) + Profil(sponsor, mandate_status); Pflichtvalidierung in Wizard + API |
| Strukturierte Felder UND verlinkbares Dokument | Profil-Spalten (Rationale/Suchprofil/Ausschluss/Investitionsrahmen) + `strategic_document_link` (URL); DMS-Upload = Later |
| Eindeutige Projekt-ID, in Folgeartefakten referenziert | bestehendes `projects.id` (UUID) — bereits Fremdschlüssel aller Folge-Tabellen |
| Mandat freigegeben → schaltet Phase 2 frei | `mandate_status='approved'` via auditierter RPC (PROJ-94); Konsum durch PROJ-95 |
| Automatische Änderungshistorie der Grunddaten | PROJ-10 Audit-Trigger über `_tracked_audit_columns()` auf den Profil-Spalten |

### Offene Fragen aus der Spec — beantwortet

- *Buy/Sell/JV unterscheiden?* → Ja, aber als `deal_side`-Feld auf einem Typ (siehe Entscheidung 1).
- *Verbindliche Governance-Pflichtfelder?* → MVP-Pflicht = Name, Sponsor, Deal Lead, Zielsetzung, Mandatsstand (aus AC-1); weitere optional und über `tenant_project_type_overrides` (PROJ-16) tenant-spezifisch erweiterbar.
- *Projektnummer aus ERP?* → Nein im MVP, manuelles Freitextfeld (siehe Entscheidung 3).

---

## Implementation Notes — Backend (2026-06-22)

**Branch:** `proj-94/backend` · **Migration:** `20260619143423_proj94_ma_project_profile.sql` (in Prod-DB; Repo-Dateiname = prod-registrierte Version, PROJ-134-Drift behoben).

**Gebaut:**
- `project_type='ma'` registriert: CHECK-Constraints auf `projects` + `project_wizard_drafts` erweitert; Code-Katalog (`src/lib/project-types/catalog.ts` MA_PROFILE: Deal-Lead/Sponsor/PMO/Legal-Rollen), `ProjectType`-Union + `PROJECT_TYPES` + Labels (`src/types/project.ts`). **Slug = `ma`** (nicht `m&a`): URL-safe für `/api/project-types/[type]/rules`; Anzeige-Label „M&A-Projekt". Honoriert ADR Fork 1 (M&A = EIN Typ).
- Extension-Tabelle `ma_project_profiles` (1:1 zu projects via UNIQUE(project_id) + ON DELETE CASCADE): `deal_side` (buy/sell/jv/carve_out), `sponsor_user_id`, `mandate_status` (draft/submitted/approved), `deal_rationale/search_profile/exclusion_criteria`, `investment_frame_{amount,currency,note}`, `strategic_document_link` (URL), `confidentiality_level`. Längen-Caps als Defense-in-depth.
- RLS: Tenant-Permissive (SELECT=member, UPDATE/DELETE=admin|lead, KEIN INSERT-Policy → Creation nur via RPC) + RESTRICTIVE Need-to-Know-Gate (PROJ-100a-Rezept, `can_access_classified`). **Erste neue Tabelle, die das 100a-Rezept übernimmt.**
- Audit (AC-5): `ma_project_profiles` + Strategie-Spalten in `_tracked_audit_columns()`; AFTER-UPDATE `record_audit_changes`-Trigger; `audit_log_entity_type_check` + `can_read_audit_entry` um `ma_project_profiles` erweitert (sonst hätte jeder UPDATE am entity_type-CHECK abgebrochen — PROJ-100a-H-1-Lehre antizipiert).
- RPCs: `create_ma_project_profile` (SECURITY DEFINER, idempotent on project_id, Caller-/Sponsor-Tenant-Check) + `transition_mandate_status` (AC-4 State-Machine draft→submitted→approved terminal; Autorität admin|lead|sponsor|deal-lead; UPDATE feuert Audit-Trigger). **Beide ohne `p_actor_user_id`** — Caller ist immer `auth.uid()`; Routen laufen im User-Context.
- Wizard: konditionaler Step `ma_foundation` (nur `project_type==='ma'`, analog `ki_backlog`); `visibleWizardSteps(kiEnabled, projectType)`; `MaFoundationData`-Block im Draft-JSON-Payload (kein Draft-Schema-Change). Finalize-Route legt nach Projekt-Insert das Profil via RPC an + erzwingt Sponsor + Zielsetzung als M&A-Pflicht.
- API: `GET/PATCH /api/projects/[id]/ma-profile` (PATCH = Strategie-Felder, RLS+Need-to-Know-gated) + `POST /api/projects/[id]/ma-profile/mandate` (Mandats-Transition).
- Neue Typen: `src/types/ma-project.ts` (DealSide/MandateStatus/MaProjectProfile/MaFoundationData) + `src/types/confidentiality.ts` (MaConfidentialityLevel — PROJ-100a nachgereicht).

**Live-RPC-Smoke (Pflicht) gegen Prod — 2 Runden, fand + fixte 3 echte Bugs:**
1. Create-Clearance-Check war Henne-Ei (nicht-Admin könnte nie `confidential` anlegen) → entfernt (PROJ-100a-Philosophie: INSERT ungated, Re-Klassifizierung via UPDATE-Policy).
2. `project_memberships.project_role` existiert nicht → `role` (Spalten-Fix).
3. **SECURITY: `p_actor_user_id` + anon-executable = Impersonation-Vektor** (Advisor-Fund) → Param entfernt + `revoke … from public, anon`. Advisor-Re-Check: meine 2 RPCs aus der anon-Liste raus, nur noch authenticated.

Smoke-Endstand (rollback, 0 Residuen): Profil-Create via auth.uid(), draft→submitted→approved, **2 mandate_status-Audit-Feldzeilen** (AC-5), Terminal-Guard, anon-Abweisung, Cross-Tenant-Sponsor- + Outsider-Reject.

**Quality-Gates:** vitest 1909/1909 (231 Files; +26 neue Tests: ma-profile 8, mandate 6, wizard +3, catalog +1, sonstige Anpassungen); lint 0; tsc 14 Baseline-Fehler (alle Vorbestand in Testdateien, 0 neu); build clean.

### Security Hardening — 2026-06-22 (`fix/proj94-ma-security`)

Behebt drei Review-Findings aus dem Backend-Slice:

1. `transition_mandate_status` läuft weiter als SECURITY DEFINER, spiegelt jetzt aber vor dem UPDATE explizit die Need-to-Know-Gate-Policy über `can_access_classified(project_id, confidentiality_level)`. Damit können Sponsor/Deal-Lead/Lead/Admin `mandate_status` nicht mehr an der Tabellen-RLS vorbei ändern, wenn ihnen die Clearance für das Profil-Level fehlt.
2. `POST /api/projects/[id]/ma-profile/mandate` prüft nur noch Projektsichtbarkeit (`requireProjectAccess(..., "view")`). Die finale Autorisierung für Tenant-Admin, Project-Lead, Sponsor oder Deal-Lead liegt beim RPC; Sponsor/Deal-Lead werden nicht mehr durch die Route vorab blockiert.
3. `PATCH /api/projects/[id]/ma-profile` nutzt einen lokalen Governance-Check, der zur DB-Policy passt: nur Tenant-Admin oder Project-Lead. Project-Editoren erhalten vor dem UPDATE einen sauberen 403 statt eines widersprüchlichen API-/RLS-Vertrags.

Validierung im Fix-Worktree: GitNexus `impact` für beide Route-Symbole = LOW (jeweils nur direkte Route-Testdatei, 0 Prozesse); `detect-changes` = LOW, 5 Dateien, 0 betroffene Prozesse; `npm run test -- 'src/app/api/projects/[id]/ma-profile/route.test.ts' 'src/app/api/projects/[id]/ma-profile/mandate/route.test.ts'` grün (16/16); `npm run lint` grün; `npm run audit:prod` grün.

**Vorbestand-Followup (nicht PROJ-94-Scope):** 3 PROJ-100a-RPCs (`can_access_classified`/`grant`/`revoke_confidentiality_clearance`) sind weiterhin anon-executable (fail-closed/Hygiene). Kandidat für PROJ-100b-Hardening (`revoke … from anon`).

**Offen → /frontend:** Step-UI „M&A-Grundlage" (Felder + Sponsor-Picker + Vertraulichkeit), Projekt-Raum-Karte „Strategische Grundlage" (+ „Mandat freigeben"-Button + PROJ-10-Historien-Ansicht). Danach /qa.

## Implementation Notes — Frontend (2026-06-22)

**Branch:** `proj-94/backend` (frontend on same branch). Kein neues Dep, keine Migration.

**Gebaut:**
- **Wizard-Step „M&A-Grundlage"** (`step-ma-foundation.tsx`) — konditional nur bei `project_type==='ma'` (analog `ki_backlog`): Deal-Variante (Select), Vertraulichkeit (Select), Sponsor (reuse `ResponsibleUserPicker`), Deal-Rationale/Suchprofil/Ausschlusskriterien (Textareas), Investitionsrahmen (Betrag+Währung+Notiz), Strategie-Doku-Link. Verdrahtet in `wizard-client.tsx` (Render-Branch + `validateStep`-Case: Sponsor + Zielsetzung Pflicht, spiegelt Finalize-Server-Check).
- **Projekt-Raum-Karte „Strategische Grundlage"** (`ma-foundation-card.tsx`) — Tabs „Grundlage"/„Historie":
  - View + Inline-Edit (gated via `useProjectAccess(projectId, "edit_master")`), PATCH über `updateMaProfile`, Toast + Refresh; Draft beim „Bearbeiten"-Klick frisch geseedet (kein set-state-in-effect, React-Compiler-konform).
  - **Mandats-Aktionen (AC-4):** `MandateActions` rendert die erlaubten Übergänge aus `ALLOWED_MANDATE_TRANSITIONS` („Einreichen"/„Mandat freigeben"/„Zurück zu Entwurf") → `transitionMandate`-RPC-Route, Editor-gated.
  - **PROJ-10-Historie:** reuse `HistoryTab` mit `entityType="ma_project_profiles"` + `formatValue` (Sponsor→Name, deal_side/mandate_status→Label). `AuditEntityType` um `ma_project_profiles` erweitert (Union + Array + Label).
- **Daten-Layer:** `useMaProfile`-Hook (use-project-Shape, `notFound` für Nicht-M&A) + `src/lib/ma-project/api.ts` (fetch/update/transition-Wrapper, safeError-Muster).
- **Navigation (type-gated):** neuer optionaler `requiresProjectType` auf `SidebarSection` + `filterSectionsByProjectType` (routing.ts). Die M&A-Sektion wird **zentral einmal** in `getMethodConfig` in ALLE Method-Configs nach „Übersicht" injiziert (statt 8 Templates zu duplizieren) und in beiden Renderern (`project-sidebar` + `project-room-shell`) per `project_type` gefiltert → erscheint method-unabhängig nur für M&A. Routing-Helper (`getMethodSlug`/`parseSectionFromPathname`) lösen den Slug `strategische-grundlage` in jeder Methode auf.
- **Route:** `src/app/(app)/projects/[id]/strategische-grundlage/page.tsx`.

**Quality-Gates:** vitest 1915/1915 (+ neue routing-Tests für `filterSectionsByProjectType` + Section-Injektion); lint 0; tsc 0 neu (Baseline-Testfehler unverändert); build clean — 3 neue Routen kompiliert (`/projects/[id]/strategische-grundlage` + 2 API).

**Offen → /qa:** Playwright-Smoke (Wizard-M&A-Pfad bis Finalize + Karte-Edit + Mandat-Transition + Need-to-Know-Sichtbarkeit), AC-End-to-End gegen die ACs, Security-Review der neuen Routen.

---
_Quelle: Backlog-Entwurf M&A-Projektplattform · A — Projektgrundlagen & Phasenmodell_
