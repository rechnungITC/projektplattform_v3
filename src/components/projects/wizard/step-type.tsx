"use client"

import { Briefcase, Building2, Code2, Sparkles } from "lucide-react"
import type { ComponentType } from "react"
import { useFormContext } from "react-hook-form"

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
import { PROJECT_TYPES, type ProjectType } from "@/types/project"
import type { WizardData } from "@/types/wizard"

const TYPE_DESCRIPTIONS: Record<ProjectType, string> = {
  erp: "ERP-Einführung oder Migration. Fokus auf Fachbereiche, Migration und Datenschutz.",
  construction: "Bauprojekte mit Gewerken und Bauphasen. Tiefe Domänen-Unterstützung folgt.",
  software: "Software-Entwicklung mit Backlog, Sprints oder Phasen.",
  general: "Allgemeines Projekt — wähle Methode und Module nach Bedarf.",
}

const TYPE_LABELS: Record<ProjectType, string> = {
  erp: "ERP-Projekt",
  construction: "Bauprojekt",
  software: "Software-Projekt",
  general: "Allgemeines Projekt",
}

const TYPE_ICONS: Record<ProjectType, ComponentType<{ className?: string }>> = {
  erp: Briefcase,
  construction: Building2,
  software: Code2,
  general: Sparkles,
}

export function StepType() {
  const form = useFormContext<WizardData>()

  return (
    <FormField
      control={form.control}
      name="project_type"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="sr-only">Projekttyp wählen</FormLabel>
          <FormControl>
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={(value) => field.onChange(value as ProjectType)}
              className="grid gap-3 sm:grid-cols-2"
            >
              {PROJECT_TYPES.map((type) => {
                const Icon = TYPE_ICONS[type]
                const checked = field.value === type
                return (
                  <label key={type}>
                    <RadioGroupItem
                      value={type}
                      id={`type-${type}`}
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
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                            checked
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </div>
                        <div className="flex-1 space-y-1">
                          <CardTitle className="text-base">
                            {TYPE_LABELS[type]}
                          </CardTitle>
                          <CardDescription>
                            {TYPE_DESCRIPTIONS[type]}
                          </CardDescription>
                          {type === "construction" ? (
                            <p className="text-xs text-muted-foreground">
                              Hinweis: Bauspezifische Module sind aktuell ein
                              Platzhalter.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </label>
                )
              })}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
