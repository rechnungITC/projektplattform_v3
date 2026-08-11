/**
 * PROJ-130-β — Sentinel-Erkennung im Audit-Trail.
 *
 * Der Zweck dieser Suite ist nicht die Übersetzungstabelle, sondern die
 * Abgrenzung: ein Lifecycle-Eintrag darf NICHT als feldweise rückgängig
 * machbar gelten. Täte er es, würde die Oberfläche einen Undo-Button auf einem
 * Anlage-Eintrag anbieten, und `audit_undo_field` würde eine Spalte namens
 * `__created` suchen und mit `entity_not_found` scheitern.
 */

import { describe, expect, it } from "vitest"

import {
  AUDIT_LIFECYCLE_FIELDS,
  auditFieldLabel,
  isAuditLifecycleField,
  isFieldUndoable,
} from "./lifecycle"

describe("audit lifecycle sentinels", () => {
  it("erkennt die beiden Sentinels", () => {
    expect(isAuditLifecycleField("__created")).toBe(true)
    expect(isAuditLifecycleField("__deleted")).toBe(true)
  })

  it("hält echte Spaltennamen davon getrennt", () => {
    for (const field of [
      "name",
      "status",
      "is_deleted", // Soft-Delete IST eine echte Feldänderung (β2)
      "confidentiality_level",
      "mandate_status",
    ]) {
      expect(isAuditLifecycleField(field)).toBe(false)
      expect(isFieldUndoable(field)).toBe(true)
      expect(auditFieldLabel(field)).toBe(field)
    }
  })

  it("übersetzt Sentinels und lässt Spaltennamen unverändert", () => {
    expect(auditFieldLabel("__created")).toBe("Angelegt")
    expect(auditFieldLabel("__deleted")).toBe("Gelöscht")
    expect(auditFieldLabel("planned_end")).toBe("planned_end")
  })

  it("schließt feldweises Undo für Sentinels aus", () => {
    expect(isFieldUndoable("__created")).toBe(false)
    expect(isFieldUndoable("__deleted")).toBe(false)
  })

  it("hält Sentinel-Menge und Label-Tabelle deckungsgleich", () => {
    for (const key of Object.keys(AUDIT_LIFECYCLE_FIELDS)) {
      expect(isAuditLifecycleField(key)).toBe(true)
      expect(isFieldUndoable(key)).toBe(false)
    }
  })
})
