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

  it("sends a new artist's address back to the list; past artists still open", () => {
    assert.equal(closedArtistRedirect("/artists/new"), "/artists");
    assert.equal(closedArtistRedirect("/artists/new/details"), "/artists");
    assert.equal(closedArtistRedirect("/artists"), null);
    assert.equal(closedArtistRedirect("/artists/3"), null);
    assert.equal(canonicalizePath("/artists/new"), "/artists", "the app's own addresses follow it");
  });

  it("brings Add and the new artist's address back when it opens again", () => {
    assert.deepEqual(addArtistAction(""), { disabled: false });
    assert.equal(closedArtistRedirect("/artists/new", ""), null);
  });
});
