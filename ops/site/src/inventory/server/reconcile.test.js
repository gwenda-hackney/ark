import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  TARGETS,
  changedFields,
  fieldDiffs,
  parsePublishSnapshots,
  projectionHash,
  projectionsEqual,
  publicPublishStatus,
  recordTargetSnapshot,
  sanityPatchFromProjection,
  serializePublishSnapshots,
  toClientItem,
  websiteProjection,
  websiteTargetStatus,
} from "./reconcile.js";

const baseItem = {
  name: "Gwenda",
  description: "gin, italicus, soda",
  price: "14",
  priceAlt: "18",
  notes: "Floral fizz",
  drinkType: "cocktail",
  abv: "18%",
  volume: "140 ml",
  producer: "",
  onDigitalMenu: true,
  sanityId: "abc",
  image: { asset: { url: "https://files.baserow.io/photo.jpg" } },
  ingredients: [{ name: "Bombay gin", quantity: 25, unit: "ml" }],
  glassware: "Coupe",
  method: "Shake",
  garnish: "Basil",
  ice: "None",
};

describe("websiteProjection", () => {
  it("keeps guest fields and drops recipe-only fields", () => {
    const payload = websiteProjection(baseItem);
    assert.equal(payload.name, "Gwenda");
    assert.equal(payload.description, "gin, italicus, soda");
    assert.equal(payload.price, "14");
    assert.equal(payload.sectionId, "");
    assert.equal(payload.photo, "https://files.baserow.io/photo.jpg");
    assert.equal(payload.onDigitalMenu, true);
    assert.equal("method" in payload, false);
    assert.equal("glassware" in payload, false);
    assert.equal("garnish" in payload, false);
    assert.equal("ice" in payload, false);
    assert.equal("ingredients" in payload, false);
  });

  it("does not flatten pours into a guest description", () => {
    const payload = websiteProjection({
      ...baseItem,
      name: "Grappa Nardini Bianca",
      description: "",
      drinkType: "pour",
      ingredients: [{ name: "Grappa Nardini Bianca" }],
    });
    assert.equal(payload.description, "");
  });

  it("flattens ingredient names when the menu line is empty", () => {
    const payload = websiteProjection({
      ...baseItem,
      description: "",
      ingredients: [
        { name: "Bombay gin" },
        { name: "Italicus" },
        { name: "  " },
      ],
    });
    assert.equal(payload.description, "Bombay gin, Italicus");
  });

  it("keeps ABV and volume only for packaged drinks", () => {
    const cocktail = websiteProjection({
      ...baseItem,
      drinkType: "cocktail",
      abv: "16.4%",
      volume: "135 ml",
      producer: "House",
    });
    assert.equal(cocktail.abv, "");
    assert.equal(cocktail.volume, "");
    assert.equal(cocktail.producer, "");

    const bottled = websiteProjection({
      ...baseItem,
      name: "Menabrea Bionda Lager",
      drinkType: "packaged",
      abv: "4.8%",
      volume: "33cl",
      producer: "Menabrea",
      description: "",
      ingredients: [],
    });
    assert.equal(bottled.abv, "4.8%");
    assert.equal(bottled.volume, "33cl");
    assert.equal(bottled.producer, "Menabrea");
  });
});

describe("projectionHash", () => {
  it("is stable across key insertion order", () => {
    const a = websiteProjection(baseItem);
    const b = {
      photo: a.photo,
      onDigitalMenu: a.onDigitalMenu,
      sectionId: a.sectionId,
      producer: a.producer,
      volume: a.volume,
      abv: a.abv,
      drinkType: a.drinkType,
      notes: a.notes,
      priceAlt: a.priceAlt,
      prices: a.prices,
      price: a.price,
      description: a.description,
      name: a.name,
    };
    assert.equal(projectionHash(a), projectionHash(b));
    assert.equal(projectionsEqual(a, b), true);
  });

  it("changes when a guest field changes", () => {
    const a = websiteProjection(baseItem);
    const b = websiteProjection({ ...baseItem, price: "16" });
    assert.notEqual(projectionHash(a), projectionHash(b));
    assert.deepEqual(changedFields(b, a), ["price"]);
  });
});

