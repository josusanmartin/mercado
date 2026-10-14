import { Badge } from "@/components/ui/badge";

/** Honesty labels from SPEC: always visible next to the thing they qualify. */
export function MockOracleBadge() {
  return <Badge variant="mock">Admin-relayed rate</Badge>;
}

export function TestnetOusdLabel({ className }: { className?: string }) {
  return <span className={className}>Testnet OUSD (Tempo faucet, no real value)</span>;
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-display mt-0.5 text-xl font-semibold tabular">{value}</dd>
      {sub && <dd className="text-muted-foreground text-xs">{sub}</dd>}
    </div>
  );
}
