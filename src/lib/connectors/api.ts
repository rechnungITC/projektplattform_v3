/**
 * PROJ-14 — fetch wrappers for the /konnektoren UI.
 */

import type {
  ConnectorHealth,
  ConnectorKey,
  CredentialSource,
} from "./types"

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function safeError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody
    return body.error?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export interface ConnectorListEntry {
  descriptor: {
    key: ConnectorKey
    label: string
    summary: string
    capability_tags: readonly string[]
    credential_editable: boolean
  }
  status: {
    health: ConnectorHealth
    credential_source: CredentialSource
    credential_editable: boolean
  }
}

export async function listConnectors(): Promise<ConnectorListEntry[]> {
  const response = await fetch("/api/connectors", {
    method: "GET",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(await safeError(response))
  const body = (await response.json()) as { connectors: ConnectorListEntry[] }
  return body.connectors ?? []
}

export async function getConnector(
  key: ConnectorKey
): Promise<ConnectorListEntry | null> {
  const response = await fetch(`/api/connectors/${encodeURIComponent(key)}`, {
    method: "GET",
    cache: "no-store",
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as ConnectorListEntry
}

export async function saveConnectorCredentials(
  key: ConnectorKey,
  payload: unknown
): Promise<void> {
  const response = await fetch(`/api/connectors/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await safeError(response))
}

export async function deleteConnectorCredentials(
  key: ConnectorKey
): Promise<void> {
  const response = await fetch(`/api/connectors/${encodeURIComponent(key)}`, {
    method: "DELETE",
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(await safeError(response))
  }
}

export async function testConnector(
  key: ConnectorKey
): Promise<{ health: ConnectorHealth; credential_source: CredentialSource }> {
  const response = await fetch(
    `/api/connectors/${encodeURIComponent(key)}/test`,
    { method: "POST" }
  )
  if (!response.ok) throw new Error(await safeError(response))
  return (await response.json()) as {
    health: ConnectorHealth
    credential_source: CredentialSource
  }
}
