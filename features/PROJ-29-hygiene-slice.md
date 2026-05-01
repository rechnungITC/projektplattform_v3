# PROJ-29: Hygiene-Slice (Lint-Baseline · Function-Hardening · Auth-Fixture-Skelett)

## Status: Planned
**Created:** 2026-05-01
**Last Updated:** 2026-05-01

## Summary
Drei kleine, voneinander unabhängige Aufräum-Aktionen, die durch das CIA-Portfolio-Review als gemeinsame Hygiene-Slice priorisiert wurden, damit PROJ-21 (und alle folgenden Slices) auf einer sauberen Basis landen:

1. **ESLint-Baseline auf 0** — heute 97 Probleme, davon 81 Errors + 16 Warnings; 67 davon sind `react-hooks/set-state-in-effect` (Next-16/React-19-Strictness-Update). Jede Slice akkumuliert weiter (zuletzt PROJ-14 +2-3 Hits laut Implementation-Notes). Sammel-Refactor jetzt verhindert Drift.
2. **3 Supabase-Functions hardenen** — `enforce_decision_immutability` (PROJ-20), `enforce_ki_suggestion_immutability` (PROJ-12), `_is_supported_currency` (PROJ-22) tragen je eine `function_search_path_mutable`-Advisor-Warning. Eine 1-File-Migration mit `SET search_path = public, pg_temp` schließt sie defense-in-depth-konform ab. Die anderen ~30 `*_security_definer_function_executable`-Warnings bleiben — die sind erwartet (RLS-Helper, in PROJ-14-QA bereits als "OK by design" qualifiziert).
3. **Playwright Logged-In-Auth-Fixture-Skelett** — heute kommen alle E2E-Tests nur an die Auth-Gate-Schicht (PROJ-23/PROJ-22/PROJ-18/PROJ-28 testen alle 307→/login). Tieferes Verhalten (Sidebar-Labels in einer echten Methode, 308-Redirect bei eingeloggtem User, PDF-Render-Smoke für PROJ-21) ist projektweit nicht E2E-testbar. PROJ-29 liefert das **Skelett** (Test-User-Seed + Playwright-Fixture-Hook + 1 Demo-Test), der dann von folgenden Specs genutzt wird — keine retroaktive Test-Erweiterung für die 28 alten Specs in V1.

Bewusst gebündelt: alle drei sind klein (S), risikoarm, gemeinsam ≤ ½ Personentag, und sie alle gehören zu derselben Klasse "Infrastruktur-Hygiene ohne User-Wert" — eine PR macht den Review effizienter und es gibt keine sinnvolle Reihenfolge zwischen ihnen.

## Dependencies
- **Requires:** keine harten Abhängigkeiten — alle drei Blöcke arbeiten gegen aktuelle Codebase-Zustände.
- **Influences:** PROJ-21 (Output Rendering — braucht die Auth-Fixture für PDF-Render-Smoke-E2E), PROJ-24/25 (würden ohne Lint-Baseline +5–10 weitere Hits einführen), alle künftigen Slices (eskalierende ESLint-Schuld bremst Code-Reviews).

## V2 Reference Material
- Keine V2-Heritage-Bezüge — V3-spezifische Hygiene aus zwei Quellen:
  - **Next 16 / React 19 Strictness-Update** brachte den `react-hooks/set-state-in-effect`-Linter an (67 Hits über alle Hooks ab PROJ-1).
  - **Supabase-Advisor-Linter** flagt seit Schema-Reife die 3 Functions ohne hardened search_path.

## User Stories

- **Als Entwickler:in** möchte ich beim PR-Review eine **leere ESLint-Konsole** sehen, damit echte neue Probleme nicht im Rauschen verschwinden — heute ist die Trefferquelle "ist es PROJ-X-relevant?" jedes Mal eine 5-Minuten-Recherche.
- **Als Entwickler:in** möchte ich, dass `npx vitest run` und `npx playwright test` für **eingeloggte Szenarien** möglich sind, ohne pro Spec eine Test-User-Seed-Logik neu zu erfinden — die Fixture darf in V1 minimal sein, muss aber das Pattern für alle Folge-Specs etablieren.
- **Als Tenant-Admin** möchte ich, dass die DB-Funktionen, die meine Daten-Immutabilität schützen (Decisions, KI-Suggestions, Currency-Whitelist), gegen Search-Path-Hijacking gehärtet sind — auch wenn der Angriffsvektor heute hypothetisch ist.
- **Als QA-Engineer:in** möchte ich, dass `npm run lint` als verlässlicher CI-Gate fungiert — heute kann ich einen Build mit "lint-Verstoß" nicht von "lint pre-existing-Hits" unterscheiden.
- **Als Vibe-Coder mit `/qa`-Skill** möchte ich, dass `npx playwright test` echte Click-Through-Tests umfasst, nicht nur Auth-Gate-Smokes — der `/qa`-Skill kann sonst die meisten ACs nur durch Code-Reading verifizieren.

