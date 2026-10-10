/**
 * Producer for the page: turns params + UI state into a plain view model.
 * The DOM layer only reads these fields.
 */
import { poolHarm, runRange } from "./model.js";

const MAX_DISCOUNT_SHARE = 0.3;

const unitWords = {
  L: { one: "litre", tank: (n) => `${n}-litre tank` },
  gal: { one: "gallon", tank: (n) => `${n}-gallon tank` },
};

const fuelWords = { diesel: "Diesel", petrol: "Petrol" };

const currencySymbols = { EUR: "€", USD: "$" };

const formatDate = (iso) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

const money = (locale, currency, digits = 2) => (n) =>
  new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(n);

const whole = (n) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Math.round(n));

const oneDecimal = (n) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n);

const billions = (n) => `$${(n / 1e9).toFixed(n < 1e9 ? 2 : 1)} bn`;

const range = (fmt) => (lo, hi) => (fmt(lo) === fmt(hi) ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`);

// Casualty counts never extrapolate above the toll actually observed (display rule in the requirements).
const cappedRange = (lo, hi, observed) =>
  hi > observed ? `${whole(lo)} to ${whole(observed)}+` : range(whole)(lo, hi);

/** Slider positions: 0 = no discount; the DOM shows them reversed so the thumb starts on the right. */
export const sliderSpec = (params, regionId, fuel) => {
  const region = params.regions[regionId];
  const price = region.prices[fuel].value;
  const steps = Math.floor((price * MAX_DISCOUNT_SHARE) / region.step);
  return { min: 0, max: steps, step: 1, unitStep: region.step };
};

const signView = (params, regionId, fuel, saving) => {
  const region = params.regions[regionId];
  const price = region.prices[fuel];
  const fmt = money(region.locale, region.currency);
  return {
    fuelLabel: fuelWords[fuel],
    regionLabel: region.label,
    price: (price.value - saving).toFixed(2),
    currencySymbol: currencySymbols[region.currency],
    unit: `per ${unitWords[region.unit].one}`,
    listPrice: fmt(price.value),
    discounted: saving > 0,
    asOf: formatDate(price.asOf),
    sourceLabel: price.source.label,
    sourceUrl: price.source.url,
  };
};

const savingView = (region, saving, perTank) => {
  const fmt = money(region.locale, region.currency);
  return {
    perUnit: `${fmt(saving)} per ${unitWords[region.unit].one}`,
    perTank: `${fmt(perTank)} on a ${unitWords[region.unit].tank(region.tankSize)}`,
    isZero: saving === 0,
  };
};

// What drones actually caused in an average month of the period: the cap for every casualty line.
const observedToll = (params) => {
  const pooled = poolHarm(params.harm.months);
  const share = params.harm.droneShare.value;
  const killed = pooled.killedRef * share;
  const injured = pooled.injuredRef * share;
  return {
    ...pooled,
    killed,
    injured,
    childrenKilled: killed * pooled.childShareKilled,
    childrenInjured: injured * pooled.childShareInjured,
  };
};

const receiptLines = (region, toll, { low, high }) => [
  { label: "Your saving per tank", value: money(region.locale, region.currency)(low.perTank) },
  { label: "Extra oil let in from Russia", value: `${range(oneDecimal)(low.supplied, high.supplied)} m barrels a day` },
  { label: "Extra money for the Kremlin budget", value: `${range(billions)(low.revenue, high.revenue)} a month` },
  { label: "Enough to pay for Shahed drones", value: range(whole)(low.drones, high.drones), tone: "loud" },
  {
    label: `Civilians killed, at the ${toll.period} rate`,
    value: cappedRange(low.killed, high.killed, toll.killed),
    tone: "harm",
  },
  { label: "Civilians injured", value: cappedRange(low.injured, high.injured, toll.injured), tone: "harm" },
  {
    label: "Of them, children killed",
    value: cappedRange(low.childrenKilled, high.childrenKilled, toll.childrenKilled),
    tone: "harm",
  },
  {
    label: "Of them, children injured",
    value: cappedRange(low.childrenInjured, high.childrenInjured, toll.childrenInjured),
    tone: "harm",
  },
].map((line, i) => ({ ...line, id: `line-${i}` }));

// Saving at which needed supply hits the central Russian cap: invert steps 1 and 2.
const capSaving = (params, regionId) => {
  const region = params.regions[regionId];
  const { oil, russia } = params;
  const crudeDrop = (russia.maxExtraSupply.value * oil.priceFlexibility.value * oil.brent.value) / oil.worldSupply.value;
  return (crudeDrop * (1 + region.vat.value)) / (region.fx.value * region.unitsPerBarrel);
};

const receiptNotes = (params, regionId, toll, { low, central, high }) => {
  const region = params.regions[regionId];
  const fmt = money(region.locale, region.currency);
  return [
    high.campaignMultiple > 1
      ? `The upper estimate pays for ${oneDecimal(high.campaignMultiple)} times the drones Russia launches in an average month ` +
        `(${toll.period}). In such a month, drones killed about ${whole(toll.killed)} civilians. ` +
        "We do not extrapolate beyond the real toll."
      : null,
    central.capped
      ? `Russia cannot pump that much. Past about ${fmt(capSaving(params, regionId))} per ${unitWords[region.unit].one}, ` +
        "the rest of your discount would need someone else's oil."
      : null,
    low.revenue <= 0 ? "On these numbers Russia earns nothing extra. Enjoy it, it is rare." : null,
    toll.pending.length > 0
      ? `Casualty rate covers ${toll.period}. ${toll.pending.join(", ")} will be added once a monthly drone count is published.`
      : null,
  ].filter(Boolean);
};

const shareText = (region, sign, saving, lines) =>
  saving.isZero
    ? "How much does cheaper diesel really cost? Try the slider."
    : `I saved ${saving.perUnit} on ${sign.fuelLabel.toLowerCase()} (${region.label}). ` +
      `Receipt: ${lines.at(3).value} Shahed drones, ${lines.at(4).value} civilians killed in Ukraine.`;

/** Builds everything the page renders from params and state. */
export const buildView = (params, { regionId, fuel, steps }) => {
  const region = params.regions[regionId];
  const saving = Math.round(steps * region.step * 100) / 100;
  const results = runRange(params, regionId, fuel, saving);
  const toll = observedToll(params);
  const sign = signView(params, regionId, fuel, saving);
  const savingText = savingView(region, saving, results.low.perTank);
  const lines = receiptLines(region, toll, results);
  return {
    sign,
    slider: { ...sliderSpec(params, regionId, fuel), steps },
    saving: savingText,
    lines,
    notes: saving > 0 ? receiptNotes(params, regionId, toll, results) : [],
    shareText: shareText(region, sign, savingText, lines),
    printed: saving > 0,
  };
};
