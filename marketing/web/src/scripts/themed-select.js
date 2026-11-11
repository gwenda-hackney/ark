/**
 * The site's one dropdown: a themed list of options over a native <select>.
 *
 * The native select stays in the page as the form's value, the thing
 * validation reads, and the whole control when there is no JS. On a device
 * with a mouse or keyboard it is hidden behind a button and a listbox we can
 * draw in the site's look (the browser's own popup is drawn by the OS and
 * takes no CSS). On touch devices it is left alone: the phone's own picker is
 * the better control there, and only the closed field is styled (CSS).
 *
 * Keys, as a native select: on the button, Enter / Space / arrows open the
 * list and typing picks a match; in the list, arrows, Home, End and typing
 * move, Enter or Space picks, Escape closes, Tab picks and moves on.
 *
 * Classes (styled in global.css, themed in chart-forms.css):
 * .gw-select(.is-open, .is-drop-up) > .gw-select-trigger(.is-placeholder)
 * > .gw-select-value + .gw-select-chevron, then .gw-select-menu
 * > .gw-select-option(.is-selected).
 */

const TYPEAHEAD_RESET_MS = 700;
const MENU_MAX_PX = 16 * 16;

/** @type {{ root: HTMLElement, close: () => void } | null} */
let openSelect = null;
let documentBound = false;

/** Closes whichever themed select is open, if any. */
export function closeThemedSelects() {
  openSelect?.close();
}

/** True where the device's own picker should be kept (phones, tablets). */
export function prefersNativePicker(win = globalThis) {
  if (typeof win.matchMedia !== "function") return false;
  return win.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function bindDocument() {
  if (documentBound) return;
  documentBound = true;
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (openSelect && !openSelect.root.contains(event.target)) {
      openSelect.close();
    }
  });
}

/**
 * The first option at or after `from` (wrapping) whose text starts with
 * `query`, or -1.
 * @param {string[]} labels
 * @param {string} query
 * @param {number} from
 */
