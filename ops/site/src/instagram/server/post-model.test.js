import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  CAPTION_LIMIT,
  POST_STATUS,
  STALE_AFTER_MS,
  alreadyPosted,
  canTransition,
  captionProblems,
  captionTemplate,
  clockLabel,
  dayLabel,
  failedFields,
  feedImageUrl,
  focalPoint,
  instagramHandle,
  isStale,
  newPost,
  nightIsLive,
  sentFields,
  seriesIsLive,
} from "./post-model.js";

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1600x1000-jpg";

describe("Instagram posts: transitions", () => {
  it("publishing goes to sent or failed, and nowhere after", () => {
    assert.ok(canTransition(POST_STATUS.publishing, POST_STATUS.sent));
    assert.ok(canTransition(POST_STATUS.publishing, POST_STATUS.failed));
    assert.ok(!canTransition(POST_STATUS.sent, POST_STATUS.sent));
    assert.ok(!canTransition(POST_STATUS.sent, POST_STATUS.failed));
    assert.ok(!canTransition(POST_STATUS.failed, POST_STATUS.sent));
  });

  it("a new post is in flight", () => {
    const post = newPost({ eventId: 7, nightOn: "2026-10-08", caption: "Hi", now: new Date("2026-10-05T18:02:00Z") });
    assert.equal(post.status, POST_STATUS.publishing);
    assert.equal(post.eventId, "7");
    assert.equal(post.createdAt, "2026-10-05T18:02:00.000Z");
  });

  it("can't be marked sent twice", () => {
    const post = newPost({ eventId: 1 });
    const sent = { ...post, ...sentFields(post, { mediaId: "m1", permalink: "https://x/p/m1" }) };
    assert.equal(sent.status, POST_STATUS.sent);
    assert.throws(() => sentFields(sent, { mediaId: "m2" }), { status: 409, message: "This post was already sent." });
    assert.throws(() => failedFields(sent, "boom"), { status: 409 });
  });

  it("is stale once left in flight for a minute", () => {
    const post = newPost({ eventId: 1, now: new Date("2026-10-05T18:00:00Z") });
    assert.ok(!isStale(post, new Date("2026-10-05T18:00:30Z")));
    assert.ok(isStale(post, new Date(Date.parse("2026-10-05T18:00:00Z") + STALE_AFTER_MS)));
    assert.ok(!isStale({ ...post, status: POST_STATUS.sent }, new Date("2030-01-01")));
  });
});

describe("Instagram posts: already posted", () => {
  const posts = [
    { eventId: "1", nightOn: "2026-10-08", status: "sent", sentAt: "2026-10-01T10:00:00Z", id: "a" },
    { eventId: "1", nightOn: "2026-10-08", status: "sent", sentAt: "2026-10-03T10:00:00Z", id: "b" },
    { eventId: "1", nightOn: "2026-10-08", status: "failed", sentAt: "", id: "c" },
    { eventId: "1", nightOn: "", status: "sent", sentAt: "2026-10-04T10:00:00Z", id: "d" },
  ];
  it("finds the latest sent post for that night", () => {
    assert.equal(alreadyPosted(posts, "1", "2026-10-08").id, "b");
    assert.equal(alreadyPosted(posts, 1, "").id, "d");
    assert.equal(alreadyPosted(posts, "1", "2026-10-15"), null);
    assert.equal(alreadyPosted(posts, "2", "2026-10-08"), null);
  });
});

