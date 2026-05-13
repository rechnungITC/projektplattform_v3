import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ReleasePageClient } from "@/components/releases/release-page-client"
import { createClient } from "@/lib/supabase/server"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: "Releases · Projektplattform",
    alternates: { canonical: `/projects/${id}/releases` },
  }
}

export default async function ProjectReleasesPage({ params }: PageProps) {
  const { id } = await params

  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .eq("is_deleted", false)
    .maybeSingle()

  if (error || !project) {
    notFound()
  }

  return <ReleasePageClient projectId={project.id} projectName={project.name} />
}
