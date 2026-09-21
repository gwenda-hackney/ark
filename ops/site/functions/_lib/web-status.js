/**
 * Website environment status: code SHA, Sanity content fingerprint, health.
 * Ops compares hosted staging to production. Local/dev is branch work.
 */

export const SITE_HEALTH_URL = "https://health.gwenda.co.uk";

export const WEB_ENVIRONMENTS = {
  staging: {
    id: "staging",
    label: "Staging",
    hosted: true,
    siteUrl: "https://gwenda-staging.pages.dev",
    dataset: "staging",
    git: "main",
  },
  production: {
    id: "production",
    label: "Production",
    hosted: true,
    siteUrl: "https://gwenda.co.uk",
    dataset: "production",
    git: "release",
  },
};

const FINGERPRINT_QUERY = `*[!(_id in path("drafts.**"))]{ _id, _rev, _updatedAt }`;

export function parseSiteHealthPayload(data) {
  if (!data || typeof data !== "object") return null;
  if (data.ok !== true || data.service !== "gwenda") return null;
  return {
    ok: true,
    service: data.service,
    env: typeof data.env === "string" && data.env ? data.env : null,
    dataset: typeof data.dataset === "string" && data.dataset ? data.dataset : null,
    commit: typeof data.commit === "string" && data.commit ? data.commit : null,
  };
}

