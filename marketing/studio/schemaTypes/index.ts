import { event } from "./event";
import { eventSeries } from "./eventSeries";
import { eventDescription } from "./eventDescription";
import { form } from "./form";
import { formField } from "./formField";
import { menu } from "./menu";
import { menuItem } from "./menuItem";
import { menuSection } from "./menuSection";
import { siteSettings } from "./siteSettings";
import { venueDetails } from "./venueDetails";

export const schemaTypes = [
  siteSettings,
  venueDetails,
  menu,
  menuSection,
  menuItem,
  eventDescription,
  eventSeries,
  event,
  form,
  formField,
];
