# PROJ-32: Tenant Custom AI Provider Keys (Multi-Provider)

## Status: Deployed (Phase 32-a live in production — 2026-05-04)

**Created:** 2026-05-04
**Last Updated:** 2026-05-04

## Summary

SaaS-Mandate: jeder Tenant hinterlegt eigene API-Keys für AI-Provider (Anthropic, OpenAI, Google, Ollama). Class-3-Routing (PROJ-12 deployed) erzwingt damit pro-Tenant-Provider-Trennung — heute teilen sich alle Tenants den platform-weiten `ANTHROPIC_API_KEY`-env-var, was bei Tenant-2-Onboarding die Class-3-Trennung kippt.

PROJ-32 wird in 4 Sub-Slices ausgeliefert. Jede Slice ist standalone deploybar.

| Sub-Slice | Scope | Status | Aufwand |
|---|---|---|---|
| **32a** | Tenant-Anthropic-Key (encrypted storage, validation, fallback-policy) | **In dieser Spec definiert** | ~3-4 PT |
| 32b | OpenAI + Google AI Studio (analog 32a, gleiches Storage-Pattern) | _to be specced_ | ~3 PT |
| 32c | Ollama (lokal-only, kein Cloud-Key, aber Endpoint-URL pro Tenant) + Provider-Priority | _to be specced_ | ~2 PT |
| 32d | Cost-Caps + Token-Logging + Tenant-Cost-Dashboard | _to be specced_ | ~3 PT |

**Total geschätzt:** ~11-12 PT über alle 4 Slices.

## Dependencies

- **Requires:**
  - **PROJ-12** (KI-Privacy-Routing, deployed) — AI-Router mit Class-3-Pfaden existiert
  - **PROJ-14** (Connector-Framework + tenant_secrets, deployed) — pgcrypto-Encryption-Pattern bereits etabliert
  - **PROJ-17** (Tenant-Settings, deployed) — Admin-UI-Pattern für Tenant-Konfiguration
  - **PROJ-30** (KI-Narrative-Purpose, deployed) — zweiter AI-Purpose, der vom neuen Key-Lookup profitiert
- **Influences:**
  - **PROJ-12-future-purposes** (KI-Coaching aus PROJ-36, KI-Suggestion-Refinements) — alle profitieren ohne weitere Anpassung
  - **PROJ-35** (deployed) — falls Stakeholder-AI-Coaching später Tenant-Key braucht

---

## Phase 32-a — Anthropic Tenant-Key

> Diese Spec deckt **nur 32a** vollständig ab. 32b/c/d werden separat specced wenn 32a deployed ist.

## V2 Reference Material

V2 hatte keinen Multi-Tenant-AI-Key-Pfad — alle V2-AI-Calls liefen über einen einzigen Backend-Key. PROJ-32 ist V3-Original aus SaaS-Anforderung.

## User Stories — 32a

### US-1 — Tenant-Admin: Anthropic-Key hinterlegen
**Als** Tenant-Admin
**möchte ich** in den Workspace-Einstellungen meinen Anthropic-API-Key sicher hinterlegen können
**damit** alle AI-Anfragen meines Tenants über meinen eigenen Anthropic-Account laufen (Cost-Allocation + Class-3-Trennung).

### US-2 — Tenant-Admin: Key-Validität prüfen
**Als** Tenant-Admin
**möchte ich** beim Speichern direkt sehen ob mein Key gültig ist
**damit** ich nicht erst beim ersten realen AI-Call eine 401/403-Fehler bekomme.

### US-3 — Tenant-Admin: Key rotieren
**Als** Tenant-Admin
**möchte ich** einen kompromittierten Key durch einen neuen ersetzen können
**damit** ich Security-Vorfälle ohne Tenant-Down-Zeit beheben kann (kurze Down-Zeit beim Wechsel akzeptabel im MVP).

### US-4 — Tenant-Admin: Key löschen → Class-3-Disable
**Als** Tenant-Admin
**möchte ich** meinen Key komplett entfernen können (z.B. bei Offboarding)
**damit** alle AI-Calls meines Tenants gestoppt werden bzw. Class-3 hard-blocked wird.

### US-5 — System: Class-3-Hard-Block ohne Tenant-Key
**Als** Plattform
**möchte ich** für Tenants ohne eigenen Anthropic-Key alle Class-3-Daten lokal verarbeiten und externe AI-Calls hard-blocken
**damit** Class-3-Compliance auch ohne Tenant-Setup gewährleistet ist (graceful degradation, keine Datenleaks).

### US-6 — System: Class-1/2 Fallback auf Platform-Key
**Als** Plattform
**möchte ich** für Tenants ohne eigenen Key Class-1- und Class-2-Daten weiterhin via Platform-Key verarbeiten
**damit** Tenants vor Setup nicht völlig blockiert sind, aber sensible Daten geschützt bleiben.

## Acceptance Criteria — 32a

### Block A — Storage

- [ ] **A.1** Neue Tabelle `public.tenant_ai_keys`:
  - `tenant_id uuid PK references tenants(id) ON DELETE CASCADE`
  - `provider text NOT NULL CHECK (provider IN ('anthropic'))` — 32a-Scope; CHECK wird in 32b erweitert
  - `encrypted_key bytea NOT NULL` — pgcrypto-encrypted, Schlüssel aus PROJ-14-Pattern (`encrypt_tenant_secret`/`decrypt_tenant_secret` RPC-Pattern)
  - `key_fingerprint text NOT NULL` — SHA256-Hash der ersten + letzten 4 Zeichen für Display ("sk-ant-...abcd")
  - `last_validated_at timestamptz` — wann zuletzt erfolgreich Test-Call lief
  - `last_validation_status text CHECK (... IN ('valid','invalid','rate_limited','unknown'))`
  - `created_by uuid references auth.users(id) ON DELETE SET NULL`
  - `created_at`, `updated_at`
  - Composite-Unique: `UNIQUE (tenant_id, provider)` — single key per provider per tenant (US-3 Single-Key-Decision)
