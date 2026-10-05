/**
 * Play at Gwenda form (#41): its "What event night are you available for?"
 * question (key `availability`) lists the series taking applications instead
 * of choices typed into Sanity. After the website deploy, since only the new
 * code knows the field type.
 *
 * Waits until a published series is Taking applications (the website reads
 * only published ones), so the live form never loses the question: with no
 * series the site leaves it off.
 * Changes the published form and any unpublished draft of it. Safe to rerun.
 */
import { DEV_SANITY_PROJECT_ID, REAL_SANITY_PROJECT_ID } from "../shared/sanity-projects.js";

export const app = "web";
export const phase = "post";
export const about = "Play form: availability lists the series taking applications";

const FORM_SLUG = "play";
const FIELD_KEY = "availability";
const API = "v2025-01-01";

export async function up({ env, processEnv, log }) {
  const token = String(processEnv.SANITY_API_TOKEN || "").trim();
  if (!token) throw new Error("SANITY_API_TOKEN is not set.");
  const project = env === "production" ? REAL_SANITY_PROJECT_ID : DEV_SANITY_PROJECT_ID;
  const base = `https://${project}.api.sanity.io/${API}/data`;
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Sanity ${res.status}: ${await res.text()}`);
    return res.json();
  };

  const query = `{
    "forms": *[_type == "form" && slug.current == $slug]{ _id, "field": fields[key == $key][0]{ _key, type } },
    "series": count(*[_type == "eventSeries" && takingApplications == true && removed != true && !(_id in path("drafts.**"))])
  }`;
  const params = new URLSearchParams({ query, $slug: JSON.stringify(FORM_SLUG), $key: JSON.stringify(FIELD_KEY), perspective: "raw" });
  const { result } = await call(`/query/production?${params}`);
  const forms = (result?.forms || []).filter((form) => form.field?._key);
  if (!forms.length) return log(`${project}: no ${FORM_SLUG} form with a ${FIELD_KEY} field`);
  const todo = forms.filter((form) => form.field.type !== "seriesChoice");
  if (!todo.length) return log(`${project}: already lists the series taking applications`);
  if (!result.series) return log(`${project}: waiting until a series is Taking applications in ops`);

  await call("/mutate/production", {
    method: "POST",
    body: JSON.stringify({
      mutations: todo.map((form) => ({
        patch: { id: form._id, set: { [`fields[_key=="${form.field._key}"].type`]: "seriesChoice" } },
      })),
    }),
  });
  log(`${project}: ${todo.map((form) => form._id).join(", ")} now list the series taking applications`);
}
