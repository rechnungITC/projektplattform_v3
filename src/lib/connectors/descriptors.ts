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
  JiraCredentialsSchema,
  testJiraConnection,
  type JiraCredentials,
} from "@/lib/jira/client"

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

// ─── jira (PROJ-47 outbound export adapter) ────────────────────────────

const jiraDescriptor: ConnectorDescriptor<JiraCredentials> = {
  key: "jira",
  label: "Jira",
  summary:
    "Outbound-Export von V3 Work Items nach Jira. Bidirektionaler Sync bleibt PROJ-50.",
  capability_tags: ["sync"],
  credential_schema: JiraCredentialsSchema,
  credential_editable: true,
  async health({ tenant_credentials }: HealthInput): Promise<ConnectorHealth> {
    if (tenant_credentials) {
      const parsed = JiraCredentialsSchema.safeParse(tenant_credentials)
      // The list endpoint intentionally passes `{}` as presence marker and
      // must not perform a network probe for every registry render.
      if (!parsed.success) {
        const marker =
          typeof tenant_credentials === "object" &&
          tenant_credentials !== null &&
          Object.keys(tenant_credentials).length === 0
        if (marker) {
          return {
            status: "adapter_ready_configured",
            detail:
              "Tenant-Credentials konfiguriert. Test-Connection prueft Jira live.",
          }
        }
        return {
          status: "error",
          detail: "jira_credentials_invalid",
        }
      }
      return testJiraConnection(parsed.data)
    }
    return {
      status: "adapter_ready_unconfigured",
      detail: "Jira-Adapter bereit. Bitte Tenant-Credentials konfigurieren.",
    }
  },
}

// ─── mcp (PROJ-48: read-only MCP bridge live at /api/mcp) ────────────────

const McpCredentialSchema = z.object({
  service_token: z.string().min(20),
})

const mcpDescriptor: ConnectorDescriptor = {
  key: "mcp",
  label: "MCP-Bridge",
  summary:
    "Model-Context-Protocol-Endpoint (/api/mcp), der approved KI-Agents 4 read-only, tenant-scoped Tools (project.lookup/status, work_item.lookup, report.snapshot) mit Class-3-Redaction anbietet. Zugriff via admin-issued Bearer-Token.",
  capability_tags: ["ai"],
  credential_schema: McpCredentialSchema,
  // Access is via per-token issuance (separate admin panel), not a
  // tenant_secrets credential form — so the connector card stays read-only.
  credential_editable: false,
  async health(): Promise<ConnectorHealth> {
    return {
      status: "adapter_ready_unconfigured",
      detail:
        "MCP-Runtime live. Bitte ein Access-Token unter Konnektoren → MCP-Token ausstellen.",
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
