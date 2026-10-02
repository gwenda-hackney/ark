import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  APP_SECRETS,
  SECRET_OWNERS,
  assertProductionReadable,
  defaultSecretEnv,
  DEV_PROJECT_NAMES,
  pickVisibleProjectIds,
  envSecretKey,
  isSmRateLimited,
  ownerOf,
  parseSecretKey,
  pickAppSecrets,
  pickProjectIds,
  redactBwsFailure,
  resolveSecretsForEnv,
  secretCreateArgs,
  secretEditArgs,
  smNameFor,
  smRetryDelayMs,
} from "./bitwarden-sm.mjs";

describe("parseSecretKey", () => {
  it("splits env overrides and leaves shared names alone", () => {
    assert.deepEqual(parseSecretKey("BASEROW_OPS_API_KEY__DEV"), {
      name: "BASEROW_OPS_API_KEY",
      env: "dev",
    });
    assert.deepEqual(parseSecretKey("SANITY_API_TOKEN"), {
      name: "SANITY_API_TOKEN",
      env: null,
    });
    assert.deepEqual(parseSecretKey("WEIRD__THING"), { name: "WEIRD__THING", env: null });
    // Retired env names are not envs any more.
    assert.equal(parseSecretKey("SANITY_API_TOKEN__LOCAL").env, null);
  });

  it("round-trips with envSecretKey", () => {
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", "dev"), "FORMS_ADMIN_SECRET__DEV");
    assert.equal(envSecretKey("FORMS_ADMIN_SECRET", ""), "FORMS_ADMIN_SECRET");
  });
});

describe("resolveSecretsForEnv", () => {
  const raw = new Map([
    ["SANITY_API_TOKEN", "shared"],
    ["BASEROW_OPS_API_KEY__DEV", "ops-dev"],
    ["BASEROW_OPS_API_KEY__PRODUCTION", "ops-prod"],
    ["FORMS_ADMIN_SECRET", "shared-forms"],
    ["FORMS_ADMIN_SECRET__PRODUCTION", "prod-forms"],
    ["EMPTY__DEV", ""],
  ]);

  it("lets the env override win over the shared value", () => {
    const prod = resolveSecretsForEnv(raw, "production");
    assert.equal(prod.get("FORMS_ADMIN_SECRET"), "prod-forms");
    assert.equal(prod.get("SANITY_API_TOKEN"), "shared");
    const dev = resolveSecretsForEnv(raw, "dev");
    assert.equal(dev.get("FORMS_ADMIN_SECRET"), "shared-forms");
    assert.equal(dev.get("BASEROW_OPS_API_KEY"), "ops-dev");
  });

  it("treats a developer's machine as dev", () => {
    for (const name of ["local", "development", "dev"]) {
      assert.equal(resolveSecretsForEnv(raw, name).get("BASEROW_OPS_API_KEY"), "ops-dev");
    }
  });

  it("keeps suffixed names, so another env's value can be asked for by name", () => {
    const prod = resolveSecretsForEnv(raw, "production");
    assert.equal(prod.get("BASEROW_OPS_API_KEY"), "ops-prod");
    assert.equal(prod.get("BASEROW_OPS_API_KEY__DEV"), "ops-dev");
  });

  it("ignores empty values", () => {
    const dev = resolveSecretsForEnv(raw, "dev");
    assert.equal(dev.has("EMPTY"), false);
    assert.equal(dev.has("EMPTY__DEV"), false);
  });

  it("rejects envs that no longer exist", () => {
    assert.throws(() => resolveSecretsForEnv(raw, "staging"), /Unknown env/);
  });
});

describe("pickAppSecrets", () => {
  it("renames each app's own Baserow token to BASEROW_API_KEY", () => {
    const resolved = new Map([
      ["BASEROW_OPS_API_KEY", "ops"],
      ["BASEROW_WEBSITE_API_KEY", "web"],
      ["GOOGLE_SERVICE_ACCOUNT_JSON", "{}"],
    ]);
    const ops = pickAppSecrets("ops", resolved).values;
    assert.equal(ops.get("BASEROW_API_KEY"), "ops");
    assert.equal(ops.get("BASEROW_WEBSITE_API_KEY"), "web");
    assert.equal(ops.get("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"), "{}");
    const web = pickAppSecrets("web", resolved).values;
    assert.equal(web.get("BASEROW_API_KEY"), "web");
    assert.equal(web.get("BASEROW_OPS_API_KEY"), "ops");
    assert.equal(web.get("GMAIL_SERVICE_ACCOUNT_JSON"), "{}");
  });

  it("reports missing keys by runtime name", () => {
    const { missing } = pickAppSecrets("ark", new Map([["CLOUDFLARE_ACCOUNT_ID", "a"]]));
    assert.deepEqual(missing, ["CLOUDFLARE_API_TOKEN"]);
  });

  it("gives production ops the dev ops token under its suffixed name", () => {
    const resolved = resolveSecretsForEnv(
      new Map([
        ["BASEROW_OPS_API_KEY__PRODUCTION", "ops-prod"],
        ["BASEROW_OPS_API_KEY__DEV", "ops-dev"],
      ]),
      "production",
    );
    const ops = pickAppSecrets("ops", resolved).values;
    assert.equal(ops.get("BASEROW_API_KEY"), "ops-prod");
    assert.equal(ops.get("BASEROW_OPS_API_KEY__DEV"), "ops-dev");
  });
});

