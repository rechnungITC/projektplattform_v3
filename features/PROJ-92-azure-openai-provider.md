# PROJ-92: Azure OpenAI Provider (Class-1/2) — fünfter Provider-Typ

## Status: Deployed (Tag `v2.8.0-PROJ-92` 2026-07-03 — Provider/Validator/Admin-Form + Migration live in Prod; Post-Deploy-Smoke 307 auth-gated. AC-92.7 real-Azure-Call = dokumentierte Stub-Deviation für Pilot)
**Created:** 2026-06-10
**Last Updated:** 2026-07-01
**Origin:** PO-Entscheidung 2026-06-10 (Pilotkunden ohne Ollama-Betrieb) · CIA-Review 2026-06-10 (GO, Split 92a/92b)
**Priority:** P1 — Should-have

## Summary
Azure OpenAI Service wird fünfter Provider-Typ der PROJ-32-Multi-Provider-Architektur (neben Anthropic / OpenAI / Google / Ollama). In dieser Slice verhält sich Azure wie ein normaler Cloud-Provider: **nur Class-1/2-Purposes**, die Class-3-Invariante #3 bleibt unberührt. Tenants hinterlegen ihre eigene Azure-OpenAI-Ressource (Endpoint im eigenen Kunden-Azure-Tenant, EU-Region, Deployment-Name, API-Key, api-version). Die Class-3-Freigabe für attestierte EU-Endpoints ist **bewusst ausgeklammert** → PROJ-93.

**Kein neues Dependency** (CIA-Lock): Anbindung über die bereits produktive `createOpenAICompatible`-Factory (Pattern aus dem Ollama-Provider), nicht über `@ai-sdk/azure`.

## Problem / Context
Die SaaS-Mandate (PROJ-32) verlangt tenant-eigene Keys. Enterprise-Kunden haben häufig bereits Azure-OpenAI-Verträge (Microsoft-DPA, EU Data Boundary, eigener Azure-Tenant) und wollen diese statt OpenAI-direkt nutzen. Heute gibt es keinen Azure-Provider-Typ; `AIKeyProvider` kennt nur `anthropic | ollama | openai | google`.

## User Stories
- Als Tenant-Admin möchte ich meine eigene Azure-OpenAI-Ressource (Endpoint, Deployment, Key, api-version, Region) hinterlegen, damit Cloud-Purposes über meinen eigenen Azure-Vertrag laufen.
- Als Tenant-Admin möchte ich Azure in der Provider-Prioritätsmatrix einsortieren können, damit es wie jeder andere Cloud-Provider gewählt wird.
- Als PM möchte ich, dass Generierungen (Risiken, Backlog, Cross-Project-Links, Trajectory, Narrative) transparent über Azure laufen, wenn mein Admin das konfiguriert hat — sichtbar in `ki_runs`.
- Als Compliance-Officer möchte ich, dass Azure in dieser Ausbaustufe für Class-3 strukturell NICHT wählbar ist, damit die Invariante #3 unverändert gilt.

## Acceptance Criteria
- [ ] **AC-92.1**: `AIKeyProvider` wird um `"azure"` erweitert; DB-Whitelists (`tenant_ai_keys`-CHECK, `tenant_ai_provider`-Tabellen, `ki_runs`-Provider-CHECK) werden in Lockstep migriert (Pattern: Migration 20260505100200).
- [ ] **AC-92.2**: Azure-Provider-Config trägt mindestens: Endpoint-URL, Deployment-Name, API-Key (verschlüsselt wie alle Keys), `api_version` (Pflichtfeld, validiert), `azure_region` (Pflichtfeld). Region wird gegen eine statische **EU-Allowlist** validiert (`westeurope`, `germanywestcentral`, `northeurope`, `swedencentral`; Server-Konstante mit Test + dokumentiertem Update-Pfad).
- [ ] **AC-92.3**: Der Azure-Provider implementiert **alle 5 Cloud-Purposes** (risks, narrative, trajectory_sequence, cross_project_links, proposal_from_context) über die vorhandene `createOpenAICompatible`-Factory mit Azure-Base-URL (`{endpoint}/openai/deployments/{deployment}` + `api-version`); Capability-Matrix-Regressionstest (PROJ-85-Muster) deckt ihn ab.
- [ ] **AC-92.4**: Class-3-Clamp unverändert: `defaultProviderOrder(3)` bleibt exakt `["ollama"]`; der `class3_local_only`-CHECK der Priority-Matrix bleibt in dieser Slice unangetastet. Ein Test beweist, dass Azure für Class-3 strukturell nicht wählbar ist.
- [ ] **AC-92.5**: Cost-Caps (PROJ-32d) greifen für Azure-Läufe (Token-Zählung + Cap-Enforcement getestet); Priority-Matrix (PROJ-32c) akzeptiert `azure` für Class-1/2-Arrays.
- [ ] **AC-92.6**: Tenant-Admin-UI (Einstellungen → KI-Provider) bietet Azure-Formular mit Key-Validierung (Pattern der bestehenden Key-Validatoren) und Audit-Event via `record_tenant_ai_provider_audit`.
- [ ] **AC-92.7**: `ki_runs` weist Azure-Läufe als `provider='azure'` aus; Live-Smoke gegen eine echte Azure-Ressource ODER dokumentierter Stub-Pfad, falls beim Deploy keine Test-Ressource verfügbar (Deviation dokumentieren).

