"use client";
// "Built on Tempo" (lead/josu 03:20): the six Tempo primitives Mercado actually uses, each with a LIVE proof
// read from Tempo Moderato or our own API on page load (josu's wiring rule: no fixtures). Text only, no
// Tempo logo. A proof that can't be read shows "—" and still links to where it can be checked.
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContract } from "wagmi";
import { hexToBytes, parseAbiItem, type Address, type Hex } from "viem";
import { explorerAddress, explorerTx, TEMPO_EXPLORER_URL } from "@mercado/shared";
import { ADDR, CHAIN_ID, tokenAbi } from "@/lib/contracts";
import { fmtAmount, fmtNumber, shortAddr } from "@/lib/format";
import { Meta } from "@/components/console";
import { WalletDialog } from "@/components/wallet/wallet-menu";
import { probeChallenge } from "@/lib/mpp/client";

const MEMO = parseAbiItem("event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)");
const CHUNK = 50_000n; // the node's getLogs range limit

/** bytes32 memo → text, only when it is a human note (valid UTF-8, no control characters). */
function memoText(m: Hex): string | null {
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(hexToBytes(m)).replace(/\0+$/, "");
    return t && !/[\u0000-\u001f]/.test(t) ? t : null;
  } catch {
    return null;
  }
}

function useBlockTime() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tempo-block-time"],
    enabled: !!client,
    staleTime: 60_000,
    queryFn: async () => {
      const latest = await client!.getBlock();
      const N = 1000n;
      const old = await client!.getBlock({ blockNumber: latest.number - N });
      const ms = (b: typeof latest) => {
        const m = (b as unknown as { timestampMillis?: bigint | string }).timestampMillis;
        return m !== undefined ? Number(BigInt(m)) : Number(b.timestamp) * 1000;
      };
      return { seconds: (ms(latest) - ms(old)) / Number(N) / 1000, block: latest.number, span: Number(N) };
    },
  });
}

/** Newest human-text memo transfer of xMXN, and the newest memo transfer whose fee Mercado's sponsor paid. */
function useMemoProofs() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["tempo-memo-proofs", ADDR.xmxn],
    enabled: !!client,
    staleTime: 120_000,
    queryFn: async () => {
      const sponsor = await fetch("/api/sponsor")
        .then((r) => r.json() as Promise<{ sponsor?: string }>)
        .then((j) => j.sponsor?.toLowerCase())
        .catch(() => undefined);
      const latest = await client!.getBlockNumber();
      let memo: { text: string; hash: Hex } | undefined;
      let sponsored: { hash: Hex; feePayer: string } | undefined;
      let receipts = 0;
      for (let i = 0n; i < 4n && (!memo || !sponsored); i++) {
        const to = latest - i * CHUNK;
        const logs = await client!.getLogs({ address: ADDR.xmxn as Address, event: MEMO, fromBlock: to - CHUNK + 1n, toBlock: to }).catch(() => []);
        for (const l of [...logs].reverse()) {
          if (!memo && l.args.memo) {
            const text = memoText(l.args.memo);
            if (text) memo = { text, hash: l.transactionHash as Hex };
          }
          if (!sponsored && sponsor && receipts < 8) {
            receipts++;
            const r = await client!.getTransactionReceipt({ hash: l.transactionHash as Hex }).catch(() => undefined);
            const fp = (r as unknown as { feePayer?: string } | undefined)?.feePayer?.toLowerCase();
            if (r && fp === sponsor && fp !== r.from.toLowerCase()) sponsored = { hash: l.transactionHash as Hex, feePayer: fp };
          }
          if (memo && sponsored) break;
        }
      }
      return { sponsor, memo, sponsored };
    },
  });
}

/** A real unpaid call to the paid partner quote: it answers 402 with a payment challenge. Made server-side
 *  via /api/mpp/challenge (CR-08), so the browser doesn't log a red 402 in devtools; nothing is charged. */
function use402() {
  return useQuery({
    queryKey: ["tempo-402-probe"],
    staleTime: Infinity,
    queryFn: async () => {
      const [res, pricing] = await Promise.all([
        probeChallenge("move-quote", { side: "usd_to_mxn", amount: "250" }),
        fetch("/api/mpp/pricing").then((r) => r.json() as Promise<Record<string, { amount: string | null; symbol: string }>>),
      ]);
      const price = pricing["move-quote"];
      return { status: res.status, challenge: !!res.wwwAuthenticate, price: price?.amount ? `${fmtAmount(BigInt(price.amount))} ${price.symbol}` : undefined };
    },
  });
}

