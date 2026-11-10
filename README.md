# Fitness Stock Tracker

[![Tests](https://github.com/plarin-star/data-trackerPL/actions/workflows/tests.yml/badge.svg)](https://github.com/plarin-star/data-trackerPL/actions/workflows/tests.yml)
[![Daily pipeline](https://github.com/plarin-star/data-trackerPL/actions/workflows/daily.yml/badge.svg)](https://github.com/plarin-star/data-trackerPL/actions/workflows/daily.yml)

A tool that tracks 15 fitness company stocks every day. Each day, on its own, it
downloads the latest quotes, rebuilds a history with one row per stock per day,
opens a GitHub Issue with the biggest moves, and publishes the results to a website.

**Website:** https://plarin-star.github.io/data-trackerPL/

## The items: 15 fitness stocks

The ticker symbol is the `item_id`. It never changes, so each company lines up
from one day to the next. The list lives in `tracker/config.py`.

| Category | Stocks |
|---|---|
| Gyms & Studios | PLNT Planet Fitness, LTH Life Time Group, XPOF Xponential Fitness |
| Apparel & Footwear | NKE Nike, LULU Lululemon, UAA Under Armour, ONON On Holding, DECK Deckers (Hoka) |
| Equipment & Wearables | PTON Peloton, GRMN Garmin, AS Amer Sports |
| Sporting Goods Retail | DKS Dick's Sporting Goods, ASO Academy Sports |
| Fitness Nutrition | CELH Celsius Holdings, BRBR BellRing Brands |

## Sources

| Source | Address | Format | Login | What is kept |
|---|---|---|---|---|
| Yahoo Finance chart endpoint | `query1.finance.yahoo.com/v8/finance/chart/<ticker>?range=5d&interval=1d` | JSON | none | Yahoo's reply for each of the 15 tickers, nothing else. Each reply holds the last 5 trading days; the build uses the last two. |
| Nasdaq quote endpoint | `api.nasdaq.com/api/quote/<ticker>/info?assetclass=stocks` | JSON | none | Nasdaq's reply for each of the 15 tickers, nothing else |
| Finnhub quote endpoint | `finnhub.io/api/v1/quote?symbol=<ticker>` | JSON | free API key, stored as the repository secret `FINNHUB_API_KEY` and sent in a request header, never written to any file | Finnhub's reply for each of the 15 tickers, nothing else |

Each source's replies for one day are saved together, unchanged, in one gzip file:
`data/raw/<YYYY-MM-DD>/<source>.json.gz`, as `{"responses": {ticker: reply}, "errors": {ticker: message}}`.

Yahoo is the main source; Nasdaq and Finnhub are backups. When more than one
source reports a stock on the same day, the history keeps one row for it, from
the first source in this order: Yahoo, Nasdaq, Finnhub. The `source` column
says which one it came from.

Yahoo refuses plain scripts from cloud computers (HTTP 429), so the Yahoo
downloader uses `curl_cffi`, which sends the request the way the Chrome browser does.

## How a daily run works

`python -m tracker.run`, started by `.github/workflows/daily.yml` every day at
22:17 UTC (after the US market closes at 21:00 UTC). A backup run at 23:37 UTC
does the same thing only if no raw file was saved that day.

1. **Fetch**: call each source and save its reply to `data/raw/<YYYY-MM-DD>/<source>.json.gz`. A source that fails saves no file that day, and the run continues. Every source's result (worked or failed, number of stocks, error) goes into the status file and the run log.
2. **Build**: rebuild `data/history.csv` from all raw files (see below).
3. **Status**: write `data/status.json` and add one line per source to `data/run_log.csv`.
4. **Issue**: open a GitHub Issue titled with the UTC date (label `daily-report`) listing the biggest moves, appeared and disappeared stocks, and each source's result, then close the previous day's issue. An issue is opened every day, even when nothing moved.
5. **Commit**: the workflow commits the `data/` folder.

The date of a run is the UTC date of the moment it runs. A second run on the
same UTC date deletes that day's raw folder first, saves new raw files, rebuilds
the history and updates that day's issue, so each day counts once.

## Build the history from the raw files

```
python -m tracker.build
```

The build reads only `data/raw/`. For each day folder, oldest first, it converts
each source's raw file into rows with the common columns below, keeps one row per
stock (by source priority), and writes the whole file again, sorted by `date`
then `item_id`. A day with no raw file for a source has no rows from that source.
Numbers are written the same way every time (at most 4 decimals), so running the
build again gives a byte-for-byte identical file.

## Columns of `data/history.csv`

| Column | Meaning | Unit |
|---|---|---|
| `date` | UTC date of the run that saved the raw file | YYYY-MM-DD |
| `item_id` | Ticker symbol, the key that lines a stock up from day to day | text |
| `item` | Company name | text |
| `source` | Source the row came from: `yahoo`, `nasdaq` or `finnhub` | text |
| `category` | Our group for the company (one of the five above) | text |
| `close` | Latest regular-session closing price | US dollars |
| `change` | `close` minus `prev_close` | US dollars |
| `change_pct` | `change` ÷ `prev_close` × 100 | percent |
| `open` | Opening price of that trading day (empty for Nasdaq) | US dollars |
| `high` | Highest price of that trading day | US dollars |
| `low` | Lowest price of that trading day | US dollars |
| `prev_close` | Closing price of the trading day before | US dollars |
| `volume` | Shares traded that trading day (empty for Finnhub) | shares |
| `market_date` | The trading day the prices belong to (on weekends and holidays it stays on the last trading day) | YYYY-MM-DD, New York time |
| `currency` | Currency of the prices | text (`USD`) |

A value that a source does not report is left empty.

## `data/status.json`

`run_time` (UTC, ISO 8601), `run_date`, `first_run_date` (date of the earliest raw
file), `days_with_success` (number of dates with at least one raw file), `items`
(stocks in the latest run), `new_today` and `gone_today` (tickers that appeared or
disappeared since the previous date), `previous_date`, and `sources`: one entry per
source with `name`, `ok`, `count` and `error`.

## Move rule

For every stock with a close on both of the last two dates in `history.csv`:

```
move % = (new close − old close) ÷ old close × 100
```

Stocks are ranked by the size of the move (absolute value), biggest first, ties
broken by ticker. The daily issue and the Today page list the top 5, with the old
and new closing prices. A stock present on only one of the two dates is listed as
appeared or disappeared. On weekends and holidays no price changes, so every move
is 0% and the issue says the market was most likely closed. The rule is coded in
`tracker/moves.py` and, for the website, in `assets/app.js`.

## Website

Served by GitHub Pages from the `main` branch, root folder. The pages load
`data/history.csv` and `data/status.json` in the browser and do every calculation there.

| Page | What it shows |
|---|---|
| `index.html` (Today) | Time of the last run, the status of each source, the counts from the status file, the biggest move, the top 5 moves since the previous run, and the latest values of every stock with their change since the previous run |
| `browse.html` (Browse) | Latest values with filters (category, direction since last run, source, price range, starred), a search box for company names and tickers, sorting on every numeric column up and down, and a star on every stock that saves it to a shortlist kept in the browser (`localStorage`) |
| `trends.html` (Trends) | A line chart of any value over the days with a stock picker, and five findings computed from `history.csv`, each with a chart, the numbers behind it, and how they are computed |

The site installs as an app (`manifest.webmanifest`, icons in `icons/`) and works
offline: `sw.js` fetches everything from the network first and keeps a copy, so
with no connection the pages still open and show the last data they loaded.

## Run the tests

```
pip install -r requirements.txt
python -m pytest
```

The tests cover each source's conversion to the common columns, the move rule,
and the history build, including a failed source and a second run on the same day.
GitHub Actions runs them on every push (`.github/workflows/tests.yml`).

## Every file

| File | What it does |
|---|---|
| `README.md` | This file |
| `requirements.txt` | Python packages: `requests`, `curl_cffi`, `pytest` |
| `.gitignore` | Files git should ignore (Python caches, virtual environments) |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |
| **Pipeline** | |
| `tracker/__init__.py` | Marks `tracker` as a Python package |
| `tracker/config.py` | The 15 stocks, their categories, the source priority, and how many moves the issue lists |
| `tracker/run.py` | The daily run: fetch, build, status, issue |
| `tracker/fetch.py` | Calls every source and saves the gzipped raw files; one failed source does not stop the others |
| `tracker/build.py` | Builds `data/history.csv` from the raw files alone (`python -m tracker.build`) |
| `tracker/moves.py` | The move rule |
| `tracker/status.py` | Writes `data/status.json` and adds to `data/run_log.csv` |
| `tracker/issue.py` | Opens, updates and closes the daily GitHub Issue |
| `tracker/sources/__init__.py` | The list of sources |
| `tracker/sources/yahoo.py` | Downloads and converts Yahoo Finance replies |
| `tracker/sources/nasdaq.py` | Downloads and converts Nasdaq replies |
| `tracker/sources/finnhub.py` | Downloads and converts Finnhub replies |
| `tracker/sources/http.py` | A GET helper that retries when a server is busy |
| **Tests** | |
| `tests/conftest.py` | Fake source replies shaped like the real ones, shared by the tests |
| `tests/test_sources.py` | Yahoo and Finnhub conversion to the common columns |
| `tests/test_nasdaq.py` | Nasdaq conversion to the common columns |
| `tests/test_moves.py` | The move rule and the issue text |
| `tests/test_history.py` | The history build, a failed source, and a second run on the same day |
| **Workflows** | |
| `.github/workflows/daily.yml` | Runs the pipeline every day and commits the data |
| `.github/workflows/tests.yml` | Runs the tests on every push |
| **Data** | |
| `data/raw/<date>/<source>.json.gz` | What each source returned that day, compressed, in its original JSON format |
| `data/history.csv` | One row per stock per day, built from the raw files |
| `data/status.json` | Summary of the latest run |
| `data/run_log.csv` | One line per source per run: time, date, source, worked or not, count, error |
| **Website** | |
| `index.html` | Today page |
| `browse.html` | Browse page |
| `trends.html` | Trends page |
| `assets/style.css` | The shared look: navigation bar, fonts, colors, tables, charts |
| `assets/app.js` | Shared code: loads the data files, the move rule, formatting, the shortlist, service worker registration |
| `assets/today.js` | Builds the Today page |
| `assets/browse.js` | Builds the Browse page: filters, search, sort, stars |
| `assets/trends.js` | Builds the Trends page: the value chart and the five findings |
| `assets/vendor/chart.umd.js` | Chart.js 4.4.1, the charting library (license in `chart.js-LICENSE.md`) |
| `assets/fonts/*.woff2` | Barlow and Barlow Condensed fonts (license in `OFL-LICENSE.txt`), stored here so the site works offline |
| `assets/img/brick.svg` | Painted gray brick wall tile used as the page background |
| `assets/img/dumbbell.webp` | Cast-iron dumbbell cutout (drawn for this project) in the Browse header |
| `manifest.webmanifest` | Web app manifest: name, icons and colors used when the site is installed |
| `sw.js` | Service worker: network first, saved copy when offline |
| `icons/*.png` | App icons and favicon |