describe("price table on the website", () => {
  const wine = {
    ...baseItem,
    name: "House red",
    drinkType: "pour",
    price: "7",
    priceAlt: "9",
    prices: [
      { name: "125 ml", size: "125 ml", price: "7", sku: "G1" },
      { name: "175 ml", size: "175 ml", price: "9" },
      { name: "Bottle", price: "32", sku: "G3" },
    ],
  };

  it("sends every price, without till SKUs", () => {
    assert.deepEqual(websiteProjection(wine).prices, [
      { name: "125 ml", size: "125 ml", price: "7" },
      { name: "175 ml", size: "175 ml", price: "9" },
      { name: "Bottle", price: "32" },
    ]);
  });

  it("keeps a drink published from before the table up to date", () => {
    const { prices: _prices, ...before } = websiteProjection(baseItem);
    const item = { ...baseItem, publishSnapshots: recordTargetSnapshot({}, "preview", before) };
    assert.equal(websiteTargetStatus(item, "preview").status, "published");
  });

  it("names a third price as a prices change", () => {
    const two = websiteProjection({ ...wine, prices: wine.prices.slice(0, 2) });
    const three = websiteProjection(wine);
    assert.deepEqual(changedFields(three, two), ["prices"]);
    assert.deepEqual(fieldDiffs(three, two)[0], {
      field: "prices",
      from: "£7 125 ml · £9 175 ml",
      to: "£7 125 ml · £9 175 ml · £32 bottle",
    });
    // A new main price is said once, as the price.
    assert.deepEqual(changedFields(websiteProjection({ ...baseItem, price: "16" }), websiteProjection(baseItem)), ["price"]);
  });

  it("writes keyed rows to Sanity, and unsets them when there are none", () => {
    const { set } = sanityPatchFromProjection(websiteProjection(wine));
    assert.deepEqual(set.prices[2], { _key: "p2", _type: "menuPrice", name: "Bottle", price: "32" });
    assert.equal(set.price, "7");
    assert.equal(set.priceAlt, "9");
    const { unset } = sanityPatchFromProjection(websiteProjection({ name: "Negroni", drinkType: "cocktail" }));
    assert.ok(unset.includes("prices"));
  });
});

describe("websiteTargetStatus", () => {
  it("marks excluded when the drink is off the digital menu", () => {
    const status = websiteTargetStatus(
      { ...baseItem, onDigitalMenu: false },
      "preview",
    );
    assert.deepEqual(status, { status: "excluded" });
  });

  it("marks missing when there is no Sanity id", () => {
    const status = websiteTargetStatus(
      { ...baseItem, sanityId: "" },
      "production",
    );
    assert.deepEqual(status, { status: "missing" });
  });

  it("marks unknown when linked but never snapshotted", () => {
    const status = websiteTargetStatus(baseItem, "preview");
    assert.deepEqual(status, { status: "unknown" });
  });

  it("marks published when the snapshot matches", () => {
    const payload = websiteProjection(baseItem);
    const snapshots = recordTargetSnapshot({}, "preview", payload, "2026-09-16T09:00:00.000Z");
    const status = websiteTargetStatus(
      { ...baseItem, publishSnapshots: snapshots },
      "preview",
    );
    assert.deepEqual(status, { status: "published" });
  });

  it("marks unpublished and lists changed fields", () => {
    const payload = websiteProjection(baseItem);
    const snapshots = recordTargetSnapshot({}, "production", payload);
    const status = websiteTargetStatus(
      {
        ...baseItem,
        description: "new line",
        notes: "Citrus",
        publishSnapshots: snapshots,
      },
      "production",
    );
    assert.equal(status.status, "unpublished");
    assert.deepEqual(status.changed, ["description", "notes"]);
    assert.deepEqual(status.diff, [
      { field: "description", from: "gin, italicus, soda", to: "new line" },
      { field: "notes", from: "Floral fizz", to: "Citrus" },
    ]);
  });

  it("returns unsupported for the POS stub", () => {
    assert.equal(TARGETS.pos.kind, "unsupported");
    assert.deepEqual(websiteTargetStatus(baseItem, "pos"), {
      status: "unsupported",
    });
  });
});

