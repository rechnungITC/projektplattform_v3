"use client"

import { Lock } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

interface ModuleUnavailableNoticeProps {
  /** What the user came here for, e.g. "Ressourcen" or "Reports". */
  title: string
  /** Optional second line; keep it factual about what the caller can know. */
  description?: string
}

/**
 * PROJ-Y-143f — a surface whose module is not active for this workspace.
 *
 * Deliberately its own state, sitting between the two that already existed
 * and being neither:
 *
 *  - **not an error.** A module-gated `GET` answers `404` with the generic
 *    "Resource not found." by design (`requireModuleActive`, read intent).
 *    Rendering that verbatim in destructive red said "something broke" about
 *    a workspace configuration, and had been frozen into the PROJ-51 visual
 *    baseline as if it were the intended UI.
 *  - **not an empty state.** PROJ-64 already settled this for the dashboard
 *    (`DashboardSectionUnavailable`, AC-9): never imply green/safe. "Keine
 *    Ressourcen vorhanden" would claim the list is empty, when in truth we
 *    have not been allowed to look.
 *
 * The copy therefore states availability, not emptiness, and callers pass a
 * description only where they can actually distinguish the reason.
 */
export function ModuleUnavailableNotice({
  title,
  description,
}: ModuleUnavailableNoticeProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-8">
        <Lock
          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
