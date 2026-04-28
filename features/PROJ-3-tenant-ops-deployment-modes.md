# PROJ-3: Tenant Operations and Deployment Modes (Stand-alone vs SaaS)

## Status: In Progress
**Created:** 2026-04-25
**Last Updated:** 2026-04-29

## Summary
Defines the operational dimension of the platform: how it runs as multi-tenant SaaS today (V3 default), how an enterprise customer can run it stand-alone on their own infrastructure later, and how updates/backups/restores work. Inherits V2 EP-01 (Mandanten-/Betriebsarchitektur), with PROJ-1 already covering the multi-tenant data model and tenant isolation. PROJ-3 covers what's left: stand-alone operation mode and the update/operations strategy.

## Dependencies
- Requires: PROJ-1 (Auth, Tenants, Roles) — for the tenant + RLS foundation
- Requires: PROJ-2 (Project CRUD) — to verify isolation across all tenant-scoped tables
- Influences: PROJ-12 (KI-Assistenz) — stand-alone instances must support local LLM models
- Influences: PROJ-14 (Integrations) — connectors must work in stand-alone

## V2 Reference Material
- **Epic file:** `~/projects/Projeketplattform_v2_D.U/planning/epics/ep-01-mandanten-und-betriebsarchitektur.md`
- **Stories:** `~/projects/Projeketplattform_v2_D.U/planning/stories/ep-01.md` (ST-03 stand-alone mode, ST-04 update/operations strategy)
- **ADRs:** `docs/decisions/deployment-modes.md`, `docs/decisions/architecture-decisions-table.md`
- **V2 code paths to study during /architecture and /backend:**
  - `infra/` (V2's Docker Compose, S3 config, monitoring scripts) — for inspiration; V3 does not need most of this
  - `apps/api/src/projektplattform_api/config.py` — `PPV2_MODE=shared|standalone` env switch
  - `db/migrations/versions/` — Alembic upgrade/downgrade pattern (V3 uses Supabase migrations)

## User Stories
- **[V2 EP-01-ST-03]** As an enterprise customer, I want to run the platform on my own infrastructure (own server, VPS, or own cloud) so that I can meet regulatory and organizational requirements.
- **[V2 EP-01-ST-04]** As an operator, I want a defined update and operations strategy for stand-alone instances so that enterprise installations stay maintainable.

## Acceptance Criteria

### Stand-alone mode definition
- [ ] A stand-alone deployment guide exists (in `docs/deployment/`) describing: which Supabase setup (self-hosted Supabase) is supported, environment variables required, migration apply order, edge function deployment.
- [ ] Stand-alone runs with one tenant (`tenants` row count = 1) and the same codebase as the SaaS deployment — no V3 code branches.
- [ ] Cross-tenant UI affordances (tenant switcher) gracefully collapse when only one tenant exists.
- [ ] Differences vs. SaaS are documented for: authentication (self-hosted Supabase vs hosted), updates, monitoring, and configuration.
- [ ] Local LLM models are listed as a supported AI provider path for stand-alone (see PROJ-12).

### Update strategy
- [ ] An ordered update procedure is documented: (1) apply Supabase migrations, (2) deploy Edge Functions, (3) deploy Next.js app (Vercel or self-host), (4) flip feature flags as needed.
- [ ] Migrations are designed to be backward-compatible (rolling deploy works: old code with new schema).
- [ ] Rollback is possible: each migration has a documented down-step or recovery procedure; previous Vercel/Next.js build is one click away.
- [ ] Backups: daily Postgres backup is documented (Supabase managed) or scripted (self-hosted); object storage (Supabase Storage) versioning enabled.
- [ ] Recovery procedure is documented: cold-restore from latest backup, point-in-time recovery via WAL where available.

## Edge Cases
- **Multi-tenant isolation must hold in stand-alone mode** — tests written for SaaS isolation (cross-tenant 404, RLS denial) must continue to pass with one tenant.
- **Migration drift** — applying migrations out of order corrupts state. Document a sanity check: "all migrations from this commit's `supabase/migrations/` must be applied before deploying this app version."
- **Stand-alone customer wants no external AI** — `EXTERNAL_AI_DISABLED=true` env var that hard-blocks all external LLM calls (defense in depth on top of the class-3 block from PROJ-12).
- **SaaS instance with one tenant (yet)** — must not differ from a real stand-alone (config flag is the only difference).
- **Restore at PITR overwrites recent data** — operator confirmation step required; document the data-loss window.

## Technical Requirements
- **Stack:** Next.js 16 + Supabase (Postgres + Auth + RLS + Edge Functions + Storage). NOT FastAPI.
- **Multi-tenant:** Already enforced by PROJ-1; PROJ-3 only affects deployment topology, not schema.
- **Validation:** N/A (this PROJ produces docs + ops scripts, not API endpoints).
- **Auth:** Same Supabase Auth; in stand-alone, the customer can disable email/password and configure their own provider.
- **Config switch:** `OPERATION_MODE=shared|standalone` env var, read at app boot. UI hides cross-tenant affordances when standalone.
- **Backups:** Supabase managed when SaaS; self-hosted documents `pg_basebackup` + WAL archive flow.
- **Observability:** Sentry (already in V3 setup), structured logging in Edge Functions and route handlers.

## Out of Scope (deferred or explicit non-goals)
- A productized one-click stand-alone installer.
- Automated migration tool between SaaS and stand-alone (a tenant stays in their mode).
- Hot-standby / streaming replication.
- Auto-scaling, SLA tiers, or managed monitoring stack.

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Realitätscheck: was ist schon da, was fehlt

PROJ-1 hat den Multi-Tenant-Datenstand fertig: jede Tabelle hat `tenant_id`, RLS-Helfer enforcen Isolation. Der `TenantSwitcher` blendet sich heute schon aus, wenn der User in <2 Mandanten sitzt — das ist genau das Verhalten, das ein Stand-alone-Deployment braucht. **PROJ-3 ist deshalb fast keine Code-Änderung, sondern primär:**

1. ein Boot-Time-Konfig-Mechanismus für zwei Env-Variablen,
2. eine kleine UI-Verstärkung (Switcher in Stand-alone immer aus, defense-in-depth),
3. ein Hook für PROJ-12 (externer LLM-Hard-Block),
4. drei Operations-Dokumente.

### Komponentenstruktur

```
App-Boot (Server)
├── lib/operation-mode.ts         (neu — typisierter Konfig-Reader)
│   ├── OPERATION_MODE = "shared" | "standalone"   (default: "shared")
│   └── EXTERNAL_AI_DISABLED = boolean              (default: false)
│
├── Header / Sidebar
│   └── TenantSwitcher (existiert)
│        ├── heute: hidden bei memberships.length < 2
│        └── neu:  zusätzlich hidden bei mode === "standalone"
│
└── PROJ-12 KI-Assistenz (zukünftig)
     └── ruft isExternalAIBlocked() vor jedem externen LLM-Call

docs/deployment/
├── standalone.md          (neu — Setup-Guide)
├── update-strategy.md     (neu — Reihenfolge + Rollback)
└── backup-restore.md      (neu — Backups, PITR, Cold-Restore)

.env.local.example
└── neue Sektionen für die zwei Env-Variablen mit Erklärtext
```

### Datenmodell

**Keine DB-Änderungen.** PROJ-3 berührt nur:
- Konfiguration über Env-Variablen (boot-time, server-side).
- Drei Markdown-Dokumente unter `docs/deployment/`.
- Eine Zeile UI-Logik im `TenantSwitcher`.

### Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| Eine Codebasis für Shared *und* Stand-alone | Spec-Vorgabe „no V3 code branches". Mode ist ein Runtime-Flag, kein Build-Profil — vermeidet Drift zwischen den Welten. |
| Default `OPERATION_MODE=shared` | V3 ist heute als SaaS deployed; ein fehlendes Env auf bestehenden Instanzen darf das Verhalten nicht ändern. |
| `EXTERNAL_AI_DISABLED` als eigenständige Achse | Auch ein SaaS-Mandant kann aus Compliance-Gründen externe LLMs blocken wollen, ohne Stand-alone zu werden. Zwei Dimensionen, zwei Schalter. |
| Konfig boot-time, server-side gelesen | Sicherheitsrelevante Schalter (AI-Block) gehören nie auf den Browser. Server-Component-Layer rendert die UI mit dem aufgelösten Mode-Wert. |
| Dokumentation als Markdown im Repo | Versioniert mit dem Code; Releases tragen den passenden Stand. Keine zusätzliche Dokumentations-Plattform. |
| Kein Stand-alone-Installer in MVP | Spec-Out-of-Scope. Stand-alone-Setup bleibt manuell mit Guide. |

### Sicherheitsdimension

`EXTERNAL_AI_DISABLED=true` ist die zweite Verteidigungslinie über der Class-3-Sperre aus PROJ-12. Wenn beides aktiv ist:
- PROJ-12 erkennt Class-3-Felder und blockt externe Calls automatisch.
- PROJ-3 blockt **alle** externen LLM-Calls, nicht nur die mit Class-3-Daten.

Die Logik ist eine harte Frühprüfung: greift bevor die LLM-Library überhaupt geladen wird. PROJ-12 dockt später hier an — der Hook landet jetzt, der Konsument folgt.

### Bestehende Tests

Die Multi-Tenant-Isolations-Tests aus PROJ-1, PROJ-8 und PROJ-20 testen den Stand-alone-Fall implizit mit, sobald das Test-Tenant der einzige Mandant in der Test-DB ist. Spec-AC „Multi-tenant isolation must hold in stand-alone mode" ist damit ohne neue Tests erfüllt — aber wir validieren das im QA-Pass durch eine kurze Stichprobe gegen die bestehende Test-Datenbank.

### Abhängigkeiten

Keine neuen npm-Pakete. Keine neue Migration. Keine neuen API-Routen.

### Out-of-Scope-Erinnerungen (aus der Spec)

- Kein One-Click-Stand-alone-Installer
- Kein Migrations-Tool zwischen SaaS- und Stand-alone-Mandanten
- Kein Hot-Standby / Streaming Replication
- Keine Auto-Scaling-, SLA- oder Monitoring-Stacks

### Verifikation nach Implementation

- Server-Component liest `OPERATION_MODE` und liefert den richtigen UI-State.
- Standalone-Modus blendet TenantSwitcher aus, auch bei mehreren Memberships.
- `isExternalAIBlocked()` liefert `true` bei `EXTERNAL_AI_DISABLED=true`.
- Bestehende Vitest-Suite bleibt grün.
- Doku-Links unter `docs/deployment/` zeigen auf existierende, vollständige Dateien.

## Implementation Notes

### Combined backend + frontend + docs pass (2026-04-29)

PROJ-3 was implemented as one cohesive commit because the backend lib, the
single UI consumer, and the docs are tightly coupled — splitting into two
skill cycles would have produced broken intermediate states (the lib
without its consumer is dead code).

**Code changes (small):**

- `src/lib/operation-mode.ts` — typed reader for the two env switches:
  - `OPERATION_MODE`: `"shared" | "standalone"` with case-insensitive,
    typo-safe parse (anything other than the literal `"standalone"`
    falls back to `"shared"`).
  - `EXTERNAL_AI_DISABLED`: strict opt-in, only the literal `"true"`
    enables the block.
  - Helpers: `getOperationMode()`, `isStandalone()`,
    `isExternalAIBlocked()`, `getOperationModeSnapshot()`.
- `src/lib/operation-mode.test.ts` — 11 unit tests covering defaults,
  case-insensitive parse, typo-safe fallback, strict opt-in for the AI
  block, and independence between the two flags.
- `src/app/(app)/layout.tsx` — server component reads `getOperationMode()`
  and prop-drills it to `TopNav`.
- `src/components/app/top-nav.tsx` — accepts `operationMode` prop and
  forwards to `TenantSwitcher`.
- `src/components/app/tenant-switcher.tsx` — adds `operationMode` prop;
  hide condition extended from `memberships.length < 2` to
  `operationMode === "standalone" || memberships.length < 2`. Single
  source of truth for the standalone collapse.
- `.env.local.example` — new sections documenting the two env vars
  with inline rationale.

**Docs (new):**

- `docs/deployment/standalone.md` — when, why, required env, initial
  setup checklist, smoke-test, and a comparison table SaaS vs
  stand-alone.
- `docs/deployment/update-strategy.md` — ordered procedure (migrations
  → edge functions → app → flags), backward-compat rules, two-layer
  rollback (one-click app vs schema), pre-deploy sanity check.
- `docs/deployment/backup-restore.md` — RTO/RPO definitions, daily
  backup verification, cold-restore steps, PITR with operator
  confirmation, scope boundaries (per-tenant restore + multi-region DR
  out of scope).

**No DB changes**, no new API routes, no new npm packages, no new
migration. PROJ-1 already enforces multi-tenant isolation at the data
layer; PROJ-3 only adds the deployment-topology dimension on top.

**Verification:**
- `npx vitest run` → **201/201** green (was 190; +11 new lib tests).
- `npx tsc --noEmit` → clean.
- `npm run build` → clean; the route table is unchanged.
- `npm run lint` → baseline unchanged at 51 problems (none from PROJ-3).
- Existing multi-tenant isolation tests in PROJ-1 / PROJ-8 / PROJ-20
  cover the stand-alone case implicitly (test DB has one tenant) — no
  new tests needed for the AC "Multi-tenant isolation must hold in
  stand-alone mode."

**Open follow-ups (handed to /qa):**
- Smoke-test the standalone-mode UI by setting `OPERATION_MODE=standalone`
  in dev and verifying the TenantSwitcher hides even when the user
  technically has more than one membership.
- Spot-check the `EXTERNAL_AI_DISABLED` flag is read correctly (no
  consumer yet — PROJ-12 will be the first; for now, just unit-test
  coverage and presence in `.env.local.example`).
- Verify the deployment docs are link-clean and accurate against the
  current Supabase project layout.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
