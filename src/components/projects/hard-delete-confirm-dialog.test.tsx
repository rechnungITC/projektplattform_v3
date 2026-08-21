/**
 * PROJ-Y-148a — der Bestätigungsdialog für „endgültig löschen".
 *
 * Die Datei sichert genau die drei Aussagen, an denen der Dialog vorher
 * gescheitert ist, und die man ihm ansehen können muss:
 *
 *  - **AC-Y148a.V1-6:** er versprach „The project and its full lifecycle
 *    history will be removed". Seit PROJ-130-β schreibt ein Hard-Delete
 *    `__deleted`-Zeilen in das unveränderliche Protokoll — die Historie ist
 *    also gerade das, was bleibt. Fall „sagt nicht mehr…" pinnt das negativ,
 *    weil eine falsche Zusage kein sichtbarer Fehler ist.
 *  - **AC-Y148a.V1-3:** trägt das Projekt unveränderliche Historie, erfährt
 *    der Nutzer das *vor* dem Klick und der Knopf ist nicht da. Vorher lief er
 *    in eine Sackgasse und bekam danach einen roten Serverfehler.
 *  - **AC-Y148a.V1-2/V1-7:** kein Tabellenname, keine rohe DB-Meldung, deutsch.
 *
 * Der Fehlerpfad wird über den stabilen `code` erkannt, nicht über den
 * Meldungstext (PROJ-77-α-Lehre) — dafür der Fall mit absichtlich fremdem
 * Wortlaut bei richtigem Code.
 */
import "@testing-library/jest-dom/vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  HardDeleteConfirmDialog,
  translateDeleteError,
} from "./hard-delete-confirm-dialog"

const PROJECT_ID = "44444444-4444-4444-8444-444444444444"
const PROJECT_NAME = "Test 1 SCRUM"

const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

/** Queue of fetch responses, consumed in call order. */
let responses: Array<{ ok: boolean; status: number; body: unknown }> = []
const fetchMock = vi.fn(() => {
  const next = responses.shift()
  if (!next) throw new Error("no fetch response queued")
  return Promise.resolve({
    ok: next.ok,
    status: next.status,
    json: () => Promise.resolve(next.body),
  } as Response)
})

