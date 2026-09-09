import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MOTION IS IN THE BASE, VARIANTS ONLY CHOOSE PAINT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The lift and the icon nudge live in the base string so every variant gets them and
 * none can forget. `motion-reduce:` cancels both — the button still changes colour on
 * hover, so the affordance survives without the movement, which is what reduced motion
 * asks for rather than a button that stops responding.
 *
 * The nudge targets `svg:last-child` deliberately: a TRAILING icon is an arrow saying
 * "onward" and moving it reinforces that, whereas a LEADING icon labels the action and
 * sliding it just looks loose. A button with one leading icon has that icon as
 * `:last-child` only when there is no text, i.e. an icon button, where the transform is
 * suppressed by `size-*` having no room to matter.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all duration-(--duration-fast) outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-(--duration-fast) [&_svg:not([class*='size-'])]:size-4 hover:[&_svg:last-child]:translate-x-0.5 motion-reduce:hover:translate-y-0 motion-reduce:hover:[&_svg:last-child]:translate-x-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:-translate-y-px hover:shadow-sm",
        /**
         * The expressive call to action. Reserved for the ONE primary action on a
         * surface — a page where three buttons all glow has no primary action at all.
         */
        gradient:
          "bg-linear-to-r from-brand-600 to-emerald-600 text-primary-foreground shadow-sm hover:-translate-y-px hover:from-brand-500 hover:to-emerald-500 hover:shadow-md dark:from-brand-500 dark:to-emerald-500",
        /** Translucent secondary, for a gradient button's companion. */
        glass:
          "border border-border-glass bg-surface-glass text-foreground shadow-xs backdrop-blur-glass hover:-translate-y-px hover:bg-surface-glass-strong hover:shadow-sm",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground hover:-translate-y-px dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-px",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
