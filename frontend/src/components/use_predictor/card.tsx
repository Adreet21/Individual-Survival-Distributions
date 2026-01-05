/**
 * Card Component Suite
 * 
 * A collection of card components for creating contained content sections.
 * Provides consistent styling for headers, content, and footers.
 * Part of the shadcn/ui component library adapted for this project.
 */

import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * Card - Main container component
 * 
 * Creates a bordered, rounded container with shadow for grouped content.
 * Use as the parent wrapper for card content.
 * 
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Title</CardTitle>
 *   </CardHeader>
 *   <CardContent>Content goes here</CardContent>
 * </Card>
 * ```
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/**
 * CardHeader - Header section of a card
 * 
 * Container for card title and description at the top of the card.
 * Automatically includes proper spacing for child elements.
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/**
 * CardTitle - Main heading for a card
 * 
 * Renders as an h3 element with consistent typography for card titles.
 * Typically used inside CardHeader.
 * 
 * @example
 * ```tsx
 * <CardHeader>
 *   <CardTitle>My Card Title</CardTitle>
 *   <CardDescription>Optional description</CardDescription>
 * </CardHeader>
 * ```
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

/**
 * CardDescription - Descriptive text for a card
 * 
 * Renders muted text below the card title for additional context.
 * Typically used inside CardHeader after CardTitle.
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

/**
 * CardContent - Main content area of a card
 * 
 * Container for the primary card content. Includes padding but no top padding
 * to properly space with CardHeader.
 * 
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Settings</CardTitle>
 *   </CardHeader>
 *   <CardContent>
 *     <form>...</form>
 *   </CardContent>
 * </Card>
 * ```
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

/**
 * CardFooter - Footer section of a card
 * 
 * Container for actions or additional information at the bottom of the card.
 * Typically contains buttons or links.
 * 
 * @example
 * ```tsx
 * <Card>
 *   <CardContent>...</CardContent>
 *   <CardFooter>
 *     <Button>Save</Button>
 *     <Button variant="outline">Cancel</Button>
 *   </CardFooter>
 * </Card>
 * ```
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
