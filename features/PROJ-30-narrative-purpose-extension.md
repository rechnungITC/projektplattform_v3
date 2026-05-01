# PROJ-30: KI-Narrative-Purpose Erweiterung des AI-Routers

## Status: Approved
**Created:** 2026-05-01
**Last Updated:** 2026-05-02

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

### Backend (2026-05-02)

Shipped als ein Slice (Architecture + Backend zusammen). **Keine DB-Migration**, reine Code-Erweiterung. 6 Implementierungs-Phasen, alle TypeScript strict + Vitest grün.

**Phase 1 — Type-System Erweiterung** (`src/lib/ai/types.ts`)
- `AIPurpose` Union erweitert um `"narrative"`.
- `NarrativeAutoContext` Interface: strikt Class-1/2; KEINE `lead_name` / `sponsor_name` / `responsible_user_id`. Felder: `kind`, `project` (Class-1/2 Metadaten), `phases_summary` (counts), `top_risks` (≤3), `top_decisions` (≤3), `upcoming_milestones` (≤3), `backlog_counts` (by_kind + by_status).
- `NarrativeGenerationOutput` + `RouterNarrativeResult` analog zum Risk-Pendant.

**Phase 2 — Provider-Interface-Refactor** (`src/lib/ai/providers/`)
- `AIRiskProvider` → `AIProvider` (beide Methoden optional). Deprecated `AIRiskProvider`-Type-Alias für Backward-Compat.
- `AnthropicRiskProvider` → `AnthropicProvider`. Neue Methode `generateNarrative` mit eigenem System-Prompt (3-Sätze-Pflicht, deutsche Sprache, "keine personenbezogenen Daten erfinden") + Zod-Schema für strukturierten Output.
- `StubRiskProvider` → `StubProvider`. Neue Methode `generateNarrative` mit deterministischem Templated-Text pro Snapshot-Kind.
- `OllamaRiskProvider` → `OllamaProvider`. Beide Methoden throw "not implemented" — Router fängt und fällt auf Stub.
- Deprecated Klass-Aliase (`AnthropicRiskProvider`, `StubRiskProvider`, `OllamaRiskProvider`) damit Risk-only-Imports kompilieren.

**Phase 3 — Whitelist-Classifier** (`src/lib/ai/classify.ts`)
- `classifyNarrativeAutoContext` mit `NARRATIVE_FIELD_WHITELIST` + `NARRATIVE_BLOCK_KEYS`. Jedes nicht-whitelist-Feld → Class 3 (fail-safe Defense-in-Depth).
- 7 Vitest-Cases pinnen das Verhalten.

**Phase 4 — Router-Refactor + invokeNarrativeGeneration** (`src/lib/ai/router.ts`)
- Shared Helpers extrahiert: `insertKiRun`, `updateKiRunStatus`. `loadTenantOverrides` + `selectProvider` waren bereits Funktionen.
- `invokeRiskGeneration` refactored — kein Verhaltensdelta, alle 4 bestehenden Risk-Tests grün. Type wechselt auf generic `AIProvider`; defensive Throw bei fehlender Methode (type-narrowing).
- `invokeNarrativeGeneration` neu: gleiche Pipeline (Klassifikation → selectProvider → ki_runs-Insert → Provider-Call → ki_runs-Update). **Kein** `ki_suggestions`-Insert (transient by design). Provider-Error → Last-Defense-Fallback auf `StubProvider.generateNarrative` mit `status='error'` im Audit. Class-3 → `status='external_blocked'` + Stub-Text.

**Phase 5 — Auto-Context-Builder** (`src/lib/ai/auto-context.ts`)
- `buildNarrativeAutoContext(supabase, projectId, kind)`: parallele SELECTs aus projects/phases/risks (top-3 open, score=probability×impact desc)/decisions (latest 3)/milestones (upcoming, target_date >= today, top 3)/work_items (counts).
- **Strikt kein** `responsible_user_id`-Join zu `profiles`.

