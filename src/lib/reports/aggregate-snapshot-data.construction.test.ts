import { describe, expect, it, vi } from "vitest"

import type { SupabaseClient } from "@supabase/supabase-js"

import { aggregateSnapshotData } from "./aggregate-snapshot-data"

// PROJ-45-δ (AC-45δ.17/.18/.19, AC-45δH-11) — der Bau-Block des
// Status-Reports ist OPTIONAL. Der eigentliche Prüfgegenstand ist nicht,
// dass der Block bei einem Bauprojekt erscheint, sondern dass der
// gespeicherte Inhalt eines Nicht-Bauprojekts byte-identisch bleibt: der
// Schlüssel muss FEHLEN, nicht `null` und nicht `{}` sein — sonst landet er
// im JSONB. `toBeUndefined()` allein würde das nicht zeigen, weil ein
// gesetzter Schlüssel mit `undefined` diese Zusicherung besteht, aber die
// Schlüsselliste verändert. Deshalb: eingefrorene Liste + `in`-Prüfung.

vi.mock("@/lib/project-readiness/aggregate", () => ({
  resolveProjectReadiness: vi.fn(async () => ({
    state: "ready_with_gaps" as const,
    counts: { open_blockers: 0, open_warnings: 1, satisfied: 4 },
  })),
}))

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
const TENANT_ID = "22222222-2222-4222-8222-222222222222"
const NOW = new Date("2026-08-20T10:00:00.000Z")

/**
 * Eingefrorene Schlüsselliste des `content` vor dieser Slice — in genau
 * dieser Reihenfolge. `readiness` steht drin, obwohl es optional ist: das
 * Bestandsfeld wird unbedingt gesetzt (ggf. mit `undefined`) und ist damit
 * Teil der Liste. Genau dieses Muster darf der Bau-Block NICHT übernehmen.
 */
const FROZEN_CONTENT_KEYS = [
  "header",
  "traffic_light",
  "phases",
  "upcoming_milestones",
  "top_risks",
  "top_decisions",
  "overdue_open_items",
  "open_items_total",
  "work_item_counts",
  "ki_summary",
  "manual_summary",
  "generated_by_name",
  "generated_at",
  "readiness",
]

type Row = Record<string, unknown>

interface TableFixture {
  rows?: Row[]
  count?: number
  single?: Row | null
}

interface QueryResult {
  data: Row[]
  count: number
  error: null
}

interface Builder extends PromiseLike<QueryResult> {
  select: (...args: unknown[]) => Builder
  eq: (...args: unknown[]) => Builder
  neq: (...args: unknown[]) => Builder
  is: (...args: unknown[]) => Builder
  order: (...args: unknown[]) => Builder
  limit: (...args: unknown[]) => Builder
  maybeSingle: () => Promise<{ data: Row | null; error: null }>
}

function makeBuilder(fixture: TableFixture): Builder {
  const result: QueryResult = {
    data: fixture.rows ?? [],
    count: fixture.count ?? 0,
    error: null,
  }
  const builder: Builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: fixture.single ?? null, error: null }),
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  }
  return builder
}

interface RpcOutcome {
  data: unknown
  error: { message: string } | null
}

function makeSupabase(
  projectRow: Row,
  rpcOutcome: RpcOutcome,
): { client: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const tables: Record<string, TableFixture> = {
    projects: { single: projectRow },
    tenants: { single: { id: TENANT_ID, name: "Bau AG", branding: null } },
    phases: { rows: [] },
    milestones: { rows: [] },
    risks: { rows: [] },
    decisions: { rows: [] },
    open_items: { rows: [], count: 0 },
    work_items: { rows: [] },
    profiles: { single: null },
  }
  const rpc = vi.fn(async () => rpcOutcome)
  const client = {
    from: (table: string) => makeBuilder(tables[table] ?? {}),
    rpc,
  } as unknown as SupabaseClient
  return { client, rpc }
}

function run(projectRow: Row, rpcOutcome: RpcOutcome) {
  const { client, rpc } = makeSupabase(projectRow, rpcOutcome)
  return aggregateSnapshotData(
    {
      supabase: client,
      projectId: PROJECT_ID,
      generatorUserId: "u-1",
      generatorDisplayName: "Tester",
      now: NOW,
    },
    "status_report",
  ).then((res) => ({ ...res, rpc }))
}

const NO_RPC: RpcOutcome = { data: null, error: null }

function baseProject(projectType: string | null): Row {
  return {
    id: PROJECT_ID,
    tenant_id: TENANT_ID,
    name: "Projekt",
    project_method: "waterfall",
    project_type: projectType,
    responsible_user_id: null,
    type_specific_data: null,
  }
}

