import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { requestAccess } from "../../../src/access/server/access.js";
import { listPeople } from "../../../src/email/server/people.js";

/** Everyone on our list (Email → People), with their Mailchimp status. Only with access to Email people (#375): it's guests' email addresses. */
export const onRequestGet = withApiHandler(async (context) => {
  const { levels } = await requestAccess(context);
  if (!levels["email-people"] || levels["email-people"] === "none") {
    return jsonResponse(
      { error: "You can't see the people on the list. Ask an owner." },
      403,
    );
  }
  return jsonResponse({ ok: true, ...(await listPeople(context.env)) });
});
