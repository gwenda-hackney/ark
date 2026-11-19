/**
 * A form opened from a season on home (#353): `?season=Christmas parties`
 * fills the hidden season answer, which goes with the enquiry, and says what
 * it's about over the form. An answer saved earlier in the session keeps its
 * season when the address has none.
 * @param {HTMLFormElement} form
 */
export function initSeasonField(form, search = window.location.search) {
  const field = form.querySelector("[data-season-field]");
  if (!(field instanceof HTMLInputElement)) return;
  const fromAddress = (new URLSearchParams(search).get("season") || "")
    .trim()
    .slice(0, 80);
  if (fromAddress) field.value = fromAddress;
  const note = form.querySelector("[data-season-note]");
  const name = form.querySelector("[data-season-name]");
  if (note instanceof HTMLElement && name) {
    name.textContent = field.value;
    note.hidden = !field.value;
  }
}
