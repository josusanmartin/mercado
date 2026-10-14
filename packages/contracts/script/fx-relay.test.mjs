// node --test packages/contracts/script/fx-relay.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { decideWrite, checkSourceDate } from "./fx-relay-policy.mjs";

const BAND = [5_00000000n, 50_00000000n];

test("review R-036 probe: one 10.00 quote vs on-chain 20.00 writes NOTHING (no 20→16→12.8→… stepping)", () => {
  const d = decideWrite(20_00000000n, 10_00000000n, 2000n, ...BAND);
  assert.equal(d.write, false);
  assert.match(d.reason, /50\.00% move exceeds the 20% jump limit/);
});

test("a normal move within the jump limit is written once, at the source rate", () => {
  assert.deepEqual(decideWrite(20_00000000n, 18_37027400n, 2000n, ...BAND), { write: true, price: 18_37027400n });
});

test("exactly at the jump limit is allowed; one unit beyond is refused", () => {
  assert.equal(decideWrite(20_00000000n, 16_00000000n, 2000n, ...BAND).write, true);
  assert.equal(decideWrite(20_00000000n, 15_99999999n, 2000n, ...BAND).write, false);
});

test("out-of-band source rates are refused", () => {
  assert.equal(decideWrite(20_00000000n, 4_00000000n, 9000n, ...BAND).write, false);
});

test("review R-037: stale (2020) and future (2099) daily source dates are refused", () => {
  const now = Date.parse("2026-10-14T02:00:00Z");
  assert.match(checkSourceDate("Wed, 01 Jan 2020 00:00:00 +0000", now), /too old/);
  assert.match(checkSourceDate("Thu, 01 Jan 2099 00:00:00 +0000", now), /future/);
  assert.equal(checkSourceDate("Wed, 14 Oct 2026 00:02:32 +0000", now), undefined);
});