const SIGNALS_WITH_AXIS = {
  project_id: PROJECT_ID,
  as_of: "2026-08-20T09:59:00+00:00",
  window_days: 14,
  summary: {
    overdue_defects: 3,
    defects_without_due_date: 1,
    defects_awaiting_review: 2,
    blocked_trades: 1,
    trades_total: 2,
    sections_total: 2,
  },
  trades: [
    {
      project_trade_id: "pt-1",
      trade_id: "t-1",
      trade_label: "Rohbau",
      manual_status: "gruen",
      responsible_user_id: null,
      is_blocked: true,
      blocker_reasons: ["overdue_defects", "reservations_open"],
      overdue_defects: 3,
      defects_without_due_date: 1,
      defects_awaiting_review: 2,
      acceptances_refused: 0,
      acceptances_overdue_scheduled: 0,
      acceptances_with_open_reservations: 1,
    },
    {
      project_trade_id: "pt-2",
      trade_id: "t-2",
      trade_label: "Elektro",
      manual_status: "gruen",
      responsible_user_id: null,
      is_blocked: false,
      blocker_reasons: [],
      overdue_defects: 0,
      defects_without_due_date: 0,
      defects_awaiting_review: 0,
      acceptances_refused: 0,
      acceptances_overdue_scheduled: 0,
      acceptances_with_open_reservations: 0,
    },
  ],
  sections: [
    {
      section_id: "s-1",
      parent_id: null,
      label: "Haus A",
      sort_order: 1,
      subtree_depth: 1,
      progress_source: "work_items",
      source_count: 4,
      linked_count: 4,
      progress_percent: 50,
      overdue_items: 1,
      phase_linked_count: 0,
    },
    {
      section_id: "s-2",
      parent_id: "s-1",
      label: "Haus A / OG",
      sort_order: 2,
      subtree_depth: 0,
      progress_source: null,
      source_count: 0,
      linked_count: 0,
      progress_percent: null,
      overdue_items: 0,
      phase_linked_count: 0,
    },
  ],
  deadlines: [],
  overdue_defects: [],
}

describe("aggregateSnapshotData — PROJ-45-δ Bau-Block", () => {
  it("lässt den Schlüssel bei einem Nicht-Bauprojekt FEHLEN und hält die eingefrorene Schlüsselliste (AC-45δ.18, AC-45δH-11)", async () => {
    const { content, rpc } = await run(baseProject("erp"), NO_RPC)

    // (a) der Schlüssel FEHLT — nicht bloss `undefined`. Steht bewusst VOR
    //     dem Listenvergleich: sonst schlägt immer nur die Liste zu und diese
    //     Zusicherung wäre nie nachweislich wirksam.
    expect("construction" in content).toBe(false)
    // (b) eingefrorene Liste — fängt zusätzlich Reihenfolge und jeden anderen
    //     neuen Schlüssel.
    expect(Object.keys(content)).toEqual(FROZEN_CONTENT_KEYS)
    // Die Auswertung wird bei einem Nicht-Bauprojekt gar nicht gerufen.
    expect(rpc).not.toHaveBeenCalled()
  })

  it("nimmt den Block bei einem Bauprojekt mit belegter Bauachse auf (AC-45δ.17)", async () => {
    const { content, rpc } = await run(baseProject("construction"), {
      data: SIGNALS_WITH_AXIS,
      error: null,
    })

    expect(rpc).toHaveBeenCalledWith("construction_schedule_signals", {
      p_project_id: PROJECT_ID,
    })
    expect(Object.keys(content)).toEqual([
      ...FROZEN_CONTENT_KEYS,
      "construction",
    ])
    expect(content.construction).toEqual({
      as_of: "2026-08-20T09:59:00+00:00",
      trades_total: 2,
      blocked_trades_total: 1,
      blocked_trades: [
        {
          trade_label: "Rohbau",
          blocker_reasons: ["overdue_defects", "reservations_open"],
        },
      ],
      sections: [
        {
          label: "Haus A",
          progress_percent: 50,
          progress_source: "work_items",
          overdue_items: 1,
        },
        {
          label: "Haus A / OG",
          progress_percent: null,
          progress_source: null,
          overdue_items: 0,
        },
      ],
      overdue_defects_total: 3,
    })
  })

  it("lässt den Schlüssel bei einem Bauprojekt OHNE belegte Bauachse fehlen (AC-45δ.18)", async () => {
    const { content, rpc } = await run(baseProject("construction"), {
      data: {
        ...SIGNALS_WITH_AXIS,
        summary: {
          ...SIGNALS_WITH_AXIS.summary,
          trades_total: 0,
          sections_total: 0,
        },
        trades: [],
        sections: [],
      },
      error: null,
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(Object.keys(content)).toEqual(FROZEN_CONTENT_KEYS)
    expect("construction" in content).toBe(false)
  })

  it("fällt bei einem Fehler der Auswertung weich zurück, statt die Erzeugung zu brechen", async () => {
    const { content } = await run(baseProject("construction"), {
      data: null,
      error: { message: "permission denied for function" },
    })

    expect(Object.keys(content)).toEqual(FROZEN_CONTENT_KEYS)
    expect("construction" in content).toBe(false)
    // Der Rest des Berichts entsteht trotzdem.
    expect(content.header.project_id).toBe(PROJECT_ID)
    expect(content.readiness?.state).toBe("ready_with_gaps")
  })
})
