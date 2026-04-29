"use client"

import { Loader2, ShieldAlert, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { generateRiskSuggestions, type SuggestRunResponse } from "@/lib/ki/api"

interface GeneratePanelProps {
  projectId: string
  onGenerated: (result: SuggestRunResponse) => void
}

const COUNT_OPTIONS = [3, 5, 7, 10] as const

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  stub: "Lokal (Stub)",
  ollama: "Ollama",
}

export function GeneratePanel({ projectId, onGenerated }: GeneratePanelProps) {
  const [count, setCount] = React.useState<number>(5)
  const [busy, setBusy] = React.useState(false)
  const [lastRun, setLastRun] = React.useState<SuggestRunResponse | null>(null)

  const onGenerate = async () => {
    setBusy(true)
    try {
      const result = await generateRiskSuggestions(projectId, { count })
      setLastRun(result)
      onGenerated(result)
      const baseDescription = `${result.suggestion_ids.length} Vorschläge · ${PROVIDER_LABELS[result.provider] ?? result.provider}`
      if (result.external_blocked) {
        toast.warning("Externes Modell wurde geblockt", {
          description: `${baseDescription}. Vorschläge wurden lokal generiert (Datenklasse ${result.classification} oder externe Modelle deaktiviert).`,
        })
      } else {
        toast.success("Vorschläge generiert", { description: baseDescription })
      }
    } catch (err) {
      toast.error("Generierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Risiken vorschlagen</CardTitle>
            <CardDescription>
              KI nutzt nur Projekt-Metadaten (Klasse 1–2). Stakeholder, Notizen
              oder Beschreibungstexte werden nicht übermittelt.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Anzahl:</span>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => void onGenerate()} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Generiere …
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                Vorschläge anfordern
              </>
            )}
          </Button>
          {lastRun ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline">
                Klasse {lastRun.classification}
              </Badge>
              <Badge variant="outline">
                {PROVIDER_LABELS[lastRun.provider] ?? lastRun.provider}
              </Badge>
              {lastRun.model_id ? (
                <span className="font-mono">{lastRun.model_id}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {lastRun?.external_blocked ? (
          <Alert>
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>Externes Modell wurde geblockt</AlertTitle>
            <AlertDescription>
              Der Aufruf wurde lokal verarbeitet, weil das Payload Klasse 3
              enthielt oder externe LLMs durch die Plattform-Konfiguration
              deaktiviert sind. Die Vorschläge sind dadurch deterministisch
              (Stub-Provider) statt KI-generiert.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
