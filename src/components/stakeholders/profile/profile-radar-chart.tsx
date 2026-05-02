"use client"

import * as React from "react"
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

/**
 * PROJ-33 Phase 33-γ — Generic radar-chart for Skill or Big5 profiles.
 *
 * Renders 5-axis radar with optional Self-vs-Fremd overlay (two overlapping
 * polygons). When only fremd values are provided, renders a single polygon.
 */

export interface RadarPoint {
  /** Display label for the axis (e.g. "Domänenwissen"). */
  dimension: string
  /** PM-Bewertung (0-100). May be null. */
  fremd: number | null
  /** Self-Assessment (0-100). May be null until Phase δ landed. */
  self: number | null
}

interface ProfileRadarChartProps {
  data: RadarPoint[]
  /** Fremd polygon color (hex or CSS color). */
  fremdColor?: string
  /** Self polygon color. */
  selfColor?: string
  /** Hide the polygon-based legend? */
  hideLegend?: boolean
}

export function ProfileRadarChart({
  data,
  fremdColor = "var(--color-brand-600, #3b82f6)",
  selfColor = "#10b981",
  hideLegend = false,
}: ProfileRadarChartProps) {
  // Recharts data: each row is one axis with the two values normalized.
  const chartData = data.map((d) => ({
    dimension: d.dimension,
    fremd: d.fremd ?? 0,
    self: d.self ?? 0,
  }))

  const hasSelf = data.some((d) => d.self !== null)
  const hasFremd = data.some((d) => d.fremd !== null)

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={280}>
        <RadarChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 11, fill: "currentColor" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 9 }}
          />
          {hasFremd && (
            <Radar
              name="Fremd (PM)"
              dataKey="fremd"
              stroke={fremdColor}
              fill={fremdColor}
              fillOpacity={0.3}
            />
          )}
          {hasSelf && (
            <Radar
              name="Self"
              dataKey="self"
              stroke={selfColor}
              fill={selfColor}
              fillOpacity={0.2}
              strokeDasharray="4 2"
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-popover, #fff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: 6,
              fontSize: 12,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {!hideLegend && (
        <div className="flex justify-center gap-4 text-xs">
          {hasFremd && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: fremdColor, opacity: 0.6 }}
              />
              Fremd (PM)
            </span>
          )}
          {hasSelf && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm border-dashed border-2"
                style={{ borderColor: selfColor }}
              />
              Self-Assessment
            </span>
          )}
        </div>
      )}
    </div>
  )
}
