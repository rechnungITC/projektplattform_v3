import { ConstructionAcceptancesPage } from "@/components/construction/construction-acceptances-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-45-γ — Projektraum-Reiter „Abnahmen": das Abnahmeregister eines
// Bauprojekts. Ansetzen und Protokollieren liegen bei Projektleitung/
// Bauleitung oder Mandanten-Administration (L22) — bewusst strenger als beim
// Mangel, wo auch Betrachter erfassen dürfen.
export default async function ProjectConstructionAcceptancesPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ConstructionAcceptancesPage projectId={id} />
    </div>
  )
}
