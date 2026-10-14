import { describe, expect, it } from "vitest";
// Not in mppx's public exports; imported by path to check our decoder against the real encoder.
import * as Attribution from "../../../../../node_modules/mppx/dist/tempo/Attribution.js";
import { memoBoundTo } from "../../mpp/reconcile";
import { MPP_REALM } from "../../mpp/server";

describe("MPP attribution memo binding", () => {
  it("matches mppx's encoder for our realm and challenge", () => {
    const memo = Attribution.encode({ challengeId: "chal-123", serverId: MPP_REALM });
    expect(memoBoundTo(memo, "chal-123")).toBe(true);
    expect(memoBoundTo(Attribution.encode({ challengeId: "chal-123", serverId: MPP_REALM, clientId: "wallet" }), "chal-123")).toBe(true);
  });
  it("rejects other challenges, other realms and non-MPP memos", () => {
    const memo = Attribution.encode({ challengeId: "chal-123", serverId: MPP_REALM });
    expect(memoBoundTo(memo, "chal-124")).toBe(false);
    expect(memoBoundTo(Attribution.encode({ challengeId: "chal-123", serverId: "other-server" }), "chal-123")).toBe(false);
    expect(memoBoundTo(`0x${"00".repeat(32)}`, "chal-123")).toBe(false);
  });
});
