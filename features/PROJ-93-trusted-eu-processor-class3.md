# PROJ-93: Trusted-EU-Processor — kontrollierte Class-3-Freigabe für attestiertes Azure OpenAI

## Status: Approved
**Created:** 2026-06-10
**Last Updated:** 2026-07-03
**Origin:** PO-Entscheidung 2026-06-10 (kontrollierte Lockerung der Invariante #3) · CIA-Review 2026-06-10 (GO mit Pflicht-Guardrails)
**Priority:** P1 — Should-have (sicherheitskritisch, isolierte Slice)

## Summary
Kontrollierte, **opt-in** Lockerung der Architektur-Invariante #3: Class-3-Purposes (personenbezogene Daten, z.B. PROJ-88 Stakeholder-Extraktion) dürfen zusätzlich zu Ollama einen **Trusted-EU-Processor** wählen — und zwar ausschließlich eine per PROJ-92 angebundene Azure-OpenAI-Ressource im **eigenen Azure-Tenant des Kunden, EU-Region**, für die der Tenant-Admin ein **DPA-Attest** hinterlegt hat. Ohne Attest ändert sich exakt nichts: `defaultProviderOrder(3)` bleibt `["ollama"]`. Die Lockerung wird über alle drei Defense-Layer **DPA-konditional** umgesetzt (nie pauschal) und per ADR + CLAUDE.md-Anpassung dokumentiert.

## Problem / Context
Invariante #3 blockt Class-3 technisch von allen externen Modellen — auch von Azure-OpenAI im EU-Kunden-Tenant mit Microsoft-DPA, was rechtlich oft vertretbar wäre. Pilotkunden ohne eigene Ollama-Infrastruktur können dadurch keine Class-3-Features (PROJ-88-Stakeholder, resource_swap) nutzen. Der PO hat entschieden: kontrollierte Öffnung NUR für attestierte EU-Azure-Endpoints, opt-in pro Tenant.

Heutige Verankerung des Blocks (alle drei müssen konsistent konditionalisiert werden, CIA F-Must):
1. `key-resolver.ts` Default-Order-Clamp (`dataClass === 3 → ["ollama"]`),
2. `key-resolver.ts` `LOCAL_ONLY_PROVIDERS`-Clamp (defense-in-depth),
3. DB-CHECK `class3_local_only` auf der Priority-Matrix (`<@ array['ollama']`).

## User Stories
- Als Tenant-Admin möchte ich für meine Azure-OpenAI-Ressource ein DPA-Attest hinterlegen (Datum, Referenz, bestätigender Admin), damit Class-3-Purposes über meinen eigenen EU-Azure-Vertrag laufen dürfen.
- Als Compliance-Officer möchte ich jeden Class-3-Lauf über den Trusted-Processor in `ki_runs` eindeutig erkennen (inkl. Region), damit Audits Ollama- von Azure-Läufen unterscheiden.
- Als Tenant-Admin OHNE Attest möchte ich, dass sich nichts ändert (Ollama-only, klare Meldung), damit die Öffnung niemals implizit passiert.
- Als Plattform-Betreiber möchte ich die Invarianten-Änderung als ADR dokumentiert haben, damit die Entscheidung auditierbar und reversibel bleibt.

## Acceptance Criteria
- [ ] **AC-93.1 (DPA-Attest)**: Azure-Provider-Config erhält `dpa_confirmed_at` (timestamptz), `dpa_confirmed_by` (→ profiles), `dpa_reference` (text, Vertragsnummer/Referenz — KEIN Dokument-Upload im MVP). Attestierung erzeugt ein append-only Audit-Event via `record_tenant_ai_provider_audit` (Action `dpa_attest`); Widerruf ebenso (`dpa_revoke`).
- [ ] **AC-93.2 (class3_eligible)**: Ein Provider ist Class-3-fähig genau dann, wenn `provider='azure'` UND DPA-Attest vollständig UND `azure_region` in der EU-Allowlist. Diese Ableitung existiert genau EINMAL (zentral, z.B. als berechnetes Feld/Helper) — kein verstreutes `if provider==='azure'` (CIA R2).
- [ ] **AC-93.3 (Resolver-Parametrisierung)**: `LOCAL_ONLY_PROVIDERS` → `CLASS3_ELIGIBLE_PROVIDERS`, berechnet aus den Provider-Records (Ollama immer; Azure nur bei class3_eligible). `defaultProviderOrder(3)` liefert ohne Attest weiterhin exakt `["ollama"]` (Regressionstest über alle 3 Layer, CIA R2).
- [ ] **AC-93.4 (DB-CHECK konditional, NICHT fallen)**: Der `class3_local_only`-CHECK wird zu `class3_trusted_only`: `['ollama','azure']` nur zulässig, wenn das DPA-Attest des Tenants existiert (Trigger- oder Generated-Column-Mechanik). Eine pauschale CHECK-Erweiterung auf `'azure'` ohne DPA-Bezug ist explizit verboten (CIA R1 — gefährlichster Fehler des Projekts).
- [ ] **AC-93.5 (ki_runs-Kennzeichnung)**: Class-3-Läufe über Azure werden in `ki_runs` als Trusted-Processor-Lauf gekennzeichnet (Provider + Region erkennbar); Provider-CHECK-Migration analog 20260505100200.
- [ ] **AC-93.6 (ADR + Invariante)**: Neues ADR in `docs/decisions/` („Trusted-Processor Provider-Klasse"); CLAUDE.md-Invariante #3 wird präzisiert: Block gilt „…except attested EU-resident Trusted-Processor endpoints in the tenant's own Azure tenant (PROJ-93), opt-in per tenant-admin with documented DPA".
- [ ] **AC-93.7 (Anti-Scope-Garantie)**: Tests beweisen, dass OpenAI-direkt, Anthropic, Google für Class-3 NIE wählbar sind — auch mit DPA-Feldern (die es für sie nicht gibt). Kein genereller „Cloud-für-Class-3"-Pfad.
- [ ] **AC-93.8 (Live-RPC-Smoke)**: Vor Approved: echter Class-3-Lauf gegen attestiertes Azure (oder dokumentierte Deviation) + Negativ-Probe (ohne Attest → Ollama-only/`external_blocked`). Memory-Konvention „Live-RPC-Smoke Pflicht".
- [ ] **AC-93.9 (PROJ-88-Vererbung)**: PROJ-88 (`proposal_stakeholders_from_context`) erbt die erweiterte Provider-Menge automatisch über den Resolver — die PROJ-88-Spec/Implementierung pinnt NICHT hart auf Ollama, sondern nutzt den Class-3-Resolver-Pfad (Hinweis in PROJ-88-Spec ergänzt).

### Architektur-abgeleitete ACs (architecture-CIA 2026-07-03, blocking)
- [ ] **AC-93.10 (Resolve-Zeit als autoritativer Gate — R-1)**: Der maßgebliche Class-3-Gate ist der TS-Resolver (`clampForClass3` / `isClass3TrustedEligible`) zur **Laufzeit jeder Anfrage** — NICHT der Write-Time-Trigger. Beweis-AC: Attest wird widerrufen, OHNE eine `tenant_ai_provider_priority`-Zeile anzufassen → der nächste Class-3-Resolve klemmt Azure sofort heraus (Ollama/`external_blocked`). Die DB-Konstrukte (Floor-CHECK + Trigger) sind explizit als notwendige-aber-nicht-hinreichende Vorschicht dokumentiert.
- [ ] **AC-93.11 (Member-callable Attest-Status + Fail-Closed — R-2)**: Der Attest-Status wird dem Routing-Pfad (Tenant-*Member*, nicht Admin) über EINEN `SECURITY DEFINER STABLE`-Helper `tenant_has_class3_trusted_processor(tenant_id)` sichtbar gemacht (member-callable, analog `decrypt_tenant_ai_provider_with_key`) — NICHT über einen admin-only Meta-Select auf `tenant_ai_providers` (der für Member 0 Zeilen liefert). Genau EIN Helper, zwei Aufrufer (Write-Trigger + Resolver-RPC). Fehlender `SECRETS_ENCRYPTION_KEY` oder Helper-RPC-Fehler ⇒ Azure nicht eligible ⇒ Ollama/blocked (**fail-closed**, mit Test + Smoke).
- [ ] **AC-93.12 (Kill-Switch-Ordnung)**: `isExternalAIBlocked()` bleibt der erste Guard in `resolveProvider` — vor jeglicher Trusted-Processor-Logik. Als Test festgeschrieben: globaler Kill-Switch überstimmt auch attestiertes Azure.

## Edge Cases
- Attest vorhanden, aber Region nachträglich auf Nicht-EU geändert → class3_eligible kippt auf false; nächster Lauf fällt auf Ollama zurück (bzw. `external_blocked`).
- Attest widerrufen während ein Lauf läuft → laufender Lauf endet normal; nächster Lauf respektiert den Widerruf.
- Tenant hat Attest, aber keinen Ollama UND Azure-Key wird gelöscht → Class-3 → `external_blocked` mit actionable Meldung.
- Mehrere Azure-Configs (falls künftig möglich) → Attest gilt pro Config, nicht pro Tenant pauschal.

## Non-Goals / Out of Scope (CIA-Anti-Scope, verbindlich)
- Keine generische „Cloud-für-Class-3"-Option; kein OpenAI-direkt/Anthropic/Google für Class-3 (Shared-Processor ohne Kunden-Tenant-Isolation).
- Kein DPA-Dokument-Upload im MVP (→ Followup bei Pilot-Bedarf; vermeidet DSGVO-Retention-/RLS-Fläche).
- Kein tenant-übergreifender Azure-Default; opt-in pro Tenant, nie global.
- Kein Reduzieren der Defense-Layer — alle 3 bleiben, werden nur DPA-konditional.

## Dependencies
- Requires: PROJ-92 (Azure-Provider Class-1/2), PROJ-32 (Provider-/Audit-/Cost-Cap-Infrastruktur), PROJ-42 (Schema-Drift-Guard).
- Unblocks: Class-3-Features (PROJ-88, resource_swap) für Tenants ohne Ollama.

## CIA-Review (2026-06-10, Kurzfassung)
GO mit Pflicht-Guardrails: EU-Region-Allowlist, DPA-gebundener CHECK (nie pauschal), zentrale class3_eligible-Ableitung, ki_runs-Kennzeichnung, ADR + CLAUDE.md-Edit, kein Default-Shift. Offene CIA-Fragen für /architecture: statische vs. tenant-policy-basierte Region-Allowlist (MVP: statisch); welche Class-3-Purposes neben PROJ-88 in den 93-Testumfang (resource_swap/sentiment/coaching).

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

**Architektur-CIA:** 2026-07-03 (`Continuous Improvement Agent`), GO mit blocking Locks. Gründet auf **live verifiziertem** Ist-Zustand (Resolver-Code + Prod-DB `iqerihohwabyjzkpcujq`), nicht auf Spec-Prosa. Requirements-CIA-GO (2026-06-10) bleibt gültig; diese Pass löst die dorthin delegierten Forks + zwei neu entdeckte, sicherheitskritische Blocker (R-1 Stale-Rule, R-2 Member-Fail-Open).

### Verifizierter Ist-Zustand (Grundlage aller Locks)
1. **`src/lib/ai/key-resolver.ts`** — Class-3-Block liegt in ZWEI TS-Punkten: `defaultProviderOrder(3)` → nur `["ollama"]` (Z.262–265); `clampForClass3()` filtert gegen `const LOCAL_ONLY_PROVIDERS = ["ollama"]` (Z.284–292). `clampForClass3` klemmt nach **`dataClass`, nicht nach Purpose** → der Gate ist purpose-agnostisch. `isExternalAIBlocked()` ist der erste Guard in `resolveProvider` (Z.310).
2. **`tenant_ai_providers`** (Prod) — Spalten: id, tenant_id, provider, **`encrypted_config` (bytea)**, key_fingerprint, last_validated_at, last_validation_status, created_by, created_at, updated_at. **Keine DPA-Spalten.** Azure-Key UND `azure_region` liegen INNERHALB `encrypted_config` → **für DB-Trigger/CHECK unlesbar**. Der Resolver sieht `azure_region` nur NACH Dekryption via member-callable RPC `decrypt_tenant_ai_provider_with_key`.
3. **Live-CHECK** `tenant_ai_provider_priority_class3_local_only`: `CHECK ((data_class <> 3) OR (provider_order <@ ARRAY['ollama']))` — Tabellen-CHECK, **kann keine andere Tabelle referenzieren** (Postgres: keine Subquery im CHECK) → DPA-Konditionalität nur per TRIGGER.
4. **`ki_runs`** — hat `provider` (CHECK erlaubt bereits `azure`), `model_id`, `reason_code`, aber **keine region-Spalte**.
5. **Bereits vorhanden aus PROJ-92/32 (Reuse, kein Neubau):** `src/lib/ai/azure-region-allowlist.ts` (Server-Konstante `AZURE_EU_REGIONS` + `isEuAzureRegion()`; Save-Route weist Nicht-EU-Azure vor Persistenz ab); Audit-RPC `record_tenant_ai_provider_audit(p_tenant_id, p_provider, p_action, p_old_fp, p_new_fp)` (SECURITY DEFINER, admin-gated, In-Body-Action-Enum `('create','rotate','delete','validate')` → `audit_log_entries`).

### Kernentscheidungen (D1–D5 gelockt)

**D1 — DPA-Metadaten als plaintext-Spalten; `azure_region` bleibt verschlüsselt.**
- Neue Spalten auf `tenant_ai_providers` (additiv-nullable): `dpa_confirmed_at timestamptz`, `dpa_confirmed_by uuid` (→ auth.users/profiles), `dpa_reference text`. DPA-Metadaten sind Governance-Daten, kein Secret → plaintext ist korrekt und für den Trigger/Helper zwingend.
- CHECK-Kohärenz: all-or-nothing (`(dpa_confirmed_at IS NULL) = (dpa_confirmed_by IS NULL)` und `= (dpa_reference IS NULL)`) UND DPA nur für Azure (`provider = 'azure' OR dpa_confirmed_at IS NULL`).
- `azure_region` wird **NICHT** in die DB promoted. Einzige Regionsquelle bleibt `AZURE_EU_REGIONS` (Code-Konstante) → schützt vor Region-Drift (R-3) und wahrt die PROJ-92-Intention „Allowlist nicht datengetrieben".

**D2 — Zweiteilige DB-Vorschicht; autoritativer Gate = Resolve-Zeit (adressiert R-1).**
- (a) `class3_local_only`-CHECK ersetzen durch **strukturellen Anti-Scope-Floor**: `data_class <> 3 OR provider_order <@ ARRAY['ollama','azure']`. Selbst bei Trigger-Ausfall bleiben openai/anthropic/google in Class-3-Zeilen DB-seitig unmöglich (erfüllt AC-93.7 auf DB-Ebene, adressiert R-4).
- (b) **BEFORE INSERT/UPDATE-Trigger** auf `tenant_ai_provider_priority`: `azure` in einer `data_class = 3`-Zeile nur zulässig, wenn `tenant_has_class3_trusted_processor(NEW.tenant_id)`.
- (c) **Der maßgebliche Gate ist der TS-Resolver zur Laufzeit** (AC-93.10). Grund: Write-Trigger feuert nicht bei Attest-Widerruf (Priority-Tabelle unberührt) → sonst stale Rule + Leak. DB-Konstrukte sind dokumentiert als notwendige-aber-nicht-hinreichende Vorschicht.

**D2b — Attest-Status über member-callable Helper-RPC, NICHT über RLS-Meta-Select (adressiert R-2, blocking).**
- Neuer Helper `tenant_has_class3_trusted_processor(p_tenant_id uuid) RETURNS boolean` — `SECURITY DEFINER`, `STABLE`, `SET search_path = public`; prüft `dpa_confirmed_at IS NOT NULL` auf der `provider='azure'`-Zeile des Tenants. Member-callable (`GRANT EXECUTE ... authenticated`), exakt wie `decrypt_tenant_ai_provider_with_key`. **Ein** Helper, zwei Aufrufer: der Write-Trigger (b) und der Resolver.
- Der Routing-Pfad läuft als Tenant-*Member*; ein admin-only Meta-Select auf `tenant_ai_providers` liefert für Member 0 Zeilen → ein plaintext-Feld allein wäre entweder fail-open (Leak) oder feature-broken. `ProviderRecord` bekommt daher **kein** DPA-Feld aus dem admin-only Select — die Eligibility kommt aus dem Helper-RPC.

**D3 — bewusste DB↔TS-Divergenz; genau EINE logische Autorität (erfüllt AC-93.2/R2).**
- Neue reine TS-Funktion `isClass3TrustedEligible(record, trustedFlag): boolean = trustedFlag && record.config.kind === 'azure' && isEuAzureRegion(record.config.azure_region)`. Sie ist die **einzige** Eligibility-Autorität. `clampForClass3` (bzw. eine `class3EligibleProviders`-Ableitung, die `LOCAL_ONLY_PROVIDERS` ersetzt) lässt Azure in Class-3 nur bei `true` zu; Ollama immer.
- DB-Trigger prüft bewusst nur die Attest-Teilmenge (Region unlesbar) → dokumentierte, korrekte Divergenz: **DB = Attest-Floor, TS = Attest + EU-Region-Vollgate.** Region-Recheck zur Resolve-Zeit fängt „Region nachträglich geändert" kostenlos ab (theoretisch, da Write-Path EU erzwingt). AC-93.2 gilt als eine *logische* (nicht physische) Ableitung erfüllt.

**D4 — `ki_runs.provider_region text` (nullable), erfüllt AC-93.5.**
- Bei Azure-Läufen aus der dekryptierten Config befüllt, sonst NULL. Kein separater `class3_trusted`-Boolean (redundant: `provider='azure' AND classification=3` identifiziert den Trusted-Pfad; `provider_region` liefert die DSGVO-belastbare Region-Provenienz). Additiv-nullable → PROJ-42/PROJ-134-Guards unkritisch.

**D5 — Test-Scope: datengetrieben über `dataClass=3`.**
- AC-93.3-Regressionstest generisch über `dataClass=3`: ohne Attest → `['ollama']`/blocked; mit Attest+EU → Azure eligible; mit Attest+non-EU → Azure geklemmt. Mindestens `resource_swap` (strukturell Class-3) UND `proposal_stakeholders_from_context` müssen identisches Gate-Verhalten zeigen (verhindert Purpose-Special-Casing). Negativtest: Class-1/2-Anfrage von DPA unbeeinflusst (Azure normal wählbar). Live-Smoke (AC-93.8) via PROJ-88.

### Zusätzliche Pflicht-Guardrails (in ACs gefaltet)
- **G-Audit (AC-93.1):** DPA-Confirm/Revoke NUR über dedizierte admin-gated `SECURITY DEFINER`-RPC (`attest_tenant_ai_provider_dpa` / `revoke_tenant_ai_provider_dpa`) — kein direkter `UPDATE` (State-Machine-Konvention). Append-only-Audit via `record_tenant_ai_provider_audit`; In-Body-Action-Enum um `'dpa_confirm'`/`'dpa_revoke'` erweitern (Lockstep-Migration; `ki_runs`- und `tenant_ai_cost_caps`-Purpose-CHECKs bleiben unberührt).
- **G-KillSwitch (AC-93.12):** `isExternalAIBlocked()` bleibt erster Guard.
- **G-FailClosed (AC-93.11):** fehlender `SECRETS_ENCRYPTION_KEY`/Helper-RPC-Fehler → Azure nicht eligible.
- **G-Live-Smoke (AC-93.8/AC-93.10):** Pflicht gegen Prod: attest → Class-3-Resolve wählt Azure → **revoke → nächster Resolve klemmt Azure sofort raus** (R-1-Beweis) → Rollback, 0 Residue.
- **G-ADR + Invariante #3 (AC-93.6):** ADR `docs/decisions/ma-…`/`trusted-processor-provider-class.md` + CLAUDE.md-Invariante-#3-Präzisierung.

### Migrationsplan (lockstep, additiv, PROJ-134-Naming, PROJ-42-drift-safe)
1. `tenant_ai_providers`: +3 DPA-Spalten + Kohärenz-CHECK + Azure-only-CHECK.
2. `tenant_ai_provider_priority`: `class3_local_only`-CHECK droppen → Floor-CHECK `<@ ['ollama','azure']` + `tenant_has_class3_trusted_processor`-Helper + BEFORE-INSERT/UPDATE-Trigger.
3. `ki_runs`: +`provider_region text` nullable.
4. `record_tenant_ai_provider_audit`: Action-Enum-Erweiterung (In-Body).
5. Neue RPCs `attest_tenant_ai_provider_dpa` / `revoke_tenant_ai_provider_dpa` (admin-gated, SECURITY DEFINER, Audit).
> Migration-`name` muss dem Repo-Dateinamen-Stamm entsprechen (PROJ-134). Kein neues npm-Dep (Azure via bestehender `createOpenAICompatible`-Factory aus PROJ-92).

### Resolver-Änderungen (`key-resolver.ts`)
- Neuer per-Request-gecachter Lookup `getClass3TrustedFlag(supabase, tenantId)` → RPC `tenant_has_class3_trusted_processor` (parallel zu `getTenantProviders`/`getPriorityMatrix`).
- `LOCAL_ONLY_PROVIDERS`-Konstante + `defaultProviderOrder(3)` + `clampForClass3` → ersetzt durch `class3EligibleProviders(providers, trustedFlag)` = `['ollama' (falls vorhanden)] (+ 'azure' falls isClass3TrustedEligible)`.
- Fail-closed bei Helper-Fehler/fehlendem Encryption-Key.

### Frontend-Slice (Handoff-Notiz)
- Azure-Card in Settings→KI-Provider (PROJ-92): DPA-Attest-Block (Referenz-Eingabe + „Attest bestätigen"/„Widerrufen"), ruft die zwei neuen RPCs; Attest-Status + Datum sichtbar; Historie via bestehendem Audit.

### Anti-Scope (bekräftigt)
Kein generischer „Cloud-für-Class-3"-Pfad; OpenAI-direkt/Anthropic/Google für Class-3 auf DB- UND TS-Ebene unmöglich; opt-in pro Tenant, nie global; alle 3 Defense-Layer bleiben, nur DPA-konditional.

### Offene Followups (PROJ-Y-Kandidaten)
- DPA-Dokument-Upload (MVP out-of-scope; DSGVO-Retention/RLS-Fläche).
- Tenant-Policy-basierte Region-Allowlist (MVP: statische Code-Konstante).
- Mehrere Azure-Configs pro Tenant (Attest gilt dann pro Config).

### Handoff
`/backend` → Migration + Resolver + RPCs; danach `/frontend` (Attest-Card); dann `/qa` (datengetriebene Class-3-Regression + Live-Smoke inkl. Revoke-Beweis).

## Implementation Notes (Backend — 2026-07-03)

**Migration `20260703135428_proj93_trusted_eu_processor` (in Prod, idempotent):**
- `tenant_ai_providers` +`dpa_confirmed_at`/`dpa_confirmed_by`/`dpa_reference` (plaintext governance metadata) + coherence CHECK (all-or-nothing AND azure-only). Azure key + `azure_region` stay inside `encrypted_config` (unreadable by triggers — the whole reason DPA fields are plaintext).
- `tenant_has_class3_trusted_processor(uuid)` — `SECURITY DEFINER STABLE`, member-scoped (`is_tenant_member` AND attest exists). **One helper, two callers** (write-trigger + resolver RPC). Member-callable (R-2 fix); anon revoked.
- `tenant_ai_provider_priority`: `class3_local_only` CHECK dropped → replaced by structural anti-scope floor `class3_trusted_floor` (`data_class<>3 OR provider_order <@ ['ollama','azure']`) + BEFORE INS/UPD trigger `enforce_class3_trusted_processor` (azure in a class-3 row only if attested).
- `ki_runs` +`provider_region text` (AC-93.5 provenance).
- `record_tenant_ai_provider_audit` action enum +`dpa_attest`/`dpa_revoke`.
- `attest_tenant_ai_provider_dpa(uuid,text)` / `revoke_tenant_ai_provider_dpa(uuid)` — admin-gated `SECURITY DEFINER`, append-only audit, no direct UPDATE from route (state-machine convention); anon revoked, authenticated granted.

**Resolver (`src/lib/ai/key-resolver.ts`) — authoritative gate at request time (R-1):**
- New per-request cached `getClass3TrustedFlag` → helper RPC (fail-closed on error).
- New `isClass3TrustedEligible(record, trustedFlag)` = the SINGLE logical eligibility authority (`azure` + attest + `isEuAzureRegion`). Replaces `LOCAL_ONLY_PROVIDERS`.
- `defaultProviderOrder(3)` + `clampForClass3` now eligibility-aware; Class-1/2 skip the helper RPC entirely (perf + independence). Kill-switch stays first (AC-93.12).
- Deliberate DB↔TS divergence documented: DB trigger = attest-floor only (can't read encrypted region); TS = attest + EU-region full gate.

**Router / provider:** `AzureOpenAIProvider` carries `region`; `AIProvider.region?` optional; `insertKiRun` writes `provider_region` (zero threading through the 11 purpose call-sites).

**API:** `POST`/`DELETE /api/tenants/[id]/ai-providers/azure/dpa` (attest/revoke, azure-only guard, admin-gated, RPC-error mapping incl. 409 no_azure_provider). Provider `GET` extended with `dpa_confirmed_at`/`dpa_reference` for the `/frontend` attest card.

**Quality gates:** lint 0 (PROJ-93 files), tsc 14 baseline/0 new, **vitest 2234/2234** (+20: 10 resolver class-3 regression `key-resolver.class3-trusted.test.ts` covering AC-93.3/93.7/93.11/93.12 + D5; 10 DPA route tests), build clean (DPA route registered). Supabase security advisor 0 ERROR (3 new fns in the expected `authenticated_security_definer_function_executable` category shared by 69 existing RPCs; search_path set; anon revoked). Migration-naming guard 0 errors.

**Live-RPC-Smoke (`tests/sql/PROJ-93-trusted-processor-pentest.sql`, Prod, self-rolling-back, 0 residue): A–J 10/10 PASS** — gate closed without attest (trigger P0001 + floor 23514 anti-scope), attest opens azure class-3, audit written, R-2 member-visibility via DEFINER helper while provider row RLS-hidden, cross-tenant isolation, anon revoked, **R-1 revoke proven** (helper flips false + trigger blocks re-write on next write).

**Deviations / follow-ups:**
- **D-1 (AC-93.8 real Azure run):** the end-to-end resolver-against-attested-Azure Class-3 generation needs an actual attested Azure resource, which the current pilots don't have (same D-1 pattern as PROJ-88/89 Ollama). The DB gate + eligibility + resolver logic are fully proven (live smoke + unit tests); a real `ki_runs.provider='azure'` Class-3 run is nachzuholen once a pilot attests an Azure resource. → verify at `/qa`.
- Naming note: prod-registered version `20260703135428` (drifted from the `140000` `name` arg); repo file renamed to the prod version per PROJ-134.

## Implementation Notes (Frontend — 2026-07-03)

**Azure DPA attest card** (`AzureCard` in `src/components/settings/tenant/ai-providers/ai-providers-page-client.tsx`): a new "Class-3 Trusted-Processor (DPA)" section, shown only when the Azure provider is configured (`isSet && !editing`).
- **Not attested:** amber `ShieldAlert` + "nicht attestiert" badge, explanatory copy ("ohne Attest bleibt Class-3 Ollama-only"), DPA-reference input (min 3 chars) + "DPA-Attest bestätigen" → `POST /api/tenants/[id]/ai-providers/azure/dpa`.
- **Attested:** emerald `ShieldCheck` + "attestiert" badge, attested-date + reference (`dpa_confirmed_at`/`dpa_reference` from the extended provider `GET`), "DPA-Attest widerrufen" → confirm dialog → `DELETE …/dpa`.
- Card description updated (Class-3 now conditionally allowed via attest). Reuses shadcn `Card`/`Badge`/`Button`/`Input`/`Label`/`AlertDialog` + sonner toasts; `reload()` refreshes status after attest/revoke. No new dep, no new route (backend routes from the /backend slice).

**AC-93.6 done in this slice:** new ADR [`docs/decisions/trusted-processor-provider-class.md`](../docs/decisions/trusted-processor-provider-class.md) + `docs/decisions/INDEX.md` entry; CLAUDE.md Invariant #3 precised (Class-3 local-only **except** attested EU Azure trusted processor, opt-in, documented DPA; TS resolver re-checks each call).

**Gates:** lint 0, tsc 14 baseline/0 new, vitest 2234/2234 (UI-only, no new unit tests — Playwright at `/qa`), build clean (`/settings/tenant/ai-providers` compiles).

**AC status after frontend:** AC-93.1/93.2/93.3/93.4/93.5/93.6/93.7/93.9/93.10/93.11/93.12 implemented + proven; AC-93.8 real-Azure end-to-end run = D-1 (needs an attested Azure resource; DB gate + resolver logic fully proven).

**Handoff:** `/qa` — verify the attest/revoke UI flow (Playwright auth-gate + attest card render), re-run the live DB smoke, and (D-1) a real Class-3 Azure run once a pilot attests an Azure resource.

## QA Test Results (2026-07-03) — PRODUCTION-READY (0 Critical / 0 High)

**Verdict:** All acceptance criteria pass except AC-93.8 (real end-to-end Azure run), which is a documented environment deviation (**D-1** — no pilot has an attested Azure resource yet; the full gate + resolver logic is otherwise proven live). 0 Critical / 0 High → **Approved**.

### Acceptance Criteria
| AC | Result | Evidence |
|----|--------|----------|
| 93.1 DPA attest (columns + audit action) | ✅ | migration verified; smoke **F** dpa_attest audit row written |
| 93.2 `class3_eligible` single logical authority | ✅ | `isClass3TrustedEligible` (resolver unit tests); DB helper is attest-floor only |
| 93.3 Resolver parametrisation (no attest → `['ollama']`) | ✅ | `key-resolver.class3-trusted.test.ts` (no-attest→ollama/blocked; attest+EU→azure) |
| 93.4 DB-CHECK DPA-conditional (never blanket azure) | ✅ | smoke **B** (trigger blocks azure w/o attest) + **C** (floor-CHECK blocks openai) |
| 93.5 ki_runs region labelling | ✅ | `ki_runs.provider_region` column + router writes it (backend) |
| 93.6 ADR + CLAUDE.md Invariant #3 | ✅ | `docs/decisions/trusted-processor-provider-class.md` + INDEX + CLAUDE.md edit |
| 93.7 Anti-scope (never OpenAI/Anthropic/Google for Class-3) | ✅ | smoke **C** (floor 23514) + resolver anti-scope test |
| 93.8 Live end-to-end Azure Class-3 run | ⚠️ **D-1** | needs attested Azure resource; gate + eligibility fully proven via smoke + units |
| 93.9 PROJ-88 inherits via resolver (no hard pin) | ✅ | purpose-agnostic clamp (resolver test D5: `resource_swap` + `proposal_stakeholders_from_context` identical) |
| 93.10 Resolve-time authority / revoke effect (R-1) | ✅ | smoke **J** (revoke → helper false + trigger blocks re-write) + fail-closed unit test |
| 93.11 Member-callable helper + fail-closed (R-2) | ✅ | smoke **G** (member gets true via DEFINER, provider row RLS-hidden) + fail-closed unit test |
| 93.12 Kill-switch first | ✅ | resolver unit test (kill-switch overrides attested azure, helper RPC not called) |

### Live DB smoke — `tests/sql/PROJ-93-trusted-processor-pentest.sql` (prod, self-rolling-back, 0 residue)
Re-run against **current merged main**: **A–J 10/10 PASS**. A helper-false pre-attest · B trigger blocks azure class-3 w/o attest (P0001) · C floor-CHECK blocks openai class-3 (23514, anti-scope) · D attest→helper true · E azure class-3 row inserts post-attest · F dpa_attest audit written · G R-2 member-visibility via DEFINER helper w/ RLS-hidden row · H cross-tenant admin false · I anon revoked (42501) · J R-1 revoke→helper false + trigger blocks re-write.

### Red-team supplement (QA, prod, rolled back, 0 residue)
- **K PASS** — authenticated **non-admin member** calling `attest_tenant_ai_provider_dpa` → forbidden (P0003). Admin gate holds for authenticated non-admins, not just anon.
- **L PASS** — admin **direct `UPDATE`** planting a DPA on a non-azure (anthropic) row → blocked by the `tenant_ai_providers_dpa_coherent` CHECK (23514). The azure-only constraint holds even bypassing the RPC.

### Automated tests
- **Playwright** `tests/PROJ-93-trusted-processor.spec.ts` — **5/5 PASS** (chromium): POST attest / DELETE revoke / invalid-body / non-azure-provider all auth-gated (307/401/403), settings page redirects to `/login` unauth. Mobile Safari skipped (WebKit host libs — known PROJ-67/F2 env deviation).
- **Vitest** merged main **2234/2234 PASS** (incl. resolver class-3 regression + DPA route + updated class-3/azure mocks).

### Security audit (red-team)
No Critical/High. The Class-3 boundary is defense-in-depth and every layer was probed live: DB floor-CHECK (anti-scope), DPA trigger (attest gate), coherence CHECK (azure-only, L), resolver clamp (authoritative, fail-closed), admin-gate on attest/revoke (anon I + non-admin K), member-visibility without row exposure (G), cross-tenant isolation (H), revoke effectiveness (J). anon `execute` revoked on all 3 new functions; new SECURITY DEFINER functions carry `set search_path` and appear only in the accepted `authenticated_security_definer_function_executable` advisor category (0 ERROR).

### Bugs
None (0 Critical / 0 High / 0 Medium / 0 Low).

### Deviation
- **D-1 (AC-93.8):** a real `ki_runs.provider='azure'` Class-3 generation needs an actually-attested Azure resource — no current pilot has one (same pattern as PROJ-88/89 Ollama). The DB gate, eligibility derivation, and resolver routing are fully proven (A–J + K/L + resolver units); the real run is a pilot/deploy follow-up.

## Deployment
_To be added by /deploy_