## Acceptance Criteria

### Block A — ESLint-Baseline auf 0

- [ ] `npm run lint` returns exit code 0 mit "✖ 0 problems".
- [ ] **Keine Disable-Comments** als Workaround (`// eslint-disable-next-line`) — jeder Hit wird **inhaltlich** behoben (z.B. `useEffect` → `useSyncExternalStore`, `useMemo`, oder Initial-State im `useState`-Initializer setzen).
- [ ] **Ausnahme zulässig nur wenn:** der Lint-Hit auf 3rd-Party-Code zeigt (z.B. shadcn-Sidebar-Internals) — dann mit kurzem `eslint-disable-next-line <rule> -- <begründung>`-Kommentar inklusive Verweis auf das 3rd-Party-File.
- [ ] **Vor + Nach-Diff dokumentiert** in den Implementation-Notes (heutige Verteilung: 67 × `react-hooks/set-state-in-effect`, 11 × `react-hooks/incompatible-library`, 9 × `react/no-unescaped-entities`, 4 × `react-hooks/immutability`, 3 × `react-hooks/exhaustive-deps`, 3 × misc).
- [ ] Vitest 530/530 weiter grün; TypeScript strict 0 errors; `npm run build` green.
- [ ] Playwright-Suiten weiter grün (alle 38 Cases auf Chromium + Mobile Safari).

### Block B — 3 Supabase-Functions hardenen

- [ ] Eine Migration `supabase/migrations/202605xxxxxx_proj29_function_search_path_hardening.sql` setzt für die 3 Functions explizit `SET search_path = public, pg_temp`:
  - `enforce_decision_immutability` (Trigger-Function aus PROJ-20)
  - `enforce_ki_suggestion_immutability` (Trigger-Function aus PROJ-12)
  - `_is_supported_currency` (Helper aus PROJ-22)
- [ ] Migration läuft **idempotent** (`CREATE OR REPLACE FUNCTION ...` mit identischem Body, nur das Settings-Statement ist neu).
- [ ] **Live-Verification via Supabase MCP** `execute_sql`: nach Migration zeigt `pg_proc.proconfig` für jede der 3 Functions `{search_path=public,pg_temp}`.
- [ ] **Live-Verification via Supabase MCP** `get_advisors`: die 3 spezifischen `function_search_path_mutable`-Hits sind weg; die Gesamtzahl der Advisor-Warnings sinkt von ~33 auf ~30.
- [ ] **Regression-Smoke**: PROJ-12 KI-Suggestion-INSERT/UPDATE und PROJ-20 Decision-INSERT/UPDATE/DELETE und PROJ-22 Currency-Validation funktionieren nach Migration unverändert (mocked-Vitest in `routing.test.ts`-Pattern, je 1 Smoke pro Function).

### Block C — Playwright Logged-In-Auth-Fixture-Skelett

- [ ] Neue Datei `tests/fixtures/auth-fixture.ts` exportiert eine Playwright-Fixture `authenticatedPage`, die per Storage-State eine valide Supabase-Session injiziert und auf `/` landet.
- [ ] **Test-User-Seed-Logik** lebt entweder in einer separaten Migration (`supabase/migrations/.../e2e-test-tenant.sql`, geschützt durch `IF NOT EXISTS`) oder in einem `tests/fixtures/setup-test-tenant.sql`, das die Fixture beim ersten Run idempotent ausführt. **Entscheidung im Architecture-Step**.
- [ ] **Mindestens ein Test in `tests/PROJ-29-auth-fixture-smoke.spec.ts`** zeigt: nach Login-Fixture ist die App-Shell sichtbar (z.B. `data-sidebar="sidebar"` rendert, das in den unauth-Tests explizit nicht erwartet wird).
- [ ] Die Fixture **respektiert** das CI-Setup: `playwright.config.ts` lädt einen `STORAGE_STATE_PATH`, dessen Ablauf via `npm run test:e2e:setup` regenerierbar ist; CI hat eine separate `globalSetup`-Phase für die Test-User-Seed.
- [ ] Die Fixture ist **dokumentiert** in `tests/fixtures/README.md` mit Beispiel-Verwendung für eine Folge-Spec (z.B. PROJ-21 PDF-Render-Smoke).
- [ ] **Bestehende 38 E2E-Tests** werden NICHT umgeschrieben — die testen weiterhin die unauth-Auth-Gate-Pfade (das ist die Garantie, dass Auth-Gate nicht regressiert).
- [ ] **Class-3-Schutz**: Der Test-User hat **keine echten personenbezogenen Daten** im Profil — `name = "E2E Test User"`, `email = "e2e@projektplattform-v3.test"`, alle Felder synthetisch.

