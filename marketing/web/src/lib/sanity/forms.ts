import { createSanityClient } from "./client";
import { FORM_BY_SLUG_QUERY, FORM_SLUGS_QUERY } from "./queries";
import { withSeriesChoices } from "../../../../../shared/forms/series-choice.js";

export type FormFieldOption = {
  label: string;
  value: string | null;
};

export type FormFieldType =
  "text" | "email" | "tel" | "url" | "textarea" | "select" | "multiSelect";

export type FormField = {
  key: string;
  label: string;
  section: string | null;
  type: FormFieldType;
  placeholder: string | null;
  helpText: string | null;
  required: boolean | null;
  options: FormFieldOption[] | null;
};

export type FormSection = {
  id: string;
  title: string;
  fields: FormField[];
};

export type FormPage = {
  title: string;
  slug: string;
  eyebrow: string | null;
  heading: string;
  intro: string | null;
  seoDescription: string | null;
  notifyEmail: string;
  fromEmail: string | null;
  replyToEmail: string | null;
  requireEmailVerification: boolean | null;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  verifyPendingTitle: string | null;
  verifyPendingMessage: string | null;
  fields: FormField[];
};

function sectionId(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "details"
  );
}

/** Group fields by Sanity `section` label, preserving order. */
export function groupFormSections(fields: FormField[]): FormSection[] {
  const sections: FormSection[] = [];
  const byTitle = new Map<string, FormSection>();

  for (const field of fields) {
    const title = field.section?.trim() || "Details";
    let section = byTitle.get(title);
    if (!section) {
      section = { id: `section-${sectionId(title)}`, title, fields: [] };
      byTitle.set(title, section);
      sections.push(section);
    }
    section.fields.push(field);
  }

  return sections;
}

export async function fetchFormSlugs(): Promise<string[]> {
  const client = createSanityClient();
  const rows = await client.fetch<Array<{ slug: string }>>(FORM_SLUGS_QUERY);
  return (rows ?? []).map((row) => row.slug).filter(Boolean);
}

export async function fetchFormBySlug(slug: string): Promise<FormPage | null> {
  const client = createSanityClient();
  const doc = withSeriesChoices(
    await client.fetch<FormPage | null>(FORM_BY_SLUG_QUERY, { slug }),
  ) as FormPage | null;
  if (!doc?.slug || !doc.heading || !Array.isArray(doc.fields)) return null;
  return {
    ...doc,
    fields: doc.fields.filter(
      (field) => field?.key && field?.label && field?.type,
    ),
  };
}
