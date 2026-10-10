/**
 * Pure calculation model: pump saving -> extra crude -> Russian revenue -> drones -> casualties.
 * Every function takes plain data and returns plain data. No DOM, no fetch.
 */

const DAYS_PER_MONTH = 30;
const BARRELS_PER_MB = 1e6;

// Which bound of an uncertain parameter pushes the result DOWN. "high" scenario flips it.
const lowerBoundFor = {
  priceFlexibility: "high",
  stateTake: "low",
  maxExtraSupply: "low",
  unitCost: "high",
  droneShare: "low",
};

const flip = { low: "high", high: "low" };

const boundFor = (name, scenario) =>
  scenario === "central" ? "value" : scenario === "low" ? lowerBoundFor[name] : flip[lowerBoundFor[name]];

const pick = (param, name, scenario) => param[boundFor(name, scenario)] ?? param.value;

const RATE_FIELDS = ["launches", "longRangeKilled", "longRangeInjured"];
const CHILD_FIELDS = ["killed", "injured", "childrenKilled", "childrenInjured"];

const hasAll = (fields) => (month) => fields.every((field) => month[field]?.value != null);
const total = (months, field) => months.reduce((sum, month) => sum + month[field].value, 0);

const periodLabel = (months) =>
  months.length === 1 ? months[0].label : `${months[0].short} to ${months.at(-1).label}`;

/** Monthly averages over every month with complete data; incomplete months are reported, not guessed. */
export const poolHarm = (months) => {
  const rated = months.filter(hasAll(RATE_FIELDS));
  const withChildren = months.filter(hasAll(CHILD_FIELDS));
  return {
    launches: total(rated, "launches") / rated.length,
    killedRef: total(rated, "longRangeKilled") / rated.length,
    injuredRef: total(rated, "longRangeInjured") / rated.length,
    childShareKilled: total(withChildren, "childrenKilled") / total(withChildren, "killed"),
    childShareInjured: total(withChildren, "childrenInjured") / total(withChildren, "injured"),
    period: periodLabel(rated),
    pending: months.filter((month) => !hasAll(RATE_FIELDS)(month)).map((month) => month.label),
  };
};

/** Flattens params.json into the numbers one scenario needs. */
export const resolveInputs = (params, regionId, fuel, scenario) => {
  const region = params.regions[regionId];
  const harm = poolHarm(params.harm.months);
  return {
    pumpPrice: region.prices[fuel].value,
    vat: region.vat.value,
    fx: region.fx.value,
    unitsPerBarrel: region.unitsPerBarrel,
    tankSize: region.tankSize,
    brent: params.oil.brent.value,
    worldSupply: params.oil.worldSupply.value,
    priceFlexibility: pick(params.oil.priceFlexibility, "priceFlexibility", scenario),
    exports: params.russia.exports.value,
    discountNow: params.russia.discountNow.value,
    discountRelief: params.russia.discountRelief.value,
    maxExtraSupply: pick(params.russia.maxExtraSupply, "maxExtraSupply", scenario),
    stateTake: pick(params.russia.stateTake, "stateTake", scenario),
    unitCost: pick(params.drones.unitCost, "unitCost", scenario),
    launches: harm.launches,
    killedRef: harm.killedRef,
    injuredRef: harm.injuredRef,
    droneShare: pick(params.harm.droneShare, "droneShare", scenario),
    childShareKilled: harm.childShareKilled,
    childShareInjured: harm.childShareInjured,
  };
};

// Step 1: taxes and margins assumed fixed, so only the crude component moves (conservative).
export const crudeDropPerBarrel = ({ saving, vat, fx, unitsPerBarrel }) =>
  (saving / (1 + vat)) * fx * unitsPerBarrel;

// Step 2: %price = flexibility x %supply.
export const extraSupplyNeeded = ({ crudeDrop, brent, worldSupply, priceFlexibility }) =>
  worldSupply * (crudeDrop / brent) / priceFlexibility;

// Relief narrows the Urals discount in proportion to how much extra Russian oil is let in.
export const uralsDiscount = ({ supplied, maxExtraSupply, discountNow, discountRelief }) =>
  discountNow - (discountNow - discountRelief) * Math.min(1, supplied / maxExtraSupply);

// Step 3: net of the loss on barrels Russia already sells at the lower world price.
export const revenueDeltaPerMonth = ({ supplied, crudeDrop, brent, exports, discountNow, discount, stateTake }) => {
  const before = exports * (brent - discountNow);
  const after = (exports + supplied) * (brent - crudeDrop - discount);
  return stateTake * (after - before) * BARRELS_PER_MB * DAYS_PER_MONTH;
};

// Steps 4-5: money as drone-equivalents, drones as a share of last reference month's toll.
export const harmFromRevenue = ({ revenue, unitCost, launches, killedRef, injuredRef, droneShare, ...shares }) => {
  const drones = Math.max(0, revenue) / unitCost;
  const killed = (drones * killedRef * droneShare) / launches;
  const injured = (drones * injuredRef * droneShare) / launches;
  return {
    drones,
    killed,
    injured,
    childrenKilled: killed * shares.childShareKilled,
    childrenInjured: injured * shares.childShareInjured,
    campaignMultiple: drones / launches,
  };
};

/** Full pipeline for one scenario. Returns everything a consumer needs, pre-computed. */
export const runScenario = (inputs, saving) => {
  const crudeDrop = crudeDropPerBarrel({ ...inputs, saving });
  const needed = extraSupplyNeeded({ ...inputs, crudeDrop });
  const supplied = Math.min(needed, inputs.maxExtraSupply);
  // When capped, Russian oil alone only delivers part of the drop; the rest would need someone else's barrels.
  const achievedDrop = needed > 0 ? crudeDrop * (supplied / needed) : 0;
  const discount = uralsDiscount({ ...inputs, supplied });
  const revenue = saving > 0 ? revenueDeltaPerMonth({ ...inputs, supplied, crudeDrop: achievedDrop, discount }) : 0;
  return {
    saving,
    perTank: saving * inputs.tankSize,
    crudeDrop,
    achievedDrop,
    needed,
    supplied,
    capped: needed > inputs.maxExtraSupply,
    revenue,
    ...harmFromRevenue({ ...inputs, revenue }),
  };
};

/** Low and high scenarios side by side; the headline uses low. */
export const runRange = (params, regionId, fuel, saving) => ({
  low: runScenario(resolveInputs(params, regionId, fuel, "low"), saving),
  central: runScenario(resolveInputs(params, regionId, fuel, "central"), saving),
  high: runScenario(resolveInputs(params, regionId, fuel, "high"), saving),
});