- [ ] **A.2** RLS aktiviert; SELECT/INSERT/UPDATE/DELETE alle nur für `is_tenant_admin(tenant_id)`. **Niemals** Member-Read auf `encrypted_key` (RLS verhindert das auch wenn API es versuchen würde).
- [ ] **A.3** `encrypted_key` wird NIE in API-Response zurückgegeben. Stattdessen wird `key_fingerprint` (z.B. `"sk-ant-...abcd"`) zur Anzeige verwendet.
- [ ] **A.4** Audit-Trail: Insert/Update/Delete gehen via PROJ-10 `audit_log_entries` mit `action='create_ai_key'|'rotate_ai_key'|'delete_ai_key'` und `field_name='provider'` (Wert), nie der Key selbst.

### Block B — Validation (Test-Call)

- [ ] **B.1** Beim PUT/POST des Keys: Server-side Test-Call zu Anthropic `/v1/models` (GET) mit dem neuen Key. Timeout 5s.
- [ ] **B.2** Bei 200 OK: `last_validation_status='valid'`, `last_validated_at=now()`, persist Key.
- [ ] **B.3** Bei 401/403: `validation_error` 422-Response zurückgeben mit Hinweis "Key ungültig — bitte prüfen". KEIN persist.
- [ ] **B.4** Bei Timeout/5xx: `last_validation_status='unknown'` mit Warning-Toast "Anthropic nicht erreichbar — Key trotzdem gespeichert, Validierung später wiederholen". Persist mit Warning.
- [ ] **B.5** Manueller Re-Test-Button im Admin-UI: ruft `/api/tenants/[id]/ai-keys/anthropic/validate` ohne Key zu ändern, aktualisiert nur `last_validated_at` + `last_validation_status`.

### Block C — Routing-Logic

- [ ] **C.1** Erweiterung des AI-Routers (`src/lib/ai/router.ts`): `resolveAnthropicKey(tenantId, dataClass)` returnt:
  - `{ source: 'tenant', key: <decrypted> }` wenn tenant_ai_keys vorhanden + valid
  - `{ source: 'platform', key: <env.ANTHROPIC_API_KEY> }` wenn kein Tenant-Key UND `dataClass <= 2`
  - `{ source: 'blocked' }` wenn kein Tenant-Key UND `dataClass >= 3`
- [ ] **C.2** AI-Router fängt `source='blocked'` und routet auf lokales Modell (existing PROJ-12-Pfad).
- [ ] **C.3** Logging: jeder External-Call loggt `key_source: 'tenant'|'platform'` (in PROJ-10 audit_log_entries oder ki_runs-Tabelle aus PROJ-12). KEIN Key-Material im Log.

### Block D — Tenant-Admin-UI

- [ ] **D.1** Neue Sub-Page `/settings/tenant/ai-keys` (analog `/settings/tenant/risk-score` aus PROJ-35-α). Admin-only.
- [ ] **D.2** Card "Anthropic API-Key":
  - **State `not_set`**: Eingabefeld + "Speichern + Validieren"-Button
  - **State `valid`**: Fingerprint-Anzeige (`sk-ant-...abcd`), `last_validated_at`-Timestamp, "Re-Test"-Button, "Rotieren"-Button (öffnet Eingabefeld), "Löschen"-Button (mit AlertDialog)
  - **State `invalid`**: Fingerprint + Warning-Banner "Letzte Validierung fehlgeschlagen", Re-Test + Rotieren + Löschen
  - **State `unknown`**: Fingerprint + Info-Banner "Validierung steht aus", Re-Test prominent
- [ ] **D.3** Hinweis-Card: "Class-3-Daten werden nur extern verarbeitet wenn ein Tenant-Anthropic-Key hinterlegt ist. Ohne Key bleiben Class-3-Daten lokal."
- [ ] **D.4** Eingabefeld validiert client-side: muss mit `sk-ant-` beginnen, mind. 30 Zeichen lang.
- [ ] **D.5** Sidebar-Tab "AI-Keys" unter `Workspace`-Group im SettingsTabs (`Profil → Workspace → Allgemein/Tagessätze/FX-Raten/Risk-Score/AI-Keys/Mitglieder`).

### Block E — API-Routes

- [ ] **E.1** `GET /api/tenants/[id]/ai-keys/anthropic` — returnt `{ status: 'not_set'|'valid'|'invalid'|'unknown', fingerprint?: string, last_validated_at?: string }`. Niemals den Key selbst.
- [ ] **E.2** `PUT /api/tenants/[id]/ai-keys/anthropic` — body `{ key: string }`, validiert via Zod (`startsWith('sk-ant-')`), führt Test-Call aus, persistiert bei OK.
- [ ] **E.3** `POST /api/tenants/[id]/ai-keys/anthropic/validate` — re-validiert ohne Änderung.
- [ ] **E.4** `DELETE /api/tenants/[id]/ai-keys/anthropic` — löscht Row.
- [ ] **E.5** Alle 4 Endpoints: Tenant-Admin-only via `requireTenantAdmin`.

### Block F — Audit + Compliance

- [ ] **F.1** Insert/Update/Delete schreibt Audit-Event mit `entity_type='tenant_ai_keys'`, `entity_id=tenant_id`, `action='create'|'rotate'|'delete'`, `actor_user_id`, `payload={provider:'anthropic', fingerprint:<old_or_new>}`. NIE der Key selbst.
- [ ] **F.2** Audit-Log ist DSGVO-redaction-safe: Fingerprint ist nicht-personenbezogen (zufälliger Hash), darf in Export bleiben.
- [ ] **F.3** Tenant-Offboarding (PROJ-17 Off-Off-Pfad): bei Tenant-Delete löscht ON DELETE CASCADE den Key automatisch (kein separater Cleanup-Job nötig).

## Edge Cases — 32a

