/**
 * PROJ-Y-143f — a fetch error that still carries its HTTP status.
 *
 * The client wrappers threw `new Error(body.error.message)`, which discards
 * the status and forces callers to sniff message text to tell "not found"
 * from "conflict" — the exact anti-pattern flagged as a follow-up in the
 * PROJ-77-α QA. It matters here because a module-gated read answers `404`
 * with the deliberately generic body "Resource not found." (see
 * `requireModuleActive`, read intent), and the UI must be able to tell that
 * apart from a genuine failure without parsing German prose.
 *
 * Adopted where it is needed rather than everywhere at once; other wrappers
 * can move over as they are touched.
 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

/**
 * Builds an {@link ApiRequestError} from a failed response, keeping the
 * server's message verbatim so existing copy and toasts are unchanged.
 */
export async function apiRequestError(
  response: Response,
): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return new ApiRequestError(
      body.error?.message ?? `HTTP ${response.status}`,
      response.status,
      body.error?.code,
    )
  } catch {
    return new ApiRequestError(`HTTP ${response.status}`, response.status)
  }
}

/**
 * True when a read failed because the surface is not available to this
 * workspace — a module-gated `GET` answers `404`.
 *
 * Deliberately status-based, not code-based: `requireModuleActive` and
 * `requireProjectAccess` both answer `not_found`, and giving the module gate
 * its own code would tell any caller *why* the surface is hidden, which is
 * precisely what that 404 exists to avoid. Call sites therefore interpret it
 * with the context they already have — see the comments where it is used.
 */
export function isUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404
}
