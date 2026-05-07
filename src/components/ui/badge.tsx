import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // PROJ-51-γ — semantic status variants. Pattern:
        //   bg-{token}/10 text-{token} border-{token}/20
        // matches docs/design/design-system.md "status badge" example.
        success:
          "bg-success/10 text-success border-success/20 hover:bg-success/15",
        warning:
          "bg-warning/10 text-warning border-warning/20 hover:bg-warning/15",
        info: "bg-info/10 text-info border-info/20 hover:bg-info/15",
        "risk-low":
          "bg-risk-low/10 text-risk-low border-risk-low/20 hover:bg-risk-low/15",
        "risk-medium":
          "bg-risk-medium/10 text-risk-medium border-risk-medium/20 hover:bg-risk-medium/15",
        "risk-high":
          "bg-risk-high/10 text-risk-high border-risk-high/20 hover:bg-risk-high/15",
        "risk-critical":
          "bg-risk-critical/10 text-risk-critical border-risk-critical/20 hover:bg-risk-critical/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