describe("publish snapshots", () => {
  it("parses JSON and ignores junk", () => {
    assert.deepEqual(parsePublishSnapshots(""), {});
    assert.deepEqual(parsePublishSnapshots("not-json"), {});
    const parsed = parsePublishSnapshots(
      JSON.stringify({
        preview: {
          at: "2026-09-16T09:00:00.000Z",
          hash: "abc",
          payload: { name: "Gwenda" },
        },
        extra: { hash: "nope" },
      }),
    );
    assert.equal(parsed.preview.hash, "abc");
    assert.equal(parsed.preview.payload.name, "Gwenda");
    assert.equal(parsed.extra, undefined);
  });

  it("merges a new target without dropping the other", () => {
    const first = recordTargetSnapshot({}, "preview", websiteProjection(baseItem));
    const next = recordTargetSnapshot(
      first,
      "production",
      websiteProjection({ ...baseItem, price: "16" }),
    );
    assert.ok(next.preview.hash);
    assert.ok(next.production.hash);
    assert.notEqual(next.preview.hash, next.production.hash);
    const raw = serializePublishSnapshots(next);
    const roundTrip = parsePublishSnapshots(raw);
    assert.equal(roundTrip.preview.hash, next.preview.hash);
    assert.equal(roundTrip.production.hash, next.production.hash);
  });
});

describe("sanityPatchFromProjection", () => {
  it("unsets empty optional fields", () => {
    const { set, unset } = sanityPatchFromProjection(
      websiteProjection({ name: "Negroni", drinkType: "cocktail" }),
    );
    assert.equal(set.name, "Negroni");
    assert.equal(set.drinkType, "cocktail");
    assert.equal(set.signature, false);
    assert.ok(unset.includes("description"));
    assert.ok(unset.includes("price"));
    assert.ok(unset.includes("signature"));
  });
});

describe("toClientItem", () => {
  it("attaches compact status and strips snapshots", () => {
    const payload = websiteProjection(baseItem);
    const item = {
      ...baseItem,
      _id: "1",
      publishSnapshots: recordTargetSnapshot({}, "preview", payload),
    };
    const client = toClientItem(item);
    assert.equal(client.publishSnapshots, undefined);
    assert.equal(client.publish.preview.status, "published");
    assert.equal(client.publish.production.status, "unknown");
    assert.equal("pos" in client.publish, false);
  });

  it("exposes unpublished field names without snapshot JSON", () => {
    const payload = websiteProjection(baseItem);
    const client = toClientItem({
      ...baseItem,
      price: "16",
      publishSnapshots: recordTargetSnapshot({}, "production", payload),
    });
    assert.deepEqual(publicPublishStatus({
      ...baseItem,
      price: "16",
      publishSnapshots: recordTargetSnapshot({}, "production", payload),
    }).production, {
      status: "unpublished",
      changed: ["price"],
      diff: [{ field: "price", from: "14", to: "16" }],
    });
    assert.deepEqual(client.publish.production.changed, ["price"]);
    assert.deepEqual(client.publish.production.diff, [
      { field: "price", from: "14", to: "16" },
    ]);
  });
});

it("snapshots saved under the old staging name read as the preview", () => {
  const parsed = parsePublishSnapshots(JSON.stringify({ staging: { hash: "h1", at: "t" } }));
  assert.equal(parsed.preview.hash, "h1");
  assert.equal(parsed.staging, undefined);
});
