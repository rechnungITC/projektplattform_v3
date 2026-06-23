---
id: PROJ-100b
title: "Berechtigungsprofile & Wer-darf-was-Sichtbarkeit (Need-to-know)"
issue_type: Story
epic_code: B
epic_title: "Rollen, Gremien & Governance"
priority: High
priority_source: "Should (MVP-nah — Komfort- und Transparenzschicht auf dem 100a-Tor)"
labels: ["ma-platform", "epic-b", "mvp"]
dependencies: ["PROJ-100a", "PROJ-10", "PROJ-1"]
summary_for_jira: "[B5b] Berechtigungsprofile + Wer-darf-was-Übersicht + anon-RPC-Hygiene"
---

# PROJ-100b: Berechtigungsprofile & Wer-darf-was-Sichtbarkeit

## Status: Deployed (2026-06-24 — frontend PR #178 squash-merged 3d7a4ea, backend via #174; tag v1.99.0-PROJ-100b; 2 Migrations in Prod; prod auth-gate smoke 5/5 307)
**Created:** 2026-06-23
**Last Updated:** 2026-06-24

> **Herkunft:** Folge-Slice von [PROJ-100](PROJ-100-berechtigungskonzept-nach-need-to-know-umsetzen.md). 100a (Vertraulichkeits-RLS-Sublayer + `can_access_classified`-Tor + `grant_/revoke_confidentiality_clearance`-RPCs + `clearances`-API + Pentest) ist **deployed**. Dieser Slice deckt die in 100a bewusst zurückgestellten ACs **AC2 (Profile)** und **AC4 (Wer-darf-was-View)** ab plus einen Security-Hygiene-Befund aus dem 100a-QA. **AC5 (4-Augen-Workflow) ist NICHT Teil dieses Slices → PROJ-100c.**

> **V3 Core Reuse:** Klasse **EXTEND** auf 100a — baut ausschließlich auf der bestehenden `ma_confidentiality_clearances`-Tabelle, dem `can_access_classified`-Tor und den vorhandenen grant/revoke-RPCs auf. KEIN neues Berechtigungssystem, KEIN Ersatz des Tenant- oder Vertraulichkeits-Tors. Audit via PROJ-10. ADR-Bindung: [ma-domain-architecture.md](../docs/decisions/ma-domain-architecture.md) Fork 2 (Need-to-Know als RLS-Sublayer) bleibt unverändert.

## Dependencies
- **Requires:** PROJ-100a (Vertraulichkeits-Tor + `ma_confidentiality_clearances` + grant/revoke-RPCs) — die Profile vergeben Freischaltungen über den bestehenden grant-Pfad; die View liest die bestehenden Freischaltungen.
- **Requires:** PROJ-10 (Audit-Trail) — jede Profil-Anwendung/-Änderung wird wie jede Freischaltung auditiert.
- **Requires:** PROJ-1 (Tenant/Rollen-RBAC) — Profile sind tenant-scoped; Verwaltung ist tenant-admin/manager-gated.
- **Nachfolger:** PROJ-100c (AC5 — optionales 4-Augen-Prinzip für besonders sensible Freischaltungen).

