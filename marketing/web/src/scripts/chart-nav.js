/**
 * The chart opens from its button; the same button (a cross while open), the
 * scrim, Escape, or any link in it closes it. State lives on the page root (`data-chart`), so CSS
 * moves the panel and the scrim together.
 */
export function initChartNav() {
  const page = document.querySelector(".ch-page");
  const button = document.getElementById("ch-chart-btn");
  const panel = document.getElementById("ch-chart");
  const scrim = document.getElementById("ch-chart-scrim");
  if (!page || !button || !panel || !scrim) return;
  if (button.dataset.chartReady) return;
  button.dataset.chartReady = "1";

  const setOpen = (open) => {
    page.dataset.chart = open ? "open" : "closed";
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute(
      "aria-label",
      open ? "Close the menu" : "Open the menu",
    );
  };

  button.addEventListener("click", () =>
    setOpen(page.dataset.chart !== "open"),
  );
  scrim.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      page.dataset.chart = "closed";
      button.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && page.dataset.chart === "open") setOpen(false);
  });
}
