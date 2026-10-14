import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import { Providers } from "@/components/wallet/providers";
import "./globals.css";

const display = Bricolage_Grotesque({ variable: "--font-display-face", subsets: ["latin"], display: "swap" });
const body = Instrument_Sans({ variable: "--font-body", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Mercado · synthetic pesos on Tempo", template: "%s · Mercado" },
  description: "Testnet prototype: create xMXN synthetic pesos backed by testnet OUSD, then send them, borrow them and pay with them on Tempo.",
};

export const viewport: Viewport = { themeColor: "#10241c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
