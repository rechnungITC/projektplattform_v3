# Throwaway Fixtures in Production — Runbook (PROJ-Y-146b)

Some verifications can only be done against production: whether the **deployed**
serverless function really executes a code path (PROJ-Y-146a), whether a route behaves
in the shipped bundle (PROJ-144). Those need real rows in the production database.

This repo has already paid for three surprises doing that. All numbers and error codes
below were measured against the live database, not inferred.

## Rule 1 — never the customer tenant

`IT-Couch GmbH` (`329f25e5-…`) is a real customer workspace. A verification must not add
rows to it, even ones it deletes afterwards.

Test tenants carry an `[E2E]` name prefix:

```sql
select id, name from tenants order by name;   -- [E2E] … are fair game, the rest are not
```

Prove afterwards that you stayed out. For PROJ-Y-146a the counter-check was: total
`report_snapshots` across **all** tenants must equal the customer's pre-run count
(10 → 10), so no 11th snapshot appeared there.

## Rule 2 — for investigation, use a rolled-back transaction

If you only need to know *how* production behaves, wrap the probe in a transaction and
never commit. Audit triggers write inside the same transaction, so a rollback leaves
**zero** rows — verified: a probe that created a tenant, a membership and provoked three
constraint violations left `audit_log_entries = 0`.

Use the house pattern from `CLAUDE.md`: `DO` block, nested `BEGIN … EXCEPTION`, results
collected into a temp table so one failing step does not abort the rest.

```sql
begin;
create temp table probe(step text, outcome text) on commit drop;
do $$
begin
  begin
    -- the thing you want to learn about
    insert into probe values ('A: …', 'SUCCEEDED');
  exception when others then
    insert into probe values ('A: …', 'BLOCKED sqlstate='||sqlstate||' msg='||sqlerrm);
  end;
end $$;
select * from probe;
rollback;
```

## Rule 3 — when you must commit, seed your own tenant

A real HTTP round trip through the deployed app has to commit. Then: create a dedicated
throwaway tenant — do **not** switch a module on for a shared E2E tenant.

Reason, learned twice: shared fixture state races the specs other lanes are running.
`tests/fixtures/constants.ts` (PROJ-Y-144d) records the same decision, and PROJ-Y-143f
caught the failure mode — one added membership changed the tenant switcher and turned
**all seven** visual baselines red for a reason unrelated to the change under test.

Also restore the shared identity afterwards. Counter-check: the E2E user must be back to
exactly the membership count it had before.

## Rule 4 — set `audit_lifecycle_exempt` *before* seeding

The audit trail is append-only since PROJ-130-α and its tenant FK was decoupled, so its
rows **outlive the tenant you delete**. Test noise there is permanent.

`record_audit_lifecycle()` reads `tenants.audit_lifecycle_exempt` for the resolved tenant
and returns early when it is true (PROJ-Y-130h). Set it in the statement right after
creating the tenant:

```sql
update tenants set audit_lifecycle_exempt = true where id = '<throwaway>';
```

**The flag is not derived from the `[E2E]` name prefix.** Nothing sets it for you.

Measured effect on one probe run: **8 permanent rows without it, 5 with**. The remainder
is irreducible, and the timestamps show why:

| Row | Why it survives the flag |
|---|---|
| `tenants.__created` | the tenant must exist before it can be flagged |
| `tenant_settings.__created` | trigger `tenants_bootstrap_settings` creates it in the *same* statement as the tenant, so it also precedes the flag |
| `tenants.audit_lifecycle_exempt` | field audit — deliberately **not** suppressed, so nobody can quietly hide their tracks |
| `active_modules` etc. | field audits are a different trigger; the flag only governs create/delete |
| your business event | e.g. `report_snapshots.snapshot_created` — that is the thing under test |

## Rule 5 — teardown: a tenant cannot be hard-deleted

