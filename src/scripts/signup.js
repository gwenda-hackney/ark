const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIGNUP_FOCUS_DELAY_MS = 650;
const SIGNUP_GLOW_MS = 2000;

/** @type {{ csrfToken: string, secret: string } | null} */
let subscribeAuth = null;
/** @type {Promise<void> | null} */
let subscribeAuthPromise = null;

async function loadSubscribeAuth() {
  const res = await fetch("/api/subscribe", { credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Try again?");
  }

  if (!data.csrfToken || !data.secret) {
    throw new Error("Something went wrong. Try again?");
  }

  subscribeAuth = { csrfToken: data.csrfToken, secret: data.secret };
}

function ensureSubscribeAuth() {
  if (!subscribeAuthPromise) {
    subscribeAuthPromise = loadSubscribeAuth().finally(() => {
      subscribeAuthPromise = null;
    });
  }
  return subscribeAuthPromise;
}

function highlightSignupField() {
  const field = document.querySelector(".signup-field");
  if (!field) return;

  field.classList.remove("is-targeted");
  void field.offsetWidth;
  field.classList.add("is-targeted");

  window.setTimeout(() => {
    field.classList.remove("is-targeted");
  }, SIGNUP_GLOW_MS);
}

export function initSignupAnchors() {
  const email = document.getElementById("email");
  if (!email) return;

  const focusEmail = () => {
    const section = document.getElementById("list");
    if (section?.classList.contains("is-confirmed")) return;

    const form = email.closest(".signup-form");
    if (form?.hidden || form?.classList.contains("is-success")) return;

    highlightSignupField();

    window.setTimeout(() => {
      email.focus({ preventScroll: true });
    }, SIGNUP_FOCUS_DELAY_MS);
  };

  document.querySelectorAll('a[href="#list"]').forEach((link) => {
    link.addEventListener("click", focusEmail);
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#list") focusEmail();
  });

  if (location.hash === "#list") focusEmail();
}

export function initSignup(form) {
  const section = document.getElementById("list");
  const confirmEl = document.getElementById("signup-confirm");
  const errorEl = document.getElementById("signup-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const defaultBtnText = submitBtn?.textContent ?? "";

  ensureSubscribeAuth();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(errorEl);

    const emailInput = form.querySelector('input[name="email"]');
    const consentInput = form.querySelector('input[name="consent"]');
    const email = emailInput?.value.trim() ?? "";

    if (!EMAIL_RE.test(email)) {
      showError(errorEl, "That doesn't look like an email.");
      emailInput?.focus();
      return;
    }

    if (consentInput && !consentInput.checked) {
      showError(errorEl, "Need your OK to stay in touch.");
      consentInput.focus();
      return;
    }

    const website =
      form.querySelector('input[name="website"]')?.value.trim() ?? "";
    if (website) {
      setLoading(form, submitBtn, false, defaultBtnText);
      showConfirmation(section, confirmEl);
      return;
    }

    setLoading(form, submitBtn, true, defaultBtnText);

    try {
      await ensureSubscribeAuth();
      const submitted = await postSubscribe(form, email);

      if (submitted === "retry") {
        await ensureSubscribeAuth();
        const retryResult = await postSubscribe(form, email);
        if (retryResult === "retry") {
          throw new Error("Something went wrong. Try again?");
        }
      }

      setLoading(form, submitBtn, false, defaultBtnText);
      showConfirmation(section, confirmEl);
    } catch (err) {
      showError(
        errorEl,
        err instanceof Error ? err.message : "Something went wrong. Try again?",
      );
      setLoading(form, submitBtn, false, defaultBtnText);
    }
  });

  document
    .querySelector(".signup-confirm-back")
    ?.addEventListener("click", () => {
      resetSignup({
        section,
        confirmEl,
        form,
        errorEl,
        submitBtn,
        defaultBtnText,
      });
    });

  window.addEventListener("hashchange", () => {
    if (
      section?.classList.contains("is-confirmed") &&
      location.hash !== "#list"
    ) {
      resetSignup({
        section,
        confirmEl,
        form,
        errorEl,
        submitBtn,
        defaultBtnText,
      });
    }
  });
}

/** @returns {Promise<"ok" | "retry">} */
async function postSubscribe(form, email) {
  if (!subscribeAuth) {
    throw new Error("Something went wrong. Try again?");
  }

  const res = await fetch("/api/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": subscribeAuth.csrfToken,
      "X-Subscribe-Secret": subscribeAuth.secret,
    },
    body: JSON.stringify({
      email,
      tag: form.querySelector('input[name="tag"]')?.value ?? "prelaunch",
      website: form.querySelector('input[name="website"]')?.value ?? "",
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 403) {
    subscribeAuth = null;
    return "retry";
  }

  if (!res.ok) {
    throw new Error(data.error ?? "Something went wrong. Try again?");
  }

  return "ok";
}

function showConfirmation(section, confirmEl) {
  if (!section || !confirmEl) return;

  confirmEl.setAttribute("aria-hidden", "false");
  section.classList.add("is-confirmed");

  window.requestAnimationFrame(() => {
    section.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function resetSignup({
  section,
  confirmEl,
  form,
  errorEl,
  submitBtn,
  defaultBtnText,
}) {
  section?.classList.remove("is-confirmed");
  confirmEl?.setAttribute("aria-hidden", "true");
  form?.reset();
  clearError(errorEl);
  setLoading(form, submitBtn, false, defaultBtnText);
}

function showError(el, text) {
  if (!el) return;
  el.textContent = text;
}

function clearError(el) {
  if (!el) return;
  el.textContent = "";
}

function setLoading(form, btn, loading, defaultText) {
  form.classList.toggle("is-loading", loading);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "One sec…" : defaultText;
}
