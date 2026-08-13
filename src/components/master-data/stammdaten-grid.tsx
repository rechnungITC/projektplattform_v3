"use client"

import { ChevronRight, Lock } from "lucide-react"
import Link from "next/link"

import { useAuth } from "@/hooks/use-auth"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  resolveStammdatenSections,
  type ResolvedStammdatenSection,
} from "@/lib/master-data/stammdaten-sections"
import { MODULE_LABELS } from "@/types/tenant-settings"

/**
 * PROJ-Y-143k — the Stammdaten tile grid.
 *
 * Client-side because the module state lives on the tenant settings the auth
 * provider already holds; nothing else about the grid is dynamic.
 *
 * Tiles whose module is off stay visible and are labelled, rather than being
 * hidden. Hiding them would be the tidier-looking choice and the wrong one:
 * the workspace setting that switches them back on would then be reachable
 * only by someone who already knows it exists.
 */
export function StammdatenGrid() {
  const { tenantSettings } = useAuth()
  const sections = resolveStammdatenSections(tenantSettings)

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sections.map((section) =>
        section.moduleInactive ? (
          <InactiveTile key={section.href} section={section} />
        ) : (
          <Link key={section.href} href={section.href} className="group">
            <SectionCard section={section} />
          </Link>
        ),
      )}
    </div>
  )
}

/**
 * A module-gated tile whose module is off. Deliberately not a link: the
 * surface behind it answers 404 by design, and rendering a door that is
 * known to be shut is exactly the inconsistency this slice removes.
 */
function InactiveTile({ section }: { section: ResolvedStammdatenSection }) {
  // No `aria-disabled`: that attribute belongs on widgets, and this is now
  // plain content. What a screen reader needs is the sentence in the card
  // footer, which it reads in full — same approach as ModuleUnavailableNotice.
  return <SectionCard section={section} />
}

function SectionCard({ section }: { section: ResolvedStammdatenSection }) {
  const Icon = section.icon
  const inactive = section.moduleInactive
  const moduleLabel = section.requiresModule
    ? MODULE_LABELS[section.requiresModule]
    : null

  return (
    <Card
      className={cn(
        "h-full transition-colors",
        inactive ? "border-dashed bg-muted/30" : "hover:border-primary",
      )}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
            inactive && "opacity-60",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1">
          <CardTitle
            className={cn(
              "flex items-center justify-between text-base",
              inactive && "text-muted-foreground",
            )}
          >
            {section.title}
            {inactive ? (
              <Lock
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : (
              <ChevronRight
                className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            )}
          </CardTitle>
          <CardDescription className="mt-1">
            {section.description}
          </CardDescription>
        </div>
      </CardHeader>
      {inactive || section.adminOnly ? (
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          {inactive ? (
            // Same vocabulary as PROJ-Y-143f's ModuleUnavailableNotice — one
            // wording for one concept, so a user who sees both recognises them.
            <p>
              Das Modul „{moduleLabel}“ ist für diesen Workspace nicht aktiv.
              Ein Tenant-Admin kann es unter Einstellungen → Workspace
              aktivieren.
            </p>
          ) : null}
          {section.adminOnly ? <p>Nur für Tenant-Admins.</p> : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
