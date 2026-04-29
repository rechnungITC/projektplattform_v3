"use client"

import { ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/hooks/use-auth"

import { AiProviderSection } from "./ai-provider-section"
import { BaseDataSection } from "./base-data-section"
import { DangerZoneSection } from "./danger-zone-section"
import { ModulesSection } from "./modules-section"
import { PrivacySection } from "./privacy-section"

export function TenantSettingsSections() {
  const { currentTenant, currentRole } = useAuth()

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Kein aktiver Workspace</CardTitle>
          <CardDescription>
            Wähle oben rechts einen Workspace aus.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (currentRole !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace-Einstellungen</CardTitle>
          <CardDescription>
            Nur Workspace-Admins können diese Einstellungen ändern.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert role="alert">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>Berechtigung erforderlich</AlertTitle>
            <AlertDescription>
              Bitte einen Admin von <strong>{currentTenant.name}</strong>,
              Anpassungen vorzunehmen.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <BaseDataSection />
      <ModulesSection />
      <PrivacySection />
      <AiProviderSection />
      <DangerZoneSection />
    </div>
  )
}