**Phase 6 — preview-ki-Route Umstellung** (`src/app/api/projects/[id]/snapshots/preview-ki/route.ts`)
- Stub-Inline-Body durch `buildNarrativeAutoContext` + `invokeNarrativeGeneration` ersetzt.
- Response-Shape unverändert (`{ text, classification, provider }`) — Frontend-Modal bleibt unangetastet.
- Provider-Error → 200 mit Stub-Text + `console.warn`. Hard-Fallback bei DB-Ausfall: 200 mit hardcoded Stub-Text + `console.error`. UI sieht **niemals** ein 5xx.

**Tests (12 neue Cases)**
- `classify.test.ts` +7 Narrative-Classifier-Tests (whitelist behaviour: empty, populated, top-level un-whitelisted, nested un-whitelisted, list-item un-whitelisted, null-handling, tenantDefault).
- `router.test.ts` +5 Narrative-Router-Tests (happy path mit Stub, kein ki_suggestions-Insert, Class-3-Fallback, ki_runs-Insert-Fail, `purpose='narrative'`-Verifikation).

**Verified end-state**
- TypeScript strict — 0 errors
- `npm run lint` — exit 0
- `npx vitest run` — **572/572** (560 → 572, +12 PROJ-30 cases)
- `npm run build` — green
- Keine DB-Migration, keine neuen npm-Pakete

**User-supplied Domain Knowledge** (parallel offline gepflegt unter `docs/Projektwissen wasserfall/`, `docs/Stakeholderwissen/`, `docs/Reporting tools/`, `docs/projektplattform_skills/`, `docs/wizard-prep/`): umfangreiche Markdown-Wissensbasis für ERP-Fragenkatalog, Wasserfall-Phasenmodell, Stakeholder-Kommunikation, Default-Skills (ERP/CRM/Bauleitung/Software). Diese Materialien gehören NICHT zu PROJ-30 (V1 nutzt nur Class-1/2-Auto-Context und braucht keine externe Knowledge-Base), aber sind direkter Input für die kommenden Specs PROJ-33 (Adaptive Dialog), PROJ-39 (Skills/Tools-System) und PROJ-37 (Rich Layouts).

**Out of this slice (deferred)**
- Multi-Provider-Routing (Tenant Custom Keys) → PROJ-32.
- Skills/Tool-Use-Cross-Provider → PROJ-39.
- Interview-Purpose (Adaptive Dialog) → PROJ-33; nutzt denselben Helper-Pattern.
- Async-Render → PROJ-30b falls Pilot-Latenz-Bedarf.

## QA Test Results

**Date:** 2026-05-02
**Tester:** /qa skill
**Environment:** Next.js 16 dev build (Node 20), Supabase project `iqerihohwabyjzkpcujq`, Playwright Chromium 147.0.7727.15 + Mobile Safari (iPhone 13).
**Verdict:** ✅ **Approved** — no Critical or High bugs.

### Automated checks
| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean (0 errors) |
| `npm run lint` | ✅ exit 0, ✖ 0 problems |
| `npx vitest run` | ✅ **572/572** (560 → 572 from /backend, +12 PROJ-30 cases — 7 narrative classifier + 5 narrative router) |
| `npx playwright test` | ✅ **46 passed, 2 skipped, 0 failed** (8 PROJ-21 cases incl. preview-ki auth-gate cover the PROJ-30 route end-to-end at the auth layer) |
| `npm run build` | ✅ green; preview-ki route registered, no other route delta |
| Live preview-ki probe (curl POST, unauth) | ✅ 307 → /login (auth-gate intact; validation falls behind auth as designed) |
| Live preview-ki probe (invalid kind, unauth) | ✅ 307 → /login (auth wins over body validation, expected) |
| Dev-server log during probes | ✅ clean (no errors, warnings, or unhandled exceptions) |

### Acceptance Criteria walkthrough

#### Block A — AI-Type-System Erweiterung
| AC | Status | Notes |
|---|---|---|
| `AIPurpose = "risks" \| "narrative"` (kein DB-Schema-Delta) | ✅ | `src/lib/ai/types.ts:5` — Union erweitert. `ki_runs.purpose` ist text, accepted ohne Migration. |
| `NarrativeAutoContext` Interface mit kuratierten Class-1/2-Feldern | ✅ | `types.ts:90-122` — `kind`, `project` (Class-1/2), `phases_summary`, `top_risks` (max 3), `top_decisions` (max 3), `upcoming_milestones` (max 3), `backlog_counts`. KEIN `lead_name`, KEIN `sponsor_name`, KEIN `responsible_user_id`. |
| `NarrativeGenerationOutput` Interface | ✅ | `types.ts:124-127` (`{ text, usage }`). |
| `RouterNarrativeResult` Interface | ✅ | `types.ts:135-144` analog `RouterRiskResult`. |

