"""Settings for the fitness stock tracker.

ITEMS is the list of stocks the tracker follows. The ticker symbol is the
item_id: it never changes, so the same company lines up from one day to the next.
"""

from pathlib import Path

# Folder layout. ROOT is the top of the repository.
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

# The 15 fitness companies we track, grouped into categories.
ITEMS = [
    # Gyms and studios
    {"item_id": "PLNT", "item": "Planet Fitness", "category": "Gyms & Studios"},
    {"item_id": "LTH", "item": "Life Time Group", "category": "Gyms & Studios"},
    {"item_id": "XPOF", "item": "Xponential Fitness", "category": "Gyms & Studios"},
    # Athletic apparel and footwear
    {"item_id": "NKE", "item": "Nike", "category": "Apparel & Footwear"},
    {"item_id": "LULU", "item": "Lululemon", "category": "Apparel & Footwear"},
    {"item_id": "UAA", "item": "Under Armour", "category": "Apparel & Footwear"},
    {"item_id": "ONON", "item": "On Holding", "category": "Apparel & Footwear"},
    {"item_id": "DECK", "item": "Deckers (Hoka)", "category": "Apparel & Footwear"},
    # Equipment and wearables
    {"item_id": "PTON", "item": "Peloton", "category": "Equipment & Wearables"},
    {"item_id": "GRMN", "item": "Garmin", "category": "Equipment & Wearables"},
    {"item_id": "AS", "item": "Amer Sports", "category": "Equipment & Wearables"},
    # Sporting goods stores
    {"item_id": "DKS", "item": "Dick's Sporting Goods", "category": "Sporting Goods Retail"},
    {"item_id": "ASO", "item": "Academy Sports", "category": "Sporting Goods Retail"},
    # Fitness nutrition
    {"item_id": "CELH", "item": "Celsius Holdings", "category": "Fitness Nutrition"},
    {"item_id": "BRBR", "item": "BellRing Brands", "category": "Fitness Nutrition"},
]

ITEMS_BY_ID = {it["item_id"]: it for it in ITEMS}
SYMBOLS = [it["item_id"] for it in ITEMS]

# When both sources report a stock on the same day, the history keeps the
# row from the first source in this list. The second source is the backup.
SOURCE_PRIORITY = ["yahoo", "finnhub"]

# The daily issue lists this many of the biggest moves.
TOP_N_MOVES = 5
