/**
 * PROJ-14 — tenant_secrets server-side helpers.
 *
 * The encryption key lives in the SECRETS_ENCRYPTION_KEY env var. Encrypt and
 * decrypt calls use atomic RPC wrappers that bind the GUC and run pgcrypto in
 * one Postgres transaction; separate Supabase REST RPC calls cannot share a
 * local GUC.
 *
 * NEVER expose decrypted credentials to the browser — every public method
 * here is server-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import type { ConnectorKey, CredentialSource } from "./types"

export class EncryptionUnavailableError extends Error {
  constructor() {
    super(
      "encryption_unavailable: SECRETS_ENCRYPTION_KEY is not set on the server."
    )
    this.name = "EncryptionUnavailableError"
  }
}

export function isEncryptionAvailable(): boolean {
  return Boolean(process.env.SECRETS_ENCRYPTION_KEY)
}

function getEncryptionKey(): string {
  const key = process.env.SECRETS_ENCRYPTION_KEY
  if (!key) throw new EncryptionUnavailableError()
  return key
}

interface SecretRow {
  id: string
  tenant_id: string
  connector_key: string
  created_by: string
  created_at: string
  updated_at: string
}

/**
 * List the (tenant_id, connector_key) → metadata mapping for a tenant.
 * Used by the connector registry to decide credential_source per descriptor.
 * Does NOT decrypt — only metadata leaves the function.
 */
export async function listTenantSecretMeta(
  supabase: SupabaseClient,
  tenantId: string
): Promise<SecretRow[]> {
  const { data, error } = await supabase
    .from("tenant_secrets")
    .select("id, tenant_id, connector_key, created_by, created_at, updated_at")
    .eq("tenant_id", tenantId)
  if (error) throw new Error(`list tenant_secrets failed: ${error.message}`)
  return (data ?? []) as SecretRow[]
}

/**
 * Decrypt the credential payload for a (tenant_id, connector_key). Returns
 * null when no row exists. RLS + the SECURITY DEFINER admin-gate inside
 * `decrypt_tenant_secret` both apply — non-admin callers get an error
 * thrown by the RPC.
 */
export async function readTenantSecret<TPayload = unknown>(
  supabase: SupabaseClient,
  tenantId: string,
  connectorKey: ConnectorKey
): Promise<TPayload | null> {
  if (!isEncryptionAvailable()) return null

  const { data: rows, error: readErr } = await supabase
    .from("tenant_secrets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("connector_key", connectorKey)
    .limit(1)
  if (readErr) {
    throw new Error(`read tenant_secret failed: ${readErr.message}`)
  }
  if (!rows || rows.length === 0) return null

  const { data: payload, error: rpcErr } = await supabase.rpc(
    "decrypt_tenant_secret_with_key",
    {
      p_secret_id: rows[0].id as string,
      p_key: getEncryptionKey(),
    }
  )
  if (rpcErr) {
    throw new Error(`decrypt_tenant_secret_with_key failed: ${rpcErr.message}`)
  }
  return (payload as TPayload) ?? null
}

/**
 * Upsert an encrypted credential payload for a (tenant × connector).
 *
 * The plaintext is sent to the atomic encrypt RPC; it never reaches a column at
 * rest.
 */
export async function writeTenantSecret(
  supabase: SupabaseClient,
  args: {
    tenantId: string
    connectorKey: ConnectorKey
    payload: unknown
    actorUserId: string
  }
): Promise<void> {
  if (!isEncryptionAvailable()) throw new EncryptionUnavailableError()

  const { data: encrypted, error: encErr } = await supabase.rpc(
    "encrypt_tenant_secret_with_key",
    {
      p_payload: args.payload as never,
      p_key: getEncryptionKey(),
    }
  )
  if (encErr) {
    throw new Error(`encrypt_tenant_secret_with_key failed: ${encErr.message}`)
  }

  const { error: upErr } = await supabase.from("tenant_secrets").upsert(
    {
      tenant_id: args.tenantId,
      connector_key: args.connectorKey,
      payload_encrypted: encrypted as unknown as string,
      created_by: args.actorUserId,
    },
    { onConflict: "tenant_id,connector_key" }
  )
  if (upErr) {
    throw new Error(`upsert tenant_secret failed: ${upErr.message}`)
  }
}

export async function deleteTenantSecret(
  supabase: SupabaseClient,
  tenantId: string,
  connectorKey: ConnectorKey
): Promise<void> {
  const { error } = await supabase
    .from("tenant_secrets")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("connector_key", connectorKey)
  if (error) throw new Error(`delete tenant_secret failed: ${error.message}`)
}

/**
 * Resolve where the credentials come from for a given connector, used by
 * the registry to tag each runtime status. Tenant secrets always win over
 * env vars (per the spec edge case).
 */
export function resolveCredentialSource(
  hasTenantSecret: boolean,
  hasEnvConfig: boolean
): CredentialSource {
  if (hasTenantSecret) return "tenant_secret"
  if (hasEnvConfig) return "env"
  return "none"
}
