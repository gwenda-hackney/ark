/**
 * FormSubmissionRepository on Baserow (Website → Form Submissions; columns
 * from scripts/setup-baserow-form-submissions.mjs). The only code that knows
 * those columns. Answers is long text holding JSON.
 */
import {
  baserowFetch,
  createRow,
  deleteRow,
  getRow,
  listAllRows,
  updateRow,
} from "../../baserow.js";
import {
  EMPTY_FORM_SUBMISSION,
  formSubmissionFields,
  newestFirst,
} from "../form-submissions.js";
import {
  FORM_SUBMISSIONS_TABLE,
  moment,
  selectValue,
  text,
  websiteTableId,
} from "./baserow-website.js";

const COLUMNS = {
  formSlug: "Form Slug",
  formTitle: "Form Title",
  submittedAt: "Submitted",
  replyTo: "Reply To",
  status: "Status",
  current: "Current",
  answers: "Answers",
  notifySentAt: "Notify Sent",
  receiptSentAt: "Receipt Sent",
  editLink: "Edit Link",
};

function parseAnswers(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function formSubmissionFromRow(row) {
  return {
    id: Number(row.id),
    formSlug: text(row[COLUMNS.formSlug]).trim(),
    formTitle: text(row[COLUMNS.formTitle]),
    submittedAt: moment(row[COLUMNS.submittedAt]),
    replyTo: text(row[COLUMNS.replyTo]).trim().toLowerCase(),
    status: selectValue(row[COLUMNS.status]),
    current: row[COLUMNS.current] === true,
    answers: parseAnswers(row[COLUMNS.answers]),
    notifySentAt: moment(row[COLUMNS.notifySentAt]),
    receiptSentAt: moment(row[COLUMNS.receiptSentAt]),
    editLink: text(row[COLUMNS.editLink]),
  };
}

function rowFields(fields, { editLink }) {
  const row = {};
  for (const [key, value] of Object.entries(formSubmissionFields(fields))) {
    if (key === "editLink" && !editLink) continue;
    if (key === "answers")
      row[COLUMNS.answers] = value == null ? "" : JSON.stringify(value);
    else if (key === "status") row[COLUMNS.status] = value || null;
    else row[COLUMNS[key]] = value;
  }
  return row;
}

/** @param {Record<string, any>} env  the Website token as BASEROW_API_KEY */
export function baserowFormSubmissionRepository(env) {
  const tableId = () => websiteTableId(env, FORM_SUBMISSIONS_TABLE);
  // The Edit Link column came by a deploy migration; until it's there, saves skip it.
  let editLinkColumn = null;
  const hasEditLink = async () =>
    (editLinkColumn ??= baserowFetch(
      env,
      `/api/database/fields/table/${await tableId()}/`,
    ).then(
      (fields) =>
        Array.isArray(fields) &&
        fields.some((field) => field?.name === COLUMNS.editLink),
    ));
  const write = async (fields) =>
    rowFields(fields, {
      editLink: "editLink" in fields ? await hasEditLink() : false,
    });

  return {
    async get(id) {
      try {
        return formSubmissionFromRow(await getRow(env, await tableId(), id));
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    async listForEmail(formSlug, email) {
      // Reply To is matched here, not by Baserow: older rows aren't all lower case.
      const params = new URLSearchParams({
        user_field_names: "true",
        [`filter__${COLUMNS.formSlug}__equal`]: String(formSlug),
        order_by: `-${COLUMNS.submittedAt}`,
        size: "100",
      });
      const body = await baserowFetch(
        env,
        `/api/database/rows/table/${await tableId()}/?${params}`,
      );
      const want = String(email).trim().toLowerCase();
      return (Array.isArray(body?.results) ? body.results : [])
        .map(formSubmissionFromRow)
        .filter((record) => record.replyTo === want);
    },
    async listCurrent() {
      return (await listAllRows(env, await tableId()))
        .map(formSubmissionFromRow)
        .filter((record) => record.current)
        .sort(newestFirst);
    },
    async create(fields) {
      return formSubmissionFromRow(
        await createRow(
          env,
          await tableId(),
          await write({ ...EMPTY_FORM_SUBMISSION, ...fields }),
        ),
      );
    },
    async update(id, fields) {
      try {
        return formSubmissionFromRow(
          await updateRow(env, await tableId(), id, await write(fields)),
        );
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    async remove(id) {
      try {
        await deleteRow(env, await tableId(), id);
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    },
    async count() {
      const body = await baserowFetch(
        env,
        `/api/database/rows/table/${await tableId()}/?size=1`,
      );
      return Number(body?.count ?? 0);
    },
    async capabilities() {
      return { editLink: await hasEditLink() };
    },
    async exportAll() {
      const all = await listAllRows(env, await tableId());
      return {
        formSubmissions: all
          .map(formSubmissionFromRow)
          .sort((a, b) => a.id - b.id),
      };
    },
  };
}
