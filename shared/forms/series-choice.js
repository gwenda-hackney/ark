/**
 * "Series taking applications" form fields (#41). Instead of options typed
 * into Sanity, which went out of date as series were renamed and ended, the
 * choices are the published series ops marks Taking applications.
 *
 * The form queries fetch them beside the fields (APPLICATION_SERIES_PROJECTION),
 * and withSeriesChoices turns each such field into an ordinary multiple
 * choice before the form is drawn or an answer checked. The value kept is the
 * series' web address (its id on the website); answers show its name.
 */

export const SERIES_CHOICE = "seriesChoice";

export const APPLICATION_SERIES_PROJECTION = `"applicationSeries": *[
  _type == "eventSeries" && takingApplications == true && removed != true && defined(slug.current)
] | order(title asc) { "value": slug.current, "label": title, recurrence }`;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKLY = new RegExp(`^Every (${WEEKDAYS.join("|")})((?: and (?:${WEEKDAYS.join("|")}))*)$`);

/** "Every Thursday" → "Thursdays"; other schedules ("Every 2 weeks on …") stay as ops wrote them. */
export function shortRecurrence(recurrence) {
  const when = String(recurrence ?? "").trim();
  return WEEKLY.test(when) ? when.slice("Every ".length).replace(/day\b/g, "days") : when;
}

/** Monday first; series without a weekday after the rest. */
function weekdayRank(recurrence) {
  const ranks = WEEKDAYS.map((day, i) => (String(recurrence ?? "").includes(day) ? i : 7));
  return Math.min(...ranks);
}

/** One series as a choice: its name, and when it runs if the website says. */
export function seriesOption(series) {
  const title = String(series?.label ?? "").trim();
  const when = shortRecurrence(series?.recurrence);
  return { value: String(series?.value ?? "").trim(), label: when ? `${title} · ${when}` : title, name: title };
}

/** The series in week order (Monday first), then by name. */
export function sortSeriesByWeekday(series) {
  return [...series].sort(
    (a, b) =>
      weekdayRank(a?.recurrence) - weekdayRank(b?.recurrence) ||
      String(a?.label ?? "").localeCompare(String(b?.label ?? "")),
  );
}

/**
 * The form with each series field as a multiple choice of the series taking
 * applications. `labelAsAnswer` makes the answer read as the names.
 */
export function withSeriesChoices(form) {
  if (!form || !Array.isArray(form.fields)) return form;
  const options = sortSeriesByWeekday(form.applicationSeries ?? []).map(seriesOption).filter((option) => option.value && option.name);
  const { applicationSeries: _series, ...rest } = form;
  return {
    ...rest,
    // No series taking applications: the question is left off, not required.
    fields: form.fields
      .filter((field) => field?.type !== SERIES_CHOICE || options.length > 0)
      .map((field) =>
        field?.type === SERIES_CHOICE ? { ...field, type: "multiSelect", options, labelAsAnswer: true } : field,
      ),
  };
}
