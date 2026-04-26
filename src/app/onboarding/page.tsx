import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import { OnboardingClient } from "./onboarding-client"

export const metadata: Metadata = {
  title: "Setting up your workspace · Projektplattform",
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <OnboardingClient userId={user.id} userEmail={user.email ?? ""} />
}