describe("Instagram posts: captions", () => {
  it("is fine within Instagram's limits", () => {
    assert.deepEqual(captionProblems("Negroni Chess #chess @gwendahackney"), []);
  });

  it("says what's wrong in plain words", () => {
    assert.deepEqual(captionProblems("  "), ["Write a caption first."]);
    assert.match(captionProblems("x".repeat(CAPTION_LIMIT + 1))[0], /2,201 characters\. Instagram allows 2,200/);
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    assert.match(captionProblems(tags)[0], /31 hashtags\. Instagram allows 30/);
    const mentions = Array.from({ length: 21 }, (_, i) => `@a${i}`).join(" ");
    assert.match(captionProblems(mentions)[0], /mentions 21 accounts/);
  });

  it("counts characters, not UTF-16 units", () => {
    assert.deepEqual(captionProblems("🍸".repeat(CAPTION_LIMIT)), []);
  });

  it("starts from title, when, guest, offer, description and link", () => {
    const caption = captionTemplate({
      title: "Negroni Chess",
      when: dayLabel("2026-10-08"),
      startTime: "19:30",
      artist: "The Knights",
      pageUrl: "https://www.instagram.com/theknights/",
      offer: "Two for one",
      shortDescription: "Chess by the canal.",
      link: "https://gwenda.co.uk/events/negroni-chess-2026-10-08",
    });
    assert.equal(
      caption,
      "Negroni Chess\n\nThursday 8 October, 7.30pm\n\nWith @theknights\n\nTwo for one\n\nChess by the canal.\n\nMore at gwenda.co.uk/events/negroni-chess-2026-10-08",
    );
  });

  it("leaves out what's empty, and prefers the written time", () => {
    assert.equal(captionTemplate({ title: "Quiz", when: "Every Tuesday", time: "8pm till late", startTime: "20:00" }), "Quiz\n\nEvery Tuesday, 8pm till late");
    assert.equal(captionTemplate({ title: "Quiz", artist: "DJ Ana" }), "Quiz\n\nWith DJ Ana");
  });

  it("small helpers", () => {
    assert.equal(instagramHandle("https://instagram.com/gwendahackney"), "@gwendahackney");
    assert.equal(instagramHandle("https://example.com"), "");
    assert.equal(clockLabel("00:00"), "12am");
    assert.equal(clockLabel("12:15"), "12.15pm");
    assert.equal(clockLabel(""), "");
  });
});

describe("Instagram posts: the 4:5 image", () => {
  it("is a 1080x1350 JPEG centred on the editor's framing", () => {
    const url = new URL(
      feedImageUrl("gwscpagy", ASSET, { crop: { left: 0.1, top: 0, right: 0.3, bottom: 0 }, hotspot: { x: 0.25, y: 0.4, width: 0.2, height: 0.2 } }),
    );
    assert.equal(url.host, "cdn.sanity.io");
    assert.equal(url.pathname, "/images/gwscpagy/production/0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-1600x1000.jpg");
    assert.equal(url.searchParams.get("w"), "1080");
    assert.equal(url.searchParams.get("h"), "1350");
    assert.equal(url.searchParams.get("fm"), "jpg");
    assert.equal(url.searchParams.get("fit"), "crop");
    assert.equal(url.searchParams.get("crop"), "focalpoint");
    assert.equal(url.searchParams.get("fp-x"), "0.2500");
    assert.equal(url.searchParams.get("fp-y"), "0.4000");
  });

  it("centres on the crop when there is no hotspot, and on the photo with no framing", () => {
    assert.deepEqual(focalPoint({ crop: { left: 0.2, right: 0.2, top: 0.1, bottom: 0.3 } }), { x: 0.5, y: 0.4 });
    const url = new URL(feedImageUrl("p", ASSET, null));
    assert.equal(url.searchParams.get("fit"), "crop");
    assert.equal(url.searchParams.get("crop"), null);
  });

  it("shows a whole image on the brand background", () => {
    const url = new URL(feedImageUrl("p", ASSET, { fit: "whole" }));
    assert.equal(url.searchParams.get("fit"), "fill");
    assert.equal(url.searchParams.get("bg"), "0d0d0d");
  });

  it("needs a Sanity asset", () => {
    assert.equal(feedImageUrl("p", "", null), "");
    assert.equal(feedImageUrl("p", "photo.jpg", null), "");
  });
});

describe("Instagram posts: on the website", () => {
  it("a night is live once published; a series once any night is", () => {
    const live = { snapshots: { preview: { hash: "a" }, production: { hash: "a" } } };
    const draft = { snapshots: { preview: { hash: "a" } } };
    assert.ok(nightIsLive(live));
    assert.ok(!nightIsLive(draft));
    assert.ok(seriesIsLive([draft, live]));
    assert.ok(!seriesIsLive([draft]));
  });
});
