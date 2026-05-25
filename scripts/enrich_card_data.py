"""
Generates app/card_data.json and app/pack_data.json by joining
Fun-Game-Dev's AlchemyCardData.json with MORGANlTE's SQLite database.

Run from project root:
    python3 scripts/enrich_card_data.py

Inputs:
    app/AlchemyCardData.json
    ../lar-helper-starter-4/assets/morganite_card_database.db

Outputs (committed):
    app/card_data.json
    app/pack_data.json
"""

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALCHEMY = ROOT / "app" / "AlchemyCardData.json"
MORGANITE = ROOT.parent / "lar-helper-starter-4" / "assets" / "morganite_card_database.db"
OUT_CARDS = ROOT / "app" / "card_data.json"
OUT_PACKS = ROOT / "app" / "pack_data.json"

WIKI_URL = "https://lil-alchemist.fandom.com/wiki/Special:FilePath/{}.png"


def main():
    if not ALCHEMY.exists():
        sys.exit(f"Missing {ALCHEMY}")
    if not MORGANITE.exists():
        sys.exit(f"Missing {MORGANITE}")

    alchemy = json.loads(ALCHEMY.read_text())

    conn = sqlite3.connect(MORGANITE)
    conn.row_factory = sqlite3.Row

    morg_by_name = {row["name"]: row for row in conn.execute("SELECT * FROM cards")}

    cards = {}
    matched = 0
    for name, fgd in alchemy.items():
        morg = morg_by_name.get(name)
        if morg:
            matched += 1
            image_url = morg["image_url"]
            description = morg["description"] or fgd.get("Description") or ""
            fusion_ability = morg["fusion"] or fgd.get("FusionAbility") or ""
            rarity = morg["rarity"] or fgd.get("Rarity") or ""
            base_attack = morg["base_attack"] if morg["base_attack"] is not None else fgd.get("Attack")
            base_defense = morg["base_defense"] if morg["base_defense"] is not None else fgd.get("Defense")
        else:
            picture = fgd.get("Picture") or name.replace(" ", "_")
            image_url = WIKI_URL.format(picture)
            description = fgd.get("Description") or ""
            fusion_ability = fgd.get("FusionAbility") or ""
            rarity = fgd.get("Rarity") or ""
            base_attack = fgd.get("Attack")
            base_defense = fgd.get("Defense")

        cards[name] = {
            "image_url": image_url,
            "description": description,
            "fusion_ability": fusion_ability,
            "rarity": rarity,
            "is_lte": bool(fgd.get("isLTE", False)),
            "is_seasonal": fgd.get("isSeasonal") or None,
            "base_attack": base_attack,
            "base_defense": base_defense,
        }

    # Include MORGANlTE-only cards (so pack contents always have thumbnails)
    morg_only = 0
    for name, morg in morg_by_name.items():
        if name in cards:
            continue
        morg_only += 1
        cards[name] = {
            "image_url": morg["image_url"],
            "description": morg["description"] or "",
            "fusion_ability": morg["fusion"] or "",
            "rarity": morg["rarity"] or "",
            "is_lte": None,
            "is_seasonal": None,
            "base_attack": morg["base_attack"],
            "base_defense": morg["base_defense"],
        }

    packs = []
    for row in conn.execute("SELECT id, name, price, cards, onyx_fragments FROM card_packs ORDER BY name"):
        try:
            pack_cards = json.loads(row["cards"]) if row["cards"] else []
        except json.JSONDecodeError:
            pack_cards = []
        packs.append({
            "id": row["id"],
            "name": row["name"],
            "price": row["price"],
            "cards": pack_cards,
            "onyx_fragments": bool(row["onyx_fragments"]),
        })

    conn.close()

    OUT_CARDS.write_text(json.dumps(cards, indent=2, sort_keys=True))
    OUT_PACKS.write_text(json.dumps(packs, indent=2))

    print(f"card_data.json:  {len(cards)} cards ({matched} matched both sources, {morg_only} MORGANlTE-only)")
    print(f"pack_data.json:  {len(packs)} packs")
    print(f"Wrote {OUT_CARDS}")
    print(f"Wrote {OUT_PACKS}")


if __name__ == "__main__":
    main()