beforeEach(() => {
  vi.clearAllMocks()
  responses = []
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderDialog(onDeleted = vi.fn()) {
  render(
    <HardDeleteConfirmDialog
      open
      onOpenChange={vi.fn()}
      projectId={PROJECT_ID}
      projectName={PROJECT_NAME}
      onDeleted={onDeleted}
    />
  )
  return { onDeleted }
}

/** Pre-flight answer: nothing blocks the delete. */
function preflightDeletable() {
  responses.push({
    ok: true,
    status: 200,
    body: { project: { id: PROJECT_ID }, events: [], hard_delete_block: null },
  })
}

/** Pre-flight answer: immutable governance history is in the way. */
function preflightBlocked() {
  responses.push({
    ok: true,
    status: 200,
    body: {
      project: { id: PROJECT_ID },
      events: [],
      hard_delete_block: {
        kinds: [
          "Stakeholder-Profil-Historie",
          "Genehmigungs-Historie zu Entscheidungen",
        ],
        total: 21,
      },
    },
  })
}

describe("HardDeleteConfirmDialog — pre-flight", () => {
  it("asks the server before offering the button", async () => {
    preflightDeletable()
    renderDialog()

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}?hard_delete_check=true`
      )
    )
  })

  it("AC-Y148a.V1-3: a blocked project explains itself and offers no button", async () => {
    preflightBlocked()
    renderDialog()

    expect(
      await screen.findByText(/kann nicht endgültig gelöscht werden/i)
    ).toBeInTheDocument()
    // Not a dead end: the destructive action is gone, not merely disabled.
    expect(
      screen.queryByRole("button", { name: /endgültig löschen/i })
    ).not.toBeInTheDocument()
    // And no confirmation ritual for something that cannot happen.
    expect(
      screen.queryByLabelText(/zur bestätigung/i)
    ).not.toBeInTheDocument()
    // The trash is the outcome, said in the heading as well as the notice —
    // there is no auto-purge, so staying there is legitimate, not a failure.
    expect(
      screen.getByRole("heading", { name: "Projekt bleibt im Papierkorb" })
    ).toBeInTheDocument()
  })

  it("AC-Y148a.V1-2: names the history in business terms, never a table", async () => {
    preflightBlocked()
    renderDialog()

    expect(
      await screen.findByText(/Stakeholder-Profil-Historie/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Genehmigungs-Historie zu Entscheidungen/)
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(
      "stakeholder_profile_audit_events"
    )
    expect(document.body.textContent).not.toContain("append-only")
  })

  it("AC-Y148a.V1-6: no longer claims the history will be removed", async () => {
    preflightDeletable()
    renderDialog()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const text = document.body.textContent ?? ""
    // The old sentence, and the claim behind it.
    expect(text).not.toContain("full lifecycle history")
    expect(text).not.toMatch(/gesamte\s+Historie/i)
    // What actually happens instead.
    expect(text).toMatch(/Änderungsprotokoll/)
  })

  it("AC-Y148a.V1-7: German throughout, no leftover implementation notice", async () => {
    preflightDeletable()
    renderDialog()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const text = document.body.textContent ?? ""
    expect(text).not.toContain("pending implementation")
    expect(text).not.toContain("Permanently delete")
    expect(text).not.toContain("Delete forever")
    expect(text).toContain("Projekt endgültig löschen?")
    expect(
      screen.getByRole("button", { name: "Abbrechen" })
    ).toBeInTheDocument()
  })

  it("keeps the delete available when nothing blocks it", async () => {
    preflightDeletable()
    renderDialog()

    const input = await screen.findByLabelText(/zur bestätigung/i)
    const button = screen.getByRole("button", { name: /endgültig löschen/i })
    expect(button).toBeDisabled()

    fireEvent.change(input, { target: { value: PROJECT_NAME } })
    expect(button).toBeEnabled()
  })

  it("does not offer the delete while the pre-flight is still running", () => {
    // No response queued yet: the fetch stays pending.
    responses = []
    const pending = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal("fetch", pending)
    renderDialog()

    expect(
      screen.getByRole("button", { name: /endgültig löschen/i })
    ).toBeDisabled()
    expect(screen.getByText(/wird geprüft/i)).toBeInTheDocument()
  })

  it("lets the attempt through when the pre-flight itself fails", async () => {
    // The server stays the authority — claiming "deletable" or "blocked" here
    // would both be inventions.
    responses.push({ ok: false, status: 500, body: {} })
    renderDialog()

    const input = await screen.findByLabelText(/zur bestätigung/i)
    fireEvent.change(input, { target: { value: PROJECT_NAME } })
    expect(
      screen.getByRole("button", { name: /endgültig löschen/i })
    ).toBeEnabled()
    expect(screen.getByText(/Vorabprüfung war nicht möglich/i)).toBeInTheDocument()
  })
})

describe("HardDeleteConfirmDialog — confirming", () => {
  it("deletes and reports success in German", async () => {
    preflightDeletable()
    responses.push({ ok: true, status: 200, body: { ok: true } })
    const { onDeleted } = renderDialog()

    const input = await screen.findByLabelText(/zur bestätigung/i)
    fireEvent.change(input, { target: { value: PROJECT_NAME } })
    fireEvent.click(screen.getByRole("button", { name: /endgültig löschen/i }))

    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/projects/${PROJECT_ID}?hard=true`,
      { method: "DELETE" }
    )
    expect(toastSuccess).toHaveBeenCalledWith(
      "Projekt endgültig gelöscht",
      expect.objectContaining({ description: expect.stringContaining(PROJECT_NAME) })
    )
  })

  it("turns a late refusal into the same notice, not a red error", async () => {
    // The window between pre-flight and confirm: someone recorded an approval.
    // Recognised by `code`; the message text here is deliberately not the one
    // the UI would look for, so a text-matching implementation fails this.
    preflightDeletable()
    responses.push({
      ok: false,
      status: 422,
      body: {
        error: {
          code: "governance_history_immutable",
          message: "Beliebiger anderer Wortlaut vom Server.",
        },
      },
    })
    renderDialog()

    const input = await screen.findByLabelText(/zur bestätigung/i)
    fireEvent.change(input, { target: { value: PROJECT_NAME } })
    fireEvent.click(screen.getByRole("button", { name: /endgültig löschen/i }))

    expect(
      await screen.findByText("Beliebiger anderer Wortlaut vom Server.")
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Projekt bleibt im Papierkorb" })
    ).toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
    expect(
      screen.queryByRole("button", { name: /endgültig löschen/i })
    ).not.toBeInTheDocument()
  })

  it("shows a real failure as an error, in German and without DB internals", async () => {
    preflightDeletable()
    responses.push({
      ok: false,
      status: 500,
      body: {
        error: {
          code: "delete_failed",
          message: 'relation "x" violates something obscure',
        },
      },
    })
    renderDialog()

    const input = await screen.findByLabelText(/zur bestätigung/i)
    fireEvent.change(input, { target: { value: PROJECT_NAME } })
    fireEvent.click(screen.getByRole("button", { name: /endgültig löschen/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const [title, options] = toastError.mock.calls[0] as [
      string,
      { description: string },
    ]
    expect(title).toBe("Endgültiges Löschen nicht möglich")
    expect(options.description).not.toContain("relation")
    expect(options.description).toMatch(/konnte nicht gelöscht werden/i)
  })
})

describe("translateDeleteError", () => {
  it("AC-Y148a.V1-7: a 404 no longer blames a missing endpoint", () => {
    const message = translateDeleteError("not_found", "Project not found.")
    expect(message).not.toContain("pending implementation")
    expect(message).toMatch(/existiert nicht mehr/i)
  })

  it("drops the raw server text for delete_failed", () => {
    expect(
      translateDeleteError("delete_failed", "pq: some internal detail")
    ).not.toContain("internal detail")
  })

  it("explains a 403 in terms of the role, not the status", () => {
    expect(translateDeleteError("forbidden", "Admin role required.")).toMatch(
      /Administratoren/
    )
  })

  it("falls back to the server wording for codes it does not know", () => {
    // Our own routes always answer in our own prose, so the fallback is safe.
    expect(translateDeleteError("something_new", "Eigener Wortlaut")).toBe(
      "Eigener Wortlaut"
    )
  })
})
