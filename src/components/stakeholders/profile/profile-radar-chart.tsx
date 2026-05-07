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
  // PROJ-51-γ.5 — bound to theme chart tokens. Callers can still override
  // explicitly. fremd = primary trend (chart-1), self = secondary contrast
  // line (chart-2). Both adapt per Light/Dark/Dark-Teal automatically.
  fremdColor = "hsl(var(--chart-1))",
  selfColor = "hsl(var(--chart-2))",
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
      <ResponsiveContainer width="100%" height={520}>
        <RadarChart
          data={chartData}
          margin={{ top: 40, right: 100, bottom: 40, left: 100 }}
          outerRadius="78%"
        >
          <PolarGrid />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fontSize: 13, fill: "currentColor" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 10 }}
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
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
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
