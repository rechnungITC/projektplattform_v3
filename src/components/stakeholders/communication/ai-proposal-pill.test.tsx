import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AIProposalPill } from "./ai-proposal-pill"

describe("AIProposalPill", () => {
  it("renders the proposed variant with the pending counter", () => {
    render(
      <AIProposalPill variant="proposed" pendingCount={4} onClick={() => {}} />,
    )
    const pill = screen.getByTestId("ai-proposal-pill")
    expect(pill).toHaveAttribute("data-variant", "proposed")
    expect(pill).toHaveTextContent("KI-Vorschlag · 4 offen")
  })

  it("renders the stub variant with a different label", () => {
    render(<AIProposalPill variant="stub" pendingCount={3} onClick={() => {}} />)
    expect(screen.getByTestId("ai-proposal-pill")).toHaveTextContent(
      "Lokaler Stub · Review nötig",
    )
  })

  it("renders the loading variant and disables the button", () => {
    render(<AIProposalPill variant="loading" pendingCount={0} />)
    const pill = screen.getByTestId("ai-proposal-pill")
    expect(pill).toBeDisabled()
    expect(pill).toHaveTextContent("KI analysiert…")
  })

  it("renders the failed variant and calls onRetry on click", () => {
    const onRetry = vi.fn()
    const onClick = vi.fn()
    render(
      <AIProposalPill
        variant="failed"
        pendingCount={0}
        onClick={onClick}
        onRetry={onRetry}
      />,
    )
    fireEvent.click(screen.getByTestId("ai-proposal-pill"))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("invokes onClick for the proposed variant", () => {
    const onClick = vi.fn()
    render(
      <AIProposalPill
        variant="proposed"
        pendingCount={2}
        onClick={onClick}
      />,
    )
    fireEvent.click(screen.getByTestId("ai-proposal-pill"))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("uses the compact label for mobile", () => {
    render(
      <AIProposalPill
        variant="proposed"
        pendingCount={4}
        onClick={() => {}}
        compact
      />,
    )
    const pill = screen.getByTestId("ai-proposal-pill")
    expect(pill).toHaveTextContent("4")
    expect(pill).not.toHaveTextContent("KI-Vorschlag")
  })
})