`enforce_admin_invariant()` fires `BEFORE DELETE` on a tenant's last admin. Because
`tenant_memberships.tenant_id` is `ON DELETE CASCADE`, that also aborts deleting the
**tenant itself**. Measured, all three with `sqlstate 23514`, message
`Tenant must have at least one admin`:

| Attempt | Outcome |
|---|---|
| `delete from tenants …` (cascade path) | **BLOCKED** 23514 |
| `delete from tenant_memberships …` (last admin) | **BLOCKED** 23514 |
| demote the last admin to `member` first | **BLOCKED** 23514 — there is no escape this way |
| same deletes under `session_replication_role = replica` | **succeeds** |

So `supabase-js` and the API cannot finish the teardown; the last two rows need one SQL
session:

```sql
begin;
set local session_replication_role = replica;
delete from tenant_memberships where tenant_id = '<throwaway>';
delete from tenants           where id        = '<throwaway>';
commit;
```

This is not a product defect — tenant offboarding goes through PROJ-17, not a hard
delete. It is a trap only for throwaway fixtures. Note that `replica` disables **all**
triggers for the session, audit included, which is what you want when removing test
residue and never what you want on customer data.

Delete children before the membership. A related ordering constraint lives one level down:
`enforce_last_lead()` is attached to **`project_memberships`** (on DELETE and on UPDATE), not to
`projects` — so if your fixture creates project memberships, their last lead cannot be removed
either. A fixture that only sets `projects.responsible_user_id` (as the PROJ-Y-146a probe does)
never touches that trigger.

## Rule 6 — verify the teardown by counting

Do not assume the deletes worked; the invariant above fails *silently* through a client
that discards the error.

```sql
select
  (select count(*) from tenants            where id        = '<throwaway>') as tenants,
  (select count(*) from tenant_memberships where tenant_id = '<throwaway>') as memberships,
  (select count(*) from tenant_settings    where tenant_id = '<throwaway>') as settings,
  (select count(*) from projects           where tenant_id = '<throwaway>') as projects,
  (select count(*) from audit_log_entries  where tenant_id = '<throwaway>') as audit_permanent;
```

Everything except `audit_permanent` must be `0`. Storage buckets need their own check —
removing a row does not remove the object.

## Reference implementation

`scripts/verify-prod-snapshot-render.mts` (PROJ-Y-146a) applies all six rules: throwaway
tenant, exempt flag set right after creation, teardown in `finally`, residue counted
rather than assumed, the two undeletable rows reported honestly with the finishing SQL
printed. It is gated behind `PROD_WRITE_ACK=1` and deliberately has **no** npm alias, so
nobody triggers a production write while running the test suite. Copy that shape.

## Who may set the exemption (closed 2026-08-13, PROJ-Y-146c)

Setting `audit_lifecycle_exempt = true` is restricted to `service_role`, `postgres`, and
`supabase_admin` by the trigger `tenants_audit_exempt_write_guard`. Through the application
role it fails with `42501`. **Rule 4 above is therefore no longer a convention but an
enforced condition** — and it is the reason your fixture script must talk to the database
with the service-role key, not with a signed-in admin session.

Two properties worth knowing before you debug a `42501` here:

- **Only the dangerous direction is gated.** Turning the exemption *off* (`true → false`)
  stays open to any tenant admin, so a flag left on by a failed teardown can be cleared
  without the service key.
- **The guard is `SECURITY INVOKER` on purpose.** Under `SECURITY DEFINER`, `current_user`
  would be the function owner and the check would pass for everyone — the trigger would look
  present and do nothing. The migration asserts `prosecdef = false` for exactly this reason.

What the exemption still does *not* do: it never suppresses field-level audit. Renames,
status changes and the `is_deleted` trash flag keep writing rows even while the exemption is
on (measured 6/6). Only creations and hard deletes go unlogged. **Residual risk, accepted:**
anyone holding the service-role key can still set the flag — that is the legitimate fixture
path and cannot be closed without closing this runbook's own recipe. Reporting flag flips to
a human is tracked as **PROJ-Y-146d**.
