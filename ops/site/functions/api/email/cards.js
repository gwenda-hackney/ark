import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { emailFrame } from "../../../src/email/server/email-frame.js";
import { eventCardChoices } from "../../../src/email/server/event-cards.js";

/** What an Event card can show (#348): the nights, deals and pop-up kitchens to come, in the card's words. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse(await eventCardChoices(context.env, { site: emailFrame(context.env).site }));
});
