/** @typedef {{ csrfToken: string, secret: string }} FormAuth */

/** @type {FormAuth | null} */
let formAuth = null;
/** @type {Promise<void> | null} */
let formAuthPromise = null;

async function loadFormAuth() {
  const res = await fetch("/api/forms", { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Try again?");
  }

  if (!data.csrfToken || !data.secret) {
    throw new Error("Something went wrong. Try again?");
  }

  formAuth = { csrfToken: data.csrfToken, secret: data.secret };
}

function ensureFormAuth() {
  if (!formAuthPromise) {
    formAuthPromise = loadFormAuth().finally(() => {
      formAuthPromise = null;
    });
  }
  return formAuthPromise;
}

function collectAnswers(form) {
  /** @type {Record<string, string | string[]>} */
  const answers = {};
  const multiKeys = new Set();

  form.querySelectorAll('input[type="checkbox"][name]').forEach((input) => {
    if (input.name.endsWith("Other")) return;
    multiKeys.add(input.name);
  });

  for (const key of multiKeys) {
    const selected = [
      ...form.querySelectorAll(
        `input[type="checkbox"][name="${CSS.escape(key)}"]:checked`,
      ),
    ].map((input) => input.value);
    answers[key] = selected;
  }

  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }
    const name = el.name;
    if (!name || name === "website" || multiKeys.has(name)) return;
    if (el instanceof HTMLInputElement && el.type === "checkbox") return;
    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (el.checked) answers[name] = el.value.trim();
      return;
    }
    answers[name] = el.value.trim();
  });

  return answers;
}

function isOtherChoiceValue(value) {
  return /^other$/i.test(String(value || "").trim());
}

function syncOtherFields(form) {
  form.querySelectorAll("[data-other-for]").forEach((wrap) => {
    if (!(wrap instanceof HTMLElement)) return;
    const key = wrap.dataset.otherFor;
    if (!key) return;

    const select = form.querySelector(
      `select[name="${CSS.escape(key)}"]`,
    );
    let otherOn = false;
    if (select instanceof HTMLSelectElement) {
      otherOn = isOtherChoiceValue(select.value);
    } else {
      otherOn = Boolean(
        form.querySelector(
          `input[name="${CSS.escape(key)}"][data-is-other="true"]:checked`,
        ),
      );
    }

    const wasHidden = wrap.hidden;
    wrap.hidden = !otherOn;
    const input = wrap.querySelector("input, textarea");
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.required = otherOn;
      if (!otherOn) {
        input.value = "";
      } else if (wasHidden) {
        requestAnimationFrame(() => input.focus());
      }
    }
  });
}

function initOtherFields(form) {
  syncOtherFields(form);
  form.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      if (!target.name || target.name.endsWith("Other")) return;
      syncOtherFields(form);
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox" && target.type !== "radio") return;
    if (!target.name || target.name.endsWith("Other")) return;
    syncOtherFields(form);
  });
}

function setError(errorEl, message) {
  if (!errorEl) return;
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function formStorageKey(slug) {
  return slug ? `gwenda-form:${slug}` : "";
}

/**
 * @param {string} slug
 * @param {{
 *   answers?: Record<string, string | string[]>,
 *   pending?: { rowId: string, resendToken: string, email: string } | null,
 *   result?: {
 *     kind: "pending" | "done",
 *     title: string,
 *     message: string,
 *     email?: string,
 *   } | null,
 * }} payload
 */
function persistFormSession(slug, payload) {
  const key = formStorageKey(slug);
  if (!key || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...payload, savedAt: Date.now() }),
    );
  } catch {
    /* ignore quota */
  }
}

