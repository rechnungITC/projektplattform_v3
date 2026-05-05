// Fixture: select("*") — no columns to validate.

import { createClient } from "@/lib/supabase/client"

export async function loadAll() {
  const supabase = createClient()
  return supabase.from("work_items").select("*")
}
