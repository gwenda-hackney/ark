import { describe, expect, it } from "vitest";
import { parseInviteChannel } from "../src/lib.js";
import type { ClickUpCustomField } from "../src/types.js";

function resolveDropdownValue(field: ClickUpCustomField): string {
  const options = field.type_config?.options ?? [];
  const value = field.value;
  if (value == null || options.length === 0) return "";

  if (typeof value === "number") {
    const match =
      options.find((option) => option.orderindex === value) ??
      options.find((option) => String(option.orderindex) === String(value));
    return match?.name?.trim() ?? String(value);
  }

  if (typeof value === "string") {
    const match = options.find((option) => option.id === value);
    return match?.name?.trim() ?? value.trim();
  }

  return "";
}

describe("ClickUp dropdown channel", () => {
  it("maps orderindex to option name", () => {
    const field: ClickUpCustomField = {
      type: "drop_down",
      value: 1,
      type_config: {
        options: [
          { id: "a", name: "Email", orderindex: 0 },
          { id: "b", name: "Instagram", orderindex: 1 },
        ],
      },
    };
    expect(resolveDropdownValue(field)).toBe("Instagram");
    expect(parseInviteChannel(resolveDropdownValue(field))).toBe("instagram");
  });
});
