/**
 * PROJ-65 ε.3c.δ (D8) — broadcast-channel unit tests.
 *
 * Verifies:
 *  - emitPlanMutateEvent posts the correct message shape on the
 *    named channel (committed + undone variants).
 *  - The channel is closed immediately after postMessage so it does
 *    not leak handles between emits.
 *  - No-ops gracefully when BroadcastChannel is undefined (older
 *    browsers / SSR), without throwing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PLAN_MUTATE_CHANNEL_NAME,
  emitPlanMutateEvent,
} from "./broadcast-channel"

describe("PLAN_MUTATE_CHANNEL_NAME", () => {
  it("is the canonical channel-name constant", () => {
    expect(PLAN_MUTATE_CHANNEL_NAME).toBe("plan-mutate-events")
  })
})

describe("emitPlanMutateEvent", () => {
  // We stub the global BroadcastChannel constructor with a spy class so
  // we can assert on (a) channel name + (b) postMessage payload + (c)
  // close() being called.
  let postMessageSpy: ReturnType<typeof vi.fn<(msg: unknown) => void>>
  let closeSpy: ReturnType<typeof vi.fn<() => void>>
  let lastChannelName: string | null = null
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel | undefined

  beforeEach(() => {
    postMessageSpy = vi.fn()
    closeSpy = vi.fn()
    lastChannelName = null
    originalBroadcastChannel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
      .BroadcastChannel

    class StubChannel {
      name: string
      constructor(name: string) {
        this.name = name
        lastChannelName = name
      }
      postMessage(msg: unknown) {
        postMessageSpy(msg)
      }
      close() {
        closeSpy()
      }
    }
    ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      StubChannel as unknown as typeof BroadcastChannel
  })

  afterEach(() => {
    if (originalBroadcastChannel === undefined) {
      delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
    } else {
      ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
        originalBroadcastChannel
    }
  })

  it("posts a 'plan-mutate-committed' event with detail payload on the named channel", () => {
    emitPlanMutateEvent({
      type: "plan-mutate-committed",
      detail: {
        projectId: "proj-1",
        causation_id: "cid-abc",
        affectedCount: 7,
      },
    })

    expect(lastChannelName).toBe("plan-mutate-events")
    expect(postMessageSpy).toHaveBeenCalledTimes(1)
    expect(postMessageSpy).toHaveBeenCalledWith({
      type: "plan-mutate-committed",
      detail: {
        projectId: "proj-1",
        causation_id: "cid-abc",
        affectedCount: 7,
      },
    })
    // Channel handle is closed immediately after the emit (no leak).
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it("posts a 'plan-mutate-undone' event with detail payload", () => {
    emitPlanMutateEvent({
      type: "plan-mutate-undone",
      detail: {
        projectId: "proj-2",
        causation_id: "cid-xyz",
        affectedCount: 3,
      },
    })

    expect(postMessageSpy).toHaveBeenCalledWith({
      type: "plan-mutate-undone",
      detail: {
        projectId: "proj-2",
        causation_id: "cid-xyz",
        affectedCount: 3,
      },
    })
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })

  it("closes the channel even if postMessage throws", () => {
    postMessageSpy.mockImplementationOnce(() => {
      throw new Error("network blip")
    })
    expect(() =>
      emitPlanMutateEvent({
        type: "plan-mutate-committed",
        detail: {
          projectId: "proj-3",
          causation_id: "cid-throw",
          affectedCount: 1,
        },
      }),
    ).toThrow("network blip")
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})

describe("emitPlanMutateEvent without BroadcastChannel", () => {
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel | undefined

  beforeEach(() => {
    originalBroadcastChannel = (globalThis as { BroadcastChannel?: typeof BroadcastChannel })
      .BroadcastChannel
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel
  })

  afterEach(() => {
    if (originalBroadcastChannel !== undefined) {
      ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
        originalBroadcastChannel
    }
  })

  it("is a no-op when BroadcastChannel is undefined (no throw)", () => {
    expect(() =>
      emitPlanMutateEvent({
        type: "plan-mutate-committed",
        detail: {
          projectId: "proj-4",
          causation_id: "cid-noop",
          affectedCount: 0,
        },
      }),
    ).not.toThrow()
  })
})