describe("catalog", () => {
  it("gives every app key an owning project", () => {
    for (const app of Object.keys(APP_SECRETS)) {
      for (const key of APP_SECRETS[app].keys) {
        assert.ok(ownerOf(smNameFor(app, key)), `${app} ${key} has no owner`);
      }
    }
  });

  it("owns each SM name in one project only", () => {
    const all = Object.values(SECRET_OWNERS).flat();
    assert.equal(new Set(all).size, all.length);
  });

  it("keeps the local admin password off Pages", () => {
    assert.ok(APP_SECRETS.ops.pagesSkip.includes("OPS_LOCAL_ADMIN_PW"));
  });
});

describe("Secrets Manager rate limits", () => {
  it("recognises the 429 bws prints, and nothing else", () => {
    const bws429 =
      'Error: \n   0: Received error message from server: [429 Too Many Requests] {"object":"error","message":"Slow down! Too many requests. Try again in 1s."}';
    assert.equal(isSmRateLimited(bws429), true);
    assert.equal(isSmRateLimited("[401 Unauthorized] invalid access token"), false);
    assert.equal(isSmRateLimited("Resource not found"), false);
    assert.equal(isSmRateLimited(""), false);
  });

  it("backs off 1.5s, 3s, 6s, 12s", () => {
    assert.deepEqual([1, 2, 3, 4].map(smRetryDelayMs), [1500, 3000, 6000, 12000]);
  });
});

describe("pickProjectIds", () => {
  const projects = [
    { id: "a", name: "ark" },
    { id: "o", name: "Ark/Ops" },
    { id: "w", name: "ark/web" },
    { id: "x", name: "something else" },
  ];

  it("finds each project by name, ignoring case", () => {
    assert.deepEqual(pickProjectIds(projects), { ark: "a", ops: "o", web: "w" });
  });

  it("names the project the token can't see", () => {
    assert.throws(() => pickProjectIds(projects.slice(0, 2)), /No Secrets Manager project named ark\/web/);
  });

  it("refuses two projects with the same name", () => {
    assert.throws(() => pickProjectIds([...projects, { id: "a2", name: "ARK" }]), /Several .* named ark\./);
  });
});

describe("bws secret argv", () => {
  const dashValue = "--starts-with-dashes";

  it("puts a dash-leading create value after -- so clap does not treat it as a flag", () => {
    assert.deepEqual(secretCreateArgs("FORMS_ADMIN_SECRET", dashValue, "proj"), [
      "secret",
      "create",
      "FORMS_ADMIN_SECRET",
      "--",
      dashValue,
      "proj",
    ]);
  });

  it("passes notes as --note= before the end-of-options marker", () => {
    assert.deepEqual(secretCreateArgs("SITE_PASSWORD", "word", "proj", "--note-text"), [
      "secret",
      "create",
      "--note=--note-text",
      "SITE_PASSWORD",
      "--",
      "word",
      "proj",
    ]);
  });

  it("passes an edit value with --value= so a leading dash stays attached", () => {
    assert.deepEqual(secretEditArgs("sid", dashValue, "note"), [
      "secret",
      "edit",
      "sid",
      `--value=${dashValue}`,
      "--note=note",
    ]);
  });

  it("strips clap's echo of the rejected value from the error", () => {
    const detail = [
      `error: unexpected argument '${dashValue}' found`,
      `tip: to pass '${dashValue}' as a value, use '-- ${dashValue}'`,
    ].join("\n");
    const redacted = redactBwsFailure(detail);
    assert.equal(redacted.includes(dashValue), false);
    assert.match(redacted, /unexpected argument '\[redacted\]'/);
  });
});

describe("dev and production projects (#61)", () => {
  const projects = [
    { id: "a", name: "Ark" },
    { id: "ad", name: "Ark-Dev" },
    { id: "wd", name: "ark/web-dev" },
  ];

  it("finds the projects the token can see, and skips the rest", () => {
    assert.deepEqual(pickVisibleProjectIds(projects, DEV_PROJECT_NAMES), { ark: "ad", web: "wd" });
    assert.deepEqual(pickVisibleProjectIds([{ id: "a", name: "Ark" }], DEV_PROJECT_NAMES), {});
  });

  it("refuses two projects with the same name", () => {
    assert.throws(() => pickVisibleProjectIds([...projects, { id: "x", name: "ARK-DEV" }], DEV_PROJECT_NAMES), /Several/);
  });

  it("reads production on release and dev on every other branch", () => {
    assert.equal(defaultSecretEnv({ GITHUB_REF_NAME: "release" }), "production");
    assert.equal(defaultSecretEnv({ GITHUB_REF_NAME: "main" }), "dev");
    assert.equal(defaultSecretEnv({ GITHUB_REF_NAME: "feat/x" }), "dev");
    assert.equal(defaultSecretEnv({}), "dev");
  });

  it("stops a production pull by a token that sees no production values", () => {
    assert.throws(
      () => assertProductionReadable(new Map([["CLOUDFLARE_API_TOKEN", "x"], ["SANITY_API_TOKEN__DEV", "y"]])),
      /can't read production secrets/,
    );
    assert.doesNotThrow(() => assertProductionReadable(new Map([["SANITY_API_TOKEN__PRODUCTION", "z"]])));
  });
});
