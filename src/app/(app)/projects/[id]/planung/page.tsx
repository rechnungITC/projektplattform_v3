import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { PlanungClient } from "./planung-client"

export const metadata: Metadata = {
  title: "Planung · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPlanungPage({ params }: PageProps) {
  const { id } = await params

  // Confirm the project exists and is visible to this user (RLS-scoped).
  // 404 to avoid existence leaks for cross-tenant attempts (Tech Design § G).
  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (error || !project) {
    notFound()
  }

  return <PlanungClient projectId={project.id} />
}