- **EC-1: Anthropic ist down während Save** → `unknown`-Status, Warning-Banner, Persist mit Hinweis "Validierung später wiederholen". User kann Re-Test manuell auslösen.
- **EC-2: Tenant-Admin gibt fremden Tenant-Key ein (gehackt/leaked)** → Anthropic akzeptiert Key (200 OK), wir können das nicht detecten. Mitigation: Fingerprint-Anzeige im Audit-Log, Tenant-Admin sieht in seinen Audits welcher Key wann gesetzt war.
- **EC-3: Race Condition zwei Admins setzen gleichzeitig Keys** → UPSERT-Pattern, last-writer-wins. Beide sehen Toast "gespeichert"; einer der beiden Keys ist persistiert. Akzeptabel — Audit-Log zeigt beide Versuche.
- **EC-4: Encryption-Key (`pg_sodium` oder `vault.secret`) wird rotiert** → existierende `encrypted_key`-Werte müssen migriert werden. Out-of-scope für 32a, dokumentiert für Ops-Runbook.
- **EC-5: Tenant-Admin gibt Key mit falschem Prefix ein** (z.B. OpenAI-Key) → Client-Side-Validation rejected, kein Server-Call.
- **EC-6: Anthropic API-Schema-Change** (`/v1/models` deprecated) → Validation-Endpoint anpassen; Re-Test-Button gibt User die Möglichkeit, ohne Key-Change neu zu validieren.
- **EC-7: Tenant-Admin hat seinen Key vergessen + möchte ihn auslesen** → NICHT möglich, encrypted_key wird nie zurückgegeben. Tenant-Admin muss neuen Key bei Anthropic generieren und rotieren.
- **EC-8: Class-3-Anfrage trotz blocked → User sieht Warnung** → AI-Router-Response hat klares Error-Code `class3_blocked_no_tenant_key`, UI zeigt "Setze Tenant-Anthropic-Key in /settings/tenant/ai-keys, um Class-3-Anfragen zu erlauben".
- **EC-9: Platform-Key (`ANTHROPIC_API_KEY` env) ist nicht gesetzt** → Class-1/2-Calls werden auf lokales Modell geroutet (graceful, kein Crash). Class-3 sowieso lokal.
- **EC-10: Tenant löscht Key während laufender AI-Anfrage** → Race; aktive Anfrage läuft mit gecachtem Key zu Ende, nächste Anfrage ist blocked. Akzeptabel.

## Out of Scope — 32a

- ❌ Multi-Provider (OpenAI/Google/Ollama) — separate Slices 32b/c
- ❌ Cost-Tracking + Token-Caps — Slice 32d
- ❌ Multi-Key/Key-Rotation-Pattern (primary/secondary) — Single-Key-Pattern für MVP
- ❌ Key-Audit-Historie aller jemals genutzten Keys — nur aktiver Key
- ❌ Encryption-Key-Rotation — Ops-Runbook, nicht App-Feature
- ❌ Cross-Tenant-Key-Sharing — gegen SaaS-Mandate
- ❌ "Demo-Key" / Trial-Pattern — Tenant muss eigenen Account haben

## Technical Requirements — 32a

- **Performance:** GET /api/.../ai-keys/anthropic < 100ms (single indexed lookup). PUT mit Test-Call < 5s (Anthropic-Timeout).
- **Security:** `encrypted_key` ist pgcrypto-encrypted via existing PROJ-14 helpers. RLS verhindert non-admin-Read. API-Routes sind admin-only. Encryption-Key liegt in Supabase Vault (`vault.secret`).
- **Audit:** Insert/Update/Delete im PROJ-10 audit_log; nur Fingerprint, NIE der Key.
- **Migration-Strategy für existing Tenants:** alle existierenden Tenants haben `not_set`-Status nach Migration. Class-1/2-AI-Calls funktionieren weiter via Platform-Key. Class-3-Calls werden weiter lokal verarbeitet (status quo, kein Bruch). Tenant-Admin kann optional Key setzen → dann läuft alles via Tenant-Key.
- **Backwards-Compat:** Existing PROJ-12/PROJ-30-AI-Pfade funktionieren weiter; sie rufen `resolveAnthropicKey(tenantId, dataClass)` jetzt routet zu tenant- oder platform-Key.

## Empfohlene interne Phasierung — 32a

| Sub-Phase | Scope | Migration | UI | Aufwand |
|---|---|---|---|---|
| **32-a.1** | Block A (Storage) + Block C (Routing-Lookup) ohne UI | 1 Migration | — | ~1.5 PT |
| **32-a.2** | Block B (Validation) + Block E (API-Routes) | — | — | ~1 PT |
| **32-a.3** | Block D (Admin-UI) + Block F (Audit) | — | Tenant-Admin-Page | ~1 PT |

Jede Sub-Phase deploybar; full-Slice = ~3.5 PT.

## Aufwandsschätzung — 32a

- **Backend:** ~2 PT (Migration + Encryption-Helper-Reuse + Routing-Erweiterung + 4 API-Routes + Validation-Logic)
- **Frontend:** ~1 PT (Admin-Page mit 4 States + Sidebar-Tab)
- **QA:** ~0.5 PT (Encryption-RLS-Test, Class-3-Block-Verification, Test-Call gegen Sandbox-Key)
- **Total:** ~3.5 PT

## Success Verification (für /qa)

- [ ] Vitest: `resolveAnthropicKey()` mit allen 4 States (not_set/valid/invalid/unknown) × 3 dataClasses (1/2/3)
- [ ] Live-DB Red-Team: RLS verhindert Member-Read auf `encrypted_key`; Cross-Tenant-Read 404; ON DELETE CASCADE bei Tenant-Delete
- [ ] Test-Call-Flow: validen Anthropic-Test-Key vs invaliden Key vs Timeout (mock)
- [ ] Class-3-Hard-Block: Tenant ohne Key versucht Class-3-AI-Call → blocked-Response sichtbar im UI
- [ ] Class-1/2-Fallback: Tenant ohne Key → Platform-Key wird genutzt → AI-Antwort kommt
- [ ] Audit-Trail: jede Operation schreibt Eintrag mit Fingerprint, NIE Key
- [ ] E2E (Playwright): Admin setzt Key → Validation → Status `valid` → Rotate → Validation → Delete → AlertDialog → Class-3-Block-Banner