## Edge Cases
- Falsche/abgelaufene `api_version` → Azure lehnt ab; Key-Validator liefert actionable Fehlermeldung (Azure deprecated api-versions hart).
- Nicht-EU-Region eingegeben → Validierungsfehler beim Speichern, Config wird nicht persistiert.
- Deployment-Name existiert nicht in der Azure-Ressource → Validator-Fehler, kein stiller Stub-Fallback.
- Tenant hat Azure UND OpenAI konfiguriert → Priority-Matrix entscheidet; kein implizites Bevorzugen.

## Non-Goals / Out of Scope
- **Jede Class-3-Nutzung von Azure** (→ PROJ-93; Anti-Scope per CIA: keine generische Cloud-für-Class-3-Option).
- DPA-Attestierung / Trusted-Processor-Semantik (→ PROJ-93).
- `@ai-sdk/azure` als Dependency (CIA-abgelehnt zugunsten der vorhandenen Factory).
- Azure-Non-OpenAI-Modelle (z.B. Azure AI Foundry Kataloge).

## Dependencies
- Requires: PROJ-32 (alle 4 Slices, deployed), PROJ-85 (Capability-Matrix-Pattern), PROJ-42 (Schema-Drift-Guard erfasst neue Spalten).
- Unblocks: PROJ-93 (Trusted-EU-Processor Class-3-Freigabe).

## CIA-Review (2026-06-10, Kurzfassung)
GO. Locks: (1) openai-compatible Factory statt neuem SDK-Dep; (2) Split 92a/92b — diese Slice berührt die Invariante NICHT; (3) EU-Region-Allowlist als Server-Konstante; (4) Cost-Cap-Integration ist Pflicht (Class-3 später = teuerster Pfad); (5) api-version als validiertes Pflichtfeld. Vollständiger Report in der Session 2026-06-10.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_Added by /architecture 2026-07-01. PM-friendly; no code. All CIA forks were pre-locked (2026-06-10) — this pass confirms no new open fork surfaced (see "Open Forks" below)._

### The one-sentence shape
Azure OpenAI becomes a **fifth entry in a list that already has four** (Anthropic, OpenAI, Google, Ollama). Everything that today treats "which provider runs this generation" as a choice among four values now sees five — no new machinery, no new library, no change to how Class-3 data is protected.

### Why this is small (and why that's deliberate)
The deployed PROJ-32 multi-provider system already does the hard parts: per-tenant encrypted keys, a priority matrix that picks a provider per (purpose, data-class), cost-caps, and an audit trail in `ki_runs`. Adding OpenAI + Google in PROJ-32b was exactly this same "add a value to the whitelists" move. Azure reuses that precedent verbatim. Crucially, Azure speaks the **same wire protocol as OpenAI**, so the existing "OpenAI-compatible" connection factory (the one the Ollama provider already uses) talks to Azure with only a different base address — **no new dependency**, as the CIA locked.

### A) Where Azure plugs in (component view)

```
Tenant Admin → Settings → KI-Provider
  └── NEW: "Azure OpenAI" provider form
        · Endpoint URL   · Deployment name   · API key (encrypted like every key)
        · api-version (required, validated)  · Azure region (required, EU-allowlist)
        └── Save → key-validator probes the real Azure deployment → audit event

Generation request (risks / narrative / trajectory / cross-project-links / backlog)
  └── Priority matrix picks a provider for (purpose, data-class)
        ├── data-class 1/2  →  azure is now a valid pick (alongside the other clouds)
        └── data-class 3    →  ONLY ollama, unchanged  ← the invariant
  └── Chosen "azure" → OpenAI-compatible factory, pointed at the tenant's Azure deployment
        └── Result recorded in ki_runs with provider = 'azure'
```

