import test from "node:test";
import assert from "node:assert/strict";
import { isOpsAdmin, parseAdminEmails } from "./admin.js";

test("admin list parses commas, spaces and case", () => {
  assert.deepEqual([...parseAdminEmails(" A@x.com, b@x.com;c@x.com ")], ["a@x.com", "b@x.com", "c@x.com"]);
});

test("only listed emails are admins in hosted ops; everyone locally", async () => {
  const read = async () => "dan@gwenda.co.uk";
  assert.equal(await isOpsAdmin({ SITE_ENV: "production" }, "Dan@Gwenda.co.uk", { read }), true);
  assert.equal(await isOpsAdmin({ SITE_ENV: "production" }, "play@gwenda.co.uk", { read }), false);
  assert.equal(await isOpsAdmin({ SITE_ENV: "production" }, "", { read }), false);
  assert.equal(await isOpsAdmin({ SITE_ENV: "local" }, "", { read }), true);
});
