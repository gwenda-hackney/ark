/**
 * A fake Instagram Graph API (#26), for dev ops and tests. Meta has no
 * sandbox (an app in development mode still posts for real), so dev never
 * talks to Meta: it talks to this. The same handler runs as the dev Worker
 * (./index.js, posts in KV) and inside ops tests (src/testing/fake-world.js).
 *
 * It mimics the calls ops makes, with Meta's response and error shapes:
 *   GET  /me, /{user-id}?fields=id,username
 *   POST /{user-id}/media                    image_url, caption → container
 *   GET  /{container-id}?fields=status_code
 *   POST /{user-id}/media_publish            creation_id → media
 *   GET  /{media-id}?fields=permalink
 *   GET  /{user-id}/content_publishing_limit
 * A leading /v24.0 (any version) is ignored. The token goes as
 * "Authorization: Bearer …" or ?access_token=.
 *
 * Like Meta, it really fetches the image and checks it: a JPEG, between 4:5
 * and 1.91:1, at most 8 MB; and the caption: 2,200 characters, 30 hashtags,
 * 20 mentions. Published posts get a phone-style preview page at /p/<id>,
 * and GET / lists them.
 *
 * Fault switches, by ?fail=, an X-Fake-Fail header, a /fail/<mode> prefix on
 * the base URL, or "[fail:<mode>]" in the caption:
 *   slow        the container needs a few status checks before it's ready
 *   stuck       the container never finishes
 *   error       the container ends in ERROR
 *   token       every call fails as an expired token
 *   rate-limit  publishing fails on the daily limit
 */

export const FAKE_LIMITS = Object.freeze({
  captionLength: 2200,
  hashtags: 30,
  mentions: 20,
  imageBytes: 8 * 1024 * 1024,
  minAspect: 4 / 5,
  maxAspect: 1.91,
  postsPerDay: 100,
});

const FAIL_MODES = new Set(["slow", "stuck", "error", "token", "rate-limit"]);
const SLOW_CHECKS = 2;

/** A KV-like store in memory: { get, put } with JSON strings, for tests. */
export function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
  };
}

