"use client"

import { MessageSquareText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ResolvedTonality } from "@/lib/risk-score/big5-tonality-table"

interface TonalityCardProps {
  resolved: ResolvedTonality
}

export function TonalityCard({ resolved }: TonalityCardProps) {
  const { recommendation, fallback } = resolved
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareText
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              Empfohlener Kommunikationsstil
            </CardTitle>
            <CardDescription>
              Abgeleitet aus dem Big5/OCEAN-Profil — als Heuristik, nicht
              als Diagnose.
            </CardDescription>
          </div>
          {fallback && (
            <Badge variant="outline" className="shrink-0">
              Profil unvollständig
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Tonalität" value={recommendation.tone} />
          <Field
            label="Detailtiefe"
            value={recommendation.detail_depth}
          />
          <Field
            label="Bevorzugter Kanal"
            value={recommendation.channel_preference}
          />
        </div>

        {recommendation.notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hinweise
            </p>
            <ul className="space-y-1 text-sm">
              {recommendation.notes.slice(0, 4).map((note) => (
                <li key={note} className="flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  )
}
