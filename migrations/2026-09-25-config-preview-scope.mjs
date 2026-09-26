/**
 * Each site's machine state (site.build_snapshot, site.auto_update) is stored
 * under the site's name in the config Env column. The preview site was called
 * "staging"; its rows are now "preview", so the column needs that choice
 * before any deploy writes one. Ops and the website both write these rows.
 * The old "staging" rows go with the old preview's settings after the deploy.
 */
export const app = "web";
export const phase = "pre";
export const about = 'Config: "preview" choice for the Env column';

export async function up({ database, log }) {
  const config = await database("config");
  log(`${config.label}: Env "preview" ${await config.ensureSelectOption("Config", "Env", "preview")}`);
}
