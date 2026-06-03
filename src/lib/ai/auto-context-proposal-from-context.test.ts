/**
 * PROJ-70-α — auto-context collector security tests.
 *
 * Red-team focus: a context_source row belonging to project A must NEVER
 * leak into a proposal-from-context run for project B, even if RLS
 * mis-grants the caller's read access. The collector has an explicit
 * defense-in-depth scope check.
 */

import { describe, expect, it, vi } from "vitest"

import { collectProposalFromContextAutoContext } from "./auto-context"
import type { SupabaseClient } from "@supabase/supabase-js"

interface MockRow {
  data: unknown
  error: { message: string } | null
}

function mockSupabase(opts: {
  project: MockRow
  contextSource: MockRow
}): SupabaseClient {
  // Minimal SupabaseClient stub — only the methods the collector touches.
  const builderFor = (table: string) => {
    const row = table === "projects" ? opts.project : opts.contextSource
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => row),
    }
    return builder
  }
  return {
    from: vi.fn((table: string) => builderFor(table)),
  } as unknown as SupabaseClient
}

const TARGET_PROJECT = "00000000-0000-0000-0000-000000000001"
const FOREIGN_PROJECT = "00000000-0000-0000-0000-000000000999"
const CONTEXT_SOURCE = "00000000-0000-0000-0000-00000000000a"

describe("collectProposalFromContextAutoContext — scope check", () => {
  it("returns context when source belongs to the target project", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "ERP Rollout",
          project_type: "erp_implementation",
          project_method: "scrum",
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "Kickoff",
          privacy_class: 2,
          content_excerpt: "Wir migrieren das ERP.",
          language: "de",
          project_id: TARGET_PROJECT,
        },
        error: null,
      },
    })
    const result = await collectProposalFromContextAutoContext(
      supabase,
      TARGET_PROJECT,
      CONTEXT_SOURCE,
    )
    expect(result.source_project.project_id).toBe(TARGET_PROJECT)
    expect(result.context_source.context_source_id).toBe(CONTEXT_SOURCE)
    expect(result.method_hint).toBe("scrum")
  })

  it("returns context when source is tenant-wide (project_id IS NULL)", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: "waterfall",
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "email",
          title: "Tenant memo",
          privacy_class: 1,
          content_excerpt: "Generelle Notiz.",
          language: "de",
          project_id: null,
        },
        error: null,
      },
    })
    const result = await collectProposalFromContextAutoContext(
      supabase,
      TARGET_PROJECT,
      CONTEXT_SOURCE,
    )
    expect(result.method_hint).toBe("waterfall")
  })

  it("REJECTS when context_source belongs to a DIFFERENT project (red-team scope leak)", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: null,
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "Stolen kickoff",
          privacy_class: 2,
          content_excerpt: "Internal of project B.",
          language: "de",
          project_id: FOREIGN_PROJECT, // ← leak attempt
        },
        error: null,
      },
    })
    await expect(
      collectProposalFromContextAutoContext(
        supabase,
        TARGET_PROJECT,
        CONTEXT_SOURCE,
      ),
    ).rejects.toThrow("Context source belongs to a different project.")
  })

  it("REJECTS when project lookup fails", async () => {
    const supabase = mockSupabase({
      project: { data: null, error: null },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "T",
          privacy_class: 2,
          content_excerpt: "x",
          language: "de",
          project_id: TARGET_PROJECT,
        },
        error: null,
      },
    })
    await expect(
      collectProposalFromContextAutoContext(
        supabase,
        TARGET_PROJECT,
        CONTEXT_SOURCE,
      ),
    ).rejects.toThrow("Project not found.")
  })

  it("REJECTS when context_source lookup fails", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: null,
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: { data: null, error: null },
    })
    await expect(
      collectProposalFromContextAutoContext(
        supabase,
        TARGET_PROJECT,
        CONTEXT_SOURCE,
      ),
    ).rejects.toThrow("Context source not found.")
  })

  it("normalises German 'Wasserfall' to waterfall hint", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: "Wasserfall",
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "T",
          privacy_class: 1,
          content_excerpt: "x",
          language: "de",
          project_id: TARGET_PROJECT,
        },
        error: null,
      },
    })
    const result = await collectProposalFromContextAutoContext(
      supabase,
      TARGET_PROJECT,
      CONTEXT_SOURCE,
    )
    expect(result.method_hint).toBe("waterfall")
  })

  it("falls back to 'unspecified' for unknown methods", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: "v-modell-XT",
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "T",
          privacy_class: 1,
          content_excerpt: "x",
          language: "de",
          project_id: TARGET_PROJECT,
        },
        error: null,
      },
    })
    const result = await collectProposalFromContextAutoContext(
      supabase,
      TARGET_PROJECT,
      CONTEXT_SOURCE,
    )
    expect(result.method_hint).toBe("unspecified")
  })

  it("defaults privacy_class to 3 (safest) when DB row has NULL", async () => {
    const supabase = mockSupabase({
      project: {
        data: {
          id: TARGET_PROJECT,
          name: "P",
          project_type: null,
          project_method: "scrum",
          lifecycle_status: "active",
        },
        error: null,
      },
      contextSource: {
        data: {
          id: CONTEXT_SOURCE,
          kind: "document",
          title: "T",
          privacy_class: null,
          content_excerpt: "x",
          language: "de",
          project_id: TARGET_PROJECT,
        },
        error: null,
      },
    })
    const result = await collectProposalFromContextAutoContext(
      supabase,
      TARGET_PROJECT,
      CONTEXT_SOURCE,
    )
    expect(result.context_source.privacy_class).toBe(3)
  })
})
