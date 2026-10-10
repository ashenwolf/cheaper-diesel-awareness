/**
 * DOM consumer: reads UI state, asks view.js for a view model, writes it to the page.
 */
import { buildView, sliderSpec } from "./view.js";

const PARAMS_URL = "data/params.json";

const regions = ["eu", "us"];
const fuels = ["diesel", "petrol"];

const $ = (selector, root = document) => root.querySelector(selector);
const bind = (name) => $(`[data-bind="${name}"]`);

const defaultRegion = () => ((navigator.language || "").toLowerCase() === "en-us" ? "us" : "eu");

const stateFromUrl = (params) => {
  const query = new URLSearchParams(location.search);
  const regionId = regions.includes(query.get("r")) ? query.get("r") : defaultRegion();
  const fuel = fuels.includes(query.get("f")) ? query.get("f") : "diesel";
  const max = sliderSpec(params, regionId, fuel).max;
  const steps = Math.min(max, Math.max(0, Number.parseInt(query.get("s") ?? "0", 10) || 0));
  return { regionId, fuel, steps };
};

const writeUrl = ({ regionId, fuel, steps }) => {
  const query = new URLSearchParams({ r: regionId, f: fuel, s: String(steps) });
  history.replaceState(null, "", `${location.pathname}?${query}`);
};

const renderSign = (sign) => {
  bind("currency").textContent = sign.currencySymbol;
  bind("price").textContent = sign.price;
  bind("unit").textContent = sign.unit;
  bind("priceLabel").textContent = sign.discounted ? "Your price" : "Pump price today";
  bind("listPrice").textContent = sign.discounted ? sign.listPrice : "";
  $(".sign").dataset.discounted = String(sign.discounted);
  bind("regionLabel").textContent = sign.regionLabel;
  bind("asOf").textContent = sign.asOf;
  bind("source").textContent = sign.sourceLabel;
  bind("source").href = sign.sourceUrl;
};

// The input runs reversed: far right = today's price, moving left = cheaper.
const positionFor = (slider) => slider.max - slider.steps;

const stepsFromInput = (input) => Number(input.max) - Number(input.value);

const renderSlider = (slider) => {
  const input = $("#saving");
  input.max = String(slider.max);
  input.value = String(positionFor(slider));
  input.style.setProperty("--fill", `${(positionFor(slider) / slider.max) * 100}%`);
};

const renderSaving = (saving) => {
  bind("perUnit").textContent = saving.isZero ? "Drag left to save" : `You save ${saving.perUnit}`;
  bind("perTank").textContent = saving.isZero ? "" : `That is ${saving.perTank}.`;
};

const lineNode = (line) => {
  const node = $("#line-template").content.firstElementChild.cloneNode(true);
  node.dataset.tone = line.tone ?? "plain";
  $("dt", node).textContent = line.label;
  $("dd", node).textContent = line.value;
  return node;
};

const noteNode = (text) => Object.assign(document.createElement("li"), { textContent: text });

const renderReceipt = (view) => {
  const receipt = $(".receipt");
  receipt.dataset.state = view.printed ? "printed" : "empty";
  $(".receipt__lines").replaceChildren(...(view.printed ? view.lines.map(lineNode) : []));
  $(".receipt__notes").replaceChildren(...view.notes.map(noteNode));
};

const render = (params, state) => {
  const view = buildView(params, state);
  renderSign(view.sign);
  renderSlider(view.slider);
  $("#saving").setAttribute("aria-valuetext", `${view.sign.currencySymbol}${view.sign.price} ${view.sign.unit}`);
  renderSaving(view.saving);
  renderReceipt(view);
  document.body.dataset.share = view.shareText;
  return view;
};

const syncRadios = ({ regionId, fuel }) => {
  $(`input[name="region"][value="${regionId}"]`).checked = true;
  $(`input[name="fuel"][value="${fuel}"]`).checked = true;
};

const toast = (text) => {
  const node = $(".toast");
  node.textContent = text;
  node.hidden = false;
  setTimeout(() => { node.hidden = true; }, 2600);
};

const share = async () => {
  const text = document.body.dataset.share;
  const url = location.href;
  if (navigator.share) {
    await navigator.share({ title: "Cheaper Diesel", text, url }).catch(() => {});
    return;
  }
  await navigator.clipboard.writeText(`${text} ${url}`)
    .then(() => toast("Receipt copied. Paste it anywhere."))
    .catch(() => toast("Copy failed. Select the address bar and copy the link."));
};

const start = (params) => {
  const initial = stateFromUrl(params);
  syncRadios(initial);
  const read = (overrides = {}) => ({
    regionId: $('input[name="region"]:checked').value,
    fuel: $('input[name="fuel"]:checked').value,
    steps: stepsFromInput($("#saving")),
    ...overrides,
  });
  const update = (state) => {
    render(params, state);
    writeUrl(state);
  };
  update(initial);
  $(".sign__controls").addEventListener("change", () => update(read({ steps: 0 })));
  $("#saving").addEventListener("input", () => update(read()));
  $('[data-action="share"]').addEventListener("click", share);
};

const fail = (error) => {
  $(".receipt__empty").textContent = "The price data did not load. Reload the page to try again.";
  console.error(error);
};

fetch(PARAMS_URL)
  .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
  .then(start)
  .catch(fail);
