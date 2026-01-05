/**
 * Button Component
 * 
 * A flexible and accessible button component built with Radix UI primitives.
 * Supports multiple variants (default, destructive, outline, etc.) and sizes.
 * Part of the shadcn/ui component library adapted for this project.
 */

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

/**
 * Button variant styles using class-variance-authority
 * 
 * Defines different visual styles and sizes for the button component.
 * All variants include base accessibility features like focus states.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      /** Visual style variants */
      variant: {
        /** Primary button style with solid background */
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        /** Destructive action style (typically red) */
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        /** Outlined button with border */
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        /** Secondary style with muted colors */
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        /** Transparent button that shows background on hover */
        ghost: "hover:bg-accent hover:text-accent-foreground",
        /** Link-style button with underline */
        link: "text-primary underline-offset-4 hover:underline",
      },
      /** Size variants */
      size: {
        /** Standard button size */
        default: "h-10 px-4 py-2",
        /** Smaller compact button */
        sm: "h-9 rounded-md px-3",
        /** Larger prominent button */
        lg: "h-11 rounded-md px-8",
        /** Square button for icons */
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Button component props
 * 
 * Extends standard HTML button attributes with variant and size options
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** If true, renders children in a Slot (useful for composition with other components) */
  asChild?: boolean
}

/**
 * Button Component
 * 
 * A versatile button component with multiple style variants and sizes.
 * Includes proper accessibility features and keyboard navigation support.
 * 
 * @example
 * ```tsx
 * // Default primary button
 * <Button onClick={handleClick}>Click me</Button>
 * 
 * // Destructive button for delete actions
 * <Button variant="destructive" onClick={handleDelete}>Delete</Button>
 * 
 * // Outline button with custom className
 * <Button variant="outline" className="w-full">Full Width</Button>
 * 
 * // Large button
 * <Button size="lg">Large Button</Button>
 * ```
 */
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
