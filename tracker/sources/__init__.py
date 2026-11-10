"""Data sources. Each source module has the same four things:

NAME    short name used in file names and in the source column
FORMAT  file format the source returns ("json")
fetch(symbols, session)  downloads the data and returns a payload dict
parse(payload)           turns a payload into {item_id: {column: value}}
"""

from . import finnhub, nasdaq, yahoo

# Every source the pipeline calls, in priority order.
SOURCES = {yahoo.NAME: yahoo, nasdaq.NAME: nasdaq, finnhub.NAME: finnhub}
