# PROJ-32: Tenant Custom AI Provider Keys (Multi-Provider)

## Status: Planned (Phase 32-a specced)

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
_To be added by /architecture (CIA-Review zwingend — kreuzt PROJ-12, PROJ-14, PROJ-17 deployed; introduces Encryption-At-Rest-Pattern für AI-Keys)._

## Implementation Notes
_To be added by /backend + /frontend._

## QA Test Results
_To be added by /qa._

## Deployment
_To be added by /deploy._
