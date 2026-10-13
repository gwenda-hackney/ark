/**
 * Menu chapter subtitles in the casual voice (#240): what's in the chapter,
 * said plainly, instead of "the definitive liquid experience". Matched by
 * the old wording, so a subtitle someone has since edited in Studio is left
 * alone. Changes the published section and any draft of it. Safe to rerun.
 */
export const app = "web";
export const phase = "pre";
export const about = "Menu: chapter subtitles in plain words";

const SUBTITLES = [
  [
    "The definitive liquid experience. Elegant expressions crafted for candlelit evenings.",
    "Our own cocktails. Made here, and they change now and then.",
  ],
  [
    "The mindful liquid experience. Zero-proof expressions crafted with the same complexity.",
    "No booze. Still worth ordering.",
  ],
  [
    "The traditional liquid ritual. Timeless serves, made as you know them.",
    "The classics. Spritz, Negroni, sours, highballs and beer, done properly.",
  ],
  [
    "The liquid cabinet. Agave, rum, whiskey, and digestivi for the quieter close.",
    "Something neat. Agave, rum, whiskey and amari to end the night.",
  ],
];

export async function up({ sanity, log, dryRun }) {
  const content = sanity();
  const project = content.project;
  const sections = await content.query(
    `*[_type == "menuSection" && subtitle in $old]{ _id, title, subtitle }`,
    { old: SUBTITLES.map(([old]) => old) },
  );
  if (!sections?.length) return log(`${project}: menu subtitles already plain`);

  const plain = new Map(SUBTITLES);
  if (dryRun) {
    return log(
      `${project}: would update ${sections.map((s) => s.title).join(", ")}`,
    );
  }
  await content.mutate(
    sections.map((section) => ({
      patch: {
        id: section._id,
        set: { subtitle: plain.get(section.subtitle) },
      },
    })),
  );
  log(
    `${project}: plain subtitles on ${sections.map((s) => s.title).join(", ")}`,
  );
}
