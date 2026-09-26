/** Parse repo-root .env values, including multiline quoted strings. */
export function parseDotEnv(content) {
  const entries = [];
  const lines = content.split("\n");
  let index = 0;

  while (index < lines.length) {
    let line = lines[index];
    const trimmed = line.trim();
    index += 1;

    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (value.startsWith('"')) {
      value = value.slice(1);
      while (!value.endsWith('"') && index < lines.length) {
        value += `\n${lines[index]}`;
        index += 1;
      }
      if (value.endsWith('"')) {
        value = value.slice(0, -1);
      }
      value = value.replaceAll('\\"', '"');
    } else if (value.startsWith("'")) {
      value = value.slice(1);
      while (!value.endsWith("'") && index < lines.length) {
        value += `\n${lines[index]}`;
        index += 1;
      }
      if (value.endsWith("'")) {
        value = value.slice(0, -1);
      }
    }

    entries.push([key, value]);
  }

  return entries;
}

/** Prefer a complete PEM from loadEnv when with-env only captured the first line. */
export function pickPemValue(processValue, loadedValue) {
  const fromProcess = String(processValue ?? "").trim();
  const fromLoaded = String(loadedValue ?? "").trim();
  const isComplete =
    fromProcess.includes("END CERTIFICATE") ||
    fromProcess.includes("END PRIVATE KEY");
  if (isComplete) return fromProcess;
  return fromLoaded || fromProcess;
}
