/**
 * PROJ-14 — tenant_secrets server-side helpers.
 *
 * The encryption key lives in the SECRETS_ENCRYPTION_KEY env var. Before
 * any encrypt/decrypt RPC, we set the GUC `app.settings.encryption_key`
 * with `set local` so the migration's pgcrypto helpers can pick it up.
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

/**
 * Bind the encryption key to the current Postgres session so the
 * pgcrypto helpers can read it via `current_setting('app.settings.encryption_key')`.
 *
 * MUST be called in the same transaction as the encrypt/decrypt RPC and
 * must use `set_config(..., is_local=true)` so it disappears at COMMIT.
 */
async function bindEncryptionKey(supabase: SupabaseClient): Promise<void> {
  const key = process.env.SECRETS_ENCRYPTION_KEY
  if (!key) throw new EncryptionUnavailableError()
  // supabase-js routes RPC to public.* — we wrap pg_catalog.set_config in
  // public.set_session_encryption_key for that reason.
  const { error } = await supabase.rpc("set_session_encryption_key", {
    p_key: key,
  })
  if (error) {
    throw new Error(
      `set_session_encryption_key failed: ${error.message}`
    )
  }
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

  await bindEncryptionKey(supabase)
  const { data: payload, error: rpcErr } = await supabase.rpc(
    "decrypt_tenant_secret",
    { p_secret_id: rows[0].id as string }
  )
  if (rpcErr) {
    throw new Error(`decrypt_tenant_secret failed: ${rpcErr.message}`)
  }
  return (payload as TPayload) ?? null
}

/**
 * Upsert an encrypted credential payload for a (tenant × connector).
 *
 * The plaintext is sent to the encrypt RPC inside the same transaction
 * that holds the GUC; it never reaches a column at rest.
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

  await bindEncryptionKey(supabase)

  const { data: encrypted, error: encErr } = await supabase.rpc(
    "encrypt_tenant_secret",
    { p_payload: args.payload as never }
  )
  if (encErr) {
    throw new Error(`encrypt_tenant_secret failed: ${encErr.message}`)
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
