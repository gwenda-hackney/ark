/**
 * SubscriberRepository on Baserow (Website → Subscribers): Email, Tag
 * (multiple select), "Signed up" (date), Synced. The only code that knows
 * those columns.
 */
import {
  baserowFetch,
  createRow,
  deleteRow,
  listAllRows,
  updateRow,
} from "../../baserow.js";
import { duplicateSubscriberError, normalizeTags } from "../subscribers.js";
import {
  SUBSCRIBERS_TABLE,
  isConstraintError,
  moment,
  text,
  websiteTableId,
} from "./baserow-website.js";

export function subscriberFromRow(row) {
  return {
    id: Number(row.id),
    email: text(row.Email),
    tags: normalizeTags(row.Tag),
    signedUpOn: moment(row["Signed up"]),
    synced: Boolean(row.Synced),
  };
}

function rowFields(fields) {
  const row = {};
  if ("email" in fields) row.Email = fields.email;
  if ("tags" in fields) row.Tag = normalizeTags(fields.tags);
  if ("signedUpOn" in fields) row["Signed up"] = fields.signedUpOn || null;
  if ("synced" in fields) row.Synced = Boolean(fields.synced);
  return row;
}

/** @param {Record<string, any>} env  the Website token as BASEROW_API_KEY */
export function baserowSubscriberRepository(env) {
  const tableId = () => websiteTableId(env, SUBSCRIBERS_TABLE);
  const rows = async (query) => {
    const params = new URLSearchParams({ user_field_names: "true", ...query });
    const body = await baserowFetch(
      env,
      `/api/database/rows/table/${await tableId()}/?${params}`,
    );
    return Array.isArray(body?.results) ? body.results : [];
  };

  return {
    async listByEmail(email) {
      return (
        await rows({ filter__Email__equal: String(email), size: "200" })
      ).map(subscriberFromRow);
    },
    async listUnsynced({ limit = 100, all = false } = {}) {
      const query = { size: String(limit) };
      if (!all) query.filter__Synced__boolean = "false";
      return (await rows(query)).map(subscriberFromRow);
    },
    async create(fields) {
      try {
        return subscriberFromRow(
          await createRow(env, await tableId(), rowFields(fields)),
        );
      } catch (error) {
        if (isConstraintError(error)) throw duplicateSubscriberError(error);
        throw error;
      }
    },
    async update(id, fields) {
      try {
        return subscriberFromRow(
          await updateRow(env, await tableId(), id, rowFields(fields)),
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
      const params = new URLSearchParams({ size: "1" });
      const body = await baserowFetch(
        env,
        `/api/database/rows/table/${await tableId()}/?${params}`,
      );
      return Number(body?.count ?? 0);
    },
    async exportAll() {
      const all = await listAllRows(env, await tableId());
      return {
        subscribers: all.map(subscriberFromRow).sort((a, b) => a.id - b.id),
      };
    },
  };
}
