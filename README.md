# Cheaper Diesel

A satirical single-page calculator. Pick a region and fuel, drag the slider to make the pump price cheaper, and read
the receipt: extra Russian oil let in, extra Kremlin budget revenue, Shahed drones that money pays for, and civilian
casualties at the latest verified monthly rate.

Static site, no build step, no backend, no cookies, no third-party requests (fonts are self-hosted).

## Run locally

```sh
npm test        # model tests, Node 20+
npm start       # serves on http://localhost:8080 (needs python3), any static server works
```

Opening `index.html` from the file system will not work: the page fetches `data/params.json`.

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository, branch `main`.
2. In the repository: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Every push to `main` runs the tests and deploys. Pull requests only run the tests.

## Layout

| Path | What it is |
| --- | --- |
| `data/params.json` | Every input, with value, range, `verified` flag, note and source URL |
| `src/model.js` | Pure calculation pipeline, five steps |
| `src/view.js` | Turns model output into plain receipt lines (formatting, display rules) |
| `src/app.js` | DOM layer: reads controls, renders the view, keeps state in the URL |
| `src/methodology.js` | Renders the parameter table on `methodology.html` from the same JSON |
| `tests/model.test.mjs` | Model tests plus data checks (sources present, display rule holds) |

## Updating the numbers

All numbers live in `data/params.json`. Change them in a pull request with the source link in the description;
the test suite fails if a sourced value has no URL. Suggested cadence:

| Input | Source | Cadence |
| --- | --- | --- |
| EU pump prices | EC Weekly Oil Bulletin | Weekly |
| US pump prices | EIA weekly retail prices, or BTS monthly | Weekly or monthly |
| Casualties, child shares | UN HRMMU monthly update | Monthly |
| Drones launched | Ukrainian Air Force, monthly tallies | Monthly |
| Brent, FX | EIA or ICE settlement, ECB reference rate | Weekly |
| Russian exports, Urals discount | S&P Global, Russian Economy Ministry | Monthly |

## Open items before a public launch

These inputs are assumptions or approximations and are marked yellow on the methodology page:

- `oil.priceFlexibility` and `russia.stateTake` drive most of the spread; find citable estimates (KSE Institute, CREA, IEA).
- `oil.brent` is read from a prediction market, not a settlement price.
- `oil.worldSupply`, `regions.eu.vat`, `regions.eu.fx` are approximations.
- `harm.droneShare`: HRMMU does not publish a missile/drone split. Ask them or a research group.
- `russia.maxExtraSupply` has no source.
- `russia.exports` covers seaborne volumes only. Adding a sourced pipeline figure would lower the revenue estimate.
- Pick a domain and confirm the name is not used by another campaign.
