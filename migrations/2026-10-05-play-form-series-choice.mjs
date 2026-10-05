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
export const app = "web";
export const phase = "post";
export const about = "Play form: availability lists the series taking applications";

const FORM_SLUG = "play";
const FIELD_KEY = "availability";

export async function up({ sanity, log }) {
  const content = sanity();
  const result = await content.query(
    `{
      "forms": *[_type == "form" && slug.current == $slug]{ _id, "field": fields[key == $key][0]{ _key, type } },
      "series": count(*[_type == "eventSeries" && takingApplications == true && removed != true && !(_id in path("drafts.**"))])
    }`,
    { slug: FORM_SLUG, key: FIELD_KEY },
  );
  const project = content.project;
  const forms = (result?.forms || []).filter((form) => form.field?._key);
  if (!forms.length) return log(`${project}: no ${FORM_SLUG} form with a ${FIELD_KEY} field`);
  const todo = forms.filter((form) => form.field.type !== "seriesChoice");
  if (!todo.length) return log(`${project}: already lists the series taking applications`);
  if (!result.series) return log(`${project}: waiting until a series is Taking applications in ops`);

  await content.mutate(
    todo.map((form) => ({
      patch: { id: form._id, set: { [`fields[_key=="${form.field._key}"].type`]: "seriesChoice" } },
    })),
  );
  log(`${project}: ${todo.map((form) => form._id).join(", ")} now list the series taking applications`);
}
