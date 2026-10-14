// Shared viem public client for server-side reads on Tempo Moderato.
import { createPublicClient, http, type PublicClient } from "viem";
import { tempoModerato } from "@mercado/shared";
import { env } from "./env";

let client: PublicClient | undefined;

export function publicClient(): PublicClient {
  client ??= createPublicClient({
    chain: tempoModerato,
    transport: http(env("TEMPO_RPC_URL") ?? tempoModerato.rpcUrls.default.http[0]),
  }) as PublicClient;
  return client;
}
