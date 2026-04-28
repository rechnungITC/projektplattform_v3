import { Construction } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ComingSoonProps {
  feature: string
  featureId: string
  description: string
}

export function ComingSoon({
  feature,
  featureId,
  description,
}: ComingSoonProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Construction className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{feature}</CardTitle>
            <Badge variant="outline" className="text-xs">
              {featureId}
            </Badge>
          </div>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Diese Sektion ist im Roadmap-Status <strong>Planned</strong> und wird
          mit der Auslieferung von <code>{featureId}</code> aktiviert. Bis dahin
          bleibt der Sidebar-Eintrag als Vorschau auf den geplanten Funktions­umfang
          sichtbar.
        </p>
      </CardContent>
    </Card>
  )
}
