"use client"

import { ArrowUpRight, GitBranch } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { createClient } from "@/lib/supabase/client"

interface ParentProjectBannerProps {
  projectId: string
}

interface ParentLinkPayload {
  parent_project_id: string
  parent_project_name: string | null
  from_work_item_id: string | null
  from_work_item_title: string | null
}

/**
 * PROJ-27 Designer § 9 — muted, slim 40px banner rendered inside
 * `project-room-shell` above the room tabs, on Sub-Projects only.
 *
 * Visibility: requires (a) the current project to have
 * `parent_project_id NOT NULL` *and* (b) an inbound `delivered_by`
 * link from a parent-project work-item at the project level.
 *
 * The fetch is best-effort — failures degrade silently to "no banner".
 */
export function ParentProjectBanner({ projectId }: ParentProjectBannerProps) {
  const [info, setInfo] = React.useState<ParentLinkPayload | null>(null)
  const [hidden, setHidden] = React.useState(false)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data: proj, error: projErr } = await supabase
          .from("projects")
          .select("parent_project_id")
          .eq("id", projectId)
          .maybeSingle<{ parent_project_id: string | null }>()
        if (cancelled || projErr || !proj?.parent_project_id) return

        // Look for a whole-project `delivers`-link from the parent
        // project that targets the current project. RLS gates
        // visibility — we only see it when allowed.
        const { data: link } = await supabase
          .from("work_item_links")
          .select(
            "from_work_item_id, from_project_id, to_project_id, link_type, approval_state",
          )
          .eq("to_project_id", projectId)
          .eq("link_type", "delivers")
          .eq("approval_state", "approved")
          .limit(1)
          .maybeSingle<{
            from_work_item_id: string | null
            from_project_id: string | null
            link_type: string
          }>()

        if (cancelled) return
        if (!link) {
          // Sub-project without an explicit delivers-link — still show
          // a minimal "is sub-project of X" banner for context.
          const { data: parent } = await supabase
            .from("projects")
            .select("id, name")
            .eq("id", proj.parent_project_id)
            .maybeSingle<{ id: string; name: string }>()
          if (cancelled || !parent) return
          setInfo({
            parent_project_id: parent.id,
            parent_project_name: parent.name,
            from_work_item_id: null,
            from_work_item_title: null,
          })
          return
        }

        const [{ data: parent }, { data: wi }] = await Promise.all([
          supabase
            .from("projects")
            .select("id, name")
            .eq("id", proj.parent_project_id)
            .maybeSingle<{ id: string; name: string }>(),
          link.from_work_item_id
            ? supabase
                .from("work_items")
                .select("id, title")
                .eq("id", link.from_work_item_id)
                .maybeSingle<{ id: string; title: string }>()
            : Promise.resolve({ data: null }),
        ])
        if (cancelled) return
        if (!parent) return
        setInfo({
          parent_project_id: parent.id,
          parent_project_name: parent.name,
          from_work_item_id: wi?.id ?? null,
          from_work_item_title: wi?.title ?? null,
        })
      } catch {
        // Best-effort — never block the room render.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (hidden || !info) return null

  return (
    <div
      className="flex h-10 items-center justify-between gap-2 border-b border-outline-variant bg-surface-container/60 px-4 text-xs sm:px-6"
      role="region"
      aria-label="Übergeordnetes Projekt"
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" aria-hidden />
        <span className="truncate text-on-surface-variant">
          {info.from_work_item_title ? (
            <>
              Dieses Projekt liefert{" "}
              <span className="font-medium text-foreground">
                {info.from_work_item_title}
              </span>{" "}
              in
            </>
          ) : (
            "Dieses Projekt ist Teil von"
          )}{" "}
          <Link
            href={`/projects/${info.parent_project_id}`}
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            {info.parent_project_name ?? "Parent-Projekt"}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </span>
      </div>
      <button
        type="button"
        onClick={() => setHidden(true)}
        className="text-xs text-on-surface-variant hover:underline"
        aria-label="Banner ausblenden"
      >
        Ausblenden
      </button>
    </div>
  )
}
