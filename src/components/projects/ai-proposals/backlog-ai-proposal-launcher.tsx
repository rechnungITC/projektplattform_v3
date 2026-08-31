"use client"

import * as React from "react"
import { Sparkles } from "lucide-react"

import { AIProposalDrawer } from "@/components/projects/ai-proposal-drawer"
import { Button } from "@/components/ui/button"

interface BacklogAiProposalLauncherProps {
  projectId: string
  /** Drives the 70-β method-validation badges in the backlog tab. */
  projectMethod?: string | null
}

/**
 * PROJ-87 — surfaces the AI-backlog generation drawer (PROJ-70) directly in
 * the Backlog and Gantt/Arbeitspakete views. Previously the only entry point
 * was the trajectory graph. Reuses the existing `AIProposalDrawer` opened on
 * its "backlog" tab; no new backend code.
 *
 * Gating: callers render this only when the user may edit (mirroring the host
 * view's own edit-action gating). The server still enforces editor role +
 * `ai_proposals` module on every proposal route — this is UX-gating only.
 */
export function BacklogAiProposalLauncher({
  projectId,
  projectMethod,
}: BacklogAiProposalLauncherProps) {
  const [open, setOpen] = React.useState(false)
  // PROJ-153-α: zwei Einstiege, EIN Drawer. Welcher Reiter aufgeht, entscheidet
  // der geklickte Knopf — der Nutzer soll nicht erst suchen, welcher Weg der
  // seine ist (mit Datei oder ohne).
  const [tab, setTab] = React.useState<"backlog" | "intent">("backlog")

  const openWith = (next: "backlog" | "intent") => {
    setTab(next)
    setOpen(true)
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => openWith("backlog")}
        data-testid="backlog-ai-proposals-trigger"
        className="border-violet-400/40 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-violet-500" aria-hidden />
        KI-Backlog generieren
      </Button>
      {/* PROJ-153-α — ohne Kickoff-Datei, aus dem Vorhaben. */}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => openWith("intent")}
        data-testid="intent-proposals-trigger"
      >
        <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Aus Vorhaben vorschlagen
      </Button>
      <AIProposalDrawer
        key={tab}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectMethod={projectMethod ?? null}
        defaultTab={tab}
      />
    </>
  )
}
