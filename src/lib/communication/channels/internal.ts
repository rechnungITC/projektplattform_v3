/**
 * PROJ-13 — internal channel.
 *
 * The "send" for internal messages is a no-op at the wire level — the
 * outbox row already represents the message. The dispatcher just flips
 * the row to `sent`. Class-3 content is permitted because the data
 * stays inside the tenant.
 */

import type {
  ChannelAdapter,
  DispatchInput,
  DispatchOutcome,
} from "./types"

export const InternalChannel: ChannelAdapter = {
  channel: "internal",
  async dispatch(_input: DispatchInput): Promise<DispatchOutcome> {
    return { ok: true, stub: false }
  },
}
