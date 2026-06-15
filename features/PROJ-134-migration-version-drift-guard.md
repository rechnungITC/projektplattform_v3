# PROJ-134 — Migration-Versions-Drift-Guard & Naming-Konvention

## Status: Planned (CIA-reviewed 2026-06-15)

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