export function typeaheadMatch(labels, query, from = 0) {
  const needle = query.trim().toLowerCase();
  if (!needle || !labels.length) return -1;
  for (let step = 0; step < labels.length; step += 1) {
    const index = (from + step + labels.length) % labels.length;
    if (labels[index].toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}

/**
 * @param {HTMLSelectElement} select
 * @returns {HTMLElement | null} the wrapper, or null if left native
 */
function enhance(select) {
  const parent = select.parentElement;
  if (!parent || select.closest(".gw-select")) return null;
  if (select.multiple || select.size > 1) return null;

  const placeholder =
    [...select.options]
      .find((opt) => opt.disabled && !opt.value)
      ?.textContent?.trim() || "Select…";
  const choices = [...select.options].filter((opt) => !opt.disabled);
  const baseId = select.id || select.name;

  const root = document.createElement("div");
  root.className = "gw-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "gw-select-trigger";
  trigger.id = `${baseId}-trigger`;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const valueEl = document.createElement("span");
  valueEl.className = "gw-select-value";
  valueEl.id = `${baseId}-value`;

  const chevron = document.createElement("span");
  chevron.className = "gw-select-chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(valueEl, chevron);

  const menu = document.createElement("ul");
  menu.className = "gw-select-menu";
  menu.id = `${baseId}-listbox`;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  trigger.setAttribute("aria-controls", menu.id);

  /** @type {HTMLElement[]} */
  const items = choices.map((opt, index) => {
    const item = document.createElement("li");
    item.className = "gw-select-option";
    item.id = `${baseId}-option-${index}`;
    item.setAttribute("role", "option");
    item.dataset.value = opt.value;
    item.textContent = opt.textContent?.trim() || opt.value;
    item.tabIndex = -1;
    return item;
  });
  menu.append(...items);
  const labels = items.map((item) => item.textContent || "");

  // The label names the button; the chosen value is read after it.
  const label = select.id
    ? [...parent.querySelectorAll("label")].find(
        (el) => el.htmlFor === select.id,
      )
    : null;
  if (label instanceof HTMLElement) {
    if (!label.id) label.id = `${baseId}-label`;
    label.setAttribute("for", trigger.id);
    trigger.setAttribute("aria-labelledby", `${label.id} ${valueEl.id}`);
    menu.setAttribute("aria-labelledby", label.id);
  }
  const describedBy = select.getAttribute("aria-describedby");
  if (describedBy) trigger.setAttribute("aria-describedby", describedBy);
  if (select.required) trigger.setAttribute("aria-required", "true");

  select.classList.add("visually-hidden");
  select.setAttribute("tabindex", "-1");
  select.setAttribute("aria-hidden", "true");
  parent.insertBefore(root, select);
  root.append(trigger, menu, select);

  const sync = () => {
    const selected = select.selectedOptions[0];
    const empty = !selected || !selected.value;
    valueEl.textContent = empty
      ? placeholder
      : selected.textContent?.trim() || placeholder;
    trigger.classList.toggle("is-placeholder", empty);
    trigger.disabled = select.disabled;
    for (const item of items) {
      const active = !empty && item.dataset.value === select.value;
      item.classList.toggle("is-selected", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
    }
  };

  const isOpen = () => openSelect?.root === root;

  const close = () => {
    if (!isOpen()) return;
    openSelect = null;
    root.classList.remove("is-open", "is-drop-up");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  };

  const focusItem = (index) => {
    const item = items[Math.max(0, Math.min(items.length - 1, index))];
    if (!item) return;
    item.focus({ preventScroll: true });
    item.scrollIntoView?.({ block: "nearest" });
  };

  const selectedIndex = () =>
    items.findIndex((item) => item.classList.contains("is-selected"));

  const open = (focusIndex = selectedIndex()) => {
    if (select.disabled || !items.length) return;
    closeThemedSelects();
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    openSelect = { root, close };

    // Opens upward when the list would run off the bottom of the window.
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(menu.scrollHeight, MENU_MAX_PX);
    const below = window.innerHeight - rect.bottom;
    root.classList.toggle(
      "is-drop-up",
      below < menuHeight + 24 && rect.top > below,
    );
    focusItem(focusIndex < 0 ? 0 : focusIndex);
  };

  const choose = (index) => {
    const item = items[index];
    if (!item) return;
    if (select.value !== item.dataset.value) {
      select.value = item.dataset.value ?? "";
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
  };

  let typed = "";
  let typedAt = 0;
  /** Adds a typed letter; returns the option it lands on, or -1. */
  const typeahead = (key, from) => {
    const now = Date.now();
    if (now - typedAt > TYPEAHEAD_RESET_MS) typed = "";
    typedAt = now;
    typed += key;
    // The same letter again steps through the options that start with it.
    const repeat = typed.length > 1 && [...typed].every((c) => c === typed[0]);
    return repeat
      ? typeaheadMatch(labels, typed[0], from + 1)
      : typeaheadMatch(labels, typed, typed.length > 1 ? from : from + 1);
  };
  const isTypeable = (event) =>
    event.key.length === 1 &&
    event.key !== " " &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;

  trigger.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });

  trigger.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      open();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      open(event.key === "Home" ? 0 : items.length - 1);
      return;
    }
    if (isTypeable(event)) {
      const match = typeahead(event.key, selectedIndex());
      if (match >= 0) choose(match);
    }
  });

  menu.addEventListener("keydown", (event) => {
    const index = items.indexOf(
      /** @type {HTMLElement} */ (document.activeElement),
    );
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.focus();
        return;
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        return;
      case "Home":
      case "PageUp":
        event.preventDefault();
        focusItem(0);
        return;
      case "End":
      case "PageDown":
        event.preventDefault();
        focusItem(items.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(index);
        close();
        trigger.focus();
        return;
      case "Tab":
        // As a native select: Tab keeps the option you were on and moves on
        // (from the button, so the browser finds the next field itself).
        choose(index);
        close();
        trigger.focus();
        return;
      default:
        if (isTypeable(event)) {
          event.preventDefault();
          const match = typeahead(event.key, Math.max(index, 0));
          if (match >= 0) focusItem(match);
        }
    }
  });

  items.forEach((item, index) => {
    item.addEventListener("click", () => {
      choose(index);
      close();
      trigger.focus();
    });
    // One highlight, not two: the pointer moves the same focus the keys do.
    item.addEventListener("pointermove", () => {
      if (document.activeElement !== item) item.focus({ preventScroll: true });
    });
  });

  // Focus leaving the control (a click elsewhere, another field) closes it.
  root.addEventListener("focusout", (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && root.contains(next)) return;
    if (next) close();
  });

  select.addEventListener("change", sync);
  select.form?.addEventListener("reset", () => setTimeout(sync));
  sync();
  return root;
}

/**
 * Themes every single-choice select under `root`.
 * @param {ParentNode} root
 * @param {{ selector?: string, win?: Window }} [options]
 * @returns {HTMLElement[]} the wrappers made (none on touch devices)
 */
export function initThemedSelects(root, options = {}) {
  const { selector = "select", win = globalThis } = options;
  if (!root || typeof root.querySelectorAll !== "function") return [];
  if (prefersNativePicker(win)) return [];
  const made = [];
  for (const select of root.querySelectorAll(selector)) {
    if (!(select instanceof HTMLSelectElement)) continue;
    const wrapper = enhance(select);
    if (wrapper) made.push(wrapper);
  }
  if (made.length) bindDocument();
  return made;
}
