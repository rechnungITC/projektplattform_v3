/**
 * PROJ-130-γ2b — Verwaltung der Revisions-Leseberechtigung (Client-Seite).
 *
 * Die Freigabe ersetzt die Mitgliedschaft, NICHT die Klassifikation: wer sie hat,
 * liest den Audit-Trail des Mandanten ohne Projektmitglied zu sein — aber die
 * Need-to-know-Prüfung aus γ1 bleibt dahinter aktiv (`strict`-Einträge bleiben
 * verborgen). Vergabe und Widerruf laufen ausschließlich über die
 * SECURITY-DEFINER-RPCs hinter dieser API; `audit_reader_grants` hat bewusst
 * keine schreibenden Policies.
 */

export interface AuditReaderGrant {
  id: string
  tenant_id: string
  user_id: string
  scope: string
  valid_from: string
  valid_until: string | null
  note: string | null
  granted_by: string | null
  granted_at: string
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const base = (tenantId: string) =>
  `/api/tenants/${encodeURIComponent(tenantId)}/audit-readers`

export async function listAuditReaders(tenantId: string): Promise<AuditReaderGrant[]> {
  const res = await fetch(base(tenantId), { cache: "no-store" })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { grants: AuditReaderGrant[] }).grants
}

export async function grantAuditReader(
  tenantId: string,
  payload: { user_id: string; valid_until?: string | null; note?: string | null }
): Promise<void> {
  const res = await fetch(base(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
}

export async function revokeAuditReader(
  tenantId: string,
  userId: string
): Promise<void> {
  const res = await fetch(base(tenantId), {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  })
  if (!res.ok) throw new Error(await safeError(res))
}

// --- Reine Helfer (unit-getestet) -------------------------------------------

export type GrantStatus = "aktiv" | "unbefristet" | "abgelaufen"

/**
 * Eine abgelaufene Freigabe steht weiter in der Liste, wirkt aber nicht mehr —
 * das prüft `has_audit_reader_grant` in der Datenbank. Die Oberfläche muss diesen
 * Unterschied zeigen, sonst hält ein Administrator einen Prüfer für berechtigt,
 * der längst nichts mehr sieht.
 */
export function grantStatus(
  grant: Pick<AuditReaderGrant, "valid_until">,
  now: Date = new Date()
): GrantStatus {
  if (!grant.valid_until) return "unbefristet"
  return new Date(grant.valid_until).getTime() < now.getTime()
    ? "abgelaufen"
    : "aktiv"
}

/**
 * Das Formular fragt ein Datum ab, die API verlangt einen Zeitpunkt mit
 * Zeitzonen-Offset. Eine Freigabe „bis 30.09." endet am Ende dieses Tages in der
 * Zeitzone des Bedieners — würde man Mitternacht nehmen, verlöre der Prüfer den
 * Zugang einen Tag früher als zugesagt.
 */
export function endOfDayIso(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Datum muss die Form JJJJ-MM-TT haben")
  }
  return new Date(`${date}T23:59:59`).toISOString()
}
