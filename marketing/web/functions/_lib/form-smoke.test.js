import { describe, expect, it } from "vitest";
import { smokeAnswers } from "./form-smoke.js";
import { validateFormAnswers } from "./form-submit.js";

const play = {
  title: "Play at Gwenda",
  fields: [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel" },
    {
      key: "whatYouDo",
      label: "What",
      type: "multiSelect",
      required: true,
      options: [
        { label: "Other", value: "other" },
        { label: "DJ", value: "dj" },
      ],
    },
    { key: "musicLink", label: "Link", type: "url", required: true },
    {
      key: "basedWhere",
      label: "Where",
      type: "select",
      required: true,
      options: [{ label: "London" }],
    },
    { key: "description", label: "About", type: "textarea", required: true },
  ],
};

describe("smokeAnswers", () => {
  it("fills every required field with values the real validator accepts", () => {
    const answers = smokeAnswers(play, "alerts@gwenda.co.uk");
    expect(answers.email).toBe("alerts@gwenda.co.uk");
    expect(answers.whatYouDo).toEqual(["dj"]);
    expect(answers.basedWhere).toBe("London");
    expect(answers.phone).toBeUndefined();
    expect(validateFormAnswers(play, answers).ok).toBe(true);
  });
});
