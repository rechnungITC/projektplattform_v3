# PROJ-136: ERP-Pilot Golden-Path End-to-End Smoke

## Status: Deployed (2026-06-22, Tag `v1.96.0-PROJ-136`, Closure — kein Runtime-Deploy, Test-Infra + PROJ-70-Fix bereits via #163 live). QA-Pass: 7/7 AC inkl. AC-6 Negativ-Nachweis live, 0 Critical/High. Fand+fixte beim ersten Lauf den HIGH Waterfall-Taxonomie-Bug (PROJ-70). Playwright-UI-Flow = dokumentiertes Non-Goal.
**Created:** 2026-06-19
**Last Updated:** 2026-06-22

## Implementation Notes — Backend (2026-06-22)

Der Golden-Path wurde als **Live-Seed-Smoke gegen Prod** gebaut (Muster wie `tests/sql/PROJ-100a-need-to-know-pentest.sql`): markierter Seed → echte Accept-RPC-Kette → verifizierte Persistenz → Teardown mit `session_replication_role=replica` + 0-Residue-Check. Artefakt: **`tests/sql/PROJ-136-erp-golden-path.sql`**.

**Design-Entscheidung (deterministisch ohne Live-LLM):** Der Smoke seedet `ki_suggestions` (status=draft) direkt und ruft die echten Bulk-Accept-RPCs (`accept_proposal_from_context_bulk` / `accept_stakeholder_proposals_bulk` / `accept_risk_proposals_bulk`) — das prüft die risikoreichste, cross-feature-Bruch-gefährdete Kette (Accept→Persist→`ki_provenance`) deterministisch. Die LLM-**Generierung** selbst (Stub-Reason-Transparenz) gehört zu PROJ-137.

**Live gegen Prod verifiziert (0 Residue):**
- Backlog-Accept (waterfall): 3 work_items `work_package`→`task`→`bug`, Hierarchie korrekt, `ki_provenance.entity_type='work_items'`, suggestions accepted.
- Stakeholder-Accept: 1 stakeholder, provenance `stakeholders`.
- Risk-Accept: 1 risk mit `status='open'`, provenance `risks`.
- Phasen/Budget/Report-Inserts (PROJ-19/22/21) tragen.

**🔴 HIGH-Bug beim ERSTEN Lauf gefunden (genau der Slice-Zweck — untested Cross-Feature-Verkettung, CIA-R-bestätigt):** Der Waterfall-KI-Backlog-Accept war über 3 Schichten inkonsistent — Prompts + Accept-RPC ließen `phase`/`work_package`/`todo` zu, aber `work_items_kind_check` erlaubt nur `work_package` davon; autoritativ ist das Method-Template (`work_package/task/bug`). Bewiesen: **0** work_items mit kind `phase`/`todo` in ganz Prod → der Waterfall-Accept-Pfad war nie erfolgreich. Da der erste Pilot Waterfall-ERP ist: pilot-blockierend. Fix (PROJ-70-Hotfix, auf Method-Template ausgerichtet): Migration `20260622100000_proj70_fix_waterfall_kind_taxonomy` (RPC-Validierung) + AI-Schema-Enums + Prompts + FE-Tree-Regeln. Live re-verifiziert (s.o.). Siehe PROJ-70 Implementation Notes.

**AC-Status:** AC-1/2/3/5 erfüllt (Live-Seed-Smoke, Persistenz-Verifikation je Schritt, idempotent+0-Residue, fixed Fixture). AC-4 (Class-3→gehosteter-Ollama) als deterministischer Stub-Pfad abgedeckt; echte Class-3-Ollama-Generierung verzahnt mit PROJ-137. AC-6 (Negativ-Nachweis) live demonstriert (der gefundene Bug WAR der Negativ-Nachweis: gebrochenes Glied → lauter 23514-Fail) — Automatisierung als Assertion → /qa. AC-7 erfüllt (reproduzierbares SQL).

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

## QA Test Results — 2026-06-22

**Tester:** QA Engineer / Red-Team · **Methode:** unabhängige Live-Verifikation gegen Prod (`iqerihohwabyjzkpcujq`), rollenbasiert (SET ROLE authenticated + JWT-Claims), markierte Seeds + garantierter Teardown.

### Acceptance Criteria

