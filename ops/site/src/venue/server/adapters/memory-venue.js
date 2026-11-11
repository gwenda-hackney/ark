/**
 * VenueRepository in memory (#240): for tests, and the reference for what
 * every adapter must do (venue-repository.contract.test.js).
 */
import { DAYS, openingDay } from "../../hours-model.js";

export function memoryVenueRepository({ openingHours = null } = {}) {
  /** @type {{ id: number, day: string, closed: boolean, opens: string, closes: string, updatedAt: string, updatedBy: string }[]} */
  let hours = [];

  function putHours(week) {
    const byDay = new Map(hours.map((row) => [row.day, row]));
    for (const raw of week.days || []) {
      const day = openingDay(raw);
      byDay.set(day.day, {
        id: DAYS.indexOf(day.day) + 1,
        ...day,
        updatedAt: week.updatedAt || "",
        updatedBy: week.updatedBy || "",
      });
    }
    hours = [...byDay.values()].sort((a, b) => a.id - b.id);
  }

  async function getOpeningHours() {
    if (hours.length !== DAYS.length) return null;
    return {
      days: hours.map((row) => openingDay(row)),
      updatedAt: hours[0].updatedAt,
      updatedBy: hours[0].updatedBy,
    };
  }

  if (openingHours) putHours(openingHours);

  return {
    getOpeningHours,
    async saveOpeningHours(week) {
      putHours(week);
      return getOpeningHours();
    },
    async exportAll() {
      return { openingHours: hours.map((row) => ({ ...row })) };
    },
    async importAll(snapshot) {
      hours = (snapshot.openingHours || []).map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
    },
  };
}
