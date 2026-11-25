import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { FEATURED_ARTIST_CLOSED, addArtistAction, closedArtistRedirect } from "./featured-artist.js";
import { canonicalizePath } from "../app/spa-path.js";

describe("featured artist: no new ones while the website shows none (#313)", () => {
  it("is closed for now, saying why", () => {
    assert.equal(FEATURED_ARTIST_CLOSED, "Not on the website");
  });

  it("keeps Add in its place, disabled, with the reason", () => {
    assert.deepEqual(addArtistAction(), { disabled: true, reason: "Not on the website" });
  });

  it("sends every Featured artist address to Enquiries: the page is gone", () => {
    assert.equal(closedArtistRedirect("/artists/new"), "/forms");
    assert.equal(closedArtistRedirect("/artists"), "/forms");
    assert.equal(closedArtistRedirect("/artists/3"), "/forms");
    assert.equal(closedArtistRedirect("/forms"), null);
    assert.equal(canonicalizePath("/artists/new"), "/forms", "the app's own addresses follow it");
  });

  it("brings Add and the new artist's address back when it opens again", () => {
    assert.deepEqual(addArtistAction(""), { disabled: false });
    assert.equal(closedArtistRedirect("/artists/new", ""), null);
  });
});
