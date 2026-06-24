"use client"

import { ShieldCheck } from "lucide-react"
import * as React from "react"

import { ConfidentialityAccessCard } from "@/components/projects/ma/confidentiality-access-card"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/use-auth"
import { useProjectAccess } from "@/hooks/use-project-access"
import { useTenantMembers } from "@/hooks/use-tenant-members"

import { AdvisorsTab } from "./advisors-tab"
import { ClassificationMatrixTab } from "./classification-matrix-tab"
import { GovernanceHistoryTab } from "./governance-history-tab"
import { NdasTab } from "./ndas-tab"

// PROJ-99 / 128 / 129 — "Governance & Zugriff" surface for M&A projects.
// One tabbed page in the project room (project_type='ma', nav-gated via
// requiresProjectType). All write actions are manager-gated server-side; the
// page itself is restricted to project leads / tenant admins, mirroring the
// PROJ-100b ConfidentialityAccessCard precedent (the access-explain RPC is
// manager-only too).
export function GovernanceAccessPage({ projectId }: { projectId: string }) {
  const canManage = useProjectAccess(projectId, "manage_members")
  const { currentTenant } = useAuth()
  const tenantId = currentTenant?.id ?? null
  const { members } = useTenantMembers(tenantId)

  const nameFor = React.useCallback(
    (userId: string) => {
      const m = members.find((x) => x.user_id === userId)
      return m?.display_name || m?.email || userId.slice(0, 8)
    },
    [members]
  )

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" aria-hidden /> Governance &amp; Zugriff
          </CardTitle>
          <CardDescription>
            Berater, NDAs, Klassifikation und Freischaltungen sind nur für die
            Projektleitung und Tenant-Admins sichtbar.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="h-5 w-5" aria-hidden /> Governance &amp; Zugriff
        </h1>
        <p className="text-sm text-muted-foreground">
          Externe Berater, NDA-Register, Need-to-know-Klassifikation und
          Freischaltungen für dieses M&amp;A-Projekt.
        </p>
      </div>

      <Tabs defaultValue="advisors">
        <TabsList className="flex-wrap">
          <TabsTrigger value="advisors">Berater</TabsTrigger>
          <TabsTrigger value="ndas">NDAs</TabsTrigger>
          <TabsTrigger value="classification">Klassifikation</TabsTrigger>
          <TabsTrigger value="clearances">Freischaltungen</TabsTrigger>
          <TabsTrigger value="history">Historie</TabsTrigger>
        </TabsList>

        <TabsContent value="advisors" className="mt-4">
          <AdvisorsTab
            projectId={projectId}
            members={members}
            nameFor={nameFor}
          />
        </TabsContent>

        <TabsContent value="ndas" className="mt-4">
          <NdasTab projectId={projectId} members={members} nameFor={nameFor} />
        </TabsContent>

        <TabsContent value="classification" className="mt-4">
          <ClassificationMatrixTab projectId={projectId} nameFor={nameFor} />
        </TabsContent>

        <TabsContent value="clearances" className="mt-4">
          {/* PROJ-100b — reused as-is: clearance grants + who-can-see overview. */}
          <ConfidentialityAccessCard projectId={projectId} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {/* PROJ-99/128/129 D-FE-1 — PROJ-10 audit trail for advisors + NDAs. */}
          <GovernanceHistoryTab projectId={projectId} nameFor={nameFor} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
