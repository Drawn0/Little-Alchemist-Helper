"""
Generates app/card_data.json and app/pack_data.json by joining
Fun-Game-Dev's AlchemyCardData.json with MORGANlTE's SQLite database
and classifying each card as base / combo intermediate / final form
using combo_data.json.

Run from project root:
    python3 scripts/enrich_card_data.py

Inputs:
    app/AlchemyCardData.json
    app/combo_data.json
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
COMBO = ROOT / "app" / "combo_data.json"
MORGANITE = ROOT.parent / "lar-helper-starter-5" / "assets" / "morganite_card_database.db"
OUT_CARDS = ROOT / "app" / "card_data.json"
OUT_PACKS = ROOT / "app" / "pack_data.json"


def classify_flags(alchemy, combo_json):
    """Multi-flag classification per card. A card may be BOTH combo and final
    (e.g., Death, Wizard — intermediate cards that fuse further).

    is_combo — card has Combinations entries in AlchemyCardData (it can be
               used as an ingredient to fuse OTHER cards). 139 cards.
    is_final — card appears as the `result` of any combo in combo_data
               (it is itself produced by fusion). 1,406 cards.

    A card that is neither is a "base" / standalone card (no fusion role).
    """
    combos = combo_json.get("combos", {}) if combo_json else {}
    results = {c["result"] for c in combos.values() if c.get("result")}
    flags = {}
    for name, info in alchemy.items():
        flags[name] = {
            "is_combo": bool(info.get("Combinations")),
            "is_final": name in results,
        }
    # Cards that exist only in MORGANlTE (not in AlchemyCardData) get filled in by caller.
    return flags


def main():
    if not ALCHEMY.exists():
        sys.exit(f"Missing {ALCHEMY}")
    if not MORGANITE.exists():
        sys.exit(f"Missing {MORGANITE}")

    alchemy = json.loads(ALCHEMY.read_text())
    combo_json = json.loads(COMBO.read_text()) if COMBO.exists() else {}
    flags = classify_flags(alchemy, combo_json)

    conn = sqlite3.connect(MORGANITE)
    conn.row_factory = sqlite3.Row

    # Index MORGANlTE by EXACT and lowercased name for fuzzy join with Fun-Game-Dev.
    morg_by_name = {}
    morg_by_lower = {}
    for row in conn.execute("SELECT * FROM cards"):
        morg_by_name[row["name"]] = row
        morg_by_lower[row["name"].lower()] = row

    def lookup_morg(name):
        return morg_by_name.get(name) or morg_by_lower.get(name.lower())

    cards = {}
    matched = 0
    for name, fgd in alchemy.items():
        morg = lookup_morg(name)
        if morg:
            matched += 1
            image_url = morg["image_url"]
            description = morg["description"] or fgd.get("Description") or ""
            fusion_ability = morg["fusion"] or fgd.get("FusionAbility") or ""
            rarity = morg["rarity"] or fgd.get("Rarity") or ""
            base_attack = morg["base_attack"] if morg["base_attack"] is not None else fgd.get("Attack")
            base_defense = morg["base_defense"] if morg["base_defense"] is not None else fgd.get("Defense")
        else:
            # No constructed-URL fallback — caller renders a rarity-tinted
            # placeholder for null image_url. Avoids noisy 404s.
            image_url = None
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
            "is_combo": flags.get(name, {}).get("is_combo", False),
            "is_final": flags.get(name, {}).get("is_final", False),
        }

    # Include MORGANlTE-only cards (so pack contents always have thumbnails)
    morg_only = 0
    for name, morg in morg_by_name.items():
        if name in cards or name.lower() in {k.lower() for k in cards}:
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
            "is_combo": flags.get(name, {}).get("is_combo", False),
            "is_final": flags.get(name, {}).get("is_final", False),
        }

    # MORGANlTE has many duplicate pack entries (same name + identical cards).
    # Dedupe bit-identical packs. For different-content packs that share a name
    # (legit case: same pack name, different yearly contents), suffix the name
    # with a (2), (3) counter so the picker can distinguish them.
    raw_packs = []
    for row in conn.execute("SELECT id, name, price, cards, onyx_fragments FROM card_packs ORDER BY id"):
        try:
            pack_cards = json.loads(row["cards"]) if row["cards"] else []
        except json.JSONDecodeError:
            pack_cards = []
        raw_packs.append({
            "id": row["id"],
            "name": row["name"],
            "price": row["price"],
            "cards": pack_cards,
            "onyx_fragments": bool(row["onyx_fragments"]),
        })

    seen_keys = set()
    deduped = []
    for p in raw_packs:
        key = (p["name"], tuple(sorted(p["cards"])))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(p)

    # Suffix repeated names with (n)
    name_seen_count = {}
    packs = []
    for p in sorted(deduped, key=lambda x: (x["name"], x["id"])):
        name_seen_count[p["name"]] = name_seen_count.get(p["name"], 0) + 1
    # First pass found total counts; if a name shows up more than once, the
    # first encounter keeps the bare name and subsequent ones get (2), (3)...
    name_seen_so_far = {}
    for p in sorted(deduped, key=lambda x: (x["name"], x["id"])):
        n = name_seen_so_far.get(p["name"], 0) + 1
        name_seen_so_far[p["name"]] = n
        if name_seen_count[p["name"]] > 1 and n > 1:
            p = {**p, "name": f"{p['name']} ({n})"}
        packs.append(p)

    conn.close()

    OUT_CARDS.write_text(json.dumps(cards, indent=2, sort_keys=True))
    OUT_PACKS.write_text(json.dumps(packs, indent=2))

    n_combo = sum(1 for c in cards.values() if c.get("is_combo"))
    n_final = sum(1 for c in cards.values() if c.get("is_final"))
    n_both = sum(1 for c in cards.values() if c.get("is_combo") and c.get("is_final"))
    n_base = sum(1 for c in cards.values() if not c.get("is_combo") and not c.get("is_final"))
    missing_img = sum(1 for c in cards.values() if not c["image_url"])
    print(f"card_data.json:  {len(cards)} cards ({matched} matched FGD+MORGANlTE, {morg_only} MORGANlTE-only)")
    print(f"  by flags:     base-only={n_base}  is_combo={n_combo}  is_final={n_final}  (both={n_both})")
    print(f"  no image:     {missing_img} (will render placeholder)")
    print(f"pack_data.json:  {len(packs)} packs")
    print(f"Wrote {OUT_CARDS}")
    print(f"Wrote {OUT_PACKS}")


if __name__ == "__main__":
    main()
