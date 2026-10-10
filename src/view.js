/**
 * Producer for the page: turns params + UI state into a plain view model.
 * The DOM layer only reads these fields.
 */
import { runRange } from "./model.js";

const MAX_DISCOUNT_SHARE = 0.3;

const unitWords = {
  L: { one: "litre", tank: (n) => `${n}-litre tank` },
  gal: { one: "gallon", tank: (n) => `${n}-gallon tank` },
};

const fuelWords = { diesel: "Diesel", petrol: "Petrol" };

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

const childRange = (lo, hi, observedShare, observed) => cappedRange(lo, hi, observed * observedShare);

export const sliderSpec = (params, regionId, fuel) => {
  const region = params.regions[regionId];
  const price = region.prices[fuel].value;
  const steps = Math.floor((price * MAX_DISCOUNT_SHARE) / region.step);
  return { min: 0, max: steps, step: 1, unitStep: region.step };
};

const signView = (params, regionId, fuel) => {
  const region = params.regions[regionId];
  const price = region.prices[fuel];
  return {
    fuelLabel: fuelWords[fuel],
    regionLabel: region.label,
    price: price.value.toFixed(2),
    currencySymbol: region.currency === "EUR" ? "€" : "$",
    unit: `per ${unitWords[region.unit].one}`,
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

const receiptLines = (params, region, { low, high }) => {
  const harm = params.harm;
  const droneToll = (n) => n.value * harm.droneShare.value;
  const killedObserved = droneToll(harm.longRangeKilled);
  const injuredObserved = droneToll(harm.longRangeInjured);
  return [
    { label: "Your saving per tank", value: money(region.locale, region.currency)(low.perTank) },
    { label: "Extra oil let in from Russia", value: `${range(oneDecimal)(low.supplied, high.supplied)} m barrels a day` },
    { label: "Extra money for the Kremlin budget", value: `${range(billions)(low.revenue, high.revenue)} a month` },
    { label: "Enough to pay for Shahed drones", value: range(whole)(low.drones, high.drones), tone: "loud" },
    {
      label: `Civilians killed, at ${harm.referenceMonth}'s rate`,
      value: cappedRange(low.killed, high.killed, killedObserved),
      tone: "harm",
    },
    { label: "Civilians injured", value: cappedRange(low.injured, high.injured, injuredObserved), tone: "harm" },
    {
      label: "Of them, children killed",
      value: childRange(low.childrenKilled, high.childrenKilled, harm.childShareKilled.value, killedObserved),
      tone: "harm",
    },
    {
      label: "Of them, children injured",
      value: childRange(low.childrenInjured, high.childrenInjured, harm.childShareInjured.value, injuredObserved),
      tone: "harm",
    },
  ].map((line, i) => ({ ...line, id: `line-${i}` }));
};

const receiptNotes = (params, regionId, { low, central, high }) => {
  const region = params.regions[regionId];
  const harm = params.harm;
  const fmt = money(region.locale, region.currency);
  const killedObserved = whole(harm.longRangeKilled.value * harm.droneShare.value);
  return [
    high.campaignMultiple > 1
      ? `The upper estimate pays for ${oneDecimal(high.campaignMultiple)} times every drone Russia launched in ${harm.referenceMonth}. ` +
        `That month, drones killed about ${killedObserved} civilians. We do not extrapolate beyond the real toll.`
      : null,
    central.capped
      ? `Russia cannot pump that much. Past about ${fmt(capSaving(params, regionId))} per ${unitWords[region.unit].one}, ` +
        "the rest of your discount would need someone else's oil."
      : null,
    low.revenue <= 0 ? "On these numbers Russia earns nothing extra. Enjoy it, it is rare." : null,
  ].filter(Boolean);
};

// Saving at which needed supply hits the central Russian cap: invert steps 1 and 2.
const capSaving = (params, regionId) => {
  const region = params.regions[regionId];
  const { oil, russia } = params;
  const crudeDrop = (russia.maxExtraSupply.value * oil.priceFlexibility.value * oil.brent.value) / oil.worldSupply.value;
  return (crudeDrop * (1 + region.vat.value)) / (region.fx.value * region.unitsPerBarrel);
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
  const sign = signView(params, regionId, fuel);
  const savingText = savingView(region, saving, results.low.perTank);
  const lines = receiptLines(params, region, results);
  return {
    sign,
    slider: { ...sliderSpec(params, regionId, fuel), value: steps },
    saving: savingText,
    lines,
    notes: saving > 0 ? receiptNotes(params, regionId, results) : [],
    shareText: shareText(region, sign, savingText, lines),
    printed: saving > 0,
  };
};
