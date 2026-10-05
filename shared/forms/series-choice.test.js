import { describe, expect, it } from "vitest";
import { seriesOption, shortRecurrence, withSeriesChoices } from "./series-choice.js";
import { validateFormAnswers } from "../../marketing/web/functions/_lib/form-submit.js";

const form = {
  slug: "play",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "availability", label: "Which nights?", type: "seriesChoice", required: true },
  ],
  applicationSeries: [
    { value: "the-jazz-room", label: "The Jazz Room", recurrence: "Every Wednesday" },
    { value: "negroni-chess-society", label: "Negroni Chess Society", recurrence: "" },
  ],
};

describe("series choice fields (#41)", () => {
  it("become a multiple choice of the series taking applications", () => {
    const expanded = withSeriesChoices(form);
    expect(expanded.applicationSeries).toBeUndefined();
    expect(expanded.fields[1]).toMatchObject({ key: "availability", type: "multiSelect", labelAsAnswer: true });
    expect(expanded.fields[1].options).toEqual([
      { value: "the-jazz-room", label: "The Jazz Room · Wednesdays", name: "The Jazz Room" },
      { value: "negroni-chess-society", label: "Negroni Chess Society", name: "Negroni Chess Society" },
    ]);
  });

  it("leave the question off when no series is taking applications", () => {
    expect(withSeriesChoices({ ...form, applicationSeries: [] }).fields.map((f) => f.key)).toEqual(["name"]);
  });

  it("answer with the series names and refuse a series that isn't listed", () => {
    const expanded = withSeriesChoices(form);
    const ok = validateFormAnswers(expanded, { name: "Ada", availability: ["the-jazz-room", "negroni-chess-society"] });
    expect(ok.ok).toBe(true);
    expect(ok.answers.find((a) => a.key === "availability").value).toBe("The Jazz Room, Negroni Chess Society");
    expect(validateFormAnswers(expanded, { name: "Ada", availability: ["event-night"] })).toEqual({
      ok: false,
      error: "Invalid choice for Which nights?.",
    });
  });

  it("names a series without its schedule", () => {
    expect(seriesOption({ value: "x", label: " Radio Gwenda " }).label).toBe("Radio Gwenda");
  });

  it("say the weekday briefly", () => {
    expect(shortRecurrence("Every Thursday")).toBe("Thursdays");
    expect(shortRecurrence("Every Tuesday and Friday")).toBe("Tuesdays and Fridays");
    expect(shortRecurrence("Every 2 weeks on Friday")).toBe("Every 2 weeks on Friday");
    expect(shortRecurrence("Every day")).toBe("Every day");
  });

  it("list the series in week order, Monday first, undated last", () => {
    const labels = withSeriesChoices({
      ...form,
      applicationSeries: [
        { value: "radio", label: "Radio Gwenda", recurrence: "Every Sunday" },
        { value: "live", label: "Gwenda + Live", recurrence: "" },
        { value: "friday", label: "Friday, With Guests", recurrence: "Every Friday" },
        { value: "chess", label: "Negroni Chess Society", recurrence: "Every Tuesday" },
        { value: "selects", label: "Gwenda Selects", recurrence: "Every Thursday" },
      ],
    }).fields[1].options.map((option) => option.label);
    expect(labels).toEqual([
      "Negroni Chess Society · Tuesdays",
      "Gwenda Selects · Thursdays",
      "Friday, With Guests · Fridays",
      "Radio Gwenda · Sundays",
      "Gwenda + Live",
    ]);
  });
});