### Cross-Cutting

- [ ] Jeder der drei Blöcke ist als **eigener Commit** in der PR (`fix(lint): clean ESLint-Baseline ...`, `fix(db): harden search_path on 3 functions`, `feat(test): add logged-in Playwright fixture skeleton`) — damit jeder Block **isoliert revertierbar** ist falls einer Probleme macht.
- [ ] **Implementation-Notes** in der Spec dokumentieren pro Block: Vor-Zustand, Nach-Zustand, Lint-Diff (für Block A), MCP-Advisor-Diff (für Block B), Demo-Test-Verzeichnis (für Block C).

## Edge Cases

- **`useEffect` mit synchroner setState-Initialisierung** — typisches Pattern in `useCurrentProjectMethod` (`setMethod(null)` direkt in Effect bei `!projectId`). Lösung-Pattern: Initial-Wert via `useState(() => initial)`-Initializer ODER Conditional-Loading-State. Architecture-Phase prüft Variantenwahl pro Hook.
- **`react-hooks/incompatible-library` (11 Hits)** — typischerweise 3rd-Party-Hooks (z.B. shadcn-Sidebar, react-hook-form). Falls reine Type-Inkompatibilitäten ohne Fix-Möglichkeit: Disable-Comment mit Verweis auf 3rd-Party-Issue erlaubt (siehe AC Block A Ausnahme-Regel).
- **`react/no-unescaped-entities` (9 Hits)** — JSX mit ` ' ` oder `"`-Zeichen. Mechanisch durch `&apos;` / `&quot;` / Template-Strings ersetzbar.
- **`enforce_decision_immutability` ist Trigger-Function** — `CREATE OR REPLACE` einer Trigger-Function ändert nicht die Trigger-Wirings; sie laufen mit dem neuen Function-Body weiter. Pre-existing-Daten unangetastet.
- **Test-User-Konflikt mit echtem Tenant** — der Test-Tenant muss eine **dedizierte UUID** und `name = "[E2E] Projektplattform Test"` haben. RLS-Policies dürfen ihn nicht zufällig in Listings einer echten User-Session zeigen.
- **Storage-State-Ablauf in CI** — Supabase JWTs laufen ab. Die `globalSetup`-Phase regeneriert sie pro Test-Run; lokale Entwickler nutzen `npm run test:e2e:setup` manuell wenn 401 auftaucht.
- **Async-Race in `setMethod(null)`-Cleanup** — der `cancelled = true`-Pattern (PROJ-6 useCurrentProjectMethod) bleibt; das ist legitime React-State-Cleanup, kein Lint-Verstoß. Nur die `setState` direkt im Effect ohne Sequencing wird ersetzt.
- **Migration läuft 2× (lokal + Vercel-Deploy)** — Idempotenz-Test: zweiter Aufruf der Migration muss ohne Side-Effect durchlaufen; Trigger-Wirings unverändert.
- **Lint-Disable-Comments im 3rd-Party-Code-Pfad** — wenn ein shadcn-Sidebar-Internal-Hook dauerhaft nicht-konform ist: dokumentiert in `eslint.config.mjs` als override für den File-Pfad, nicht als per-Line-Disable. Sauberer Konfig-Trade-off.

## Technical Requirements

- **Stack:** Next.js 16, React 19, TypeScript strict, Supabase, Playwright, Vitest. Keine neuen npm-Pakete.
- **Performance:** Block B Migration ist DDL auf 3 Functions; SharedLock < 1 ms. Block C-Fixture: Test-Setup-Phase einmalig pro Run, < 5 s.
- **Security:** Block C Test-User isst **keine echten personenbezogenen Daten**; Test-Tenant ist klar als E2E markiert (Naming-Konvention `[E2E] ...`); RLS-Policies dürfen den Test-Tenant nicht in Production-User-Listings durchscheinen lassen (Architecture-Phase prüft).
- **Browser-Support:** Block C deckt Chromium + Mobile Safari (gleiche Profile-Liste wie Bestand).
- **Audit:** keine Audit-Spalten betroffen (PROJ-10-Pattern unverändert).
- **Multi-tenant invariant:** Test-Tenant ist eine eigene `tenants`-Row mit eigener UUID — gleicher Vertrag wie Production-Tenants.

