import { describe, expect, it } from "vitest"

import {
  DEPENDENCY_CONSTRAINT_HINTS,
  DEPENDENCY_CONSTRAINT_LABELS,
  DEPENDENCY_CONSTRAINT_TYPES,
  constraintBadge,
  isNonDefaultConstraint,
} from "./dependency"

describe("Kantentypen — eine Autorität", () => {
  it("führt genau die vier Typen, die auch die Datenbank kennt", () => {
    // Eingefroren gegen `dependencies_constraint_type_check`. Ein fünfter Typ
    // muss hier auffallen und nicht erst an einem 23514 in Produktion.
    expect([...DEPENDENCY_CONSTRAINT_TYPES]).toEqual(["FS", "SS", "FF", "SF"])
  })

  it("hat für jeden Typ eine deutsche Beschriftung und einen Hinweis", () => {
    for (const t of DEPENDENCY_CONSTRAINT_TYPES) {
      expect(DEPENDENCY_CONSTRAINT_LABELS[t]).toBeTruthy()
      expect(DEPENDENCY_CONSTRAINT_HINTS[t]).toBeTruthy()
      // Das Kürzel bleibt sichtbar — wer die Fachsprache kennt, sucht danach.
      expect(DEPENDENCY_CONSTRAINT_LABELS[t]).toContain(t)
    }
  })

  it("hat keine verwaisten Beschriftungen", () => {
    expect(Object.keys(DEPENDENCY_CONSTRAINT_LABELS).sort()).toEqual(
      [...DEPENDENCY_CONSTRAINT_TYPES].sort(),
    )
  })
})

describe("Abweichung vom Normalfall", () => {
  it("erkennt FS ohne Abstand als Normalfall", () => {
    expect(isNonDefaultConstraint("FS", 0)).toBe(false)
    expect(isNonDefaultConstraint("FS", null)).toBe(false)
    expect(isNonDefaultConstraint("FS", undefined)).toBe(false)
  })

  it("erkennt jeden anderen Typ als Abweichung", () => {
    for (const t of ["SS", "FF", "SF"]) {
      expect(isNonDefaultConstraint(t, 0)).toBe(true)
    }
  })

  it("erkennt FS MIT Abstand als Abweichung", () => {
    expect(isNonDefaultConstraint("FS", 3)).toBe(true)
    expect(isNonDefaultConstraint("FS", -1)).toBe(true)
  })
})

describe("Abzeichen am Pfeil", () => {
  it("zeigt nichts beim Normalfall — sonst wäre jedes Diagramm zugepflastert", () => {
    expect(constraintBadge("FS", 0)).toBeNull()
    expect(constraintBadge("FS", null)).toBeNull()
  })

  it("zeigt den Typ, wenn nur er abweicht", () => {
    expect(constraintBadge("SS", 0)).toBe("SS")
    expect(constraintBadge("FF", null)).toBe("FF")
  })

  it("zeigt Typ und Abstand mit Vorzeichen", () => {
    expect(constraintBadge("FS", 3)).toBe("FS+3")
    expect(constraintBadge("SS", 10)).toBe("SS+10")
  })

  it("zeigt einen negativen Abstand ohne doppeltes Vorzeichen", () => {
    // Überlappung: der Nachfolger startet vor dem Ende des Vorgängers.
    expect(constraintBadge("FS", -2)).toBe("FS-2")
    expect(constraintBadge("FF", -1)).toBe("FF-1")
  })
})
