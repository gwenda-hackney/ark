/**
 * The website saves each receipt's edit link on the row, so ops can resend a
 * receipt without the website's signing secret or address.
 */
export const app = "web";
export const phase = "pre";
export const about = "Form Submissions: Edit Link column";

export async function up({ database, log }) {
  const website = await database("website");
  const result = await website.ensureField("Form Submissions", { name: "Edit Link", type: "url" });
  log(`${website.label}: Edit Link ${result}`);
}
