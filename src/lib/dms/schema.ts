/**
 * PROJ-79-α — DMS request validation schemas (Zod).
 *
 * Shared by the tree-node + document routes. Kept in `lib/dms` (rather than
 * co-located `_schema.ts`) because the routes span two directories
 * (`documents/tree`, `tree/nodes`, `documents`).
 */

import { z } from "zod"

/** POST /tree/nodes — create a folder. */
export const createFolderSchema = z.object({
  parent_id: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(200),
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

/** Multipart scalar fields for POST /documents. */
export const uploadFieldsSchema = z.object({
  parent_id: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(200).optional(),
})
export type UploadFieldsInput = z.infer<typeof uploadFieldsSchema>
