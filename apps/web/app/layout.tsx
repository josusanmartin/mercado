import type { Metadata, Viewport } from "next";
import { Archivo_Black, Inter_Tight } from "next/font/google";
import { Providers } from "@/components/wallet/providers";
import { ThemeProvider, ThemeScript } from "@/components/console/theme";
import "./globals.css";

const body = Inter_Tight({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const display = Archivo_Black({ variable: "--font-display-face", subsets: ["latin"], weight: "400", display: "swap" });

const DESCRIPTION =
  "A plug-and-play financial system for emerging markets on Tempo: one local stablecoin to mint, send, borrow, spend and save. Mexico first, live on Tempo testnet.";

// Link previews (Twitter launch): app/opengraph-image.png + twitter-image.png need an absolute base URL.
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100",
  ),
  title: { default: "Mercado · a parallel financial system on Tempo", template: "%s · Mercado" },
  description: DESCRIPTION,
  openGraph: { title: "Mercado", description: DESCRIPTION, siteName: "Mercado", type: "website" },
  twitter: { card: "summary_large_image", title: "Mercado", description: DESCRIPTION },
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
