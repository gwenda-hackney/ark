/**
 * CalVer build label: YYYY.MM.DD+shortsha (UTC date from build time).
 * Used in CI and post-build header injection.
 */
const time = process.env.PUBLIC_BUILD_TIME || new Date().toISOString();
const sha = (process.env.PUBLIC_BUILD_SHA || "").slice(0, 7);
const date = new Date(time);

const year = date.getUTCFullYear();
const month = String(date.getUTCMonth() + 1).padStart(2, "0");
const day = String(date.getUTCDate()).padStart(2, "0");
const cal = `${year}.${month}.${day}`;

const version = sha ? `${cal}+${sha}` : cal;

if (process.argv.includes("--export")) {
  process.stdout.write(version);
} else {
  console.log(version);
}
