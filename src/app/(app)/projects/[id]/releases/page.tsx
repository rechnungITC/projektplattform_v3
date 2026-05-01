/**
 * PROJ-28 — alias for the canonical /planung page used by Scrum and
 * SAFe to expose "Releases". The page logic lives in
 * `../planung/page.tsx`; this file is a thin re-export so the slugs
 * cannot drift.
 */

import type { Metadata } from "next"

export { default } from "../planung/page"

interface AliasPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({
  params,
}: AliasPageProps): Promise<Metadata> {
  const { id } = await params
  return {
    title: "Releases · Projektplattform",
    alternates: { canonical: `/projects/${id}/planung` },
  }
}
