/**
 * Table Component Suite
 * 
 * Accessible table components for displaying tabular data.
 * Provides consistent styling and structure for data tables.
 * Part of the shadcn/ui component library adapted for this project.
 */

import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * Table - Main table container
 * 
 * Wraps the HTML table element with responsive overflow handling.
 * Automatically makes tables scrollable on smaller screens.
 * 
 * @example
 * ```tsx
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead>Status</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>John</TableCell>
 *       <TableCell>Active</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

/**
 * TableHeader - Table header section (thead)
 * 
 * Contains header rows with column titles.
 * Automatically includes bottom borders for header rows.
 */
const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

/**
 * TableBody - Table body section (tbody)
 * 
 * Contains the main data rows of the table.
 * Removes borders from the last row for cleaner appearance.
 */
const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

/**
 * TableFooter - Table footer section (tfoot)
 * 
 * Optional footer section for summary rows or additional information.
 * Styled with muted background and medium font weight.
 */
const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

/**
 * TableRow - Individual table row
 * 
 * Represents a single row of data in the table.
 * Includes hover effect and border styling. Supports selection state via data-state.
 * 
 * @example
 * ```tsx
 * <TableBody>
 *   <TableRow>
 *     <TableCell>Data 1</TableCell>
 *     <TableCell>Data 2</TableCell>
 *   </TableRow>
 * </TableBody>
 * ```
 */
const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

/**
 * TableHead - Table header cell
 * 
 * Used inside TableHeader to create column headers.
 * Styled with muted text color and medium font weight.
 * 
 * @example
 * ```tsx
 * <TableHeader>
 *   <TableRow>
 *     <TableHead>Column Name</TableHead>
 *     <TableHead className="text-right">Amount</TableHead>
 *   </TableRow>
 * </TableHeader>
 * ```
 */
const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

/**
 * TableCell - Table data cell
 * 
 * Contains the actual data in each row.
 * Left-aligned by default with consistent padding.
 * 
 * @example
 * ```tsx
 * <TableRow>
 *   <TableCell className="font-medium">Primary Info</TableCell>
 *   <TableCell>Secondary Info</TableCell>
 *   <TableCell className="text-right">$100.00</TableCell>
 * </TableRow>
 * ```
 */
const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
))
TableCell.displayName = "TableCell"

/**
 * TableCaption - Table caption
 * 
 * Optional descriptive text for the table, typically displayed below the table.
 * Useful for accessibility and providing context about the table data.
 * 
 * @example
 * ```tsx
 * <Table>
 *   <TableCaption>A list of recent predictions</TableCaption>
 *   <TableHeader>...</TableHeader>
 *   <TableBody>...</TableBody>
 * </Table>
 * ```
 */
const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
