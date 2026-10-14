"use client";
// Live meta line for Mercado Mint's hero (PRINCIPLES §5: small meta, big statement). Every value is a live read.
import { useOracle, useThreeBuckets } from "@/lib/contracts";
import { fmtAmount } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { usePresent } from "@/components/console/present";

export function useMintMeta(): string[] {
  const b = useThreeBuckets();
  const fx = useOracle();
  const now = useNow(30_000);
  const present = usePresent(); // ?present=1 (deck captures only) drops the testnet label
  const cov = b.move?.coverageBps;
  const time =
    now === undefined
      ? "…"
      : new Date(now * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mexico_City" });
  return [
    `CDMX ${time}`,
    `SUPPLY ${b.xmxnSupply === undefined ? "…" : fmtAmount(b.xmxnSupply, 0)} xMXN`,
    ...(b.protocol === "v2" ? [`COBERTURA ${cov === undefined ? "…" : cov > 10_000_000n ? "∞" : `${(Number(cov) / 100).toFixed(0)}%`}`] : []),
    `${fx.rate === undefined ? "…" : fx.rate.toFixed(2)} MXN/USD`,
    ...(present ? [] : ["TESTNET · SIN VALOR REAL"]),
  ];
}
