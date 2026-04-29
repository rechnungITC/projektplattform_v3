/**
 * PROJ-13 — channel adapter selector.
 *
 * Maps a `Channel` value (as stored in `communication_outbox.channel`) to
 * the concrete adapter that knows how to dispatch through it. Keeps the
 * outbox-service free of switch/case noise.
 */

import type { Channel } from "@/types/communication"

import { EmailChannel } from "./email-resend"
import { InternalChannel } from "./internal"
import { SlackChannel } from "./stub-slack"
import { TeamsChannel } from "./stub-teams"
import type { ChannelAdapter } from "./types"

const ADAPTERS: Record<Channel, ChannelAdapter> = {
  internal: InternalChannel,
  email: EmailChannel,
  slack: SlackChannel,
  teams: TeamsChannel,
}

export function getChannelAdapter(channel: Channel): ChannelAdapter {
  return ADAPTERS[channel]
}
