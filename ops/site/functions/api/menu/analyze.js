import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { aiMessageText } from "../../../src/platform/ai-text.js";

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

const SYSTEM = `You review drinks for Gwenda, a small independent bar in London.

You are given computed metrics. Use those numbers. Do not invent volumes, ABV, ratios, percentiles, costs, or prices. Do not treat IBA or classic specs as rules this drink must follow. Compare only to the house peers provided when peers exist.

If price metrics are present, you may comment on drink cost, target price, and pour cost versus the house target. When serves (single/double or pint/half) are present, comment on each pour cost that has a menu price. Do not invent trade prices.

Ingredient fullName is the bottle identity. St-Germain with fullName "elderflower liqueur" is that liqueur; do not flag the guest line for using the generic name. Narano Bitter Orange is orange bitters; do not treat those as different products.

Spell names exactly as they appear in the payload. Do not invent or misspell ingredients.

Reply with JSON only, no markdown:
{"summary":"1-2 sentences","concerns":["..."],"questions":["..."]}

summary: what matters for this drink (volume/ABV when known, pour cost if known), in bartender language.
concerns: at most three issues supported by the metrics or flags, preferring critical then warning. Empty array if none.
questions: at most three practical checks. Empty array if none.

Tone: restrained, specific, British English. No hype. No em dashes.`;

function compactAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return null;
  return {
    volumeMl: analysis.volumeMl ?? null,
    storedVolumeMl: analysis.storedVolumeMl ?? null,
    storedVolumeMatches: analysis.storedVolumeMatches ?? null,
    alcoholMl: analysis.alcoholMl ?? null,
    specAbv: analysis.specAbv ?? null,
    ukUnits: analysis.ukUnits ?? null,
    kindMl: analysis.kindMl ?? null,
    ratio: analysis.ratio ?? null,
    dilution: analysis.dilution ?? null,
    inGlassMl: analysis.inGlassMl ?? null,
    inGlassAbv: analysis.inGlassAbv ?? null,
    glassware: analysis.glassware ?? null,
    flags: Array.isArray(analysis.flags) ? analysis.flags.slice(0, 12) : [],
    issues: analysis.issues
      ? {
          critical: analysis.issues.critical ?? 0,
          warning: analysis.issues.warning ?? 0,
          notes: analysis.issues.notes ?? 0,
          byCode: Array.isArray(analysis.issues.byCode)
            ? analysis.issues.byCode.slice(0, 16)
            : [],
        }
      : null,
    peers: analysis.peers
      ? {
          n: analysis.peers.n ?? 0,
          volumePercentile: analysis.peers.volumePercentile ?? null,
          abvPercentile: analysis.peers.abvPercentile ?? null,
          citrusVolumePercentile: analysis.peers.citrusVolumePercentile ?? null,
          nearest: Array.isArray(analysis.peers.nearest)
            ? analysis.peers.nearest.slice(0, 6)
            : [],
        }
      : null,
    price: analysis.price
      ? {
          targetPourCost: analysis.price.targetPourCost ?? null,
          drinkCost: analysis.price.drinkCost ?? null,
          actualPrice: analysis.price.actualPrice ?? null,
          actualPourCost: analysis.price.actualPourCost ?? null,
          targetPrice: analysis.price.targetPrice ?? null,
          suggestedPrice: analysis.price.suggestedPrice ?? null,
          variance: analysis.price.variance ?? null,
          margin: analysis.price.margin ?? null,
          complete: analysis.price.complete ?? false,
          missingLines: analysis.price.missingLines ?? 0,
          serves: Array.isArray(analysis.price.serves)
            ? analysis.price.serves.slice(0, 2).map((serve) => ({
                key: serve?.key ?? null,
                label: serve?.label ?? null,
                costFactor: serve?.costFactor ?? null,
                drinkCost: serve?.drinkCost ?? null,
                price: serve?.price ?? null,
                pourCost: serve?.pourCost ?? null,
                targetPrice: serve?.targetPrice ?? null,
                suggestedPrice: serve?.suggestedPrice ?? null,
                variance: serve?.variance ?? null,
                margin: serve?.margin ?? null,
              }))
            : [],
        }
      : null,
  };
}

function compactItem(item) {
  if (!item || typeof item !== "object") return null;
  const ingredients = Array.isArray(item.ingredients)
    ? item.ingredients.slice(0, 20).map((ing) => ({
        quantity: ing?.quantity ?? "",
        unit: ing?.unit || "",
        name: ing?.name || "",
        fullName: ing?.fullName || "",
        note: ing?.note || "",
      }))
    : [];
  return {
    name: String(item.name || "").slice(0, 80),
    notes: String(item.notes || "").slice(0, 120),
    description: String(item.description || "").slice(0, 400),
    method: String(item.method || "").slice(0, 400),
    glassware: String(item.glassware || "").slice(0, 40),
    ice: String(item.ice || "").slice(0, 40),
    price: String(item.price || "").slice(0, 16),
    priceAlt: String(item.priceAlt || "").slice(0, 16),
    drinkType: String(item.drinkType || "").slice(0, 24),
    ingredients,
  };
}

export const onRequestPost = withApiHandler(async (context) => {
  const ai = context.env?.AI;
  if (!ai || typeof ai.run !== "function") {
    return jsonResponse(
      { error: "Workers AI is not bound on this environment." },
      503,
    );
  }

  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const item = compactItem(body.item);
  const analysis = compactAnalysis(body.analysis);
  if (!item || !analysis) {
    return jsonResponse({ error: "Recipe analysis is required." }, 400);
  }

  const payload = JSON.stringify({ item, analysis });
  let result;
  try {
    result = await ai.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: payload },
      ],
      max_tokens: 700,
      temperature: 0.2,
    });
  } catch (error) {
    console.error("Workers AI analyze failed:", error);
    return jsonResponse(
      { error: "Analysis model is unavailable. Metrics still stand." },
      503,
    );
  }

  const text = aiMessageText(result).trim();
  if (!text) {
    console.error("Workers AI analyze empty note.");
    return jsonResponse(
      { error: "Analysis model returned an empty note." },
      502,
    );
  }

  return jsonResponse({ ok: true, text, model: MODEL });
});