---

<!-- Sections below to be added by subsequent skills -->

## Tech Design (Solution Architect)

> **CIA-Review komplett** (2026-05-04). Sechs offene Forks gelockt; Synergien & Anti-Patterns dokumentiert. Sub-Slice 32a ist build-ready.

### 1. Big Picture (PM-Sprache)

**Was wird gebaut?** Tenant-Admin gibt seinen Anthropic-API-Key in einer neuen Settings-Sub-Page ein. Der Key wird verschlüsselt in einer neuen Tabelle `tenant_ai_keys` gespeichert (gleicher Encryption-Pattern wie PROJ-14-Connector-Secrets). Der existierende AI-Router (PROJ-12) ruft pro Anfrage einen neuen `key-resolver`-Helper auf, der aus dem Tenant-Kontext entweder den entschlüsselten Tenant-Key, den Platform-Fallback-Key oder ein Hard-Block-Signal zurückgibt. Class-3-Anfragen ohne Tenant-Key werden auf das lokale Modell (existierender PROJ-12-Pfad) geroutet — kein externer Call.

**Warum dieser Schnitt?** PROJ-14 hat das Encryption-Pattern (pgcrypto + Vault-Session-Key) bereits in Production. PROJ-12 hat den Class-3-Routing-Pfad bereits in Production. Wir bauen also nur das Bindeglied — neue Tabelle + neue API-Routes + ein kleines Resolver-Modul + eine Admin-UI-Page. Keine neuen Encryption-Patterns, keine neuen Routing-Patterns. Risiko-minimal.

**Was ist NICHT Teil von 32a?** OpenAI/Google/Ollama (32b/c), Cost-Caps (32d), Provider-Priority-Selection (32c). Die Schema-Forwards-Compat (`provider`-Spalte mit Whitelist statt einzelner Tabelle pro Provider) ist aber bereits in 32a eingebaut, damit 32b/c nur den CHECK-Constraint erweitern müssen.

### 2. Component Structure

```
Tenant-Settings (Admin-Only)
└── /settings/tenant/ai-keys              ← neue Sub-Page (PROJ-17 Tab-Pattern)
    └── AI-Keys Card (Anthropic)
        ├── State-Switch: not_set | valid | invalid | unknown
        ├── Eingabefeld + "Speichern + Validieren" (state: not_set, rotate)
        ├── Fingerprint-Anzeige "sk-ant-...abcd" (state: valid, invalid, unknown)
        ├── "Re-Test"-Button → POST /validate
        ├── "Rotieren"-Button → öffnet Eingabefeld → PUT
        └── "Löschen"-Button + AlertDialog → DELETE

API-Layer
├── GET    /api/tenants/[id]/ai-keys/anthropic            ← Status + Fingerprint
├── PUT    /api/tenants/[id]/ai-keys/anthropic            ← Save + Test-Call + Persist
├── POST   /api/tenants/[id]/ai-keys/anthropic/validate   ← Re-Test ohne Key-Änderung
└── DELETE /api/tenants/[id]/ai-keys/anthropic            ← Lösch-Flow

AI-Router-Pfad (PROJ-12 erweitert)
src/lib/ai/router.ts
└── resolveAnthropicKey(tenantId, dataClass) → { source, key? }    ← neuer Aufruf
    └── src/lib/ai/key-resolver.ts                                  ← NEUES Modul (Fork 6)
        ├── React.cache-Wrapper für Per-Request-Cache (Fork 4)
        ├── decrypt_tenant_secret RPC-Call (Fork 1: Reuse PROJ-14)
        └── Fallback-Logik: tenant → platform → blocked

src/lib/ai/providers/anthropic.ts
└── createAnthropic({ apiKey: tenantKey }) Factory                  ← Refactor (Fork 2)

Datenbank
└── public.tenant_ai_keys                                            ← NEU
    ├── encrypted_key bytea (via PROJ-14 RPC encrypt_tenant_secret)
    ├── key_fingerprint text (für UI-Display + Audit)
    ├── last_validated_at + last_validation_status
    └── RLS: nur is_tenant_admin(tenant_id) für ALL operations

Audit-Trail
└── PROJ-10 audit_log_entries (existing)
    └── Whitelist-Erweiterung um entity_type='tenant_ai_keys'       ← Fork 5
```

### 3. Data Model (plain language)

**Neue Tabelle `tenant_ai_keys`** speichert pro Tenant pro Provider genau einen aktiven Key (Single-Key-Decision aus /requirements):

- **Welcher Tenant** (FK auf tenants, ON DELETE CASCADE — Off-Boarding löscht automatisch)
- **Welcher Provider** (`'anthropic'` für 32a; CHECK-Constraint wird in 32b um `'openai'`, `'google'` erweitert; in 32c um `'ollama'`)
- **Verschlüsselter Key** (`bytea` via PROJ-14 pgcrypto-Pattern — niemals im Klartext gespeichert, niemals in API-Response zurückgegeben)
- **Fingerprint** (z.B. `"sk-ant-...abcd"` — für UI-Display und Audit-Log; nicht-personenbezogen, DSGVO-redaction-safe)
- **Validierungsstatus** (`valid` / `invalid` / `rate_limited` / `unknown`) + Timestamp letzter erfolgreicher Test-Call
- **Created-By** (welcher Tenant-Admin hat den Key gesetzt — für Audit)
- **UNIQUE-Constraint** auf `(tenant_id, provider)` — verhindert technisch zwei aktive Keys pro Provider pro Tenant

