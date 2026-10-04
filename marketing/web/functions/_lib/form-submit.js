import { sanityQuery } from "./sanity-query.js";
import { formatErrorForFieldValue } from "../../../../shared/forms/field-rules.js";
import { FORM_QUERY } from "../../../../shared/forms/format.js";
import { withSeriesChoices } from "../../../../shared/forms/series-choice.js";

export async function fetchFormForSubmit(env, slug) {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return withSeriesChoices(
    await sanityQuery(env, FORM_QUERY, { $slug: normalized }),
  );
}

function optionValue(option) {
  const value = option?.value?.trim();
  if (value) return value;
  return String(option?.label ?? "").trim();
}

function allowedValues(field) {
  return new Set((field.options ?? []).map(optionValue).filter(Boolean));
}

function isOtherChoice(value) {
  return /^other$/i.test(String(value ?? "").trim());
}

function otherDetailFor(answers, key) {
  return asString(answers?.[`${key}Other`]);
}

function resolveChoiceValue(value, otherDetail) {
  if (!isOtherChoice(value)) return value;
  return otherDetail || "Other";
}

function asString(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

/**
 * Validate answers against the Sanity field list.
 * @returns {{ ok: true, answers: Array<{ key: string, label: string, value: string }> } | { ok: false, error: string }}
 */
export function validateFormAnswers(form, answers) {
  if (!form?.fields?.length) {
    return { ok: false, error: "This form isn't available." };
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "Invalid request." };
  }

  const normalized = [];

  for (const field of form.fields) {
    const key = field.key;
    if (!key) continue;

    const raw = answers[key];
    const required = Boolean(field.required);
    const otherDetail = otherDetailFor(answers, key);
    const hasOtherOption = (field.options ?? []).some((option) =>
      isOtherChoice(optionValue(option)),
    );

    if (field.type === "multiSelect") {
      const selected = asStringArray(raw);
      if (required && selected.length === 0) {
        return { ok: false, error: `Please complete: ${field.label}.` };
      }
      const allowed = allowedValues(field);
      if (selected.some((item) => !allowed.has(item))) {
        return { ok: false, error: `Invalid choice for ${field.label}.` };
      }
      if (hasOtherOption && selected.some(isOtherChoice) && !otherDetail) {
        return {
          ok: false,
          error: `Please specify for ${field.label}.`,
        };
      }
      // Series choices (#41) read as the series names; the ids stay in raw.
      const labels = field.labelAsAnswer
        ? new Map(
            (field.options ?? []).map((option) => [
              optionValue(option),
              option.name || option.label,
            ]),
          )
        : null;
      const display = selected.map((item) =>
        labels
          ? labels.get(item) || item
          : resolveChoiceValue(item, otherDetail),
      );
      normalized.push({
        key,
        label: field.label,
        value: display.join(", "),
      });
      continue;
    }

    const value = asString(raw);
    if (required && !value) {
      return { ok: false, error: `Please complete: ${field.label}.` };
    }
    if (!value) {
      normalized.push({ key, label: field.label, value: "" });
      continue;
    }

    const formatError = formatErrorForFieldValue({
      key,
      type: field.type,
      label: field.label,
      value,
    });
    if (formatError) {
      return { ok: false, error: formatError };
    }

    if (field.type === "select") {
      const allowed = allowedValues(field);
      if (!allowed.has(value)) {
        return { ok: false, error: `Invalid choice for ${field.label}.` };
      }
      if (hasOtherOption && isOtherChoice(value) && !otherDetail) {
        return {
          ok: false,
          error: `Please specify for ${field.label}.`,
        };
      }
      normalized.push({
        key,
        label: field.label,
        value: resolveChoiceValue(value, otherDetail),
      });
      continue;
    }

    normalized.push({ key, label: field.label, value });
  }

  return { ok: true, answers: normalized };
}

/**
 * Diff previous vs next answers for ops "what changed" email.
 * Multi-select fields compare option sets (reorder-only is not a change).
 * @returns {Array<{
 *   key: string,
 *   label: string,
 *   from: string,
 *   to: string,
 *   kind: "text" | "multi",
 *   removed?: string[],
 *   added?: string[],
 * }>}
 */
export function diffFormAnswers(previous, next, form) {
  const fieldByKey = new Map(
    (form?.fields ?? []).map((field) => [field.key, field]),
  );
  const labelByKey = new Map(
    (form?.fields ?? []).map((field) => [field.key, field.label || field.key]),
  );
  for (const row of [...(previous ?? []), ...(next ?? [])]) {
    if (row?.key && !labelByKey.has(row.key)) {
      labelByKey.set(row.key, row.label || row.key);
    }
  }

  const prevMap = new Map(
    (previous ?? [])
      .filter((row) => row?.key)
      .map((row) => [row.key, String(row.value ?? "").trim()]),
  );
  const nextMap = new Map(
    (next ?? [])
      .filter((row) => row?.key)
      .map((row) => [row.key, String(row.value ?? "").trim()]),
  );

  const keys = [];
  const seen = new Set();
  for (const field of form?.fields ?? []) {
    if (!field?.key || seen.has(field.key)) continue;
    seen.add(field.key);
    keys.push(field.key);
  }
  for (const key of [...prevMap.keys(), ...nextMap.keys()]) {
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  /** @type {Array<{ key: string, label: string, from: string, to: string, kind: "text" | "multi", removed?: string[], added?: string[] }>} */
  const changes = [];
  for (const key of keys) {
    const from = prevMap.get(key) || "";
    const to = nextMap.get(key) || "";
    const field = fieldByKey.get(key);
    const isMulti = field?.type === "multiSelect";

    if (isMulti) {
      const fromParts = splitMultiValue(from);
      const toParts = splitMultiValue(to);
      const fromSet = new Set(fromParts);
      const toSet = new Set(toParts);
      if (setsEqual(fromSet, toSet)) continue;
      const removed = fromParts.filter((item) => !toSet.has(item));
      const added = toParts.filter((item) => !fromSet.has(item));
      changes.push({
        key,
        label: labelByKey.get(key) || key,
        from,
        to,
        kind: "multi",
        removed,
        added,
      });
      continue;
    }

    if (from === to) continue;
    changes.push({
      key,
      label: labelByKey.get(key) || key,
      from,
      to,
      kind: "text",
    });
  }
  return changes;
}

function splitMultiValue(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