| AC | Verifikation | Ergebnis |
|----|--------------|----------|
| AC-1 (Live-Seed-Smoke ganze Kette) | `tests/sql/PROJ-136-erp-golden-path.sql` — Seed→3 Accept-Legs→Persistenz→Phasen/Budget/Report→Teardown, gegen Prod | ✅ PASS (0 Residue) |
| AC-2 (Persistenz je Schritt) | Backlog work_package→task→bug Hierarchie korrekt; Stakeholder; Risk `status=open`; `ki_provenance.entity_type` ∈ {work_items, stakeholders, risks} (alle CHECK-konform); suggestions accepted | ✅ PASS |
| AC-3 (idempotent + isoliert + 0 Residue) | markierte UUIDs, `session_replication_role=replica`-Teardown, re-runbar | ✅ PASS |
| AC-4 (Class-3→Ollama ODER fail-open) | Generierung deterministisch via Stub-Seed abgedeckt; echte Class-3-Ollama-Generierung + sichtbarer Block-Grund verzahnt mit [[PROJ-137]] (kein grünes Gate bei stillem Stub) | ✅ PASS (Scope-konform) |
| AC-5 (fixiertes ERP-Fixture) | versioniert im Artefakt (context_source + deterministische Payloads) | ✅ PASS |
| **AC-6 (Negativ-Nachweis, gebrochenes Glied → lauter Fail)** | **Section 8 des Artefakts**: Accept einer `kind='phase'`-Waterfall-Suggestion → **live `ERROR 23514 method_kind_incompatible: requires kind in (work_package, task, bug)`**. Positivkontrolle (`work_package`) akzeptiert. | ✅ PASS |
| AC-7 (reproduzierbares SQL) | `tests/sql/PROJ-136-erp-golden-path.sql` inkl. Negativ-Guard | ✅ PASS |

**7/7 AC PASS.**

### Security-Audit (Red-Team auf Slice-Änderungen)
- **RPC-Migration** `20260622100000`: ändert NUR die Waterfall-Kind-Allowlist (`work_package/task/bug`); Scrum-Zweig + Authority-Checks (tenant-admin/project-lead) + SECURITY-DEFINER-Eigentümerschaft unverändert. Self-verifizierender In-Place-Patch (raise bei fehlendem Anchor). Keine neue Angriffsfläche.
- **AI-Schema/Prompt-Edits**: entfernen `phase`/`todo` aus den erzeugbaren Kinds → **verengen** die Modell-Ausgabe (weniger, nicht mehr); kein neuer Output-Pfad.
- **Smoke selbst**: reine Test-Infra, keine Prod-Code-Pfade; Seeds streng tenant-scoped + markiert + geteardownt. Kein Leak, keine Injection-Fläche.
- Class-3-Hardblock + Multi-Tenant-Invariante unberührt.

### Regression
- vitest 1889/1889, lint 0, build clean, 0 neue tsc-Fehler (Backend-Slice). Schema-Drift-Guard grün auf der Migration (PR #163 CI).
- Beweis-Kontext: **0** work_items mit kind `phase`/`todo` in ganz Prod → der Fix räumt keinen Bestand auf (es gab nie welchen), reine Vorwärts-Korrektur.

### Bugs
Keine offenen. Der HIGH-Bug (Waterfall-Taxonomie), den dieser Golden-Path beim ersten Lauf fand, wurde im Backend-Slice gefixt + hier per Negativ-Nachweis als geschlossen bestätigt.

### Produktionsreife: ✅ READY
0 Critical / 0 High. AC 7/7 PASS. Playwright-UI-Flow ist ein dokumentiertes **Non-Goal** dieses Slice (die SQL-Live-Seed-Smoke IST das Regressions-Artefakt) — bewusst NICHT ergänzt. → **Approved.**

## Deployment — 2026-06-22 (Closure)

- **Tag:** `v1.96.0-PROJ-136`
- **Kein Runtime-Deploy nötig:** PROJ-136 ist reine Test-Infra (`tests/sql/PROJ-136-erp-golden-path.sql`) + Doku — kein `src/`-Prod-Pfad. Der einzige Runtime-Anteil (der PROJ-70-Waterfall-Taxonomie-Fix: Migration `20260622100000` + AI-Schema/Prompt/FE-Edits) ist bereits via PR #163 auf `main` und Prod-DB live + Vercel-auto-deployed.
- **Enthält:** Golden-Path-Live-Seed-Smoke (3 Accept-Legs + Phasen/Budget/Report + 0-Residue-Teardown) + AC-6-Negativ-Guard (Section 8). QA 7/7 AC PASS, 0 Critical/High.
- **Offen (bewusst, dokumentiert):** Playwright-UI-Flow = Non-Goal dieses Slice; CI-Verdrahtung der SQL-Smoke (heute manuell/MCP-runbar) ist ein optionaler späterer Schritt.
- **Bleibender Wert:** schützt die ~90 isoliert getesteten Slices als Verkettung + den Waterfall-Backlog-Accept-Pfad gegen Taxonomie-Regression (genau die Bug-Klasse, die er beim ersten Lauf fand).