function readFormSession(slug) {
  const key = formStorageKey(slug);
  if (!key || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

async function navigateToSubmitted(slug) {
  const path = `/contact/${encodeURIComponent(slug)}/submitted`;
  try {
    const { navigate } = await import("astro:transitions/client");
    navigate(path);
  } catch {
    location.assign(path);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const URL_RE = /^https?:\/\/\S+$/i;

/** Keep in sync with functions/_lib/form-field-rules.js */
function isValidEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  if (!EMAIL_RE.test(email)) return false;

  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);

  if (!local || local.length > 64) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;

  if (!domain || domain.length > 253) return false;
  if (domain.startsWith("-") || domain.endsWith("-") || domain.startsWith(".")) {
    return false;
  }
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (labels.some((label) => !label || label.length > 63)) return false;
  if (labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/i.test(tld)) return false;

  return true;
}

function isValidUrl(value) {
  return URL_RE.test(String(value ?? "").trim());
}

function isValidPhone(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (!/^[+()\d\s./-]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function isValidInstagramOrLink(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return Boolean(url.hostname.includes("."));
    } catch {
      return false;
    }
  }

  if (/^(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/i.test(trimmed)) {
    return true;
  }

  const handle = trimmed.replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle);
}

function formatErrorForFieldValue({ key, type, label, value }) {
  const fieldKey = String(key ?? "").trim();
  const fieldType = String(type ?? "").trim();
  const fieldLabel = String(label ?? "This field").trim() || "This field";
  const fieldValue = String(value ?? "").trim();
  if (!fieldValue) return "";

  if (fieldType === "email" || fieldKey === "email") {
    if (!isValidEmail(fieldValue)) {
      return "Enter a full email address (name@example.com).";
    }
  }
  if (fieldType === "tel" || fieldKey === "phone") {
    if (!isValidPhone(fieldValue)) {
      return "Enter a valid phone number (with country code if you can).";
    }
  }
  if (fieldKey === "instagram") {
    if (!isValidInstagramOrLink(fieldValue)) {
      return "Enter an @handle or a link.";
    }
  }
  if (fieldType === "url") {
    if (!isValidUrl(fieldValue)) {
      return `Enter a full link for ${fieldLabel} (https://…).`;
    }
  }
  return "";
}

function fieldWrapFor(el) {
  if (!(el instanceof Element)) return null;
  return el.closest("[data-choice-field], .contact-other, .contact-field");
}

function fieldLabelText(wrap) {
  if (!(wrap instanceof HTMLElement)) return "This field";
  const raw =
    wrap.querySelector(".contact-label-name")?.textContent ||
    wrap.querySelector(".contact-label-text")?.textContent ||
    wrap.querySelector("legend")?.textContent ||
    wrap.querySelector("label")?.textContent ||
    "This field";
  return (
    String(raw)
      .replace(/\*/g, "")
      .replace(/\bRequired\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "This field"
  );
}

function fieldErrorEl(wrap) {
  if (!(wrap instanceof HTMLElement)) return null;
  let el = wrap.querySelector(":scope > .contact-field-error");
  if (el) return el;
  el = document.createElement("p");
  el.className = "contact-field-error";
  el.setAttribute("role", "alert");
  el.hidden = true;
  wrap.append(el);
  return el;
}

function setFieldError(wrap, message) {
  if (!(wrap instanceof HTMLElement)) return;
  const error = fieldErrorEl(wrap);
  wrap.classList.toggle("is-invalid", Boolean(message));
  if (error) {
    error.hidden = !message;
    error.textContent = message || "";
  }

  const controls = wrap.querySelectorAll(
    "input:not([type='checkbox']):not([type='radio']), textarea, select, .gw-select-trigger",
  );
  for (const control of controls) {
    if (!(control instanceof HTMLElement)) continue;
    if (message) control.setAttribute("aria-invalid", "true");
    else control.removeAttribute("aria-invalid");
  }
}

function clearFieldError(wrap) {
  setFieldError(wrap, "");
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
 * @param {{ requireEmpty?: boolean }} [opts]
 * @returns {string}
 */
function messageForControl(el, opts = {}) {
  const requireEmpty = Boolean(opts.requireEmpty);
  if (el instanceof HTMLInputElement && el.name === "website") return "";
  if (el.disabled || el.closest("[hidden]")) return "";

  const wrap = fieldWrapFor(el);
  const label = fieldLabelText(wrap);
  const value = el.value.trim();
  const required = el.required;

  if (!value) {
    if (requireEmpty && required) return `${label} is required.`;
    return "";
  }

  return formatErrorForFieldValue({
    key: el.name,
    type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
    label,
    value,
  });
}

/**
 * @param {HTMLElement} wrap
 * @param {{ requireEmpty?: boolean }} [opts]
 * @returns {string}
 */
function messageForChoiceField(wrap, opts = {}) {
  const requireEmpty = Boolean(opts.requireEmpty);
  const key = wrap.dataset.choiceField;
  if (!key) return "";

  const select = wrap.querySelector(`select[name="${CSS.escape(key)}"]`);
  if (select instanceof HTMLSelectElement) {
    return messageForControl(select, opts);
  }

  const boxes = [
    ...wrap.querySelectorAll(
      `input[type="checkbox"][name="${CSS.escape(key)}"]`,
    ),
  ];
  if (!boxes.length) return "";

  const isRequired = Boolean(wrap.querySelector(".contact-required"));
  const checked = boxes.filter(
    (box) => box instanceof HTMLInputElement && box.checked,
  );
  if (requireEmpty && isRequired && checked.length === 0) {
    return `${fieldLabelText(wrap)} is required.`;
  }
  return "";
}

/**
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} el
 * @param {{ requireEmpty?: boolean }} [opts]
 * @returns {boolean}
 */
function validateControl(el, opts = {}) {
  const wrap = fieldWrapFor(el);
  if (!wrap) return true;
  if (wrap.matches("[data-choice-field]") && el instanceof HTMLSelectElement) {
    const message = messageForChoiceField(wrap, opts);
    setFieldError(wrap, message);
    return !message;
  }
  const message = messageForControl(el, opts);
  setFieldError(wrap, message);
  return !message;
}

/**
 * @param {HTMLElement} wrap
 * @param {{ requireEmpty?: boolean }} [opts]
 * @returns {boolean}
 */
function validateChoiceField(wrap, opts = {}) {
  const message = messageForChoiceField(wrap, opts);
  setFieldError(wrap, message);
  const other = wrap.querySelector(".contact-other:not([hidden]) input");
  if (other instanceof HTMLInputElement) {
    const otherOk = validateControl(other, opts);
    return !message && otherOk;
  }
  return !message;
}

/**
 * @param {HTMLFormElement} form
 * @returns {boolean}
 */
function validateFormFields(form) {
  const opts = { requireEmpty: true };
  let ok = true;
  /** @type {HTMLElement | null} */
  let firstInvalid = null;

  form
    .querySelectorAll(".contact-field, [data-choice-field], .contact-other")
    .forEach((wrap) => {
      if (!(wrap instanceof HTMLElement)) return;
      if (wrap.matches(".contact-other") && wrap.hidden) {
        clearFieldError(wrap);
        return;
      }
      if (wrap.matches("[data-choice-field]")) {
        const valid = validateChoiceField(wrap, opts);
        if (!valid) {
          ok = false;
          if (!firstInvalid) {
            firstInvalid =
              wrap.querySelector(
                ".gw-select-trigger, select, input, textarea",
              ) || wrap;
          }
        }
        return;
      }
      if (wrap.matches(".contact-other")) {
        const input = wrap.querySelector("input, textarea");
        if (
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        ) {
          const valid = validateControl(input, opts);
          if (!valid) {
            ok = false;
            if (!firstInvalid) firstInvalid = input;
          }
        }
        return;
      }
      const control = wrap.querySelector(
        "input:not([type='checkbox']):not([type='radio']), textarea, select",
      );
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLTextAreaElement ||
        control instanceof HTMLSelectElement
      ) {
        const valid = validateControl(control, opts);
        if (!valid) {
          ok = false;
          if (!firstInvalid) {
            firstInvalid =
              wrap.querySelector(".gw-select-trigger") || control;
          }
        }
      }
    });

  if (firstInvalid instanceof HTMLElement) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return ok;
}

function initFieldValidation(form) {
  const formErrorEl = document.getElementById("contact-error");
  let submitAttempted = false;

  const softOpts = () => ({ requireEmpty: submitAttempted });

  const clearFormErrorIfClean = () => {
    if (!form.querySelector(".is-invalid")) setError(formErrorEl, "");
  };

  form.addEventListener("focusout", (event) => {
    const target = event.target;
    const next = event.relatedTarget;
    const opts = softOpts();

    if (target instanceof Element) {
      const choice = target.closest("[data-choice-field]");
      if (
        choice instanceof HTMLElement &&
        (!(next instanceof Node) || !choice.contains(next))
      ) {
        validateChoiceField(choice, opts);
        clearFormErrorIfClean();
        return;
      }
    }

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      if (target.type === "checkbox" || target.type === "radio") return;
      validateControl(target, opts);
      clearFormErrorIfClean();
      return;
    }

    if (
      target instanceof HTMLElement &&
      target.classList.contains("gw-select-trigger")
    ) {
      const select = target.closest(".gw-select")?.querySelector("select");
      if (select instanceof HTMLSelectElement) {
        validateControl(select, opts);
        clearFormErrorIfClean();
      }
    }
  });

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (
      !(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }
    if (target.type === "checkbox" || target.type === "radio") return;
    const wrap = fieldWrapFor(target);
    if (wrap?.classList.contains("is-invalid")) {
      validateControl(target, softOpts());
      clearFormErrorIfClean();
    }
  });

  form.addEventListener("change", (event) => {
    const target = event.target;
    const opts = softOpts();
    if (target instanceof HTMLSelectElement) {
      validateControl(target, opts);
      clearFormErrorIfClean();
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type === "checkbox" || target.type === "radio") {
      const choice = target.closest("[data-choice-field]");
      if (choice instanceof HTMLElement) {
        validateChoiceField(choice, opts);
        clearFormErrorIfClean();
      }
    }
  });

  form.addEventListener(
    "submit",
    () => {
      submitAttempted = true;
    },
    true,
  );
}

function initSectionNav() {
  const nav = document.getElementById("contact-nav");
  const form = document.getElementById("contact-form");
  if (!(nav instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;

  const links = [...nav.querySelectorAll(".contact-nav-link")];
  const sections = [...form.querySelectorAll(".contact-section")];
  const sectionSelect = nav.querySelector("#contact-section-select");
  if (
    (!links.length && !(sectionSelect instanceof HTMLSelectElement)) ||
    !sections.length
  ) {
    return;
  }

  const sentinel = nav.previousElementSibling;
  if (
    sentinel instanceof HTMLElement &&
    sentinel.classList.contains("contact-nav-sentinel")
  ) {
    const stuckObserver = new IntersectionObserver(
      ([entry]) => {
        nav.classList.toggle("is-stuck", Boolean(entry && !entry.isIntersecting));
      },
      { threshold: [1] },
    );
    stuckObserver.observe(sentinel);
  }

  let syncingFromScroll = false;

  const goToSection = (id) => {
    const section = id ? document.getElementById(id) : null;
    if (!(section instanceof HTMLElement)) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const setActive = (id) => {
    for (const link of links) {
      const active = link.getAttribute("data-section") === id;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }

    if (
      sectionSelect instanceof HTMLSelectElement &&
      sectionSelect.value !== id
    ) {
      syncingFromScroll = true;
      sectionSelect.value = id;
      sectionSelect.dispatchEvent(new Event("change", { bubbles: true }));
      syncingFromScroll = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const top = visible[0]?.target;
      if (top instanceof HTMLElement && top.dataset.section) {
        setActive(top.dataset.section);
      }
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0.1, 0.35, 0.6],
    },
  );

  for (const section of sections) observer.observe(section);
  if (sections[0] instanceof HTMLElement && sections[0].dataset.section) {
    setActive(sections[0].dataset.section);
  }

  nav.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a.contact-nav-link");
    if (!(link instanceof HTMLAnchorElement)) return;
    const id = link.getAttribute("data-section");
    if (!id) return;
    event.preventDefault();
    setActive(id);
    goToSection(id);
  });

  if (sectionSelect instanceof HTMLSelectElement) {
    sectionSelect.addEventListener("change", () => {
      if (syncingFromScroll) return;
      const id = sectionSelect.value;
      if (!id) return;
      setActive(id);
      goToSection(id);
    });
  }
}

/** @type {HTMLElement | null} */
let brandedOpenRoot = null;
let brandedSelectDocBound = false;

function closeBrandedOpen() {
  if (!brandedOpenRoot) return;
  brandedOpenRoot.classList.remove("is-open", "is-drop-up");
  const trigger = brandedOpenRoot.querySelector(".gw-select-trigger");
  const menu = brandedOpenRoot.querySelector(".gw-select-menu");
  if (trigger instanceof HTMLElement) {
    trigger.setAttribute("aria-expanded", "false");
  }
  if (menu instanceof HTMLElement) menu.hidden = true;
  brandedOpenRoot = null;
}

function initBrandedSelects(root) {
  if (!(root instanceof Element)) return;
  const selects = [...root.querySelectorAll(".gw-field > select")];
  if (!selects.length) return;

  const closeOpen = closeBrandedOpen;

  for (const select of selects) {
    if (!(select instanceof HTMLSelectElement)) continue;
    if (select.closest(".gw-select")) continue;

    const options = [...select.options].filter((opt) => !opt.disabled || opt.value);
    const placeholder =
      [...select.options].find((opt) => opt.disabled && !opt.value)?.textContent?.trim() ||
      "Select…";

    const root = document.createElement("div");
    root.className = "gw-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "gw-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.id = `${select.id || select.name}-trigger`;

    const valueEl = document.createElement("span");
    valueEl.className = "gw-select-value";

    const chevron = document.createElement("span");
    chevron.className = "gw-select-chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.append(valueEl, chevron);

    const menu = document.createElement("ul");
    menu.className = "gw-select-menu";
    menu.setAttribute("role", "listbox");
    menu.id = `${select.id || select.name}-listbox`;
    menu.hidden = true;
    trigger.setAttribute("aria-controls", menu.id);

    const syncTrigger = () => {
      const selected = select.selectedOptions[0];
      const empty = !selected || !selected.value;
      valueEl.textContent = empty
        ? placeholder
        : selected?.textContent?.trim() || placeholder;
      trigger.classList.toggle("is-placeholder", empty);
      for (const item of menu.querySelectorAll("[role='option']")) {
        if (!(item instanceof HTMLElement)) continue;
        const active = item.dataset.value === select.value;
        item.classList.toggle("is-selected", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      }
    };

    for (const opt of options) {
      if (opt.disabled && !opt.value) continue;
      const item = document.createElement("li");
      item.className = "gw-select-option";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent?.trim() || opt.value;
      item.tabIndex = -1;
      item.addEventListener("click", () => {
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        syncTrigger();
        closeOpen();
        trigger.focus();
      });
      menu.append(item);
    }

    select.classList.add("visually-hidden");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    const parent = select.parentElement;
    if (!parent) continue;
    if (select.id) {
      const label = parent.querySelector(`label[for="${CSS.escape(select.id)}"]`);
      if (label) label.setAttribute("for", trigger.id);
    }
    parent.insertBefore(root, select);
    root.append(trigger, menu, select);

    const openMenu = () => {
      closeOpen();
      root.classList.remove("is-drop-up");
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.hidden = false;
      brandedOpenRoot = root;

      const triggerRect = trigger.getBoundingClientRect();
      const menuHeight = Math.min(menu.scrollHeight, 16 * 16);
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      if (spaceBelow < menuHeight + 24 && spaceAbove > spaceBelow) {
        root.classList.add("is-drop-up");
      }

      const selected =
        menu.querySelector(".gw-select-option.is-selected") ||
        menu.querySelector(".gw-select-option");
      if (selected instanceof HTMLElement) selected.focus();

      requestAnimationFrame(() => {
        menu.dispatchEvent(new Event("scroll"));
      });
    };

    trigger.addEventListener("click", () => {
      if (root.classList.contains("is-open")) closeOpen();
      else openMenu();
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
    });

    menu.addEventListener("keydown", (event) => {
      const items = [...menu.querySelectorAll(".gw-select-option")].filter(
        (el) => el instanceof HTMLElement,
      );
      const index = items.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        closeOpen();
        trigger.focus();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[Math.min(items.length - 1, index + 1)]?.focus();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        items[Math.max(0, index - 1)]?.focus();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.click();
        }
      }
    });

    syncTrigger();
    select.addEventListener("change", syncTrigger);
  }

  if (!brandedSelectDocBound) {
    brandedSelectDocBound = true;
    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Node)) return;
      if (brandedOpenRoot && !brandedOpenRoot.contains(event.target)) {
        closeBrandedOpen();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeBrandedOpen();
    });
  }
}

