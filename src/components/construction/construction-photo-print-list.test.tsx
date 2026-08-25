/**
 * PROJ-45-ε — die zwei Aussagen des Ausdrucks, die nur im DOM belegbar sind.
 *
 * **AC-45εH-14, tragende Hälfte:** ein Bild, das nicht geladen werden konnte,
 * wird **benannt** statt als leerer Kasten gedruckt. Ohne diesen Test fiele der
 * Nachweis lautlos aus — genau die Klasse, die PROJ-Y-45l beseitigt hat.
 *
 * **AC-45ε.13:** eingebettet wird die Druckgrösse, nicht das Original. Ein
 * Protokoll mit acht 9-MB-Bildern wäre unbrauchbar gross, und der Unterschied
 * ist an der Adresse ablesbar.
 *
 * **AC-45ε.11/.12:** bei null Fotos entsteht **kein** leerer Abschnitt.
 */
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ConstructionPhotoPrintList } from "./construction-photo-print-list"
import type { ConstructionPhoto } from "@/types/construction-photo"

const PROJECT = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"

function photo(over: Partial<ConstructionPhoto> = {}): ConstructionPhoto {
  return {
    id: "ph-1",
    project_id: PROJECT,
    document_id: "doc-1",
    defect_id: "def-1",
    acceptance_id: null,
    section_id: null,
    caption: "Riss Außenwand",
    taken_on: "2026-03-14",
    sort_order: 0,
    created_by: null,
    created_at: "2026-08-25T10:00:00Z",
    original_filename: "riss.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    ...over,
  }
}

describe("ConstructionPhotoPrintList", () => {
  it("bei null Fotos entsteht kein Abschnitt (AC-45ε.11/.12)", () => {
    const { container } = render(
      <ConstructionPhotoPrintList projectId={PROJECT} photos={[]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("bettet die Druckgrösse ein, nicht das Original (AC-45ε.13)", () => {
    render(
      <ConstructionPhotoPrintList projectId={PROJECT} photos={[photo()]} />,
    )
    const img = screen.getByRole("img", { name: "Riss Außenwand" })
    const src = img.getAttribute("src") ?? ""
    expect(src).toContain("size=print")
    expect(src).not.toContain("size=original")
    expect(src).toContain(`/api/projects/${PROJECT}/construction-photos/ph-1/file`)
  })

  it("zeigt Bildunterschrift und Aufnahmedatum (AC-45ε.11)", () => {
    render(
      <ConstructionPhotoPrintList projectId={PROJECT} photos={[photo()]} />,
    )
    expect(
      screen.getByText(/Riss Außenwand · aufgenommen am 14\.3\.2026/),
    ).toBeInTheDocument()
  })

  it("ohne Aufnahmedatum wird keines erfunden (AC-45ε.7)", () => {
    render(
      <ConstructionPhotoPrintList
        projectId={PROJECT}
        photos={[photo({ taken_on: null, caption: null })]}
      />,
    )
    expect(
      screen.getByText(/Ohne Bildunterschrift · Aufnahmedatum unbekannt/),
    ).toBeInTheDocument()
  })

  it("ein nicht geladenes Bild wird BENANNT, nicht verschwiegen (AC-45εH-14)", () => {
    render(
      <ConstructionPhotoPrintList projectId={PROJECT} photos={[photo()]} />,
    )
    const img = screen.getByRole("img", { name: "Riss Außenwand" })
    fireEvent.error(img)

    // Das Bild ist weg …
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    // … und an seiner Stelle steht der Dateiname, nicht ein leerer Kasten.
    expect(
      screen.getByText(/Foto konnte nicht geladen werden:\s*riss\.jpg/),
    ).toBeInTheDocument()
    // Die Bildunterschrift bleibt: der Nachweis sagt, WAS fehlt.
    expect(screen.getByText(/Riss Außenwand/)).toBeInTheDocument()
  })

  it("fehlt der Dateiname, tritt die Kennung an seine Stelle", () => {
    render(
      <ConstructionPhotoPrintList
        projectId={PROJECT}
        photos={[photo({ original_filename: null })]}
      />,
    )
    fireEvent.error(screen.getByRole("img", { name: "Riss Außenwand" }))
    expect(
      screen.getByText(/Foto konnte nicht geladen werden:\s*ph-1/),
    ).toBeInTheDocument()
  })

  it("mehrere Fotos: ein Fehlschlag betrifft nur sein eigenes Bild", () => {
    render(
      <ConstructionPhotoPrintList
        projectId={PROJECT}
        photos={[
          photo({ id: "ph-1", caption: "erstes" }),
          photo({ id: "ph-2", caption: "zweites", original_filename: "b.jpg" }),
        ]}
      />,
    )
    fireEvent.error(screen.getByRole("img", { name: "erstes" }))
    expect(screen.getByRole("img", { name: "zweites" })).toBeInTheDocument()
    expect(screen.getAllByRole("img")).toHaveLength(1)
  })
})
