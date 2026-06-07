const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initSignup(form) {
  const message = document.getElementById("signup-message");
  const errorEl = document.getElementById("signup-error");
  const submitBtn = form.querySelector('button[type="submit"]');
  const defaultBtnText = submitBtn?.textContent ?? "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl?.setAttribute("hidden", "");

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

    setLoading(form, submitBtn, true, defaultBtnText);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          tag: form.querySelector('input[name="tag"]')?.value ?? "prelaunch",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong. Try again?");
      }

      form.classList.add("is-success");
      form.hidden = true;
      if (message) message.hidden = false;
    } catch (err) {
      showError(
        errorEl,
        err instanceof Error ? err.message : "Something went wrong. Try again?",
      );
      setLoading(form, submitBtn, false, defaultBtnText);
    }
  });
}

function showError(el, text) {
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
}

function setLoading(form, btn, loading, defaultText) {
  form.classList.toggle("is-loading", loading);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "One sec…" : defaultText;
}
