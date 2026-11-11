/** The party enquiry form's migration: creates the Sanity form once, and only once. */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { FORM_ID, FORM_SLUG, partyFormDocument, up } from "../../migrations/2026-11-11-party-form.mjs";

/** Sanity as a migration sees it (scripts/lib/migrations.mjs sanityContent). */
function fakeSanity(existing = []) {
  const mutations = [];
  const queries = [];
  return {
    mutations,
    queries,
    content: {
      project: "testproj",
      async query(groq, params) {
        queries.push({ groq, params });
        return existing;
      },
      async mutate(list) {
        mutations.push(...list);
      },
    },
  };
}

const run = async (sanity, options = {}) => {
  const lines = [];
  await up({ sanity: () => sanity.content, log: (line) => lines.push(line), ...options });
  return lines;
};

describe("party form migration", () => {
  it("creates the form when there is none", async () => {
    const sanity = fakeSanity();
    const lines = await run(sanity);
    assert.equal(sanity.mutations.length, 1);
    const created = sanity.mutations[0].createIfNotExists;
    assert.equal(created._id, FORM_ID);
    assert.equal(created._type, "form");
    assert.equal(created.slug.current, FORM_SLUG);
    assert.equal(created.enabled, true);
    assert.match(lines.join("\n"), /created form-party/);
    // It looks for the form by id (draft too) and by web address
    assert.deepEqual(sanity.queries[0].params, { ids: [FORM_ID, `drafts.${FORM_ID}`], slug: FORM_SLUG });
  });

  it("leaves a form that is already there alone, however the venue has changed it", async () => {
    for (const id of [FORM_ID, `drafts.${FORM_ID}`, "some-other-id-with-the-party-slug"]) {
      const sanity = fakeSanity([{ _id: id }]);
      const lines = await run(sanity);
      assert.deepEqual(sanity.mutations, []);
      assert.match(lines.join("\n"), /already there/);
    }
  });

  it("writes nothing on a dry run", async () => {
    const sanity = fakeSanity();
    const lines = await run(sanity, { dryRun: true });
    assert.deepEqual(sanity.mutations, []);
    assert.match(lines.join("\n"), /would create form-party/);
  });

  it("makes a document Studio accepts: keyed fields, unique camelCase keys, choices where needed", () => {
    const doc = partyFormDocument();
    const keys = doc.fields.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const field of doc.fields) {
      assert.match(field.key, /^[a-z][a-zA-Z0-9]*$/);
      assert.equal(field._type, "formField");
      assert.ok(field._key && field.label && field.section, field.key);
      if (field.type === "select") {
        assert.ok(field.options.length > 1, field.key);
        for (const choice of field.options) assert.ok(choice._key && choice.label && choice.value);
      } else {
        assert.equal("options" in field, false, field.key);
      }
    }
    for (const address of [doc.notifyEmail, doc.fromEmail, doc.replyToEmail]) {
      assert.match(address, /^[a-z]+@gwenda\.co\.uk$/);
    }
    assert.ok(doc.heading && doc.submitLabel && doc.successTitle && doc.successMessage);
  });
});
