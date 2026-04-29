/**
 * PROJ-14 — connector registry.
 *
 * The registry returns a runtime snapshot per connector. It does NOT decrypt
 * credentials in the listing path — only metadata (presence + source).
 * Decryption only happens for the test-connection probe and in real
 * adapters that need plaintext at send-time.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { CONNECTOR_DESCRIPTORS, getDescriptor } from "./descriptors"
import {
  isEncryptionAvailable,
  listTenantSecretMeta,
  readTenantSecret,
  resolveCredentialSource,
} from "./secrets"
import type {
  ConnectorDescriptor,
  ConnectorHealth,
  ConnectorKey,
  ConnectorRuntimeStatus,
} from "./types"

/**
 * Connectors whose env-var(s) are read directly elsewhere in the codebase.
 * Used to compute `env_configured` for the descriptor's health() probe.
 */
function envConfigured(key: ConnectorKey): boolean {
  switch (key) {
    case "email":
      return Boolean(process.env.RESEND_API_KEY)
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY)
    case "slack":
    case "teams":
    case "jira":
    case "mcp":
      return false
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
  status: ConnectorRuntimeStatus
}

/**
 * Build the registry snapshot for a tenant. Pure read path — no decrypt.
 */
export async function listConnectors(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ConnectorListEntry[]> {
  const secrets = await listTenantSecretMeta(supabase, tenantId)
  const secretsByKey = new Map(secrets.map((s) => [s.connector_key, s]))

  const entries: ConnectorListEntry[] = []
  for (const descriptor of CONNECTOR_DESCRIPTORS) {
    const hasTenantSecret = secretsByKey.has(descriptor.key)
    const hasEnv = envConfigured(descriptor.key)
    const credentialSource = resolveCredentialSource(hasTenantSecret, hasEnv)

    let health: ConnectorHealth
    try {
      health = await descriptor.health({
        // List path doesn't decrypt — descriptors only see "is something there?"
        tenant_credentials: hasTenantSecret ? {} : null,
        env_configured: hasEnv,
      })
    } catch (err) {
      health = {
        status: "error",
        detail: err instanceof Error ? err.message : "health probe failed",
      }
    }

    entries.push({
      descriptor: {
        key: descriptor.key,
        label: descriptor.label,
        summary: descriptor.summary,
        capability_tags: descriptor.capability_tags,
        credential_editable: descriptor.credential_editable,
      },
      status: {
        health,
        credential_source: credentialSource,
        credential_editable: descriptor.credential_editable,
      },
    })
  }

  // If the platform is missing the encryption key, downgrade every editable
  // connector's status to error so the UI surfaces the cause clearly.
  if (!isEncryptionAvailable()) {
    for (const e of entries) {
      if (e.descriptor.credential_editable) {
        e.status.health = {
          status: "error",
          detail:
            "encryption_unavailable: SECRETS_ENCRYPTION_KEY ist nicht gesetzt — Tenant-Credentials können nicht verarbeitet werden.",
        }
      }
    }
  }

  return entries
}

/**
 * Detail for a single connector — used by the test-connection probe and the
 * detail drawer. Decrypts the tenant secret when present so the descriptor
 * can validate it during the probe.
 */
export async function describeConnector(
  supabase: SupabaseClient,
  tenantId: string,
  key: ConnectorKey
): Promise<{
  descriptor: ConnectorDescriptor<unknown>
  health: ConnectorHealth
  credential_source: ReturnType<typeof resolveCredentialSource>
  credential_editable: boolean
} | null> {
  const descriptor = getDescriptor(key)
  if (!descriptor) return null

  const hasEnv = envConfigured(key)
  let credentials: unknown = null
  let credentialError: string | null = null
  if (isEncryptionAvailable()) {
    try {
      credentials = await readTenantSecret(supabase, tenantId, key)
    } catch (err) {
      credentialError = err instanceof Error ? err.message : "decrypt failed"
    }
  }

  const credentialSource = resolveCredentialSource(
    Boolean(credentials),
    hasEnv
  )

  let health: ConnectorHealth
  if (credentialError) {
    health = { status: "error", detail: credentialError }
  } else {
    try {
      health = await descriptor.health({
        tenant_credentials: credentials,
        env_configured: hasEnv,
      })
    } catch (err) {
      health = {
        status: "error",
        detail: err instanceof Error ? err.message : "health probe failed",
      }
    }
  }

  return {
    descriptor,
    health,
    credential_source: credentialSource,
    credential_editable: descriptor.credential_editable,
  }
}
