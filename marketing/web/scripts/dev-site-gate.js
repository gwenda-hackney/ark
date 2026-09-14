import {
  AUTH_COOKIE_NAME,
  buildAuthCookie,
  createAuthToken,
  gateBypassRedirectPath,
  isPublicPath,
  isUnauthenticatedCrawler,
  matchesSecret,
  parseCookies,
  safeRedirectPath,
  verifyAuthToken,
} from "../functions/_lib/site-auth.js";

/** Vite dev plugin — must run at the Node HTTP layer (Astro static middleware cannot read cookies). */
export function devSiteGate({ password, bypassKey } = {}) {
  if (!password) return null;

  const handleAuthPost = (req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { password: submitted, next: nextPath } = JSON.parse(
          body || "{}",
        );
        if (submitted !== password) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "That password isn't right." }));
          return;
        }

        const token = await createAuthToken(password);
        const redirect = safeRedirectPath(nextPath);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Set-Cookie", buildAuthCookie(token, { secure: false }));
        res.end(JSON.stringify({ ok: true, redirect }));
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid request." }));
      }
    });
  };

  const handleGate = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const cookies = parseCookies(req.headers.cookie);
    const authed = await verifyAuthToken(password, cookies[AUTH_COOKIE_NAME]);
    const accessParam = url.searchParams.get("access");

    if (bypassKey && accessParam && matchesSecret(accessParam, bypassKey)) {
      const redirectPath = gateBypassRedirectPath(url);
      if (redirectPath) {
        const headers = { Location: redirectPath };
        if (!authed) {
          const token = await createAuthToken(password);
          headers["Set-Cookie"] = buildAuthCookie(token, { secure: false });
        }
        res.writeHead(302, headers);
        res.end();
        return;
      }
    }

    if (url.pathname === "/api/auth" && req.method === "POST") {
      handleAuthPost(req, res);
      return;
    }

    if (url.pathname === "/gate" || url.pathname === "/gate/") {
      if (authed) {
        const next = safeRedirectPath(url.searchParams.get("next"));
        res.writeHead(302, { Location: next });
        res.end();
        return;
      }
      next();
      return;
    }

    if (isPublicPath(url.pathname)) {
      next();
      return;
    }

    if (isUnauthenticatedCrawler(req)) {
      next();
      return;
    }

    if (authed) {
      next();
      return;
    }

    const gate = new URL("/gate", url.origin);
    const nextPath = url.pathname + url.search;
    if (nextPath !== "/") gate.searchParams.set("next", nextPath);
    res.writeHead(302, { Location: `${gate.pathname}${gate.search}` });
    res.end();
  };

  return {
    name: "dev-site-gate",
    enforce: "post",
    configureServer(server) {
      return () => {
        const { stack } = server.middlewares;
        const astroIndex = stack.findIndex(
          (layer) => layer.handle?.name === "astroDevHandler",
        );

        const gateLayer = { route: "", handle: handleGate };

        if (astroIndex >= 0) {
          stack.splice(astroIndex, 0, gateLayer);
        } else {
          stack.unshift(gateLayer);
        }
      };
    },
  };
}
