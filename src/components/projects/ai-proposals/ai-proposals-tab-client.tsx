"use client"

import { Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Card, CardContent } from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { listSuggestions } from "@/lib/ki/api"
import type { KiSuggestion, KiSuggestionStatus } from "@/types/ki"

import { GeneratePanel } from "./generate-panel"
import { SuggestionCard } from "./suggestion-card"

interface AiProposalsTabClientProps {
  projectId: string
}

const TAB_DEFS: Array<{ value: KiSuggestionStatus; label: string }> = [
  { value: "draft", label: "Offen" },
  { value: "accepted", label: "Übernommen" },
  { value: "rejected", label: "Abgelehnt" },
]

export function AiProposalsTabClient({ projectId }: AiProposalsTabClientProps) {
  const [suggestions, setSuggestions] = React.useState<KiSuggestion[]>([])
  const [loading, setLoading] = React.useState(true)
  const [activeTab, setActiveTab] = React.useState<KiSuggestionStatus>("draft")

  const reload = React.useCallback(async () => {
    try {
      setLoading(true)
      const list = await listSuggestions(projectId)
      setSuggestions(list)
    } catch (err) {
      toast.error("KI-Vorschläge konnten nicht geladen werden", {
        description: err instanceof Error ? err.message : "Unbekannter Fehler",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const filtered = React.useMemo(
    () => suggestions.filter((s) => s.status === activeTab),
    [suggestions, activeTab]
  )

  const counts = React.useMemo(() => {
    const c: Record<KiSuggestionStatus, number> = {
      draft: 0,
      accepted: 0,
      rejected: 0,
    }
    for (const s of suggestions) c[s.status]++
    return c
  }, [suggestions])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          KI-Vorschläge
        </h1>
        <p className="text-sm text-muted-foreground">
          KI generiert Risiko-Vorschläge aus dem Projektkontext. Du
          überprüfst, bearbeitest und übernimmst — KI legt nie automatisch
          Daten an.
        </p>
      </header>

      <GeneratePanel projectId={projectId} onGenerated={() => void reload()} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as KiSuggestionStatus)}
      >
        <TabsList>
          {TAB_DEFS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {counts[t.value] > 0 ? (
                <span className="ml-1.5 rounded-md bg-muted px-1.5 text-xs">
                  {counts[t.value]}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {TAB_DEFS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Lade Vorschläge …</p>
            ) : filtered.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <Sparkles
                    className="h-6 w-6 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="text-sm text-muted-foreground">
                    {t.value === "draft"
                      ? `Keine offenen Vorschläge. Klicke auf „Vorschläge anfordern“, um Risiken aus dem Projektkontext generieren zu lassen.`
                      : t.value === "accepted"
                        ? "Noch keine Vorschläge übernommen."
                        : "Noch keine Vorschläge abgelehnt."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filtered.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onMutated={() => void reload()}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
