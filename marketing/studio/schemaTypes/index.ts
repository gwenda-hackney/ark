import { event } from "./event";
import { eventSeries } from "./eventSeries";
import { eventDescription } from "./eventDescription";
import { form } from "./form";
import { formField } from "./formField";
import { menu } from "./menu";
import { menuItem } from "./menuItem";
import { menuSection } from "./menuSection";
import { siteSettings } from "./siteSettings";
import { occasions } from "./occasions";
import { venueDetails } from "./venueDetails";

export const schemaTypes = [
  siteSettings,
  venueDetails,
  occasions,
  menu,
  menuSection,
  menuItem,
  eventDescription,
  eventSeries,
  event,
  form,
  formField,
];
