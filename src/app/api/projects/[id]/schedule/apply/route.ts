import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import {
  cascadeEdgesFor,
  computeScheduleCascade,
  type CascadeNode,
  type DependencyRow,
} from "@/lib/work-items/schedule-cascade"

/**
 * PROJ-155-β.2 — `POST /api/projects/[id]/schedule/apply`
 *
 * **Eine** Anfrage für den gezogenen Knoten UND seine ganze Kaskade, atomar
 * geschrieben (AC-15). Ersetzt auf dem Phasen-Pfad zugleich den `Promise.all`
 * mit `.catch(() => undefined)`, über den die Kind-Meilensteine heute in N
 * einzelnen, nicht-transaktionalen Aufrufen verschoben werden (AC-20).
 *
 * **Der Server ist die Autorität und rechnet neu** (Nutzer-Entscheid Q1): er lädt
 * Kanten und Termine FRISCH aus der Datenbank, weil der Browser einen veralteten
 * Stand haben kann. Er benutzt dafür aber **dieselbe** Funktion wie die Vorschau
 * (`computeScheduleCascade`) — es gibt also keine zweite Formel und damit auch
 * nicht das Divergenzrisiko, das der Design-Brief unter R-A als PROJ-45-γ-Klasse
 * führt. Weicht das Ergebnis von dem ab, was der Browser vorgeschlagen hatte,
 * gewinnt der Server und sagt es (`diverged_from_preview`).
 */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")

const bodySchema = z
  .object({
    /** Der gezogene Knoten. */
    kind: z.enum(["work_item", "phase", "milestone"]),
    id: z.string().uuid(),
    /** Neues Fenster (work_item/phase). */
    start: dateString.optional(),
    end: dateString.optional(),
    /** Neues Zieldatum (milestone). */
    target: dateString.optional(),
    /**
     * Was der Browser als Kaskade erwartet hatte. **Optional und rein
     * informativ** — der Server rechnet ohnehin neu. Wird es mitgeschickt,
     * meldet die Antwort, ob das Ergebnis abweicht.
     */
    expected_shift_ids: z.array(z.string().uuid()).max(500).optional(),
  })
  .refine(
    (v) =>
      v.kind === "milestone"
        ? Boolean(v.target)
        : Boolean(v.start) && Boolean(v.end),
    {
      message:
        "work_item/phase require start and end; milestone requires target",
    },
  )
  .refine((v) => (v.start && v.end ? v.end >= v.start : true), {
    message: "end must be on or after start",
    path: ["end"],
  })

