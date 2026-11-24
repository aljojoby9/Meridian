import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, letting later classes win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
