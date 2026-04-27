import { notFound } from "next/navigation"

import { ProjectRoomLayout } from "@/components/project-room/project-room-layout"
import { createClient } from "@/lib/supabase/server"

interface ProjectLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

/**
 * Project room layout. Confirms the project exists (RLS-scoped) and
 * mounts the method-aware Project Room shell — left sidebar + top
 * header (PROJ-7) wrapping the original PROJ-4 tab nav.
 *
 * 404 to avoid existence leaks for cross-tenant attempts (per Tech Design § G).
 */
export default async function ProjectLayout({
  children,
  params,
}: ProjectLayoutProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (error || !project) {
    notFound()
  }

  return <ProjectRoomLayout projectId={id}>{children}</ProjectRoomLayout>
}
