import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The public source repo (josu 19:30: linked from the site for the Twitter launch). */
export const SOURCE_URL = "https://github.com/josusanmartin/mercado";
