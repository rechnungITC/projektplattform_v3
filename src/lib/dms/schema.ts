/**
 * PROJ-79-α — DMS request validation schemas (Zod).
 *
 * Shared by the tree-node + document routes. Kept in `lib/dms` (rather than
 * co-located `_schema.ts`) because the routes span two directories
 * (`documents/tree`, `tree/nodes`, `documents`).
 */

import { z } from "zod"

import { MA_CONFIDENTIALITY_LEVELS } from "@/types/confidentiality"

/**
 * PROJ-Y-115c — need-to-know level accepted on create/reclassify. The DB is
 * the authority: the floor trigger coerces upward to the parent's level and
 * rejects an explicit downgrade below it, and the RESTRICTIVE policies reject
 * a level the caller has no clearance for.
 */
const confidentialityLevelSchema = z.enum(
  MA_CONFIDENTIALITY_LEVELS as unknown as [string, ...string[]],
)

/** POST /tree/nodes — create a folder. */
export const createFolderSchema = z.object({
  parent_id: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(200),
  confidentiality_level: confidentialityLevelSchema.optional(),
})
export type CreateFolderInput = z.infer<typeof createFolderSchema>

/**
 * PATCH /tree/nodes/[nodeId] — rename OR move. Exactly one operation per
 * call. `name` present → rename; `parent_id` present (incl. null) → move.
 * The route enforces the "exactly one" rule since Zod can't express XOR
 * where one side is a nullable field cleanly.
 */
export const renameNodeSchema = z.object({
  name: z.string().trim().min(1).max(200),
})
export type RenameNodeInput = z.infer<typeof renameNodeSchema>

export const moveNodeSchema = z.object({
  parent_id: z.string().uuid().nullable(),
})
export type MoveNodeInput = z.infer<typeof moveNodeSchema>

/** PATCH /tree/nodes/[nodeId] — reclassify (third mutually exclusive op). */
export const setNodeConfidentialitySchema = z.object({
  confidentiality_level: confidentialityLevelSchema,
})
export type SetNodeConfidentialityInput = z.infer<
  typeof setNodeConfidentialitySchema
>

/** Multipart scalar fields for POST /documents. */
export const uploadFieldsSchema = z.object({
  parent_id: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200).optional(),
})
export type UploadFieldsInput = z.infer<typeof uploadFieldsSchema>
