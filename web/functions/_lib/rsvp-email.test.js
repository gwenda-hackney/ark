import { describe, expect, it } from "vitest";
import {
  buildConfirmationContent,
  confirmationHtml,
  formatRsvpContent,
  guestLine,
} from "./rsvp-email-template.js";
import { buildCalendarTicket } from "./rsvp-tickets.js";

describe("formatRsvpContent", () => {
  it("replaces RSVP placeholders", () => {
    const text = formatRsvpContent("Hi {name}. {guests_line} {title} on {date} at {venue}.", {
      name: "Dan",
      guests: 2,
      guestsLine: guestLine(2),
      title: "Private launch party",
      date: "Saturday 15 August 2026",
      venue: "Schwartz Wharf",
    });
    expect(text).toContain("Hi Dan.");
    expect(text).toContain("We've got 2 of you down.");
    expect(text).toContain("Private launch party");
    expect(text).toContain("Schwartz Wharf");
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
        title: "Private launch party",
        date: "2026-08-15",
        venue: "Schwartz Wharf, Hackney Wick",
        rsvpConfirmation: {
          subject: "See you soon · {title}",
          heading: "All set",
          body: "Hi {name}. {guests_line}",
        },
      },
    });

    expect(content.subject).toBe("See you soon · Private launch party");
    expect(content.heading).toBe("All set");
    expect(content.bodyText).toContain("Hi Dan.");
    expect(content.logoUrl).toBe("https://gwenda.co.uk/brand/logo-organization.png");
  });
});

describe("confirmationHtml", () => {
  it("includes the logo and invite button", () => {
    const html = confirmationHtml({
      heading: "You're on the list",
      bodyHtml: "<p>Hi Dan.</p>",
      logoUrl: "https://gwenda.co.uk/brand/logo-organization.png",
      inviteUrl: "https://gwenda.co.uk/events/private-launch-party?key=abc",
      googleWalletUrl: null,
    });
    expect(html).toContain("logo-organization.png");
    expect(html).toContain("View your invitation");
    expect(html).toContain("You're on the list");
  });
});

describe("buildCalendarTicket", () => {
  it("builds a valid ICS event with start and end times", () => {
    const ics = buildCalendarTicket({
      ticketId: "private-launch-party-42",
      title: "Private launch party",
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
    expect(ics).toContain("SUMMARY:Private launch party");
    expect(ics).toContain("DTSTART:");
    expect(ics).toContain("DTEND:");
    expect(ics).toContain("LOCATION:Schwartz Wharf\\, Hackney Wick");
    expect(ics).toContain("private-launch-party-42@gwenda.co.uk");
  });
});