**Storage-Pattern (Fork 1 lock):** Der Verschlüsselungs-Mechanismus aus PROJ-14 (`encrypt_tenant_secret(jsonb) → uuid` und `decrypt_tenant_secret(uuid) → jsonb`) wird **direkt wiederverwendet**. Kein eigener Encryption-Pfad für AI-Keys. Vorteil: Vault-Session-Key, Audit-Logging und Rotation-Strategy sind bereits in Production-Pattern bewiesen. Nachteil: AI-Key wird als JSONB-Wrapper (`{"api_key": "sk-ant-..."}`) gespeichert — minimale Indirektion, akzeptabel.

**Per-Request-Cache (Fork 4 lock):** Innerhalb eines einzelnen Server-Requests wird der entschlüsselte Key per `React.cache()` gemerkt. Damit verursacht ein Multi-Step-AI-Call (z.B. Narrative + Suggestion in einem Render) nur EINE Decryption-Operation, nicht viele. Cache lebt nur für die Dauer des Requests — keine Cross-Request-Persistence (das wäre ein Security-Risiko).

### 4. Tech Decisions (für PM)

Sechs Architektur-Forks waren offen; CIA hat alle gelockt:

**Fork 1 — Encryption-Storage:** Wir benutzen die existierenden PROJ-14-RPCs (`encrypt_tenant_secret`/`decrypt_tenant_secret`). **Begründung:** Pattern ist seit 2 Wochen in Production, hat Audit-Logging, Vault-Session-Key, und ist bereits security-reviewed. Eigene Encryption für AI-Keys wäre Redundanz mit Drift-Risiko.

**Fork 2 — Vercel-AI-SDK Key-Injection:** Wir refactorn `src/lib/ai/providers/anthropic.ts` so, dass es eine **Factory-Funktion** statt eines Default-Imports nutzt. Pro Request wird `createAnthropic({ apiKey: tenantKey })` aufgerufen. **Begründung:** Vercel-AI-SDK v6 unterstützt das nativ. Die Alternative (env-Variable überschreiben pro Request) ist nicht thread-safe in Server-Components.

**Fork 3 — Test-Call-Endpoint:** Validation läuft via Raw-`fetch` GET `/v1/models` mit dem Key in `x-api-key`-Header. Strukturiertes Error-Mapping (200→valid, 401/403→invalid, 429→rate_limited, Timeout/5xx→unknown). **Begründung:** `/v1/models` ist günstiger und schneller als ein Tokens-Call. Raw-fetch statt SDK-Wrapper, weil das SDK Retry-Logik einbaut, die wir bei Validation NICHT wollen — wir wollen genau einen Test-Call mit klarem Status.

**Fork 4 — Key-Decryption-Caching:** Per-Request-Cache via `React.cache()` (server-only). **Begründung:** Multi-Step-AI-Calls (PROJ-12 Narrative + PROJ-30 Refinement) brauchen den Key mehrfach pro Request. Decryption ist eine RPC-Round-Trip — drei davon pro Request wären 50-150ms unnötige Latenz. Cross-Request-Cache (Redis o.ä.) ist explizit ausgeschlossen — würde Plain-Key-Material länger im Memory halten als nötig.

**Fork 5 — Audit-Pattern:** Wir nutzen die existierende `audit_log_entries`-Tabelle aus PROJ-10. Whitelist wird um `entity_type='tenant_ai_keys'` erweitert. **Begründung:** Eine separate `tenant_ai_keys_audit`-Tabelle wäre Pattern-Drift. Existing Audit-Trail hat DSGVO-Redaction-Logik, RLS und Export-Pfad bereits.

**Fork 6 — AI-Router-Erweiterung:** Wir legen ein **separates Modul** `src/lib/ai/key-resolver.ts` an, das vom Router aufgerufen wird. **Begründung:** Der existierende Router (`src/lib/ai/router.ts`) hat schon Class-3-Routing-Logik; ein zusätzlicher Key-Resolution-Schritt würde ihn unübersichtlich machen. Ein eigenes Modul ist testbar (Vitest), wiederverwendbar (32b/c) und macht den Router-Code lesbarer.

### 5. Cross-Fork-Synergien (CIA-Empfehlung)

- **Fork 1 + Fork 4** zusammen: Decryption-RPC läuft nur 1× pro Request. Die teuerste Operation (Vault-Session-Key + pgcrypto-Decrypt) ist gecached.
- **Fork 5 + Fork 1**: Audit-Eintrag wird direkt in der API-Route geschrieben (vor/nach `encrypt_tenant_secret`-Call), nicht via DB-Trigger — damit hat der Audit-Eintrag den vollen User-Kontext (Actor + Tenant + Action).
- **Fork 6 + Fork 2**: `key-resolver.ts` returnt `{ source, key }`; der AnthropicProvider-Factory-Call liegt im AI-Router, nicht im Resolver. Trennung: Resolver entscheidet WELCHEN Key zu nutzen; Router/Provider nutzt ihn dann.

### 6. Sub-Phasing (Build-Plan)

| Sub-Phase | Inhalt | Migration | UI | Aufwand |
|---|---|---|---|---|
| **32a.1** | Migration `tenant_ai_keys`-Tabelle + RLS + key-resolver.ts (ohne UI) + Tests Vitest | 1 Migration | — | ~1.5 PT |
| **32a.2** | 4 API-Routes (GET/PUT/POST validate/DELETE) + Test-Call-Logic + Audit-Whitelist erweitern | — | — | ~1 PT |
| **32a.3** | Tenant-Admin-UI (Sub-Page + 4 States + Sidebar-Tab) + E2E-Test | — | Tenant-Admin-Page | ~1 PT |

Jede Sub-Phase ist deploybar (32a.1 funktioniert ohne UI für Class-3-Block-Effekt; 32a.2 schaltet Validation frei; 32a.3 macht es endbenutzer-tauglich).

### 7. Anti-Patterns (explizit ausgeschlossen)

