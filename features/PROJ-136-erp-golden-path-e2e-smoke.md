# PROJ-136: ERP-Pilot Golden-Path End-to-End Smoke

## Status: Planned
**Created:** 2026-06-19
**Last Updated:** 2026-06-19

> **Herkunft:** CIA-Portfolio-Review 2026-06-19 (Finding F-3). Die P0-MVP-Roadmap (PROJ-1–20) ist vollständig deployed und es gibt ~90 isoliert getestete Slices, aber **keinen durchgehenden Test, der ihre Verkettung als Invariante schützt**. Vor dem ersten echten ERP-Pilot ist die größte unsichtbare Gefahr eine Regression *zwischen* den Slices, nicht *in* einem Slice. Schwester-Slice: [[PROJ-137]] (AI-Failure-Transparency).

## Dependencies
- Requires (deployed, read/verify only): PROJ-1 (Tenants/Auth/RLS), PROJ-5/6 (ERP-Wizard + Method-Engine), PROJ-8 (Stakeholders), PROJ-9/19 (Work-Items/Phasen), PROJ-20 (Risks), PROJ-22 (Budget), PROJ-21 (Reports), PROJ-70/88/89/90 (KI-Generate-All + Accept), PROJ-47 (Jira-Export-Preview)
- Pilot-Kontext: erster ERP-Kunde nutzt **Teams** (→ siehe PROJ-49) und hat **kein eigenes Ollama** (wir hosten eins gegen Kosten → Class-3-Pfad muss solide sein); **Standard-ERP ohne M&A-Need-to-know** (PROJ-100a nicht teil des Pfades).

## Problem / Kontext
Jede Slice hat ihren eigenen Live-RPC-Smoke, aber niemand prüft, ob ein PM einen **kompletten ERP-Lebenszyklus** ohne Bruchstelle durchlaufen kann. Beispiele für Verkettungs-Risiken, die Einzeltests nicht fangen: ein CHECK-Constraint, der einen RPC eines *anderen* Features bricht (wie PROJ-100a H-1, 2026-06-18), ein `ki_provenance.entity_type`-Mismatch beim Accept (PROJ-70-δ H-1), ein Purpose-Check, der Generierung 5xx't (PROJ-88 Bookkeeping-Closure). Diese tauchen erst auf, wenn man die Kette als Ganzes fährt.

## User Stories
- Als **Projektleiter (Pilot)** möchte ich darauf vertrauen können, dass der komplette Weg von der Projektanlage bis zum Report/Export an einem echten ERP-Datensatz funktioniert, damit ich die Plattform für ein reales Projekt einsetzen kann.
- Als **Entwickler** möchte ich einen Regressionstest, der den ERP-Golden-Path als Verkettung absichert, damit ein Feature-Change, der ein *anderes* Feature in der Kette bricht, sofort auffällt statt erst im Pilot.
- Als **Product Owner** möchte ich die PRD-Erfolgsmetrik „≥ 1 ERP-Projekt end-to-end" als automatisierten Nachweis sehen, statt sie manuell zu behaupten.

## Scope — Golden-Path-Kette (Live-Seed-Smoke gegen Prod)
Der Test ist ein **Live-Seed-Smoke** im etablierten Muster (Seed mit Marker → Kette aus echten RPCs/APIs → verifizierte Persistenz → Teardown mit 0-Residue-Check via `session_replication_role=replica`), **nicht** ein Playwright-UI-Flow (entkoppelt von Dev-Server-Flakiness; prüft die echte DB/RLS/RPC-Schicht). Die Kette:

1. **Tenant + Admin + Member** seeden (markiert, z. B. `GOLDENPATH-*`).
2. **ERP-Projekt** via Lifecycle-RPC anlegen (Methode = Wasserfall/ERP, `transition_project_status` Draft→Active).
3. **Kickoff-Kontextquelle** anlegen (ein fixiertes ERP-`.eml`/Text-Fixture mit bekanntem Inhalt) — über die PROJ-70-γ-Upload/Parse-Schicht.
4. **Generate-All** über die drei KI-Purposes (`proposal_from_context` Backlog, `proposal_stakeholders_from_context`, `proposal_risks_from_context`) — gegen den **gehosteten Ollama** (Class-3-Pfad, wie beim Pilot-Kunden) ODER Cloud bei Class-2.
5. **Accept-All** über die Bulk-RPCs → verifizierte Persistenz in `work_items` (Hierarchie korrekt), `stakeholders`, `risks` mit `ki_provenance`-Trace.
6. **Phasen + Budget** anlegen/verknüpfen (PROJ-19/22) und Roll-up prüfen.
7. **Report-Snapshot** rendern (PROJ-21) → existiert + enthält die generierten Artefakte.
8. **Jira-Export-Preview** (PROJ-47) → Field-Mapping/Preview ohne echten Jira-Push.
9. **Teardown** → 0 Residue über alle berührten Tabellen verifiziert.

