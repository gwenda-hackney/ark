/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  closeThemedSelects,
  initThemedSelects,
  prefersNativePicker,
  typeaheadMatch,
} from "./themed-select.js";

/** A pick-one field as ContactForm.astro renders it. */
function mount({ selected = "" } = {}) {
  const options = [
    ["birthday", "Birthday"],
    ["leaving", "Leaving do"],
    ["work", "Work do"],
    ["wedding", "Wedding"],
    ["other", "Something else"],
  ];
  document.body.innerHTML = `
    <form>
      <div class="contact-field gw-field">
        <label for="occasion">What's the occasion?</label>
        <select id="occasion" name="occasion" required aria-describedby="occasion-help">
          <option value="" disabled ${selected ? "" : "selected"}>Select…</option>
          ${options
            .map(
              ([value, label]) =>
                `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`,
            )
            .join("")}
        </select>
      </div>
      <input id="next" />
    </form>`;
  initThemedSelects(document.body, { selector: ".gw-field > select" });
  return {
    select: document.querySelector("select"),
    trigger: document.querySelector(".gw-select-trigger"),
    menu: document.querySelector(".gw-select-menu"),
    items: [...document.querySelectorAll(".gw-select-option")],
  };
}

function key(el, name) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}

const focused = () => document.activeElement?.textContent;