### B) What gets stored (data model, plain language)

An Azure provider config (encrypted, per tenant, same table + column as all other providers) holds:

- **Endpoint URL** — the tenant's own Azure OpenAI resource address (in their Azure tenant).
- **Deployment name** — which model deployment to call (Azure addresses models by deployment, not model id).
- **API key** — stored encrypted exactly like every other provider key.
- **api-version** — required, validated; Azure hard-rejects deprecated versions, so a wrong value must fail loudly at save time, not silently at generation time.
- **Azure region** — required, checked against a **static EU-region allowlist** held as a server constant (`westeurope`, `germanywestcentral`, `northeurope`, `swedencentral`), with a test and a documented update path. A non-EU region is refused at save; the config is never persisted.

No new table. Azure is a new **shape** of the existing provider-config, and a new **value** in the provider whitelists.

### C) The four whitelists that move in lockstep (+ one code enum)

Adding a provider value in only some places would let a config save but fail to route (or vice-versa). So five things change together — the exact set PROJ-32b touched for OpenAI/Google:

1. **Code:** the `AIKeyProvider` union (`anthropic | ollama | openai | google` → `+ azure`).
2. **DB — provider whitelist** on the tenant-providers table (accept `azure`).
3. **DB — known-providers whitelist** on the priority-matrix table (allow `azure` inside a priority order array).
4. **DB — `ki_runs` provider check** (allow `azure` to be recorded as the run's provider).
5. **DB — audit RPC validator** (`record_tenant_ai_provider_audit` accepts `azure`).

One migration, following the reference `20260505100000` + `20260505100200` pattern. **Migration-naming note (PROJ-134, now enforced):** the file is created first as `YYYYMMDDHHMMSS_proj92_*.sql` (minute-rastered) and applied under that exact name.

### D) The Class-3 invariant — structurally unchanged (AC-92.4)

This is the part that must be provably untouched. Two independent guards already keep Class-3 on Ollama only, and Azure passes through **neither**:

- **Default order for data-class 3** returns `["ollama"]` and nothing else — Azure can never be the fallback pick.
- **The priority-matrix Class-3 path** filters any configured order down to local providers only; a cloud value like `azure` is dropped, same as `openai`/`google` are today.

So Azure needs *no new blocking code* — it is blocked for Class-3 by the same mechanism that already blocks the other clouds. The slice adds a regression test that proves "Azure is not selectable for Class-3", and leaves the `class3_local_only` matrix check literally unedited.

### E) All five cloud purposes + regression (AC-92.3)

Azure implements the five cloud purposes (risks, narrative, trajectory-sequence, cross-project-links, proposal-from-context) by reusing the shared purpose prompts/schemas — the provider only supplies the connection, the prompt logic is shared (the PROJ-85 lesson: never let a provider silently no-op a purpose). A **capability-matrix regression test** (the PROJ-85 pattern) asserts Azure covers exactly the five cloud purposes and — deliberately — not `resource_swap` (Ollama-only by design).

### F) Cost-caps + priority matrix (AC-92.5)

Because Azure runs through the same generate path, token usage is counted and the existing cost-cap enforcement applies with no special-casing — a test proves an Azure run is capped. The priority matrix accepts `azure` in Class-1/2 order arrays (via whitelist #3 above).

### G) Admin UI (AC-92.6)

A new "Azure OpenAI" form in Settings → KI-Provider, mirroring the existing provider forms: the five fields above, a **Save-time key validator** that probes the real deployment (so a bad endpoint / deployment / api-version fails with an actionable message, never a silent stub), and an audit event on create/rotate/delete/validate.

### H) Live proof (AC-92.7)

`ki_runs` shows Azure runs as `provider='azure'`. A live smoke against a real Azure resource is the goal; if no test resource exists at deploy time, the documented stub path + a recorded deviation is acceptable (per AC-92.7).

### Backend vs frontend
Both. **Backend:** the enum, the lockstep migration, the Azure provider (connection + 5 purposes), the key-validator, EU-region constant, cost-cap + matrix wiring, capability + Class-3 + cost-cap tests. **Frontend:** the admin provider form + validation surface. Recommended order: `/backend` first (the provider must exist before the form can save/validate against it), then `/frontend`, then `/qa`.

### Dependencies
- **No new npm package** (CIA-locked: reuse `@ai-sdk/openai-compatible`, already in the tree for Ollama).
- Requires deployed PROJ-32 (all slices), PROJ-85 (capability-matrix test pattern), PROJ-42 (schema-drift guard will see the new columns/values) — all live.

### Open Forks
**None.** The CIA review (2026-06-10) locked all five decisions (factory-not-SDK, 92/93 split keeping the invariant out of scope, EU-allowlist as server constant, cost-cap mandatory, api-version validated). This architecture pass surfaced **no new fork** — every AC maps to an existing, deployed pattern. No fresh CIA pass required (spec-following extension of a reviewed architecture). If `/backend` discovers that Azure's OpenAI-compatible surface needs a request-shape quirk the factory can't express (e.g. the `api-version` must ride as a query parameter the factory doesn't forward), that is a backend implementation detail — flag it then, but it does not reopen an architecture fork.

## Implementation Notes — Backend (2026-07-01)

Built in worktree `projektplattform_v3-proj92` (branch `proj-92/backend`). **No new npm dependency** (reused `@ai-sdk/openai-compatible`). The architecture-flagged quirk (Azure needs `api-version` as a query param + `api-key` header, not Bearer) is expressible by the factory — verified `createOpenAICompatible` supports `baseURL` + `headers` + `queryParams`, so **no architecture fork reopened**.

**Files:**
- `supabase/migrations/20260702100000_proj92_azure_provider.sql` — lockstep: adds `azure` to the 4 whitelists (`tenant_ai_providers` CHECK, priority `known_providers` CHECK, `ki_runs` provider CHECK, `record_tenant_ai_provider_audit` validator). `class3_local_only` CHECK **untouched**. Applied to prod under the exact filename stem (PROJ-134 rule).
- `src/lib/ai/azure-region-allowlist.ts` (+test) — EU-region server constant (`westeurope`/`germanywestcentral`/`northeurope`/`swedencentral`) + `isEuAzureRegion` + documented update path.
- `src/lib/ai/azure-key-validator.ts` (+test) — one-round-trip deployment probe (endpoint+deployment+api-version+key), status mapping incl. `model_missing` (404) + `unreachable`; `sanitizeAzureEndpoint` (https-only) + `buildAzureFingerprint` (host/deployment, never key).
- `src/lib/ai/providers/azure.ts` — `AzureOpenAIProvider` mirroring `OpenAIProvider`, all cloud purposes via **shared** `graph-purpose-prompts`; base URL `{endpoint}/openai/deployments/{deployment}` + `api-version` query + `api-key` header.
- Wiring: `AIProviderName` (types.ts) + `AIKeyProvider`/`ProviderConfig`/parse-arm/`defaultProviderOrder`/provider-enumeration (key-resolver.ts) + router dispatch arm; API `[provider]/route.ts` (PUT: azure schema + EU-gate + validate-or-422) + `validate/route.ts` (re-validate branch); `ALLOWED_PROVIDERS` +azure in both routes.
- Tests: `router-azure.test.ts` (Class-1 azure selected + cloud call; Class-3 azure **clamped out** → stub/blocked), capability-matrix (+azure cloud peer, `resource_swap` NOT implemented), region + validator suites.

**Deviation (in-scope AC-92.5 fix, surfaced for QA/CIA):** the priority-matrix known-providers **code** filter in `getPriorityMatrix` (`key-resolver.ts`) hardcoded `anthropic || ollama`, silently dropping *all* cloud providers from explicit matrix rules — a latent bug since PROJ-32b (openai/google were also being dropped). Widened it to match the DB `known_providers` whitelist so azure (and, incidentally, openai/google) are honored in Class-1/2 matrix rules. **Class-3 safety is unaffected**: the `class3_local_only` DB CHECK still forbids any non-ollama value in a `data_class=3` row (proven live below), so a class-3 order can only ever contain ollama regardless of this filter. Single-line change, directly required by AC-92.5.

**Live smoke against prod (mandatory, self-rolling-back, 0 residue):**
- Definitional: all 4 whitelists + audit validator now contain `azure`; `class3_local_only` still `((data_class<>3) OR (provider_order <@ ['ollama']))` — unchanged.
- Functional (`tenant_ai_provider_priority`, real tenant, rolled back): class-1 order `['azure','anthropic']` → **accepted**; class-3 order `['azure']` → **rejected** by `class3_local_only` (SQLSTATE 23514). Post-check: 0 azure rows anywhere.

**Quality gates:** vitest **2164/2164** (270 files); eslint 0 on changed files; tsc 14 total = **0 new** (the 1 AI-file error is the pre-existing `graph-purpose-prompts.test.ts` baseline); build clean; `check:migration-naming` 0 errors (new migration minute-rastered, no collision); Supabase security advisors 0 ERROR (the 1 WARN on the recreated audit fn is the pre-existing `authenticated_security_definer_function_executable`, not new).

**Open:** AC-92.6 admin-UI Azure form → `/frontend`; AC-92.7 live-smoke against a *real* Azure resource → `/qa` (documented stub path acceptable if no test resource). → `/frontend`.

## Implementation Notes — Frontend (2026-07-01)

Built in worktree `projektplattform_v3-proj92` (branch `proj-92/frontend`). No new dependency, shadcn/ui primitives only.

- **`AzureCard`** in `src/components/settings/tenant/ai-providers/ai-providers-page-client.tsx` (AC-92.6) — mirrors `OllamaCard` (multi-field): endpoint_url, deployment_name, api_key, api_version, azure_region. PUTs the exact body `{endpoint_url, deployment_name, api_key, api_version, azure_region}` to `…/ai-providers/azure`; reuses the generic status-badge / fingerprint display / Re-Test (`…/azure/validate`) / delete flows. Client shape-check mirrors the backend Zod (https endpoint, `api_version` regex `^\d{4}-\d{2}-\d{2}(-preview)?$`, non-empty key/deployment/region); the **EU-region allowlist is NOT duplicated client-side** — a non-EU region surfaces the server 400 message verbatim (per lock). Status handling incl. `model_missing` (deployment not found) + `unreachable`. Wired into the page: `ProviderName`/`LoadState`/parallel load all include `azure`.
- **`PriorityMatrixSection`** — `azure` added to `ProviderName`, `PROVIDER_LABELS` ("Azure OpenAI"), `CLOUD_PROVIDERS`, `AvailMap`, `availableCloud`, and a new `azureAvailable` prop (passed from the page). So azure now appears in the Class-1/2 cloud order presets. (Local/Class-3 presets unchanged — azure never enters them.)
- **`CostCapSection`** — `azure` label added to the per-provider usage display.

**Quality gates:** eslint 0 (changed files); tsc 14 total = **0 new**; build clean; targeted vitest 278/278 (AI lib + provider routes — no regressions; the settings page area has no unit tests, consistent with the existing OpenAI/Ollama cards).

**Open:** AC-92.7 live smoke against a *real* Azure resource → `/qa` (documented stub path acceptable if no test resource). → `/qa`.

## QA Test Results — 2026-07-01

**Verdict: PRODUCTION-READY (0 Critical / 0 High).** Independent QA in worktree `proj-92/qa` against merged main + prod DB.

| AC | Ergebnis | Beleg |
|---|---|---|
| AC-92.1 (enum + 4 whitelists lockstep) | ✅ | Live prod: `tenant_ai_providers`/`priority known_providers`/`ki_runs` CHECKs + `record_tenant_ai_provider_audit` validator **all contain `azure`**. |
| AC-92.2 (config fields + EU-region allowlist) | ✅ | 5-field config (endpoint/deployment/key/api_version/azure_region); `azure-region-allowlist.test.ts` 8/8 pins the exact EU set; allowlist imported **only** by the server route — client does not hold it (red-team below). |
| AC-92.3 (5 cloud purposes + capability-matrix) | ✅ | `capability-matrix.test.ts`: azure implements all cloud purposes, **not** `resource_swap`; shared `graph-purpose-prompts` reused. |
| AC-92.4 (Class-3 clamp structural) | ✅ **strong** | Code: `defaultProviderOrder(3)`→`["ollama"]` + `clampForClass3`/`LOCAL_ONLY_PROVIDERS=["ollama"]` untouched; `class3_local_only` CHECK unchanged. Router: `router-azure.test.ts` (class-3 azure → stub/blocked, no cloud call). **Live red-team (below): azure rejected for class-3 in every ordering.** |
| AC-92.5 (cost-cap + priority-matrix accept azure) | ✅ | Live: class-1 `['azure']` **accepted**. `router-cost-cap` + `router-priority` + `key-resolver` suites green — the `getPriorityMatrix` filter widening (AC-92.5 fix) broke nothing. |
| AC-92.6 (admin UI form) | ✅ | `AzureCard` built; build clean; auth-gate spec 5/5. |
| AC-92.7 (`ki_runs` provider='azure' / live-smoke) | ⚠️ **PASS w/ documented deviation** | `ki_runs` CHECK accepts `provider='azure'` (verified live). Real-Azure end-to-end generation **not executed — no Azure test resource available** (spec-permitted stub path). Every layer *except the Azure API round-trip* is live-proven (whitelist → router builds `AzureOpenAIProvider` → ki_runs accepts azure). |

**Live red-team prod smoke (self-rolling-back, 0 residue — independently re-run by QA):**
- Class-1 `['azure','anthropic']` → **accepted** (AC-92.5).
- Class-3 no-bypass — **all three** azure-containing orders **rejected** by `class3_local_only`: `['azure']`, `['ollama','azure']`, `['azure','ollama']` (the `<@ ARRAY['ollama']` subset check fails on any azure element — mixing with ollama does not sneak azure in). Invariant #3 intact.
- Definitional: 4 whitelists gained `azure`; `class3_local_only` still `((data_class<>3) OR (provider_order <@ ['ollama']))`.
- Post-check: **0 azure rows** in `tenant_ai_provider_priority` / `tenant_ai_providers` / `ki_runs`.

**Red-team — EU-region gate:** the allowlist is enforced **server-side only** (`isEuAzureRegion` imported solely by the route; a non-EU region returns 400 and never persists). The client `AzureCard` carries no enforcement list — only placeholder/hint text — so the gate cannot be bypassed by patching the client bundle.

**Security probes:** Playwright `tests/PROJ-92-azure-provider.spec.ts` — 5/5 chromium: GET/PUT/validate/DELETE on `…/ai-providers/azure` are auth-gated (307/401/403 without a session), incl. a PUT with a non-EU region (gate fires before the region check → no leak).

**Regression:** full vitest **2194/2194** (275 files; +30 azure); targeted AI suites (router-azure/class3/priority/cost-cap, key-resolver, capability-matrix, region+validator, provider route 27) all green; build clean.

**Findings:**
- **F-1 (Info / documented deviation, AC-92.7):** no real Azure resource available → the live Azure generation round-trip was not exercised. Mitigation: the routing/DB/validator path is proven at every other layer; a pilot with an Azure resource should run one real `proposal_from_context`/`narrative` call and confirm `ki_runs.provider='azure'` + non-null tokens. Spec explicitly permits this stub-path deviation.
- **F-2 (Info, env):** WebKit/Mobile Safari Playwright project skipped (host libs missing — the standing PROJ-67 F2 handoff `sudo npx playwright install-deps webkit`); chromium ran. The bare worktree needed a copied `.env.local` for the webServer (PROJ-135 D-1 class) — not a product issue.

**0 Critical / 0 High → Approved.**

## Deployment — 2026-07-03

**Tag `v2.8.0-PROJ-92`.** Runtime deploy via Vercel auto-deploy from `main` (new frontend `AzureCard` + backend azure provider/routes). Migration `20260702100000_proj92_azure_provider` was already applied to prod during `/backend`.

- **Pre-deploy gates** (via CI on #217/#219/#222): schema-drift, migration-naming, npm-audit, Snyk, build — all green at merge. Full vitest 2194/2194.
- **Post-deploy prod smoke (2026-07-03):** `GET`/`POST validate`/`DELETE` on `/api/tenants/{id}/ai-providers/azure` + `/settings/tenant/ai-providers` all return **307** (auth-gated) — routes live (a missing route would 404), gate intact.
- **No new env var / secret** — Azure config is per-tenant, stored encrypted like every provider key.

**Open follow-up (F-1, AC-92.7):** a pilot with a real Azure OpenAI resource should register it in Settings → KI-Provider, run one `narrative`/`proposal_from_context` generation, and confirm `ki_runs.provider='azure'` with non-null token counts. The routing/DB/validator path is otherwise fully live-proven; PROJ-93 (Trusted-EU-Processor) builds on this for the Class-3 path.
