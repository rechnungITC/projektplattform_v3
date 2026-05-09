import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--motion-duration-base)] ease-[var(--motion-ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-focus)] focus-visible:ring-offset-2 active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none motion-reduce:transform-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-button)] hover:-translate-y-px hover:bg-primary/90 hover:shadow-[var(--shadow-button-hover)]",
        brand:
          "bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] shadow-[var(--shadow-button)] hover:-translate-y-px hover:bg-[var(--brand-primary-hover)] hover:shadow-[var(--shadow-button-hover)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-button)] hover:-translate-y-px hover:bg-destructive/90 hover:shadow-[var(--shadow-button-hover)]",
        outline:
          "border border-input bg-background hover:-translate-y-px hover:bg-accent hover:text-accent-foreground hover:shadow-[var(--shadow-button)]",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--shadow-button)] hover:-translate-y-px hover:bg-secondary/80 hover:shadow-[var(--shadow-button-hover)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
