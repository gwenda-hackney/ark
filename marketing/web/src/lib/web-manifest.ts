/**
 * The web app manifest (#240): the name and icons a phone shows when the site
 * is added to its home screen. Served at siteConfig.brand.manifestPath by
 * src/pages/site.webmanifest.ts; the icons are drawn by generate:favicons.
 */
import { siteConfig } from "../config/site";
import { colors } from "../config/colors";

export function webManifest() {
  const { brand } = siteConfig;
  const icon = ({ path, size }: { path: string; size: number }) => ({
    src: path,
    sizes: `${size}x${size}`,
    type: "image/png",
  });
  const largest = brand.appIcons.reduce((a, b) => (b.size > a.size ? b : a));
  return {
    name: `${siteConfig.name} ${siteConfig.publicLabel}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    // A website, not an app: a home-screen icon opens it in the browser
    display: "browser",
    background_color: colors.bg,
    theme_color: colors.bg,
    icons: [
      ...brand.appIcons.map((each) => ({ ...icon(each), purpose: "any" })),
      // The board fills the square and the record sits inside the circle,
      // so Android may crop it to its own shape
      { ...icon(largest), purpose: "maskable" },
    ],
  };
}
