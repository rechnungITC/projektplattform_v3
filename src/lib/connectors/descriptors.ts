/**
 * PROJ-14 — descriptors for every known connector.
 *
 * Real adapters dock into this same descriptor list in their own slices
 * by replacing the `health()` function and flipping `credential_editable`
 * to true. For the Plumbing slice only Resend (`email`) is end-to-end
 * configurable; everything else reports `adapter_missing` (Jira, MCP) or
 * `adapter_ready_unconfigured` (Slack/Teams stubs from PROJ-13, Anthropic
 * from PROJ-12).
 */

import { z } from "zod"

import {
  type ConnectorDescriptor,
  type ConnectorHealth,
  type HealthInput,
} from "./types"

// ─── email (Resend) — fully editable, end-to-end demo for the slice ────

const EmailCredentialSchema = z.object({
  api_key: z.string().min(10, "Resend API-Key fehlt"),
  from_email: z.string().email("Absender-Adresse muss eine E-Mail sein"),
})
export type EmailCredentials = z.infer<typeof EmailCredentialSchema>

const emailDescriptor: ConnectorDescriptor<EmailCredentials> = {
  key: "email",
  label: "E-Mail (Resend)",
  summary:
    "Echter E-Mail-Versand über Resend. Ohne API-Key fällt der Adapter auf den Demo-Stub aus PROJ-13 zurück.",
  capability_tags: ["communication"],
  credential_schema: EmailCredentialSchema,
  credential_editable: true,
  async health({ tenant_credentials, env_configured }: HealthInput): Promise<ConnectorHealth> {
    if (tenant_credentials) {
      return {
        status: "adapter_ready_configured",
        detail: "Tenant-Credentials konfiguriert — produktiver Versand aktiv.",
      }
    }
    if (env_configured) {
      return {
        status: "adapter_ready_configured",
        detail: "Plattform-Default RESEND_API_KEY aktiv.",
      }
    }
    return {
      status: "adapter_ready_unconfigured",
      detail:
        "Kein API-Key — der Adapter läuft im Demo-Modus (markiert als gesendet, kein realer Versand).",
    }
  },
}

// ─── anthropic (PROJ-12) ───────────────────────────────────────────────

const AnthropicCredentialSchema = z.object({
  api_key: z.string().min(10),
  model_id: z.string().min(3).optional(),
})
export type AnthropicCredentials = z.infer<typeof AnthropicCredentialSchema>

const anthropicDescriptor: ConnectorDescriptor<AnthropicCredentials> = {
  key: "anthropic",
  label: "Anthropic (KI)",
  summary:
    "Externer KI-Provider für Risiko- und Stakeholder-Vorschläge. Klasse-3-Daten werden grundsätzlich nicht extern verarbeitet.",
  capability_tags: ["ai"],
  credential_schema: AnthropicCredentialSchema,
  credential_editable: false, // PROJ-12 reads ANTHROPIC_API_KEY directly; per-tenant override is a follow-up slice
  async health({ env_configured }: HealthInput): Promise<ConnectorHealth> {
    if (env_configured) {
      return {
        status: "adapter_ready_configured",
        detail: "Plattform-Default ANTHROPIC_API_KEY aktiv.",
      }
    }
    return {
      status: "adapter_ready_unconfigured",
      detail:
        "Kein API-Key — der KI-Router fällt auf den lokalen Stub-Provider zurück.",
    }
  },
}

// ─── slack (PROJ-13 stub, real adapter follows) ─────────────────────────

const SlackCredentialSchema = z.object({
  webhook_url: z.string().url(),
})

const slackDescriptor: ConnectorDescriptor = {
  key: "slack",
  label: "Slack",
  summary:
    "Slack-Webhooks für ausgehende Nachrichten aus dem Outbox. Echter Adapter folgt mit PROJ-14b.",
  capability_tags: ["communication"],
  credential_schema: SlackCredentialSchema,
  credential_editable: false,
  async health(): Promise<ConnectorHealth> {
    return {
      status: "adapter_missing",
      detail:
        "Stub aktiv — Versand schlägt absichtlich mit „no-adapter-yet“ fehl. Echter Adapter folgt.",
    }
  },
}

// ─── teams (PROJ-13 stub, real adapter follows) ────────────────────────

const TeamsCredentialSchema = z.object({
  webhook_url: z.string().url(),
})

const teamsDescriptor: ConnectorDescriptor = {
  key: "teams",
  label: "Microsoft Teams",
  summary:
    "Teams-Webhook oder Microsoft Graph für ausgehende Nachrichten. Echter Adapter folgt mit PROJ-14d.",
  capability_tags: ["communication"],
  credential_schema: TeamsCredentialSchema,
  credential_editable: false,
  async health(): Promise<ConnectorHealth> {
    return {
      status: "adapter_missing",
      detail:
        "Stub aktiv — Versand schlägt absichtlich mit „no-adapter-yet“ fehl. Echter Adapter folgt.",
    }
  },
}

// ─── jira (no adapter yet — full slice in PROJ-14b/e) ───────────────────

const JiraCredentialSchema = z.object({
  base_url: z.string().url(),
  email: z.string().email(),
  api_token: z.string().min(10),
  default_project_key: z.string().min(1),
})

const jiraDescriptor: ConnectorDescriptor = {
  key: "jira",
  label: "Jira",
  summary:
    "Bidirektionaler Sync von Work Items zu Jira. Slice folgt als PROJ-14b (Export) bzw. PROJ-14e (bidirektional).",
  capability_tags: ["sync"],
  credential_schema: JiraCredentialSchema,
  credential_editable: false,
  async health(): Promise<ConnectorHealth> {
    return {
      status: "adapter_missing",
      detail: "Adapter folgt mit PROJ-14b.",
    }
  },
}

// ─── mcp (no adapter yet — full slice in PROJ-14c) ──────────────────────

const McpCredentialSchema = z.object({
  service_token: z.string().min(20),
})

const mcpDescriptor: ConnectorDescriptor = {
  key: "mcp",
  label: "MCP-Bridge",
  summary:
    "Model Context Protocol Endpoint, der KI-Agents projekt-aware Tools anbietet. Slice folgt als PROJ-14c.",
  capability_tags: ["ai"],
  credential_schema: McpCredentialSchema,
  credential_editable: false,
  async health(): Promise<ConnectorHealth> {
    return {
      status: "adapter_missing",
      detail: "Edge-Function folgt mit PROJ-14c.",
    }
  },
}

export const CONNECTOR_DESCRIPTORS: readonly ConnectorDescriptor<unknown>[] = [
  emailDescriptor,
  anthropicDescriptor,
  slackDescriptor,
  teamsDescriptor,
  jiraDescriptor,
  mcpDescriptor,
]

export function getDescriptor(
  key: string
): ConnectorDescriptor<unknown> | null {
  return CONNECTOR_DESCRIPTORS.find((d) => d.key === key) ?? null
}
