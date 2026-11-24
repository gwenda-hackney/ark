import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { requestIsAdmin } from "../../../src/access/server/admin.js";
import { listPeople } from "../../../src/email/server/people.js";

/** Everyone on our list (Email → People), with their Mailchimp status. Admins only: it's guests' email addresses. */
export const onRequestGet = withApiHandler(async (context) => {
  if (!(await requestIsAdmin(context.env, context.request))) {
    return jsonResponse({ error: "Only admins can see the people on the list." }, 403);
  }
  return jsonResponse({ ok: true, ...(await listPeople(context.env)) });
});
