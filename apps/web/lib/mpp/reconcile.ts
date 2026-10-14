// Recovery for interrupted MPP settlements (R-009): if the server broadcast (pull) or was shown (push) a
// payment but crashed/timed out before recording it, the order stays CREATED while mppx's replay marker
// is consumed. Before issuing any new charge we look on-chain for a TIP-20 TransferWithMemo to the
// merchant, for the exact amount, whose MPP attribution memo is bound to one of the order's recorded
// challenge ids, and apply it as the payment.
import { hexToBytes, keccak256, parseAbiItem, stringToBytes, type Address, type Hex } from "viem";
import { publicClient } from "../server/chain";
import { MPP_REALM } from "./server";

const transferWithMemo = parseAbiItem(
  "event TransferWithMemo(address indexed from, address indexed to, uint256 amount, bytes32 indexed memo)",
);

const prefix = (s: string, n: number) => hexToBytes(keccak256(stringToBytes(s))).slice(0, n);
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Mirrors mppx tempo/Attribution: tag(4) | version(1) | server fp(10) | client fp(10) | challenge nonce(7). */
export function memoBoundTo(memo: Hex, challengeId: string, realm = MPP_REALM): boolean {
  const b = hexToBytes(memo);
  if (b.length !== 32) return false;
  return eq(b.slice(0, 4), prefix("mpp", 4)) && b[4] === 1 && eq(b.slice(5, 15), prefix(realm, 10)) && eq(b.slice(25, 32), prefix(challengeId, 7));
}

export interface PendingAttempt {
  challengeId: string;
  kind: "hash" | "transaction" | "proof";
  txHash?: Hex;
  fromBlock: string; // bigint as string
  at: string;
  /** Unix ms until which no new charge is issued while this attempt is unresolved. */
  holdUntil: number;
}

export interface FoundPayment {
  txHash: Hex;
  payer: Address;
  challengeId: string;
}

export async function findSettledAttempt(params: {
  token: Address;
  recipient: Address;
  amount: bigint;
  attempts: PendingAttempt[];
}): Promise<FoundPayment | null> {
  const { token, recipient, amount, attempts } = params;
  if (!attempts.length) return null;
  const client = publicClient();
  const fromBlock = attempts.reduce((m, a) => (BigInt(a.fromBlock) < m ? BigInt(a.fromBlock) : m), BigInt(attempts[0].fromBlock));
  const logs = await client.getLogs({ address: token, event: transferWithMemo, args: { to: recipient }, fromBlock, toBlock: "latest" });
  for (const log of logs) {
    if (log.args.amount !== amount || !log.args.memo || !log.transactionHash) continue;
    const attempt = attempts.find((a) => memoBoundTo(log.args.memo!, a.challengeId));
    if (!attempt) continue;
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    if (receipt.status !== "success") continue;
    return { txHash: log.transactionHash, payer: log.args.from!, challengeId: attempt.challengeId };
  }
  return null;
}

export async function currentBlock(): Promise<bigint> {
  return publicClient().getBlockNumber();
}