export function fingerprintFromDocs(docs) {
  const rows = Array.isArray(docs) ? docs : [];
  const published = rows
    .filter((row) => row && typeof row._id === "string")
    .map((row) => ({
      id: row._id,
      rev: typeof row._rev === "string" ? row._rev : "",
      updatedAt: typeof row._updatedAt === "string" ? row._updatedAt : "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  let updatedAt = null;
  for (const row of published) {
    if (row.updatedAt && (!updatedAt || row.updatedAt > updatedAt)) {
      updatedAt = row.updatedAt;
    }
  }
  const payload = published.map((row) => `${row.id}:${row.rev}`).join("\n");
  return {
    count: published.length,
    updatedAt,
    hash: hashString(payload),
  };
}

export function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function driftBetween(staging, production) {
  const stagingCommit = staging?.code?.commit || null;
  const productionCommit = production?.code?.commit || null;
  const stagingHash = staging?.content?.hash || null;
  const productionHash = production?.content?.hash || null;
  const haveCode = Boolean(stagingCommit && productionCommit);
  const haveContent = Boolean(stagingHash && productionHash);
  const codeAhead = haveCode && stagingCommit !== productionCommit;
  const contentAhead = haveContent && stagingHash !== productionHash;
  const inSync = haveCode && haveContent && !codeAhead && !contentAhead;
  return {
    inSync,
    codeAhead,
    contentAhead,
    unknown: !haveCode || !haveContent,
  };
}

export function driftLabel(drift, from = "Staging", to = "production") {
  if (!drift) return "Status unknown";
  if (drift.inSync) return `${from} matches ${to}`;
  if (drift.unknown && !drift.codeAhead && !drift.contentAhead) {
    return `Could not compare ${from.toLowerCase()} and ${to}`;
  }
  const parts = [];
  if (drift.codeAhead) parts.push("code ahead");
  if (drift.contentAhead) parts.push("content ahead");
  if (!parts.length) return `Could not compare ${from.toLowerCase()} and ${to}`;
  return `${from} is ${parts.join(" and ")}`;
}

export function lastErrorFromChecks(checks) {
  const rows = Array.isArray(checks) ? checks : [];
  const failed = rows.find((row) => row && row.ok === false);
  if (!failed) return null;
  const name = failed.name || "check";
  const error = failed.error || (failed.status != null ? `HTTP ${failed.status}` : "failed");
  return `${name}: ${error}`;
}

export function healthSummaryFromState(site) {
  if (!site) {
    return { ok: null, down: false, lastError: null, lastCheckedAt: null };
  }
  const down = Boolean(site.down);
  const lastError =
    site.lastError ||
    lastErrorFromChecks(site.lastProbe?.checks) ||
    null;
  return {
    ok: down ? false : site.ok !== false,
    down,
    lastError: down || site.ok === false ? lastError : null,
    lastCheckedAt: site.lastCheckedAt || null,
    consecutiveFails: site.consecutiveFails || 0,
  };
}

export async function fetchSiteHealth(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: "follow" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Health check failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  const parsed = parseSiteHealthPayload(data);
  if (!parsed) {
    const error = new Error("Health payload was not ok.");
    error.status = 502;
    throw error;
  }
  return parsed;
}

export async function fetchMonitorStatus(baseUrl, fetchImpl = fetch, token = "") {
  const url = `${String(baseUrl || SITE_HEALTH_URL).replace(/\/$/, "")}/status`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, { redirect: "follow", headers });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok !== true) return null;
  return data;
}

export async function fetchContentFingerprint(env, dataset, sanityQuery) {
  const docs = await sanityQuery(env, dataset, FINGERPRINT_QUERY);
  return fingerprintFromDocs(docs);
}

export function emptyEnvStatus(id) {
  const meta = WEB_ENVIRONMENTS[id] || WEB_ENVIRONMENTS.staging;
  return {
    id: meta.id,
    label: meta.label,
    hosted: meta.hosted,
    siteUrl: meta.siteUrl,
    dataset: meta.dataset,
    git: meta.git,
    code: { commit: null, env: null, dataset: null, error: null },
    content: { hash: null, count: 0, updatedAt: null, error: null },
    health: { ok: null, down: false, lastError: null, lastCheckedAt: null },
  };
}

export function applyLiveHealth(status, live) {
  if (!live) return status;
  return {
    ...status,
    code: {
      commit: live.commit,
      env: live.env,
      dataset: live.dataset,
      error: null,
    },
  };
}

export function applyFingerprint(status, fingerprint) {
  if (!fingerprint) return status;
  return {
    ...status,
    content: {
      hash: fingerprint.hash,
      count: fingerprint.count,
      updatedAt: fingerprint.updatedAt,
      error: null,
    },
  };
}

export function applyMonitorHealth(status, monitorSite) {
  const health = healthSummaryFromState(monitorSite);
  return { ...status, health };
}

export function withError(status, area, message) {
  if (area === "code") {
    return { ...status, code: { ...status.code, error: message } };
  }
  if (area === "content") {
    return { ...status, content: { ...status.content, error: message } };
  }
  return {
    ...status,
    health: { ...status.health, ok: false, lastError: message },
  };
}

export async function collectWebStatus(env, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const sanityQuery = deps.sanityQuery;
  const healthUrl = (env.SITE_HEALTH_URL || SITE_HEALTH_URL).replace(/\/$/, "");

  let staging = emptyEnvStatus("staging");
  let production = emptyEnvStatus("production");

  const liveJobs = [
    fetchSiteHealth(WEB_ENVIRONMENTS.staging.siteUrl + "/health", fetchImpl)
      .then((live) => {
        staging = applyLiveHealth(staging, live);
      })
      .catch((error) => {
        staging = withError(
          staging,
          "code",
          error instanceof Error ? error.message : "Could not read staging health.",
        );
      }),
    fetchSiteHealth(WEB_ENVIRONMENTS.production.siteUrl + "/health", fetchImpl)
      .then((live) => {
        production = applyLiveHealth(production, live);
      })
      .catch((error) => {
        production = withError(
          production,
          "code",
          error instanceof Error ? error.message : "Could not read production health.",
        );
      }),
  ];

  const monitorJob = fetchMonitorStatus(
    healthUrl,
    fetchImpl,
    env.SITE_HEALTH_STATUS_TOKEN || "",
  )
    .then((monitor) => {
      const sites = monitor?.sites || {};
      staging = applyMonitorHealth(staging, sites.staging);
      production = applyMonitorHealth(production, sites.production);
    })
    .catch(() => {});

  const contentJobs = sanityQuery
    ? [
        fetchContentFingerprint(env, WEB_ENVIRONMENTS.staging.dataset, sanityQuery)
          .then((fp) => {
            staging = applyFingerprint(staging, fp);
          })
          .catch((error) => {
            staging = withError(
              staging,
              "content",
              error instanceof Error ? error.message : "Could not read staging content.",
            );
          }),
        fetchContentFingerprint(
          env,
          WEB_ENVIRONMENTS.production.dataset,
          sanityQuery,
        )
          .then((fp) => {
            production = applyFingerprint(production, fp);
          })
          .catch((error) => {
            production = withError(
              production,
              "content",
              error instanceof Error
                ? error.message
                : "Could not read production content.",
            );
          }),
      ]
    : [];

  await Promise.all([...liveJobs, monitorJob, ...contentJobs]);

  const drift = driftBetween(staging, production);
  const lastError =
    production.health.lastError ||
    staging.health.lastError ||
    production.code.error ||
    staging.code.error ||
    null;

  return {
    environments: { staging, production },
    drift,
    driftLabel: driftLabel(drift),
    lastError,
    promote: {
      toStaging: true,
      toProduction: true,
    },
  };
}
