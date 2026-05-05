// Fixture: SELECT with multi-line string literal (real-world useWorkItems shape).

import { createClient } from "@/lib/supabase/client"

export async function loadWithJoin() {
  const supabase = createClient()
  return supabase
    .from("work_items")
    .select(
      "id, tenant_id, title, outline_path, wbs_code, responsible:profiles!fk(name, email)"
    )
}
