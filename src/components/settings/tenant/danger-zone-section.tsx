"use client"

import { Download, Trash2 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function DangerZoneSection() {
  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Gefahrenzone</CardTitle>
        <CardDescription>
          Datenexport und Tenant-Offboarding folgen in eigenen Iterationen
          (Spec ST-04 + ST-05). Diese Aktionen erfordern Edge Functions,
          Storage und einen mehrstufigen Lösch-Workflow — daher außerhalb
          der aktuellen Slice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3 rounded-md border border-dashed p-3 text-sm opacity-70">
          <Download className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">DSGVO-Datenexport (ST-04)</p>
            <p className="text-xs text-muted-foreground">
              Ein Hintergrundjob exportiert alle Tenant-Daten als ZIP mit
              JSON-Dumps. Klasse-3-Felder werden redigiert. Demnächst.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border border-dashed p-3 text-sm opacity-70">
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Tenant offboarden (ST-05)</p>
            <p className="text-xs text-muted-foreground">
              Zwei-Stufen-Löschung: Soft-Delete mit 30 Tagen Karenzzeit, dann
              Hard-Delete via geplantem Worker. Vor dem Soft-Delete läuft
              automatisch ein voller Datenexport. Demnächst.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