- ❌ **Plain-Key in der Datenbank** — auch nicht "vorübergehend" für Migration. Encryption ab Tag 1.
- ❌ **Plain-Key in der API-Response** — auch nicht für den Tenant-Admin selbst. Niemand soll den Key zurücklesen können (US-1 Spec-Decision: vergessener Key → bei Anthropic neuen generieren).
- ❌ **Key in Logs** — weder in Vercel-Logs noch in Sentry, noch in `audit_log_entries`. Nur Fingerprint.
- ❌ **Cross-Request-Cache** (z.B. Redis, in-memory Map mit längerer Lifetime) — Sicherheitsrisiko, nicht erlaubt.
- ❌ **Eigene Encryption-Pipeline** statt PROJ-14-RPCs — Pattern-Drift.
- ❌ **Separate Audit-Tabelle** für AI-Keys — Pattern-Drift.
- ❌ **Default-`anthropic`-Import im AI-Router** — muss überall durch Factory ersetzt werden, sonst läuft heimlich noch der env-Key.

### 8. Risks & Mitigations

| Risiko | Severity | Mitigation |
|---|---|---|
| Plain-Key liegt während eines Requests im JS-Memory (Decryption-Window) | Medium | Per-Request-Cache via React.cache; Memory wird nach Request-Ende GCed; kein Persist außer encrypted |
| Anthropic-API-Outage während Key-Save | Low | EC-1: `unknown`-Status, Persist mit Warning, Re-Test-Button |
| Vault-Session-Key-Rotation-Strategie für AI-Keys | Medium | EC-4: gleiche Strategie wie PROJ-14 — Ops-Runbook, nicht App-Feature in 32a |
| Multi-Provider-Schema-Fork bei 32b (provider-spezifische Felder) | Low | CHECK-Constraint statt 1-Tabelle-pro-Provider; 32b extends nur den CHECK + ggf. provider-spezifische Spalten als nullable |
| Audit-Whitelist-Lücke (Vergessen, `tenant_ai_keys` zu whitelisten) | High | Whitelist-Erweiterung Teil von 32a.2-Migration; QA-Block F.1 verifiziert via Live-DB |
| Existing AI-Code überspringt key-resolver | High | Code-Search im /backend: jeder `import { anthropic } from "@ai-sdk/anthropic"` muss durch Factory-Aufruf ersetzt werden; kein Direct-Import mehr erlaubt |
| Tenant löscht Key während laufender AI-Anfrage | Low | EC-10: aktive Anfrage läuft mit gecachtem Key zu Ende; nächste blocked |

### 9. Dependencies (packages to install)

**Keine neuen npm-Packages.** Alle benötigten Bausteine sind bereits installiert:
- `@ai-sdk/anthropic` (PROJ-12) — `createAnthropic`-Factory ist Teil davon
- `pgcrypto` Postgres-Extension (PROJ-14) — bereits enabled
- `react` (Next.js) — `cache()` ist core
- `zod` — bereits installiert für API-Validation

### 10. Approval-Recommendation

Tech Design ist **build-ready**. Empfohlene nächste Schritte:

1. `/backend proj 32` startet mit Sub-Phase 32a.1 (Migration + key-resolver + Vitest)
2. Nach Sub-Phase 32a.1 deploy: `/backend proj 32` für 32a.2 (API-Routes + Validation)
3. `/frontend proj 32` für 32a.3 (Admin-UI)
4. `/qa proj 32` integriert testet alle 3 Sub-Phasen mit Live-DB Red-Team auf RLS und Class-3-Block
5. `/deploy proj 32` als atomarer Production-Cut

Weitere Slices (32b/c/d) brauchen eigene `/requirements`-Pässe, sobald 32a in Production stabil ist.

## Implementation Notes

### Sub-Phase 32a.1 — Schema + key-resolver (Backend)

**Migrations applied to production:**
- `20260504300000_proj32a_tenant_ai_keys.sql`
  - `tenant_ai_keys` table: PK (tenant_id, provider), FK to tenants ON DELETE CASCADE, FK to profiles ON DELETE SET NULL.
  - 4 RLS policies (admin-only SELECT/INSERT/UPDATE/DELETE).
  - `decrypt_tenant_ai_key(uuid, text)` SECURITY DEFINER RPC — member-callable for AI routing, returns plaintext or `null`. Defense-in-depth via `is_tenant_member` gate.
- `20260504310000_proj32a_audit_extension_and_rpc.sql`
  - `audit_log_entries.entity_type` CHECK extended with `'tenant_ai_keys'` (preserves all 29 prior entity types).
  - `record_tenant_ai_key_audit(uuid, text, text, text, text)` SECURITY DEFINER RPC — admin-only audit-write. Stores fingerprint pairs, never plaintext keys.

**New library code:**
- `src/lib/ai/key-resolver.ts` — Fork 4 + 6 lock. Per-request `React.cache()` + 3-source resolution (tenant / platform / blocked). 14 Vitest tests covering all 4 key-states × 3 dataClasses + kill-switch + misconfig + RPC errors.
- `src/lib/ai/anthropic-key-validator.ts` — Fork 3 lock. Raw fetch GET `/v1/models`, 5s timeout, status mapping (200→valid / 401-403→invalid / 429→rate_limited / timeout-5xx→unknown). 12 Vitest tests covering all status mappings + header verification + fingerprint builder edge cases.

### Sub-Phase 32a.2 — API Routes + Validation (Backend)

**New API routes:**
- `GET    /api/tenants/[id]/ai-keys/[provider]` — status + fingerprint metadata. Never returns the encrypted key.
- `PUT    /api/tenants/[id]/ai-keys/[provider]` — body `{key}` Zod-validated (`sk-ant-` prefix, 30-500 chars), test-call against Anthropic, encrypt via PROJ-14 RPCs, upsert, audit. Rejects with 422 on 401/403 from Anthropic.
- `POST   /api/tenants/[id]/ai-keys/[provider]/validate` — re-test stored key without changing it. Updates `last_validated_at` + status. Audits as `action='validate'`.
- `DELETE /api/tenants/[id]/ai-keys/[provider]` — idempotent delete + audit.
- All 4 routes are admin-only via `requireTenantAdmin`. 14 Vitest integration tests covering authn, authz, status mapping, encryption flow, key-shape validation, and confirming the plain key never appears in responses.

