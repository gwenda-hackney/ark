/**
 * Put a Cloudflare Pages project back on the deployment that was live before
 * a deploy (#18). Pages switches production as soon as an upload succeeds, so
 * a smoke test that fails afterwards would otherwise leave the broken site up.
 * The live deployment is the project's canonical_deployment. Each deployment
 * keeps its own secrets, so a rollback restores the old secrets too.
 *
 * It steps back one deployment only; pages-cleanup.mjs keeps more than that
 * (ROLLBACK_KEEP in scripts/lib/pages-cleanup.mjs).
 */
import { cf, getProject } from "./pages-api.mjs";

/** The id of the deployment the project's production address serves now. */
export async function liveDeploymentId(api, project) {
  const result = await getProject(api, project);
  return result.canonical_deployment?.id || "";
}

/**
 * Roll `project` back to `previousId`. Does nothing when the live deployment
 * is already `previousId` (the deploy never went live). Returns what happened:
 * "rolled-back", "already-live" or "nothing-to-roll-back-to".
 */
export async function rollBack(api, project, previousId) {
  if (!previousId) return "nothing-to-roll-back-to";
  if ((await liveDeploymentId(api, project)) === previousId) return "already-live";
  await cf(api, `${project}/deployments/${previousId}/rollback`, "POST");
  return "rolled-back";
}