## Out of Scope (deferred or explicit non-goals)

- **Retroaktive E2E-Erweiterung** der 28 alten Specs (PROJ-1..28) — die Fixture ist nur das **Skelett**; jede Folge-Spec entscheidet, ob sie tieferes E2E ergänzt.
- **Migration der ~30 `*_security_definer_function_executable`-Advisor-Warnings** — sind by-design (RLS-Helper); Disable-Konfig wäre falsch, Re-Architektur wäre Re-Engineering.
- **`auth_leaked_password_protection`-Toggle** im Supabase-Dashboard — eigener Tenant-Admin-Pfad, nicht hier.
- **CI-Pipeline-Setup** für die neue Fixture (z.B. Vercel-Preview-Deploy E2E gegen ephemerischen Supabase-Branch) — **deferred** bis logged-in-Tests reale Pflicht werden (frühestens PROJ-21 QA).
- **Storybook / Visual-Regression** — explizit nicht hier (steht im CIA-Anti-Patterns).
- **TypeScript-`strict`-Erweiterung** (z.B. `noUncheckedIndexedAccess`) — separater Spec, würde +50–100 Hits bringen.
- **Codemod / Auto-Fix-Tool für `react-hooks/set-state-in-effect`** — manuelles Fix-Pattern ist transparenter und vermeidet Auto-Fix-Edge-Cases.
- **`docs/V2-MIGRATION-INVENTORY.md` updaten** — kein V2-Bezug.
- **Re-Open der QA-Pässe für PROJ-1..28** — die L2-Findings ("kein logged-in Fixture") werden in PROJ-29 als adressiert markiert; QAs werden nicht rückwirkend revidiert.

## Suggested locked design decisions for `/architecture`

1. **ESLint-Fix-Strategie**
   - **A. Hook-für-Hook manuell** (Initial-State-Pattern, Conditional-Loading-State, useSyncExternalStore wo angebracht).
   - B. Globale `useEffect`-Wrapper-Util erfinden, die das Lint-Pattern umgeht.
   - C. ESLint-Rule projektweit deaktivieren.
   - **Empfehlung A** — manuell, weil B Boilerplate erzeugt und C die Drift dauerhaft macht.

2. **Function-Search-Path-Migration**
   - **A. `CREATE OR REPLACE` mit identischem Body + neuer `SET search_path = public, pg_temp`-Klausel** — kleinster Diff, sicher.
   - B. `ALTER FUNCTION ... SET search_path = ...` — kürzer, aber `CREATE OR REPLACE` ist im V3-Migration-Stil etabliert.
   - **Empfehlung A** für Konsistenz mit den existierenden Migration-Patterns aus PROJ-12, PROJ-20, PROJ-22.

3. **Auth-Fixture-Storage-State-Quelle**
   - **A. `globalSetup`-Skript in Playwright-Config** loggt einmal beim ersten Run ein und persistiert `auth.json`.
   - B. Pre-baked `auth.json` im Repo, manuell aktualisiert wenn JWT abläuft.
   - **Empfehlung A** — Idempotent, CI-tauglich, JWT-Ablauf-resistent.

4. **Test-Tenant-Seed**
   - **A. Idempotente SQL-Migration** in `supabase/migrations/...e2e-test-tenant.sql` mit `IF NOT EXISTS` — Test-Tenant lebt in Production-DB, isoliert per UUID.
   - B. Separates Supabase-Branch für E2E (Beta-Feature von Supabase).
   - **Empfehlung A für V1** — keine Beta-Features, gleicher DB-Zustand wie Production-Tenants.

5. **Auth-Fixture-Aufruf-Pattern**
   - **A. Test-extension `test.extend({ authenticatedPage })`** — Playwright-Standard, importiert via `@/tests/fixtures/auth-fixture`.
   - B. Per-Test-`beforeEach`-Login-Flow — langsamer (login pro Test) und nicht parallelisierbar.
   - **Empfehlung A**.

6. **Block-Reihenfolge im PR**
   - **A. Block B (DB) zuerst, Block A (Lint) danach, Block C (Fixture) als letztes** — DB-Migration ist der einzige nicht-trivial-revertierbare Schritt; sie sollte zuerst landen + Live-Verifikation, bevor andere Diffs sie maskieren.
   - B. Alphabetisch (A → B → C).
   - **Empfehlung A** — Risk-First-Ordering.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

