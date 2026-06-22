# PROJ-137: AI-Failure-Transparency — sichtbarer Grund statt stiller Stub-0-Vorschläge

## Status: Architected (Tech-Design 2026-06-19: vereinheitlichtes `AiRunReasonCode`-Enum + additive nullable `ki_runs.reason_code`-Spalte; Reason zentral im Router-Finalize über alle Purposes; datengetriebener Regressionstest + FE-Banner-Mapping. Kein neuer Dep, CIA n/a.)
**Created:** 2026-06-19
**Last Updated:** 2026-06-19

> **Herkunft:** CIA-Portfolio-Review 2026-06-19 (Risk R-1, HOCH). Der Multi-Provider-AI-Router fällt bei Provider-Fehler ODER Class-3-Block auf den `stub`-Provider zurück, der leere/CIA-L5-Antworten liefert. Live belegt: in PROJ-88-QA war `blockedReason` nicht gesetzt → `ki_runs.error_message` war NULL für **alle** Class-3-Blocks purposeübergreifend seit PROJ-32 (in-QA gefixt für 1–2 Purposes). Folge ungefixt: ein Pilot-PM sieht „0 Vorschläge" ohne Erklärung und schließt „die KI kann nichts" → killt die PRD-Adoption-Metrik direkt. Schwester-Slice: [[PROJ-136]] (Golden-Path-Smoke). Pilot-Kontext in [[project_first_erp_pilot_constraints]].

## Dependencies
- Requires (deployed): PROJ-12 (AI-Router + Class-3-Hardblock), PROJ-32 (Multi-Provider + Stub-Fallback), PROJ-30 (Purpose-Erweiterung)
- Verwandt: PROJ-88-F-1 / PROJ-89-F-1 (haben den `blockedReason` für `proposal_stakeholders_from_context` + `proposal_risks_from_context` bereits gesetzt — dieser Slice verallgemeinert das auf **alle** Purposes)

## Problem / Kontext
Der `stub`-Provider ist als Fallback gedacht, aber er ist **ununterscheidbar** von einem legitim leeren Ergebnis: dieselbe „0 Vorschläge"-Antwort entsteht bei (a) Key fehlt, (b) Class-3-Block ohne lokalen Provider, (c) Provider-Timeout/-Fehler, (d) tatsächlich nichts zu extrahieren. Für den Pilot ist (a)–(c) ein **stiller Totalausfall, der wie Erfolg aussieht**. Der `ki_runs`-Audit-Trail soll den Grund tragen, und das UI soll ihn actionable anzeigen (z. B. „Kein Class-3-fähiger Provider konfiguriert — bitte Ollama/Tenant-Key hinterlegen").

## User Stories
- Als **Projektleiter** möchte ich, wenn keine KI-Vorschläge kommen, einen **konkreten Grund** sehen (Key fehlt / PII-Daten brauchen lokalen Provider / Provider nicht erreichbar), damit ich weiß, ob ich etwas konfigurieren muss — statt zu glauben, die KI sei nutzlos.
- Als **Tenant-Admin** möchte ich im Audit (`ki_runs`) für jeden fehlgeschlagenen/geblockten Lauf einen maschinenlesbaren Grund sehen, damit Support/Abrechnung den Fall nachvollziehen kann.
- Als **Entwickler** möchte ich einen Regressionstest, der für **jeden** AI-Purpose garantiert, dass Stub-Fallback einen Grund setzt, damit kein neuer Purpose die Lücke wieder einführt (wie latent seit PROJ-32).

## Scope — alle aktuellen AI-Purposes (13)
`risks, decisions, work_items, open_items, narrative, sentiment, coaching, trajectory_sequence, resource_swap, cross_project_links, proposal_from_context, proposal_stakeholders_from_context, proposal_risks_from_context` (Stand 2026-06-19; der Test ist datengetrieben über den `AIPurpose`-Typ, damit künftige Purposes automatisch erfasst werden).

