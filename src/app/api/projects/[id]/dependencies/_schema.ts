/**
 * Dependencies POST Zod schemas — colocated module so the route AND
 * the drift-tests can both import them.
 *
 * The dependencies route accepts TWO body shapes (PROJ-9 Round 2):
 *   - `polymorphicSchema`: explicit from_type/from_id/to_type/to_id (new shape)
 *   - `legacySchema`: predecessor_id/successor_id (Round 1 shape, derived
 *      via work_items.kind lookup at request time)
 *
 * Both schemas normalize to the same DB row shape (see NormalizedInsert in
 * route.ts). Drift-tests in route.test.ts verify that every key from each
 * schema reaches the DB call (after server-derived defaults).
 *
 * No trim-able string fields here (everything is UUIDs, enums, numbers).
 */

import { z } from "zod"

export const dependencyEntityTypes = [
  "project",
  "phase",
  "work_package",
  "todo",
] as const
export const dependencyConstraintTypes = ["FS", "SS", "FF", "SF"] as const

export const polymorphicSchema = z.object({
  from_type: z.enum(dependencyEntityTypes),
  from_id: z.string().uuid(),
  to_type: z.enum(dependencyEntityTypes),
  to_id: z.string().uuid(),
  constraint_type: z.enum(dependencyConstraintTypes).default("FS"),
  lag_days: z.number().int().optional(),
})

export const legacySchema = z.object({
  predecessor_id: z.string().uuid(),
  successor_id: z.string().uuid(),
  type: z.enum(dependencyConstraintTypes).default("FS"),
  lag_days: z.number().int().optional(),
})

export type DependencyEntityType = (typeof dependencyEntityTypes)[number]
export type DependencyConstraintType = (typeof dependencyConstraintTypes)[number]
