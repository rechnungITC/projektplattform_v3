/**
 * PROJ-Y-148a — append-only governance history that stands in the way of a
 * project's permanent deletion.
 *
 * PROJ-148 unblocked the hard delete for 19 of 23 trashed projects by teaching
 * `enforce_last_lead()` about the teardown case. The remaining four fail on a
 * second, unrelated cause: `projects` cascades into five append-only event
 * tables whose guards refuse `DELETE`. That is not a defect — it is two
 * shipped promises pulling in opposite directions, and the user's decision
 * (variant 1) is that the immutability wins and the surface says so honestly.
 *
 * This module is the single source for *which* history blocks a delete and
 * *what it is called in front of a user*. Two consumers share it:
 *
 *   - `GET /api/projects/[id]?hard_delete_check=true` — the pre-flight the
 *     dialog runs before it offers the button, so nobody walks into a dead
 *     end (AC-Y148a.V1-3/V1-4).
 *   - the `DELETE …?hard=true` branch — refuses with 422 instead of the old
 *     blanket 500 (AC-Y148a.V1-1).
 *
 * Three deliberate properties:
 *
 * 1. **No probe delete.** Detection counts rows; it never attempts a delete
 *    and infers from the failure (AC-Y148a.V1-4). A probe would have to run
 *    inside a transaction we cannot roll back from a route handler.
 * 2. **Table names never reach the user.** Each island carries a German
 *    business label. The old dialog surfaced
 *    `stakeholder_profile_audit_events are append-only…` verbatim
 *    (AC-Y148a.V1-2).
 * 3. **The list is frozen by a test**, not by this comment. A sixth island
 *    must force a decision rather than silently fall through — which is not
 *    hypothetical: PROJ-45-β added the fifth while this slice was being
 *    written. See `governance-history.test.ts`.
 */

export interface GovernanceHistoryIsland {
  /** Table holding the append-only events. Never shown to a user. */
  table: string
  /** Parent relation that carries `project_id`. */
  parentTable: string
  /**
   * FK constraint name, used as the PostgREST embed hint. Needed because
   * `stakeholder_profile_audit_events` has *two* FKs to `stakeholders`
   * (`stakeholder_id` and `actor_stakeholder_id`); an unqualified
   * `stakeholders!inner` is ambiguous there and PostgREST rejects it.
   */
  parentForeignKey: string
  /** Business-facing German name of this kind of history. */
  label: string
  /** The slice whose immutability promise this island carries. */
  promisedBy: string
  /**
   * Whether this island actually refuses the cascade of a project delete.
   *
   * Not every append-only guard does. Four of the five only step aside when the
   * session explicitly announces a teardown (`_project_teardown_active()`),
   * which no application code does — so they block. The fifth steps aside
   * whenever its parent row is already gone, which is exactly what a cascade
   * produces, so it blocks nothing and its history is removed with the project.
   *
   * Measured, never assumed: each value was established by deleting a project
   * in a transaction that was rolled back afterwards.
   */
  blocksHardDelete: boolean
}

/**
 * The five append-only islands in the `ON DELETE CASCADE` closure of
 * `projects`, measured live against prod: recursive `pg_constraint` walk over
 * `confdeltype='c'`, intersected with `DELETE` triggers whose function raises.
 * All five sit at cascade depth 2 (project → parent → events).
 *
 * Two of them raise `23514` (check_violation), three raise `42501` — which is
 * exactly why the delete branch cannot rely on a single SQLSTATE and the
 * pre-check is the authoritative mechanism.
 *
 * All five are listed even though only four block, so that the list stays a
 * complete picture of the cascade closure and a sixth island cannot slip in
 * unnoticed. Whether an island blocks is `blocksHardDelete`, measured per
 * island rather than inferred from the presence of a guard.
 */
