// Shared viem public client for server-side reads on Tempo Moderato.
import { createClient, createPublicClient, http, type Client, type PublicClient } from "viem";
import { tempoModerato } from "@mercado/shared";
import { env } from "./env";

let client: PublicClient | undefined;
let rawClient: Client | undefined;

/** The shared Moderato RPC is busy (crew + browsers): retry transient failures/429s with backoff. */
function transport() {
  return http(env("TEMPO_RPC_URL") ?? tempoModerato.rpcUrls.default.http[0], { retryCount: 6, retryDelay: 300 });
}

export function publicClient(): PublicClient {
  client ??= createPublicClient({ chain: tempoModerato, transport: transport() }) as PublicClient;
  return client;
}

/** Bare client (Tempo chain config incl. serializers) for mppx's charge verification/broadcast. */
export function rpcClient(): Client {
  rawClient ??= createClient({ chain: tempoModerato, transport: transport() });
  return rawClient;
}
