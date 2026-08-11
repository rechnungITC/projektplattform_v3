/**
 * PROJ-130-β — Lifecycle-Sentinels im Audit-Trail.
 *
 * Vor β protokollierte der Trail ausschließlich Feldänderungen: jeder Eintrag
 * hatte einen echten Spaltennamen in `field_name`. β ergänzt Anlage und
 * Löschung als EINE Zeile pro Objekt und markiert sie über einen Sentinel
 * statt über einen Spaltennamen.
 *
 * Diese Einträge sind bewusst keine Feldänderungen:
 *  - sie haben kein Vorher/Nachher-Paar, sondern nur eine kompakte Kennung
 *  - sie sind nicht feldweise rückgängig zu machen (`audit_undo_field` würde
 *    einen Spaltennamen `__created` suchen und `entity_not_found` melden)
 *
 * `audit_restore_entity` ist davon unberührt: es iteriert über
 * `_tracked_audit_columns` und kennt die Sentinels darum gar nicht.
 */

export const AUDIT_LIFECYCLE_FIELDS = {
  __created: "Angelegt",
  __deleted: "Gelöscht",
} as const

export type AuditLifecycleField = keyof typeof AUDIT_LIFECYCLE_FIELDS

export function isAuditLifecycleField(
  fieldName: string
): fieldName is AuditLifecycleField {
  return fieldName in AUDIT_LIFECYCLE_FIELDS
}

/** Anzeigename für einen Audit-Eintrag: Sentinel übersetzt, Spaltenname unverändert. */
export function auditFieldLabel(fieldName: string): string {
  return isAuditLifecycleField(fieldName)
    ? AUDIT_LIFECYCLE_FIELDS[fieldName]
    : fieldName
}

/** Feldweises Undo ist nur für echte Feldänderungen sinnvoll. */
export function isFieldUndoable(fieldName: string): boolean {
  return !isAuditLifecycleField(fieldName)
}
