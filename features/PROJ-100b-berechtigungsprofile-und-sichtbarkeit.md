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

## Status: Planned
**Created:** 2026-06-23
**Last Updated:** 2026-06-23

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

## Tech Design (Solution Architect)
_To be added by /architecture — CIA-Review-relevant (Profil-Datenmodell + Profil-Anwendungspfad als dünner Wrapper über grant-RPC; Wer-darf-was-View ohne Zweit-Gate)._

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
