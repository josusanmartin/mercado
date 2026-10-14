"use client";
// Send money: swap testnet OUSD for xMXN on the separately capitalized SwapDesk (oracle-informed
// quote, spread, minOut) and deliver it to another wallet in one flow. On-chain delivery only.
// Console Settings layout: Send (the form) · Recipient's wallet · Swap desk.
import { useEffect, useState } from "react";
import { isAddress, isAddressEqual, type Address } from "viem";
import { useConnection } from "wagmi";
import { ArrowLeftRight, Store, UserRound } from "lucide-react";
import { ADDR, deliveredFromReceipt, MEMO_MAX_BYTES, memoByteLength, readableError, useBalances, useDesk, useMercado, useOracle, useSwapQuote, withSlippage } from "@/lib/contracts";
import { fmtAmount, fmtBps, fmtNumber, shortAddr, toUnits } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BigNumber, ListPane, Panel, PanelActions, Row, Rows, SettingsLayout } from "@/components/console";
import { ConnectGate } from "@/components/shell/connect-gate";
import { TokenInput } from "@/components/shell/token-input";
import { TxProgress } from "@/components/shell/tx-progress";
import { useTourPrefill } from "@/components/tour/demo-tour";
import { personaByAddress, personaById } from "@/components/wallet/personas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SLIPPAGE_BPS = 50n;

