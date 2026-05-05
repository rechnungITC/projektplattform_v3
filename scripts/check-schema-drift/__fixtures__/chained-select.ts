// Fixture: SELECT chained after filter methods — walker must follow the chain
// back to the from() call.
//
// Note: PostgrestQueryBuilder requires .select() before filter methods like
// .eq() / .order() at the type level. We use `as any` so the fixture compiles
// while still exercising the AST walker's chain-traversal logic.

import { createClient } from "@/lib/supabase/client"

export async function loadFilteredItems(projectId: string) {
  const supabase = createClient()
  return (supabase.from("work_items") as unknown as {
    eq: (col: string, val: string) => {
      order: (col: string) => {
        select: (cols: string) => Promise<unknown>
      }
    }
  })
    .eq("project_id", projectId)
    .order("position")
    .select("id, title, status")
}
