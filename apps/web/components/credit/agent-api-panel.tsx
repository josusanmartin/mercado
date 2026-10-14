// "Agent API": third-party underwriters buy a demo underwriting report per call over MPP (HTTP 402),
// no API key or signup. Shows a RECORDED trace of scripts/underwriter-agent.ts (qa, live on Moderato),
// not a live call from this page.
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/console";

const EXPLORER = "https://explore.testnet.tempo.xyz/tx/";
const SETTLE_TX =
  "0xbae8c938a550c95c5295203d7bfed526fd5a010768fb7f8c29b01f5d6f46683a";

type Line = { who: "agent" | "mercado" | "tempo"; text: string; tx?: string };

// Recorded 2026-10-14 ~01:13 UTC (scripts/evidence/underwriter-agent.txt). Abridged.
const TRACE: Line[] = [
  {
    who: "agent",
    text: "third-party underwriting bot 0x71E8…459e · no API key, no signup",
  },
  {
    who: "agent",
    text: 'POST /api/driver/score?access=underwriter { profile: "steady" }',
  },
  {
    who: "mercado",
    text: "402 Payment Required: 2 xMXN → merchant 0x6727…d4d3 · tempo/charge",
  },
  {
    who: "agent",
    text: "signs a TIP-20 xMXN transfer, memo bound to the challenge, retries",
  },
  { who: "tempo", text: "settled on-chain", tx: SETTLE_TX },
  {
    who: "mercado",
    text: "200 OK + Payment-Receipt { status: success, reference: 0xbae8…683a }",
  },
  {
    who: "agent",
    text: "report: score 96.5 (floor 50) · credit line 1,500 xMXN · dataHash 0x2129…",
  },
  {
    who: "agent",
    text: "no borrow attestation included (only the borrower's own session gets one) ✓",
  },
];

const WHO_STYLE: Record<Line["who"], string> = {
  agent: "text-muted-foreground",
  mercado: "text-foreground font-medium",
  tempo: "text-muted-foreground",
};

export function AgentApiPanel() {
  return (
    <Panel
      title="Agent API"
      description="Third-party underwriters pay per report. Any bot can buy a driver's demo underwriting report for 2 xMXN over MPP: it gets an HTTP 402, pays on Tempo and receives the report with a receipt. No API key, account or card. Same illustrative score on Demo Uber Data, and never a borrow attestation."
      aside={<Badge variant="mock">Recorded trace</Badge>}
    >
      <div className="grid gap-3 pt-2">
        <div className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
          {TRACE.map((l, i) => (
            <div key={i} className="whitespace-pre">
              <span className={`inline-block w-16 ${WHO_STYLE[l.who]}`}>
                {l.who}
              </span>
              {l.text}
              {l.tx && (
                <a
                  href={EXPLORER + l.tx}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 underline"
                >
                  {l.tx.slice(0, 10)}…{l.tx.slice(-4)} ↗
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground">
            Run it yourself (dev server on :3100, funds a throwaway agent
            wallet):
          </span>
          <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-xs">
            npx tsx scripts/underwriter-agent.ts
          </code>
          <span className="text-xs text-muted-foreground">
            Endpoint:{" "}
            <code className="font-mono">
              POST /api/driver/score?access=underwriter
            </code>{" "}
            · settlement tx{" "}
            <a
              href={EXPLORER + SETTLE_TX}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline-offset-4 hover:underline"
            >
              on the Tempo explorer ↗
            </a>
          </span>
        </div>
      </div>
    </Panel>
  );
}
