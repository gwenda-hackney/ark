import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { listFormSubmissions } from "../../../src/forms/server/form-submissions.js";

export const onRequestGet = withApiHandler(async (context) => {
  const submissions = await listFormSubmissions(context.env);
  return jsonResponse({ submissions });
});
