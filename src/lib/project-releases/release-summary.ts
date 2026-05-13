export type ReleaseStatus = "planned" | "active" | "released" | "archived"

export type ReleaseWorkItemKind = "story" | "task" | "bug"

export interface ReleaseRow {
  id: string
  project_id: string
  name: string
  start_date: string | null
  end_date: string | null
  status: ReleaseStatus
  target_milestone_id: string | null
}

export interface ReleaseSummaryWorkItem {
  id: string
  kind: ReleaseWorkItemKind | string
  parent_id: string | null
  phase_id: string | null
  milestone_id: string | null
  sprint_id: string | null
  release_id: string | null
  title: string
  status: string
  priority: string
  planned_start?: string | null
  planned_end?: string | null
  attributes?: Record<string, unknown> | null
}

export interface ReleaseSummarySprint {
  id: string
  name: string
  state: string
  start_date: string | null
  end_date: string | null
}

export interface ReleaseSummaryPhase {
  id: string
  name: string
  planned_start: string | null
  planned_end: string | null
  status?: string | null
}

export interface ReleaseSummaryMilestone {
  id: string
  name: string
  target_date: string | null
  status?: string | null
  phase_id?: string | null
}

export type ReleaseDateSource =
  | "work_item"
  | "sprint"
  | "parent_story"
  | "unscheduled"

export interface ReleaseTimelineItem extends ReleaseSummaryWorkItem {
  timeline_start: string | null
  timeline_end: string | null
  date_source: ReleaseDateSource
  parent_story_id: string | null
  outside_release_window: boolean
  overdue: boolean
  blocked: boolean
  critical: boolean
}

export interface ReleaseSprintContribution {
  sprint_id: string
  name: string
  state: string
  start_date: string | null
  end_date: string | null
  item_count: number
  done_count: number
  blocked_count: number
}

export interface ReleaseHealthSummary {
  total_items: number
  done_items: number
  blocked_items: number
  critical_items: number
  outside_window_items: number
  overdue_items: number
  unscheduled_items: number
  contributing_sprints: number
}

export interface BuildReleaseSummaryInput {
  release: ReleaseRow
  workItems: ReleaseSummaryWorkItem[]
  sprints: ReleaseSummarySprint[]
  phases?: ReleaseSummaryPhase[]
  milestones?: ReleaseSummaryMilestone[]
  today?: string
}

export interface ReleaseSummary {
  release: ReleaseRow
  health: ReleaseHealthSummary
  items: ReleaseTimelineItem[]
  sprint_contributions: ReleaseSprintContribution[]
  phases: ReleaseSummaryPhase[]
  milestones: ReleaseSummaryMilestone[]
}

interface DateRange {
  start: string
  end: string
  source: ReleaseDateSource
  parentStoryId: string | null
}

const RELEASE_ITEM_KINDS = new Set(["story", "task", "bug"])

function hasDateRange(start: string | null | undefined, end: string | null | undefined) {
  return Boolean(start && end)
}

function ownDateRange(item: ReleaseSummaryWorkItem): DateRange | null {
  if (!hasDateRange(item.planned_start, item.planned_end)) return null
  return {
    start: item.planned_start as string,
    end: item.planned_end as string,
    source: "work_item",
    parentStoryId: null,
  }
}

function sprintDateRange(
  item: ReleaseSummaryWorkItem,
  sprintsById: Map<string, ReleaseSummarySprint>
): DateRange | null {
  if (!item.sprint_id) return null
  const sprint = sprintsById.get(item.sprint_id)
  if (!sprint || !hasDateRange(sprint.start_date, sprint.end_date)) return null
  return {
    start: sprint.start_date as string,
    end: sprint.end_date as string,
    source: "sprint",
    parentStoryId: null,
  }
}

function directStoryRange(
  story: ReleaseSummaryWorkItem,
  sprintsById: Map<string, ReleaseSummarySprint>
): DateRange | null {
  return ownDateRange(story) ?? sprintDateRange(story, sprintsById)
}

function resolveDateRange(
  item: ReleaseSummaryWorkItem,
  itemsById: Map<string, ReleaseSummaryWorkItem>,
  sprintsById: Map<string, ReleaseSummarySprint>
): DateRange | null {
  const direct = ownDateRange(item) ?? sprintDateRange(item, sprintsById)
  if (direct) return direct

  if (!item.parent_id || item.kind === "story") return null
  const parent = itemsById.get(item.parent_id)
  if (!parent || parent.kind !== "story") return null
  const parentRange = directStoryRange(parent, sprintsById)
  if (!parentRange) return null
  return {
    start: parentRange.start,
    end: parentRange.end,
    source: "parent_story",
    parentStoryId: parent.id,
  }
}