## Acceptance Criteria
- [ ] **AC-1:** Ein Live-Seed-Smoke (`tests/sql/` oder `tests/`-Live-Harness) durchläuft die komplette Golden-Path-Kette (Schritte 1–9) gegen die Prod-DB und endet mit **0 Residue** (alle Residual-Counts = 0).
- [ ] **AC-2:** Jeder Schritt verifiziert die **Persistenz des vorigen** (z. B. Accept-All → `work_items`-Hierarchie via `parent`-Chain korrekt; `ki_provenance.entity_type` matcht den CHECK; Risks mit `status='open'`; Report-Snapshot referenziert die Artefakte).
- [ ] **AC-3:** Der Test ist **idempotent + isoliert** (markierte UUIDs/Tenant, kein Konflikt mit echten Daten, re-runbar) und nutzt das `session_replication_role`-Teardown-Muster für invariant-geschützte Tabellen.
- [ ] **AC-4:** Der Test deckt den **Class-3→gehosteter-Ollama-Pfad** ab (Pilot-Realität) — mindestens ein Generate-Schritt läuft Class-3-klassifiziert und erzeugt > 0 echte (Nicht-Stub-)Vorschläge, ODER der Test dokumentiert sauber, dass kein Class-3-Provider konfiguriert ist und skippt fail-open (kein grünes Gate bei stillem Stub — verzahnt mit [[PROJ-137]]).
- [ ] **AC-5:** Ein **fixiertes ERP-Kickoff-Fixture** (bekannter Inhalt, deterministisch) liegt versioniert im Repo und dient als Eingabe (auch für die [[PROJ-137]]-Eval-Basis).
- [ ] **AC-6:** Der Test schlägt **laut fehl**, wenn irgendein Glied der Kette bricht (Negativ-Nachweis: ein bewusst gebrochener Schritt rot machen, dann wieder grün) — keine still-übersprungenen Schritte.
- [ ] **AC-7:** Dokumentierter, re-runbarer Ablauf im Spec (analog `tests/sql/PROJ-100a-need-to-know-pentest.sql`), inkl. Markierungs-/Teardown-Konvention.

## Edge Cases
- Was, wenn der gehostete Ollama beim Test-Lauf nicht erreichbar ist? → fail-open Skip mit lautem Log (kein grünes Gate), Befund an [[PROJ-137]].
- Was, wenn ein Bulk-Accept-RPC teilweise persistiert (atomar?) → Test muss Atomarität verifizieren (alles oder nichts), nicht nur Happy-Count.
- Was, wenn der Kickoff Class-3-PII enthält, aber das Excerpt sie verbirgt (PROJ-75-Restrisiko)? → Test dokumentiert die Klassifizierungs-Stufe, die er tatsächlich erzielt.
- Was, wenn Seed-Daten gegen einen Tenant-Invariant-Trigger laufen (z. B. „mind. 1 Admin")? → Teardown via `session_replication_role=replica` wie in PROJ-100a-QA etabliert.
- Mehrfachlauf / Parallel-CI: markierte UUIDs müssen lauf-eindeutig oder strikt idempotent sein.

## Technical Requirements
- **Kein neues Dependency**, keine Architektur-Entscheidung, keine Migration (reiner Test-/Verifikations-Layer).
- Multi-tenant-Invariante + Class-3-Hardblock bleiben unberührt — der Test prüft sie, weicht sie nicht auf.
- Lauf-Sicherheit: read/verify + markierte Seeds mit garantiertem Teardown; niemals echte Tenant-Daten berühren.

## Non-Goals
- Kein Playwright-UI-Klick-Flow (separat denkbar als „Beides/Layered", hier bewusst ausgeklammert).
- Kein echter Jira-Push (nur Preview/Mapping).
- Kein Teams-Live-Send (gehört zu PROJ-49; der Golden-Path kann später einen Teams-Schritt ergänzen, sobald PROJ-49 getaggt ist).
- Keine AI-Qualitäts-/Relevanz-Bewertung (das ist die Eval-Harness, separater Slice-Kandidat).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
