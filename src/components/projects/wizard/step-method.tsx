"use client"

import { AlertTriangle } from "lucide-react"
import { useFormContext } from "react-hook-form"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import {
  PROJECT_METHODS,
  PROJECT_METHOD_DESCRIPTIONS,
  PROJECT_METHOD_LABELS,
  type ProjectMethod,
} from "@/types/project-method"
import type { WizardData } from "@/types/wizard"

/**
 * Method-suggestion order per project type. The user can pick any
 * method regardless of type; this just controls the visual ordering
 * (more-likely-fit methods first). The "no method yet" radio at the
 * bottom is always present.
 */
const SUGGESTED_METHODS_BY_TYPE: Record<string, ProjectMethod[]> = {
  erp: ["pmi", "prince2", "waterfall", "vxt2", "scrum", "kanban", "safe"],
  construction: ["waterfall", "pmi", "prince2", "vxt2", "kanban", "scrum", "safe"],
  software: ["scrum", "kanban", "safe", "vxt2", "pmi", "prince2", "waterfall"],
  general: [...PROJECT_METHODS],
}

interface StepMethodProps {
  projectType: string | null
}

export function StepMethod({ projectType }: StepMethodProps) {
  const form = useFormContext<WizardData>()
  const ordered =
    projectType && projectType in SUGGESTED_METHODS_BY_TYPE
      ? SUGGESTED_METHODS_BY_TYPE[projectType]
      : [...PROJECT_METHODS]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <AlertTitle>Methode ist nach Erstellung gesperrt</AlertTitle>
        <AlertDescription>
          Sobald das Projekt angelegt ist, lässt sich die Methode nicht mehr
          ändern. Wähle bewusst — oder lasse sie vorerst offen.
        </AlertDescription>
      </Alert>

      <FormField
        control={form.control}
        name="project_method"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Methode wählen</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value ?? "__none__"}
                onValueChange={(value) =>
                  field.onChange(
                    value === "__none__" ? null : (value as ProjectMethod)
                  )
                }
                className="grid gap-3 sm:grid-cols-2"
              >
                {ordered.map((method) => {
                  const checked = field.value === method
                  return (
                    <label key={method}>
                      <RadioGroupItem
                        value={method}
                        id={`method-${method}`}
                        className="sr-only"
                      />
                      <Card
                        className={cn(
                          "h-full cursor-pointer border-2 p-4 transition-colors",
                          checked
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        <CardTitle className="text-base">
                          {PROJECT_METHOD_LABELS[method]}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {PROJECT_METHOD_DESCRIPTIONS[method]}
                        </CardDescription>
                      </Card>
                    </label>
                  )
                })}
                <label>
                  <RadioGroupItem
                    value="__none__"
                    id="method-none"
                    className="sr-only"
                  />
                  <Card
                    className={cn(
                      "h-full cursor-pointer border-2 border-dashed p-4 transition-colors",
                      field.value === null
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <CardTitle className="text-base">
                      Noch nicht festlegen
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Methode später wählen — Project Room zeigt zunächst die
                      neutrale Sicht.
                    </CardDescription>
                  </Card>
                </label>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
