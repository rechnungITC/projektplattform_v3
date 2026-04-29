/**
 * PROJ-13 — Slack channel placeholder.
 *
 * Returns a clear "no-adapter-yet" failure per the V2 ADR. Real webhook
 * wiring lands in its own slice — most likely alongside PROJ-14's
 * connector framework where Tenant-Admins configure webhook URLs.
 */

import type {
  ChannelAdapter,
  DispatchInput,
  DispatchOutcome,
} from "./types"

export const SlackChannel: ChannelAdapter = {
  channel: "slack",
  async dispatch(_input: DispatchInput): Promise<DispatchOutcome> {
    return {
      ok: false,
      error_detail:
        "no-adapter-yet: Slack-Versand ist noch nicht aktiv. Konnektor-Konfiguration folgt mit PROJ-14.",
      not_implemented: true,
    }
  },
}
