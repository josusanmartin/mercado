import type { Metadata, Viewport } from "next";
import { Nunito_Sans } from "next/font/google";
import { Providers } from "@/components/wallet/providers";
import { ThemeProvider, ThemeScript } from "@/components/console/theme";
import "./globals.css";

const body = Nunito_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mercado · synthetic pesos on Tempo", template: "%s · Mercado" },
  description: "Testnet prototype: create xMXN synthetic pesos backed by testnet OUSD, then send them, borrow them and pay with them on Tempo.",
};

export const viewport: Viewport = { themeColor: "#ebebeb" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} h-full antialiased`} suppressHydrationWarning>
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