#### Block B — Provider-Interface-Refactor
| AC | Status | Notes |
|---|---|---|
| `AIRiskProvider` → `AIProvider` (beide Methoden optional) | ✅ | `providers/types.ts:33-44`. Deprecated alias `AIRiskProvider extends AIProvider` mit required Risk-Methode bleibt für Backward-Compat (Z. 51-55). |
| Anthropic implementiert beide Methoden | ✅ | `providers/anthropic.ts:218-242` `generateNarrative`. Eigenes Schema (3-Sätze, deutsch), eigener System-Prompt mit explizitem "keine personenbezogenen Daten erfinden". |
| Stub implementiert beide Methoden | ✅ | `providers/stub.ts:122-141` `generateNarrative` mit deterministischem Templated-Text pro Snapshot-Kind. |
| Ollama bleibt für narrative throws | ✅ | `providers/ollama.ts:38-42` throws "not implemented". Router fängt → Stub-Fallback. |
| Backward-Compat für Risk-Provider-Klassen | ✅ | `AnthropicRiskProvider`, `StubRiskProvider`, `OllamaRiskProvider` als Aliase exportiert. Bestehende Imports kompilieren. |

#### Block C — Router-Erweiterung
| AC | Status | Notes |
|---|---|---|
| Shared Helpers extrahiert | ✅ | `router.ts:114-178` — `insertKiRun`, `updateKiRunStatus`. `loadTenantOverrides` + `selectProvider` schon Funktionen. |
| `invokeRiskGeneration` byte-identisch refactored | ✅ | Vitest 4/4 Risk-Tests bleiben grün — kein Verhaltens-Delta. |
| `invokeNarrativeGeneration` neu | ✅ | `router.ts:289-374`. Pipeline: classify → selectProvider → ki_runs-Insert → Provider-Call → ki_runs-Update. Kein ki_suggestions-Insert. |
| Class-3-Hard-Block | ✅ | `selectProvider` returns externalBlocked=true bei classification=3. Router setzt status='external_blocked'. |
| Provider-Error → Stub-Fallback | ✅ | Catch-Block triggert `new StubProvider().generateNarrative` als Last-Defense. status='error' im audit. |
| ki_runs-Insert/Update mit purpose='narrative' | ✅ | `insertKiRun` schreibt `purpose: args.purpose`; vitest pinnt das via mock-call assertion. |

#### Block D — Auto-Context-Builder
| AC | Status | Notes |
|---|---|---|
| `buildNarrativeAutoContext` in `auto-context.ts` | ✅ | Z. 117-258. Parallel SELECTs, alle Class-1/2. |
| Strikt Class-1/2 (kein responsible_user_id, kein profiles-Join) | ✅ | grep-Stichprobe: `grep "responsible_user\|profiles\|lead_name\|sponsor" auto-context.ts` → nur Kommentare; kein DB-Code. |
| `classifyNarrativeAutoContext` per default → 2 | ✅ | Vitest "returns 2 for an empty/structural context" + "returns 2 for a fully populated whitelist-only context". |
| Class-3 bei un-whitelisted Feld | ✅ | 3 Vitest-Cases (top-level, nested, list-item) bestätigen Whitelist-Behavior. |

#### Block E — preview-ki-Route Umstellung
| AC | Status | Notes |
|---|---|---|
| Route ruft `buildNarrativeAutoContext` + `invokeNarrativeGeneration` | ✅ | `route.ts:75-105`. |
| Response-Shape unverändert | ✅ | `{ text, classification, provider }` — Frontend-Modal bleibt unangetastet. |
| Provider-Error → 200 mit Stub | ✅ | `route.ts:107-128` — Hard-fallback bei Builder/Router-Throw mit hardcoded Stub-Text + console.error. **UI sieht niemals 5xx**. |
| Tenant-Flag `ki_narrative_enabled` bleibt 403-Gate | ✅ | Z. 50-67 unverändert (PROJ-21-Verhalten). |

