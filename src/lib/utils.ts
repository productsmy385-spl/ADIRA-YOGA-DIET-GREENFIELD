import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names, resolving Tailwind conflicts so the last utility wins.
 * The convention shadcn/ui components are written against.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
