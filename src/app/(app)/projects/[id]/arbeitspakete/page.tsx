/**
 * PROJ-28 — alias for the canonical /backlog page used by Waterfall,
 * PMI, PRINCE2 and any other method that exposes the section as
 * "Arbeitspakete". The page logic lives in `../backlog/page.tsx`; this
 * file is intentionally a thin re-export so the two slugs cannot drift.
 */

import type { Metadata } from "next"

export { default } from "../backlog/page"

interface AliasPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: AliasPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: "Arbeitspakete · Projektplattform",
    alternates: { canonical: `/projects/${id}/backlog` },
  }
}
