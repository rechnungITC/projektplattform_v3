import { TrafficLightPill } from "./traffic-light-pill"
import {
  SNAPSHOT_KIND_LABELS,
  type SnapshotContent,
  type SnapshotKind,
} from "@/lib/reports/types"

interface SnapshotHeaderProps {
  kind: SnapshotKind
  version: number
  content: SnapshotContent
}

/**
 * Frozen header block — tenant logo + accent strip + project metadata
 * + status-light. Reused by both Status-Report and Executive-Summary
 * bodies.
 */
export function SnapshotHeader({
  kind,
  version,
  content,
}: SnapshotHeaderProps) {
  const accent = content.header.tenant_accent_color ?? "#0f172a"
  const generatedAt = new Date(content.generated_at)
  return (
    <header className="report-header relative pb-6">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 rounded-t-md"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between gap-6 pt-6">
        <div className="flex items-center gap-4">
          {content.header.tenant_logo_url ? (
            <img
              src={content.header.tenant_logo_url}
              alt={content.header.tenant_name}
              className="h-12 w-12 rounded object-contain"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {content.header.tenant_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {content.header.tenant_name} · {SNAPSHOT_KIND_LABELS[kind]} · v{version}
            </p>
            <h1 className="text-2xl font-bold leading-tight">
              {content.header.project_name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {content.header.lead_name
                ? `Lead: ${content.header.lead_name}`
                : "Lead: —"}
              {content.header.sponsor_name
                ? ` · Sponsor: ${content.header.sponsor_name}`
                : " · Sponsor: —"}
            </p>
          </div>
        </div>
        <TrafficLightPill light={content.traffic_light} size="lg" />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Erstellt am{" "}
        {generatedAt.toLocaleString("de-DE", {
          dateStyle: "long",
          timeStyle: "short",
        })}{" "}
        von {content.generated_by_name}
      </p>
    </header>
  )
}
