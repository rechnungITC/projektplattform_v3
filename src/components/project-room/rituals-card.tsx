"use client"

import { Sparkles } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { MethodConfig } from "@/types/method-config"

interface RitualsCardProps {
  config: MethodConfig
}

/**
 * Method-specific rituals reminder rendered in the Übersicht tab. The
 * label comes straight from `MethodConfig.ritualsLabel` (Tech Design
 * § 2 — "method-spezifische Rituale-Card").
 */
export function RitualsCard({ config }: RitualsCardProps) {
  return (
    <Card className="border-outline-variant bg-surface-container-low text-on-surface">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base">Rituale · {config.label}</CardTitle>
          <CardDescription className="text-on-surface-variant">
            Wiederkehrende Termine und Ceremonies in dieser Methode.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-on-surface-variant">
          {config.ritualsLabel}
        </p>
      </CardContent>
    </Card>
  )
}
