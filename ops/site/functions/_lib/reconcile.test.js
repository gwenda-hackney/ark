import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TARGETS,
  changedFields,
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

describe("websiteTargetStatus", () => {
  it("marks excluded when the drink is off the digital menu", () => {
    const status = websiteTargetStatus(
      { ...baseItem, onDigitalMenu: false },
      "staging",
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
    const status = websiteTargetStatus(baseItem, "staging");
    assert.deepEqual(status, { status: "unknown" });
  });

  it("marks published when the snapshot matches", () => {
    const payload = websiteProjection(baseItem);
    const snapshots = recordTargetSnapshot({}, "staging", payload, "2026-09-16T09:00:00.000Z");
    const status = websiteTargetStatus(
      { ...baseItem, publishSnapshots: snapshots },
      "staging",
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
        staging: {
          at: "2026-09-16T09:00:00.000Z",
          hash: "abc",
          payload: { name: "Gwenda" },
        },
        extra: { hash: "nope" },
      }),
    );
    assert.equal(parsed.staging.hash, "abc");
    assert.equal(parsed.staging.payload.name, "Gwenda");
    assert.equal(parsed.extra, undefined);
  });

  it("merges a new target without dropping the other", () => {
    const first = recordTargetSnapshot({}, "staging", websiteProjection(baseItem));
    const next = recordTargetSnapshot(
      first,
      "production",
      websiteProjection({ ...baseItem, price: "16" }),
    );
    assert.ok(next.staging.hash);
    assert.ok(next.production.hash);
    assert.notEqual(next.staging.hash, next.production.hash);
    const raw = serializePublishSnapshots(next);
    const roundTrip = parsePublishSnapshots(raw);
    assert.equal(roundTrip.staging.hash, next.staging.hash);
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
      publishSnapshots: recordTargetSnapshot({}, "staging", payload),
    };
    const client = toClientItem(item);
    assert.equal(client.publishSnapshots, undefined);
    assert.equal(client.publish.staging.status, "published");
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
