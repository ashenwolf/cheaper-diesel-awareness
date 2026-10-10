/**
 * Renders the parameter table on the methodology page straight from params.json.
 */

const rows = [
  { label: "EU diesel price", path: ["regions", "eu", "prices", "diesel"], format: (p) => `€${p.value.toFixed(2)}/L` },
  { label: "EU petrol price", path: ["regions", "eu", "prices", "petrol"], format: (p) => `€${p.value.toFixed(2)}/L` },
  { label: "US diesel price", path: ["regions", "us", "prices", "diesel"], format: (p) => `$${p.value.toFixed(2)}/gal` },
  { label: "US petrol price", path: ["regions", "us", "prices", "petrol"], format: (p) => `$${p.value.toFixed(2)}/gal` },
  { label: "EU average VAT", path: ["regions", "eu", "vat"], format: (p) => `${Math.round(p.value * 100)}%` },
  { label: "USD per EUR", path: ["regions", "eu", "fx"], format: (p) => p.value.toFixed(2) },
  { label: "Brent crude", path: ["oil", "brent"], format: (p) => `$${p.value}/bbl` },
  { label: "World oil supply", path: ["oil", "worldSupply"], format: (p) => `${p.value} mb/d` },
  { label: "Price flexibility", path: ["oil", "priceFlexibility"], format: (p) => `${p.value} (${p.low} to ${p.high})` },
  { label: "Russian seaborne exports", path: ["russia", "exports"], format: (p) => `${p.value} mb/d` },
  { label: "Urals discount now", path: ["russia", "discountNow"], format: (p) => `$${p.value}/bbl` },
  { label: "Urals discount after relief", path: ["russia", "discountRelief"], format: (p) => `$${p.value}/bbl` },
  { label: "Max extra Russian supply", path: ["russia", "maxExtraSupply"], format: (p) => `${p.value} mb/d (${p.low} to ${p.high})` },
  { label: "State take", path: ["russia", "stateTake"], format: (p) => `${p.value * 100}% (${p.low * 100} to ${p.high * 100}%)` },
  { label: "Russian oil and gas revenue", path: ["russia", "oilGasRevenueMonth"], format: (p) => `$${(p.value / 1e9).toFixed(2)} bn/month` },
  { label: "Drone unit cost", path: ["drones", "unitCost"], format: (p) => `$${p.value / 1000}k ($${p.low / 1000}k to $${p.high / 1000}k)` },
  { label: "Drone share of long-range casualties", path: ["harm", "droneShare"], format: (p) => `${p.value * 100}% (${p.low * 100} to ${p.high * 100}%)` },
];

const monthFields = [
  { key: "launches", label: "drones launched" },
  { key: "killed", label: "civilians killed, all weapons" },
  { key: "injured", label: "civilians injured, all weapons" },
  { key: "longRangeKilled", label: "killed by long-range weapons" },
  { key: "longRangeInjured", label: "injured by long-range weapons" },
  { key: "childrenKilled", label: "children killed" },
  { key: "childrenInjured", label: "children injured" },
];

// One table row per month and field, so every casualty figure shows its own source.
const monthRows = (params) =>
  params.harm.months.flatMap((month, i) =>
    monthFields.map((field) => ({
      label: `${month.label}: ${field.label}`,
      path: ["harm", "months", i, field.key],
      format: (p) => (p.value == null ? "Not published" : p.value.toLocaleString("en-GB")),
    })),
  );

const at = (object, path) => path.reduce((node, key) => node[key], object);

const cell = (content) => {
  const td = document.createElement("td");
  td.append(...[content].flat());
  return td;
};

const statusText = (param) =>
  param.derived ? "Derived" : param.value == null ? "Missing" : param.verified ? "Sourced" : "Assumption";

const badge = (param) =>
  Object.assign(document.createElement("span"), {
    className: "badge",
    textContent: statusText(param),
  });

const sourceNodes = (param) => {
  const note = document.createTextNode(`${param.note} `);
  if (!param.source) return [note];
  const link = Object.assign(document.createElement("a"), { href: param.source.url, textContent: param.source.label });
  return [note, "Source: ", link, "."];
};

const rowNode = (params, row) => {
  const param = at(params, row.path);
  const tr = document.createElement("tr");
  const status = badge(param);
  status.dataset.verified = String(param.verified && !param.derived);
  const th = Object.assign(document.createElement("th"), { scope: "row", textContent: row.label });
  tr.append(th, cell(row.format(param)), cell(status), cell(sourceNodes(param)));
  return tr;
};

fetch("data/params.json")
  .then((response) => response.json())
  .then((params) => {
    const allRows = [...rows, ...monthRows(params)];
    document.getElementById("param-rows").replaceChildren(...allRows.map((row) => rowNode(params, row)));
    document.getElementById("param-version").textContent = params.version;
  });
