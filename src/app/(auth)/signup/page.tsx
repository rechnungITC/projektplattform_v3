import type { Metadata } from "next"

import { SignupForm } from "./signup-form"

export const metadata: Metadata = {
  title: "Konto anlegen · Projektplattform",
}

export default function SignupPage() {
  return <SignupForm />
}
