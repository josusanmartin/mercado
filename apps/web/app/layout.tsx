import type { Metadata, Viewport } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import { Providers } from "@/components/wallet/providers";
import { ThemeProvider, ThemeScript } from "@/components/console/theme";
import "./globals.css";

const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const code = DM_Mono({ variable: "--font-code", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mercado · a parallel financial system on Tempo", template: "%s · Mercado" },
  description: "Testnet prototype: create xMXN synthetic pesos backed by testnet OUSD, then send them, borrow them and pay with them on Tempo.",
};

export const viewport: Viewport = { themeColor: "#f5efe4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${code.variable} h-full antialiased`} suppressHydrationWarning>
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
