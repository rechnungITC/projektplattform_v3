"use client"

import { Info } from "lucide-react"
import { useFormContext } from "react-hook-form"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Textarea } from "@/components/ui/textarea"
import { computeRules } from "@/lib/project-rules/engine"
import type { ProjectTypeOverrideFields } from "@/types/master-data"
import type { ProjectMethod } from "@/types/project-method"
import type { ProjectType } from "@/types/project"
import type { WizardData } from "@/types/wizard"

interface StepFollowupsProps {
  projectType: ProjectType
  projectMethod: ProjectMethod | null
  /** PROJ-16 tenant-side override for this type, or null when none. */
  projectTypeOverride?: ProjectTypeOverrideFields | null
}

/**
 * Step 4 — type/method-aware questions, sourced from the PROJ-6 catalog
 * with optional PROJ-16 tenant overrides applied. Each `RequiredInfo`
 * from `computeRules` becomes a textarea field in `type_specific_data`.
 * The orchestrator validates that all are filled before allowing
 * transition to the Review step.
 */
export function StepFollowups({
  projectType,
  projectMethod,
  projectTypeOverride,
}: StepFollowupsProps) {
  const form = useFormContext<WizardData>()
  const rules = computeRules(
    projectType,
    projectMethod,
    projectTypeOverride ?? null
  )

  if (rules.required_info.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" aria-hidden />
        <AlertDescription>
          Für diese Kombination sind keine zusätzlichen Detail-Fragen vorgesehen.
          Direkt zum Review weiter.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Diese Fragen kommen aus dem Katalog für{" "}
        <span className="font-medium">{projectType}</span>
        {projectMethod ? (
          <>
            {" "}und Methode{" "}
            <span className="font-medium">{projectMethod}</span>
          </>
        ) : null}
        . Antworten landen in den Projekt-Stammdaten.
      </p>

      {rules.required_info.map((field) => (
        <FormField
          key={field.key}
          control={form.control}
          name={`type_specific_data.${field.key}` as const}
          render={({ field: rhfField }) => (
            <FormItem>
              <FormLabel>{field.label_de} *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={field.description_de ?? ""}
                  rows={2}
                  {...rhfField}
                  value={rhfField.value ?? ""}
                />
              </FormControl>
              {field.description_de ? (
                <FormDescription>{field.description_de}</FormDescription>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
      ))}
    </div>
  )
}
