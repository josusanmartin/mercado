"use client";
// Send money: swap testnet OUSD for xMXN on the separately capitalized SwapDesk (oracle-informed
// quote, spread, minOut) and deliver it to another wallet in one flow. On-chain delivery only.
import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { useConnection } from "wagmi";
import { ArrowDown, Info } from "lucide-react";
import { ADDR, readableError, useBalances, useDesk, useMercado, useOracle, useSwapQuote, withSlippage } from "@/lib/contracts";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { Stat } from "@/components/shell/labels";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { personaByAddress, personaById } from "@/components/wallet/personas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SLIPPAGE_BPS = 50n;
const MEMO_MAX_BYTES = 32;
const memoBytes = (s: string) => new TextEncoder().encode(s).length;

export function SendScreen() {
  const { address } = useConnection();
  const prefill = useTourPrefill("/send");
  const rosa = personaById("recipient");

  const [payWith, setPayWith] = useState<"ousd" | "xmxn">("ousd");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState<string>("");
  const [memo, setMemo] = useState("");
  const [sent, setSent] = useState<{ to: Address; before?: bigint; amountHint?: bigint; memo?: string }>();

  useEffect(() => {
    if (prefill.amount) setAmount(prefill.amount);
    if (prefill.memo) setMemo(prefill.memo);
    if (prefill.amount && rosa.address) setTo(rosa.address);
  }, [prefill.amount, prefill.memo, rosa.address]);

  const bal = useBalances();
  const desk = useDesk();
  const fx = useOracle();
  const m = useMercado();

  const amt = toUnits(amount);
  const swapping = payWith === "ousd";
  const quote = useSwapQuote(true, swapping && amt > 0n ? amt : undefined);
  const minOut = quote.amountOut !== undefined ? withSlippage(quote.amountOut, SLIPPAGE_BPS) : undefined;
  const quoteError = quote.error ? readableError(quote.error) : undefined;

  const recipient = isAddress(to) ? (to as Address) : undefined;
  const recipientBal = useBalances(recipient ?? sent?.to);
  const recipientName = personaByAddress(recipient ?? sent?.to);

  const toSelf = recipient && address && recipient.toLowerCase() === address.toLowerCase();
  const memoTooLong = memoBytes(memo) > MEMO_MAX_BYTES;
  const balance = swapping ? bal.ousd : bal.xmxn;
  const overBalance = balance !== undefined && amt > balance;
  const overCap = swapping && desk.remainingDailyCap !== undefined && amt > desk.remainingDailyCap;
  const blockedFx = swapping && (fx.valid === false || fx.paused || desk.paused);

  const disabled =
    m.tx.isBusy ||
    amt === 0n ||
    !recipient ||
    !!toSelf ||
    memoTooLong ||
    overBalance ||
    overCap ||
    blockedFx ||
    (swapping && (quote.amountOut === undefined || !!quote.error));

  // Remember the recipient's balance right before sending, to show what arrived.
  const beforeRef = useRef<bigint | undefined>(undefined);
  async function onSend() {
    if (!recipient) return;
    beforeRef.current = recipientBal.xmxn;
    const memoArg = memo.trim() || undefined;
    const ok = swapping
      ? await m.swapAndSend(amt, quote.amountOut!, recipient, memoArg, SLIPPAGE_BPS)
      : await m.transfer(ADDR.xmxn, recipient, amt, memoArg);
    if (ok) {
      setSent({ to: recipient, before: beforeRef.current, amountHint: swapping ? minOut : amt, memo: memoArg });
      setAmount("");
    }
  }
  const arrived = sent && sent.before !== undefined && recipientBal.xmxn !== undefined ? recipientBal.xmxn - sent.before : undefined;

  return (
    <>
      <PageHeader
        title="Send money"
        lede="Turn dollars into pesos on the swap desk and send them to any wallet on Tempo in one step. Delivery is on-chain only: there is no cash-out to a Mexican bank (SPEI) in this prototype."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="content-start">
          <CardContent>
            <ConnectGate persona="sender" why="Connect a wallet with testnet OUSD or xMXN to send money.">
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <Label>Pay with</Label>
                  <Tabs value={payWith} onValueChange={(v) => setPayWith(v as "ousd" | "xmxn")}>
                    <TabsList>
                      <TabsTrigger value="ousd" disabled={m.tx.isBusy}>
                        OUSD, swapped to xMXN
                      </TabsTrigger>
                      <TabsTrigger value="xmxn" disabled={m.tx.isBusy}>
                        xMXN I hold
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <TokenInput
                  label="You send"
                  symbol={swapping ? "OUSD" : "xMXN"}
                  value={amount}
                  onChange={setAmount}
                  max={balance}
                  maxLabel="Balance"
                  disabled={m.tx.isBusy}
                />

                {swapping && (
                  <div className="grid gap-3 rounded-lg bg-muted/60 p-4">
                    <div className="flex items-center gap-2">
                      <ArrowDown className="text-muted-foreground size-4" />
                      <span className="text-sm">They receive about</span>
                    </div>
                    <p className="font-display text-3xl font-semibold tabular">
                      {quote.amountOut !== undefined ? fmtAmount(quote.amountOut) : amt > 0n && quote.isLoading ? "…" : "0.00"}{" "}
                      <span className="text-muted-foreground text-base font-normal">xMXN</span>
                    </p>
                    {quoteError && amt > 0n && <p className="text-destructive text-sm">{quoteError}</p>}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      <Row
                        k="Desk rate"
                        v={
                          quote.amountOut !== undefined && amt > 0n
                            ? `${fmtNumber(Number(quote.amountOut) / Number(amt), 4)} MXN/USD`
                            : fx.rate !== undefined
                              ? `${fmtNumber(fx.rate, 4)} mock`
                              : "—"
                        }
                      />
                      <Row k={`Desk spread ${fmtBps(desk.spreadBps)}`} v={quote.fee !== undefined ? `${fmtAmount(quote.fee)} xMXN` : "—"} />
                      <Row
                        k={`Minimum after ${fmtBps(SLIPPAGE_BPS, 1)} slippage`}
                        v={minOut !== undefined ? `${fmtAmount(minOut)} xMXN` : "—"}
                      />
                    </dl>
                    <p className="text-muted-foreground text-xs">
                      If the desk would pay out less than the minimum, the swap reverts and nothing moves.
                    </p>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label htmlFor="to">To</Label>
                  <Input
                    id="to"
                    placeholder="0x… wallet address on Tempo"
                    value={to}
                    disabled={m.tx.isBusy}
                    onChange={(e) => setTo(e.target.value.trim())}
                    aria-invalid={(to !== "" && !recipient) || toSelf || undefined}
                    className="font-mono text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {rosa.address && (
                      <button
                        type="button"
                        disabled={m.tx.isBusy}
                        onClick={() => setTo(rosa.address!)}
                        className="hover:border-primary hover:text-primary rounded-full border bg-card px-2.5 py-1"
                      >
                        {rosa.name} · {rosa.role}, demo
                      </button>
                    )}
                    {to !== "" && !recipient && <span className="text-destructive">That isn&apos;t a valid address.</span>}
                    {toSelf && <span className="text-destructive">That&apos;s your own wallet.</span>}
                    {recipientName && !toSelf && <span className="text-muted-foreground">Sending to {recipientName.name}</span>}
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="memo">Note (optional)</Label>
                    <span className={cn("text-xs tabular", memoTooLong ? "text-destructive" : "text-muted-foreground")}>
                      {memoBytes(memo)}/{MEMO_MAX_BYTES} bytes
                    </span>
                  </div>
                  <Input
                    id="memo"
                    placeholder="para mamá"
                    value={memo}
                    disabled={m.tx.isBusy}
                    onChange={(e) => setMemo(e.target.value)}
                    aria-invalid={memoTooLong || undefined}
                  />
                  <p className={cn("text-xs", memoTooLong ? "text-destructive" : "text-muted-foreground")}>
                    {memoTooLong
                      ? "Too long: notes are stored on-chain in 32 bytes (accented letters count as 2)."
                      : "Stored on-chain with the transfer, visible on the explorer. Don't put private details here."}
                  </p>
                </div>

                {overCap && (
                  <p className="text-destructive text-sm">
                    The desk limits each wallet to {fmtAmount(desk.dailyCapOusd, 0)} OUSD per 24 hours. You have{" "}
                    {fmtAmount(desk.remainingDailyCap)} left today.
                  </p>
                )}
                {blockedFx && (
                  <p className="text-destructive text-sm">
                    {desk.paused ? "The swap desk is paused right now." : "Swaps are blocked while the exchange rate is stale or paused."}
                  </p>
                )}

                <Button size="lg" className="w-full sm:w-auto sm:justify-self-start" disabled={disabled} onClick={onSend}>
                  {swapping ? "Swap and send" : "Send xMXN"}
                </Button>
                <TxProgress tx={m.tx} />
                {sent && m.tx.status === "success" && (
                  <div className="border-success/30 bg-success/5 grid gap-1 rounded-lg border p-4 text-sm">
                    <p className="font-medium">
                      Delivered{" "}
                      <span className="tabular">{arrived !== undefined && arrived > 0n ? fmtAmount(arrived) : `≥ ${fmtAmount(sent.amountHint)}`}</span>{" "}
                      xMXN to {personaByAddress(sent.to)?.name ?? shortAddr(sent.to)}
                      {sent.memo && <> with the note &ldquo;{sent.memo}&rdquo;</>}.
                    </p>
                    <p className="text-muted-foreground">
                      It&apos;s in their Tempo wallet now. Turning it into pesos at a bank would need an off-ramp, which this prototype doesn&apos;t have.
                    </p>
                  </div>
                )}
              </div>
            </ConnectGate>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{recipientName ? `${recipientName.name}'s wallet` : "Recipient"}</CardTitle>
              <CardDescription>{recipient || sent ? shortAddr(recipient ?? sent?.to, 6) : "Pick who you're sending to"}</CardDescription>
            </CardHeader>
            <CardContent>
              {recipient || sent ? (
                <dl className="grid grid-cols-2 gap-4">
                  <Stat
                    label="xMXN balance"
                    value={fmtAmount(recipientBal.xmxn)}
                    sub={arrived !== undefined && arrived > 0n ? <span className="text-success">+{fmtAmount(arrived)} just arrived</span> : "live from Tempo"}
                  />
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">Their balance shows here, read live from the chain.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Swap desk</CardTitle>
              <CardDescription>Its own finite inventory, funded separately. It can&apos;t touch vault collateral.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid grid-cols-2 gap-4">
                <Stat label="xMXN available" value={fmtAmount(desk.reserveXmxn, 0)} />
                <Stat label="OUSD held" value={fmtAmount(desk.reserveOusd, 0)} />
                <Stat label="Max per swap" value={fmtAmount(desk.maxSwapXmxn, 0)} sub="xMXN equivalent" />
                <Stat
                  label="Your limit left today"
                  value={address ? fmtAmount(desk.remainingDailyCap, 0) : "—"}
                  sub={`of ${fmtAmount(desk.dailyCapOusd, 0)} OUSD / 24h`}
                />
              </dl>
              <p className="text-muted-foreground flex gap-2 text-xs">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                A demo liquidity source priced off the mock oracle, not a market. A real corridor would need market makers and a peso off-ramp.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{k}</dt>
      <dd className="tabular font-medium">{v}</dd>
    </div>
  );
}
