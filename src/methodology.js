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
  { label: "Drones launched (reference month)", path: ["harm", "longRangeLaunches"], format: (p) => p.value.toLocaleString("en-GB") },
  { label: "Killed by long-range weapons", path: ["harm", "longRangeKilled"], format: (p) => String(p.value) },
  { label: "Injured by long-range weapons", path: ["harm", "longRangeInjured"], format: (p) => String(p.value) },
  { label: "Drone share of long-range casualties", path: ["harm", "droneShare"], format: (p) => `${p.value * 100}% (${p.low * 100} to ${p.high * 100}%)` },
  { label: "Child share of killed", path: ["harm", "childShareKilled"], format: (p) => `${(p.value * 100).toFixed(1)}%` },
  { label: "Child share of injured", path: ["harm", "childShareInjured"], format: (p) => `${(p.value * 100).toFixed(1)}%` },
  { label: "Latest month, all weapons", path: ["harm", "latestMonth"], format: (p) => `${p.killed} killed, ${p.injured} injured` },
];

const at = (object, path) => path.reduce((node, key) => node[key], object);

const cell = (content) => {
  const td = document.createElement("td");
  td.append(...[content].flat());
  return td;
};

const badge = (verified) =>
  Object.assign(document.createElement("span"), {
    className: "badge",
    textContent: verified ? "Sourced" : "Assumption",
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
  const status = badge(param.verified);
  status.dataset.verified = String(param.verified);
  const th = Object.assign(document.createElement("th"), { scope: "row", textContent: row.label });
  tr.append(th, cell(row.format(param)), cell(status), cell(sourceNodes(param)));
  return tr;
};

fetch("data/params.json")
  .then((response) => response.json())
  .then((params) => {
    document.getElementById("param-rows").replaceChildren(...rows.map((row) => rowNode(params, row)));
    document.getElementById("param-version").textContent = params.version;
  });
