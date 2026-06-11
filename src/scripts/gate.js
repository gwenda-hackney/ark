export function initGate(nextPath) {
  const form = document.getElementById("gate-form");
  const input = document.getElementById("gate-password");
  const errorEl = document.getElementById("gate-error");
  if (!form || !input || !errorEl) return;

  const fromUrl = new URLSearchParams(window.location.search).get("next");
  const next = nextPath?.startsWith("/")
    ? nextPath
    : fromUrl?.startsWith("/")
      ? fromUrl
      : "/";

  const submit = document.getElementById("gate-submit");

  const handleSubmit = async (event) => {
    event?.preventDefault();
    errorEl.hidden = true;
    errorEl.textContent = "";

    const password = input.value;
    if (!password) return;

    submit?.setAttribute("disabled", "");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }

      errorEl.textContent = data.error ?? "Something went wrong. Try again?";
      errorEl.hidden = false;
      input.select();
    } catch {
      errorEl.textContent = "Something went wrong. Try again?";
      errorEl.hidden = false;
    } finally {
      submit?.removeAttribute("disabled");
    }
  };

  form.addEventListener("submit", handleSubmit);
  submit?.addEventListener("click", handleSubmit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleSubmit(event);
  });

  input.focus();
}
