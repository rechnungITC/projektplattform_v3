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
 * The six append-only islands in the `ON DELETE CASCADE` closure of
 * `projects`, measured live against prod: recursive `pg_constraint` walk over
 * `confdeltype='c'`, intersected with `DELETE` triggers whose function raises.
 * All five sit at cascade depth 2 (project → parent → events).
 *
 * Two of them raise `23514` (check_violation), three raise `42501` — which is
 * exactly why the delete branch cannot rely on a single SQLSTATE and the
 * pre-check is the authoritative mechanism.
 *
 * Since PROJ-Y-148d all five block. The flag stays on every entry rather than
 * being dropped as redundant: whether an island refuses the cascade is a
 * property of its guard, measured per island, not something to infer from the
 * mere presence of a guard — `construction_defect_events` had a guard and
 * refused nothing. A sixth island may well be non-blocking again.
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
    // Flipped to `true` by PROJ-Y-148d, which removed the exit from
    // `enforce_construction_defect_event_immutability`. Until then the guard
    // stepped aside on plain parent absence — and a cascade removes the parent
    // first, so the exception fired on every project teardown and the history
    // went with the project, unlike its four siblings.
    //
    // Two things settled that, neither of them a judgement call: PROJ-45-β
    // justified the exit as "unreachable through the app (no DELETE policy on
    // construction_defects)", which is true of the *direct* path and not of the
    // cascade; and its second reason — do not create a new blocker of the
    // PROJ-148 class — expired when PROJ-Y-148a chose variant 1, where blocking
    // IS the answer and only has to be said honestly.
    //
    // Re-measured after the migration: a project with one seeded defect event is
    // refused, one without is still deleted.
    blocksHardDelete: true,
  },
  {
    table: "construction_acceptance_events",
    parentTable: "construction_acceptances",
    parentForeignKey: "construction_acceptance_events_acceptance_id_fkey",
    label: "Abnahme-Historie",
    promisedBy: "PROJ-45-γ",
    // GEMESSEN, nicht abgeleitet (rollback-Sonde gegen Prod): mit EINEM
    // geseedeten Ereignis wird das endgueltige Loeschen des Projekts mit
    // `42501 construction acceptance events are append-only` abgelehnt.
    //
    // Die sechste Insel — und der Kommentar oben („eine sechste kann nicht
    // unbemerkt hereinrutschen") hat genau dafuer gestanden. Sie kam zustande,
    // weil γs Waechter zunaechst nach dem Vorbild von β gebaut war und dessen
    // Kaskaden-Ausstieg mitgeerbt hatte; eine parallele Session hat β am selben
    // Tag gehaertet (PROJ-Y-148d), γ ist per Fix-forward nachgezogen
    // (20260819170000). Ohne beides waere die Abnahme-Historie beim
    // Projekt-Abriss still verschwunden — bei dem Objekt, das Gefahrenuebergang
    // und Fristbeginn belegt.
    blocksHardDelete: true,
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
  count: GovernanceHistoryCounter,
  /**
   * Which islands to ask. Defaults to the real registry; overridable so the
   * `blocksHardDelete: false` rule below stays under test.
   *
   * PROJ-Y-148d made all five islands blocking, which left the two tests for
   * that rule unable to trigger it through the real registry — a test that
   * cannot fail guards nothing. The rule itself still matters: a sixth island
   * may well be non-blocking, and it must then not be queried. So it is tested
   * against a synthetic island instead of against today's data.
   */
  islands: readonly GovernanceHistoryIsland[] = GOVERNANCE_HISTORY_ISLANDS
): Promise<GovernanceHistoryDetection> {
  const kinds: string[] = []
  let total = 0

  for (const island of islands) {
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
