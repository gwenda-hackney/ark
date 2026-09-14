/**
 * Suggested price calculation with cross-subsidy smoothing.
 *
 * Strategy:
 *   • Volume drivers (popular accessible drinks, target £5–9): price at target,
 *     snapped to the nearest £0.50. Competitive pricing drives frequency.
 *   • Backbone cocktails (target £9–11): slight 5 % uplift — these reliable sellers
 *     generate steady revenue that funds the showpiece items.
 *   • Showcase / premium cocktails (target > £11): slight 5 % downward pressure —
 *     attractive pricing draws customers to the "hero" items and justifies their
 *     complexity; the backbone items absorb the tighter margin.
 *   • Short pours / shots / amaro (target < £5): enforce a £4.50 minimum so they
 *     don't embarrass the menu, and apply 18 % effective pour cost for a
 *     spirits-typical margin.
 *   • Draught beer (≥ 30 % pour cost): already calibrated at 35 %; just snap.
 *   • Postmix / soft drinks (≤ 12 % pour cost): market-driven, no adjustment.
 *
 * All prices snap to the nearest £0.50 for clean menu presentation.
 */
export function computeSuggestedPrice(
  cost: number,
  targetPrice: number,
  targetPourCost: number,
): number {
  /** Round x to the nearest £0.50 */
  const snap = (x: number) => Math.round(x * 2) / 2;

  // ── Draught beer — already at 35 %, just snap ──
  if (targetPourCost >= 0.3) {
    return snap(targetPrice);
  }

  // ── Postmix / low-cost soft drinks — market sets the price ──
  if (targetPourCost <= 0.12) {
    return snap(targetPrice);
  }

  // ── Short pours: shots, amaro, grappa, spirit measures (target < £5) ──
  // Standard spirit / digestif pour costs (≤ 22 %) get 18 % effective rate
  // (spirits industry norm) with a £4.50 menu floor.
  // Items with a deliberately-elevated pour cost (> 22 %, e.g. specialty bottled
  // sodas, mineral water) should not be pushed through the spirits minimum —
  // just snap them and apply the same £4.50 floor.
  if (targetPrice < 5) {
    if (targetPourCost > 0.22) {
      return Math.max(snap(targetPrice), 4.5);
    }
    const raw = cost / 0.18;
    return Math.max(snap(raw), 4.5);
  }

  // ── Volume drivers: accessible cocktails + premium bottled sodas (£5–9) ──
  // Price at target — competitive pricing drives frequency; no adjustment.
  if (targetPrice < 9) {
    return snap(targetPrice);
  }

  // ── Backbone cocktails (£9–11): slight uplift ──
  // These reliable crowd-pleasers generate the steady revenue that lets you
  // price showpieces attractively. Use 95 % of the target pour cost → ~5 % price rise.
  if (targetPrice < 11) {
    return snap(cost / (targetPourCost * 0.95));
  }

  // ── Showcase / premium cocktails (£11+): slight downward smoothing ──
  // These are the menu's attention-grabbers. A small price reduction (5 %) makes
  // them more enticing; the backbone items subsidise the tighter margin.
  return snap(cost / (targetPourCost * 1.05));
}