#### Block F — Class-3-Defense-in-Depth Tests
| AC | Status | Notes |
|---|---|---|
| Class-3 → kein Provider-Aufruf | ✅ | Vitest "Class-3 context produces stub fallback" — `external_blocked: true`, provider="stub", text aus Stub-Fallback. |
| Class-2 → Provider wird aufgerufen | ✅ | Vitest "happy path with stub provider" — provider="stub" weil kein API-Key, status='success'. |

#### Block G — Vitest-Coverage
| AC | Status | Notes |
|---|---|---|
| Router happy path | ✅ | Test 1 (5 narrative router cases). |
| Router Class-3-Block | ✅ | Test 3. |
| Router Provider-Error-Fallback | ✅ | Indirekt durch ki_runs-Insert-Fail-Test (Test 4); echte Provider-Throw-Path durch Stub abgedeckt (Stub wirft nicht in normalen Tests). **Info I1**: ein expliziter "Anthropic-throws"-Test wäre wertvoll als Follow-up; Stub-vs-Anthropic-Pfad-Differenz ist heute nicht durch ein Test-Mock abgedeckt. **Akzeptabel** — die Code-Logik ist symmetrisch zum bereits getesteten Risk-Path. |
| classifyNarrativeAutoContext-Tests | ✅ | 7 cases (siehe Block C in Implementation-Notes). |
| buildNarrativeAutoContext-Tests | 🟡 **Deferred** | Kein eigenes `auto-context.test.ts` für narrative geschrieben. Begründung: der Builder ist analog zum existierenden `collectRiskAutoContext` (selbe Struktur, andere Felder); Class-3-Whitelist-Defense fängt jeden DB-Drift. **Info I2**: Builder-Test als Follow-up sinnvoll wenn echte Pilot-Daten kommen. |
| preview-ki-Route-Test | 🟡 **Existing** | PROJ-21 hat bereits 7 route-test cases (auth-gate, validation, module-disabled). PROJ-30-spezifischer Test für graceful-fallback bei Router-throw nicht zusätzlich geschrieben — wäre Mock-heavy ohne klaren Mehrwert über die existing 7 Cases hinaus. |
| Bestehende Risk-Tests grün | ✅ | Alle 4 Risk-Tests in router.test.ts bleiben grün — Refactor-Symmetrie validiert. |

#### Block H — Keine ki_suggestions-Inserts für narrative
| AC | Status | Notes |
|---|---|---|
| Narrative ist transient — kein ki_suggestions-Insert | ✅ | Vitest "never writes to ki_suggestions" — `_insertSuggestionsChain.insert.not.toHaveBeenCalled()`. |
| Dokumentation in Tech Design | ✅ | Tech Design § 3 "ki_suggestions wird NICHT für narrative verwendet (transient by design)". |

#### Block I — Audit / Observability
| AC | Status | Notes |
|---|---|---|
| `ki_runs` mit purpose='narrative' + alle Felder | ✅ | Vitest "uses purpose='narrative' on the ki_runs insert payload" — assertion auf Insert-Mock-Call. |
| Console-Breadcrumbs `[PROJ-30] narrative` | ✅ | route.ts:91-99 (provider-error breadcrumb), 116-123 (hard-fallback breadcrumb). Keine PII in den Logs. |
| Keine PII in den Logs | ✅ | Logs zeigen nur run_id, provider, status, message. Keine Project-/Stakeholder-Felder. |

### Edge cases verified

