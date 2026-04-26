import { notFound } from "next/navigation"

import { ProjectRoomShell } from "@/components/projects/project-room-shell"
import { createClient } from "@/lib/supabase/server"

interface ProjectLayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

/**
 * Project room layout. Confirms the project exists (RLS-scoped) and
 * renders the secondary tab navigation around the active tab's page.
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

  return <ProjectRoomShell projectId={id}>{children}</ProjectRoomShell>
}
