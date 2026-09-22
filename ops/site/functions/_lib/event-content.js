import { itemSlug } from "./item-key.js";

export function seriesSlug(name) {
  return itemSlug(name);
}

export function occurrenceSlug(series, date) {
  const base = seriesSlug(series) || "event";
  return `${base}-${date}`;
}

export function sanityEventId(slug) {
  return `event-${slug}`;
}

export function plainToEventDescription(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks = [];
  let paragraph = [];

  const inlineChildren = (value, blockIndex) => {
    const children = [];
    const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(value))) {
      if (match.index > cursor) {
        children.push({
          _type: "span",
          _key: `s${blockIndex}-${children.length}`,
          text: value.slice(cursor, match.index),
          marks: [],
        });
      }
      const strong = match[0].startsWith("**");
      children.push({
        _type: "span",
        _key: `s${blockIndex}-${children.length}`,
        text: match[0].slice(strong ? 2 : 1, strong ? -2 : -1),
        marks: [strong ? "strong" : "em"],
      });
      cursor = match.index + match[0].length;
    }
    if (cursor < value.length || !children.length) {
      children.push({
        _type: "span",
        _key: `s${blockIndex}-${children.length}`,
        text: value.slice(cursor),
        marks: [],
      });
    }
    return children;
  };

  const addBlock = (value, options = {}) => {
    const cleaned = String(value || "").trim();
    if (!cleaned) return;
    const index = blocks.length;
    blocks.push({
      _type: "block",
      _key: `p${index}`,
      style: options.style || "normal",
      ...(options.listItem ? { listItem: options.listItem, level: 1 } : {}),
      markDefs: [],
      children: inlineChildren(cleaned, index),
    });
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    addBlock(paragraph.join("\n"));
    paragraph = [];
  };

  for (const line of lines) {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+?)\s*$/);
    if (heading) {
      flushParagraph();
      addBlock(heading[2], { style: `h${heading[1].length}` });
    } else if (bullet || numbered) {
      flushParagraph();
      addBlock((bullet || numbered)[1], {
        listItem: bullet ? "bullet" : "number",
      });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}

function occurrenceRow(event, occurrence) {
  if (occurrence && typeof occurrence === "object") return occurrence;
  return (event?.dates || []).find((row) => row.date === occurrence) || null;
}

/**
 * A special guest night is one with its own DJ / guest artist.
 * A flyer image alone is not a special edition.
 */
export function occurrenceIsSpecialEdition(event, occurrence) {
  const overrides = occurrenceRow(event, occurrence)?.overrides || {};
  const artist = String(overrides.artist || "").trim();
  if (!artist) return false;
  return artist !== String(event?.artist || "").trim();
}

export function resolveOccurrenceContent(event, occurrence) {
  const row = occurrenceRow(event, occurrence);
  const overrides = row?.overrides || {};
  return {
    title: String(overrides.name || event?.name || "").trim(),
    artist: String(overrides.artist || event?.artist || "").trim(),
    offer: String(overrides.offer || event?.offer || "").trim(),
    description: String(
      overrides.description || event?.description || "",
    ).trim(),
    time: String(overrides.time || event?.time || "").trim(),
    startTime: String(overrides.startTime || event?.startTime || "").trim(),
    endTime: String(overrides.endTime || event?.endTime || "").trim(),
    operationsNotes: String(
      overrides.operationsNotes || event?.operationsNotes || "",
    ).trim(),
    imageLinks:
      overrides.imageLinks?.length > 0
        ? overrides.imageLinks
        : event?.imageLinks || [],
    image: overrides.image || event?.mainImage || null,
    isSpecialEdition: occurrenceIsSpecialEdition(event, row),
  };
}

export function occurrencePayload(event, occurrence) {
  const date = typeof occurrence === "object" ? occurrence?.date : occurrence;
  const content = resolveOccurrenceContent(event, occurrence);
  return {
    title: content.title,
    artist: content.artist,
    offer: content.offer,
    description: content.description,
    time: content.time,
    startTime: content.startTime,
    endTime: content.endTime,
    date,
    image: content.image?.url || "",
    isSpecialEdition: content.isSpecialEdition,
    seriesId: String(event?.slug || "").trim(),
    recurrenceLabel: recurrenceLabel(event),
  };
}

export function occurrenceHash(event, occurrence) {
  return JSON.stringify(occurrencePayload(event, occurrence));
}

const DAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export function recurrenceLabel(event) {
  const every = Math.max(1, Math.floor(Number(event?.repeatEvery) || 1));
  const unit = String(event?.repeatUnit || "none")
    .trim()
    .toLowerCase();
  if (unit === "day") return every === 1 ? "Every day" : `Every ${every} days`;
  if (unit === "week") {
    const days = (event?.weekdays || [])
      .map((day) => DAY_LABELS[String(day).slice(0, 3).toLowerCase()])
      .filter(Boolean);
    if (every === 1 && days.length) return `Every ${days.join(" and ")}`;
    const cadence = every === 1 ? "Every week" : `Every ${every} weeks`;
    return days.length ? `${cadence} on ${days.join(" and ")}` : cadence;
  }
  if (unit === "month") {
    const day = Math.floor(Number(event?.monthDay) || 0);
    const cadence = every === 1 ? "Every month" : `Every ${every} months`;
    return day ? `${cadence} on day ${day}` : cadence;
  }
  return "";
}

const RSVP_BODY = `{greeting}

Thanks for replying. {guests_line}

{event_block}

Open your ticket link below to view your pass, add it to Apple Wallet, or save the date to your calendar.

Need to change your reply? {modify_url}`;

export function sanityEventDocument({
  slug,
  title,
  date,
  description,
  artist,
  offer,
  heroImage,
  seriesId,
  recurrence,
  time,
  startTime,
  endTime,
  isSpecialEdition,
}) {
  const doc = {
    _id: sanityEventId(slug),
    _type: "event",
    title,
    slug: { _type: "slug", current: slug },
    eventType: "public",
    seriesId,
    recurrence,
    isSpecialEdition: Boolean(isSpecialEdition),
    date,
    time,
    offer,
    description: plainToEventDescription(description),
    venue: "Schwartz Wharf, Hackney Wick, London E9 5AA",
    ticketStart: startTime || "17:00",
    ticketEnd: endTime || "23:00",
    channels: [],
    rsvpConfirmation: {
      subject: "You're on the list · Gwenda",
      eyebrow: "You're on the list",
      heading: "See you there",
      body: RSVP_BODY,
    },
  };
  const artistText = String(artist || "").trim();
  if (artistText) doc.artist = artistText;
  if (heroImage) doc.heroImage = heroImage;
  return doc;
}
