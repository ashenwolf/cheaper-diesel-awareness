import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  crudeDropPerBarrel,
  extraSupplyNeeded,
  harmFromRevenue,
  poolHarm,
  revenueDeltaPerMonth,
  runRange,
  uralsDiscount,
} from "../src/model.js";
import { buildView } from "../src/view.js";

const params = JSON.parse(readFileSync(new URL("../data/params.json", import.meta.url), "utf8"));

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test("step 1: VAT and FX convert a pump saving into a crude drop", () => {
  close(crudeDropPerBarrel({ saving: 0.10, vat: 0.20, fx: 1.15, unitsPerBarrel: 158.987 }), 15.2363, 1e-3);
  close(crudeDropPerBarrel({ saving: 1, vat: 0, fx: 1, unitsPerBarrel: 42 }), 42);
});

test("step 2: supply needed scales with the price drop and inversely with flexibility", () => {
  close(extraSupplyNeeded({ crudeDrop: 10, brent: 100, worldSupply: 100, priceFlexibility: 10 }), 1);
});

test("Urals discount narrows linearly and stops at the relief level", () => {
  const base = { maxExtraSupply: 2, discountNow: 22, discountRelief: 12 };
  close(uralsDiscount({ ...base, supplied: 0 }), 22);
  close(uralsDiscount({ ...base, supplied: 1 }), 17);
  close(uralsDiscount({ ...base, supplied: 5 }), 12);
});

test("step 3: revenue nets out the loss on existing exports", () => {
  const same = { brent: 100, exports: 5, discountNow: 20, discount: 20, stateTake: 1 };
  assert.ok(revenueDeltaPerMonth({ ...same, supplied: 0, crudeDrop: 10 }) < 0);
  close(revenueDeltaPerMonth({ ...same, supplied: 1, crudeDrop: 0 }), 80 * 1e6 * 30);
});

test("steps 4-5: one full reference campaign reproduces the reference toll", () => {
  const harm = harmFromRevenue({
    revenue: 1000 * 50, unitCost: 50, launches: 1000, killedRef: 100, injuredRef: 400, droneShare: 0.5,
    childShareKilled: 0.1, childShareInjured: 0.2,
  });
  close(harm.drones, 1000);
  close(harm.killed, 50);
  close(harm.injured, 200);
  close(harm.childrenKilled, 5);
  close(harm.campaignMultiple, 1);
});

test("zero saving produces an empty receipt", () => {
  const { low, high } = runRange(params, "eu", "diesel", 0);
  assert.equal(low.revenue, 0);
  assert.equal(high.drones, 0);
});

test("low scenario never exceeds high scenario", () => {
  [0.02, 0.1, 0.3, 0.6].forEach((saving) => {
    const { low, high } = runRange(params, "eu", "diesel", saving);
    assert.ok(low.revenue <= high.revenue, `revenue at ${saving}`);
    assert.ok(low.drones <= high.drones, `drones at ${saving}`);
  });
});

test("supply is capped at the Russian maximum and flagged", () => {
  const { central } = runRange(params, "us", "diesel", 1.5);
  assert.equal(central.capped, true);
  close(central.supplied, params.russia.maxExtraSupply.value);
});

test("sanity: central revenue stays below one month of actual Russian oil and gas revenue", () => {
  const { central } = runRange(params, "eu", "diesel", 0.3);
  assert.ok(central.revenue < params.russia.oilGasRevenueMonth.value);
});

test("pooling averages only months with both casualties and a drone count", () => {
  const pooled = poolHarm(params.harm.months);
  close(pooled.launches, (5749 + 8653) / 2);
  close(pooled.killedRef, (126 + 183) / 2);
  close(pooled.injuredRef, (907 + 967) / 2);
  close(pooled.childShareKilled, (7 + 17) / (293 + 437));
  assert.equal(pooled.period, "June to July 2026");
  assert.deepEqual(pooled.pending, ["August 2026"]);
});

test("a month joins the average as soon as its drone count is filled in", () => {
  const months = params.harm.months.map((m) =>
    m.month === "2026-08" ? { ...m, launches: { value: 7000 } } : m,
  );
  const pooled = poolHarm(months);
  assert.equal(pooled.period, "June to August 2026");
  assert.deepEqual(pooled.pending, []);
});

test("the sign shows the buying price after the discount", () => {
  const view = buildView(params, { regionId: "eu", fuel: "diesel", steps: 10 });
  assert.equal(view.sign.price, (params.regions.eu.prices.diesel.value - 0.10).toFixed(2));
  assert.equal(view.sign.discounted, true);
  assert.equal(buildView(params, { regionId: "eu", fuel: "diesel", steps: 0 }).sign.discounted, false);
});

const observedDroneToll = () => poolHarm(params.harm.months).killedRef * params.harm.droneShare.value;

test("display rule: casualty lines never show more than the observed drone toll", () => {
  const view = buildView(params, { regionId: "eu", fuel: "diesel", steps: 30 });
  const observed = Math.round(observedDroneToll());
  const killedLine = view.lines.find((line) => line.label.startsWith("Civilians killed"));
  const numbers = killedLine.value.replace(/,/g, "").match(/\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.max(...numbers) <= observed, killedLine.value);
});

test("display rule also caps child casualties at the observed child toll", () => {
  const view = buildView(params, { regionId: "eu", fuel: "diesel", steps: 30 });
  const observedChildren = Math.round(observedDroneToll() * poolHarm(params.harm.months).childShareKilled);
  const childLine = view.lines.find((line) => line.label === "Of them, children killed");
  const numbers = childLine.value.match(/\d+(\.\d+)?/g).map(Number);
  assert.ok(Math.max(...numbers) <= observedChildren, childLine.value);
  assert.ok(numbers.every(Number.isInteger), `no fractional children: ${childLine.value}`);
});

test("every sourced parameter carries a URL, every assumption says so", () => {
  const walk = (node) =>
    node && typeof node === "object"
      ? [...("verified" in node ? [node] : []), ...Object.values(node).flatMap(walk)]
      : [];
  walk(params).forEach((p) => {
    assert.equal(typeof p.note, "string", JSON.stringify(p));
    if (p.verified && p.source !== null) assert.match(p.source.url, /^https:\/\//);
  });
});
