/**
 * A form opened from an occasion on home (#353): `?occasion=Christmas parties`
 * fills the hidden occasion answer, which goes with the enquiry, and says what
 * it's about over the form. An answer saved earlier in the session keeps its
 * occasion when the address has none.
 * @param {HTMLFormElement} form
 */
export function initOccasionField(form, search = window.location.search) {
  const field = form.querySelector("[data-occasion-field]");
  if (!(field instanceof HTMLInputElement)) return;
  const fromAddress = (new URLSearchParams(search).get("occasion") || "")
    .trim()
    .slice(0, 80);
  if (fromAddress) field.value = fromAddress;
  const note = form.querySelector("[data-occasion-note]");
  const name = form.querySelector("[data-occasion-name]");
  if (note instanceof HTMLElement && name) {
    name.textContent = field.value;
    note.hidden = !field.value;
  }
}
