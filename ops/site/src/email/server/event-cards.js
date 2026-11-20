/**
 * What an Event card in a one-off email can show (#348): each night to come
 * as What's on has it, and each deal and pop-up kitchen with nights to come,
 * already in the card's words (the date, the hours or the days, a line, the
 * picture, the page). The editor puts the chosen one in the email as it is;
 * changing the event later doesn't change an email already written.
 */
import { listEvents } from "../../events/server/event-store.js";
import { londonToday } from "../../../../../shared/forms/field-rules.js";
import { timeLabel } from "../../venue/hours-model.js";
import { dateWords, popupWhen } from "./promote.js";

/** How far ahead nights are offered, and how many at most. */
export const CARD_WEEKS = 10;
export const CARD_NIGHTS = 40;

const text = (value) => String(value ?? "").trim();
const hours = (start, end) => (start && end ? `${timeLabel(start)} – ${timeLabel(end)}` : start ? `From ${timeLabel(start)}` : "");

function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The choices, soonest first: { id, group, label, detail, card }, `card` the
 * Event section as it goes in the email.
 * @param {{ site: { origin: string }, today?: string }} options
 */
export async function eventCardChoices(env, { site, today = londonToday() }) {
  const events = (await listEvents(env)).filter((event) => !event.deletedAt);
  const until = addDays(today, CARD_WEEKS * 7);
  const page = (event) => `${site.origin}/whats-on/${event.slug}/`;
  const nights = [];
  const standing = [];
  for (const event of events) {
    const ahead = (event.dates || []).filter((night) => night.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    if (!ahead.length) continue;
    const line = text(event.shortDescription);
    if (event.category === "popup" || event.category === "promotion") {
      const tag = event.category === "popup" ? "Pop-up kitchen" : "Deal";
      const when = popupWhen(event, today);
      standing.push({
        id: `series-${event.id}`,
        group: event.category === "popup" ? "Pop-up kitchens" : "Deals",
        label: event.name,
        detail: when,
        first: ahead[0].date,
        card: { kind: "event", eventId: String(event.id), date: "", tag, title: event.name, when, note: line, link: page(event), assetId: event.mainImage?.asset || "" },
      });
      continue;
    }
    for (const night of ahead.filter((one) => one.date <= until)) {
      const own = night.overrides || {};
      const title = text(own.name) || event.name;
      const when = hours(own.startTime || event.startTime, own.endTime || event.endTime);
      nights.push({
        id: `night-${event.id}-${night.date}`,
        group: "Nights",
        label: title,
        detail: [dateWords(night.date), when].filter(Boolean).join(", "),
        first: night.date,
        card: {
          kind: "event",
          eventId: String(event.id),
          date: night.date,
          tag: "",
          title,
          when,
          note: text(own.shortDescription) || line,
          link: page(event),
          assetId: own.image?.asset || event.mainImage?.asset || "",
        },
      });
    }
  }
  const soonest = (a, b) => a.first.localeCompare(b.first) || a.label.localeCompare(b.label);
  return {
    choices: [...nights.sort(soonest).slice(0, CARD_NIGHTS), ...standing.sort(soonest)].map(({ first: _first, ...choice }) => choice),
  };
}
