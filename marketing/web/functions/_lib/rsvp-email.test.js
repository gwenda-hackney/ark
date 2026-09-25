import { describe, expect, it } from "vitest";
import {
  buildConfirmationContent,
  confirmationHtml,
  formatEventWhen,
  formatRsvpContent,
  greetingLine,
  guestLine,
  mergeRsvpConfirmation,
} from "./rsvp-email-template.js";
import { LOGO_CID } from "../../../../shared/email-image.js";
import { buildCalendarTicket, ticketAttachmentBaseName } from "./rsvp-tickets.js";
import { SITE_ADDRESS, VENUE_MAPS_URL } from "../../../../shared/site-location.js";

describe("greetingLine", () => {
  it("uses the guest name when present", () => {
    expect(greetingLine("Dan")).toBe("Hi Dan,");
  });

  it("falls back when the name is missing", () => {
    expect(greetingLine("")).toBe("Hello,");
  });
});

describe("guestLine", () => {
  it("matches RSVP pill labels", () => {
    expect(guestLine(1)).toBe("We've got you down.");
    expect(guestLine(2)).toBe("We've got you down for 2.");
    expect(guestLine(3)).toBe("We've got you down for 3.");
    expect(guestLine(6)).toBe("We've got you down for 5+.");
  });
});

describe("formatEventWhen", () => {
  it("includes the date and ticket times", () => {
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toContain("15 August 2026");
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toMatch(/5–11pm/);
  });
});

describe("mergeRsvpConfirmation", () => {
  it("maps legacy heading-only copy to eyebrow + title", () => {
    const copy = mergeRsvpConfirmation({
      rsvpConfirmation: {
        heading: "You're on the list",
        body: "Hello",
      },
    });
    expect(copy.eyebrow).toBe("You're on the list");
    expect(copy.heading).toBe("See you there");
  });
});

describe("buildConfirmationContent", () => {
  it("uses Sanity copy when present", () => {
    const content = buildConfirmationContent({
      name: "Dan",
      guests: 1,
      origin: "https://gwenda.co.uk",
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?event-password=ember-harbor-lantern",
      event: {
        title: "Launch Party",
        date: "2026-08-15",
        ticketStart: "17:00",
        ticketEnd: "23:00",
        rsvpConfirmation: {
          subject: "See you soon · {title}",
          eyebrow: "Gwenda",
          heading: "All set",
          body: "{greeting} {guests_line}",
        },
      },
    });

    expect(content.subject).toBe("See you soon · Launch Party");
    expect(content.eyebrow).toBe("Gwenda");
    expect(content.eventTitle).toBe("Launch Party");
    expect(content.eventBlockHtml).toContain("Launch Party");
    expect(content.bodyText).toContain("Hi Dan,");
    expect(content.logoCid).toBe(LOGO_CID);
    expect(content.mapsUrl).toBe(VENUE_MAPS_URL);
  });

  it("does not repeat the ticket URL in the default body copy", () => {
    const content = buildConfirmationContent({
      name: "Dan",
      guests: 2,
      origin: "https://gwenda.co.uk",
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?event-password=ember-harbor-lantern",
      ticketUrl: "https://gwenda.co.uk/events/private-launch-party/ticket?guest=42&t=abc123",
      event: { title: "Launch Party", date: "2026-08-15" },
    });

    expect(content.bodyText).not.toContain("ticket?guest=42");
    expect(content.bodyText).not.toContain("attached");
    expect(content.bodyText).toContain("Apple Wallet");
    expect(content.bodyText).toContain("We've got you down for 2.");
    expect(content.bodyHtml).not.toContain(SITE_ADDRESS);
  });
});

describe("confirmationHtml", () => {
  it("renders on-brand layout with ticket and modify links", () => {
    const html = confirmationHtml({
      eyebrow: "You're on the list",
      heading: "See you there",
      bodyHtml: "<p>Hi Dan.</p>",
      eventBlockHtml: "<div>Launch Party</div>",
      logoUrl: "https://gwenda.co.uk/brand/logo-email.png",
      logoCid: LOGO_CID,
      ticketUrl: "https://gwenda.co.uk/events/private-launch-party/ticket?guest=42&t=abc123",
      modifyUrl: "https://gwenda.co.uk/events/private-launch-party?event-password=ember-harbor-lantern",
    });
    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).toContain("Open your ticket");
    expect(html).toContain("Change your reply");
    expect(html).not.toContain("Get directions");
    expect(html).toContain("Instagram");
    expect(html).toContain(SITE_ADDRESS);
    expect(html).toContain(VENUE_MAPS_URL);
    expect(html).toContain("#c9a84c");
  });
});

describe("ticketAttachmentBaseName", () => {
  it("drops a private- prefix from the event slug", () => {
    expect(ticketAttachmentBaseName("private-launch-party")).toBe("launch-party");
  });
});

describe("buildCalendarTicket", () => {
  it("builds a valid ICS event with start and end times", () => {
    const ics = buildCalendarTicket({
      ticketId: "private-launch-party-42",
      title: "Launch Party",
      date: "2026-08-15",
      startTime: "17:00",
      endTime: "23:00",
      venue: "Schwartz Wharf, Hackney Wick",
      guestName: "Dan",
      guests: 2,
      description: "Free signature cocktail from 5 to 7pm.",
      url: "https://gwenda.co.uk/events/private-launch-party?event-password=ember-harbor-lantern",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:Gwenda Launch Party");
  });
});