/** @type {AbortController | null} */
let playParallaxAbort = null;

function initPlayParallax() {
  playParallaxAbort?.abort();
  playParallaxAbort = new AbortController();

  const stage = document.querySelector("[data-play-parallax]");
  if (!(stage instanceof HTMLElement)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;
  const desktop = window.matchMedia("(min-width: 900px)");

  const update = () => {
    const maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    // Ease so travel stays readable across the whole form.
    const eased = 1 - (1 - progress) ** 1.25;

    // Sticky panel: enough drift to feel the plate shift in frame.
    // Mobile banner: stronger lag as it leaves the viewport.
    const maxShift = desktop.matches
      ? Math.min(window.innerHeight * 0.12, 110)
      : Math.min(window.innerHeight * 0.14, 90);
    const shift = eased * maxShift;
    const scale = 1 + eased * (desktop.matches ? 0.06 : 0.05);
    stage.style.transform = `translate3d(0, ${shift}px, 0) scale(${scale})`;
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, {
    passive: true,
    signal: playParallaxAbort.signal,
  });
  window.addEventListener("resize", onScroll, {
    passive: true,
    signal: playParallaxAbort.signal,
  });
  desktop.addEventListener?.("change", onScroll, {
    signal: playParallaxAbort.signal,
  });

  update();
}

/** On /contact/play, put the cursor in the name field on land. */
function focusPlayNameField(form, slug) {
  if (slug !== "play") return;
  const nameInput = form.querySelector('input[name="name"]');
  if (!(nameInput instanceof HTMLInputElement)) return;

  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    active !== document.documentElement &&
    form.contains(active)
  ) {
    return;
  }

  requestAnimationFrame(() => {
    nameInput.focus({ preventScroll: true });
  });
}

