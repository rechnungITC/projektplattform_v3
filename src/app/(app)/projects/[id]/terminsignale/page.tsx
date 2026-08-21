import { ConstructionSignalsPage } from "@/components/construction/construction-signals-page"

interface PageProps {
  params: Promise<{ id: string }>
}

// PROJ-45-δ — Projektraum-Reiter „Terminsignale": der zusammenfassende Blick
// auf Gewerke, Bauabschnitte, Fristen und überfällige Mängel. Rein LESEND
// (AC-45δ.22) und ohne verschärftes Rollen-Gate — anders als β/γ, die beim
// Schreiben Projektleitung/Bauleitung verlangen; hier wird nichts geschrieben,
// also gilt `view` (AC-45δ.23, D-δ10).
export default async function ProjectConstructionSignalsPage({ params }: PageProps) {
  const { id } = await params
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <ConstructionSignalsPage projectId={id} />
    </div>
  )
}
