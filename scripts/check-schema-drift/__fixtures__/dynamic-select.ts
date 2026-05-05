// Fixture: SELECT built from a template literal with interpolation —
// walker must flag as dynamic and skip validation.

import { createClient } from "@/lib/supabase/client"

const baseColumns = "id, title"

export async function loadDynamic() {
  const supabase = createClient()
  return supabase.from("work_items").select(`${baseColumns}, status`)
}