describe("themed select", () => {
  beforeEach(() => {
    closeThemedSelects();
    document.body.innerHTML = "";
  });

  it("puts a button and a listbox over the select, which stays the value", () => {
    const { select, trigger, menu, items } = mount();
    expect(select.closest("form").elements.occasion).toBe(select);
    expect(select.classList.contains("visually-hidden")).toBe(true);
    expect(select.getAttribute("aria-hidden")).toBe("true");
    expect(trigger.type).toBe("button");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(menu.getAttribute("role")).toBe("listbox");
    expect(menu.hidden).toBe(true);
    expect(items.map((item) => item.textContent)).toEqual([
      "Birthday",
      "Leaving do",
      "Work do",
      "Wedding",
      "Something else",
    ]);
    expect(items.every((item) => item.getAttribute("role") === "option")).toBe(
      true,
    );
  });

  it("names the button by the field's label and its value, and keeps the help", () => {
    const { trigger } = mount({ selected: "work" });
    const label = document.querySelector("label");
    expect(label.getAttribute("for")).toBe(trigger.id);
    expect(trigger.getAttribute("aria-labelledby")).toBe(
      `${label.id} occasion-value`,
    );
    expect(trigger.getAttribute("aria-describedby")).toBe("occasion-help");
    expect(trigger.getAttribute("aria-required")).toBe("true");
    expect(trigger.textContent).toBe("Work do");
  });

  it("shows the placeholder until something is picked", () => {
    const { trigger, items } = mount();
    expect(trigger.textContent).toBe("Select…");
    expect(trigger.classList.contains("is-placeholder")).toBe(true);
    expect(items.some((item) => item.classList.contains("is-selected"))).toBe(
      false,
    );
  });

  it("opens on a click and picks the option clicked", () => {
    const { select, trigger, menu, items } = mount();
    const events = [];
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));

    trigger.click();
    expect(menu.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(focused()).toBe("Birthday");

    items[2].click();
    expect(select.value).toBe("work");
    expect(events).toEqual(["input", "change"]);
    expect(menu.hidden).toBe(true);
    expect(trigger.textContent).toBe("Work do");
    expect(trigger.classList.contains("is-placeholder")).toBe(false);
    expect(items[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(trigger);
  });

  it("opens on the option already chosen", () => {
    const { trigger } = mount({ selected: "wedding" });
    trigger.click();
    expect(focused()).toBe("Wedding");
  });

  it.each(["ArrowDown", "ArrowUp", "Enter", " "])(
    "opens from the button with %j",
    (name) => {
      const { trigger, menu } = mount();
      const event = key(trigger, name);
      expect(menu.hidden).toBe(false);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it("moves with the arrows, Home and End, and stops at the ends", () => {
    const { trigger, menu } = mount();
    trigger.click();
    key(menu, "ArrowDown");
    expect(focused()).toBe("Leaving do");
    key(menu, "End");
    expect(focused()).toBe("Something else");
    key(menu, "ArrowDown");
    expect(focused()).toBe("Something else");
    key(menu, "Home");
    expect(focused()).toBe("Birthday");
    key(menu, "ArrowUp");
    expect(focused()).toBe("Birthday");
  });

  it("picks with Enter and goes back to the button", () => {
    const { select, trigger, menu } = mount();
    trigger.click();
    key(menu, "ArrowDown");
    key(menu, "Enter");
    expect(select.value).toBe("leaving");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape without changing the value", () => {
    const { select, trigger, menu } = mount({ selected: "work" });
    trigger.click();
    key(menu, "ArrowDown");
    key(menu, "Escape");
    expect(select.value).toBe("work");
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the option you were on when you Tab away", () => {
    const { select, trigger, menu } = mount();
    trigger.click();
    key(menu, "ArrowDown");
    const event = key(menu, "Tab");
    expect(select.value).toBe("leaving");
    expect(menu.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("jumps to an option as you type its name, in the open list", () => {
    const { trigger, menu } = mount();
    trigger.click();
    key(menu, "w");
    expect(focused()).toBe("Work do");
    key(menu, "e");
    expect(focused()).toBe("Wedding");
  });

  it("steps through options with the same first letter", () => {
    const { trigger, menu } = mount();
    trigger.click();
    key(menu, "w");
    key(menu, "w");
    expect(focused()).toBe("Wedding");
    key(menu, "w");
    expect(focused()).toBe("Work do");
  });

  it("picks by typing on the closed button", () => {
    const { select, trigger, menu } = mount();
    key(trigger, "s");
    expect(select.value).toBe("other");
    expect(trigger.textContent).toBe("Something else");
    expect(menu.hidden).toBe(true);
  });

  it("closes on a click elsewhere", () => {
    const { trigger, menu } = mount();
    trigger.click();
    document.getElementById("next").click();
    expect(menu.hidden).toBe(true);
  });

  it("follows the select when the form changes it", () => {
    const { select, trigger } = mount();
    select.value = "birthday";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(trigger.textContent).toBe("Birthday");
  });

  it("does not wrap a select twice", () => {
    mount();
    expect(initThemedSelects(document.body)).toEqual([]);
    expect(document.querySelectorAll(".gw-select")).toHaveLength(1);
  });

  it("leaves the native select alone on touch devices", () => {
    document.body.innerHTML = `<div class="gw-field"><select name="a"><option>One</option></select></div>`;
    const touch = {
      matchMedia: (query) => ({ matches: /coarse/.test(query) }),
    };
    expect(prefersNativePicker(touch)).toBe(true);
    expect(initThemedSelects(document.body, { win: touch })).toEqual([]);
    expect(document.querySelector(".gw-select")).toBeNull();
    expect(
      document.querySelector("select").classList.contains("visually-hidden"),
    ).toBe(false);
  });
});

describe("typeaheadMatch", () => {
  const labels = ["Birthday", "Leaving do", "Work do", "Wedding"];
  it("finds the first label starting with the text, from an index, wrapping", () => {
    expect(typeaheadMatch(labels, "w")).toBe(2);
    expect(typeaheadMatch(labels, "W", 3)).toBe(3);
    expect(typeaheadMatch(labels, "b", 2)).toBe(0);
    expect(typeaheadMatch(labels, "we")).toBe(3);
  });
  it("finds nothing for no match or no text", () => {
    expect(typeaheadMatch(labels, "z")).toBe(-1);
    expect(typeaheadMatch(labels, "")).toBe(-1);
  });
});