## Acceptance Criteria
- [ ] **AC-1:** Für **jeden** der drei Stub-Auslöser — (a) kein/ungültiger Provider-Key, (b) Class-3-Block ohne lokalen Provider, (c) Provider-Fehler/-Timeout — setzt der Router einen unterscheidbaren, maschinenlesbaren `blockedReason`/Status (z. B. `no_provider` / `class3_blocked` / `provider_error`).
- [ ] **AC-2:** `ki_runs.error_message` (oder ein dediziertes Status-Feld) ist bei jedem Stub-Fallback **nicht NULL** und trägt den Grund — über **alle 13 Purposes** verifiziert.
- [ ] **AC-3:** Ein **datengetriebener Regressionstest** iteriert über den `AIPurpose`-Typ und schlägt fehl, wenn ein Purpose bei einem Stub-Auslöser keinen Grund liefert (Schutz gegen Wieder-Einführung bei neuen Purposes).
- [ ] **AC-4:** Das **UI** (AIProposalDrawer / die jeweiligen Tabs) zeigt bei leerem Stub-Ergebnis ein **actionable Banner** mit dem Grund + Handlungslink (z. B. „Provider konfigurieren" → Settings) statt einer stummen leeren Liste. Mindestens für die Drawer-basierten Purposes (Backlog/Stakeholder/Risiken) konsistent.
- [ ] **AC-5:** **Verify + Fix:** Der Test deckt zuerst auf, welche Purposes den Grund heute nicht setzen; alle aufgedeckten Lücken werden in diesem Slice geschlossen (nicht nur dokumentiert).
- [ ] **AC-6:** Ein **legitim leeres** Ergebnis (Provider lief, hatte nichts zu extrahieren) bleibt unterscheidbar von einem Block/Fehler (kein falscher „Fehler"-Reason bei echtem Leerlauf).
- [ ] **AC-7:** Class-3-Hardblock + Multi-Tenant-Invariante bleiben unverändert — dieser Slice macht den Block nur **sichtbar**, weicht ihn nie auf.

## Edge Cases
- Provider liefert teilweise (einige Items valide, Response sonst kaputt) → Reason muss „degraded" von „blocked" unterscheiden.
- Cost-Cap erreicht (PROJ-32d) → eigener Reason (`cost_cap_exceeded`), nicht generisch `provider_error`.
- Class-3-Block, aber Tenant hat Ollama konfiguriert, das gerade down ist → `provider_error` (nicht `class3_blocked`), damit der PM weiß, dass Config OK ist aber der Dienst hängt (Pilot-relevant: gehosteter Ollama).
- Mehrere Provider in Priority-Reihe scheitern nacheinander → Reason des *letzten relevanten* Fehlers, nicht nur „stub".
- Bestehende `ki_runs`-Zeilen ohne Reason (historisch) → kein Backfill nötig, nur ab jetzt garantiert.

## Technical Requirements
- Änderung primär in `src/lib/ai/` (Router/Resolver/Stub-Pfad) + die Drawer-Tabs im FE; **kein neues Dependency** erwartet.
- Reason-Werte als kleines, typisiertes Enum (kein Freitext), damit UI + Tests deterministisch mappen können.
- Keine Migration zwingend, falls `ki_runs.error_message` bereits existiert; falls ein strukturierteres Status-Feld gewünscht ist, ist das eine kleine additive Spalte (in /architecture zu klären).

## Non-Goals
- Keine AI-**Qualitäts**-Bewertung (Relevanz/Rework-Quote) — das ist die separate Eval-Harness (CIA-Slice 2, eigener Kandidat).
- Kein Retry-/Failover-Mechanismus zwischen Providern (nur **Transparenz** des Endzustands; Failover ist eine eigene Frage).
- Kein Backfill historischer `ki_runs`.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect) — 2026-06-19 (kurzer Pass)

> **Auftrag dieses Passes (aus dem Spec):** klären, ob ein strukturiertes Status-Feld / eine Migration nötig ist, und die Reason-Taxonomie festlegen. **Kein neuer Dep. CIA nicht erforderlich** (eine additive, nullable Spalte + Wiederverwendung eines bereits existierenden typisierten Enums; kein Architektur-Fork, der ≥3 künftige Skills betrifft; Class-3-Hardblock unberührt).

### Grundidee in einem Satz
Der „Warum kam nichts?"-Grund existiert bereits **typisiert am Resolver** (`BlockedReason`), wird heute aber beim `ki_runs`-Insert auf **Freitext** plattgedrückt. Wir heben einen **einzigen, persistierten, maschinenlesbaren Reason-Code** auf die `ki_runs`-Ebene und mappen ihn deterministisch ins UI — `error_message` bleibt der menschenlesbare Detailtext daneben.

### Ist-Zustand (verifiziert im Code)
- `ki_runs.status` ∈ {`success`, `error`, `external_blocked`} — existiert.
- `ki_runs.error_message` (nullable Freitext) — existiert; PROJ-88 (AC-88.3) setzt ihn beim **Block**-Pfad bereits.
- `key-resolver.ts` liefert ein **typisiertes** `BlockedReason`: `external_ai_disabled`, `class3_no_local_provider`, `no_provider_available` (+ legacy `class3_no_tenant_key`, `no_key_available`).
- **Lücken:** (a) der typisierte Grund wird nicht maschinenlesbar persistiert (nur als Freitext); (b) der **Provider-Fehler**-Pfad (Timeout/Failure NACH Provider-Wahl) und der **Cost-Cap**-Pfad erzeugen eigenen Freitext, nicht ins Enum vereinheitlicht; (c) keine Garantie/Verifikation über alle Purposes; (d) kein UI-Mapping.

### Entscheidung A — Reason-Taxonomie (ein vereinheitlichtes Enum)
Ein einziges TS-Enum `AiRunReasonCode`, das die Resolver-Reasons + die übrigen Stub-Auslöser zusammenführt:
| reason_code | Auslöser | UI-Handlung |
|---|---|---|
| `no_provider` | kein/ungültiger Key, kein Provider in der Priority-Reihe (`no_provider_available`/`no_key_available`) | „KI-Provider konfigurieren" → Settings |
| `class3_blocked` | Class-3-Daten, kein lokaler Provider (`class3_no_local_provider`/`class3_no_tenant_key`) | „Personenbezogene Daten brauchen einen lokalen Provider (Ollama) — bitte hinterlegen" → Settings |
| `provider_error` | Provider gewählt, aber Timeout/Fehler/kaputte Response | „KI-Dienst aktuell nicht erreichbar — später erneut versuchen" |
| `cost_cap_exceeded` | Monats-Token-Cap erreicht (PROJ-32d) | „Monatliches KI-Budget erreicht" → Settings/Billing |
| `external_ai_disabled` | Env-Kill-Switch `EXTERNAL_AI_DISABLED` | „KI-Funktionen sind deaktiviert" (Admin-Hinweis) |
| `null` | Provider lief, legitim leeres Ergebnis | normale Leer-Ansicht (kein Fehler-Banner) — erfüllt AC-6 |

`reason_code = null` bei `status='success'` bleibt der „legitim leer"-Fall und ist damit sauber vom Block/Fehler unterscheidbar.

### Entscheidung B — Persistenz: additive Spalte statt Freitext-Parsing
**Empfehlung: kleine additive Migration** `alter table ki_runs add column reason_code text` (nullable, `CHECK` gegen das Enum). Begründung:
- **Maschinenlesbar + queryable** für Support/Abrechnung/Eval (AC-2) — ohne fragiles `error_message`-String-Parsing.
- **Deterministisches UI-Mapping** (AC-4) statt Heuristik auf Freitext.
- `status` bleibt unverändert (success/error/external_blocked); `reason_code` verfeinert nur das **Warum** innerhalb error/blocked.
- **Kein Backfill** (AC-3/Non-Goal): nur ab jetzt garantiert; alte Zeilen bleiben `reason_code = null`.
- Additive nullable Spalte → null Risiko für bestehende Pfade; Migrationsname = Repo-Dateiname-Stamm (PROJ-134-Konvention).

> Verworfene Alternative: typisierter **Prefix in `error_message`** (`"[class3_blocked] …"`, kein Migration) — billiger, aber String-Parsing im UI ist fragil und vermischt Code+Detail; bei einem ohnehin trivialen additiven Spalten-Change nicht gerechtfertigt.

### Entscheidung C — Durchsetzung über ALLE Purposes
Der Reason wird **an einer Stelle** gesetzt: im zentralen `ki_runs`-Finalize-Helper des Routers (nicht pro Purpose) — der Router ist der einzige Eintrittspunkt (`invoke…Generation`). Damit erbt jeder bestehende und künftige Purpose den Reason automatisch. Der **datengetriebene Regressionstest** iteriert über den `AIPurpose`-Typ (nicht über eine hartkodierte Liste) und prüft pro Stub-Auslöser, dass `status≠success ⇒ reason_code ≠ null`. So kann ein neuer Purpose die Lücke nicht wieder einführen (Schutz gegen die PROJ-32-Regression).

### Entscheidung D — UI-Mapping
Eine kleine reine Mapping-Funktion `reasonCode → {Banner-Text, Handlungslink}` (FE-seitig, ein Ort), konsumiert von den Drawer-Tabs (Backlog/Stakeholder/Risiken) und perspektivisch den übrigen KI-Oberflächen. Leeres Ergebnis MIT `reason_code` → actionable Banner; leeres Ergebnis OHNE (`null`) → normale Leer-Ansicht.

### Betroffene Artefakte (Schätzung)
- `src/lib/ai/types.ts` (`AiRunReasonCode`-Enum), `src/lib/ai/router.ts` (Finalize-Helper setzt `reason_code`; Provider-Error- + Cost-Cap-Pfad ins Enum mappen), `key-resolver.ts` (Reason→Code-Mapping), 1 additive Migration, FE-Mapping-Util + Drawer-Tabs.
- Regressionstest `router.*.test.ts` (datengetrieben über `AIPurpose`).
- **Kein neues Dependency. Eine additive nullable Spalte. Class-3-Hardblock + Multi-Tenant-Invariante unberührt.**

### Handoff
`/backend` (Enum + Migration + Router-Finalize + Resolver-Mapping + datengetriebener Test) → `/frontend` (UI-Mapping + Banner in den Drawer-Tabs) → `/qa` (Verify+Fix-Nachweis über alle 13 Purposes, inkl. live gegen den gehosteten Ollama für den `class3_blocked`-vs-`provider_error`-Unterschied).

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
