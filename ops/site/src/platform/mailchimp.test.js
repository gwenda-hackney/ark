/**
 * The Mailchimp client against the fake Mailchimp (testing/fake-world.js):
 * the calls the weekly email makes, what comes back, and the one rule that
 * matters most: only hosted production can send to the audience.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { createFakeWorld } from "../testing/fake-world.js";
import {
  MailchimpError,
  campaignUrl,
  canReachAudience,
  createCampaign,
  deleteCampaign,
  getAudience,
  getCampaign,
  mailchimpConfigured,
  sendCampaignTest,
  sendCampaignToAudience,
  setCampaignContent,
  updateCampaign,
} from "./mailchimp.js";

let world;
let env;
const draft = { title: "Weekly email", subject: "This week", preheader: "Thu: Quiz", fromName: "Gwenda", replyTo: "hello@example.com" };

beforeEach(async () => {
  world = await createFakeWorld();
  world.install();
  env = { ...world.env };
  world.mailchimp.connect(env);
});

afterEach(() => world.restore());

describe("Mailchimp client", () => {
  it("is connected only with a key that names its data centre, and an audience", () => {
    assert.equal(mailchimpConfigured(env), true);
    assert.equal(mailchimpConfigured(world.env), false);
    assert.equal(mailchimpConfigured({ ...env, MAILCHIMP_API_KEY: "no-data-centre-" }), false);
    assert.equal(mailchimpConfigured({ ...env, MAILCHIMP_API_KEY: "plainkey" }), false);
    assert.equal(mailchimpConfigured({ ...env, MAILCHIMP_AUDIENCE_ID: "" }), false);
  });

  it("makes no request without a key", async () => {
    await assert.rejects(() => getAudience(world.env), /isn't connected here/);
    assert.deepEqual(world.mailchimp.log, []);
  });

  it("reads the audience: its size and who campaigns come from", async () => {
    assert.deepEqual(await getAudience(env), {
      id: "list-test",
      name: "Gwenda",
      memberCount: 244,
      fromName: "Gwenda",
      replyTo: "hello@example.com",
    });
  });

  it("makes a draft, fills it, tests it to one address and deletes it", async () => {
    const campaign = await createCampaign(env, draft);
    assert.equal(campaign.status, "save");
    assert.deepEqual(world.mailchimp.campaigns.get(campaign.id).settings, {
      title: "Weekly email",
      subject_line: "This week",
      preview_text: "Thu: Quiz",
      from_name: "Gwenda",
      reply_to: "hello@example.com",
    });
    await setCampaignContent(env, campaign.id, { html: "<p>hi</p>", text: "hi" });
    await sendCampaignTest(env, campaign.id, "someone@example.com");
    assert.deepEqual(world.mailchimp.tests, [
      { campaignId: campaign.id, to: ["someone@example.com"], subject: "This week", html: "<p>hi</p>" },
    ]);
    await updateCampaign(env, campaign.id, { subject: "This week, again", preheader: "Sat: Jazz" });
    assert.equal(world.mailchimp.campaigns.get(campaign.id).settings.subject_line, "This week, again");
    assert.deepEqual(await getCampaign(env, campaign.id), {
      id: campaign.id,
      webId: campaign.webId,
      status: "save",
      emailsSent: 0,
      sendTime: "",
    });
    await deleteCampaign(env, campaign.id);
    assert.equal(world.mailchimp.campaigns.size, 0);
    assert.deepEqual(world.mailchimp.audienceSends, []);
    assert.equal(campaignUrl(env, campaign.webId), `https://us99.admin.mailchimp.com/campaigns/show/?id=${campaign.webId}`);
  });

  it("passes on what Mailchimp says when it refuses", async () => {
    world.mailchimp.fail.create = { status: 400, detail: "Your account is under review." };
    await assert.rejects(
      () => createCampaign(env, draft),
      (error) =>
        error instanceof MailchimpError &&
        error.mailchimpStatus === 400 &&
        error.message === "Mailchimp said no (400): Your account is under review.",
    );
    await assert.rejects(() => getAudience({ ...env, MAILCHIMP_API_KEY: "wrong-us99" }), /Mailchimp said no \(401\)/);
  });
});

describe("Mailchimp client: sending to the audience", () => {
  async function readyCampaign() {
    const campaign = await createCampaign(env, draft);
    await setCampaignContent(env, campaign.id, { html: "<p>hi</p>", text: "hi" });
    return campaign;
  }

  it("only hosted production can reach the audience", () => {
    assert.equal(canReachAudience({ SITE_ENV: "production" }), true);
    assert.equal(canReachAudience({ SITE_ENV: "dev" }), false);
    assert.equal(canReachAudience({ SITE_ENV: "local" }), false);
    assert.equal(canReachAudience({ SITE_ENV: "production", OPS_LOCAL_LIVE: "1" }), false);
    assert.equal(canReachAudience({ SITE_ENV: "preview" }), false);
    assert.equal(canReachAudience({}), false);
  });

  for (const [name, extra] of [
    ["hosted dev", { SITE_ENV: "dev" }],
    ["a developer's machine", { SITE_ENV: "local" }],
    ["a local copy on live data", { SITE_ENV: "production", OPS_LOCAL_LIVE: "1" }],
  ]) {
    it(`refuses on ${name}, with a key, before any request`, async () => {
      const campaign = await readyCampaign();
      const before = world.mailchimp.log.length;
      await assert.rejects(
        () => sendCampaignToAudience({ ...env, ...extra }, campaign.id),
        (error) => error.status === 403 && /Only production ops/.test(error.message),
      );
      assert.equal(world.mailchimp.log.length, before);
      assert.deepEqual(world.mailchimp.audienceSends, []);
    });
  }

  it("sends on production, and a campaign only once", async () => {
    const production = { ...env, SITE_ENV: "production" };
    const campaign = await readyCampaign();
    await sendCampaignToAudience(production, campaign.id);
    assert.equal(world.mailchimp.audienceSends.length, 1);
    assert.equal((await getCampaign(production, campaign.id)).status, "sent");
    await assert.rejects(() => sendCampaignToAudience(production, campaign.id), /already been sent/);
    assert.equal(world.mailchimp.audienceSends.length, 1);
  });
});
