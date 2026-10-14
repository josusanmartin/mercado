"use client";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/tempo/config";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 4_000 } } }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster position="bottom-left" />
        </TooltipProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
