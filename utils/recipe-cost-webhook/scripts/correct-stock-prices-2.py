#!/usr/bin/env python3
"""
Iteration 2: Fix remaining pricing errors and update beer/softdrink pour costs.

Stock corrections:
  - Grapefruit Tonic: case was £66.99 → fix to £22 for 24-bottle case
  - Lemon: £15/8 lemons → £2/8 lemons (£0.25/lemon, London wholesale)
  - Sugar: £26/700g → £3/700g (castor/demerara bar sugar wholesale)
  - Grapefruit (fresh): £5/2 → £1.50/2 (£0.75/each, wholesale)

Recipe pour-cost corrections:
  - Draught beers: 35% pour cost (industry standard for beer)
  - Standalone soft drinks: 10% pour cost (high-margin mixer/softdrink)
"""

import os, json, time
import urllib.request, urllib.error

API_BASE = "https://api.clickup.com/api/v2"
API_KEY  = os.environ["CLICKUP_API_KEY"]

STOCK_FIELD = {
    "cost": "2d11a98b-6723-4a84-b2fd-5c5981b73f3a",
}

RECIPE_FIELD = {
    "target_pour_cost": "3ba6bd55-6df4-43a0-b8da-a21373fa6fd1",
}

# Stock task_id → new cost
STOCK_COST_FIXES = {
    # Grapefruit Tonic: 24-bottle case at £20 (Fever-Tree Pink Grapefruit 150ml equiv)
    # Current: £66.99/24 = £2.79/bottle — WRONG. Fever-Tree 24×150-200ml ≈ £18-22/case.
    "869e0jte5": 20,
    # Lemon: bag of 8 for £2.50 (£0.31/lemon, London wholesale)
    # Current: £15/8 = £1.88/lemon — WRONG. Premium Sicilian lemons ≈ £0.25-0.40/each.
    "869e0jtg2": 2.50,
    # Sugar: 700g caster/demerara bar sugar for £2
    # Current: £26/700g — WRONG. Wholesale bar sugar ≈ £1-3/700g.
    "869e0ju5q": 2,
    # Grapefruit (fresh): 2-pack for £2 (£1/each, cocktail-quality wholesale)
    # Current: £5/2 = £2.50/each — a bit high; £1 is more realistic.
    "869e0jtdk": 2,
}

# Recipe task_id → new target_pour_cost (0-1 float)
# Draught beers at 35% — industry standard for on-trade draught beer
# Soft drinks at 10% — postmix/canned margins are very high by design
POUR_COST_FIXES = {
    # ── Draught beers ──
    "869e11nzu": 0.35,   # IPA
    "869e11nrb": 0.35,   # Guest Beer
    "869e11ngm": 0.35,   # Blonde Ale
    "869e11njb": 0.35,   # Cider
    "869e11qeb": 0.35,   # Stout
    # ── Standalone soft drinks (postmix margins ~90%+) ──
    "869e11njp": 0.10,   # Coca Cola
    "869e11qb8": 0.10,   # Sprite
    "869e11qgu": 0.10,   # Tonic Water
    "869e11pup": 0.10,   # Orange Juice
    # ── Bottled juices & waters (still high margin) ──
    "869e11pwm": 0.15,   # Peach Juice
    "869e11pxp": 0.15,   # Pear Juice
    "869e11py1": 0.15,   # Pineapple Juice
    "869e11nm6": 0.15,   # Ginger Beer
    "869e11nkk": 0.15,   # Fancy Water
}


def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API_BASE}{path}", data=data, method="POST",
        headers={"Authorization": API_KEY, "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def set_field(task_id, field_id, value, label=""):
    try:
        api_post(f"/task/{task_id}/field/{field_id}", {"value": value})
        print(f"  ✓ {label}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:100]
        print(f"  ✗ {label}: HTTP {e.code} — {body}")


def main():
    print("=== Iteration 2: Stock cost fixes ===\n")
    for task_id, cost in STOCK_COST_FIXES.items():
        print(f"{task_id}: cost → £{cost}")
        set_field(task_id, STOCK_FIELD["cost"], cost, f"cost={cost}")
        time.sleep(0.15)

    print("\n=== Iteration 2: Recipe pour-cost fixes ===\n")
    for task_id, pct in POUR_COST_FIXES.items():
        print(f"{task_id}: target_pour_cost → {pct*100:.0f}%")
        set_field(task_id, RECIPE_FIELD["target_pour_cost"], pct, f"pour_cost={pct}")
        time.sleep(0.15)

    print("\nDone.")


if __name__ == "__main__":
    main()
