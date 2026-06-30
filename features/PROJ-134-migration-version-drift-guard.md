# PROJ-134 — Migration-Versions-Drift-Guard & Naming-Konvention

## Status: In Progress (α gebaut 2026-06-30 — `check:migration-naming`-Guard + Required-Check-Workflow + Backend-Regel + Runbook; AC-134.5 fand + fixte 3 reale Repo≠Prod-Drift-Kollisionen. → /qa)
<!-- prior: Planned (CIA-reviewed 2026-06-15) -->

**Created:** 2026-06-15
**Origin:** Systematischer Befund aus den Deploy-Closures PROJ-69 / PROJ-89 / PROJ-50 (3× derselbe Migration-Versions-Drift in Folge, 2026-06-11..15).
**Related:** PROJ-42 (Schema-Drift-CI-Guard — Vorbild-Pattern), PROJ-29 (Hygiene-Slice), PROJ-67 F6 (Schema-Drift-Local-Runbook).
**Kategorie:** DevEx / technische Schuld / Betriebssicherheit (kein User-Feature).

## Problem Statement

Datenbank-Migrationen werden in diesem Projekt im Standard-Flow über das Supabase-MCP-Tool `apply_migration` auf die Prod-DB angewendet (Supabase CLI ist auf dem Host nicht installiert; kein lokales `supabase db push` im Standard). `apply_migration(name, query)` schreibt den übergebenen `name` als `version`-String in `supabase_migrations.schema_migrations`. Wird **nicht** der exakte Repo-Dateiname-Stamm als `name` übergeben, vergibt das Tooling einen eigenen **sekundengenauen** Timestamp — der dann nicht mehr zum Repo-Dateinamen passt.

Folge: `supabase migration list` / `supabase db push` matchen per Versions-String und halten die Repo-Datei für „nicht angewendet". Belegt in drei aufeinanderfolgenden Closures:

| Feature | Repo-Dateiname | In Prod registriert |
|---|---|---|
| PROJ-69 | `20260615100000/110000/120000_proj69_*` | `20260611075659/075714/075931` (+ Präfix-**Kollision** mit PROJ-89) |
| PROJ-89 | `20260615100000_proj89_risk_proposals_purpose` | doppelt: `20260611195100` + `20260611195532`, keiner matcht |
| PROJ-50 | `20260616100000/110000_proj50_*` | `20260611202524` / `20260612063017` |

Besonders gefährlich bei **nicht-idempotenten** Migrationen (`create table` ohne `if not exists`, ~20 von 129 im Bestand): ein versions-getriggerter Re-Apply-Versuch bricht `db push` hart ab (`create table` auf existierende Tabelle), potenziell mit halb-applied Zustand. Die drei Fälle wurden manuell per Datei-Rename auf die prod-registrierte Version behoben — das ist Symptombehandlung; der Mechanismus driftet bei jeder künftigen MCP-applied Migration weiter.

## Lösungsansatz (CIA-empfohlen, Option „Quelle + schlanker Repo-Guard")

