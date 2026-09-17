import { sanityQuery } from "./sanity-query.js";
import {
  EMAIL_RE,
  formatErrorForFieldValue,
} from "./form-field-rules.js";

const FORM_SUBMIT_QUERY = `*[_type == "form" && enabled == true && slug.current == $slug][0] {
  title,
  "slug": slug.current,
  notifyEmail,
  fromEmail,
  replyToEmail,
  requireEmailVerification,
  successTitle,
  successMessage,
  verifyPendingTitle,
  verifyPendingMessage,
  fields[] {
    key,
    label,
    section,
    type,
    placeholder,
    helpText,
    required,
    options[] { label, value }
  }
}`;

export async function fetchFormForSubmit(env, slug) {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return sanityQuery(env, FORM_SUBMIT_QUERY, { $slug: normalized });
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
      const display = selected.map((item) =>
        resolveChoiceValue(item, otherDetail),
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

export function formatFormEmail({ form, answers, submittedAt }) {
  const lines = [
    `New submission: ${form.title}`,
    `Form: /forms/${form.slug}`,
    `Received: ${submittedAt}`,
    "",
    ...answers
      .filter((row) => row.value)
      .map((row) => `${row.label}\n${row.value}`),
  ];
  return lines.join("\n\n");
}

export function replyToFromAnswers(answers) {
  const emailRow = answers.find((row) => row.key === "email" && row.value);
  if (emailRow && EMAIL_RE.test(emailRow.value)) {
    return String(emailRow.value).trim().toLowerCase();
  }
  return undefined;
}
