# Backups and Restore

> Owner: PROJ-3 · Last updated: 2026-04-29

V3 has two restore objectives:

- **RTO** (Recovery Time Objective): how long can the app be down? — for
  SaaS, target ≤ 1 hour; for stand-alone, depends on the customer's
  infrastructure.
- **RPO** (Recovery Point Objective): how much data loss is acceptable? —
  ≤ 24 hours for cold backups, ≤ 5 minutes with point-in-time recovery
  (PITR).

## Backup layers

| Layer | SaaS | Stand-alone |
|---|---|---|
| Daily logical backup | Automated by Supabase, retained per the project plan | `pg_dump` via cron, store off-host (S3-compatible / customer object store) |
| WAL archiving (PITR) | Available on Supabase paid plans; toggle in Dashboard | `archive_command` in `postgresql.conf` to push WAL to durable storage; retain for the customer's RPO window |
| Object storage | Supabase Storage versioning enabled per bucket | Backups of the storage volume (rsync / snapshots) |
| Application code | Git is the canonical source; tags mark each deploy | Same — keep `git fetch --tags` up to date on the deploy host |

V3 today does NOT use Supabase Storage for any business object; the
storage backup line is for completeness in case PROJ-12 or PROJ-13
later add file uploads.

## Daily backup verification

A backup that's never restored is not a backup. At minimum:

- Once a quarter, restore the latest backup into a sandbox project and
  verify a smoke test: log in, list projects, open one, see decisions
  and risks.
- For stand-alone, document the customer's quarterly restore drill in
  their internal runbook.

## Cold-restore procedure (full DB loss)

1. **Provision a fresh Postgres** matching the original version.
   V3 uses Postgres 17 on the SaaS Supabase project; stand-alone
   customers should match.
2. **Restore the latest dump.**
   - SaaS: Supabase Dashboard → Database → Restore from backup.
   - Stand-alone: `pg_restore -d <dbname> <dump.tar>`.
3. **Apply any migrations newer than the dump.** Look at
   `supabase_migrations.schema_migrations` against `supabase/migrations/`.
4. **Re-deploy the app pointing at the new connection string.**
5. **Smoke-test.**

Expected RTO: 30–90 minutes depending on dump size and whether the
infrastructure is pre-provisioned.

## Point-in-time recovery (PITR)

When a bug or operator error has corrupted recent data and a cold
backup loses too much:

1. **Identify the target timestamp** — usually right before the bad
   event. Check the audit log (`audit_log_entries.changed_at`) and the
   Sentry timeline to triangulate.
2. **Confirm with the operator.** PITR overwrites all changes after the
   target timestamp. There is **no undo** for the loss between target
   and "now".
3. **Trigger PITR.**
   - SaaS: Supabase Dashboard → Database → Point-in-time recovery →
     pick timestamp.
   - Stand-alone: stop Postgres, restore the base backup, replay WAL
     up to the target timestamp via `recovery_target_time`.
4. **Re-apply post-target migrations** — same step as cold-restore.
5. **Communicate the data-loss window** to affected users (they may
   need to redo work between target and the incident timestamp).

Expected RTO: 15–60 minutes for SaaS; longer for stand-alone if the
customer's WAL archive is on slow storage.

## Operator confirmation step

For both cold-restore and PITR, the platform owner must confirm in
writing (chat, email, ticket) before triggering. Restore is destructive
to anything written after the recovery point — it's not the kind of
action that should ever be one-click without a paper trail.

## What this doesn't cover

- **Per-tenant restore.** Restoring "tenant X to last Tuesday" without
  affecting other tenants is significantly more involved (logical replay
  filtered by `tenant_id`). Not in scope for V3 MVP.
- **Cross-region disaster recovery.** V3 runs in a single Supabase
  region; multi-region failover is a future epic.
- **Hot-standby / streaming replication.** Out of scope per PROJ-3
  non-goals. Customers needing zero-RPO should look at managed
  multi-master Postgres (e.g. CockroachDB) — that's an architecture
  conversation, not a doc.
