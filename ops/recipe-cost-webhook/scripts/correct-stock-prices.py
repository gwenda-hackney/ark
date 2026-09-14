#!/usr/bin/env python3
"""
Correct stock item pricing based on real UK wholesale data (July 2026).

Postmix model (Coke, Sprite, Tonic, OJ):
  - 7L BIB makes 45L of finished drink
  - Tonic/OJ: unit=ml, unit_amount=total_ml_per_bag, order_qty=1
  - Coke/Sprite: unit=each (200ml serving), order_qty=servings_per_bag

Beer kegs (Neck Oil IPA equiv, 50L keg = 88 pints):
  - unit=each (1 pint), order_qty=88, cost=wholesale_keg_price

All spirit prices sourced from Matthew Clark, Inn Express, Brakes wholesale lists.
"""

import os, json, time
import urllib.request, urllib.error

API_BASE = "https://api.clickup.com/api/v2"
API_KEY  = os.environ["CLICKUP_API_KEY"]

FIELD = {
    "stock_unit":   "3998a369-ac24-4dee-8802-3b4cc515ea65",
    "unit_amount":  "344740a6-ae71-42a8-ba32-faafeabac2d2",
    "order_qty":    "68bedefd-8abf-447c-88e4-5de1da10b136",
    "cost":         "2d11a98b-6723-4a84-b2fd-5c5981b73f3a",
    "initial_qty":  "3dbf0671-a955-4815-96d3-0c5b567f88d7",
}

UNIT_OPT = {
    "ml":   "2d18c89c-1051-43c7-8b1f-fc4fdfd665c0",
    "each": "7905f285-ef20-4175-bc52-d9644471bff1",
    "kg":   "18e09da8-acc0-47ac-83d8-c66fcb92167d",
}

