import { describe, expect, it, vi } from "vitest"

import {
  isDialogExpired,
  nextDialogExpiry,
  nextProjectSlot,
  parseAssistantDialogState,
  parseProjectMethodAnswer,
  parseProjectTypeAnswer,
  type ProjectDialogState,
} from "./dialog-state"

function projectState(): ProjectDialogState {
  return {
    schema_version: 1,
    revision: 0,
    pending_intent: "project_create_draft",
    phase: "collecting",
    expires_at: "2026-08-21T12:30:00.000Z",
    started_project_id: null,
    requested_slot: "name",
    candidate_project_ids: [],
    slots: {
      name: null,
      project_type: null,
      project_method: null,
      description: null,
      skipped: [],
    },
  }
}

describe("assistant dialog state", () => {
  it("accepts only the versioned allow-listed shape", () => {
    expect(parseAssistantDialogState(projectState())).not.toBeNull()
    expect(parseAssistantDialogState({ ...projectState(), schema_version: 2 })).toBeNull()
    expect(parseAssistantDialogState({ ...projectState(), pending_intent: "delete_project" })).toBeNull()
  })

  it("orders mandatory and optional project fields", () => {
    const state = projectState()
    expect(nextProjectSlot(state)).toBe("name")
    state.slots.name = "Apollo"
    expect(nextProjectSlot(state)).toBe("project_type")
    state.slots.skipped.push("project_type", "project_method", "description")
    expect(nextProjectSlot(state)).toBeNull()
  })

  it("reuses the established type and method vocabulary", () => {
    expect(parseProjectTypeAnswer("ein Software-Projekt")).toBe("software")
    expect(parseProjectMethodAnswer("nach Wasserfall")).toBe("waterfall")
    expect(parseProjectMethodAnswer("VXT 2.0")).toBe("vxt2")
  })

  it("expires after thirty minutes", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-21T12:00:00.000Z"))
    expect(nextDialogExpiry()).toBe("2026-08-21T12:30:00.000Z")
    expect(isDialogExpired(projectState(), new Date("2026-08-21T12:30:00.000Z"))).toBe(true)
    vi.useRealTimers()
  })
})
