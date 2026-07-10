export function parseTaskId(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const tIndex = parts.indexOf("t");
    if (tIndex !== -1 && parts[tIndex + 1]) {
      // /t/{task_id} or /t/{workspace_id}/{task_id}
      return parts.at(-1) ?? parts[tIndex + 1];
    }
  } catch {
    // Not a URL; treat input as a raw task id.
  }

  return trimmed;
}