type ShiftPayload =
  | { kind: "work_item" | "phase"; id: string; start: string; end: string }
  | { kind: "milestone"; id: string; target: string }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  if (!z.string().uuid().safeParse(projectId).success) {
    return apiError("invalid_parameter", "Invalid project id.", 400, "id")
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return apiError("invalid_body", "Body must be valid JSON.", 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return apiError(
      "validation_error",
      first?.message ?? "Invalid request body.",
      400,
      first?.path?.[0]?.toString(),
    )
  }
  const body = parsed.data

  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "edit")
  if (access.error) return access.error

  const shifts: ShiftPayload[] = []

  // --- Der gezogene Knoten selbst ---------------------------------------
  if (body.kind === "milestone") {
    shifts.push({ kind: "milestone", id: body.id, target: body.target! })
  } else {
    shifts.push({
      kind: body.kind,
      id: body.id,
      start: body.start!,
      end: body.end!,
    })
  }

  /**
   * AC-20 — der Meilenstein-Mitzug der Phase läuft durch denselben Pfad.
   *
   * Bisher: Phase per eigenem PATCH, danach N Meilenstein-PATCHes mit
   * `.catch(() => undefined)`. Scheiterten alle N, war die Phase trotzdem schon
   * verschoben. Jetzt liegt beides in einer Transaktion — schlägt ein
   * Meilenstein fehl, ist auch die Phase nicht bewegt.
   */
  let phaseShiftDays = 0
  if (body.kind === "phase") {
    const { data: phase } = await supabase
      .from("phases")
      .select("planned_start")
      .eq("id", body.id)
      .eq("project_id", projectId)
      .maybeSingle()
    if (phase?.planned_start && body.start) {
      phaseShiftDays = Math.round(
        (Date.parse(`${body.start}T00:00:00Z`) -
          Date.parse(`${phase.planned_start}T00:00:00Z`)) /
          86_400_000,
      )
    }
    if (phaseShiftDays !== 0) {
      const { data: children } = await supabase
        .from("milestones")
        .select("id, target_date")
        .eq("project_id", projectId)
        .eq("phase_id", body.id)
      for (const m of children ?? []) {
        if (!m.target_date) continue
        const shifted = new Date(
          Date.parse(`${m.target_date}T00:00:00Z`) +
            phaseShiftDays * 86_400_000,
        )
          .toISOString()
          .slice(0, 10)
        shifts.push({ kind: "milestone", id: m.id, target: shifted })
      }
    }
  }

  // --- Die Kaskade, frisch gerechnet ------------------------------------
  // Nur Arbeitspakete kaskadieren: `dependencies` verbindet work_items
  // untereinander. Phasen und Meilensteine haben keine Kanten in diesem Modell.
  let cascade = {
    shifts: [] as { id: string; start: string; end: string; deltaDays: number }[],
    skipped: [] as { id: string; reason: "no_dates" }[],
    conflicts: [] as unknown[],
    truncated: false,
  }

  if (body.kind === "work_item") {
    const { data: items, error: itemsErr } = await supabase
      .from("work_items")
      .select("id, planned_start, planned_end")
      .eq("project_id", projectId)
      .eq("is_deleted", false)
    if (itemsErr) return apiError("list_failed", itemsErr.message, 500)

    const nodes: CascadeNode[] = (items ?? []).map((i) => ({
      id: i.id,
      window: { start: i.planned_start, end: i.planned_end },
    }))

    /**
     * PROJ-Y-155f — die Kantenabfrage, zweimal korrigiert.
     *
     * Vorher stand hier `.eq("project_id", projectId)` **und** ein Filter auf
     * `from_type`/`to_type`. Beides war falsch, und zwar unabhängig voneinander:
     *
     * 1. `dependencies` hat **keine** Spalte `project_id` (live gemessen: es
     *    trägt `tenant_id`, `from_type`/`from_id`, `to_type`/`to_id`,
     *    `constraint_type`, `lag_days`). PostgREST antwortete darauf mit einem
     *    Fehler, `data` war `null`, `edges ?? []` machte daraus eine leere
     *    Kantenliste — und weil der Fehler **nicht geprüft** wurde, sah die
     *    Antwort plausibel aus (`total: 1`, leere Kaskade) statt laut zu
     *    scheitern. Das ist der Grund, warum der Defekt unsichtbar war.
     * 2. Der Typfilter verlangte `todo`/`todo`, während Arbeitspakete
     *    `work_package` tragen — er hätte also auch mit korrekter Spalte nichts
     *    durchgelassen.
     *
     * Der Projektbezug kommt jetzt aus den **Endpunkten**: geladen werden nur
     * Kanten, deren Ausgangsknoten ein Arbeitspaket dieses Projekts ist, und
     * `cascadeEdgesFor` verlangt zusätzlich, dass auch das Ziel bekannt ist.
     * Die Mandantengrenze trägt die RLS (`dependencies` ist mitgliedsgegatet)
     * plus der `tg_dep_validate_tenant_boundary`-Trigger auf der Schreibseite.
     *
     * Der Fehler wird ab hier **geprüft**. Eine leere Kaskade heisst dann
     * wirklich „keine Kanten", nicht „die Abfrage ist gescheitert".
     */
    let edges: DependencyRow[] = []
    if (nodes.length > 0) {
      const { data: edgeRows, error: edgesErr } = await supabase
        .from("dependencies")
        .select("from_id, to_id, constraint_type, lag_days")
        .in(
          "from_id",
          nodes.map((n) => n.id),
        )
      if (edgesErr) return apiError("list_failed", edgesErr.message, 500)
      edges = edgeRows ?? []
    }

    const cascadeEdges = cascadeEdgesFor(nodes, edges)

    const result = computeScheduleCascade(
      body.id,
      { start: body.start!, end: body.end! },
      nodes,
      cascadeEdges,
    )
    cascade = result
    for (const s of result.shifts) {
      shifts.push({ kind: "work_item", id: s.id, start: s.start, end: s.end })
    }
  }

  // --- Atomar schreiben --------------------------------------------------
  const { data: applied, error } = await supabase.rpc("apply_schedule_shifts", {
    p_project_id: projectId,
    p_shifts: shifts,
  })

  if (error) {
    // P0002 = ein Ziel war nicht schreibbar. Die Funktion verwirft dann die
    // GANZE Transaktion; es ist also garantiert kein Termin geändert.
    if (error.code === "P0002") {
      return apiError(
        "shift_target_not_writable",
        "Mindestens ein Ziel der Verschiebung ist nicht schreibbar. Es wurde kein Termin geändert.",
        409,
      )
    }
    if (error.code === "22023") {
      return apiError("invalid_parameter", error.message, 422)
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Keine Berechtigung für diese Änderung.", 403)
    }
    return apiError("apply_failed", error.message, 500)
  }

  /**
   * Der Abweichungs-Hinweis. Der Server hat neu gerechnet; wenn der Browser
   * eine andere Menge erwartet hatte, ist seine Vorschau veraltet — dann gewinnt
   * der Server, und die Oberfläche sagt es dem Nutzer (Nutzer-Entscheid Q1).
   */
  let divergedFromPreview = false
  if (body.expected_shift_ids) {
    const actual = new Set(cascade.shifts.map((s) => s.id))
    const expected = new Set(body.expected_shift_ids)
    divergedFromPreview =
      actual.size !== expected.size ||
      [...actual].some((id) => !expected.has(id))
  }

  return NextResponse.json({
    applied,
    cascade,
    diverged_from_preview: divergedFromPreview,
    milestone_shift_days: phaseShiftDays,
  })
}