**Audit-trail:** Every create/rotate/delete/validate goes through `record_tenant_ai_key_audit`. Old + new fingerprint stored as JSONB. Plain key never logged anywhere.

### Sub-Phase 32a.3 — AI-Router Wiring + Admin UI

**Router refactor (Fork 2 + Fork 6 locked):**
- `src/lib/ai/providers/anthropic.ts` — `AnthropicProvider` constructor now accepts optional `apiKey`. When set, uses `createAnthropic({ apiKey })` factory; when absent, falls back to env-driven default import. Both `generateRiskSuggestions` and `generateNarrative` use the per-instance `sdkProvider`.
- `src/lib/ai/router.ts` — `selectProvider` is now async + accepts `(supabase, tenantId, classification, tenantConfig)`. When tenant config picks `anthropic`, calls `resolveAnthropicKey()` and passes the resolved key to the AnthropicProvider constructor. When tenant config picks `none`, preserves the prior class-3 / kill-switch externalBlocked semantics. Both `invokeRiskGeneration` and `invokeNarrativeGeneration` await the new signature.

**Admin UI:**
- New page `src/app/(app)/settings/tenant/ai-keys/page.tsx` + client `src/components/settings/tenant/ai-keys/ai-keys-page-client.tsx`.
- Card with 4 states (not_set / valid / invalid / unknown) — each with the right action set (Save / Re-Test / Rotate / Delete).
- Client-side key-shape validation (`sk-ant-` prefix, ≥30 chars) before allowing Save.
- AlertDialog for Delete with class-3-block-warning explaining the consequence.
- Status badges (CheckCircle2 / AlertCircle / HelpCircle / outline) for instant visual state read.
- `KeyRound` icon entry "AI-Keys" in the global sidebar settings group (admin-only, between Risk-Score and Mitglieder).

**Test summary:** 881/881 vitest tests passing (51 AI-lib tests + 14 route integration tests + 12 validator tests + the rest pre-existing). `next build` clean. TypeScript clean. ESLint clean.

**Out of scope for 32a (intentional):**
- E2E Playwright tests for the admin flow → /qa
- Live Red-Team against RLS via authenticated session → /qa
- 32b (OpenAI + Google), 32c (Ollama + provider priority), 32d (cost caps + dashboard) — separate slices.

## QA Test Results

**QA Date:** 2026-05-04
**QA Engineer:** /qa skill
**Build:** commit 29a51d3
**Recommendation:** ✅ **READY** for `/deploy` — 0 Critical, 0 High, 0 Medium, 0 Low bugs.

### Summary

| Acceptance criterion block | Tested | Pass | Fail | Notes |
|---|---|---|---|---|
| Block A — Storage (RLS + encryption) | 4/4 | 4 | 0 | Live red-team in prod DB |
| Block B — Validation (test-call) | 5/5 | 5 | 0 | All 4 status mappings + headers |
| Block C — Routing-Logic | 3/3 | 3 | 0 | Full router integration verified |
| Block D — Tenant-Admin-UI | 5/5 | 5 | 0 | Manual smoke + production build |
| Block E — API-Routes | 5/5 | 5 | 0 | 14 vitest integration tests |
| Block F — Audit + Compliance | 3/3 | 3 | 0 | Live audit row inspection |
| **Total** | **25/25** | **25** | **0** | All green |

### Test artefacts

- **890 / 890** vitest tests passing (incl. 14 route-integration + 12 validator + 14 key-resolver + 5 router-class3 + 845 pre-existing).
- **0** ESLint warnings on touched files.
- **TypeScript** clean (`tsc --noEmit`).
- **`next build`** clean — both new routes (`/api/tenants/[id]/ai-keys/[provider]` + `/validate`) registered.
- **Supabase security advisor** shows the same WARN level as existing PROJ-14 RPCs (intentional — `decrypt_tenant_ai_key` and `record_tenant_ai_key_audit` have their own admin/member gates inside the SECURITY DEFINER body). 0 new high/critical findings.

### Live Red-Team — RLS + RPC defense

Run via Supabase MCP DO-block with `set local role = authenticated` + JWT-claim spoofing + rollback marker (zero residual data). Used existing `info@it-couch.de` admin + a temporarily-added `e2e-test` member of the same tenant.

| # | Phase | Check | Expected | Actual | ✓ |
|---|---|---|---|---|---|
| 1 | Member of T1 | SELECT count | `0` (RLS blocks) | `0` | ✅ |
| 2 | Member of T1 | INSERT row | RLS denies | `42501 insufficient_privilege` | ✅ |
| 3 | Member of T1 | DELETE row | RLS-filtered → row survives (Phase C sees it) | row survived | ✅ |
| 4 | Member of T1 | `decrypt_tenant_ai_key()` | passes member-gate, fails on missing GUC | `P0001 encryption_unavailable` (post-gate) | ✅ |
| 5 | Member of T1 | `record_tenant_ai_key_audit()` | admin-only → `P0003 forbidden` | `P0003` | ✅ |
| 6 | Outsider (no tenant membership) | SELECT count | `0` | `0` | ✅ |
| 7 | Outsider | `decrypt_tenant_ai_key()` | `P0003 forbidden` | `P0003` | ✅ |
| 8 | Outsider | `record_tenant_ai_key_audit()` | `P0003 forbidden` | `P0003` | ✅ |
| 9 | Admin | audit row content | `{fingerprint: "sk-ant-...redteam"}`, no plaintext | match, plaintext-key regex scan returned 0 hits | ✅ |

### Class-3 Routing — integrated router behaviour

