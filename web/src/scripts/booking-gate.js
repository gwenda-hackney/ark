/** Reveal booking CTAs when PUBLIC_BOOKING_ENABLED_FROM is reached (client clock). */
export function initBookingGate() {
  const ctas = document.querySelectorAll("[data-booking-from]");
  if (!ctas.length) return;

  const fromMs = Number(ctas[0].dataset.bookingFrom);
  if (!Number.isFinite(fromMs)) return;

  function update() {
    const show = Date.now() >= fromMs;
    ctas.forEach((el) => {
      el.hidden = !show;
      if (show) {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("tabindex");
      } else {
        el.setAttribute("aria-hidden", "true");
        el.setAttribute("tabindex", "-1");
      }
    });
  }

  update();
  if (Date.now() < fromMs) {
    const delay = fromMs - Date.now();
    window.setTimeout(update, Math.min(delay, 2_147_483_647));
  }
}
