/** A small What's on catalog for the weekly email's tests: the week of Mon 9 Nov 2026. */

const FLYER = "https://cdn.sanity.io/images/testproj/production/abc123-1132x1600.jpg#whole";
const PHOTO = "https://cdn.sanity.io/images/testproj/production/def456-1600x1200.jpg?fp-x=0.250&fp-y=0.500";

export function night(date, seriesId, title, extra = {}) {
  return {
    id: `${seriesId}-${date}`,
    title,
    seriesId,
    seriesTitle: title,
    category: "event",
    date,
    startTime: "19:00",
    endTime: "22:00",
    time: "",
    offer: "",
    shortDescription: "",
    artist: "",
    ...extra,
  };
}

export function testCatalog() {
  const series = [
    { seriesId: "chess", title: "Negroni Society", category: "event", schedule: "repeating", recurrence: "Every Tuesday" },
    { seriesId: "karaoke", title: "Karaoke with Ross", category: "event", schedule: "repeating", recurrence: "Every Thursday" },
    { seriesId: "jam", title: "EPIC Jam", category: "event", schedule: "manual", recurrence: "" },
    {
      seriesId: "cocktail-hour",
      title: "Cocktail Hour",
      category: "promotion",
      schedule: "repeating",
      recurrence: "Every Wednesday and Thursday and Friday and Saturday",
      shortDescription: "20% off all cocktails",
      heroImageUrl: FLYER,
    },
    { seriesId: "chez-pickle", title: "Chez Pickle", category: "popup", schedule: "once", recurrence: "" },
  ];
  const deal = (date) =>
    night(date, "cocktail-hour", "Cocktail Hour", {
      category: "promotion",
      startTime: "17:00",
      endTime: "18:30",
      offer: "20% OFF",
    });
  const occurrences = [
    night("2026-11-03", "chess", "Negroni Society"),
    night("2026-11-10", "chess", "Negroni Society", { offer: "£8 Negroni" }),
    deal("2026-11-11"),
    night("2026-11-12", "karaoke", "Karaoke with Ross", {
      seriesHeroImageUrl: FLYER,
      shortDescription: "Bring a song",
      offer: "£6 beer",
    }),
    deal("2026-11-12"),
    night("2026-11-12", "chez-pickle", "Chez Pickle", { category: "popup", startTime: "17:00" }),
    deal("2026-11-13"),
    // One event over a weekend: two nights, different hours each day
    night("2026-11-14", "jam", "EPIC Jam", { startTime: "12:00", endTime: "20:00", heroImage: { url: PHOTO } }),
    deal("2026-11-14"),
    night("2026-11-15", "jam", "EPIC Jam", { startTime: "13:00", endTime: "18:00" }),
    night("2026-11-17", "chess", "Negroni Society"),
    deal("2026-11-18"),
    night("2026-11-19", "karaoke", "Karaoke with Ross"),
    night("2026-11-24", "chess", "Negroni Society"),
  ];
  return { series, occurrences };
}