> **Authored:** 2026-05-01 · **Author:** /architecture skill
> **Audience:** PM + dev team. No code blocks; structural references only.

### 0. Why this is one spec (not three sub-tasks per PR)

Drei kleine Hygiene-Aktionen, die **gemeinsam** gehören, weil sie:
- alle zur selben Klasse "Infrastruktur, kein User-Wert" zählen,
- alle vor PROJ-21 landen sollten (sonst akkumuliert die Lint-Schuld weiter; sonst landen die Function-Warnings im PROJ-21 QA als "pre-existing pre-PROJ-21" — falsche Zuordnung; sonst hat PROJ-21 keine Auth-Fixture für PDF-E2E),
- alle zusammen ≤ ½ Personentag groß sind und einen einzigen QA-Pass tragen.

Eine eigene Spec macht das QA-trackbar (statt versteckte Slice-Patches in PROJ-21). Die **Block-Granularität in den Commits** erlaubt isolierten Revert eines einzelnen Blocks falls ein Problem auftritt.

### 1. What gets built (component view)

```
PROJ-29
+-- Block A: ESLint-Baseline auf 0
|   +-- Hooks-Pattern-Migration (97 Hits → 0):
|   |   +-- src/hooks/*.ts                         <- ~10 Custom-Hooks (use-project, use-sprints, use-work-items, ...)
|   |   +-- src/lib/work-items/method-context.ts   <- useCurrentProjectMethod (setMethod(null) im Effect)
|   |   +-- src/components/**/*.tsx                <- diverse useEffect-Patterns mit setState im Body
|   |   +-- src/app/**/*.tsx                       <- Page-Components mit ähnlichem Muster
|   +-- 9 × no-unescaped-entities → Apostroph/Quote-Escapes (mechanisch)
|   +-- 11 × incompatible-library → 3rd-Party-Hook-Disable in eslint.config.mjs (file-pattern-Override, nicht per-Line)
|   +-- 4 × immutability + 3 × exhaustive-deps + 3 misc → Hook-für-Hook
|
+-- Block B: 3 Supabase-Functions hardenen
|   +-- supabase/migrations/202605xxxxxx_proj29_function_search_path_hardening.sql (NEU)
|       +-- enforce_decision_immutability   (Quelle: 20260429140000_proj20_decisions_immutability_trigger.sql)
|       +-- enforce_ki_suggestion_immutability (Quelle: 20260429180000_proj12_immutability_trigger_and_rls_fixes.sql)
|       +-- _is_supported_currency           (Quelle: 20260430200000_proj22_budget_modul.sql)
|       +-- jeweils CREATE OR REPLACE mit identischem Body + neuer SET search_path = public, pg_temp Klausel
|
+-- Block C: Playwright Logged-In-Auth-Fixture-Skelett
    +-- tests/fixtures/                                    (NEUER Folder)
    |   +-- auth-fixture.ts                                <- Playwright test.extend({ authenticatedPage })
    |   +-- README.md                                      <- Beispiel-Verwendung für Folge-Specs
    +-- tests/fixtures/global-setup.ts                     <- erzeugt Storage-State per Login einmal pro Test-Run
    +-- supabase/migrations/202605xxxxxx_proj29_e2e_test_tenant.sql (NEU, idempotent)
    |   +-- INSERT [E2E] Test-Tenant + Test-User in tenants/auth.users/tenant_memberships
    |   +-- IF NOT EXISTS-Guards überall — second-run is no-op
    +-- tests/PROJ-29-auth-fixture-smoke.spec.ts           (NEU, 1 Demo-Test)
    +-- playwright.config.ts                               (KLEIN-Update: globalSetup-Pfad + storageState in `use`)
    +-- .gitignore                                         (Update: tests/fixtures/.auth/storage-state.json gitignored)
    +-- package.json                                       (Update: npm-script test:e2e:setup für manuelle Storage-State-Refresh)
```

### 2. Data model in plain language

**Block A:** keine Datenstruktur-Änderung. Reine Code-Refactor.

**Block B:** keine neuen Tabellen, keine neuen Spalten, keine neuen Constraints. Drei bestehende **PostgreSQL-Functions** bekommen ein **Setting** dazu (`SET search_path = public, pg_temp`). Das Setting macht die Functions resistent gegen Search-Path-Hijacking-Angriffe (ein Angreifer könnte sonst eine Schema mit gleichnamiger Function vorschieben und so ungewollten Code ausführen). Funktionsverhalten unverändert; Trigger-Wirings unverändert.

