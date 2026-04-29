/**
 * PROJ-13 — Microsoft Teams channel placeholder.
 *
 * Returns a clear "no-adapter-yet" failure per the V2 ADR. Real webhook
 * or Microsoft Graph wiring lands in its own slice.
 */

import type {
  ChannelAdapter,
  DispatchInput,
  DispatchOutcome,
} from "./types"

export const TeamsChannel: ChannelAdapter = {
  channel: "teams",
  async dispatch(_input: DispatchInput): Promise<DispatchOutcome> {
    return {
      ok: false,
      error_detail:
        "no-adapter-yet: Teams-Versand ist noch nicht aktiv. Konnektor-Konfiguration folgt mit PROJ-14.",
      not_implemented: true,
    }
  },
}
