/**
 * PROJ-14 — connector framework types.
 *
 * The Plumbing slice ships descriptors + health for every known connector
 * key, but only Resend has an end-to-end credential roundtrip. Real Jira /
 * MCP / Teams adapters dock into this same registry in their own slices.
 */

import type { z } from "zod"

export type ConnectorKey =
  | "email"
  | "slack"
  | "teams"
  | "jira"
  | "mcp"
  | "anthropic"

export const CONNECTOR_KEYS: readonly ConnectorKey[] = [
  "email",
  "slack",
  "teams",
  "jira",
  "mcp",
  "anthropic",
] as const

/** Capability tags help the UI group connectors. */
export type CapabilityTag = "communication" | "ai" | "sync"

/**
 * Health-Enum per ST-08:
 *   - adapter_missing: no implementation in this build (true stub).
 *   - adapter_ready_unconfigured: code exists, no credentials configured.
 *   - adapter_ready_configured: code exists + credentials present.
 *   - error: configured but health probe failed.
 *
 * `unconfigured` is the legacy V2 value the UI may need to render
 * historical V2 data; we don't emit it ourselves.
 */
export type ConnectorHealthStatus =
  | "adapter_missing"
  | "adapter_ready_unconfigured"
  | "adapter_ready_configured"
  | "error"
  | "unconfigured"

export interface ConnectorHealth {
  status: ConnectorHealthStatus
  /** Optional short message that surfaces in the UI verbatim. */
  detail?: string
}

/**
 * Source of credentials for a connector. The framework prefers the
 * tenant-stored secret over an environment variable so SaaS tenants can
 * override platform defaults.
 */
export type CredentialSource = "tenant_secret" | "env" | "none"

export interface ConnectorRuntimeStatus {
  health: ConnectorHealth
  credential_source: CredentialSource
  /** True when the descriptor exposes a writeable credential schema in this slice. */
  credential_editable: boolean
}

export interface ConnectorDescriptor<TCredentials = unknown> {
  key: ConnectorKey
  label: string
  summary: string
  capability_tags: readonly CapabilityTag[]
  /**
   * Zod schema for the credential payload. The UI renders a form from
   * this schema; the API route validates the body against it before
   * encrypting.
   */
  credential_schema: z.ZodType<TCredentials>
  /**
   * True when the slice currently supports credential CRUD via the UI.
   * False for adapter_missing connectors — UI shows them read-only.
   */
  credential_editable: boolean
  /** Health probe — pure function, called on demand by the registry. */
  health(input: HealthInput): Promise<ConnectorHealth>
}

export interface HealthInput {
  /**
   * Decrypted tenant credentials, if any. The registry passes this only
   * to admin callers; the descriptor must not log or persist it.
   */
  tenant_credentials: unknown | null
  /**
   * True when an env-var-based fallback exists for this connector.
   * Lets the descriptor distinguish adapter_ready_configured (env or
   * tenant) from adapter_ready_unconfigured.
   */
  env_configured: boolean
}
