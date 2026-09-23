import { event } from "./event";
import { eventSeries } from "./eventSeries";
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
  eventSeries,
  event,
  form,
  formField,
];
