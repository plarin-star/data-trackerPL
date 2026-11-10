# Fitness Stock Tracker

[![Tests](https://github.com/plarin-star/data-trackerPL/actions/workflows/tests.yml/badge.svg)](https://github.com/plarin-star/data-trackerPL/actions/workflows/tests.yml)
[![Daily pipeline](https://github.com/plarin-star/data-trackerPL/actions/workflows/daily.yml/badge.svg)](https://github.com/plarin-star/data-trackerPL/actions/workflows/daily.yml)

A tool that tracks 15 fitness company stocks every day. Each day, on its own, it
downloads the latest quotes, rebuilds a history with one row per stock per day,
opens a GitHub Issue with the biggest moves, and publishes the results to a website.

> Work in progress: the daily pipeline runs first so the history can grow while
> the website is built. The full file list, column definitions and site guide
> will be added here as each part is finished.

## The items: 15 fitness stocks

The ticker symbol is the `item_id`. It never changes, so each company lines up
from one day to the next.

| Category | Stocks |
|---|---|
| Gyms & Studios | PLNT Planet Fitness, LTH Life Time Group, XPOF Xponential Fitness |
| Apparel & Footwear | NKE Nike, LULU Lululemon, UAA Under Armour, ONON On Holding, DECK Deckers (Hoka) |
| Equipment & Wearables | PTON Peloton, GRMN Garmin, AS Amer Sports |
| Sporting Goods Retail | DKS Dick's Sporting Goods, ASO Academy Sports |
| Fitness Nutrition | CELH Celsius Holdings, BRBR BellRing Brands |

## Sources

| Source | Format | Login | What is kept |
|---|---|---|---|
| Yahoo Finance chart endpoint (`query1.finance.yahoo.com/v8/finance/chart/<ticker>?range=5d&interval=1d`) | JSON | none | The reply for each of the 15 tickers only |
| Nasdaq quote endpoint (`api.nasdaq.com/api/quote/<ticker>/info?assetclass=stocks`) | JSON | none | The reply for each of the 15 tickers only |
| Finnhub quote endpoint (`finnhub.io/api/v1/quote?symbol=<ticker>`) | JSON | free API key, stored as the repository secret `FINNHUB_API_KEY` | The reply for each of the 15 tickers only |

Yahoo is the main source; Nasdaq and Finnhub are backups. When more than one
source reports a stock on the same day, the history keeps one row for it, from
the first source in this order: Yahoo, Nasdaq, Finnhub. The `source` column
says which one it came from.

## How a daily run works

`python -m tracker.run`, started by `.github/workflows/daily.yml` at 22:17 UTC:

1. **Fetch**: call each source and save its reply to `data/raw/<YYYY-MM-DD>/<source>.json.gz`. A source that fails saves nothing that day, and the run continues.
2. **Build**: rebuild `data/history.csv` from all raw files.
3. **Status**: write `data/status.json` and add a line per source to `data/run_log.csv`.
4. **Issue**: open an issue titled with the date, listing the biggest moves, and close the previous one.
5. **Commit**: the workflow commits the `data/` folder.

A second run on the same UTC day replaces that day's raw files, so each day counts once.

## Move rule

For every stock with a close on both of the last two dates in the history:
`move % = (new close − old close) / old close × 100`. Stocks are ranked by the
size of the move, biggest first (ties by ticker), and the issue lists the top 5.
Stocks present on only one of the two dates are listed as appeared or disappeared.

## Website

Live at **https://plarin-star.github.io/data-trackerPL/** (GitHub Pages, `main` branch, root folder).
The pages load `data/history.csv` and `data/status.json` in the browser and do every calculation there.

| Page | What it shows |
|---|---|
| `index.html` (Today) | Time of the last run, the status of each source, the counts from the status file, the biggest move, the top 5 moves since the previous run, and the latest values of every stock with their change since the previous run |
| `browse.html` (Browse) | Latest values with filters (category, direction since last run, source, price range, starred), a search box for company names and tickers, sorting on every numeric column up and down, and a star on every stock that saves it to a shortlist kept in the browser (`localStorage`) |
| `trends.html` (Trends) | A line chart of any value over the days with a stock picker, and five findings, each computed from `history.csv` with a chart and the numbers behind it |

The site installs as an app (`manifest.webmanifest`, icons in `icons/`) and works offline:
`sw.js` fetches everything from the network first and keeps a copy, so with no connection the
pages still open and show the last data they loaded.

## Build the history from the raw files

```
python -m tracker.build
```

## Run the tests

```
pip install -r requirements.txt
python -m pytest
```
