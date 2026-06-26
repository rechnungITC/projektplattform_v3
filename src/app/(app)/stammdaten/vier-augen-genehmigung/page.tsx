import type { Metadata } from "next"

import { FourEyesPolicyPageClient } from "@/components/master-data/four-eyes-policy-page-client"

export const metadata: Metadata = {
  title: "4-Augen-Genehmigung · Projektplattform",
}

// PROJ-100c — tenant-admin config for the 4-eyes clearance approval gate
// (per-level policy + approver pool). The page-client is admin-gated.
export default function FourEyesPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <FourEyesPolicyPageClient />
    </div>
  )
}
