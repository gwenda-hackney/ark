const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function getTimeLeft(openingTimestamp) {
  const diff = openingTimestamp - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0 };
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
  };
}

function formatUnit(unit, value) {
  if (unit === "days") return String(value);
  return String(value).padStart(2, "0");
}

export function rollText(el, next, animate = true) {
  const current = el.dataset.value ?? el.textContent.trim();

  if (current === next) return;

  if (!animate || prefersReducedMotion) {
    el.textContent = next;
    el.dataset.value = next;
    return;
  }

  el.innerHTML = `
    <span class="roll-out">${current}</span>
    <span class="roll-in">${next}</span>
  `;
  el.classList.remove("is-rolling-active");
  el.classList.add("is-rolling");

  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("is-rolling-active"));
  });

  const finish = () => {
    el.textContent = next;
    el.dataset.value = next;
    el.classList.remove("is-rolling", "is-rolling-active");
  };

  el.addEventListener("transitionend", finish, { once: true });
  window.setTimeout(finish, 700);
}

function rollValue(el, unit, value, animate) {
  rollText(el, formatUnit(unit, value), animate);
}

export function initCountdown(container, openingTimestamp) {
  const units = ["days", "hours", "minutes"];
  const elements = Object.fromEntries(
    units.map((unit) => [
      unit,
      container.querySelector(`[data-unit="${unit}"] .countdown-value`),
    ]),
  );

  if (units.some((unit) => !elements[unit])) return null;

  let last = getTimeLeft(openingTimestamp);

  units.forEach((unit, index) => {
    const el = elements[unit];
    const unitEl = el.closest(".countdown-unit");
    const target = last[unit];
    unitEl?.style.setProperty("--enter-delay", `${index * 120}ms`);

    el.textContent = formatUnit(unit, 0);
    el.dataset.value = formatUnit(unit, 0);

    window.setTimeout(
      () => {
        unitEl?.classList.add("is-visible");
        rollValue(el, unit, target, !prefersReducedMotion);
      },
      400 + index * 180,
    );
  });

  return window.setInterval(() => {
    const values = getTimeLeft(openingTimestamp);
    units.forEach((unit) => {
      if (last[unit] !== values[unit]) {
        rollValue(elements[unit], unit, values[unit], true);
      }
    });
    last = values;
  }, 1000);
}
