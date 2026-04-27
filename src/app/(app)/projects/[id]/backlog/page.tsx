import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { BacklogClient } from "./backlog-client"

export const metadata: Metadata = {
  title: "Backlog · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectBacklogPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, tenant_id, name")
    .eq("id", id)
    .maybeSingle()

  if (error || !project) {
    notFound()
  }

  return (
    <BacklogClient
      projectId={project.id}
      tenantId={project.tenant_id}
    />
  )
}
