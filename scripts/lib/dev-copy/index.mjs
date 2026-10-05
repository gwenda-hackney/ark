/**
 * Copy production over dev: website content and the backend databases.
 * Production is only read. Targets are what the workflow and ops offer:
 *
 *   everything     content, then every database
 *   content        website content only (Sanity)
 *   ops-data       the ops database only
 *   website-data   the website database only
 */
import { copySanityContent } from "./content.mjs";
import { databaseProvider } from "./database.mjs";

export const COPY_TARGETS = ["everything", "content", "ops-data", "website-data"];

/**
 * The steps one target runs, in order.
 * @returns {{ id: string, label: string, run: (opts: { dryRun: boolean }) => void | Promise<void> }[]}
 */
export function copySteps(target, { provider = databaseProvider(), copyContent = copySanityContent } = {}) {
  if (!COPY_TARGETS.includes(target)) {
    throw new Error(`Unknown target "${target}". Use one of: ${COPY_TARGETS.join(", ")}.`);
  }
  const content = {
    id: "content",
    label: "Website content (Sanity)",
    run: ({ dryRun }) => copyContent({ dryRun }),
  };
  const data = (database) => ({
    id: `${database}-data`,
    label: `${database[0].toUpperCase()}${database.slice(1)} database (${provider.label})`,
    run: ({ dryRun }) => provider.copy(database, { dryRun }),
  });
  if (target === "content") return [content];
  if (target === "everything") return [content, ...provider.databases.map(data)];
  const database = target.replace(/-data$/, "");
  if (!provider.databases.includes(database)) {
    throw new Error(`${provider.label} has no ${database} database.`);
  }
  return [data(database)];
}

/**
 * Run every step, even after one fails: each copies something separate, and a
 * failed content copy shouldn't leave the databases stale too.
 * @returns {Promise<{ id: string, label: string, ok: boolean, error?: string }[]>}
 */
export async function runCopySteps(steps, { dryRun = false } = {}) {
  const results = [];
  for (const step of steps) {
    console.log(`\n=== ${step.label} ===`);
    try {
      await step.run({ dryRun });
      results.push({ id: step.id, label: step.label, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      results.push({ id: step.id, label: step.label, ok: false, error: message });
    }
  }
  return results;
}

/** Markdown for the GitHub job summary. */
export function copySummary(target, results, { dryRun = false } = {}) {
  const lines = [
    `### Copy production to dev: ${target}${dryRun ? " (dry run)" : ""}`,
    "",
    "Production was read, not changed.",
    "",
    ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.label}${r.ok ? "" : `: ${r.error}`}`),
  ];
  return `${lines.join("\n")}\n`;
}