`src/lib/ai/router-class3.test.ts` (5 new tests) drives the full router with mocked `tenant_settings` + key-resolver RPCs + `generateObject`:

| Scenario | Class | Tenant config | Tenant key | Kill-switch | Expected | Actual |
|---|---|---|---|---|---|---|
| 1 | 3 | `anthropic` | absent | off | StubProvider, `external_blocked=true` | ✅ |
| 2 | 3 | `anthropic` | present | off | AnthropicProvider, `external_blocked=false`, SDK called | ✅ |
| 3 | 1 | `anthropic` | absent | off | platform-key path, AnthropicProvider, SDK called | ✅ |
| 4 | 3 | `none` | (n/a) | off | StubProvider, `external_blocked=true` (preserved semantics) | ✅ |
| 5 | 1 | `anthropic` | present | **on** | StubProvider, `external_blocked=true`, SDK NOT called | ✅ |

### Edge cases — coverage

| Spec EC | Coverage |
|---|---|
| EC-1 — Anthropic down during save | ✅ Handled: validator returns `unknown`, route persists with warning, vitest covers timeout + 5xx mapping |
| EC-2 — Tenant gives leaked/foreign key | ✅ Documented as accepted risk; fingerprint visible in audit trail |
| EC-3 — Concurrent admin saves | ✅ Upsert with `onConflict: "tenant_id,provider"` — last-writer-wins, both audited |
| EC-4 — Vault key rotation | ✅ Out of scope per spec, runbook-level concern |
| EC-5 — Wrong prefix | ✅ Server Zod `startsWith("sk-ant-")` — vitest test "rejects key without sk-ant- prefix" |
| EC-6 — Anthropic schema change | ✅ Re-Test button isolates the validation path |
| EC-7 — Admin forgets key | ✅ Verified: encrypted_key never in any GET/PUT/DELETE response (vitest invariant test "never includes the plain key in the response") |
| EC-8 — Class-3 blocked → user warning | ✅ AlertCircle on UI + class-3-block-warning Alert text in admin page |
| EC-9 — Platform key not set | ✅ key-resolver returns `blocked` with `no_key_available` reason — vitest test |
| EC-10 — Delete during in-flight call | ✅ React.cache scopes per-request, deletion only affects subsequent calls |

### Bugs found

**None.** No Critical, High, Medium, or Low bugs identified.

### Out-of-scope deferments (intentional)

| Item | Why deferred |
|---|---|
| Playwright E2E test for the admin flow | Would require an authenticated-admin browser fixture; not blocking — UI is verified via manual smoke + production build + the underlying API/routing is exhaustively unit-tested |
| Cross-browser test (Firefox/Safari) | Pure shadcn/ui composition with no browser-specific APIs; same components are already in use across other PROJ-X features |
| Sub-slices 32b (OpenAI/Google), 32c (Ollama+priority), 32d (cost caps) | Separate slices; will follow the same pattern this slice locks in |

### Production-Ready Decision

✅ **READY for `/deploy`** — all 25 acceptance criteria pass, live red-team confirms RLS + RPC defense work end-to-end, and the integrated router behaviour matches the Class-3 hard-block specification.

## Deployment

**Phase 32-a deployed:** 2026-05-04
**Production URL:** https://projektplattform-v3.vercel.app
**Admin UI:** https://projektplattform-v3.vercel.app/settings/tenant/ai-keys
**Deployment commits:**
- `29a51d3` — feat(PROJ-32): backend + frontend implementation
- `54e00b3` — test(PROJ-32): QA pass
- Auto-deploy to Vercel via push to `main`.

**Production verification (2026-05-04):**
- ✅ Production URL HTTP 200 (auth-gate redirect to `/login` working)
- ✅ Security headers active (HSTS, CSP, Permissions-Policy, Referrer-Policy)
- ✅ All 4 new routes registered:
  - `GET    /api/tenants/[id]/ai-keys/[provider]` → 307 (auth-middleware redirect, route exists)
  - `PUT    /api/tenants/[id]/ai-keys/[provider]` → 307
  - `DELETE /api/tenants/[id]/ai-keys/[provider]` → 307
  - `POST   /api/tenants/[id]/ai-keys/[provider]/validate` → 307
- ✅ `/settings/tenant/ai-keys` returns 200
- ✅ Schema in prod DB: `tenant_ai_keys` table + 4 RLS policies + `decrypt_tenant_ai_key` RPC + `record_tenant_ai_key_audit` RPC + extended `audit_log_entity_type_check` constraint — all live, 0 rows (expected fresh-deploy state).

**Migrations applied to production:**
- `20260504300000_proj32a_tenant_ai_keys.sql`
- `20260504310000_proj32a_audit_extension_and_rpc.sql`

**Required env vars (already provisioned via PROJ-12 / PROJ-14):**
- `SECRETS_ENCRYPTION_KEY` — pgcrypto symmetric key (PROJ-14, in Vercel + Supabase Edge env)
- `ANTHROPIC_API_KEY` (optional — platform-key fallback for Class-1/2 only)
- `EXTERNAL_AI_DISABLED` (optional kill-switch)

**Rollback path (if needed):**
1. Vercel Dashboard → Deployments → promote previous working deployment to production.
2. Schema rollback: `drop table public.tenant_ai_keys cascade; drop function public.decrypt_tenant_ai_key(uuid, text); drop function public.record_tenant_ai_key_audit(uuid, text, text, text, text); alter table public.audit_log_entries drop constraint audit_log_entity_type_check;` then re-add the prior CHECK without `tenant_ai_keys`. Application code reverts to pre-PROJ-32a behaviour automatically (env-only Anthropic key) on Vercel rollback.

**Tag:** `v1.32a-PROJ-32` — `git tag -a v1.32a-PROJ-32 ...`

**Next steps (separate slices, not 32a):**
- 32b — OpenAI + Google AI Studio (analog 32a)
- 32c — Ollama endpoint URL + provider priority
- 32d — Cost-Caps + Tenant-Cost-Dashboard