**Block C:** ein neuer **Test-Tenant** + **Test-User** in der live-DB, klar als E2E markiert (`name = "[E2E] Projektplattform Test"`, `email = "e2e@projektplattform-v3.test"`, alle Felder synthetisch). Der Test-Tenant hat eine **dedizierte UUID**, die nirgends im Production-Tenant-Pool kollidiert. RLS-Policies wirken normal — die E2E-Tests laufen als der Test-User und sehen nur Test-Tenant-Daten. **Keine echten personenbezogenen Daten** (Class-3-konform).

Die Auth-Storage-State-Datei (`tests/fixtures/.auth/storage-state.json`) lebt **lokal pro Entwickler / pro CI-Run** und ist `.gitignore`d — sie enthält ein Supabase-JWT, das pro Run frisch generiert wird.

### 3. Tech decisions (the why)

| Entscheidung | Wahl | Grund |
|---|---|---|
| Block-Bündelung vs. 3 separate Specs | **Eine Spec, drei Commits** | Single-Responsibility sagt streng split, aber alle drei sind klein, gleicher Hygiene-Charakter, ein gemeinsamer QA-Pass ist effizient. Block-Granularität in Commits liefert isoliertes Revert. |
| ESLint-Fix-Strategie | **Hook-für-Hook manuell**, kein globaler Wrapper | Boilerplate-Wrapper wären Code-Smell; globales Disable würde Drift dauerhaft machen. Manuelle Fixes verfeinern das React-State-Pattern projektweit (typisch: Initial-State im `useState`-Initializer, nicht im Effect). |
| 3rd-Party-Hook-Hits (`react-hooks/incompatible-library`) | **File-Pattern-Override in eslint.config.mjs** statt per-Line-`eslint-disable` | Sauberer Konfig-Trade-off; ein Disable-Block dokumentiert das 3rd-Party-Limit klarer als 11 verstreute Comments. |
| Function-Hardening: ALTER vs. CREATE OR REPLACE | **CREATE OR REPLACE** mit zusätzlicher `SET search_path = public, pg_temp`-Klausel | Konsistent mit dem etablierten V3-Migration-Stil aus PROJ-12, PROJ-20, PROJ-22. ALTER FUNCTION ... SET ... wäre kürzer, aber bricht Convention. |
| Idempotenz der DB-Migrationen | Beide neuen Migrationen idempotent (CREATE OR REPLACE bzw. INSERT ... IF NOT EXISTS) | Vercel-Auto-Deploy + Supabase-Branch-Workflow können Migrationen 2× anstoßen — Idempotenz schützt vor Side-Effects. |
| Auth-Fixture-Storage-State-Quelle | **`globalSetup`-Skript** loggt einmal pro Test-Run ein und persistiert `auth.json` | Pre-baked JSON wäre fragil (JWT läuft ab); `globalSetup` ist Playwright-Standard, CI-tauglich, JWT-Ablauf-resistent. |
| Test-Tenant-Seed | **Idempotente SQL-Migration** in der gleichen DB wie Production | Saubere Isolation per UUID, kein Beta-Feature (Supabase-Branches für E2E); RLS sorgt dafür, dass Test-Tenant nicht in Production-User-Listings durchscheint. |
| Auth-Fixture-Aufruf-Pattern | **Playwright `test.extend({ authenticatedPage })`** | Standard-Idiom; Fixtures werden parallelisiert; lazy ausgeführt. Per-Test-`beforeEach`-Login wäre langsamer + nicht parallel. |
| Block-Reihenfolge im PR | **B → A → C** (Risk-First) | DB-Migration ist der einzige Schritt mit nicht-trivialer Revert-Story; sie landet zuerst und wird live-verifiziert, bevor A/C ihre Diffs reinmischen. |
| Bestand-E2E-Tests anfassen? | **NEIN** | Die 38 bestehenden Tests testen Auth-Gate-Pfade — das ist die Garantie, dass Auth-Gate nicht regressiert. PROJ-29 fügt nur die Fixture-Infrastruktur + 1 Demo-Test hinzu. |

### 4. Public API

Keine HTTP-API-Änderungen. Keine neuen Endpoints. Keine Schema-Erweiterung von `MethodConfig`, `SidebarSection` oder ähnlichem. PROJ-29 ist reine Tooling-/Infra-Hygiene.

### 5. Migration plan

