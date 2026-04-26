import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { MitgliederClient } from "./mitglieder-client"

export const metadata: Metadata = {
  title: "Mitglieder · Projektplattform",
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function MitgliederPage({ params }: PageProps) {
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
    <MitgliederClient
      projectId={project.id}
      tenantId={project.tenant_id}
      projectName={project.name}
    />
  )
}
