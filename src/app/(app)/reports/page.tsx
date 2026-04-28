import type { Metadata } from "next"
import { ChevronRight, FileSearch } from "lucide-react"
import Link from "next/link"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Reports · Projektplattform",
}

const REPORTS = [
  {
    href: "/reports/audit",
    icon: FileSearch,
    title: "Audit-Bericht",
    description:
      "Mandantenweite Änderungshistorie mit Filtern und CSV-Export. Class-3-Felder werden im Export standardmäßig redaktioniert.",
    adminOnly: true,
  },
]

export default function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Auswertungen und Exporte. Weitere Berichte folgen mit der
          Output-Domäne.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((report) => {
          const Icon = report.icon
          return (
            <Link key={report.href} href={report.href} className="group">
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="flex items-center justify-between text-base">
                      {report.title}
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {report.description}
                    </CardDescription>
                  </div>
                </CardHeader>
                {report.adminOnly ? (
                  <CardContent className="text-xs text-muted-foreground">
                    Nur für Tenant-Admins.
                  </CardContent>
                ) : null}
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
