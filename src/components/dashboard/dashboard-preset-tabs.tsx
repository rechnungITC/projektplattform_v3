"use client"

import { CheckSquare, Compass, Inbox } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DASHBOARD_PRESETS,
  DASHBOARD_PRESET_LABELS,
  type DashboardPreset,
} from "@/types/dashboard"

interface DashboardPresetTabsProps {
  value: DashboardPreset
  onChange: (next: DashboardPreset) => void
}

const PRESET_ICON: Record<DashboardPreset, typeof Inbox> = {
  my_work: Inbox,
  project_health: Compass,
  approvals: CheckSquare,
}

/**
 * PROJ-64 AC-7 — keyboard-accessible preset switcher.
 *
 * Built on top of shadcn `Tabs` so we get arrow-key + Home/End
 * navigation out of the box. The visible sections downstream
 * adapt to the selected preset.
 */
export function DashboardPresetTabs({
  value,
  onChange,
}: DashboardPresetTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as DashboardPreset)}
      className="w-full"
    >
      <TabsList className="w-full max-w-2xl">
        {DASHBOARD_PRESETS.map((preset) => {
          const Icon = PRESET_ICON[preset]
          return (
            <TabsTrigger key={preset} value={preset} className="flex-1 gap-2">
              <Icon className="h-4 w-4" aria-hidden />
              <span>{DASHBOARD_PRESET_LABELS[preset]}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
