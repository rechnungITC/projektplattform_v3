# PROJ-30: KI-Narrative-Purpose Erweiterung des AI-Routers

## Status: Planned
**Created:** 2026-05-01
**Last Updated:** 2026-05-01

## Summary
Schließt eine bewusst-deferred Lücke aus PROJ-21 (Output Rendering): heute returnt `POST /api/projects/[id]/snapshots/preview-ki` einen **templated Stub-Text** mit `provider="stub"` — der PROJ-12 AI-Router ist purpose-typed für `risks` und kann (noch) keinen narrative-Text erzeugen.

PROJ-30 macht den Router **multi-purpose-fähig**, ohne die bestehende Risk-Generierung anzufassen:
- Neuer `AIPurpose = "risks" | "narrative"` Typ.
- Neuer Auto-Context-Builder + Klassifikator für Narratives, der **keine personenbezogenen Felder** (lead_name, sponsor_name, responsible_user_id) in den Prompt aufnimmt — Class-3-Schutz by-design.
- Provider-Interface vom heutigen `AIRiskProvider` zu einem generischen `AIProvider` mit zwei optionalen Methoden (`generateRiskSuggestions`, `generateNarrative`); Anthropic-Provider implementiert beide.
- Router-Funktion `invokeNarrativeGeneration` extrahiert die heute in `invokeRiskGeneration` enthaltene Tenant-Override-Logik + Provider-Selection in shared helpers (`loadTenantOverrides`, `selectProvider`, `insertKiRun`).
- API-Route `preview-ki` ruft den echten Router; Stub bleibt nur als Fallback bei Provider-Error oder Class-3-Defense-in-Depth.

Reine Code-Slice. **Keine DB-Migration, kein Schema-Delta** — `ki_runs.purpose` ist bereits text und akzeptiert den neuen Wert. Multi-Provider-Aspekt (Tenant-eigene Keys für Anthropic / OpenAI / Ollama / Google) bleibt der separaten PROJ-32-Spec überlassen; PROJ-30 V1 nutzt den platform-default Anthropic-Key.

## Dependencies
- **Requires:** PROJ-12 (AI-Router + `ki_runs`-Tabelle + `data-privacy-registry`); PROJ-21 (Output Rendering — `/api/projects/[id]/snapshots/preview-ki`-Route, KI-Modal, frontend-side `kiNarrativeEnabled`-Flag).
- **Influences:** PROJ-32 (Multi-Provider Tenant-Keys — wird `invokeNarrativeGeneration` über Tenant-Provider-Lookups erweitern); PROJ-33 (Adaptive Dialog — wird einen dritten Purpose `interview` auf demselben Pattern aufsetzen, das hier validiert wird).

## V2 Reference Material
- V2 hatte keinen narrative-purpose. Dies ist V3-spezifisch, getrieben durch PROJ-21's Status-Report + Executive-Summary "Aktueller Stand"-Sektion und das KI-Kurzfazit-Feature-Flag (`tenant_settings.output_rendering_settings.ki_narrative_enabled`).
- V2-ADR `data-privacy-classification.md` (in V3 unter `docs/decisions/`) — Class-3-Hard-Block-Regel bleibt absolut, gilt auch für narrative.

## User Stories

- **Als Projektleiter:in mit aktiviertem KI-Kurzfazit** möchte ich beim Status-Report-Erzeugen einen **echten KI-generierten 3-Sätze-Vorschlag** sehen statt eines templated Platzhalters, damit das Kurzfazit den tatsächlichen Projektstand widerspiegelt und ich mit minimaler Bearbeitung publizieren kann.
- **Als Tenant-Admin** möchte ich, dass die KI-Narrative-Funktion **keine personenbezogenen Felder** (Lead-Name, Sponsor-Name, Responsible-User) an den externen Provider sendet, damit DSGVO-Konformität erhalten bleibt — auch wenn diese Felder im Status-Report selbst sichtbar sind (rendering ≠ context).
- **Als Tenant-Admin mit Class-3-Hard-Block** möchte ich, dass selbst eine fehlerhafte Klassifikation (z.B. ein neuer Class-3-Datentyp wird nicht erkannt) den narrative-Pfad zwingend auf den lokalen Provider routet — und falls keiner konfiguriert ist, auf den Stub-Text fällt, statt extern zu senden. **Defense-in-Depth**.
- **Als Engineer:in im Team** möchte ich, dass die Provider-Schnittstelle generisch wird (statt hartcodiert für Risks), damit zukünftige Purposes (PROJ-33 Interview, ggf. PROJ-37 Layout-Generierung) ohne Provider-Neuimplementierung andocken können.
- **Als QA / Operations** möchte ich, dass jeder narrative-Aufruf in `ki_runs` mit `purpose='narrative'`, Token-Counts, Klassifikation, Provider, Status protokolliert wird, damit ich Cost-Tracking + Anomalie-Erkennung machen kann.
- **Als Frontend-Entwickler:in** möchte ich, dass das KI-Modal beim Provider-Error nicht crasht, sondern einen Fallback-Text + erklärende Fehlermeldung zeigt, damit der User die Snapshot-Erzeugung abschließen oder den Text manuell tippen kann.

