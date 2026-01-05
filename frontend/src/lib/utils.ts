/**
 * Utility Functions
 * 
 * This module provides utility functions for merging Tailwind CSS class names.
 * Used throughout the application for dynamic className construction.
 */

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines and merges CSS class names intelligently
 * 
 * This function uses clsx to combine class names and twMerge to handle
 * Tailwind CSS conflicts, ensuring that later classes override earlier ones.
 * 
 * @param inputs - Variable number of class values (strings, objects, arrays)
 * @returns Merged class string with Tailwind conflicts resolved
 * 
 * @example
 * ```tsx
 * cn("px-2 py-1", "px-4") // Returns: "py-1 px-4"
 * cn("text-red-500", isActive && "text-blue-500") // Conditionally applies classes
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
