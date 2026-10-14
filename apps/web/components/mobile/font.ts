// In-phone faces (crew/PRINCIPLES.md): Archivo Black for display, Inter Tight for everything else.
// Loaded only where .m-root renders (PhoneFrame).
import { Archivo_Black, Inter_Tight } from "next/font/google";

export const phoneFont = Inter_Tight({ variable: "--font-phone", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
export const phoneDisplay = Archivo_Black({ variable: "--font-phone-display", subsets: ["latin"], weight: "400", display: "swap" });
