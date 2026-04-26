import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ComingSoonCardProps {
  title: string
  description: string
  icon: LucideIcon
  /** Optional supplementary body copy below the description. */
  children?: React.ReactNode
}

/**
 * Friendly placeholder used on stubbed routes (PROJ-4 § H).
 * Uses shadcn defaults so it doesn't clash with existing PROJ-1/PROJ-2 visuals.
 */
export function ComingSoonCard({
  title,
  description,
  icon: Icon,
  children,
}: ComingSoonCardProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="rounded-md border bg-muted/40 p-2 text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      {children ? (
        <CardContent className="text-sm text-muted-foreground">
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}
