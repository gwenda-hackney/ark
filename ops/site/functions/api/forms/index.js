import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { listFormSubmissions } from "../../_lib/form-submissions.js";

export const onRequestGet = withApiHandler(async (context) => {
  const submissions = await listFormSubmissions(context.env);
  return jsonResponse({ submissions });
});