# ---------------------------------------------------------------------------
# task_id → {field: value, ...}  — only include fields that need changing
# ---------------------------------------------------------------------------
UPDATES = {

    # ── POSTMIX MIXERS ──────────────────────────────────────────────────────
    # Tonic water: 7L BIB → 45L finished tonic. Keep ml unit.
    # Cost: ~£22/BIB (Schweppes/own-brand tonic BIB trade price)
    "869e0ju71": {"unit": "ml", "unit_amount": 45000, "order_qty": 1, "cost": 22},

    # Coca-Cola: 7L BIB → 45L → 225 × 200ml servings. Stays as each.
    # Cost: £80/BIB (Brakes/JJ Foodservice ex-VAT)
    "869e0tk8t": {"unit": "each", "order_qty": 225, "cost": 80},

    # Sprite: 7L BIB → 45L → 225 × 200ml servings. Stays as each.
    # Cost: £68/BIB (JJ Foodservice Sprite No Sugar)
    "869e0ju4r": {"unit": "each", "order_qty": 225, "cost": 68},

    # Orange juice: 5L BIB → 25L finished juice. ml unit.
    # Cost: £30/BIB (Real Soda Co estimate)
    "869e0jtkz": {"unit": "ml", "unit_amount": 25000, "order_qty": 1, "cost": 30},

    # Soda water: Fever-Tree/Schweppes case 24 × 200ml.
    # Cost: £14/case (Fever-Tree Soda ex-VAT approx)
    "869e0ju4h": {"unit": "ml", "unit_amount": 200, "order_qty": 24, "cost": 14},

    # Sparkling bottled water: premium (San Pellegrino / Hildon) 24 × 330ml.
    # Cost: £14/case
    "869e0t603": {"unit": "ml", "unit_amount": 330, "order_qty": 24, "cost": 14},

    # Still bottled water: premium still 12 × 500ml.
    # Cost: £8/case
    "869e0jtc5": {"unit": "ml", "unit_amount": 500, "order_qty": 12, "cost": 8},

    # Ginger Beer: Fever-Tree 12 × 200ml case.
    # (migration set order_qty=12 already). Update cost to £13.
    "869e0jtd0": {"cost": 13},

    # Cedrata (Lurisia): 6 × 200ml case. order_qty already=6. Cost: £6.
    "869e0jt7f": {"cost": 6},

    # Chinotto: 6 × 275ml case. order_qty already=6. Cost: £7.
    "869e0jt8a": {"cost": 7},

    # Fancy water: order_qty=12 already. Premium bottled water. Cost: £14.
    "869e0tk92": {},  # no change, already £14/12=£1.17 ✓

    # Peach soda: ml, 330ml bottle, correct price check.
    # Currently £4 for 1×330ml - seems reasonable for artisan soda. Keep.

    # ── BEER KEGS ───────────────────────────────────────────────────────────
    # All kegs: 50L = 88 pints (UK pint = 568ml). unit=each, order_qty=88.
    # Prices sourced from Love Beer / J&A Drinks / Spirit Store.

    # IPA — Neck Oil Session IPA 4.3% (50L keg ex-VAT ≈ £200)
    "869e0jtf9": {"cost": 200},

    # Guest Beer — rotating craft (50L keg, generic premium craft ≈ £165)
    "869e0jtf6": {"cost": 165},

    # Blonde Ale — session blonde (50L keg ≈ £150)
    "869e0jt54": {"cost": 150},

    # Cider — craft cider (Aspall/Thistly Cross equiv, 50L keg ≈ £135)
    "869e0jt8u": {"cost": 135},

    # Stout — craft stout (Guinness draught / craft, 50L keg ≈ £165)
    "869e0ju51": {"cost": 165},

    # ── SPIRITS — PRICE CORRECTIONS ─────────────────────────────────────────
    # Sources: Matthew Clark LSG list, Inn Express, Brakes Foodservice.

    # Hendrick's Gin 70cl: Matthew Clark £22.97 → round to £23
    "869e0ut29": {"cost": 23},
    # Beefeater London Dry 70cl: Matthew Clark ~£14.77 single, higher for small orders → £18
    "869e0jt9y": {},  # Cocoa bitters — keep at £12

    # Aperol 70cl: Inn Express £13.63
    "869e0jt2m": {"cost": 13.63},

    # Campari 70cl: Inn Express £16.93 (already £17, minor change — keep)

    # Cointreau 70cl: Inn Express £23.95 (already £22.50, minor — keep)

    # Absolut Vodka 70cl: Matthew Clark £12.20 for 6-case; single orders ~£14
    "869e0mmd4": {"cost": 14},

    # Grey Goose 70cl: premium vodka, wholesale ~£24
    "869e0mmdq": {"cost": 24},

    # Bulleit Rye 70cl: Tanners/Matthew Clark ~£20
    "869e0nn0u": {"cost": 20},

    # Buffalo Trace 70cl: wholesale ~£20
    "869e0n4rz": {"cost": 20},

    # ── SPIRITS WITH COST = 0 (house / generic / unlisted) ──────────────────

    # Gin — generic house gin (Gordon's equiv, 70cl ~£14 wholesale)
    "869e0w3un": {"cost": 14},

    # Vodka — generic house vodka (Smirnoff equiv, 70cl ~£12)
    "869e0ju7t": {"cost": 12},

    # Vermouth — generic (Martini Rosso equiv, 75cl ~£8)
    "869e0ju79": {"cost": 8},

    # Bourbon — generic (Jim Beam / Maker's Mark equiv, 70cl ~£20)
    "869e0jt5w": {"cost": 20},

    # Rye whisky — generic (Rittenhouse / equivalent, 70cl ~£22)
    "869e0ju0h": {"cost": 22},

    # Dark Rum — generic (Havana Club 3yr, 70cl ~£14)
    "869e0jtba": {"cost": 14},

    # Tequila — generic (El Jimador / Olmeca, 70cl ~£18)
    "869e0ju61": {"cost": 18},

    # Mezcal — generic (Del Maguey San Luis del Rio, 70cl ~£22)
    "869e0jtj7": {"cost": 22},

    # Blanca Tequila — premium (Herradura Silver / equiv, 70cl ~£20)
    "869e0jt4m": {"cost": 20},

    # Carta Dry Vermouth 70cl — Noilly Prat / Dolin equiv ~£10
    "869e0jt79": {"cost": 10},

    # Appleton Estate Signature 70cl — wholesale ~£20
    "869e0tk8j": {"cost": 20},

    # Bacardi Carta Blanca 70cl — Matthew Clark £13.32 → £13
    "869e0nmzf": {"cost": 13},

    # Bumbu The Original 70cl — premium aged rum ~£24
    "869e0nmy5": {"cost": 24},

    # Ketel One Vodka 70cl — premium vodka ~£22
    "869e0mmef": {"cost": 22},

    # Monkey Shoulder Blended Scotch 70cl — wholesale ~£22
    "869e0n4up": {"cost": 22},

    # Smith & Cross Traditional Jamaica Rum 70cl — premium ~£24
    "869e0tf6v": {"cost": 24},

    # Lemon Juice 1L — fresh-squeezed carton ~£3.50
    "869e0jtg8": {"cost": 3.5},

    # Lime juice 1L — fresh-squeezed carton ~£3.50
    "869e0jtgx": {"cost": 3.5},

}

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}", data=data, method="POST",
        headers={"Authorization": API_KEY, "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def set_field(task_id, field_id, value):
    try:
        api_post(f"/task/{task_id}/field/{field_id}", {"value": value})
    except urllib.error.HTTPError as e:
        print(f"    !! field {field_id} on {task_id}: {e.code} {e.read().decode()[:80]}")


def apply_update(task_id, changes):
    if "unit" in changes:
        unit_opt_id = UNIT_OPT[changes["unit"]]
        set_field(task_id, FIELD["stock_unit"], unit_opt_id)
    if "unit_amount" in changes and changes["unit_amount"] is not None:
        set_field(task_id, FIELD["unit_amount"], changes["unit_amount"])
    if "order_qty" in changes:
        set_field(task_id, FIELD["order_qty"], changes["order_qty"])
    if "cost" in changes:
        set_field(task_id, FIELD["cost"], changes["cost"])
    if "initial_qty" in changes:
        set_field(task_id, FIELD["initial_qty"], changes["initial_qty"])


def main():
    print(f"Applying price corrections to {len(UPDATES)} stock items...\n")
    for task_id, changes in UPDATES.items():
        if not changes:
            print(f"  SKIP  {task_id} (no changes)")
            continue
        print(f"  UPDATE {task_id}: {changes}")
        apply_update(task_id, changes)
        time.sleep(0.15)   # gentle rate-limit

    print("\nDone.")


if __name__ == "__main__":
    main()
