# PROJ-38: Assistant Orchestrator & Intent Runtime

## Status: Planned
**Created:** 2026-05-04
**Last Updated:** 2026-05-04

## Origin
Diese Spec ist die technische Folge-Spec zu PROJ-37. Während PROJ-37 das User-erlebbare Sprachassistenten-Feature beschreibt, definiert PROJ-38 die interne Runtime-Schicht, die aus natürlicher Sprache sichere, auditierbare und plattformkonforme Aktionen macht.

## Summary
Builds the governed assistant runtime behind the user-facing voice/text assistant: session state, intent recognition, tool/command planning, confirmation gates, action execution, audit events, and response assembly. This is the layer that decides whether "Wie ist der aktuelle Stand?" becomes a read-only status query, whether "Erstelle ein Projekt ..." becomes a wizard draft, and whether an action must be blocked, confirmed, or routed to existing APIs / MCP tools. The orchestrator is explicitly not an autonomous free-form agent with write access; it is a controlled command runtime over the platform's existing domain services.

## Dependencies
- Requires: PROJ-12 (AI router + privacy classification)
- Requires: PROJ-14 (MCP bridge / tool integration philosophy)
- Requires: PROJ-17 (tenant module/setting gates)
- Requires: PROJ-37 (user-facing assistant flows and supported actions)
- Requires: PROJ-2 / 4 / 5 / 20 / 21 depending on which commands are enabled
- Influences: PROJ-39+ future agent workflows, task automation, multi-step assistant actions

## User Stories

1. **Safe intent execution** — Als Betreiber möchte ich, dass der Assistent Befehle in strukturierte Intents überführt, damit Ausführung reproduzierbar, testbar und berechtigungsbewusst bleibt.

2. **Guarded write actions** — Als Nutzer möchte ich, dass kritische Aktionen erst nach Bestätigung ausgeführt werden, damit der Assistent nichts versehentlich verändert.

3. **Tool-aware orchestration** — Als Engineer möchte ich, dass der Assistent vorhandene APIs und MCP-Tools orchestriert statt Business-Logik zu duplizieren, damit die Plattform konsistent bleibt.

4. **Auditable assistant behavior** — Als Auditor/Admin möchte ich nachvollziehen können, welcher Assistant-Intent erkannt, welche Tools aufgerufen und welche Ergebnisse erzeugt wurden, damit die Steuerung transparent bleibt.

5. **Recoverable conversations** — Als Nutzer möchte ich bei unklaren oder mehrdeutigen Befehlen Rückfragen bekommen statt still falsche Aktionen, damit die Assistenz vertrauenswürdig bleibt.

## Acceptance Criteria

### A. Intent Runtime
- [ ] Ein zentraler Assistant-Orchestrator existiert, z. B. `assistantRuntime.handleTurn(...)`.
- [ ] Eingaben werden in strukturierte Intents klassifiziert, mindestens:
  - `project_status_query`
  - `project_open`
  - `project_create_draft`
  - `navigate_to_area`
  - `report_summary_query`
  - `unknown / needs_clarification`
- [ ] Intent-Klassifikation trennt klar zwischen read-only, navigation, draft/write-intent.
- [ ] Jeder Turn liefert ein strukturiertes Ergebnis: `recognized_intent`, `requires_confirmation`, `tool_calls`, `user_response`.

### B. Confirmation + Policy Gates
- [ ] Read-only-Intents dürfen ohne zusätzliche Bestätigung ausgeführt werden.
- [ ] Schreibende Intents führen nie direkt zur Mutation produktiver Daten ohne Review/Bestätigung.
- [ ] Runtime prüft vor jeder Ausführung:
  - Auth/User vorhanden
  - Tenant-Kontext vorhanden
  - Rechte/Rollen ausreichend
  - Modul/Feature aktiv
  - Privacy-/provider-policy zulässig
- [ ] Bei Policy-Verletzung antwortet der Assistent erklärend statt still zu scheitern.

### C. Tool / API Orchestration
- [ ] Runtime ruft keine verdeckten Sonderpfade auf, sondern bestehende APIs, Wizard-Flows oder MCP-Tools.
- [ ] Tool-Aufrufe werden als strukturierter Plan modelliert (`steps[]` oder ähnlich), auch wenn MVP meist nur 1 Schritt ausführt.
- [ ] Bei mehrdeutigen Projektreferenzen ("Projekt Apollo") wird vor dem Tool-Aufruf disambiguiert.
- [ ] Navigation-Intents liefern sowohl eine gesprochene/textuelle Antwort als auch eine UI-Navigation.

### D. Session Context
- [ ] Runtime hält per Sitzung einen kontrollierten Kontext:
  - aktueller Tenant
  - aktuelles Projekt
  - letzte Rückfrage
  - letzter bestätigungspflichtiger Intent
- [ ] Kontext ist explizit modelliert, nicht nur im freien Prompt versteckt.
- [ ] Kontext kann invalidiert werden bei Logout, Tenant-Wechsel, Projektwechsel.

### E. Audit + Observability
- [ ] Jeder Assistant-Turn kann protokolliert werden mit:
  - user_id
  - tenant_id
  - project_id (falls vorhanden)
  - recognized_intent
  - confirmation_state
  - executed_tools
  - result_status
- [ ] Fehlgeschlagene oder blockierte Ausführungen werden ebenfalls auditierbar erfasst.
- [ ] Logs/Audit dürfen keine unnötigen Class-3-Rohdaten persistieren.

## Edge Cases
- **Intent unsicher** → Runtime fragt nach statt zu raten.
- **Projektname mehrfach vorhanden** → Auswahlfrage statt direkter Ausführung.
- **User bestätigt nicht** → pending action verfällt kontrolliert.
- **Tool/API liefert Fehler** → Assistant formuliert verständliche Rückmeldung und belässt System in konsistentem Zustand.
- **Freitext enthält mehrere Aufträge gleichzeitig** → Runtime nimmt nur den klarsten Intent oder fordert Auftrennung an.

## Technical Requirements
- **Architecture:** eigener Orchestrator-Layer zwischen UI/voice frontend und domain APIs
- **Execution:** MCP-first where suitable; otherwise existing typed APIs
- **Privacy:** Intent classification + response generation müssen mit PROJ-12/32 kompatibel sein
- **Testing:** Unit-Tests für intent mapping + policy gates; integration tests for command execution plans
- **Determinism:** kritische Guards und Confirmation-Logik dürfen nicht rein promptbasiert sein

## Out of Scope
- Mehrstufige autonome Agent-Pläne über mehrere Minuten
- Hintergrundjobs, die später ohne Nutzerinteraktion weiterlaufen
- generische "Computer Use"-Steuerung außerhalb der Plattform
- Cross-system execution in third-party tools without explicit later spec

## Suggested Slice Plan
- **38-α Intent Schema + Session Context**
- **38-β Policy Gates + Confirmation Runtime**
- **38-γ Tool / API Execution Planner**
- **38-δ Audit / Observability / Replayability**

## Relationship to PROJ-37
- PROJ-37 beschreibt das Produktfeature "Voice Assistant" aus Nutzersicht.
- PROJ-38 beschreibt die technische Runtime, die diese Assistenz sicher macht.
- PROJ-37 kann ohne PROJ-38 nicht sauber umgesetzt werden, wenn Aktionen über bloße Chat-Antworten hinausgehen.