**Phase 1 — Block B (DB) zuerst:**
1. Migration `202605xxxxxx_proj29_function_search_path_hardening.sql` erstellen — drei `CREATE OR REPLACE FUNCTION ... SET search_path = public, pg_temp`-Statements, jeweils mit dem **identischen Body** der Original-Function (Copy-Paste aus dem Quell-Migration-File).
2. Migration via Supabase MCP `apply_migration` auf live anwenden.
3. **Live-Verifikation 1**: `pg_proc.proconfig` für die 3 Functions zeigt `{search_path=public,pg_temp}`.
4. **Live-Verifikation 2**: `mcp__supabase__get_advisors` — die 3 spezifischen Hits sind weg; Gesamtzahl der Warnings sinkt von 33 → ~30.
5. **Regression-Smoke** via Vitest: jeweils 1 Mocked-Supabase-Test pro Function (Decision-INSERT/UPDATE-Verbot, KI-Suggestion-Immutability, Currency-Whitelist).
6. Commit: `fix(db): harden search_path on 3 SECURITY DEFINER functions`.

**Phase 2 — Block A (Lint):**
1. Hook-Liste aus `npm run lint` extrahieren (97 Hits, gruppiert nach Rule-Klasse + File).
2. Pro Rule-Klasse anwenden:
   - `react-hooks/set-state-in-effect` (67) — Hook-für-Hook: setState im Effect → Initial-State-Initializer ODER Conditional-Loading-State ODER `useSyncExternalStore`.
   - `react-hooks/incompatible-library` (11) — File-Pattern-Override in `eslint.config.mjs` für 3rd-Party-Hooks.
   - `react/no-unescaped-entities` (9) — `&apos;` / `&quot;` / Template-Strings.
   - `react-hooks/immutability` (4) + `exhaustive-deps` (3) + 3 misc — case-by-case.
3. **Verifikation**: `npm run lint` exit 0 mit "✖ 0 problems"; Vitest 530/530 grün; TypeScript strict 0 errors; `npm run build` green; alle 38 Playwright-Tests grün.
4. Commit: `fix(lint): clean ESLint baseline (97 → 0 problems)`.

**Phase 3 — Block C (Fixture):**
1. Migration `202605xxxxxx_proj29_e2e_test_tenant.sql` erstellen — idempotenter `INSERT ... ON CONFLICT DO NOTHING` für `tenants` + `auth.users` + `tenant_memberships`-Rows mit dedizierter UUID.
2. Migration anwenden + Live-Verifikation: Test-Tenant existiert, Test-User kann sich einloggen.
3. `tests/fixtures/auth-fixture.ts` schreiben — exportiert `test.extend({ authenticatedPage })` mit Storage-State-Loading.
4. `tests/fixtures/global-setup.ts` — beim Test-Run-Start: Login mit Test-User-Credentials, Storage-State persistiert nach `tests/fixtures/.auth/storage-state.json`.
5. `playwright.config.ts` Update: `globalSetup`-Pfad + `use.storageState`-Default.
6. `.gitignore` Update: `tests/fixtures/.auth/`.
7. `package.json` Update: `"test:e2e:setup"` Script für manuelle Storage-State-Refresh wenn JWT abläuft.
8. `tests/PROJ-29-auth-fixture-smoke.spec.ts` — 1 Demo-Test: nach Auth-Fixture rendert die App-Shell `data-sidebar="sidebar"` (das in den unauth-Tests explizit nicht erwartet wird).
9. `tests/fixtures/README.md` — Beispiel-Verwendung dokumentiert für PROJ-21-Folge-Specs.
10. **Verifikation**: `npx playwright test tests/PROJ-29-auth-fixture-smoke.spec.ts` grün auf Chromium + Mobile Safari.
11. Commit: `feat(test): logged-in Playwright fixture skeleton + test tenant seed`.

**Phase 4 — Spec-Update + INDEX-Update:**
- Implementation-Notes pro Block in der Spec dokumentieren.
- INDEX-Status auf In Progress (oder direkt In Review wenn Implementation-Pass clean).

### 6. What changes outside PROJ-29

- `eslint.config.mjs` — möglicher `files`-Override für 3rd-Party-Hook-Pfade (Block A).
- `playwright.config.ts` — Update für `globalSetup` + `use.storageState` (Block C).
- `package.json` — neuer `test:e2e:setup`-Script (Block C).
- `.gitignore` — neuer Eintrag für `tests/fixtures/.auth/` (Block C).
- **Keine** Änderungen in `src/types/`, `src/lib/`, `src/components/`, `src/app/api/` außer den ESLint-Hook-Refactors selbst.

### 7. Tests

