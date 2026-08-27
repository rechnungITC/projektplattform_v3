/**
 * PROJ-151-α — Nachricht senden und Antwort erzeugen. Der Kern der Slice.
 *
 * Ablauf: Frage speichern → Kontext sammeln (nur was V3 ohnehin weiß, Lock L6)
 * → Router (erbt Klassifizierung, Class-3-Tor, Kostendeckel, `reason_code`)
 * → Antwort speichern.
 *
 * Die Frage wird VOR dem Anbieteraufruf gespeichert. Schlägt er fehl, bleibt
 * sie erhalten und ist wiederholbar (Edge Case 4) — andersherum wäre die
 * Eingabe des Nutzers bei jedem Anbieterfehler verloren.
 *
 * Bei leerer Antwort wird KEIN Ersatztext erfunden: der Grund steht im
 * `reason_code` (AC-151.11). Eine ausgedachte Gesprächsantwort wäre von einer
 * echten nicht zu unterscheiden.
 */

import { NextResponse } from "next/server"
import { z } from "zod"

import {
  apiError,
  getAuthenticatedUserId,
  requireProjectAccess,
} from "@/app/api/_lib/route-helpers"
import { collectProjectChatContext } from "@/lib/ai/project-chat-context"
import { invokeProjectChat } from "@/lib/ai/router"
import { requireModuleActive } from "@/lib/tenant-settings/server"
import { loadProjectChatSkills } from "@/lib/ai/project-chat-skills"
import {
  contentForPersistence,
  resolveChatRetention,
} from "@/lib/ai/chat-retention"


/**
 * PROJ-152 — Zeitbudget der Funktion.
 *
 * Ohne diesen Wert gilt die Next.js-Voreinstellung, und die liegt unter dem
 * Provider-Budget aus `provider-timeout.ts` (240 s fuer lokale Modelle).
 * Die Funktion waere dann tot, bevor der Provider aufgibt — der Lauf bliebe
 * auf `running` stehen und der Nutzer bekaeme nie einen Grund zu sehen.
 * 300 s ist das Maximum des Vercel-Pro-Plans dieses Projekts.
 */
export const maxDuration = 300
const SendSchema = z.object({
  content: z.string().trim().min(1).max(8000),
})

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id: projectId, cid } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(cid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const gate = await requireModuleActive(supabase, access.project.tenant_id, "ai_chat")
  if (gate) return gate

  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, token_input, token_output, created_at")
    .eq("conversation_id", cid)
    .order("created_at", { ascending: true })

  if (error) return apiError("internal_error", error.message, 500)
  return NextResponse.json({ messages: data ?? [] })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; cid: string }> },
) {
  const { id: projectId, cid } = await context.params
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(cid).success
  ) {
    return apiError("validation_error", "Invalid id.", 400)
  }
  const { userId, supabase } = await getAuthenticatedUserId()
  if (!userId) return apiError("unauthorized", "Not signed in.", 401)

  const access = await requireProjectAccess(supabase, projectId, userId, "view")
  if (access.error) return access.error
  const gate = await requireModuleActive(supabase, access.project.tenant_id, "ai_chat", {
    intent: "write",
  })
  if (gate) return gate

  const parsed = SendSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return apiError("validation_error", "Invalid body.", 422)
  }

  // Gehört die Unterhaltung zu diesem Projekt? Ohne diese Prüfung wäre die
  // Adresse dekorativ und eine Nachricht könnte über die URL eines fremden
  // Projekts landen (derselbe Fund wie in PROJ-45-β).
  const { data: conversation } = await supabase
    .from("ai_chat_conversations")
    .select("id, project_id")
    .eq("id", cid)
    .maybeSingle()
  if (!conversation || conversation.project_id !== projectId) {
    return apiError("not_found", "Conversation not found.", 404)
  }

  const tenantId = access.project.tenant_id

  // Eigene Aufbewahrungs-Einstellung (Q2/AC-151H.4) — NICHT die des
  // Assistenten: alle Mandanten stehen dort auf "nur Metadaten", der Verlauf
  // wäre sonst am ersten Tag leer.
  const { data: settingsRow } = await supabase
    .from("tenant_settings")
    .select("ai_chat_settings")
    .eq("tenant_id", tenantId)
    .maybeSingle()
  const retention = resolveChatRetention(settingsRow)

  // Der Anbieter bekommt IMMER den vollen Text — die Einstellung regelt, was
  // gespeichert wird, nicht was gefragt werden darf.
  const storedQuestion = contentForPersistence(parsed.data.content, retention)

  const { error: insertError } = await supabase.from("ai_chat_messages").insert({
    conversation_id: cid,
    tenant_id: tenantId,
    user_id: userId,
    role: "user",
    content: storedQuestion ?? "",
  })
  if (insertError) return apiError("internal_error", insertError.message, 500)

  const { data: historyRows } = await supabase
    .from("ai_chat_messages")
    .select("role, content")
    .eq("conversation_id", cid)
    .order("created_at", { ascending: true })

  const history = (historyRows ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }))

  // Bei `none` steht in der Datenbank nichts — die aktuelle Frage muss dann
  // trotzdem in den Kontext, sonst antwortet das Modell auf eine leere Zeile.
  if (retention === "none") {
    history.push({ role: "user", content: parsed.data.content })
  }

  const skills = await loadProjectChatSkills(supabase, tenantId, projectId)
  const chatContext = await collectProjectChatContext(
    supabase,
    projectId,
    history,
    skills,
  )
  if (!chatContext) return apiError("not_found", "Project not found.", 404)

  const result = await invokeProjectChat({
    supabase,
    tenantId,
    projectId,
    actorUserId: userId,
    context: chatContext,
  })

  // Auch eine leere Antwort wird gespeichert: der Verlauf soll zeigen, dass
  // gefragt wurde und was dabei herauskam — der Grund steht daneben.
  const { data: answer, error: answerError } = await supabase
    .from("ai_chat_messages")
    .insert({
      conversation_id: cid,
      tenant_id: tenantId,
      user_id: userId,
      role: "assistant",
      content: contentForPersistence(result.text, retention) ?? "",
      token_input: result.token_input,
      token_output: result.token_output,
      ki_run_id: result.run_id,
    })
    .select("id, role, content, token_input, token_output, created_at")
    .single()

  if (answerError) return apiError("internal_error", answerError.message, 500)

  return NextResponse.json({
    message: answer,
    status: result.status,
    reason_code: result.reason_code,
    provider: result.provider,
    skills_applied: chatContext.skill_names,
    context_truncated: chatContext.history_truncated,
    // Die Fläche muss es SAGEN können — ein still leerer Verlauf sähe aus wie
    // ein Fehler (AC-151H.4).
    history_retention: retention,
    // Bei `none` ist der gespeicherte Text leer; die Antwort steht trotzdem
    // hier, damit sie einmal angezeigt werden kann.
    answer_text: result.text,
  })
}
