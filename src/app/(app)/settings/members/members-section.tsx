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

import { MembersTable } from "./members-table"

export function MembersSection() {
  const { currentTenant, currentRole } = useAuth()

  if (!currentTenant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No active workspace</CardTitle>
          <CardDescription>
            Select a workspace from the top-right switcher.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (currentRole !== "admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Only workspace admins can manage members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert role="alert">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            <AlertTitle>Permission required</AlertTitle>
            <AlertDescription>
              Ask an admin of <strong>{currentTenant.name}</strong> to invite or
              manage members.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return <MembersTable tenantId={currentTenant.id} />
}
