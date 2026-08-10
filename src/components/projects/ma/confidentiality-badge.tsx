/**
 * Shared need-to-know level badge (PROJ-100a axis).
 *
 * Introduced by PROJ-Y-115c so the DMS does not become the third copy of the
 * `levelBadgeVariant` mapping. The two pre-existing copies (committees-page,
 * communication-page) are intentionally left alone here — they carry PROJ-51
 * visual snapshots, so folding them in belongs in a separate cleanup slice.
 */

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  MA_CONFIDENTIALITY_LEVEL_LABELS,
  type MaConfidentialityLevel,
} from "@/types/confidentiality"

export function confidentialityBadgeVariant(
  level: MaConfidentialityLevel,
): "default" | "secondary" | "destructive" | "outline" {
  if (level === "strict") return "destructive"
  if (level === "confidential") return "secondary"
  return "outline"
}

export interface ConfidentialityBadgeProps {
  level: MaConfidentialityLevel
  /** Omit the badge entirely for `standard` (the unremarkable default). */
  hideStandard?: boolean
  className?: string
}

export function ConfidentialityBadge({
  level,
  hideStandard = false,
  className,
}: ConfidentialityBadgeProps) {
  if (hideStandard && level === "standard") return null
  return (
    <Badge
      variant={confidentialityBadgeVariant(level)}
      className={cn("shrink-0", className)}
    >
      {MA_CONFIDENTIALITY_LEVEL_LABELS[level]}
    </Badge>
  )
}