function isReleaseScopedItem(
  item: ReleaseSummaryWorkItem,
  releaseId: string,
  releaseStoryIds: Set<string>
): boolean {
  if (!RELEASE_ITEM_KINDS.has(item.kind)) return false
  if (item.release_id === releaseId) return true
  return (
    (item.kind === "task" || item.kind === "bug") &&
    item.parent_id != null &&
    releaseStoryIds.has(item.parent_id)
  )
}

function isOutsideReleaseWindow(
  release: ReleaseRow,
  start: string | null,
  end: string | null
): boolean {
  if (!start || !end) return false
  if (release.start_date && start < release.start_date) return true
  if (release.end_date && end > release.end_date) return true
  return false
}

function isOverdue(
  item: ReleaseSummaryWorkItem,
  end: string | null,
  today: string
): boolean {
  if (!end) return false
  if (item.status === "done" || item.status === "cancelled") return false
  return end < today
}

function sprintContributionComparator(
  a: ReleaseSprintContribution,
  b: ReleaseSprintContribution
) {
  const aDate = a.start_date ?? "9999-12-31"
  const bDate = b.start_date ?? "9999-12-31"
  if (aDate !== bDate) return aDate.localeCompare(bDate)
  return a.name.localeCompare(b.name)
}

export function filterReleaseScopeItems(
  workItems: ReleaseSummaryWorkItem[],
  releaseId: string
): ReleaseSummaryWorkItem[] {
  const releaseStoryIds = new Set(
    workItems
      .filter((item) => item.release_id === releaseId && item.kind === "story")
      .map((item) => item.id)
  )
  return workItems.filter((item) =>
    isReleaseScopedItem(item, releaseId, releaseStoryIds)
  )
}

export function buildReleaseSummary({
  release,
  workItems,
  sprints,
  phases = [],
  milestones = [],
  today = new Date().toISOString().slice(0, 10),
}: BuildReleaseSummaryInput): ReleaseSummary {
  const scopedItems = filterReleaseScopeItems(workItems, release.id)
  const itemsById = new Map(workItems.map((item) => [item.id, item]))
  const sprintsById = new Map(sprints.map((sprint) => [sprint.id, sprint]))

  const items: ReleaseTimelineItem[] = scopedItems.map((item) => {
    const range = resolveDateRange(item, itemsById, sprintsById)
    const timelineStart = range?.start ?? null
    const timelineEnd = range?.end ?? null
    return {
      ...item,
      timeline_start: timelineStart,
      timeline_end: timelineEnd,
      date_source: range?.source ?? "unscheduled",
      parent_story_id: range?.parentStoryId ?? null,
      outside_release_window: isOutsideReleaseWindow(
        release,
        timelineStart,
        timelineEnd
      ),
      overdue: isOverdue(item, timelineEnd, today),
      blocked: item.status === "blocked",
      critical: item.priority === "critical",
    }
  })

  const contributionMap = new Map<string, ReleaseSprintContribution>()
  for (const item of items) {
    if (!item.sprint_id) continue
    const sprint = sprintsById.get(item.sprint_id)
    if (!sprint) continue
    const current =
      contributionMap.get(sprint.id) ??
      ({
        sprint_id: sprint.id,
        name: sprint.name,
        state: sprint.state,
        start_date: sprint.start_date,
        end_date: sprint.end_date,
        item_count: 0,
        done_count: 0,
        blocked_count: 0,
      } satisfies ReleaseSprintContribution)
    current.item_count += 1
    if (item.status === "done") current.done_count += 1
    if (item.status === "blocked") current.blocked_count += 1
    contributionMap.set(sprint.id, current)
  }

  const sprintContributions = Array.from(contributionMap.values()).sort(
    sprintContributionComparator
  )

  const health: ReleaseHealthSummary = {
    total_items: items.length,
    done_items: items.filter((item) => item.status === "done").length,
    blocked_items: items.filter((item) => item.blocked).length,
    critical_items: items.filter((item) => item.critical).length,
    outside_window_items: items.filter((item) => item.outside_release_window)
      .length,
    overdue_items: items.filter((item) => item.overdue).length,
    unscheduled_items: items.filter((item) => item.date_source === "unscheduled")
      .length,
    contributing_sprints: sprintContributions.length,
  }

  return {
    release,
    health,
    items,
    sprint_contributions: sprintContributions,
    phases,
    milestones,
  }
}
