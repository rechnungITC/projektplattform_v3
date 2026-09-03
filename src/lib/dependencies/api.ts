import type { DependencyConstraintType } from "@/types/dependency"

/**
 * Client-Wrapper für die Kanten des Netzablaufplans.
 *
 * Vor PROJ-155-β.1 gab es keinen: der Gantt und die Registerfläche riefen
 * `fetch` je selbst auf und formulierten ihre Fehlermeldungen getrennt. Ein
 * gemeinsamer Weg ist hier mehr als Ordnung — die Fehlerübersetzung ist der
 * eigentliche Ertrag: die API antwortet mit einem stabilen `code`, und nur
 * dieser wird ausgewertet. Auf Meldungstexte zu prüfen ist das Anti-Muster,
 * das PROJ-77-α ausdrücklich benennt.
 */

export interface DependencyRow {
  id: string
  tenant_id: string
  from_type: string
  from_id: string
  to_type: string
  to_id: string
  constraint_type: DependencyConstraintType
  lag_days: number
  created_at?: string
  created_by?: string | null
}

/** Fehler mit mitgeführtem Code — die Fläche entscheidet daran, nicht am Text. */
export class DependencyApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "DependencyApiError"
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

/**
 * Deutsche Meldung je bekanntem Code.
 *
 * `cycle_detected` ist der Grund, warum diese Tabelle existiert: vorher landete
 * bei einem Kreis der rohe Datenbanktext („dependency cycle detected") in einem
 * Toast. Die übrigen Codes kommen aus der POST- und der PATCH-Route.
 */
const MESSAGES: Record<string, string> = {
  cycle_detected:
    "Diese Verbindung würde einen Kreis schliessen — A hinge dann mittelbar von B ab und B von A.",
  duplicate_dependency:
    "Zwischen diesen beiden Objekten gibt es bereits eine Abhängigkeit dieses Typs.",
  cross_tenant: "Objekte aus verschiedenen Mandanten lassen sich nicht verbinden.",
  invalid_reference: "Eines der verbundenen Objekte existiert nicht mehr.",
  not_found: "Diese Abhängigkeit gibt es in diesem Projekt nicht.",
  forbidden: "Dafür fehlt die Berechtigung.",
  unauthorized: "Die Sitzung ist abgelaufen. Bitte neu anmelden.",
}

export function dependencyErrorMessage(code: string, fallback: string): string {
  return MESSAGES[code] ?? fallback
}

async function toError(res: Response): Promise<DependencyApiError> {
  let body: ApiErrorBody = {}
  try {
    body = (await res.json()) as ApiErrorBody
  } catch {
    // Kein JSON — dann bleibt es beim Status.
  }
  const code = body.error?.code ?? "unknown"
  const raw = body.error?.message ?? `HTTP ${res.status}`
  return new DependencyApiError(
    dependencyErrorMessage(code, raw),
    code,
    res.status,
  )
}

export async function updateDependency(
  projectId: string,
  dependencyId: string,
  patch: {
    constraint_type?: DependencyConstraintType
    lag_days?: number
  },
): Promise<DependencyRow> {
  const res = await fetch(
    `/api/projects/${projectId}/dependencies/${dependencyId}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  )
  if (!res.ok) throw await toError(res)
  const body = (await res.json()) as { dependency: DependencyRow }
  return body.dependency
}

export async function deleteDependency(
  projectId: string,
  dependencyId: string,
): Promise<void> {
  const res = await fetch(
    `/api/projects/${projectId}/dependencies/${dependencyId}`,
    { method: "DELETE" },
  )
  if (!res.ok) throw await toError(res)
}

export async function createDependency(
  projectId: string,
  input: {
    from_type: string
    from_id: string
    to_type: string
    to_id: string
    constraint_type: DependencyConstraintType
    lag_days: number
  },
): Promise<DependencyRow> {
  const res = await fetch(`/api/projects/${projectId}/dependencies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw await toError(res)
  const body = (await res.json()) as { dependency: DependencyRow }
  return body.dependency
}
