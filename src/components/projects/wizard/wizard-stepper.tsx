"use client"

import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  type WizardStep,
} from "@/types/wizard"

interface WizardStepperProps {
  currentStep: WizardStep
  furthestStep: WizardStep
  onStepClick: (step: WizardStep) => void
}

/**
 * Horizontal stepper header. Click jumps backward to any visited step,
 * never forward (forward is gated by validation in the orchestrator).
 */
export function WizardStepper({
  currentStep,
  furthestStep,
  onStepClick,
}: WizardStepperProps) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep)
  const furthestIndex = WIZARD_STEPS.indexOf(furthestStep)

  return (
    <ol
      className="flex flex-wrap items-center gap-2 sm:gap-4"
      aria-label="Wizard-Schritte"
    >
      {WIZARD_STEPS.map((step, idx) => {
        const isCurrent = step === currentStep
        const isVisited = idx <= furthestIndex
        const isCompleted = idx < currentIndex
        const isClickable = idx < currentIndex || (isVisited && !isCurrent)

        return (
          <li key={step} className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => isClickable && onStepClick(step)}
              disabled={!isClickable}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors",
                "disabled:cursor-default",
                isCurrent
                  ? "bg-primary/10 text-primary font-semibold"
                  : isCompleted
                    ? "text-foreground hover:bg-muted"
                    : isVisited
                      ? "text-muted-foreground hover:bg-muted"
                      : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-foreground text-background"
                      : "border border-muted-foreground/40 text-muted-foreground"
                )}
                aria-hidden
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="hidden sm:inline">
                {WIZARD_STEP_LABELS[step]}
              </span>
            </button>
            {idx < WIZARD_STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "h-px w-4 sm:w-8",
                  idx < currentIndex ? "bg-foreground" : "bg-border"
                )}
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