Der Drift ist **an der Quelle vermeidbar** (Prozessregel), nicht MCP-inhärent. Ein zusätzlicher CI-Guard zementiert die Konvention und fängt den teuersten konkreten Fehler (Präfix-Kollision → Tooling-Bruch) hart ab — bleibt aber bewusst **Repo-lokal** (kein Prod-Token in CI; Prod-Vergleich nur als optionaler, deferred Audit, da ein prod-prüfender Required-Check Credentials in CI exponieren würde und gegen die in `schema-drift-local.md` dokumentierte „nie gegen Prod prüfen"-Regel verstößt).

## Acceptance Criteria

- [ ] **AC-134.1** Neue Regel in `.claude/rules/backend.md`: MCP `apply_migration` MUSS mit `name` = exaktem Repo-Dateiname-Stamm (`YYYYMMDDHHMMSS_proj…`, ohne `.sql`) aufgerufen werden; Workflow „erst Datei unter `supabase/migrations/` anlegen, dann diesen Namen 1:1 übergeben" dokumentiert.
- [ ] **AC-134.2** Neuer Required-Check `migration-naming` (GitHub Actions auf `main`-PRs) **hard-failt**, wenn zwei Dateien unter `supabase/migrations/` dasselbe 14-stellige Versions-Präfix teilen (Kollisions-Fall PROJ-69/PROJ-89).
- [ ] **AC-134.3** Derselbe Check **hard-failt** bei Dateinamen, die nicht `^\d{14}_[a-z0-9_]+\.sql$` matchen, und **warnt** bei sekundengenauen (nicht minuten-gerasterten) Timestamps sowie bei nicht streng monoton steigender Reihenfolge.
- [ ] **AC-134.4** Der Check **warnt** (kein fail) bei `create table` ohne `if not exists` in den im PR geänderten/neuen Migrationsdateien (Idempotenz-Empfehlung; warn statt fail, weil `if not exists` echte Schema-Konflikte maskieren kann und der Bestand ~20 Verstöße hat).
- [ ] **AC-134.5** Einmalige Bestands-Verifikation: die sekundengenauen Bestands-Präfixe (Heuristik-Kandidaten u.a. `20260502023517`, `20260506111756`, `20260509091700`) sind gegen Prod `schema_migrations.version` geprüft; **Empfehlung: nur verifizieren + im Implementation-Log protokollieren, NICHT kosmetisch umbenennen**, sofern Repo-Datei und Prod-Version übereinstimmen (ein Rein-Kosmetik-Rename riskierte erneuten Repo↔Prod-Drift). Tatsächliche Abweichungen (Repo ≠ Prod) werden per Rename auf die prod-registrierte Version korrigiert.
- [ ] **AC-134.6** Lokaler Lauf dokumentiert (Runbook in `docs/production/` analog `schema-drift-local.md`); `npm run check:migration-naming` läuft ohne DB/Docker (reine Datei-Analyse) grün auf dem aktuellen Bestand.
- [ ] **AC-134.7** *(deferred-β, Could-have)* Read-only Prod-Audit-Script vergleicht alle Repo-Dateinamen gegen `schema_migrations.version` und meldet echten Repo↔Prod-Drift (mit Prod-Read-Token, manuell/cron, **kein** Required-Check).

## Scope-Schnitt

- **MVP (α):** AC-134.1 bis AC-134.6 — Prozessregel + Repo-lokaler Naming/Kollisions/Reihenfolge-Guard (hard-fail) + Idempotenz/Sekunden-Timestamp-Warnungen + einmalige Bestands-Verifikation + Runbook.
- **Deferred (β):** AC-134.7 optionaler Prod-Drift-Audit; Auto-Generator für den korrekten MCP-`name`-String.

## Out of Scope

- Erzwingen von `supabase db push` als Apply-Mechanismus (MCP bleibt Standard).
- Prod-Credentials in CI / prod-prüfender Required-Check.
- Rückwirkende Idempotenz-Umschreibung aller ~20 Bestands-Migrationen (nur warn für neue).
- Kosmetisches Umbenennen prod-konformer Bestands-Migrationen (siehe AC-134.5).

## Tech-Stack-Fit

Sehr gut — reines Node/tsx-Script + GitHub-Actions-Workflow, **kein neuer npm-Dependency**, spiegelt das deployed PROJ-42-Pattern (`scripts/check-schema-drift/` + `.github/workflows/schema-drift.yml`). Aufwand ~1,5 PT, Risiko niedrig.

## CIA-Review

CIA-reviewed 2026-06-15 (Continuous Improvement Agent). Verdict: **Umsetzen** als schlanker α-Slice. Volle Findings/Risiken/Empfehlungen siehe Review-Output dieser Session; Kernpunkte in Problem Statement + Lösungsansatz oben übernommen.

## Implementation Notes — α (2026-06-30)

Reine DevEx/Tooling-Slice. **Kein neuer npm-Dependency**, kein `src/`-Change, keine DB-Migration (nur Datei-Renames, s.u.). Spiegelt das PROJ-42-Pattern.

- **`scripts/check-migration-naming/analyze.ts`** — pure, unit-testbare Analyse (kein fs/DB): Format-Fehler (`^\d{14}_[a-z0-9_]+\.sql$`), **Versions-Präfix-Kollision** (hard-fail, AC-134.2), Sekunden-genau-Warnung (AC-134.3), nicht-monoton-Warnung (AC-134.3), `create table`-ohne-`if not exists`-Warnung (AC-134.4). **`index.ts`** liest `supabase/migrations/*.sql`, gibt `::error`/`::warning`-Annotations aus, Exit 1 nur bei Errors. **+10 Vitest-Cases** (`analyze.test.ts`), inkl. Regression gegen einen Regex-Backtracking-Bug (`create table  if not exists` mit Doppel-Space).
- **`npm run check:migration-naming`** (package.json) — läuft ohne DB/Docker. **`.github/workflows/migration-naming.yml`** — Required-Check auf `main`-PRs+push, kein Postgres-Service (reine Datei-Analyse), keine Secrets.
- **`.claude/rules/backend.md`** — Prozessregel (AC-134.1): erst Datei `YYYYMMDDHHMMSS_proj<N>_<slug>.sql` anlegen, dann `apply_migration(name=Dateiname-Stamm)`; nie Präfix doppelt; minute-rastern + idempotent bevorzugen; bei Drift Repo-Datei auf Prod-Version umbenennen.
- **`docs/production/migration-naming.md`** — Runbook (AC-134.6).

**AC-134.5 Bestands-Verifikation — der Guard fand sofort 3 reale Präfix-Kollisionen (alle aus dem frühen, synthetisch-versionierten Migrations-Batch mit ungültiger Stunde 40/50):**

| Kollidierender Präfix | Beteiligte Dateien | Fix |
|---|---|---|
| `20260504400000` | `proj32c_alpha_tenant_ai_providers` + `proj36a_wbs_hierarchy_rollup_redeploy` | → `…400000` / `…400001` |
| `20260504500000` | `proj32c_gamma_priority_and_cleanup` + `security_internal_functions_lockdown` | → `…500000` / `…500001` |
| `20260506160000` | `proj53b_tenant_holiday_region` + `security_revoke_anon_and_trigger_only_rpcs` | → `…160000` / `…160001` |

Diese 3 Präfix-Kollisionen hätten `supabase db push` gebrochen (genau die PROJ-69/89-Klasse — AC-134.2-Hard-Fail-Fall). Behoben durch **ordnungs-erhaltende Disambiguierung**: die erste Datei jedes Paares behält ihren Original-Präfix, die zweite bekommt `+1` (sortiert unmittelbar danach → identische Apply-Reihenfolge, aber eindeutiger Präfix). Inhalt unverändert.

**Deviation von AC-134.5 (begründet, QA-belegt):** AC-134.5 schreibt *„Rename auf prod-registrierte Version"* vor. Ein erster Versuch tat genau das (z.B. `…400000` → `20260504120908`). Das **brach den PROJ-42-Schema-Drift-Required-Check** (`relation "public.tenant_ai_keys" does not exist` in `proj32c_gamma`): der frühe Batch nutzt **synthetische Ordnungs-Versionen** (keine prod-matchenden Timestamps), und die Repo-Fresh-Apply-Reihenfolge (die der Schema-Drift-Guard datei-sortiert nachspielt) **hängt von diesen synthetischen Positionen ab** — ein Rename auf die früheren Prod-Timestamps schiebt diese Migrationen vor die Migrationen, die ihre Abhängigkeiten anlegen. Für diesen frühen Batch ist prod-Version-Rename also **nicht** anwendbar; die Kollision (der akute `db push`-Brecher) wird stattdessen ordnungs-erhaltend aufgelöst. Der verbleibende Dateiname↔Prod-Version-Drift dieser frühen Dateien ist Vorbestand (geteilt mit dem gesamten synthetischen Früh-Batch) und gehört in den deferred AC-134.7-Prod-Audit, **nicht** in eine reorder-riskante α-Korrektur. Der Runbook-Abschnitt „Fixing drift" trägt diese Einschränkung jetzt.

Danach: `check:migration-naming` **0 errors / 62 warnings (Exit 0)** auf 151 Migrationen; der Schema-Drift-Required-Check bleibt grün (Apply-Reihenfolge unverändert).

**Quality-Gates:** `check:migration-naming` grün (0 errors), Vitest `analyze.test.ts` 10/10, lint 0, tsc 0 neu, Schema-Drift-Guard grün. **Offen:** AC-134.7 (read-only Prod-Audit-Script) deferred-β. → /qa.