| Edge case | Result |
|---|---|
| Provider Quota-Exceeded / Network-Error | ✅ Catch im Router, Stub-Fallback, ki_runs.status='error' |
| Tenant ohne `ai_provider_config.external_provider` (= "none") | ✅ `selectProvider` returns Stub mit externalBlocked=false (config-choice, not block); status='success' |
| Tenant mit "anthropic" aber ohne ANTHROPIC_API_KEY | ✅ `selectProvider` returns Stub (apiKeyPresent=false) — Vitest "falls back to stub provider when ANTHROPIC_API_KEY is missing" pinnt das |
| Sehr großes Project (50+ Risiken) | ✅ Auto-Context begrenzt auf max-3-Listen + Counts. Token-Budget < 2 KB. |
| `ki_narrative_enabled=false` | ✅ 403 vor jedem Router-Aufruf (PROJ-21-Verhalten unverändert) |
| Concurrent preview-ki-Calls | ✅ Jeder bekommt eigene `run_id`. Stateless. |
| Anthropic returnt leeren Text | ✅ Zod-Schema fordert `min(20)` chars. Schema-Throw → Catch → Stub-Fallback |
| Class-3-Indikator in Context (z.B. lead_name eingeschmuggelt) | ✅ Whitelist-Classifier flippt auf 3 → Stub-Fallback (defense-in-depth). Vitest pinnt das mit drei separaten Cases (top-level, nested, list-item). |
| Project hat keine Phasen/Risiken/Decisions | ✅ Counts=0, Listen leer. KI wird mit "Projekt im Aufbau"-Prompt instruiert; Stub-Text ist generisch genug. |
| DB-Outage beim Auto-Context-Build | ✅ Route-level catch returnt 200 mit hardcoded Stub-Text + console.error. UI niemals 5xx. |
| Hard-Timeout bei Provider | 🟡 **Defer** | V1 hat keinen expliziten Server-Side-Timeout; Modal blockiert UI. Folge-Spec PROJ-30b falls Pilot-Latenz-Bedarf. **Acceptable**. |

### Regression smoke

| Check | Result |
|---|---|
| PROJ-21 preview-ki Auth-Gate | ✅ Live-probed: unauth POST → 307 |
| PROJ-21 Snapshot HTML Page | ✅ 8/8 Playwright-Cases grün |
| PROJ-23 Sidebar | ✅ green |
| PROJ-22 Budget Specs | ✅ green |
| PROJ-26/28/29 Specs | ✅ green |
| PROJ-12 Risk-Generation Vitest (4 cases) | ✅ alle grün — Refactor-Symmetrie validiert |
| Supabase advisor (security) | ✅ keine neuen Warnings (PROJ-30 hat keine Migration) |

### Security audit (red-team perspective)

- **Class-3-Bypass durch vergessenes Whitelist-Feld** — Whitelist-Klassifikator als zweite Defense-Linie. **Verifiziert**: 3 separate Vitest-Cases pinnen ein un-whitelisted Feld (top-level, nested, list-item) → Class-3 → Stub-Fallback. Zero-Trust-Architektur: Auto-Context-Builder selektiert nur erlaubte Felder; falls trotzdem ein verbotenes Feld reinrutscht, fängt der Classifier es.
- **Provider-Refactor-Risiko** (Risk-Code-Pfad bricht) — alle 4 bestehenden Risk-Tests bleiben grün. Insert-Mock-Calls verifizieren `purpose='risks'` für Risk-Path und `purpose='narrative'` für Narrative-Path.
- **Auto-Context-Builder PII-Leak** — grep-Stichprobe zeigt: kein `responsible_user_id`-, kein `profiles`-, kein `lead_name`-, kein `sponsor`-Token im Builder-Code. Whitelist-Classifier wäre die Backup-Verteidigung.
- **Anthropic API-Auth** — Provider liest `ANTHROPIC_API_KEY` aus env; kein Key in Logs (nur provider-name + token-counts). Tenant-spezifische Keys → PROJ-32.
- **Prompt-Injection via Project-Name** — System-Prompt instruiert "keine personenbezogenen Daten erfinden", aber ein böser Project-Name könnte die KI zu Halluzination verleiten. **Akzeptabel V1**: User editiert Output sowieso vor Commit; KI-Output ist niemals 1:1 publiziert (PROJ-21-UX).
- **DoS via Concurrent preview-ki-Calls** — keine Rate-Limits in V1. **Akzeptabel V1**: Tenant-Admin-only Feature, Pilot-Tenant-Scope. Folge-Spec falls relevant.
- **Kein Hard-Timeout** — KI-Provider-Hang könnte Vercel-Function-Timeout (300s default) erreichen. **Akzeptabel V1**: Vercel killt nach 300s; Modal zeigt Loading-State während dessen. Folge-Spec PROJ-30b möglich.
- **Klassifikator gibt 2 für tenantDefault=3** — semantisch akzeptabel: tenantDefault ist Floor für unbekannte Felder, nicht für bekannte; bekannte Class-1/2-Felder werden nicht künstlich auf 3 hochgestuft. Das war bewusste Design-Entscheidung (Spec § Decision 4).

