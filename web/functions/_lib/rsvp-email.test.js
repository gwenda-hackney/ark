import { describe, expect, it } from "vitest";
import {
  buildConfirmationContent,
  confirmationHtml,
  formatEventWhen,
  formatRsvpContent,
  greetingLine,
  guestLine,
  LOGO_CID,
} from "./rsvp-email-template.js";
import { buildCalendarTicket, buildRsvpTicketAttachments, ticketAttachmentBaseName } from "./rsvp-tickets.js";
import { VENUE_MAPS_URL } from "./site-location.js";

describe("greetingLine", () => {
  it("uses the guest name when present", () => {
    expect(greetingLine("Dan")).toBe("Hi Dan,");
  });

  it("falls back when the name is missing", () => {
    expect(greetingLine("")).toBe("Hello,");
    expect(greetingLine("   ")).toBe("Hello,");
  });
});

describe("formatEventWhen", () => {
  it("includes the date and ticket times", () => {
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toContain("15 August 2026");
    expect(formatEventWhen("2026-08-15", "17:00", "23:00")).toMatch(/5pm/i);
  });
});

describe("formatRsvpContent", () => {
  it("replaces RSVP placeholders", () => {
    const text = formatRsvpContent(
      "When: {date}. {venue}",
      {
        name: "Dan",
        guests: 2,
        guestsLine: guestLine(2),
        title: "Launch Party",
        date: "Saturday 15 August 2026, 5pm–11pm",
        venue: "Schwartz Wharf",
        mapsUrl: VENUE_MAPS_URL,
      },
    );
    expect(text).toContain("When: Saturday 15 August 2026, 5pm–11pm.");
    expect(text).toContain("Schwartz Wharf");
    expect(text).not.toContain("google.com/maps");
  });

  it("adjusts legacy salutations when the name is missing", () => {
    const text = formatRsvpContent("Hi {name},\n\nThanks for replying.", {
      name: "",
      guests: 1,
    });
    expect(text).toBe("Hello,\n\nThanks for replying.");
  });
});

describe("buildConfirmationContent", () => {
  it("uses Sanity copy when present", () => {
    const content = buildConfirmationContent({
      name: "Dan",
      guests: 1,
      origin: "https://gwenda.co.uk",
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?key=abc",
      event: {
        title: "Launch Party",
        date: "2026-08-15",
        ticketStart: "17:00",
        ticketEnd: "23:00",
        venue: "Schwartz Wharf, Hackney Wick",
        rsvpConfirmation: {
          subject: "See you soon · {title}",
          heading: "All set",
          body: "{greeting} {guests_line}",
        },
      },
    });

    expect(content.subject).toBe("See you soon · Launch Party");
    expect(content.heading).toBe("All set");
    expect(content.bodyText).toContain("Hi Dan,");
    expect(content.logoUrl).toBe("https://gwenda.co.uk/brand/logo-email.png");
    expect(content.logoCid).toBe(LOGO_CID);
    expect(content.mapsUrl).toBe(VENUE_MAPS_URL);
  });
});

describe("confirmationHtml", () => {
  it("embeds the logo via CID and includes action links", () => {
    const html = confirmationHtml({
      heading: "You're on the list",
      bodyHtml: "<p>Hi Dan.</p>",
      logoUrl: "https://gwenda.co.uk/brand/logo-email.png",
      logoCid: LOGO_CID,
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?key=abc",
      mapsUrl: VENUE_MAPS_URL,
      googleWalletUrl: null,
    });
    expect(html).toContain(`cid:${LOGO_CID}`);
    expect(html).toContain("text-align:center");
    expect(html).not.toContain("logo-email.png");
    expect(html).toContain("View your invitation");
    expect(html).toContain("Get directions");
    expect(html).toContain("You're on the list");
  });
});

describe("ticketAttachmentBaseName", () => {
  it("drops a private- prefix from the event slug", () => {
    expect(ticketAttachmentBaseName("private-launch-party")).toBe("launch-party");
  });
});

describe("buildRsvpTicketAttachments", () => {
  it("names ticket files from the event slug", async () => {
    const result = await buildRsvpTicketAttachments({}, {
      eventSlug: "private-launch-party",
      title: "Launch Party",
      date: "2026-08-15",
      startTime: "17:00",
      endTime: "23:00",
      venue: "Schwartz Wharf",
      guestName: "Dan",
      guests: 1,
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?key=abc",
      origin: "https://gwenda.co.uk",
    });

    expect(result.attachments[0].filename).toBe("launch-party.ics");
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
      url: "https://gwenda.co.uk/events/private-launch-party?key=abc",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Launch Party");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("DTEND:");
    expect(ics).toContain("LOCATION:Schwartz Wharf\\, Hackney Wick");
    expect(ics).toContain("private-launch-party-42@gwenda.co.uk");
  });
});
