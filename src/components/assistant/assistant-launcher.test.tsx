import "@testing-library/jest-dom/vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

import { AssistantLauncher } from "./assistant-launcher"

const SESSION_ID = "11111111-1111-4111-8111-111111111111"
const PROJECT_ID = "22222222-2222-4222-8222-222222222222"

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []

  lang = ""
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onresult: ((event: SpeechResultEvent) => void) | null = null
  onerror: ((event: { error: "no-speech"; message?: string }) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  emitResult(...transcripts: string[]) {
    const results = transcripts.map((transcript) => ({
      0: { transcript },
      isFinal: true,
    }))
    this.onresult?.({ results })
  }
}

interface SpeechResultEvent {
  results: Array<{ 0: { transcript: string }; isFinal: boolean }>
}

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  confirm: vi.fn(),
  discard: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    currentTenant: { id: "tenant-1" },
    tenantSettings: null,
  }),
}))

vi.mock("@/hooks/use-assistant-work-item-drafts", () => ({
  useAssistantWorkItemDrafts: () => ({
    data: [],
    loading: false,
    error: null,
    refresh: mocks.refresh,
    confirm: mocks.confirm,
    discard: mocks.discard,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  FakeSpeechRecognition.instances = []
  sessionStorage.clear()
  sessionStorage.setItem("assistant-session:user-1:tenant-1", SESSION_ID)
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: FakeSpeechRecognition,
  })
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  })
})

describe("AssistantLauncher dialog continuation", () => {
  it("lädt einen offenen Projekt-Review nach einem Reload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json(resumeResponse(projectReviewState())),
    ))

    renderLauncher()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Assistant öffnen" }))

    expect(
      await screen.findByRole("region", { name: "Projektentwurf prüfen" }),
    ).toHaveTextContent("Apollo")
  })

  it("sendet eine Projektauswahl als strukturierte Fortsetzung", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(resumeResponse(projectChoiceState(), [
        { id: PROJECT_ID, name: "Apollo", lifecycle_status: "active" },
      ])))
      .mockResolvedValueOnce(Response.json({
        session: { id: SESSION_ID, transcript_retention_mode: "no_persist" },
        result: {
          recognized_intent: "work_item_create_draft",
          result_status: "needs_clarification",
          user_response: "Fortgesetzt",
          route_target: null,
          project_choices: [],
          wizard_draft: null,
          work_item_draft: null,
          dialog_state: null,
        },
      }))
    vi.stubGlobal("fetch", fetchMock)

    renderLauncher()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Assistant öffnen" }))
    fireEvent.click(await screen.findByRole("button", { name: "Apollo" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(request.body as string)).toMatchObject({
      session_id: SESSION_ID,
      continuation: {
        kind: "project_choice",
        project_id: PROJECT_ID,
        expected_revision: 2,
      },
    })
    expect(mocks.push).not.toHaveBeenCalled()
  })
})

describe("AssistantLauncher speech input", () => {
  it("marks a browser-recognized turn as voice when submitting it", async () => {
    sessionStorage.clear()
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      session: { id: SESSION_ID, transcript_retention_mode: "no_persist" },
      result: {
        recognized_intent: "project_create_draft",
        result_status: "needs_clarification",
        user_response: "Wie soll das Projekt heißen?",
        route_target: null,
        project_choices: [],
        wizard_draft: null,
        work_item_draft: null,
        dialog_state: projectReviewState(),
      },
    }))
    vi.stubGlobal("fetch", fetchMock)

    renderLauncher()
    fireEvent.click(screen.getByRole("button", { name: "Assistant öffnen" }))
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }))
    await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(1))
    act(() => FakeSpeechRecognition.instances[0].emitResult("Leg mir ein Projekt an"))
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }))
    fireEvent.click(screen.getByRole("button", { name: "Senden" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(request.body as string)).toMatchObject({
      input_text: "Leg mir ein Projekt an",
      modality: "voice",
    })
  })

  it("bleibt über eine browserseitige Sprechpause aktiv und hängt das nächste Segment an", async () => {
    sessionStorage.clear()
    renderLauncher()
    fireEvent.click(screen.getByRole("button", { name: "Assistant öffnen" }))
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }))

    await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(1))
    const recognition = FakeSpeechRecognition.instances[0]
    expect(recognition.continuous).toBe(true)
    expect(recognition.interimResults).toBe(true)

    act(() => recognition.emitResult("Leg mir"))
    expect(screen.getByPlaceholderText("Assistant fragen")).toHaveValue("Leg mir")

    act(() => recognition.onend?.())
    await waitFor(() => expect(recognition.start).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("button", { name: "Aufnahme stoppen" })).toBeInTheDocument()

    act(() => recognition.emitResult("ein Projekt an"))
    expect(screen.getByPlaceholderText("Assistant fragen")).toHaveValue(
      "Leg mir ein Projekt an",
    )
  })

  it("behält den vorhandenen Text beim Start einer neuen Aufnahme", async () => {
    sessionStorage.clear()
    renderLauncher()
    fireEvent.click(screen.getByRole("button", { name: "Assistant öffnen" }))
    fireEvent.change(screen.getByPlaceholderText("Assistant fragen"), {
      target: { value: "Leg mir ein Projekt an" },
    })

    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }))
    await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(1))
    fireEvent.click(screen.getByRole("button", { name: "Aufnahme stoppen" }))

    fireEvent.click(screen.getByRole("button", { name: "Aufnahme starten" }))
    await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(2))
    act(() => FakeSpeechRecognition.instances[1].emitResult("mit Scrum"))

    expect(screen.getByPlaceholderText("Assistant fragen")).toHaveValue(
      "Leg mir ein Projekt an mit Scrum",
    )
  })
})

function renderLauncher() {
  return render(
    <TooltipProvider>
      <AssistantLauncher currentProjectId={null} />
    </TooltipProvider>,
  )
}

function projectReviewState() {
  return {
    schema_version: 1,
    revision: 4,
    pending_intent: "project_create_draft",
    phase: "reviewing",
    expires_at: "2099-08-21T12:30:00.000Z",
    started_project_id: null,
    requested_slot: null,
    candidate_project_ids: [],
    slots: {
      name: "Apollo",
      project_type: "software",
      project_method: "scrum",
      description: "Rechnungsimport modernisieren",
      skipped: [],
    },
  }
}

function projectChoiceState() {
  return {
    schema_version: 1,
    revision: 2,
    pending_intent: "work_item_create_draft",
    phase: "choosing_project",
    expires_at: "2099-08-21T12:30:00.000Z",
    started_project_id: null,
    requested_slot: "project",
    candidate_project_ids: [PROJECT_ID],
    slots: {
      requested_kind: "story",
      title: "Rechnungsimport",
      description: null,
      project_query: "Apollo",
      project_id: null,
    },
  }
}

function resumeResponse(
  dialogState: ReturnType<typeof projectReviewState> | ReturnType<typeof projectChoiceState>,
  projectChoices: Array<{ id: string; name: string; lifecycle_status: string }> = [],
) {
  return {
    session: { id: SESSION_ID },
    result: {
      dialog_state: dialogState,
      project_choices: projectChoices,
    },
  }
}