function Primitive({ name, does, proof, href, external = true }: { name: string; does: string; proof: ReactNode; href?: string; external?: boolean }) {
  return (
    <li className="grid content-start gap-2 border-t border-foreground pt-3">
      <h3 className="display text-[1.35rem] leading-tight">{name}</h3>
      <p className="text-[15px] leading-snug text-pretty">{does}</p>
      <p className="text-muted-foreground text-[13px] leading-snug">
        <span className="meta text-foreground mr-1.5">Live</span>
        {href ? (
          <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="hover:text-foreground underline decoration-1 underline-offset-[3px]">
            {proof}
          </Link>
        ) : (
          proof
        )}
      </p>
    </li>
  );
}

export function BuiltOnTempo() {
  const supply = useReadContract({ address: ADDR.xmxn, abi: tokenAbi, functionName: "totalSupply", chainId: CHAIN_ID, query: { refetchInterval: 30_000 } });
  const bt = useBlockTime();
  const mp = useMemoProofs();
  const p402 = use402();
  const reading = "reading Tempo…";
  const m = mp.data;

  return (
    <section aria-labelledby="tempo-h" className="grid gap-5 border-t pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="tempo-h" className="display text-[clamp(2.2rem,5vw,4rem)]">
          Built on Tempo
        </h2>
        <Meta>Every proof below is read live from Tempo Moderato testnet</Meta>
      </div>
      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Primitive
          name="TIP-20 stablecoins"
          does="xMXN and OUSD are TIP-20 tokens: Tempo-native stablecoins with memos and fee payment built in."
          href={explorerAddress(ADDR.xmxn)}
          proof={<>{supply.data === undefined ? "—" : fmtAmount(supply.data as bigint, 0)} xMXN in circulation · {shortAddr(ADDR.xmxn)}</>}
        />
        <Primitive
          name="Sub-second settlement"
          does="Dollars sent from the US land as pesos in the family's wallet in one transaction."
          href={bt.data ? `${TEMPO_EXPLORER_URL}/block/${bt.data.block}` : undefined}
          proof={bt.data ? <>{fmtNumber(bt.data.seconds, 2)} s average block time over the last {bt.data.span.toLocaleString("en-US")} blocks</> : bt.isError ? "—" : reading}
        />
        <Primitive
          name="Fee sponsorship"
          does="Mercado pays the network fee for its own contract calls when they qualify, so users don't need a gas token to start."
          href={m?.sponsored ? explorerTx(m.sponsored.hash) : m?.sponsor ? explorerAddress(m.sponsor) : undefined}
          proof={
            m?.sponsored ? <>Latest sponsored payment: fee paid by Mercado ({shortAddr(m.sponsored.feePayer)}), not the sender</> : m?.sponsor ? <>Mercado fee payer {shortAddr(m.sponsor)}</> : mp.isError ? "—" : reading
          }
        />
        <Primitive
          name="Transfer memos"
          does="The family's note travels with the money, on-chain, in the transfer itself."
          href={m?.memo ? explorerTx(m.memo.hash) : "/remesas"}
          external={!!m?.memo}
          proof={m?.memo ? <>Latest note: “{m.memo.text}”</> : m ? "No note sent recently. Send one in Remesas" : mp.isError ? "—" : reading}
        />
        <Primitive
          name="Payments over HTTP 402"
          does="Partners pay per API call in xMXN with MPP: no API keys, no invoices, a receipt per call."
          href="/developers"
          external={false}
          proof={
            p402.data ? (
              <>
                GET partner quote → {p402.data.status === 402 && p402.data.challenge ? "402 Payment Required" : `HTTP ${p402.data.status}`}
                {p402.data.price && <> · {p402.data.price} per call</>}
              </>
            ) : p402.isError ? (
              "—"
            ) : (
              reading
            )
          }
        />
        <li className="grid content-start gap-2 border-t border-foreground pt-3">
          <h3 className="display text-[1.35rem] leading-tight">Tempo Wallet + passkeys</h3>
          <p className="text-[15px] leading-snug text-pretty">Sign in with Tempo Wallet or a device passkey. No seed phrase, no browser extension.</p>
          <p className="text-muted-foreground text-[13px] leading-snug">
            <span className="meta text-foreground mr-1.5">Live</span>
            <WalletDialog>
              <button type="button" className="hover:text-foreground underline decoration-1 underline-offset-[3px]">
                Try it: connect with a passkey
              </button>
            </WalletDialog>
          </p>
        </li>
      </ul>
    </section>
  );
}
