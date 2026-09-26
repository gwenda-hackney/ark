/**
 * The share button is replaced on every Astro view transition. A module
 * script only runs once, so the click listener has to live on `document`.
 */

let installed = false;
let resetTimer = 0;

function labelEl() {
  return document.querySelector("#preview-share [data-preview-share-label]");
}

/** The environment name the ribbon shows ("Dev", "Preview"), set by PreviewRibbon. */
function defaultLabel() {
  return (
    document.getElementById("preview-share")?.dataset.envLabel || "Preview"
  );
}

function setLabel(text) {
  const label = labelEl();
  if (label) label.textContent = text;
}

async function copyShareLink() {
  const path = `${window.location.pathname}${window.location.search}`;
  const pending = fetch(`/api/preview-share?path=${encodeURIComponent(path)}`, {
    credentials: "same-origin",
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      throw new Error(data.error || "Could not build a share link.");
    }
    return data.url;
  });

  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": pending.then(
          (url) => new Blob([url], { type: "text/plain" }),
        ),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(await pending);
  }

  setLabel("Copied");
  window.clearTimeout(resetTimer);
  resetTimer = window.setTimeout(() => setLabel(defaultLabel()), 1600);
}

export function initPreviewShare() {
  if (installed) return;
  installed = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    const button =
      target instanceof Element ? target.closest("#preview-share") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    copyShareLink().catch(() => {
      setLabel("Failed");
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => setLabel(defaultLabel()), 2000);
    });
  });
}