| Test | Where | What |
|---|---|---|
| Vitest 530/530 unverändert grün | bestehende Suiten | Garantie: keine Regression durch Hook-Refactor |
| 3 Vitest-Smokes für die 3 hardenierten Functions | `src/lib/decisions/...test.ts`, `src/lib/ki/...test.ts`, `src/lib/budget/...test.ts` | Function-Verhalten nach Hardening identisch |
| Live-MCP-Smoke (`get_advisors`) | manuell während Implementation | Advisor-Warnings 33 → ~30; die 3 spezifischen Hits weg |
| Auth-Fixture-Smoke (Block C) | `tests/PROJ-29-auth-fixture-smoke.spec.ts` | nach Login-Fixture rendert App-Shell `data-sidebar="sidebar"` (Antithese der unauth-Tests) |
| Bestehende 38 Playwright-Tests | unverändert | Auth-Gate-Pfade weiter geschützt |
| `npm run lint` exit 0 | manuell + CI | "✖ 0 problems" |
| `npm run build` green | manuell + Vercel | keine Build-Regression durch Hook-Refactor |
| TypeScript strict 0 errors | manuell + CI | keine Type-Regression |

### 8. Out of scope (deferred — explicitly named)

(Bereits oben in der Spec dokumentiert; Recap der wichtigsten:)
- Retroaktive E2E-Erweiterung der 28 alten Specs.
- Migration der ~30 `*_security_definer_function_executable`-Warnings (by-design).
- `auth_leaked_password_protection`-Toggle im Supabase-Dashboard.
- CI-Pipeline-Setup mit Vercel-Preview-Deploy + Supabase-Branch.
- Storybook / Visual-Regression.
- TypeScript-`strict`-Erweiterung (`noUncheckedIndexedAccess` etc.).
- Codemod / Auto-Fix-Tool.
- Re-Open der QA-Pässe für PROJ-1..28.

### 9. Dependencies (packages)

**Keine neuen npm-Pakete.** PROJ-29 nutzt:
- `@playwright/test` (vorhanden) — `test.extend()` + `globalSetup` sind Standard-API.
- `@supabase/ssr` + `@supabase/supabase-js` (vorhanden) — für `globalSetup`-Login-Flow.
- bestehende ESLint-Config (`eslint.config.mjs`) + `next/core-web-vitals` Preset.

### 10. Risk + trade-off summary

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Hook-Refactor zerbricht eine Page (Hook-Verhalten subtle anders) | Mittel | Mittel | Block A nach Block B, Block-Granularität in Commits → isoliertes Revert. Vitest 530/530 + Playwright 38/38 als Regression-Sicherheitsnetz. |
| `react-hooks/set-state-in-effect`-Fix erzeugt einen Render-Loop | Niedrig | Hoch | Pro Hook ein Mini-Smoke-Test (mocked render → no infinite loop) — falls existierende Tests nicht abdecken, kleinen Vitest dazu schreiben. |
| Function-CREATE OR REPLACE verändert die Function-Body-Semantik | Sehr niedrig | Hoch | Body wird **wörtlich** aus der Quell-Migration kopiert; nur `SET search_path` ist neu. Live-Verifikation der 3 Function-Behaviours via Smoke-Tests. |
| Test-Tenant landet in Production-User-Listings | Niedrig | Mittel (DSGVO-leise, aber unsauber) | Test-User-Email folgt der `*.test`-TLD-Konvention; RLS-Policies sind bereits tenant-scoped; `[E2E]`-Naming filtert in der UI als "system tenant". |
| Storage-State-JSON enthält JWT mit langer Lebensdauer und leakt | Niedrig | Niedrig (nur Test-User-Power) | `.gitignore` schützt; CI generiert pro Run frisch; Test-User hat kein Production-Privileg. |
| `globalSetup` hängt CI-Pipeline | Niedrig | Mittel | Timeout ≤ 10 s; Login-Flow ist 1 HTTP-Call; Fail-Loud falls länger. |
| 3rd-Party-Hook-Override in eslint.config zu breit (versteckt echte Hits) | Mittel | Mittel | File-Pattern auf konkrete 3rd-Party-Pfade beschränken; nicht `**/*.tsx`. |
| Bestehende Playwright-Tests werden durch globalSetup verlangsamt | Niedrig | Niedrig | `globalSetup` läuft einmal pro Test-Run, nicht pro Test. Bestehende Tests rufen die Auth-Fixture nicht — sie laufen weiter unauth. |
| Migration-Idempotenz fehlerhaft (zweiter Aufruf bricht) | Niedrig | Niedrig | `IF NOT EXISTS` + `ON CONFLICT DO NOTHING`; manuell zweimal anwenden während QA. |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
