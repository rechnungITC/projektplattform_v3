import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  getOperationMode,
  getOperationModeSnapshot,
  isExternalAIBlocked,
  isStandalone,
} from "./operation-mode"

describe("operation-mode", () => {
  let originalMode: string | undefined
  let originalAi: string | undefined

  beforeEach(() => {
    originalMode = process.env.OPERATION_MODE
    originalAi = process.env.EXTERNAL_AI_DISABLED
    delete process.env.OPERATION_MODE
    delete process.env.EXTERNAL_AI_DISABLED
  })
  afterEach(() => {
    if (originalMode === undefined) delete process.env.OPERATION_MODE
    else process.env.OPERATION_MODE = originalMode
    if (originalAi === undefined) delete process.env.EXTERNAL_AI_DISABLED
    else process.env.EXTERNAL_AI_DISABLED = originalAi
  })

  describe("getOperationMode", () => {
    it("defaults to shared when env var is missing", () => {
      expect(getOperationMode()).toBe("shared")
    })

    it("defaults to shared on empty string", () => {
      process.env.OPERATION_MODE = ""
      expect(getOperationMode()).toBe("shared")
    })

    it("returns standalone for the literal value", () => {
      process.env.OPERATION_MODE = "standalone"
      expect(getOperationMode()).toBe("standalone")
    })

    it("returns standalone case-insensitively + trimmed", () => {
      process.env.OPERATION_MODE = "  StandAlone  "
      expect(getOperationMode()).toBe("standalone")
    })

    it("falls back to shared for unknown values (typo-safe)", () => {
      process.env.OPERATION_MODE = "stand_alone"
      expect(getOperationMode()).toBe("shared")
    })
  })

  describe("isStandalone", () => {
    it("mirrors getOperationMode", () => {
      expect(isStandalone()).toBe(false)
      process.env.OPERATION_MODE = "standalone"
      expect(isStandalone()).toBe(true)
    })
  })

  describe("isExternalAIBlocked", () => {
    it("defaults to false", () => {
      expect(isExternalAIBlocked()).toBe(false)
    })

    it("true only on the literal string 'true'", () => {
      process.env.EXTERNAL_AI_DISABLED = "true"
      expect(isExternalAIBlocked()).toBe(true)
    })

    it("treats '1', 'yes', etc. as false (strict opt-in)", () => {
      for (const v of ["1", "yes", "y", "on", "TRUE  "]) {
        process.env.EXTERNAL_AI_DISABLED = v
        // 'TRUE  ' is whitespace-trimmed + lowercased → 'true' → blocked.
        const expected = v.trim().toLowerCase() === "true"
        expect(isExternalAIBlocked()).toBe(expected)
      }
    })

    it("independent of OPERATION_MODE", () => {
      process.env.OPERATION_MODE = "standalone"
      expect(isExternalAIBlocked()).toBe(false)
      process.env.EXTERNAL_AI_DISABLED = "true"
      expect(isExternalAIBlocked()).toBe(true)
    })
  })

  describe("getOperationModeSnapshot", () => {
    it("returns both flags as one object", () => {
      process.env.OPERATION_MODE = "standalone"
      process.env.EXTERNAL_AI_DISABLED = "true"
      expect(getOperationModeSnapshot()).toEqual({
        mode: "standalone",
        externalAiBlocked: true,
      })
    })
  })
})
