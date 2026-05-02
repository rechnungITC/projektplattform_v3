"use client"

import { Building2, User } from "lucide-react"
import * as React from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { Stakeholder } from "@/types/stakeholder"

/**
 * PROJ-31 — Multi-select for approver-eligible stakeholders.
 *
 * Splits the pool visually into "Intern (Plattform-Account)" and
 * "Extern (Magic-Link)" so the PM understands the consequence: extern
 * means an email goes out with a token-link.
 */

interface ApproverSelectorProps {
  /** Pre-filtered to stakeholders with is_approver=true. */
  stakeholders: Stakeholder[]
  /** Selected stakeholder ids (controlled). */
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

/** Stakeholder is internal when a platform user is linked. */
function isInternal(s: Stakeholder): boolean {
  return Boolean(s.linked_user_id)
}

export function ApproverSelector({
  stakeholders,
  value,
  onChange,
  disabled,
}: ApproverSelectorProps) {
  const internal = stakeholders.filter(isInternal)
  const external = stakeholders.filter((s) => !isInternal(s))

  const toggle = (id: string) => {
    if (disabled) return
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  if (stakeholders.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          Keine Stakeholder mit Genehmigungs-Berechtigung vorhanden. Setze das
          Feld <em>Genehmigungs-Berechtigung</em> auf relevanten Stakeholdern,
          dann erscheinen sie hier.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-3">
      <ScrollArea className="h-56 rounded-md border">
        <div className="p-3 space-y-3">
          {internal.length > 0 && (
            <Section
              icon={<User className="h-3.5 w-3.5" aria-hidden />}
              title="Intern (Plattform-Account)"
              description="Sieht offene Genehmigungen im Dashboard."
            >
              {internal.map((s) => (
                <ApproverRow
                  key={s.id}
                  stakeholder={s}
                  checked={value.includes(s.id)}
                  onToggle={() => toggle(s.id)}
                  disabled={disabled}
                />
              ))}
            </Section>
          )}

          {internal.length > 0 && external.length > 0 && <Separator />}

          {external.length > 0 && (
            <Section
              icon={<Building2 className="h-3.5 w-3.5" aria-hidden />}
              title="Extern (Magic-Link per Email)"
              description="Bekommt einen 7 Tage gültigen Link per Email."
            >
              {external.map((s) => (
                <ApproverRow
                  key={s.id}
                  stakeholder={s}
                  checked={value.includes(s.id)}
                  onToggle={() => toggle(s.id)}
                  disabled={disabled}
                />
              ))}
            </Section>
          )}
        </div>
      </ScrollArea>
      <p className="text-xs text-muted-foreground">
        {value.length} {value.length === 1 ? "Approver" : "Approver"} ausgewählt
      </p>
    </div>
  )
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ApproverRow({
  stakeholder,
  checked,
  onToggle,
  disabled,
}: {
  stakeholder: Stakeholder
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const id = `approver-${stakeholder.id}`
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        <span>{stakeholder.name}</span>
        {stakeholder.role_key && (
          <span className="text-muted-foreground"> · {stakeholder.role_key}</span>
        )}
      </Label>
    </div>
  )
}
