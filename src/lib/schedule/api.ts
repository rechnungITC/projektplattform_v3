/**
 * PROJ-155-β.2 — Client-Wrapper für die transaktionale Kaskaden-Übernahme.
 *
 * Der Fehlerpfad wertet den **stabilen `code`** aus, nicht den Meldungstext.
 * Beides hat das Haus schon gekostet: PROJ-77-α prüfte auf ein Meldungsfragment,
 * und β.1 fand einen Anlege-Pfad, der `err?.message` las, während die API
 * `{ error: { code, message } }` liefert — der Grund war dort **immer**
 * `undefined`.
 */

export type ApplyScheduleKind = "work_item" | "phase" | "milestone"

export interface ApplyScheduleInput {
  kind: ApplyScheduleKind
  id: string
  start?: string
  end?: string
  target?: string
  /** Was die Vorschau erwartet hatte — rein informativ, der Server rechnet neu. */
  expectedShiftIds?: string[]
}

export interface ApplyScheduleResult {
  applied: {
    work_items: number
    phases: number
    milestones: number
    total: number
  }
  cascade: {
    shifts: { id: string; start: string; end: string; deltaDays: number }[]
    skipped: { id: string; reason: "no_dates" }[]
    conflicts: unknown[]
    truncated: boolean
  }
  /** Der Server hat neu gerechnet und kam auf etwas anderes als die Vorschau. */
  diverged_from_preview: boolean
  milestone_shift_days: number
}

export class ApplyScheduleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ApplyScheduleError"
  }
}

/** Deutsche Meldung je stabiler Fehlerkennung. */
export function applyScheduleMessage(code: string, fallback: string): string {
  switch (code) {
    case "shift_target_not_writable":
      return "Mindestens ein Ziel der Verschiebung ist nicht schreibbar. Es wurde kein Termin geändert."
    case "forbidden":
      return "Für diese Änderung fehlt die Berechtigung."
    case "unauthorized":
      return "Die Sitzung ist abgelaufen. Bitte neu anmelden."
    case "not_found":
      return "Das Projekt wurde nicht gefunden."
    default:
      return fallback
  }
}

export async function applyScheduleShift(
  projectId: string,
  input: ApplyScheduleInput,
): Promise<ApplyScheduleResult> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/schedule/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: input.kind,
        id: input.id,
        ...(input.start ? { start: input.start } : {}),
        ...(input.end ? { end: input.end } : {}),
        ...(input.target ? { target: input.target } : {}),
        ...(input.expectedShiftIds
          ? { expected_shift_ids: input.expectedShiftIds }
          : {}),
      }),
    },
  )

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null
    const code = body?.error?.code ?? "apply_failed"
    throw new ApplyScheduleError(
      applyScheduleMessage(code, body?.error?.message ?? `HTTP ${res.status}`),
      code,
      res.status,
    )
  }

  return (await res.json()) as ApplyScheduleResult
}
