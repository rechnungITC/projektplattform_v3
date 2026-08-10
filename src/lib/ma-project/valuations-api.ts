import type { Valuation, ValuationLink, ValuationLinkKind } from "@/types/valuation"

// PROJ-120 — Client-Wrapper für Bewertungsversionen + Findings-Verknüpfungen.

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

async function safeError(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: { message?: string } }
    return b.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export interface CreateValuationVersionPayload {
  title: string
  valuation_date: string
  method: string
  value_low?: number | null
  value_high?: number | null
  currency?: string
  assumptions?: string | null
  author_user_id?: string | null
  version_comment?: string | null
  confidentiality_level?: string
  /** Pflicht, sobald bereits eine gültige Version existiert (F1). */
  supersedes_valuation_id?: string | null
}

/** Vollständige Versionskette; der Eintrag mit `is_current` ist die gültige Sicht. */
export async function listValuations(projectId: string): Promise<Valuation[]> {
  const res = await fetch(`${p(projectId)}/valuations`, {
    method: "GET",
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { valuations: Valuation[] }).valuations
}

export async function createValuationVersion(
  projectId: string,
  payload: CreateValuationVersionPayload
): Promise<Valuation> {
  const res = await fetch(`${p(projectId)}/valuations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { valuation: Valuation }).valuation
}

export async function listValuationLinks(
  projectId: string,
  valuationId: string
): Promise<ValuationLink[]> {
  const res = await fetch(
    `${p(projectId)}/valuations/${encodeURIComponent(valuationId)}/links`,
    { method: "GET", cache: "no-store" }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { links: ValuationLink[] }).links
}

export async function addValuationLink(
  projectId: string,
  valuationId: string,
  payload: { linked_kind: ValuationLinkKind; linked_id: string; note?: string | null }
): Promise<ValuationLink> {
  const res = await fetch(
    `${p(projectId)}/valuations/${encodeURIComponent(valuationId)}/links`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  )
  if (!res.ok) throw new Error(await safeError(res))
  return ((await res.json()) as { link: ValuationLink }).link
}

export async function removeValuationLink(
  projectId: string,
  valuationId: string,
  linkId: string
): Promise<void> {
  const res = await fetch(
    `${p(projectId)}/valuations/${encodeURIComponent(valuationId)}/links?linkId=${encodeURIComponent(linkId)}`,
    { method: "DELETE" }
  )
  if (!res.ok) throw new Error(await safeError(res))
}