/** { width, height } of a JPEG from its bytes, or null when it isn't one. */
export function jpegSize(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (data[offset + 2] << 8) | data[offset + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      const height = (data[offset + 5] << 8) | data[offset + 6];
      const width = (data[offset + 7] << 8) | data[offset + 8];
      return width && height ? { width, height } : null;
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** The smallest JPEG this fake (and the checks above) accept as w x h. For tests. */
export function tinyJpeg(width, height) {
  return new Uint8Array([
    0xff, 0xd8,
    // SOF0: length 11, precision 8, height, width, 1 component
    0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function graphError(status, { message, type = "OAuthException", code, subcode, title, userMessage }) {
  const error = { message, type, code, fbtrace_id: `Fake${Math.random().toString(36).slice(2, 12)}` };
  if (subcode) error.error_subcode = subcode;
  if (title) error.error_user_title = title;
  if (userMessage) error.error_user_msg = userMessage;
  return json({ error }, status);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const ERRORS = {
  token: () =>
    graphError(401, {
      message: "Error validating access token: Session has expired.",
      code: 190,
      subcode: 463,
    }),
  badToken: () => graphError(401, { message: "Invalid OAuth access token - Cannot parse access token", code: 190 }),
  unknownObject: (id) =>
    graphError(400, {
      message: `Unsupported get request. Object with ID '${id}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`,
      type: "GraphMethodException",
      code: 100,
      subcode: 33,
    }),
  missingParam: (name) => graphError(400, { message: `(#100) The parameter ${name} is required`, code: 100 }),
  fetchFailed: (url) =>
    graphError(400, {
      message: "Only photo or video can be accepted as media type.",
      code: 9004,
      subcode: 2207052,
      title: "Media download has failed.",
      userMessage: `The media could not be fetched from this uri: ${url}`,
    }),
  notJpeg: () =>
    graphError(400, {
      message: "The image format is not supported.",
      code: 36001,
      subcode: 2207026,
      title: "Unsupported format",
      userMessage: "The image format is not supported. Use JPEG.",
    }),
  tooBig: () =>
    graphError(400, {
      message: "The image is too large.",
      code: 36001,
      subcode: 2207004,
      title: "Image size too large",
      userMessage: "The image is too large to download. It should be less than 8 MiB.",
    }),
  aspect: (ratio) =>
    graphError(400, {
      message: "The aspect ratio is not supported.",
      code: 36003,
      subcode: 2207009,
      title: "Cannot create post",
      userMessage: `The submitted image with aspect ratio ('${ratio}') cannot be published. Please submit an image with a valid aspect ratio.`,
    }),
  caption: (what) =>
    graphError(400, { message: `(#100) ${what}`, code: 100, subcode: 2207010, title: "Caption too long", userMessage: what }),
  notReady: () =>
    graphError(400, {
      message: "Media ID is not available",
      code: 9007,
      subcode: 2207027,
      title: "Media not ready for publishing",
      userMessage: "The media is not ready for publishing, please wait for a moment",
    }),
  rateLimit: () =>
    graphError(400, {
      message: "Application request limit reached",
      code: 4,
      subcode: 2207042,
      title: "Rate limit exceeded",
      userMessage: "You reached maximum number of posts that is allowed to be published by Content Publishing API.",
    }),
  published: () =>
    graphError(400, {
      message: "(#100) The media has already been published.",
      code: 100,
      title: "Media already published",
      userMessage: "This media has already been published.",
    }),
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function previewPage(post) {
  const caption = escapeHtml(post.caption).replace(/\n/g, "<br>");
  const when = new Date(post.timestamp).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" });
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>@${escapeHtml(post.username)} · fake Instagram</title>
<style>
:root{color-scheme:light dark;--bg:#fafafa;--card:#fff;--fg:#111;--muted:#737373;--line:#dbdbdb}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#000;--fg:#f5f5f5;--muted:#a8a8a8;--line:#262626}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 -apple-system,system-ui,sans-serif}
.note{max-width:420px;margin:12px auto 0;padding:8px 16px;color:var(--muted);font-size:12px;text-align:center}
.phone{max-width:420px;margin:12px auto 32px;background:var(--card);border:1px solid var(--line);border-radius:28px;overflow:hidden}
.head{display:flex;align-items:center;gap:10px;padding:12px 14px}
.avatar{width:32px;height:32px;border-radius:50%;background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)}
.name{font-weight:600}
img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:#0d0d0d}
.body{padding:10px 14px 16px}
.time{color:var(--muted);font-size:11px;text-transform:uppercase;margin-top:8px}
</style></head>
<body><p class="note">Fake Instagram for Gwenda dev. Nothing here was posted anywhere real.</p>
<article class="phone"><div class="head"><span class="avatar"></span><span class="name">${escapeHtml(post.username)}</span></div>
<img src="${escapeHtml(post.imageUrl)}" alt="">
<div class="body"><span class="name">${escapeHtml(post.username)}</span> ${caption}<div class="time">${escapeHtml(when)}</div></div>
</article></body></html>`;
}

function listPage(posts, username) {
  const items = posts
    .map((post) => `<li><a href="/p/${escapeHtml(post.id)}">${escapeHtml(post.caption.split("\n")[0] || post.id)}</a> · ${escapeHtml(post.timestamp)}</li>`)
    .join("");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fake Instagram</title><style>body{font:15px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}</style></head>
<body><h1>Fake Instagram: @${escapeHtml(username)}</h1><p>Posts dev ops made. Nothing here reached Instagram.</p><ul>${items || "<li>No posts yet.</li>"}</ul></body></html>`;
}

function newId() {
  const digits = crypto.getRandomValues(new Uint32Array(2));
  return `178${String(digits[0]).padStart(10, "0")}${String(digits[1] % 10000).padStart(4, "0")}`;
}

async function readParams(request, url) {
  const params = Object.fromEntries(url.searchParams);
  if (request.method === "POST") {
    const type = request.headers.get("Content-Type") || "";
    const text = await request.text();
    if (type.includes("application/json")) {
      try {
        Object.assign(params, JSON.parse(text || "{}"));
      } catch {
        /* Meta ignores a body it can't read */
      }
    } else if (text) {
      Object.assign(params, Object.fromEntries(new URLSearchParams(text)));
    }
  }
  return params;
}

/**
 * @param {{
 *   token: string, userId: string, username?: string,
 *   store: { get(key: string): Promise<string|null>, put(key: string, value: string): Promise<void> },
 *   fetchImage?: typeof fetch, now?: () => number
 * }} options
 */
export function createFakeInstagram({ token, userId, username = "gwenda_dev_test", store, fetchImage, now = () => Date.now() }) {
  const load = async (key) => {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw) : null;
  };
  const save = (key, value) => store.put(key, JSON.stringify(value));

  async function postIndex() {
    return (await load("posts")) || [];
  }

  async function checkImage(imageUrl) {
    let response;
    try {
      response = await (fetchImage || globalThis.fetch)(imageUrl);
    } catch {
      return ERRORS.fetchFailed(imageUrl);
    }
    if (!response.ok) return ERRORS.fetchFailed(imageUrl);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > FAKE_LIMITS.imageBytes) return ERRORS.tooBig();
    const size = jpegSize(bytes);
    if (!size) return ERRORS.notJpeg();
    const ratio = size.width / size.height;
    // A hair of rounding either side, as 1080x1350 is exactly 4:5.
    if (ratio < FAKE_LIMITS.minAspect - 0.005 || ratio > FAKE_LIMITS.maxAspect + 0.005) {
      return ERRORS.aspect(`${size.width}:${size.height}`);
    }
    return null;
  }

  function checkCaption(caption) {
    const text = String(caption || "");
    if ([...text].length > FAKE_LIMITS.captionLength) return ERRORS.caption(`The caption is longer than ${FAKE_LIMITS.captionLength} characters.`);
    const tags = (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
    if (tags > FAKE_LIMITS.hashtags) return ERRORS.caption(`The caption has more than ${FAKE_LIMITS.hashtags} hashtags.`);
    const mentions = (text.match(/(^|\s)@[\w.]+/g) || []).length;
    if (mentions > FAKE_LIMITS.mentions) return ERRORS.caption(`The caption mentions more than ${FAKE_LIMITS.mentions} accounts.`);
    return null;
  }

  async function postsToday() {
    const since = now() - 24 * 60 * 60 * 1000;
    return (await postIndex()).filter((post) => Date.parse(post.timestamp) >= since).length;
  }

  return {
    async fetch(request) {
      const url = new URL(request.url);
      let path = url.pathname.replace(/\/+$/, "") || "/";
      let fail = url.searchParams.get("fail") || request.headers.get("X-Fake-Fail") || "";
      const prefix = /^\/fail\/([a-z-]+)(\/.*)?$/.exec(path);
      if (prefix) {
        fail = fail || prefix[1];
        path = prefix[2] || "/";
      }
      path = path.replace(/^\/v\d+\.\d+(?=\/|$)/, "") || "/";

      // Pages for people: the post list and each post's preview.
      if (request.method === "GET" && path === "/") {
        return new Response(listPage((await postIndex()).slice().reverse(), username), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const page = /^\/p\/(\w+)$/.exec(path);
      if (request.method === "GET" && page) {
        const post = await load(`post:${page[1]}`);
        if (!post) return new Response("No such post on the fake Instagram.", { status: 404 });
        return new Response(previewPage(post), { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }

      // The Graph API.
      const params = await readParams(request, url);
      if (!fail) {
        const tagged = /\[fail:([a-z-]+)\]/.exec(String(params.caption || ""));
        if (tagged) fail = tagged[1];
      }
      if (fail && !FAIL_MODES.has(fail)) fail = "";
      const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "")?.[1] || "";
      const given = bearer || params.access_token || "";
      if (!given) {
        return graphError(400, { message: "An active access token must be used to query information about the current user.", code: 2500 });
      }
      if (!token || given !== token) return ERRORS.badToken();
      if (fail === "token") return ERRORS.token();

      const parts = path.split("/").filter(Boolean);
      const [id, edge] = parts;
      const isUser = id === userId || id === "me";

      if (request.method === "GET" && parts.length === 1 && isUser) {
        return json({ id: userId, username });
      }

      if (request.method === "GET" && isUser && edge === "content_publishing_limit") {
        return json({
          data: [{ quota_usage: await postsToday(), config: { quota_total: FAKE_LIMITS.postsPerDay, quota_duration: 86400 } }],
        });
      }

      if (request.method === "POST" && isUser && edge === "media") {
        if (!params.image_url) return ERRORS.missingParam("image_url");
        const captionError = checkCaption(params.caption);
        if (captionError) return captionError;
        const imageError = await checkImage(params.image_url);
        if (imageError) return imageError;
        const container = {
          id: newId(),
          imageUrl: params.image_url,
          caption: String(params.caption || ""),
          fail,
          checks: 0,
          status: "IN_PROGRESS",
          createdAt: new Date(now()).toISOString(),
        };
        await save(`container:${container.id}`, container);
        return json({ id: container.id });
      }

      if (request.method === "POST" && isUser && edge === "media_publish") {
        if (!params.creation_id) return ERRORS.missingParam("creation_id");
        const container = await load(`container:${params.creation_id}`);
        if (!container) return ERRORS.unknownObject(params.creation_id);
        if (container.status === "PUBLISHED") return ERRORS.published();
        if (container.status !== "FINISHED") return ERRORS.notReady();
        if (fail === "rate-limit" || container.fail === "rate-limit" || (await postsToday()) >= FAKE_LIMITS.postsPerDay) {
          return ERRORS.rateLimit();
        }
        const post = {
          id: newId(),
          caption: container.caption,
          imageUrl: container.imageUrl,
          username,
          timestamp: new Date(now()).toISOString(),
        };
        await save(`post:${post.id}`, post);
        await save("posts", [...(await postIndex()), { id: post.id, caption: post.caption, timestamp: post.timestamp }].slice(-200));
        await save(`container:${container.id}`, { ...container, status: "PUBLISHED", mediaId: post.id });
        return json({ id: post.id });
      }

      if (request.method === "GET" && parts.length === 1) {
        const fields = String(params.fields || "id").split(",");
        const container = await load(`container:${id}`);
        if (container) {
          if (container.status === "IN_PROGRESS") {
            const mode = container.fail || fail;
            container.checks += 1;
            if (mode === "error") container.status = "ERROR";
            else if (mode !== "stuck" && (mode !== "slow" || container.checks > SLOW_CHECKS)) container.status = "FINISHED";
            await save(`container:${id}`, container);
          }
          const out = { id };
          if (fields.includes("status_code")) out.status_code = container.status;
          if (fields.includes("status")) out.status = container.status === "ERROR" ? "Error: the image could not be processed." : container.status;
          return json(out);
        }
        const post = await load(`post:${id}`);
        if (post) {
          const out = { id };
          if (fields.includes("permalink")) out.permalink = `${url.origin}/p/${id}`;
          if (fields.includes("caption")) out.caption = post.caption;
          if (fields.includes("media_type")) out.media_type = "IMAGE";
          if (fields.includes("timestamp")) out.timestamp = post.timestamp;
          return json(out);
        }
        return ERRORS.unknownObject(id);
      }

      return ERRORS.unknownObject(parts.join("/") || "/");
    },
  };
}
