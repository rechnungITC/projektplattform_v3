/**
 * PROJ-31 follow-up — daily approval-deadline cron.
 *
 * Two passes in one invocation:
 *
 *   1. Reminder pass — for every `decision_approval_state` row where
 *      `status = 'pending'`, `deadline_at` is set, and the deadline is
 *      within REMINDER_WINDOW_DAYS, queue a Communication-Outbox row
 *      to the responsible PM. `last_reminder_at` is updated so we don't
 *      re-send the same reminder on subsequent ticks.
 *
 *   2. Expiry pass — for every row where `deadline_at` < now() and the
 *      status is still `pending`, flip status to `'expired'`, write a
 *      `deadline_expired` audit event, and queue an outbox notification.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We reject
 * anything else. Service-role client used because the cron has no user
 * session — RLS would otherwise hide the rows.
 */

import { NextResponse } from "next/server"

import { apiError } from "@/app/api/_lib/route-helpers"
import { createAdminClient } from "@/lib/supabase/admin"

const REMINDER_WINDOW_DAYS = 3
const REMINDER_MIN_GAP_HOURS = 20 // don't re-send within 20h of last_reminder_at

interface PendingRow {
  decision_id: string
  tenant_id: string
  deadline_at: string | null
  submitted_at: string | null
  last_reminder_at: string | null
  status: string
  decisions: {
    title: string
    project_id: string
    is_revised: boolean
    projects?: {
      name?: string
      responsible_user_id?: string | null
    } | null
  } | null
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return apiError(
      "configuration_error",
      "CRON_SECRET is not set on the server.",
      500,
    )
  }
  const authHeader = request.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${expected}`) {
    return apiError("unauthorized", "Invalid or missing cron secret.", 401)
  }

  const supabase = createAdminClient()
  const now = new Date()
  const reminderHorizon = new Date(
    now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const reminderGap = new Date(
    now.getTime() - REMINDER_MIN_GAP_HOURS * 60 * 60 * 1000,
  ).toISOString()

  // Fetch all pending rows whose deadline is set. We split into reminder-
  // window and overdue in JS to keep the SQL simple.
  const { data: rows, error } = await supabase
    .from("decision_approval_state")
    .select(
      "decision_id, tenant_id, deadline_at, submitted_at, last_reminder_at, status, " +
        "decisions!inner(title, project_id, is_revised, " +
        "projects!inner(name, responsible_user_id))",
    )
    .eq("status", "pending")
    .not("deadline_at", "is", null)
    .lte("deadline_at", reminderHorizon)

  if (error) return apiError("internal_error", error.message, 500)

  const safeRows = (rows ?? []) as unknown as PendingRow[]
  let remindersSent = 0
  let expired = 0
  const errors: string[] = []

  for (const row of safeRows) {
    if (!row.decisions || row.decisions.is_revised) continue
    const deadline = row.deadline_at ? new Date(row.deadline_at) : null
    if (!deadline) continue

    const isOverdue = deadline.getTime() < now.getTime()
    const project = row.decisions.projects
    const projectName = project?.name ?? "Projekt"
    const responsibleUserId = project?.responsible_user_id ?? null

    if (isOverdue) {
      // ----- Expiry pass -----
      const { error: updErr } = await supabase
        .from("decision_approval_state")
        .update({
          status: "expired",
          decided_at: deadline.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("decision_id", row.decision_id)
        .eq("status", "pending") // race-safe: skip if someone else already moved it
      if (updErr) {
        errors.push(`expire ${row.decision_id}: ${updErr.message}`)
        continue
      }

      await supabase.from("decision_approval_events").insert({
        decision_id: row.decision_id,
        event_type: "deadline_expired",
        payload: {
          deadline_at: deadline.toISOString(),
          source: "proj31_cron_approval_reminders",
        },
      })

      if (responsibleUserId) {
        await supabase.from("communication_outbox").insert({
          tenant_id: row.tenant_id,
          project_id: row.decisions.project_id,
          channel: "internal",
          recipient: responsibleUserId,
          subject: `Decision "${row.decisions.title}" — Frist abgelaufen`,
          body:
            `Die Genehmigungsfrist für die Decision "${row.decisions.title}" (${projectName}) ist abgelaufen.\n` +
            `Die Decision wurde automatisch auf Status "Frist abgelaufen" gesetzt.\n\n` +
            `Nächste Schritte: Decision überarbeiten und neue Revision einreichen, oder zurückziehen.`,
          metadata: {
            decision_id: row.decision_id,
            source: "proj31_deadline_expired",
          },
          status: "queued",
          created_by: responsibleUserId,
        })
      }
      expired++
      continue
    }

    // ----- Reminder pass -----
    const lastSentAt = row.last_reminder_at
      ? new Date(row.last_reminder_at).toISOString()
      : null
    if (lastSentAt && lastSentAt >= reminderGap) {
      // Within the gap — skip silently.
      continue
    }

    if (responsibleUserId) {
      const daysLeft = Math.ceil(
        (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      await supabase.from("communication_outbox").insert({
        tenant_id: row.tenant_id,
        project_id: row.decisions.project_id,
        channel: "internal",
        recipient: responsibleUserId,
        subject: `Frist-Erinnerung: Decision "${row.decisions.title}" — ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"} verbleiben`,
        body:
          `Die Genehmigungsfrist für die Decision "${row.decisions.title}" (${projectName}) läuft am ${deadline.toLocaleDateString("de-DE")} ab.\n` +
          `Verbleibende Tage: ${daysLeft}.\n\n` +
          `Falls noch nicht alle Approver geantwortet haben, erinnern Sie diese bitte oder verlängern Sie die Frist.`,
        metadata: {
          decision_id: row.decision_id,
          source: "proj31_deadline_reminder",
          days_left: daysLeft,
        },
        status: "queued",
        created_by: responsibleUserId,
      })
    }

    await supabase
      .from("decision_approval_state")
      .update({ last_reminder_at: now.toISOString() })
      .eq("decision_id", row.decision_id)

    await supabase.from("decision_approval_events").insert({
      decision_id: row.decision_id,
      event_type: "deadline_reminder_sent",
      payload: {
        deadline_at: deadline.toISOString(),
        source: "proj31_cron_approval_reminders",
      },
    })
    remindersSent++
  }

  return NextResponse.json({
    remindersSent,
    expired,
    inspected: safeRows.length,
    errors,
  })
}
