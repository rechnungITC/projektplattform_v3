// Fixture: static SELECT — should be detected as table=work_items, columns=id,title.
// Tests assert the walker resolves both .from() and .select() string-literals.

import { createClient } from "@/lib/supabase/client"

export async function loadWorkItems() {
  const supabase = createClient()
  return supabase.from("work_items").select("id, title")
}
