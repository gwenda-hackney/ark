import { event } from "./event";
import { eventDescription } from "./eventDescription";
import { form } from "./form";
import { formField } from "./formField";
import { menuItem } from "./menuItem";
import { menuSection } from "./menuSection";
import { siteSettings } from "./siteSettings";

export const schemaTypes = [
  siteSettings,
  menuSection,
  menuItem,
  eventDescription,
  event,
  form,
  formField,
];