## Acceptance Criteria

### Block A — AI-Type-System Erweiterung
- [ ] `src/lib/ai/types.ts` (oder `src/types/ki.ts`, je nachdem wo's heute lebt — `/architecture` lockt) erweitert um:
  - `AIPurpose = "risks" | "narrative"` (Union-Type, kein DB-Schema-Delta — `ki_runs.purpose` bleibt `text`).
  - `NarrativeAutoContext` Interface: `{ project: { name, project_type, project_method, lifecycle_status, planned_start, planned_end }, phases_summary: { total, by_status }, top_risks: [{ title, score, status }] (max 3), top_decisions: [{ title, decided_at }] (max 3), upcoming_milestones: [{ name, target_date, status }] (max 3), backlog_counts: { by_kind, by_status }, kind: "status_report" | "executive_summary" }`. **Keine** `lead_name`, **keine** `sponsor_name`, **keine** `responsible_user_id`-Felder — strikt Class-1/2.
  - `NarrativeGenerationOutput` Interface: `{ text: string, usage: ProviderUsage }`.
  - `RouterNarrativeResult` Interface (analog `RouterRiskResult`): `{ run_id, classification, provider, model_id, status, text, external_blocked }`.

### Block B — Provider-Interface-Refactor
- [ ] `AIRiskProvider` umbenannt zu `AIProvider` (oder neue Schnittstelle, alter Name als deprecated alias) mit zwei **optionalen** Methoden:
  - `generateRiskSuggestions(context, count): Promise<RiskGenerationOutput>` — bisheriges Verhalten, default-throw wenn nicht implementiert.
  - `generateNarrative(context: NarrativeAutoContext): Promise<NarrativeGenerationOutput>` — neu, default-throw wenn nicht implementiert.
- [ ] `src/lib/ai/providers/anthropic.ts` implementiert **beide** Methoden. Anthropic-Provider behält den Risks-Code-Pfad unverändert (Backward-Compat) und ergänzt narrative.
- [ ] `src/lib/ai/providers/stub.ts` (oder wo auch immer der Stub lebt) implementiert beide; narrative-Stub ist genau der heutige preview-ki-Fallback-Text (oder eine prompt-spezifische Variante).
- [ ] `src/lib/ai/providers/ollama.ts` (heute oft `throws "not implemented"`) bleibt unverändert für narrative — wirft weiterhin, **aber** der Router fängt den Throw und fällt auf Stub.

### Block C — Router-Erweiterung
- [ ] Neue Funktion `invokeNarrativeGeneration(args)` exportiert aus `src/lib/ai/router.ts`:
  - Args: `{ supabase, tenantId, projectId, actorUserId, context: NarrativeAutoContext }`.
  - Returns: `Promise<RouterNarrativeResult>`.
  - Schritte:
    1. Tenant-Overrides laden (`loadTenantOverrides`).
    2. `classifyNarrativeAutoContext(context, tenantDefault)` — gibt `1 | 2 | 3` zurück (siehe Block D).
    3. **Defense-in-Depth Class-3-Check**: wenn `classification === 3` und keine local-Provider-Konfig vorhanden → return `{ status: "external_blocked", text: <stub-fallback>, ... }` ohne Provider-Aufruf.
    4. `selectProvider(classification, tenantConfig)` — gleiche Logik wie Risks.
    5. `ki_runs`-Insert mit `purpose='narrative'`, `status='success'` (optimistic).
    6. Provider-Aufruf — bei Throw: `ki_runs`-Update auf `status='error'` + Stub-Fallback-Text in Response.
    7. Bei Success: `ki_runs`-Update mit Token-Counts + `output_payload`.
- [ ] Shared Helpers extrahiert (sofern heute inline in `invokeRiskGeneration`): `loadTenantOverrides(supabase, tenantId)`, `selectProvider(classification, providerConfig)`, `insertKiRun(supabase, args)`, `updateKiRunStatus(supabase, runId, fields)`.
- [ ] **Bestehende `invokeRiskGeneration` bleibt funktional** (alle PROJ-12-Tests grün, kein Verhaltens-Delta).

### Block D — Auto-Context-Builder
- [ ] `src/lib/ai/auto-context.ts` (oder `lib/reports/aggregate-snapshot-data.ts`-adjacent) bekommt neue Funktion `buildNarrativeAutoContext({ supabase, projectId, kind })` die `NarrativeAutoContext` zurückgibt.
- [ ] **Strikt Class-1/2-Felder** — der Builder darf grundsätzlich keine Felder aus der `data-privacy-registry` lesen, die als Class-3 markiert sind. Konkret: keine `responsible_user_id`-Joins zu `profiles`, keine Stakeholder-Namen. Risks-Liste enthält `title + score + status` (Class-2), nicht `responsible_user_id`.
- [ ] `classifyNarrativeAutoContext(context, tenantDefault)` per default returnt `2` (alle eingehenden Felder sind Class-2). Wenn der Context aus irgendeinem Grund Class-3-Indikatoren enthält (z.B. Ad-hoc-Erweiterung in Zukunft) → `3`, was den external-block-Pfad triggert.

### Block E — preview-ki-Route Umstellung
- [ ] `src/app/api/projects/[id]/snapshots/preview-ki/route.ts` ruft `buildNarrativeAutoContext` + `invokeNarrativeGeneration`.
- [ ] Response-Shape `PreviewKiResponse` bleibt identisch (`{ text, classification, provider }`) — Frontend-Modal-Code bleibt unangetastet.
- [ ] **Graceful Provider-Error-Fallback**: wenn `invokeNarrativeGeneration` throws (Network-Error, Auth-Error etc.) — Route returnt 200 mit `{ text: <stub-text>, classification: 2, provider: "stub" }` + console.warn-Breadcrumb. **Keine 5xx**, weil das Frontend-Modal sonst die UX abbricht; der User kann den Text händisch verfeinern.
- [ ] Tenant-Flag `output_rendering_settings.ki_narrative_enabled` bleibt 403-Gate vor jedem narrative-Aufruf (heute schon implementiert).

### Block F — Class-3-Defense-in-Depth Tests
- [ ] Vitest-Test: wenn `classifyNarrativeAutoContext` mocked-returnt `3`, **kein** Provider-Aufruf passiert (Provider-Mock wird nie aufgerufen), `ki_runs.status='external_blocked'` geschrieben, Response enthält Stub-Text.
- [ ] Vitest-Test: wenn `classifyNarrativeAutoContext` mocked-returnt `2` und kein Class-3-Indikator im Context, Provider wird aufgerufen, `ki_runs` zeigt `external_blocked=false`.

### Block G — Vitest-Coverage
- [ ] Router happy path (classification=2 → Anthropic-Mock → success → text returned, ki_runs zweimal updated).
- [ ] Router Class-3-Block (siehe Block F).
- [ ] Router Provider-Error-Fallback (Provider-Mock throws → ki_runs.status='error' → Response 200 mit Stub-Text).
- [ ] `classifyNarrativeAutoContext`-Tests (5+ Cases: leerer Context, vollständiger Class-2-Context, Context mit hypothetischem Class-3-Feld, etc.).
- [ ] `buildNarrativeAutoContext`-Tests (mocked Supabase: Phasen + Risiken + Decisions + Milestones + Backlog-Counts werden korrekt aggregiert; max-3-Limit auf den Listen).
- [ ] preview-ki-Route-Test (existierende Tests aus PROJ-21 müssen weiter grün sein; +1 Test für graceful-fallback bei Provider-throw).

### Block H — Keine ki_suggestions-Inserts für narrative
- [ ] Narrative ist **transient** — der Text wird nicht in `ki_suggestions` persistiert. Wenn der User den Text editiert + den Snapshot speichert, landet der finale Text in `report_snapshots.content.ki_summary` (PROJ-21-Verhalten unverändert).
- [ ] Dokumentiert im Tech Design: warum nicht persistiert (kein Accept/Reject-Workflow wie bei Risks; jeder Render erzeugt ggf. neuen Vorschlag).

### Block I — Audit / Observability
- [ ] `ki_runs` Inserts/Updates für narrative enthalten: `purpose='narrative'`, `classification`, `provider`, `model_id`, `status`, `input_tokens`, `output_tokens`, `latency_ms`, `external_blocked`.
- [ ] Console-Breadcrumbs: `[PROJ-30] narrative generation` mit `{ run_id, classification, provider, status, latency_ms }` — picked up by Vercel runtime logs / Sentry transport.
- [ ] **Kein** neues PII in den Logs (kein User-Name, keine Project-Detail-Texte; nur IDs + Counts + Timestamps).

## Edge Cases

- **Provider-Quota-Exceeded** (z.B. Anthropic returnt 429) — Router fängt den Throw, schreibt `ki_runs.status='quota_exceeded'`, Response mit Stub + `provider="stub"`. UI zeigt KI-Modal-Error-Fallback wie heute.
- **Tenant ohne `ai_provider_config.external_provider`** (`= "none"`) — narrative-Pfad → Stub-Text mit `provider="stub"`. `ki_runs.status='external_blocked'` (kein external Provider verfügbar).
- **Tenant mit `external_provider="anthropic"` aber ohne `ANTHROPIC_API_KEY` Platform-Env** — Provider-Init throws → Router fängt → Stub-Fallback. Logs zeigen die Ursache.
- **Sehr großes Project** (50+ Risiken, 200+ Work-Items) — Auto-Context wird trotzdem auf max-3-Listen + Counts begrenzt, Token-Budget bleibt < 2 KB.
- **`ki_narrative_enabled=false`** — preview-ki returnt 403 `ki_narrative_disabled` (heute schon, bleibt unverändert).
- **Concurrent preview-ki-Calls** — jeder bekommt eigenen `ki_runs`-Eintrag mit eigenem `run_id`. Keine Sperren, keine Idempotenz nötig (transient).
- **Anthropic-API liefert leeren Text** (z.B. nur Whitespace) — Router behandelt das wie Provider-Error → Stub-Fallback.
- **Project hat noch keine Phasen/Risiken/Decisions** (frischer Wizard-Output) — `NarrativeAutoContext` zeigt leere Listen + Counts=0; KI generiert generischen "Projekt im Aufbau"-Text. Stub-Fallback ist optisch ähnlich.
- **Class-3-Indikator eingeschmuggelt in Context** (z.B. Ad-hoc-Code-Änderung packt versehentlich `responsible_user_id` rein) — `classifyNarrativeAutoContext` erkennt es per Whitelist-Check der erlaubten Felder; Override-Pfad → Stub-Fallback statt external. Defense-in-Depth.
- **Provider-Latency > 10 s** — Console-warn-line `[PROJ-30] narrative slow` mit `latency_ms`. Kein Hard-Timeout in V1 (Modal blockiert UI sowieso); Async-Variante eventuell PROJ-30b.

## Technical Requirements

- **Stack:** Next.js 16 + Vercel AI SDK + `@ai-sdk/anthropic`. Keine neuen npm-Pakete für V1 (alle bereits installiert).
- **Multi-tenant:** Router liest `tenant_settings.ai_provider_config` per Tenant. Class-3-Routing bleibt absolut.
- **Performance:** narrative-Generation 2–5 s typisch (Anthropic Claude Opus mit ~150-Token-Output). Hard-Timeout-Limit konfiguriert in `/architecture` (z.B. 15 s, danach Stub-Fallback).
- **Security:** Class-3-Hard-Block via Whitelist-Klassifikator. Keine personenbezogenen Felder im Auto-Context. KI-Output wird in PROJ-21 vom User editierbar gemacht (nicht 1:1 publiziert).
- **Audit:** `ki_runs` mit `purpose='narrative'`. Bestehende RLS-Policies aus PROJ-12 bleiben.
- **Browser-Support:** N/A — server-side AI-Aufruf, kein Client-Code.
- **Multi-Provider:** **out of scope für V1**. PROJ-30 läuft mit platform-default Anthropic-Key. PROJ-32 erweitert auf tenant-eigene Keys + OpenAI/Google. Refactor-Pfad: `selectProvider` wird in PROJ-32 erweitert um Tenant-Custom-Lookups; PROJ-30-Tests bleiben grün.

## Out of Scope (deferred or explicit non-goals)

- **Multi-Provider-Routing** (Tenant-eigene Anthropic/OpenAI/Ollama/Google-Keys, Fallback-Reihenfolge, Test-Connection-UI) — PROJ-32.
- **Skills/Tool-Use-System** (cross-provider tool registry) — PROJ-39.
- **Interview/Dialog-Purpose** (`interview` als dritter `AIPurpose`) — PROJ-33.
- **KI-Suggestion-Persistierung für narrative** (Accept/Reject-Workflow) — narrative ist transient by design.
- **Caching** von Narratives (`content.ki_summary` ist die Persistierung-Schicht).
- **Async-Render** für sehr lange Narratives — PROJ-30b falls benötigt.
- **Multi-Language-Narratives** (V1 ist DE-only entsprechend dem Projekt-Sprach-Default).
- **Tenant-Override-UI** für narrative-Prompt-Templates ("unser Tenant will den 4-Sätze-Stil") — PROJ-X später wenn Bedarf.
- **Narrative für andere Snapshot-Kinds** (`backlog_snapshot`, Gantt-Export) — gehört zu PROJ-21b/c, nicht hier.

## Suggested locked design decisions for `/architecture`

1. **Router-Helper-Refactor-Granularität**
   - **A.** Drei separate Helper extrahieren: `loadTenantOverrides`, `selectProvider`, `insertKiRun` + `updateKiRunStatus`. Beide Router-Funktionen (Risks + Narrative) konsumieren sie.
   - B. Eine zentrale `runAi(purpose, context, providerCallback)`-Funktion baut alle Pre/Post-Steps drumherum.
   - **Empfehlung A** — drei kleine Helper sind testbarer + weniger generisch-magisch.

2. **Provider-Interface-Migration**
   - **A.** `AIRiskProvider` umbenennen zu `AIProvider`, beide Methoden optional. Bestehende Implementations-Klassen erben weiter.
   - B. Komplett neuer `AIProvider`-Type, `AIRiskProvider` als deprecated alias.
   - **Empfehlung A** — kleinster Diff, kein API-Bruch.

3. **Stub-Text-Quelle**
   - **A.** Heutiger preview-ki-Stub-Text wird zu `src/lib/ai/providers/stub.ts:generateNarrative`. Ein zentraler Ort für den Fallback.
   - B. Stub-Text bleibt inline in der API-Route und wird vom Router nur als Provider-Error-Path getriggert.
   - **Empfehlung A** — DRY und testbar.

4. **`classifyNarrativeAutoContext`-Logik**
   - **A.** Whitelist-basiert: nur Felder aus einer expliziten Class-1/2-Liste werden akzeptiert; alles andere → Class-3.
   - B. Blacklist-basiert: jedes Feld, das in der `data-privacy-registry` als Class-3 markiert ist, triggert Class-3.
   - **Empfehlung A** — Defense-in-Depth. Whitelist scheitert sicher (zu strikt), Blacklist scheitert unsicher (vergessenes Feld).

5. **`ki_runs.purpose`-Schema**
   - **A.** Bleibt `text`-Spalte, kein DB-Constraint. Code-Whitelist (`AIPurpose` TS-Type).
   - B. Migration mit CHECK-Constraint `purpose IN ('risks', 'narrative')`.
   - **Empfehlung A** — kein Schema-Delta für PROJ-30, Constraint kann später ergänzt werden wenn `interview`-Purpose (PROJ-33) landet und das Set stabilisiert ist.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-05-02 · **Author:** /architecture skill
> **Audience:** PM + dev team. No code blocks; structural references only.

### 0. Why this is its own spec (and not a PROJ-21-Patch)

PROJ-21 ist als reine UI/Render-Slice deployed; das KI-Feature ist hinter einem Tenant-Flag und der `preview-ki`-Route ist ein bewusster Stub mit `provider="stub"`. PROJ-30 ist **Backend-only** (kein Frontend-Touch außer der API-Route, die unverändertes Response-Shape liefert), berührt **PROJ-12-Router-Architektur** (Provider-Interface-Refactor), und hat eigene Risiko-Klasse (Class-3-Defense-in-Depth, Provider-Error-Handling). Eigener Spec macht das QA-Trackbar und liefert klare Migrations-Punkte für die nächsten KI-Purposes (PROJ-33 Interview).

### 1. What gets built (component view)

```
PROJ-30
+-- AI-Type-System Erweiterung (Single Source of Truth)
|   +-- src/lib/ai/types.ts
|       +-- AIPurpose Union: "risks" | "narrative"   (ersetzt heutiges hartcodes "risks"-Literal an einem Ort)
|       +-- NarrativeAutoContext  Interface          (Class-1/2-strikt; KEINE personenbezogenen Felder)
|       +-- NarrativeGenerationOutput Interface      ({ text, usage })
|       +-- RouterNarrativeResult Interface          (analog RouterRiskResult)
|
+-- Provider-Interface-Refactor
|   +-- src/lib/ai/providers/types.ts
|   |   +-- AIRiskProvider          (heute) → bleibt als Type-Alias deprecated
|   |   +-- AIProvider              (neu, generisch) mit beiden Methoden optional
|   +-- src/lib/ai/providers/anthropic.ts
|   |   +-- AnthropicRiskProvider   → AnthropicProvider (rename) mit generateNarrative
|   +-- src/lib/ai/providers/stub.ts
|   |   +-- StubRiskProvider        → StubProvider mit generateNarrative
|   +-- src/lib/ai/providers/ollama.ts
|       (unverändert; throws "not implemented" für narrative)
|
+-- Router-Refactor + Erweiterung
|   +-- src/lib/ai/router.ts
|       +-- shared helper: loadTenantOverrides(supabase, tenantId)
|       +-- shared helper: selectProvider(classification, providerConfig)
|       +-- shared helper: insertKiRun(supabase, args)
|       +-- shared helper: updateKiRunStatus(supabase, runId, fields)
|       +-- invokeRiskGeneration  (refactored — nutzt shared helpers)
|       +-- invokeNarrativeGeneration  (NEU)
|
+-- Classifier
|   +-- src/lib/ai/classify.ts
|       +-- classifyNarrativeAutoContext(ctx, tenantDefault)
|           Whitelist-basiert: nur explizit erlaubte Felder pro Class-Stufe; alles andere → 3
|
+-- Auto-Context-Builder
|   +-- src/lib/ai/auto-context.ts
|       +-- buildNarrativeAutoContext({ supabase, projectId, kind })
|           SELECTs aus projects/phases/risks/decisions/milestones/work_items;
|           strikt KEIN responsible_user_id → profiles join
|
+-- API-Route Umstellung
|   +-- src/app/api/projects/[id]/snapshots/preview-ki/route.ts
|       (von Stub auf invokeNarrativeGeneration; Response-Shape unverändert;
|        Provider-Error → 200 mit Stub-Text + Sentry breadcrumb)
|
+-- Tests
    +-- src/lib/ai/classify.test.ts          (extend: narrative classifier cases)
    +-- src/lib/ai/router.test.ts            (extend: narrative happy path + class-3 + provider-error)
    +-- src/lib/ai/auto-context.test.ts      (NEU: narrative builder mocked-Supabase)
    +-- src/app/api/.../preview-ki/route.test.ts  (NEU oder extend; route-level mocked router call)
```

### 2. Data model in plain language

**Keine neuen Tabellen, keine neuen Spalten, keine Migration.**

- `ki_runs.purpose` ist heute eine `text`-Spalte ohne CHECK-Constraint. Der neue Wert `"narrative"` wird einfach geschrieben — kein Schema-Delta.
- `ki_suggestions` wird **nicht** befüllt für narrative-Aufrufe (transient by design — der finale Text landet in `report_snapshots.content.ki_summary` über die PROJ-21-Schiene).
- `tenant_settings.ai_provider_config` (heute schon Tenant-scoped) wird wie bei Risks gelesen — kein Delta. Multi-Provider-Erweiterung (eigene Tenant-Keys für OpenAI/Google) bleibt PROJ-32.

Im **TypeScript-Type-System** entsteht das Hauptdelta:
- Eine **Whitelist** der erlaubten `NarrativeAutoContext`-Felder lebt im Classifier. Sie ist die zentrale Schutzschicht: was dort nicht steht, wird automatisch als Class-3 klassifiziert und triggert den external-block-Pfad.
- Der `AIProvider`-Type wird breiter (statt `AIRiskProvider`), aber bleibt rückwärtskompatibel über einen Deprecated-Alias.

### 3. Tech decisions (the why)

| Entscheidung | Wahl | Grund |
|---|---|---|
| **Helper-Refactor-Granularität** | Drei separate Helpers (`loadTenantOverrides`, `selectProvider`, `insertKiRun` + `updateKiRunStatus`) | Spec § Decision 1. Drei kleine Helpers sind testbarer und expliziter als eine `runAi(...)`-Generic-Wrapper-Funktion. Beide Router-Funktionen (Risk + Narrative) konsumieren sie. |
| **Provider-Interface-Migration** | `AIRiskProvider` umbenannt zu `AIProvider`, beide Methoden optional, Deprecated-Alias bleibt | Spec § Decision 2. Kleinster Diff, kein API-Bruch für Bestand-Code (Ollama, Stub-Risk). |
| **Stub-Text-Quelle** | Stub-Text wird in `StubProvider.generateNarrative` zentralisiert | Spec § Decision 3. DRY und unit-testbar. Heutige preview-ki-Route enthält den Text inline; das wird der zentrale Ort. |
| **Classifier-Logik** | **Whitelist**: nur explizit erlaubte Felder werden als Class-1/2 akzeptiert; alles andere → Class-3 | Spec § Decision 4. Defense-in-Depth: Whitelist scheitert sicher (zu strikt → Stub-Fallback), Blacklist scheitert unsicher (vergessenes Feld leakt). Bei jeder Erweiterung des `NarrativeAutoContext` muss bewusst die Whitelist mitgepflegt werden. |
| **`ki_runs.purpose`-Schema** | Bleibt `text` ohne CHECK-Constraint; Code-Whitelist via TS-Union-Type | Spec § Decision 5. Kein Schema-Delta für PROJ-30. Bei stabilem Purpose-Set (PROJ-33 ist nächster Konsument) kann ein CHECK-Constraint später ergänzt werden. |
| **AI SDK Strategie** | Vercel AI SDK direkt, **kein** Vercel AI Gateway | Spec wiederholt; Class-3-Routing-Lock-In + DSGVO-Daten-Pfad-Risiko durch Gateway. Direkt-SDK behält volle Kontrolle. |
| **Provider-Error-Handling** | Route returnt 200 mit Stub-Text statt 5xx | UX-Vertrag: das KI-Modal soll nicht crashen wenn Anthropic ausfällt. Stub-Text ist produktiv-tauglich; User editiert sowieso vor Speichern. `ki_runs.status='error'` macht das Audit-trackbar. |
| **Auto-Context-Builder-Lokation** | Eigene Funktion in `src/lib/ai/auto-context.ts` (existiert bereits für Risks) | Trennt "Daten holen" von "AI rufen"; testbar mit Mocked-Supabase ohne Provider-Mock. |
| **Class-3-Block für narrative ohne lokalen Provider** | Stub-Fallback; KEIN external-Aufruf, auch wenn API-Key da | Class-3-Hardlock-Regel ist absolut (PROJ-12 ADR). `ki_runs.status='external_blocked'`. |
| **Hard-Timeout** | Kein Hard-Timeout in V1 | Provider-SDK hat eigenes Default (~60s). Modal blockiert UI ohnehin; sobald Pilot-Daten kommen kann ein Server-Side-Timeout in `/qa`-Folge ergänzt werden. |
| **Token-Budget** | Auto-Context max ~2 KB Prompt, max 200 Tokens Output | Klein genug für $0.0001-Größe pro Aufruf bei Anthropic Opus. Cost-Tracking per `ki_runs` (PROJ-32d folgt). |

### 4. Public API

**Keine neuen HTTP-Endpoints.** Bestehende Route bleibt:
- `POST /api/projects/[id]/snapshots/preview-ki` — Body `{ kind: "status_report" | "executive_summary" }`, Response `{ text, classification, provider }`. Der **Inhalt** ändert sich (text aus AI statt Stub; provider="anthropic"|"stub"); das **Shape** bleibt.

**Neuer öffentlicher Code-Export:** `invokeNarrativeGeneration(args)` aus `src/lib/ai/router.ts`. Wird heute nur von der preview-ki-Route konsumiert; PROJ-33 (Interview-Purpose) baut darauf ein analoges `invokeInterviewGeneration` auf demselben Pattern.

### 5. Migration plan

PROJ-30 ist eine reine Code-Migration in 4 Phasen. Keine DB-Schritte.

**Phase 1 — Type-System + Classifier:**
1. `AIPurpose` Union erweitern. `NarrativeAutoContext` + `NarrativeGenerationOutput` + `RouterNarrativeResult` definieren.
2. `classifyNarrativeAutoContext` schreiben (Whitelist, return Class 1|2|3).
3. Vitest-Cases für classifier (5+ Cases).

**Phase 2 — Provider-Interface-Refactor:**
1. `AIRiskProvider` zu `AIProvider` umbenennen (Type-Alias bleibt).
2. `AnthropicRiskProvider` → `AnthropicProvider`-Klasse, ergänzt `generateNarrative`.
3. `StubRiskProvider` → `StubProvider`, ergänzt `generateNarrative` mit dem heute in der Route inline-Text.
4. `OllamaRiskProvider` Klasse: für narrative kann eine `throws "not implemented"` ergänzt werden, oder die Methode bleibt absent. Beide gleich.
5. Bestehende Tests für Risk-Provider müssen grün bleiben.

**Phase 3 — Router:**
1. `loadTenantOverrides`, `selectProvider`, `insertKiRun`, `updateKiRunStatus` als interne Helpers extrahieren (heute sind sie inline im `invokeRiskGeneration`).
2. `invokeRiskGeneration` refactoren um die Helpers zu nutzen — kein Verhaltensdelta.
3. `invokeNarrativeGeneration` schreiben (gleiche Schritte wie Risks: Klassifikation, Provider-Selection, Class-3-Block, ki_runs-Insert, Provider-Aufruf, ki_runs-Update). **Kein** ki_suggestions-Insert.
4. Vitest-Cases (Happy, Class-3-Block, Provider-Error-Fallback).

**Phase 4 — Auto-Context + Route:**
1. `buildNarrativeAutoContext({ supabase, projectId, kind })` schreiben — analog zur bestehenden Risks-Auto-Context-Funktion. SELECTs aus projects (ohne responsible_user_id-Join), phases, risks (top-3 by score), decisions (latest 3), milestones (next 3 by target_date), work_items (counts).
2. preview-ki-Route umstellen: holt Tenant-Flag (bleibt), ruft `buildNarrativeAutoContext` + `invokeNarrativeGeneration`, returnt `{ text, classification, provider }`. Provider-Error → 200 mit Stub.
3. Vitest-Test für Route + Auto-Context-Builder.

### 6. What changes outside PROJ-30 (nichts Neues, nur Refactor + 1 Route)

- **`src/lib/ai/router.ts`** — Helpers extrahiert; bestehende `invokeRiskGeneration` ruft sie jetzt; **kein User-sichtbares Verhaltensdelta** für Risks.
- **`src/lib/ai/providers/anthropic.ts` + `stub.ts`** — Klassen umbenannt + neue Methode. Bestehender Risk-Code-Pfad in den Klassen unverändert.
- **`src/lib/ai/providers/types.ts`** — Interface-Erweiterung. Deprecated-Alias `AIRiskProvider = AIProvider` damit existierende Imports nicht brechen.
- **`src/app/api/projects/[id]/snapshots/preview-ki/route.ts`** — Stub-Body weg, echter Router-Aufruf rein. Response-Shape unverändert. Frontend (KI-Modal) bleibt unangetastet.

### 7. Tests

| Test | Where | What |
|---|---|---|
| `classifyNarrativeAutoContext` | `src/lib/ai/classify.test.ts` | 6+ Cases: leerer Context (=2), vollständiger Class-2-Context, hypothetisches Class-3-Feld eingeschmuggelt (=3), unbekannter Schlüssel (=3), Tenant-Default=3 (=3 default), Whitelist-Coverage |
| `invokeNarrativeGeneration` happy path | `src/lib/ai/router.test.ts` | Mocked-Anthropic returnt Text → Router liefert Status='success' + ki_runs-Update korrekt |
| `invokeNarrativeGeneration` Class-3-Block | `router.test.ts` | Mocked-classifier returnt 3 → kein Provider-Aufruf, ki_runs.status='external_blocked', Stub-Text in Response |
| `invokeNarrativeGeneration` Provider-Error | `router.test.ts` | Mocked-Anthropic throws → ki_runs.status='error', Stub-Text in Response (kein Re-Throw) |
| `buildNarrativeAutoContext` | `src/lib/ai/auto-context.test.ts` (NEU) | Mocked-Supabase: Phasen + Risks + Decisions + Milestones + Backlog-Counts korrekt aggregiert; max-3-Limit gehalten; **kein** responsible_user_id-Join im Call |
| preview-ki-Route Provider-Error-Fallback | `route.test.ts` (NEU oder extend) | Mocked-Router throws → Route returnt 200 mit Stub-Text |
| Bestehende Risk-Tests | `router.test.ts` (existing) | **Müssen grün bleiben** — Refactor darf nichts brechen |
| `invokeRiskGeneration` Smoke nach Refactor | `router.test.ts` | Smoke-Test dass Helpers korrekt aufgerufen werden (kein Verhaltensdelta) |

### 8. Out of scope (deferred — explicitly named)

- **Multi-Provider-Routing für narrative** (Tenant-Custom-Anthropic / OpenAI / Google) → PROJ-32.
- **Skills/Tool-Use-Layer** (cross-provider) → PROJ-39.
- **Interview-Purpose** (Adaptive Dialog) → PROJ-33; nutzt aber dasselbe Helper-Pattern.
- **Async-Render** für lange Narratives → PROJ-30b falls Pilot-Daten Bedarf zeigen.
- **Caching von Narratives** — transient by design.
- **Narrative-Prompt-Templates pro Tenant** ("unser Stil") → eigener Spec wenn Bedarf.

### 9. Dependencies (packages)

**Keine neuen npm-Pakete.** PROJ-30 nutzt:
- `ai` (Vercel AI SDK, vorhanden)
- `@ai-sdk/anthropic` (vorhanden)
- bestehende Supabase + Zod + Vitest

### 10. Risk + trade-off summary

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Class-3-Bypass durch vergessenes Whitelist-Feld | Niedrig | Hoch | Whitelist-Pattern + Vitest-Test der jedes neue Feld pinned. Code-Review-Pflicht für jede `NarrativeAutoContext`-Erweiterung. |
| Provider-Refactor zerbricht Risk-Code-Pfad | Niedrig | Mittel | Bestehende Risk-Tests bleiben Pflicht-grün. Rename ist mechanisch (Klassen + Type), keine Logik-Änderung. |
| Auto-Context fügt versehentlich personenbezogene Felder (z.B. einen `responsible_user`-Join) | Mittel | Hoch | Builder-Test prüft die SELECT-Spalten. Whitelist-Classifier fängt es als Class-3 ab (Defense-in-Depth). |
| Anthropic returnt halluzinierten / leeren Text | Mittel | Niedrig | User editiert sowieso. Leerer Text → behandelt wie Provider-Error → Stub-Fallback. |
| Token-Counts/Costs explodieren bei großen Projekten | Niedrig | Niedrig | Auto-Context cap auf max-3-Listen. Token-Logging in `ki_runs` macht jede Anomalie sichtbar. |
| Route-Test bricht weil Mocked-Supabase-Chain zu komplex | Mittel | Niedrig | Mocking-Pattern ist etabliert (PROJ-21 route.test.ts hat 7 Cases). Wiederverwendung. |
| Pilot-Tenant ohne `ANTHROPIC_API_KEY` env | Niedrig (Pilot ist konfiguriert) | Mittel | Provider-Init throws → Stub-Fallback; `ki_runs.status='error'` mit klarer Message. UI zeigt Stub. |
| `ki_narrative_enabled=false` aber preview-ki wird trotzdem aufgerufen | Niedrig | Niedrig | 403 wie heute. Bleibt unverändert. |
| Provider-Latency >5 s lässt User-UI lange hängen | Mittel | Mittel | Modal hat heute schon Loading-State. Kein Hard-Timeout in V1; Async-Variante ggf. PROJ-30b. |
| Concurrent preview-ki-Calls vom selben User | Niedrig | Niedrig | Jeder bekommt eigenen `ki_runs.run_id`. Keine Sperren. Stateless. |

### 11. Architecture decisions confirmed

| # | Decision | Locked auf |
|---|---|---|
| 1 | Helper-Refactor-Granularität | **A** — drei separate Helpers |
| 2 | Provider-Interface-Migration | **A** — Rename + optionale Methoden + Alias |
| 3 | Stub-Text-Quelle | **A** — zentral in StubProvider.generateNarrative |
| 4 | Classifier-Logik | **A** — Whitelist (Defense-in-Depth) |
| 5 | `ki_runs.purpose`-Schema | **A** — text bleibt, kein CHECK-Constraint |

## Implementation Notes
_To be added by /backend_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