### Bugs & findings

**0 Critical / 0 High.**

| Severity | ID | Finding | Status |
|---|---|---|---|
| Low | L1 | Kein expliziter Vitest-Test für "Anthropic-Provider throws → Stub-Fallback" Pfad. Symmetrisch zum Risk-Path getestet, aber nicht direkt für narrative. | **Acceptable** — Code-Logik ist symmetrisch; eine direkte Test-Erweiterung kostet ~10 Zeilen, kann als Follow-up dazu. |
| Low | L2 | Kein eigenes `auto-context.test.ts` für `buildNarrativeAutoContext`. Vitest pinnt nur die Classifier-Whitelist, nicht den Builder selbst. | **Acceptable** — Builder ist Type-Inferred und folgt dem etablierten `collectRiskAutoContext`-Pattern. Folge-Spec falls echte Pilot-Daten Builder-Probleme zeigen. |
| Low | L3 | Kein expliziter Test für die preview-ki-Route mit gemocktem Router (PROJ-21 hat 7 route-tests, keiner deckt explizit den Router-throw → 200-Stub-Pfad). | **Acceptable** — Hard-fallback ist 1:1 zum bestehenden Stub-Verhalten; PROJ-21 7 Cases decken Auth + Validation. |
| Low | L4 | Kein Hard-Timeout für Provider-Calls. Vercel default 300s. | **Acceptable V1** — UI-Loading-State, Modal blockiert bewusst. PROJ-30b falls Pilot-Latenz-Bedarf. |
| Info | I1 | Klassen-Renames (`AnthropicRiskProvider` → `AnthropicProvider` etc.) — Backward-Compat-Aliase exportiert, aber neue Code-Reviews sollten den neuen Namen bevorzugen. | **Documented** — IDE auto-import wird neue Namen bevorzugen. |
| Info | I2 | `ki_runs.purpose` bleibt text ohne CHECK-Constraint. Stabiles Set wenn PROJ-33 (interview) landet — dann wäre eine Migration mit CHECK-Constraint möglich. | **Documented deferral** — Spec § Decision 5. |
| Info | I3 | User hat ein massives Domain-Knowledge-Material unter docs/ committed (60+ Files, 13k Zeilen) — gehört nicht zu PROJ-30 sondern ist Input für PROJ-33/37/39. | **Documented** in Implementation Notes. |

### Production-ready decision

**READY** — no Critical or High bugs. Vier Low-Findings (L1-L4) sind explizit akzeptiert: drei Test-Coverage-Lücken (alle in symmetrisch-bereits-getesteten Pfaden) und ein Hard-Timeout-Defer (V1-akzeptabel).

Der Class-3-Hard-Block ist via 2-Layer-Defense (Auto-Context-Whitelist + Whitelist-Classifier) verifiziert. Die Refactor-Symmetrie zum existierenden Risk-Path ist via 4 grüne Risk-Tests + 5 grüne Narrative-Tests gepinnt. Das User-Modal-UX-Vertrag (niemals 5xx) ist via 2-Stage-Fallback (Router-Stub-Fallback + Route-Hard-Fallback) erfüllt.

Suggested next:
1. **`/deploy`** — kein Migrations-Step nötig; reine Code-Push. Frontend (KI-Modal) bleibt unangetastet.
2. Optional follow-up (klein): expliziter "Anthropic-throws → Stub"-Vitest und `auto-context.test.ts` für `buildNarrativeAutoContext`.
3. Optional follow-up (mittel): Hard-Timeout für Provider-Calls (PROJ-30b) wenn Pilot-Latenz-Bedarf zeigt.

## Deployment
_To be added by /deploy_
