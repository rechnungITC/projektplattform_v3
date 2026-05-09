"use client"

/**
 * PROJ-62 — Auth-aware wrapper around OrganizationPageClient.
 *
 * Resolves canEdit from the user's tenant role (only `admin` can write
 * in V1; the spec leaves a hook for a future `org_admin` role). The
 * actual API will enforce this server-side regardless.
 */

import { OrganizationPageClient } from "@/components/organization/organization-page-client"
import { useAuth } from "@/hooks/use-auth"

export function OrganizationPageClientWrapper() {
  const { currentRole } = useAuth()
  const canEdit = currentRole === "admin"
  return <OrganizationPageClient canEdit={canEdit} />
}
