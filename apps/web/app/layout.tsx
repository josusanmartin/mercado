import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/wallet/providers";
import { ThemeProvider, ThemeScript } from "@/components/console/theme";
import "./globals.css";

const body = Inter_Tight({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const display = Archivo_Black({ variable: "--font-display-face", subsets: ["latin"], weight: "400", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mercado · a parallel financial system on Tempo", template: "%s · Mercado" },
  description: "Testnet prototype: create xMXN synthetic pesos backed by testnet OUSD, then send them, borrow them and pay with them on Tempo.",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