## User Stories
- Als **PMO-Lead** möchte ich Freischaltungen über **vorgefertigte Profile** (z. B. „SteerCo lesend", „DD-Stream Legal voll", „externer Berater Tax") vergeben, damit ich nicht bei jedem Nutzer die richtige Vertraulichkeitsstufe manuell zusammensuchen muss und Freischaltungen konsistent bleiben.
- Als **Tenant-Admin** möchte ich die verfügbaren Berechtigungsprofile pflegen (anlegen, umbenennen, deaktivieren), damit der Profilkatalog zur Governance meines Mandanten passt.
- Als **IT-Sicherheitsverantwortlicher** möchte ich pro Objekt (Projekt/Phase/Work-Item) eine **„Wer darf das sehen?"-Übersicht** einsehen, damit ich Need-to-know nachweisen und Über-Freischaltungen erkennen kann.
- Als **Deal Lead** möchte ich beim Anwenden eines Profils sehen, welche Stufe es vergibt, damit ich vor der Vergabe verstehe, was ich freischalte.
- Als **IT-Sicherheitsverantwortlicher** möchte ich, dass die Need-to-know-RPCs nicht von nicht-authentifizierten Aufrufern ausführbar sind, damit das Tor auch bei Fehlkonfiguration fail-closed bleibt (Defense-in-depth).

## Acceptance Criteria

### AC2 — Vorgefertigte Berechtigungsprofile
- [ ] **AC-100b-1:** Ein tenant-scoped Profilkatalog existiert. Ein Profil trägt mindestens: Name, optionale Beschreibung, vergebene **Vertraulichkeitsstufe** (`standard`/`confidential`/`strict`, geordnet wie in 100a) und einen Aktiv/Inaktiv-Status. Profile sind streng tenant-isoliert (kein Cross-Tenant-Sichtbarkeit/-Anwendung).
- [ ] **AC-100b-2:** Tenant-Admins können Profile anlegen, bearbeiten (Name/Beschreibung/Stufe) und deaktivieren. Deaktivierte Profile sind nicht mehr anwendbar, bestehende über sie vergebene Freischaltungen bleiben unberührt.
- [ ] **AC-100b-3:** Ein berechtigter Verwalter (tenant-admin ODER project-lead, identisch zur 100a-grant-Autorität) kann ein **aktives** Profil auf einen Nutzer in einem Projekt anwenden; das Ergebnis ist eine Freischaltung über den **bestehenden** `grant_confidentiality_clearance`-Pfad (keine Parallel-Vergabe an der RLS vorbei). Die angewandte Profil-Referenz wird festgehalten (Nachvollziehbarkeit „über welches Profil freigeschaltet").
- [ ] **AC-100b-4:** Profil-Anwendung respektiert alle 100a-Invarianten: Cross-Tenant-Anwendung blockiert, Selbst-Freischaltung blockiert (nur befugte Rolle), Class-3-Achse unberührt.
- [ ] **AC-100b-5:** Optionale Standard-Profile (z. B. „SteerCo lesend") können je Mandant vorhanden sein; ihre konkrete verbindliche Liste ist eine offene Compliance-Frage (siehe Open Questions) — der Mechanismus darf nicht von einer fixen Liste abhängen.

### AC4 — „Wer darf was sehen?"-Übersicht
- [ ] **AC-100b-6:** Für ein gegebenes geschütztes Objekt (Projekt/Phase/Work-Item mit `confidentiality_level`) liefert eine Übersicht die Nutzer, die das Objekt sehen dürfen: Tenant-Admins (Bypass) **plus** Nutzer mit einer nicht-abgelaufenen Freischaltung ≥ der Objektstufe — exakt die Semantik des `can_access_classified`-Tors (keine abweichende Zweitlogik).
- [ ] **AC-100b-7:** Die Übersicht zeigt je Eintrag mindestens: Nutzer (Anzeige gemäß Class-3-Masking-Regeln), Zugriffsgrund (Admin-Bypass vs. konkrete Freischaltungsstufe) und ggf. Befristung (`valid_until`).
- [ ] **AC-100b-8:** Die Übersicht ist tenant- und projekt-isoliert und nur für berechtigte Verwalter (tenant-admin/project-lead/`manage_members`-Gate) abrufbar; sie ist read-only (keine Vergabe/Entzug in dieser View).
- [ ] **AC-100b-9:** Für ein `standard`-eingestuftes Objekt spiegelt die Übersicht die Baseline-Semantik (alle Projektsichtbaren), ohne fälschlich Freischaltungen zu verlangen.

### Hygiene — anon-RPC-Härtung (Security-Followup aus 100a-QA)
- [ ] **AC-100b-10:** Für `can_access_classified`, `grant_confidentiality_clearance` und `revoke_confidentiality_clearance` wird `execute` von `anon` (und `public`) entzogen; `authenticated` behält `execute`. Live gegen Prod verifiziert (anon kann nicht ausführen, autorisierter authenticated-Pfad weiterhin grün).

### Audit (AC3-Wiederverwendung)
- [ ] **AC-100b-11:** Jede Profil-Anwendung erzeugt denselben Audit-Eintrag wie eine direkte Freischaltung (PROJ-10) — inkl. der Information, dass die Freischaltung über ein Profil erfolgte. Profilkatalog-Änderungen (anlegen/ändern/deaktivieren) sind nachvollziehbar.

## Edge Cases
- **Profil deaktiviert, während offen angewandt wird:** Anwendung eines inaktiven Profils wird abgelehnt (sauberer 4xx); bereits darüber vergebene Freischaltungen bleiben gültig.
- **Profil vergibt niedrigere Stufe als die bestehende Freischaltung des Nutzers:** Erwartetes Verhalten klären — Profil-Anwendung soll die höchste freigeschaltete Stufe nicht stillschweigend herabstufen (kein versehentlicher Downgrade); ein expliziter Entzug bleibt der `revoke`-Pfad.
- **Objekt ohne explizite Einstufung in der Wer-darf-was-View:** gilt als `standard` (default), View zeigt Baseline-Semantik, nicht „niemand".
- **Nutzer mit abgelaufener Freischaltung (`valid_until` in der Vergangenheit):** erscheint NICHT in der Wer-darf-was-View (Tor wertet ihn als nicht freigeschaltet).
- **Profilname-Kollision im selben Tenant:** Duplikate werden verhindert (eindeutig pro Tenant); Cross-Tenant gleiche Namen sind erlaubt (isoliert).
- **Class-3-maskierter Nutzer in der View:** Anzeige folgt den bestehenden Masking-Regeln (kein Leak personenbezogener Daten über die Sichtbarkeits-View).
- **anon-RPC-Härtung bricht keinen bestehenden Pfad:** authentifizierte Routen/RPC-Aufrufe und der Pentest (`tests/sql/PROJ-100a-need-to-know-pentest.sql`) bleiben grün nach dem Revoke.

## Out of Scope
- **AC5 — 4-Augen-Prinzip** für besonders sensible Freischaltungen → **PROJ-100c** (eigene Genehmigungs-State-Machine, voraussichtlich PROJ-31-Approval-Pattern).
- Kein eigenes IAM; Authentifizierung über den Unternehmens-IdP (wie PROJ-100).
- Keine automatische Dokument-Klassifikation; Verknüpfung mit DMS-Geheimhaltungsvermerken erst, wenn DMS-Klassifikation (PROJ-79/129) steht.
- Keine ausgefeilte Befristungs-Ablauf-Automatik über das bestehende `valid_until`-Feld hinaus (100a-Stand bleibt).
- Frei zusammensetzbare Einzel-Rechte-Listen pro Objekt (statt geordneter Stufen) — bewusst nicht; 100a-Stufenmodell bleibt.

## Open Questions
- Welche Standard-/Vorab-Profile sind aus Compliance-Sicht **verbindlich** (z. B. „SteerCo lesend", „externer Berater Tax")? Mechanismus darf nicht von einer fixen Liste abhängen; verbindliche Liste mit Compliance abzustimmen.
- Soll ein Profil neben der Vertraulichkeitsstufe auch eine **Projekt-Rolle** (PROJ-1/PROJ-97) vorschlagen/setzen, oder strikt nur die Clearance-Stufe? (100b-Default-Vorschlag: nur Clearance-Stufe; Rolle bleibt separat.)
- Soll die Wer-darf-was-View auch **objekt-übergreifend pro Projekt** (eine Matrix Nutzer × Stufe) verfügbar sein, oder genügt die Per-Objekt-Ansicht für den Pilot?

## Technical Requirements
- **Security:** Verwaltung tenant-admin/project-lead-gated; alle 100a-Invarianten (Tenant-Isolation, Selbst-Freischaltungs-Block, Class-3-Orthogonalität) bleiben in Kraft. Profil-Anwendung NUR über den bestehenden grant-RPC.
- **Audit:** Wiederverwendung PROJ-10 (keine Parallel-Audit-Struktur).
- **Pentest-Regression:** `tests/sql/PROJ-100a-need-to-know-pentest.sql` muss nach diesem Slice unverändert grün bleiben; die Wer-darf-was-View muss exakt die Tor-Semantik widerspiegeln (kein abweichendes Zweit-Gate).
- **Migration-Hygiene:** PROJ-134-Konvention (`apply_migration` name = Repo-Dateiname-Stamm); Pflicht-Live-RPC-Smoke für neue/erweiterte RPCs.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 2026-06-24

> **ADR-Bindung:** Reine **EXTEND** auf [ma-domain-architecture.md](../docs/decisions/ma-domain-architecture.md) Fork 2 (Need-to-Know = additiver RLS-Sublayer). Das in 100a gebaute „Vertraulichkeits-Tor" (`can_access_classified`) und die `ma_confidentiality_clearances`-Tabelle werden **wiederverwendet, nicht ersetzt**. Keine neue Architektur-Grundsatzfrage → kein neuer CIA-Pflicht-Pass; CIA bleibt optional als Security-Sanity-Check verfügbar.

### Grundidee in einem Satz

100b legt **zwei Komfort-/Transparenz-Schichten** auf das fertige 100a-Tor: (1) **Berechtigungsprofile** — benannte Vorlagen, die eine Freischaltung in einem Klick vergeben, statt jede Stufe manuell zu wählen; (2) **„Wer darf was sehen?"-Übersicht** — eine read-only Ansicht, die pro Objekt genau die Personen auflistet, die das Tor durchlässt. Beide Schichten **erzeugen oder umgehen kein eigenes Recht** — sie bedienen bzw. spiegeln ausschließlich den bestehenden Freischaltungs-/Tor-Mechanismus.

### A) Komponenten-Struktur (was die UI bekommt)

100a war backend-only — 100b bringt die **erste Oberfläche** für Need-to-know. Zwei Orte:

```
Stammdaten (tenant-weit, bestehende /stammdaten-Sektion)
+-- NEU: "Berechtigungsprofile"  (spiegelt das bestehende „Stakeholder-Typen"-Katalog-Muster)
|   +-- Liste der Profile (Name · Stufe · aktiv/inaktiv)
|   +-- Anlegen / Bearbeiten (Name, Beschreibung, Vertraulichkeitsstufe)
|   +-- Deaktivieren (kein Hard-Delete — bestehende Freischaltungen bleiben)
|   +-- nur Tenant-Admin

Projekt-Raum (bestehend) — NEU: Karte/Reiter "Vertraulichkeit & Zugriff"
+-- Freischaltungen (erste UI über die 100a-clearances-API)
|   +-- "Profil anwenden": Nutzer wählen + aktives Profil wählen -> vergibt Freischaltung
|   |   (über den BESTEHENDEN grant-Pfad; zeigt vorab die Stufe, die das Profil vergibt)
|   +-- bestehende Freischaltungen (Liste, mit "über Profil X freigeschaltet"-Hinweis)
|   +-- nur Tenant-Admin / Project-Lead (manage_members-Gate)
+-- "Wer darf was sehen?" (AC4)
    +-- Objektauswahl (Projekt / Phase / Work-Item)
    +-- Personenliste: wer das Objekt sehen darf
    |   (Admin-Bypass vs. konkrete Freischaltungsstufe, ggf. Befristung)
    +-- read-only; Personennamen folgen den Class-3-Masking-Regeln (PROJ-57)
```

### B) Datenmodell (Klartext, kein Code)

**Neue tenant-weite Tabelle „Berechtigungsprofil"** (mirror des bestehenden Katalog-Musters):
- Eindeutige ID, Tenant-Zugehörigkeit, **Name** (eindeutig je Tenant), optionale **Beschreibung**, vergebene **Vertraulichkeitsstufe** (`confidential` oder `strict` — `standard` wird nie vergeben, exakt wie der bestehende grant-Eingang), **Aktiv-Flag**, Audit-Spalten (wer/wann angelegt/geändert).
- Streng tenant-isoliert (RLS): Tenant-Admins verwalten; Projekt-Verwalter dürfen die **aktiven** Profile lesen, um sie anzuwenden.

**Bestehende Freischaltungs-Tabelle (`ma_confidentiality_clearances`)** — minimale Ergänzung:
- Ein **optionaler Verweis** „über welches Profil vergeben". Nur Nachvollziehbarkeit; ändert die Tor-Logik nicht. Direkte (profillose) Freischaltungen bleiben unverändert möglich.

**Keine** neue Berechtigungs-Engine, **keine** frei zusammensetzbaren Einzelrechte, **kein** Zweit-Tor.

### C) Wie die zwei Schichten technisch andocken (WARUM so)

1. **Profil anwenden = bestehender grant-Pfad.** Das Anwenden eines Profils ruft denselben Freischaltungs-Mechanismus wie heute auf (Autorität admin|lead, Tenant-Check, Audit-Zeile) — das Profil liefert nur die Stufe + den Profil-Verweis. **Warum:** ein einziger Autoritäts- und Audit-Pfad; ein Profil kann die RLS oder die 100a-Invarianten (Selbst-Freischaltung, Cross-Tenant, Class-3-Orthogonalität) prinzipiell nicht umgehen. (AC-100b-3/4/11)
2. **„Wer darf was sehen?" wird aus DEMSELBEN Prädikat abgeleitet wie das Tor**, nicht zweitimplementiert. Die View fragt: „welche Tenant-Mitglieder würde `can_access_classified` für dieses Objekt durchlassen?" → Admins (Bypass) + Nutzer mit gültiger Freischaltung ≥ Objektstufe. **Warum:** eine zweite, eigenständige Sichtbarkeitslogik würde mit der Zeit vom echten Tor abdriften und genau die Lücke öffnen, die 100a schließt. Die View ist read-only und darf nie zur Vergabe-Schnittstelle werden. (AC-100b-6/8)
3. **Downgrade-Schutz:** Ein Profil, das eine niedrigere Stufe vergibt als die bestehende Freischaltung des Nutzers, stuft nicht stillschweigend herab — Herabstufung bleibt der explizite `revoke`-Pfad. (Edge Case)
4. **anon-Härtung:** `execute` auf den drei Need-to-know-RPCs (`can_access_classified`, `grant_/revoke_confidentiality_clearance`) wird `anon`/`public` entzogen, `authenticated` behält es. Eine kleine, idempotente Migration; der 100a-Pentest muss danach unverändert grün bleiben. (AC-100b-10)

### D) Gelockte Entscheidungen (Default-Empfehlungen zu den Open Questions)

1. **Profil setzt NUR die Vertraulichkeitsstufe**, keine Projekt-Rolle. Rollen bleiben separat (PROJ-1/PROJ-97) — hält den Slice fokussiert und vermeidet zwei Wahrheiten über „Rolle". (Bei Bedarf später erweiterbar.)
2. **Wer-darf-was als Per-Objekt-Ansicht** für den Pilot (wie AC4 formuliert); eine objekt-übergreifende Matrix (Nutzer × Stufe pro Projekt) ist **Later**.
3. **Keine fix verdrahtete Compliance-Profilliste** — der Mechanismus ist katalog-getrieben; optionale Beispiel-Seeds möglich, aber die verbindliche Liste ist eine Tenant-/Compliance-Konfiguration.

### E) Abdeckung der Akzeptanzkriterien

| AC | Wie abgedeckt |
|----|---------------|
| AC-100b-1/2/5 | Neue tenant-weite Profil-Katalogtabelle + Admin-CRUD (Stakeholder-Typen-Muster), Aktiv-Flag statt Delete |
| AC-100b-3/4/11 | Profil-Anwendung über den bestehenden grant-Pfad (+ Profil-Verweis); 100a-Invarianten & PROJ-10-Audit unverändert |
| AC-100b-6/7/8/9 | Read-only Wer-darf-was-View, abgeleitet aus dem `can_access_classified`-Prädikat, manager-gated, Class-3-Masking, `standard`=Baseline |
| AC-100b-10 | Idempotente Migration: `revoke execute … from anon, public` auf den 3 RPCs + Live-Smoke |

### F) Dependencies (Pakete)

**Keine neuen Pakete.** Reuse: shadcn/ui-Primitives, das bestehende `/stammdaten`-Katalog-Muster (Stakeholder-Typen), die 100a-clearances-API, die PROJ-57-Class-3-Masking-Logik, der PROJ-10-Audit-Trigger/RPC-Audit-Pfad.

### G) Migration-/Test-Disziplin

- 1 Migration (Profil-Tabelle + RLS + optionaler clearance→profil-Verweis), 1 kleine Härtungs-Migration (anon-revoke) — PROJ-134-Konvention (`apply_migration` name = Repo-Dateiname-Stamm), Pflicht-Live-RPC-Smoke für neue/erweiterte RPCs.
- **Regressionspflicht:** `tests/sql/PROJ-100a-need-to-know-pentest.sql` muss nach 100b unverändert grün laufen; zusätzlich ein Profil-/View-Smoke (Profil-Anwendung erzeugt genau eine Freischaltung über den grant-Pfad; View == Tor-Semantik).

## Implementation Notes — Backend (2026-06-24)

**Migrationen (PROJ-134-Konvention, name = Repo-Dateiname-Stamm; beide in Prod-DB):**
- `20260624120000_proj100b_clearance_profiles` — neue tenant-weite `ma_clearance_profiles` (name unique je Tenant case-insensitiv via `lower(name)`-Index, `granted_level` CHECK confidential/strict, `is_active`, Audit-Spalten) + Tenant-RLS (member-SELECT, admin INSERT/UPDATE/DELETE als separate Policies, PROJ-68-Hygiene); `audit_log_entity_type_check` 45→46 (`ma_clearance_profiles` VORHER eingetragen — PROJ-100a-H-1-Lehre) + `_tracked_audit_columns` erweitert + `record_audit_changes`-UPDATE-Trigger angehängt; `applied_profile_id`-Provenance-Spalte (ON DELETE SET NULL) auf `ma_confidentiality_clearances`; **grant-RPC recreated** (4→5 Arg mit optionalem `p_applied_profile_id` default null — bestehende PostgREST-4-Arg-Caller lösen via Default auf; `revoke from public,anon` da neues Objekt sonst PUBLIC-executable wäre); `apply_clearance_profile`-Wrapper (resolved aktives Profil same-tenant → `greatest(existing, profile_level)` Downgrade-Schutz → delegiert an grant = EIN Autoritäts-/Audit-Pfad); `who_can_access`-Read-RPC (manager-gated, aus dem `can_access_classified`-Prädikat abgeleitet: standard=alle Member, sonst Admins ∪ gültige Clearances ≥ Level — KEIN Zweit-Gate).
- `20260624120100_proj100b_revoke_anon_execute` — `revoke execute … from public,anon` auf `can_access_classified` + `grant_` + `revoke_confidentiality_clearance` (AC-100b-10); `authenticated` behält execute. Verifiziert: alle 5 NtK-Funktionen `anon=f, auth=t`.

**APIs:** `GET/POST /api/clearance-profiles` (Katalog-Liste member / Create admin) + `PATCH/DELETE /api/clearance-profiles/[id]` (Edit/Deactivate/Hard-Delete, admin) + `POST /api/projects/[id]/clearances/apply-profile` (manager, RPC 42501→403 / P0002→404) + `GET /api/projects/[id]/access-overview?objectType=&objectId=` (resolved Objekt-Level → `who_can_access`, manager). Client-Wrapper `src/lib/ma-project/clearance-profiles-api.ts`.

**Pflicht-Live-RPC-Smoke gegen Prod (DO-block, rollback, 0 Residue) — 7/7 PASS:** A profile→confidential+provenance · B Downgrade-Schutz hält strict · C who_can_access(confidential)={admin,strict,conf-cleared} ohne uncleared · D standard=alle Member · E inaktiv rejected · F cross-tenant rejected · G non-manager geblockt (42501).
**100a-Gate-Regression (rolling-back, 5/5 PASS):** admin-bypass · cleared conf-yes/strict-no · uncleared conf-no/standard-yes · cross-tenant denied · recreated-grant schreibt Clearance+Audit. `can_access_classified` + RESTRICTIVE-Policies byte-identisch (nur revoke/grant berührt) → 100a-Pentest bleibt grün.
**Advisor:** keine neuen Findings — `apply_clearance_profile`/`who_can_access` teilen das etablierte SECURITY-DEFINER-authenticated-callable-Muster (Autorität intern, anon revoked), wie alle bestehenden RPCs.

**Quality-Gates:** vitest 1965/1965 (+24 neue Route-Tests); lint 0; tsc 13 baseline/0 neu; build clean.

**Offen → /frontend:** Stammdaten-Katalog „Berechtigungsprofile" (admin CRUD) + Projekt-Raum-Karte „Vertraulichkeit & Zugriff" (Profil-Anwenden + erste clearances-UI + Wer-darf-was-View mit Class-3-Masking). Danach /qa (Pentest-Regression + Security-Review der 4 Routen).

## Implementation Notes — Frontend (2026-06-24)

100a war backend-only → 100b bringt die **erste** Need-to-know-UI. Zwei Oberflächen, beide shadcn/ui-first, Loading/Empty/Error-States:

**(1) Stammdaten-Katalog „Berechtigungsprofile"** (`/stammdaten/berechtigungsprofile`, tenant-admin) — gespiegelt vom Stakeholder-Typen-Katalog-Muster: `ClearanceProfilesPageClient` (Tabelle Name/Beschreibung/Stufe/Status + Anlegen/Bearbeiten/Deaktivieren/Reaktivieren/Hard-Delete, alles admin-gated via `useAuth().currentRole`) + `ClearanceProfileFormDialog` (Name/Beschreibung/Stufe confidential|strict via shadcn-Select + Aktiv-Switch im Edit-Mode). Neue Kachel in der `/stammdaten`-Index-SECTIONS (adminOnly, ShieldCheck).

**(2) Projekt-Raum-Karte „Vertraulichkeit & Zugriff"** (`/projects/[id]/vertraulichkeit`) — `ConfidentialityAccessCard`, manager-gated via `useProjectAccess(id, "manage_members")` (Nicht-Manager sehen einen Hinweis statt der Daten). Zwei Panels:
- *Freischaltungen + Profil anwenden*: Liste der bestehenden Clearances (GET `/api/projects/[id]/clearances`, Namen aus `useTenantMembers`, „über Profil X"-Spalte) + Nutzer-Picker (Tenant-Member) × aktives-Profil-Dropdown → `applyClearanceProfile` (= bestehender grant-Pfad).
- *Wer darf das sehen?*: Objekt-Typ-Auswahl Projekt/Phase/Work-Item (Phase/Work-Item-Picker via `usePhases`/`useWorkItems`; Level wird serverseitig resolved) → `fetchAccessOverview` → read-only Tabelle (Nutzer · Zugriffsgrund baseline/admin/clearance · Stufe · Befristung).

**Nav-Integration:** neue `MA_CONFIDENTIALITY_SECTION` (tabPath `vertraulichkeit`, `requiresProjectType: 'ma'`) per `withMaFoundation`-Injektion neben der Strategische-Grundlage-Sektion — erscheint nur für M&A-Projekte (generischer Need-to-know-Layer, aber im M&A-Track verortet; Erweiterung auf andere Typen wäre ein Einzeiler).

**Class-3-Klärung:** PROJ-57-Masking betrifft Class-3-*Beträge* (Tagessätze), nicht interne Mitglieder-Namen. Die Wer-darf-was-View ist manager-only + rein intern (kein externes Modell) → Mitglieder-Namen werden regulär angezeigt (kein Masking erforderlich; dokumentiert statt fälschlich erzwungen).

**Client-Wrapper:** `src/lib/ma-project/clearance-profiles-api.ts` (list/create/update/delete/apply/fetchAccessOverview). **Kein neuer Backend-Call** — alle Routen aus dem Backend-Slice.

**Quality-Gates:** vitest 1974/1974 (+9 — routing.test.ts enumeriert die neue Nav-Sektion pro Methode); lint 0; tsc 13 baseline/0 neu; build clean (2 neue Routen `/stammdaten/berechtigungsprofile` + `/projects/[id]/vertraulichkeit`).

**Offen → /qa:** Pentest-Regression (`tests/sql/PROJ-100a-need-to-know-pentest.sql` + 100b-RPC-Smoke), Security-Review der 4 Routen, E2E-Auth-Gates + Katalog-CRUD-/apply-/who-can-see-Smoke, AC-End-to-End (AC-100b-1..11).

## QA Test Results — 2026-06-24 (PR #178; backend live on main via #174)

**Verdikt: PRODUCTION-READY** — 11/11 Akzeptanzkriterien erfüllt, 0 Critical / 0 High.

### Acceptance Criteria
| AC | Ergebnis | Nachweis |
|----|----------|----------|
| AC-100b-1 Profilkatalog (Name/Beschr./Stufe/aktiv, tenant-isoliert) | ✅ | `ma_clearance_profiles` + RLS; Pentest **H** (t1-Member sieht 0 t2-Profile) |
| AC-100b-2 Admin-CRUD, Deaktivieren lässt Clearances unberührt | ✅ | admin-gated Routen + UI; Deaktivieren = PATCH `is_active`, Clearances strukturell getrennt |
| AC-100b-3 Aktives Profil anwenden via grant-Pfad + Provenance | ✅ | Pentest **A** (confidential + `applied_profile_id`) |
| AC-100b-4 100a-Invarianten (cross-tenant/self-grant/Class-3) | ✅ | Pentest **F** (cross-tenant reject); grant-Pfad erzwingt self-grant-Block (100a); Class-3 orthogonal (Gate-Regression) |
| AC-100b-5 Optionale Standard-Profile, mechanismus-nicht-listengebunden | ✅ | Katalog ist Tenant-Config, keine hartcodierte Liste |
| AC-100b-6 Wer-darf-was = Gate-Semantik | ✅ | Pentest **C** (={ua,um,uc} ohne un) + **D** (standard=alle) |
| AC-100b-7 Einträge: Nutzer/Grund/Stufe/Befristung | ✅ | `who_can_access`-Felder + UI-Tabelle |
| AC-100b-8 tenant/projekt-isoliert, manager-gated, read-only | ✅ | Pentest **G** (non-manager 42501); View hat keine Mutation |
| AC-100b-9 standard = Baseline | ✅ | Pentest **D** |
| AC-100b-10 anon-execute-Revoke auf 3 NtK-RPCs | ✅ | alle 5 NtK-Funktionen `anon=f, auth=t` (DB verifiziert) |
| AC-100b-11 Audit bei Anwendung wie grant + Profil-Ref | ✅ | grant schreibt Audit-Zeile (Gate-Regression V-grant-audit); `applied_profile_id` gesetzt (Pentest A) |

### Automatisierte Tests
- **Vitest:** 1974/1974 grün (inkl. 24 neue 100b-Route-Tests: Auth/Validation/403-Governance/RPC-Error-Mapping).
- **Live-Pentest** `tests/sql/PROJ-100b-clearance-profiles-pentest.sql` (self-rolling-back, 0 Residue): **A–H 8/8 PASS**.
- **100a-Gate-Regression** (re-verifiziert, Gate byte-identisch): **V-admin/cleared/uncleared/crosstenant 4/4 PASS** → `tests/sql/PROJ-100a-need-to-know-pentest.sql` bleibt grün.
- **Playwright E2E** `tests/PROJ-100b-clearance-profiles.spec.ts` (chromium): **9/9 PASS** — Auth-Gates auf 4 Routen + 2 Pages + invalid-uuid.
- lint 0 · tsc 13 baseline/0 neu · build clean.

### Security Audit (Red Team)
| Vektor | Ergebnis |
|--------|----------|
| Auth-Gate (kein Session) auf 4 Routen + 2 Pages | ✅ E2E 9/9 (307/401/403) |
| Katalog-Tenant-Isolation (RLS) | ✅ Pentest H |
| apply-profile Autorität (non-manager) + cross-tenant + inaktiv | ✅ Pentest F/E + Route 42501→403 / P0002→404 (Route-Tests) |
| who-can-see manager-gated (kein Inner-Circle-Leak) | ✅ Pentest G |
| Kein Zweit-Gate (View aus `can_access_classified`-Prädikat) | ✅ by design + Pentest C |
| anon-execute auf NtK-RPCs | ✅ revoked, verifiziert |
| Advisor (security) | ✅ keine neuen Findings (etabliertes SECURITY-DEFINER-Muster) |

### Findings
- Keine Critical/High/Medium. **F-1 (Low/Info, Deploy-Handoff, kein Feature-Bug):** Shared-Checkout-Kollision — der `/backend`-Commit wurde via #174 nach main gemergt (mit PROJ-99/128/129-Docs gebündelt durch eine Parallel-Session); das Frontend liegt sauber auf `proj-100b/frontend` (PR #178). Mein versehentlicher Commit auf `proj-99-128-129/backend` wurde auf User-Wunsch nicht angefasst (Parallel-Session bereinigt).
- **Phase/Work-Item-Picker in der Wer-darf-was-View** zeigt nur Objekte, die der aufrufende Manager selbst sehen darf (Gate-konsistent — ein nicht für `strict` freigeschalteter Lead sieht klassifizierte Objekte nicht im Picker; Tenant-Admins sehen alles). Erwartetes Verhalten, kein Bug.


## Deployment — 2026-06-24

- **Backend** auf main via **#174** (gebündelt mit PROJ-99/128/129-Docs durch eine Parallel-Session); 2 Migrationen in Prod (`20260623222615_proj100b_clearance_profiles` + `20260623222622_proj100b_revoke_anon_execute`).
- **Frontend** PR **#178** squash-merged → `3d7a4ea`; Tag **`v1.99.0-PROJ-100b`**.
- **Prod-Verify:** Auth-Gate-Smoke 5/5 = 307 auf `/api/clearance-profiles`, `/stammdaten/berechtigungsprofile`, `/api/projects/[id]/access-overview`, `/api/projects/[id]/clearances/apply-profile`, `/projects/[id]/vertraulichkeit` (Katalog-Page 307 statt 404 ⇒ neues Deployment live + geschützt). Migrationen waren bereits beim /backend-Slice live-verifiziert (Pentest 8/8 + Gate-Regression 4/4 gegen Prod).
- **Offen:** PROJ-100c (AC5 4-Augen) als nächster Slice der Familie.