export function initContactForm() {
  const form = document.getElementById("contact-form");
  initPlayParallax();
  if (!(form instanceof HTMLFormElement)) return;

  const submitBtn = document.getElementById("contact-submit");
  const errorEl = document.getElementById("contact-error");
  const panel = document.getElementById("contact-panel");
  const nav = document.getElementById("contact-nav");
  const slug = form.dataset.formSlug;
  const defaultSubmitLabel =
    submitBtn instanceof HTMLButtonElement
      ? submitBtn.textContent?.trim() || "Send"
      : "Send";

  // View Transitions can restore a mid-submit DOM. Reset chrome when active.
  form.hidden = false;
  form.classList.remove("is-loading");
  form.removeAttribute("aria-busy");
  if (submitBtn instanceof HTMLButtonElement) {
    submitBtn.disabled = false;
    submitBtn.textContent = defaultSubmitLabel;
  }
  if (nav) nav.hidden = false;
  if (panel) {
    const header = panel.querySelector(".contact-header");
    if (header instanceof HTMLElement) header.hidden = false;
  }

  function restoreSavedAnswers() {
    if (!slug) return;
    const existing = readFormSession(slug);
    if (!existing) return;

    // Keep answers keyed by slug; drop pending/result so we are editing again.
    if (existing.pending || existing.result) {
      persistFormSession(slug, {
        answers: existing.answers,
        pending: null,
        result: null,
      });
    }

    if (existing.answers && typeof existing.answers === "object") {
      applyAnswersToForm(form, existing.answers);
      syncOtherFields(form);
      form.querySelectorAll("select").forEach((select) => {
        if (select instanceof HTMLSelectElement) {
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    }
  }

  if (form.dataset.gwBound === "1") {
    restoreSavedAnswers();
    return;
  }
  form.dataset.gwBound = "1";

  initSectionNav();
  initOtherFields(form);
  initBrandedSelects(panel instanceof Element ? panel : form);
  initFieldValidation(form);
  restoreSavedAnswers();
  focusPlayNameField(form, slug);

  ensureFormAuth().catch(() => {
    /* auth loads again on submit */
  });

  function setSubmitting(loading) {
    form.classList.toggle("is-loading", loading);
    if (loading) form.setAttribute("aria-busy", "true");
    else form.removeAttribute("aria-busy");
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? "Sending…" : defaultSubmitLabel;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setError(errorEl, "");

    if (!slug) {
      setError(errorEl, "Something went wrong. Try again?");
      return;
    }

    if (!validateFormFields(form)) {
      setError(errorEl, "Please fix the highlighted fields.");
      return;
    }

    setSubmitting(true);
    const answers = collectAnswers(form);

    try {
      await ensureFormAuth();
      if (!formAuth) throw new Error("Something went wrong. Try again?");

      const res = await fetch("/api/forms", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": formAuth.csrfToken,
          "X-Subscribe-Secret": formAuth.secret,
        },
        body: JSON.stringify({
          slug,
          answers,
          website: form.website?.value ?? "",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong. Try again?");
      }

      if (data.alreadyVerified) {
        persistFormSession(slug, {
          answers,
          pending: null,
          result: {
            kind: "done",
            title:
              data.successTitle ||
              form.dataset.successTitle ||
              "You're confirmed",
            message:
              data.successMessage ||
              form.dataset.successMessage ||
              "We've already got this from you.",
          },
        });
        await navigateToSubmitted(slug);
        return;
      }

      if (data.pendingVerification) {
        const pending = {
          rowId: String(data.rowId || ""),
          resendToken: String(data.resendToken || ""),
          email: String(data.email || ""),
        };
        const title =
          data.verifyPendingTitle ||
          form.dataset.verifyPendingTitle ||
          "Check your email";
        const message =
          data.verifyPendingMessage ||
          form.dataset.verifyPendingMessage ||
          "We sent a link to {email}. Open it to finish (valid for 48 hours).";
        persistFormSession(slug, {
          answers,
          pending,
          result: {
            kind: "pending",
            title,
            message,
            email: pending.email,
          },
        });
      } else {
        persistFormSession(slug, {
          answers,
          pending: null,
          result: {
            kind: "done",
            title:
              data.successTitle ||
              form.dataset.successTitle ||
              "Got it",
            message:
              data.successMessage ||
              form.dataset.successMessage ||
              "",
          },
        });
      }

      await navigateToSubmitted(slug);
    } catch (error) {
      setSubmitting(false);
      setError(
        errorEl,
        error instanceof Error ? error.message : "Something went wrong. Try again?",
      );
      formAuth = null;
    }
  });
}

function applyAnswersToForm(formEl, answers) {
  for (const [name, value] of Object.entries(answers)) {
    if (Array.isArray(value)) {
      formEl
        .querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`)
        .forEach((input) => {
          if (input instanceof HTMLInputElement) {
            input.checked = value.includes(input.value);
          }
        });
      continue;
    }
    const el = formEl.querySelector(`[name="${CSS.escape(name)}"]`);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      if (el instanceof HTMLInputElement && el.type === "checkbox") continue;
      el.value = String(value ?? "");
    }
  }
}

/** Status page after submit: check-email / done, plus resend. */
export function initContactFormSubmitted() {
  const root = document.getElementById("contact-success");
  if (!(root instanceof HTMLElement)) return;
  if (root.dataset.gwBound === "1") return;
  root.dataset.gwBound = "1";

  const slug = root.dataset.formSlug;
  const successTitleEl = document.getElementById("contact-success-title");
  const successMessageEl = document.getElementById("contact-success-message");
  const verifyActionsEl = document.getElementById("contact-verify-actions");
  const wrongEmailBtn = document.getElementById("contact-wrong-email");
  const resendWrap = document.getElementById("contact-resend");
  const resendEmailInput = document.getElementById("contact-resend-email");
  const resendSubmitBtn = document.getElementById("contact-resend-submit");
  const resendErrorEl = document.getElementById("contact-resend-error");
  const homeEl = document.getElementById("contact-success-home");
  const retryEl = document.getElementById("contact-success-retry");
  const actionsEl = document.getElementById("contact-success-actions");

  /** @type {{ rowId: string, resendToken: string, email: string } | null} */
  let pendingSession = null;

  function fillCopy(title, message, email) {
    if (successTitleEl) {
      successTitleEl.textContent = title || "Got it";
    }
    if (successMessageEl) {
      const template = message || "";
      successMessageEl.textContent = template.replace(
        /\{email\}/g,
        email || "your inbox",
      );
    }
  }

  function showActions({ home = false, retry = false } = {}) {
    if (actionsEl) actionsEl.hidden = !(home || retry);
    if (homeEl) homeEl.hidden = !home;
    if (retryEl) retryEl.hidden = !retry;
  }

  function showPending(title, message, email) {
    fillCopy(title, message, email);
    if (verifyActionsEl) verifyActionsEl.hidden = false;
    showActions({ home: true, retry: true });
    if (resendEmailInput instanceof HTMLInputElement && email) {
      resendEmailInput.value = email;
    }
  }

  function showDone(title, message) {
    fillCopy(title, message, "");
    if (verifyActionsEl) verifyActionsEl.hidden = true;
    if (resendWrap) resendWrap.hidden = true;
    showActions({ home: true, retry: true });
  }

  function showMissing() {
    fillCopy(
      "Nothing to show yet",
      "Submit the form again to continue.",
      "",
    );
    if (verifyActionsEl) verifyActionsEl.hidden = true;
    if (resendWrap) resendWrap.hidden = true;
    showActions({ home: false, retry: true });
  }

  const wantsPreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  const session = slug ? readFormSession(slug) : null;
  if (
    session?.pending?.rowId &&
    session?.pending?.resendToken &&
    session?.pending?.email
  ) {
    pendingSession = session.pending;
    const title =
      session.result?.title ||
      root.dataset.verifyPendingTitle ||
      "Check your email";
    const message =
      session.result?.message ||
      root.dataset.verifyPendingMessage ||
      "We sent a link to {email}. Open it to finish (valid for 48 hours).";
    showPending(title, message, pendingSession.email);
  } else if (session?.result?.kind === "done") {
    showDone(
      session.result.title || root.dataset.successTitle || "Got it",
      session.result.message || root.dataset.successMessage || "",
    );
  } else if (session?.result?.kind === "pending") {
    showPending(
      session.result.title || root.dataset.verifyPendingTitle || "Check your email",
      session.result.message ||
        root.dataset.verifyPendingMessage ||
        "We sent a link to {email}. Open it to finish (valid for 48 hours).",
      session.result.email || "",
    );
  } else if (wantsPreview) {
    showDone(
      root.dataset.successTitle || "Got it",
      root.dataset.successMessage ||
        "Thanks for writing. We'll read this and be in touch if there's a fit.",
    );
  } else {
    showMissing();
  }

  ensureFormAuth().catch(() => {
    /* auth loads again on resend */
  });

  retryEl?.addEventListener("click", () => {
    if (!slug) return;
    const existing = readFormSession(slug);
    // Keep answers for the slug; clear submit status so the form is editable.
    persistFormSession(slug, {
      answers: existing?.answers,
      pending: null,
      result: null,
    });
  });

  wrongEmailBtn?.addEventListener("click", () => {
    if (resendWrap) resendWrap.hidden = false;
    if (resendEmailInput instanceof HTMLInputElement) {
      resendEmailInput.focus();
    }
  });

  resendSubmitBtn?.addEventListener("click", async () => {
    setError(resendErrorEl, "");
    if (!pendingSession || !slug) {
      setError(resendErrorEl, "Submit the form again.");
      return;
    }
    const email =
      resendEmailInput instanceof HTMLInputElement
        ? resendEmailInput.value.trim()
        : "";
    if (!email) {
      setError(resendErrorEl, "Enter a valid email.");
      return;
    }

    if (resendSubmitBtn instanceof HTMLButtonElement) {
      resendSubmitBtn.disabled = true;
    }

    try {
      await ensureFormAuth();
      if (!formAuth) throw new Error("Something went wrong. Try again?");

      const res = await fetch("/api/forms/resend", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": formAuth.csrfToken,
          "X-Subscribe-Secret": formAuth.secret,
        },
        body: JSON.stringify({
          slug,
          rowId: pendingSession.rowId,
          resendToken: pendingSession.resendToken,
          email,
          website: "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong. Try again?");
      }
      if (data.alreadyVerified) {
        const title = root.dataset.successTitle || "Got it";
        const message = root.dataset.successMessage || "";
        persistFormSession(slug, {
          answers: session?.answers,
          pending: null,
          result: { kind: "done", title, message },
        });
        showDone(title, message);
        return;
      }
      pendingSession = { ...pendingSession, email: data.email || email };
      const title =
        data.verifyPendingTitle ||
        root.dataset.verifyPendingTitle ||
        "Check your email";
      const message =
        data.verifyPendingMessage ||
        root.dataset.verifyPendingMessage ||
        "We sent a link to {email}. Open it to finish (valid for 48 hours).";
      persistFormSession(slug, {
        answers: session?.answers,
        pending: pendingSession,
        result: {
          kind: "pending",
          title,
          message,
          email: pendingSession.email,
        },
      });
      showPending(title, message, pendingSession.email);
      if (resendWrap) resendWrap.hidden = true;
    } catch (error) {
      setError(
        resendErrorEl,
        error instanceof Error ? error.message : "Something went wrong. Try again?",
      );
      formAuth = null;
    } finally {
      if (resendSubmitBtn instanceof HTMLButtonElement) {
        resendSubmitBtn.disabled = false;
      }
    }
  });
}
