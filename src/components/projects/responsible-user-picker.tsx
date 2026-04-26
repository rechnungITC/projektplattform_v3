"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTenantMembers } from "@/hooks/use-tenant-members"

interface ResponsibleUserPickerProps {
  tenantId: string
  value: string | undefined
  onChange: (userId: string) => void
  /** When true, includes an "All members" option whose value maps to onChange("") */
  includeAllOption?: boolean
  /** Disable the picker (e.g. while submitting). */
  disabled?: boolean
  /** Placeholder text when no value is selected. */
  placeholder?: string
  /** Forwarded to the SelectTrigger for layout/sizing tweaks. */
  className?: string
  id?: string
  ariaLabel?: string
}

const ALL_VALUE = "__all__"

/**
 * Lets the caller pick a tenant member as the responsible user for a project.
 * Reuses `useTenantMembers` so the dropdown reflects the same source as the
 * Settings → Members table.
 */
export function ResponsibleUserPicker({
  tenantId,
  value,
  onChange,
  includeAllOption = false,
  disabled = false,
  placeholder = "Select a member",
  className,
  id,
  ariaLabel,
}: ResponsibleUserPickerProps) {
  const { members, loading } = useTenantMembers(tenantId)

  const selectValue = (() => {
    if (includeAllOption && (value === undefined || value === "")) {
      return ALL_VALUE
    }
    return value ?? undefined
  })()

  const handleValueChange = (next: string) => {
    if (next === ALL_VALUE) {
      onChange("")
      return
    }
    onChange(next)
  }

  return (
    <Select
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled || loading}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={loading ? "Loading members…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAllOption && (
          <SelectItem value={ALL_VALUE}>All members</SelectItem>
        )}
        {members.length === 0 && !loading && !includeAllOption ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No members in this workspace yet.
          </div>
        ) : null}
        {members.map((member) => (
          <SelectItem key={member.user_id} value={member.user_id}>
            {member.display_name ?? member.email.split("@")[0] ?? "Member"}
            <span className="ml-2 text-xs text-muted-foreground">
              {member.email}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
