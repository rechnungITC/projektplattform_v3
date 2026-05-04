import {
  ArrowRight,
  Check,
  CircleSlash,
  HelpCircle,
  RotateCcw,
  Send,
  X,
} from "lucide-react"

import {
  type ApprovalEventType,
  type DecisionApprovalEvent,
} from "@/types/decision-approval"

const EVENT_LABELS: Record<ApprovalEventType, string> = {
  submitted_for_approval: "Zur Genehmigung eingereicht",
  approver_responded: "Approver-Antwort erhalten",
  approver_requested_info: "Approver hat Informationen angefordert",
  approver_withdrawn: "Approver hat Antwort zurückgezogen",
  quorum_reached: "Quorum erreicht — genehmigt",
  quorum_unreachable: "Quorum unmöglich — abgelehnt",
  withdrawn: "Vom PM zurückgezogen",
  revised: "Durch Revision ersetzt",
  token_renewed: "Magic-Link erneuert",
}

const EVENT_ICONS: Record<ApprovalEventType, React.ReactNode> = {
  submitted_for_approval: <Send className="h-3.5 w-3.5" aria-hidden />,
  approver_responded: <Check className="h-3.5 w-3.5" aria-hidden />,
  approver_requested_info: <HelpCircle className="h-3.5 w-3.5 text-amber-600" aria-hidden />,
  approver_withdrawn: <RotateCcw className="h-3.5 w-3.5" aria-hidden />,
  quorum_reached: <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />,
  quorum_unreachable: <X className="h-3.5 w-3.5 text-destructive" aria-hidden />,
  withdrawn: <CircleSlash className="h-3.5 w-3.5" aria-hidden />,
  revised: <ArrowRight className="h-3.5 w-3.5" aria-hidden />,
  token_renewed: <RotateCcw className="h-3.5 w-3.5" aria-hidden />,
}

interface ApprovalTrailTimelineProps {
  events: DecisionApprovalEvent[]
}

export function ApprovalTrailTimeline({ events }: ApprovalTrailTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Genehmigungs-Events.
      </p>
    )
  }

  return (
    <ol className="relative space-y-3 border-l pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[27px] mt-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
            {EVENT_ICONS[event.event_type]}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {EVENT_LABELS[event.event_type]}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString("de-DE")}
              {event.actor_label ? ` · ${event.actor_label}` : ""}
            </span>
            {(() => {
              const comment = event.payload?.comment
              if (typeof comment !== "string" || comment.length === 0) return null
              return (
                <span className="mt-1 text-xs italic text-muted-foreground">
                  „{comment}&quot;
                </span>
              )
            })()}
            {(() => {
              const response = event.payload?.response
              if (typeof response !== "string") return null
              return (
                <span className="mt-1 text-xs">
                  Antwort: <strong>{response === "approve" ? "Zugestimmt" : "Abgelehnt"}</strong>
                </span>
              )
            })()}
          </div>
        </li>
      ))}
    </ol>
  )
}