export const GOVERNANCE_HISTORY_ISLANDS = [
  {
    table: "stakeholder_profile_audit_events",
    parentTable: "stakeholders",
    parentForeignKey: "stakeholder_profile_audit_events_stakeholder_id_fkey",
    label: "Stakeholder-Profil-Historie",
    promisedBy: "PROJ-33",
    blocksHardDelete: true,
  },
  {
    table: "decision_approval_events",
    parentTable: "decisions",
    parentForeignKey: "decision_approval_events_decision_id_fkey",
    label: "Genehmigungs-Historie zu Entscheidungen",
    promisedBy: "PROJ-31",
    blocksHardDelete: true,
  },
  {
    table: "deliverable_approval_events",
    parentTable: "deliverable_approvals",
    parentForeignKey: "deliverable_approval_events_approval_id_fkey",
    label: "Freigabe-Historie zu Deliverables",
    promisedBy: "PROJ-105",
    blocksHardDelete: true,
  },
  {
    table: "ma_clearance_request_events",
    parentTable: "ma_clearance_grant_requests",
    parentForeignKey: "ma_clearance_request_events_request_id_fkey",
    label: "Historie der Vertraulichkeits-Freischaltungen",
    promisedBy: "PROJ-100c",
    blocksHardDelete: true,
  },
  {
    table: "construction_defect_events",
    parentTable: "construction_defects",
    parentForeignKey: "construction_defect_events_defect_id_fkey",
    label: "Mängel-Historie",
    promisedBy: "PROJ-45-β",
    // Measured: with one seeded event the project delete SUCCEEDED and the
    // event rows went with it. `enforce_construction_defect_event_immutability`
    // steps aside on plain parent absence, without requiring the teardown
    // switch the other four insist on — and a cascade removes the parent first.
    // Listing it as a blocker would refuse deletes that in fact succeed. That
    // the promise is weaker here than in its four siblings is a finding about
    // PROJ-45-β, tracked as PROJ-Y-148d, not something to paper over here.
    blocksHardDelete: false,
  },
] as const satisfies readonly GovernanceHistoryIsland[]

/** Stable API error code for "cannot be permanently deleted". */
export const GOVERNANCE_HISTORY_BLOCK_CODE = "governance_history_immutable"

export interface GovernanceHistoryBlock {
  /** German labels of the affected kinds, in registry order. */
  kinds: string[]
  /** Total number of immutable event rows behind this project. */
  total: number
}

export type GovernanceHistoryDetection =
  | { status: "ok"; block: GovernanceHistoryBlock | null }
  | { status: "check_failed"; message: string }

interface CountResult {
  count: number | null
  error: { code?: string; message: string } | null
}

/**
 * Counts the events of one island that belong to the project under scrutiny.
 *
 * A callback rather than a client interface: a hand-written structural type
 * for supabase-js's builder chain does not survive the real client
 * (PROJ-130-δ1 hit exactly that and switched to a callback). `PromiseLike`
 * because `PostgrestFilterBuilder` is thenable, not a `Promise`.
 */
export type GovernanceHistoryCounter = (
  island: GovernanceHistoryIsland
) => PromiseLike<CountResult>

/**
 * PostgREST/Postgres codes meaning "this table does not exist here".
 *
 * Written because `construction_defect_events` lived in prod while no repo
 * migration created it — PROJ-45-β landed on `main` mid-slice and closed that
 * particular gap, so today all five tables exist in both places. The tolerance
 * stays: an island is registered here the moment its guard exists in prod, and
 * a database built from the migration files may legitimately lag behind by one
 * merge. Treating a missing table as zero keeps both environments working
 * instead of failing the count. The house rule is to swallow `42P01` and
 * nothing else; `PGRST205` is its PostgREST-side equivalent.
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"])

export async function detectGovernanceHistory(
  count: GovernanceHistoryCounter
): Promise<GovernanceHistoryDetection> {
  const kinds: string[] = []
  let total = 0

  for (const island of GOVERNANCE_HISTORY_ISLANDS) {
    // An island that does not refuse the cascade must not produce a refusal
    // here either, or the pre-flight would block a delete that would succeed.
    if (!island.blocksHardDelete) continue

    const { count: rows, error } = await count(island)

    if (error) {
      if (error.code && MISSING_TABLE_CODES.has(error.code)) continue
      // Anything else is a real read failure. Report it instead of guessing:
      // claiming "deletable" would promise something we did not verify, and
      // claiming "blocked" would refuse a delete we have no reason to refuse.
      return { status: "check_failed", message: error.message }
    }

    if (rows && rows > 0) {
      kinds.push(island.label)
      total += rows
    }
  }

  return { status: "ok", block: kinds.length > 0 ? { kinds, total } : null }
}

/**
 * The sentence the user reads — in the pre-flight notice and in the API error,
 * so the two can never drift apart.
 *
 * Deliberately not an apology and not a red alert: the trash is an unbounded,
 * legitimate resting place (there is no auto-purge since PROJ-130-α), so
 * "stays in the trash" is the outcome, not a failure.
 */
export function governanceHistoryMessage(block: GovernanceHistoryBlock): string {
  const kinds = formatKindList(block.kinds)
  const entries = block.total === 1 ? "1 Eintrag" : `${block.total} Einträge`
  return (
    `Dieses Projekt kann nicht endgültig gelöscht werden: es trägt ${kinds} ` +
    `(${entries}). Diese Historie ist unveränderlich und darf auch beim ` +
    `Löschen nicht entfernt werden. Das Projekt bleibt dauerhaft im Papierkorb.`
  )
}

function formatKindList(kinds: string[]): string {
  if (kinds.length <= 1) return kinds[0] ?? "unveränderliche Historie"
  return `${kinds.slice(0, -1).join(", ")} und ${kinds[kinds.length - 1]}`
}
