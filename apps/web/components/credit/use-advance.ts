"use client";
// Data hooks for "Get an advance": demo earnings → signed eligibility. Draw/repay use useMercado().
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import type {
  DriverDemoResponse,
  DriverPlatform,
  DriverProfileId,
  DriverScoreResponse,
} from "@mercado/shared";

export const PROFILES: { id: DriverProfileId; title: string; blurb: string }[] =
  [
    {
      id: "steady",
      title: "Steady driver",
      blurb: "12 weeks, consistent full-time earnings",
    },
    {
      id: "irregular",
      title: "Irregular driver",
      blurb: "10 weeks, part-time and variable",
    },
    {
      id: "new-driver",
      title: "New driver",
      blurb: "Only 3 active weeks so far",
    },
  ];

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function useDriverDemo(
  profile: DriverProfileId | undefined,
  platform: DriverPlatform = "uber",
) {
  return useQuery({
    queryKey: ["driver-demo", platform, profile],
    enabled: !!profile,
    staleTime: Infinity,
    queryFn: () =>
      fetch(`/api/driver/demo?platform=${platform}&profile=${profile}`).then(
        (r) => json<DriverDemoResponse>(r),
      ),
  });
}

/** Requests the score + signed attestation for (borrower, profile, platform). Re-request when it expires. */
export function useEligibility() {
  return useMutation({
    mutationFn: ({
      borrower,
      profile,
      platform = "uber",
    }: {
      borrower: Address;
      profile: DriverProfileId;
      platform?: DriverPlatform;
    }) =>
      fetch("/api/driver/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrower, profile, platform }),
      }).then((r) => json<DriverScoreResponse>(r)),
  });
}

/** Seconds until `expiry` (unix seconds), ticking every second. */
export function useCountdown(expiry: number | undefined) {
  // Clock is read only in effects (never during render/prerender).
  const [now, setNow] = useState<number>();
  useEffect(() => {
    if (!expiry) return;
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiry]);
  return expiry && now !== undefined ? Math.max(0, expiry - now) : undefined;
}

/** "2%" from 200 bps; undefined when the on-chain param couldn't be read. */
export const bpsToPct = (bps: bigint | undefined) =>
  bps === undefined
    ? undefined
    : `${(Number(bps) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** The API's attestation (string fields) as the typed input useMercado().borrow expects. */
export function toAttestation(att: NonNullable<DriverScoreResponse["attestation"]>) {
  return { ...att, dataHash: att.dataHash as Hex, signature: att.signature as Hex };
}
