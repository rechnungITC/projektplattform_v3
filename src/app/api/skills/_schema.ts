import { z } from "zod"

import { SKILL_ALLOWED_ACTIONS } from "@/lib/skills/allowed-actions"
import { PROJECT_TYPES } from "@/types/project"
import { PROJECT_METHODS } from "@/types/project-method"
import { SKILL_CATEGORIES } from "@/types/skill"

// PROJ-76 — Zod validation at the API boundary.
//
// Tag vocabularies bind to the REAL code constants (single source of
// truth) so PROJ-78 auto-assignment can match; an empty array means
// "applies to all". No hand-copied DB CHECK that would drift.

const slugPattern = /^[a-z0-9-]+$/

const methodTags = z
  .array(z.string())
  .max(20)
  .refine(
    (arr) => arr.every((t) => (PROJECT_METHODS as readonly string[]).includes(t)),
    { message: "Unbekannter Methoden-Tag." }
  )

const projectTypeTags = z
  .array(z.string())
  .max(20)
  .refine(
    (arr) => arr.every((t) => (PROJECT_TYPES as readonly string[]).includes(t)),
    { message: "Unbekannter Projekttyp-Tag." }
  )

// Behaviour keys stored (immutably) per version. name/description are NOT
// here — they are mutable skill metadata merged in at serialise time.
export const frontmatterSchema = z
  .object({
    model_overrides: z.record(z.string(), z.string()).nullish(),
    temperature: z.number().min(0).max(2).nullish(),
    allowed_kinds: z.array(z.string().trim().min(1).max(40)).max(20).nullish(),
    tone: z.string().trim().max(200).nullish(),
    // PROJ-77-α — declared action mandate; each value must be in the fixed enum.
    // Stored + validated here; enforcement is fail-closed in PROJ-82/83.
    allowed_actions: z
      .array(
        z.enum(SKILL_ALLOWED_ACTIONS as unknown as [string, ...string[]], {
          message: "Unbekannte Aktion.",
        })
      )
      .max(SKILL_ALLOWED_ACTIONS.length)
      .nullish(),
  })
  .strict()

const categorySchema = z.enum(
  SKILL_CATEGORIES as unknown as [string, ...string[]]
)

export const createSkillSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(slugPattern, "Nur Kleinbuchstaben, Ziffern und Bindestrich."),
  description: z.string().trim().max(2000).optional().default(""),
  category: categorySchema,
  method_tags: methodTags.optional().default([]),
  project_type_tags: projectTypeTags.optional().default([]),
  // initial v1 (draft) content
  markdown_body: z.string().max(50000).optional().default(""),
  frontmatter: frontmatterSchema.optional().default({}),
})

// PATCH: metadata only (never markdown body — that is a new version).
// `slug` is immutable after create (references depend on it).
export const updateSkillMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    category: categorySchema.optional(),
    method_tags: methodTags.optional(),
    project_type_tags: projectTypeTags.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

export const createVersionSchema = z.object({
  markdown_body: z.string().max(50000).optional().default(""),
  frontmatter: frontmatterSchema.optional().default({}),
  change_summary: z.string().trim().max(500).nullish(),
})

// PROJ-77-α — in-place edit of a DRAFT version's content. At least one field.
// Applied only when the version is a draft (enforced in the route + DB trigger).
export const patchVersionSchema = z
  .object({
    markdown_body: z.string().max(50000).optional(),
    frontmatter: frontmatterSchema.optional(),
    change_summary: z.string().trim().max(500).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

export const toggleActiveSchema = z.object({ is_active: z.boolean() })

// PROJ-77-β — skill_examples (admin authoring aids). Empty input/output → 422.
const exampleTags = z.array(z.string().trim().min(1).max(40)).max(20)
export const createExampleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  input: z.string().trim().min(1).max(20000),
  expected_output: z.string().trim().min(1).max(20000),
  tags: exampleTags.optional().default([]),
  display_order: z.number().int().min(0).max(9999).optional().default(0),
})
export const updateExampleSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    input: z.string().trim().min(1).max(20000).optional(),
    expected_output: z.string().trim().min(1).max(20000).optional(),
    tags: exampleTags.optional(),
    display_order: z.number().int().min(0).max(9999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

// PROJ-77-γ — skill_knowledge_links (admin; link a skill to a DMS node).
const linkModeSchema = z.enum(["reference", "required"], {
  message: "link_mode muss 'reference' oder 'required' sein.",
})
export const createKnowledgeLinkSchema = z.object({
  document_node_id: z.string().uuid(),
  include_subtree: z.boolean().optional().default(false),
  link_mode: linkModeSchema.optional().default("reference"),
})
export const updateKnowledgeLinkSchema = z
  .object({
    include_subtree: z.boolean().optional(),
    link_mode: linkModeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld muss angegeben werden.",
  })

export type CreateSkillInput = z.infer<typeof createSkillSchema>
export type UpdateSkillMetadataInput = z.infer<typeof updateSkillMetadataSchema>
export type CreateVersionInput = z.infer<typeof createVersionSchema>
