"use client";
import { useBlockNumber, useConnection } from "wagmi";
import { TEMPO_MODERATO_CHAIN_ID } from "@mercado/shared";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function NetworkBadge({ className }: { className?: string }) {
  const { chainId, isConnected } = useConnection();
  const block = useBlockNumber({ chainId: TEMPO_MODERATO_CHAIN_ID, watch: true, query: { refetchInterval: 4_000 } });
  const wrong = isConnected && chainId !== undefined && chainId !== TEMPO_MODERATO_CHAIN_ID;
  const live = block.data !== undefined && !block.isError;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium tabular",
            wrong ? "border-destructive/40 bg-destructive/5 text-destructive" : "bg-card",
            className,
          )}
        >
          <span className={cn("size-2 rounded-full", wrong ? "bg-destructive" : live ? "bg-success" : "bg-muted-foreground/40")} />
          {wrong ? "Wrong network" : "Tempo Moderato"}
          <span className="text-muted-foreground">{TEMPO_MODERATO_CHAIN_ID}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {live ? `Testnet, block ${block.data?.toLocaleString("en-US")}` : block.isError ? "RPC unreachable" : "Connecting to Moderato…"}
      </TooltipContent>
    </Tooltip>
  );
}