export function SendScreen() {
  const { address } = useConnection();
  const prefill = useTourPrefill("/send");
  const rosa = personaById("recipient");

  const [section, setSection] = useState<"send" | "recipient" | "desk">("send");
  const [payWith, setPayWith] = useState<"ousd" | "xmxn">("ousd");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState<string>("");
  const [memo, setMemo] = useState("");
  // Frozen at confirmation from the transfer log, so later edits or unrelated deposits can't change it.
  const [sent, setSent] = useState<{ to: Address; amount?: bigint; hash: string; memo?: string }>();

  useEffect(() => {
    if (prefill.amount) setAmount(prefill.amount);
    if (prefill.memo) setMemo(prefill.memo);
    if (prefill.amount && rosa.address) setTo(rosa.address);
    if (prefill.amount) setSection("send");
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
  const recipientBal = useBalances(recipient);
  const recipientName = personaByAddress(recipient);

  const toSelf = recipient && address && recipient.toLowerCase() === address.toLowerCase();
  const memoTooLong = memoByteLength(memo) > MEMO_MAX_BYTES;
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

  async function onSend() {
    if (!recipient) return;
    setSent(undefined);
    const memoArg = memo.trim() || undefined;
    const steps = swapping
      ? await m.swapAndSend(amt, quote.amountOut!, recipient, memoArg, SLIPPAGE_BPS)
      : await m.transfer(ADDR.xmxn, recipient, amt, memoArg);
    const last = steps?.at(-1);
    if (last) {
      setSent({ to: recipient, amount: deliveredFromReceipt(last, ADDR.xmxn, recipient).amount, hash: last.hash, memo: memoArg });
      setAmount("");
    }
  }
  const arrived = sent && recipient && isAddressEqual(sent.to, recipient) ? sent.amount : undefined;


  const items = [
    { id: "send", label: "Send money", icon: ArrowLeftRight },
    {
      id: "recipient",
      label: recipientName ? `${recipientName.name}'s wallet` : "Recipient",
      icon: UserRound,
      hint: recipient && recipientBal.xmxn !== undefined ? fmtAmount(recipientBal.xmxn, 0) : undefined,
    },
    { id: "desk", label: "Swap desk", icon: Store, hint: desk.reserveXmxn !== undefined ? fmtAmount(desk.reserveXmxn, 0) : undefined },
  ];

  return (
    <SettingsLayout title="Send money" list={<ListPane label="Send money sections" items={items} value={section} onChange={(id) => setSection(id as typeof section)} />}>
      {section === "send" && (
        <Panel
          key="send"
          title="Send money"
          description="Turn dollars into pesos on the swap desk and send them to any wallet on Tempo in one step. On-chain delivery only: no cash-out to a Mexican bank (SPEI) in this prototype."
        >
          <ConnectGate persona="sender" why="Connect a wallet with testnet OUSD or xMXN to send money.">
            <div className="grid gap-5 pt-2">
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

              <TokenInput label="You send" symbol={swapping ? "OUSD" : "xMXN"} value={amount} onChange={setAmount} max={balance} maxLabel="Balance" disabled={m.tx.isBusy} />

              {swapping && (
                <div className="bg-muted grid gap-1 rounded-[14px] px-5 py-4">
                  <p className="text-muted-foreground text-sm">They receive about</p>
                  <BigNumber value={quote.amountOut !== undefined ? fmtAmount(quote.amountOut) : amt > 0n && quote.isLoading ? "…" : "0.00"} unit="xMXN" />
                  {quoteError && amt > 0n && <p className="text-destructive mt-1 text-sm">{quoteError}</p>}
                  <Rows className="mt-2">
                    <Row
                      label="Desk rate"
                      sub="Mock oracle rate minus the desk spread"
                      value={
                        quote.amountOut !== undefined && amt > 0n
                          ? `${fmtNumber(Number(quote.amountOut) / Number(amt), 4)} MXN/USD`
                          : fx.rate !== undefined
                            ? `${fmtNumber(fx.rate, 4)} MXN/USD`
                            : "—"
                      }
                    />
                    <Row label={`Desk spread (${fmtBps(desk.spreadBps)})`} value={quote.fee !== undefined ? `${fmtAmount(quote.fee)} xMXN` : "—"} />
                    <Row
                      label="Minimum received"
                      sub={`With ${fmtBps(SLIPPAGE_BPS, 1)} slippage. Less than this and the swap reverts.`}
                      value={minOut !== undefined ? `${fmtAmount(minOut)} xMXN` : "—"}
                    />
                  </Rows>
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
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {rosa.address && (
                    <button type="button" disabled={m.tx.isBusy} onClick={() => setTo(rosa.address!)} className="bg-secondary rounded-full px-3.5 py-1.5">
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
                    {memoByteLength(memo)}/{MEMO_MAX_BYTES} bytes
                  </span>
                </div>
                <Input id="memo" placeholder="para mamá" value={memo} disabled={m.tx.isBusy} onChange={(e) => setMemo(e.target.value)} aria-invalid={memoTooLong || undefined} />
                <p className={cn("text-xs", memoTooLong ? "text-destructive" : "text-muted-foreground")}>
                  {memoTooLong
                    ? "Too long: notes are stored on-chain in 32 bytes (accented letters count as 2)."
                    : "Stored on-chain with the transfer, visible on the explorer. Don't put private details here."}
                </p>
              </div>

              {overCap && (
                <p className="text-destructive text-sm">
                  The desk limits each wallet to {fmtAmount(desk.dailyCapOusd, 0)} OUSD per 24 hours. You have {fmtAmount(desk.remainingDailyCap)} left today.
                </p>
              )}
              {blockedFx && (
                <p className="text-destructive text-sm">{desk.paused ? "The swap desk is paused right now." : "Swaps are blocked while the exchange rate is stale or paused."}</p>
              )}

              <PanelActions>
                <Button size="lg" disabled={disabled} onClick={onSend}>
                  {swapping ? "Swap and send" : "Send xMXN"}
                </Button>
              </PanelActions>
              <TxProgress tx={m.tx} />
              {sent && m.tx.status === "success" && (
                <div className="bg-muted grid gap-1 rounded-[14px] px-5 py-4 text-[15px]">
                  <p className="font-medium">
                    <span className="bg-success mr-2 inline-block size-2 rounded-full align-middle" />
                    Delivered <span className="tabular">{sent.amount !== undefined ? fmtAmount(sent.amount) : ""}</span> xMXN to{" "}
                    {personaByAddress(sent.to)?.name ?? shortAddr(sent.to)}
                    {sent.memo && <> with the note &ldquo;{sent.memo}&rdquo;</>}.
                  </p>
                  <p className="text-muted-foreground text-sm">
                    It&apos;s in their Tempo wallet now. Turning it into pesos at a bank would need an off-ramp, which this prototype doesn&apos;t have.
                  </p>
                </div>
              )}
            </div>
          </ConnectGate>
        </Panel>
      )}

      {section === "recipient" && (
        <Panel key="recipient" title={recipientName ? `${recipientName.name}'s wallet` : "Recipient"} description={recipient ? shortAddr(recipient, 6) : "Pick who you're sending to in Send money."}>
          {recipient ? (
            <>
              <BigNumber value={recipientBal.xmxn === undefined ? "—" : fmtAmount(recipientBal.xmxn)} unit="xMXN" className="mt-2" />
              <Rows className="mt-4">
                <Row label="Source" value="Read live from Tempo" />
                <Row label="From your last transfer" value={arrived !== undefined ? `+${fmtAmount(arrived)} xMXN` : "—"} />
                <Row label="Cash-out" sub="No SPEI or bank off-ramp in this prototype" value="On-chain only" />
              </Rows>
            </>
          ) : (
            <p className="text-muted-foreground py-4 text-sm">Their balance shows here once you enter an address.</p>
          )}
        </Panel>
      )}

      {section === "desk" && (
        <Panel key="desk" title="Swap desk" description="Its own finite inventory, funded separately. It can't touch vault collateral. A capped demo liquidity source priced off the mock oracle, not a market.">
          <Rows>
            <Row label="xMXN available" value={desk.reserveXmxn === undefined ? "Unavailable" : fmtAmount(desk.reserveXmxn, 0)} />
            <Row label="OUSD held" value={desk.reserveOusd === undefined ? "Unavailable" : fmtAmount(desk.reserveOusd, 0)} />
            <Row label="Spread" value={fmtBps(desk.spreadBps)} />
            <Row label="Max per swap" sub="xMXN equivalent" value={desk.maxSwapXmxn === undefined ? "—" : fmtAmount(desk.maxSwapXmxn, 0)} />
            <Row
              label="Your limit left today"
              sub={desk.dailyCapOusd !== undefined ? `Of ${fmtAmount(desk.dailyCapOusd, 0)} OUSD per wallet per 24 hours` : undefined}
              value={address ? (desk.remainingDailyCap === undefined ? "—" : `${fmtAmount(desk.remainingDailyCap, 0)} OUSD`) : "Connect a wallet"}
            />
            <Row label="Status" value={desk.paused === undefined ? "—" : desk.paused ? <span className="text-destructive">Paused</span> : "Open"} />
          </Rows>
        </Panel>
      )}
    </SettingsLayout>
  );
}
