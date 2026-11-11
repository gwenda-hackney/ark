/**
 * VenueRepository in memory (#240): for tests, and the reference for what
 * every adapter must do (venue-repository.contract.test.js).
 */
import { DAYS, openingDay } from "../../hours-model.js";
import { partyFacts } from "../../parties-model.js";

export function memoryVenueRepository({ openingHours = null, parties = null } = {}) {
  /** @type {{ id: number, day: string, closed: boolean, opens: string, closes: string, updatedAt: string, updatedBy: string }[]} */
  let hours = [];
  /**
   * The party facts are one row (id 1); none until first saved.
   * @type {{ id: number, standing: number | null, seated: number | null, included: string, replyWithin: string, updatedAt: string, updatedBy: string }[]}
   */
  let partyRows = [];

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

  function putParties({ updatedAt = "", updatedBy = "", ...facts }) {
    partyRows = [{ id: 1, ...partyFacts(facts), updatedAt: updatedAt || "", updatedBy: updatedBy || "" }];
  }

  async function getParties() {
    const row = partyRows[0];
    if (!row) return null;
    return { ...partyFacts(row), updatedAt: row.updatedAt, updatedBy: row.updatedBy };
  }

  if (openingHours) putHours(openingHours);
  if (parties) putParties(parties);

  return {
    getOpeningHours,
    async saveOpeningHours(week) {
      putHours(week);
      return getOpeningHours();
    },
    getParties,
    async saveParties(facts) {
      putParties(facts);
      return getParties();
    },
    async exportAll() {
      return { openingHours: hours.map((row) => ({ ...row })), parties: partyRows.map((row) => ({ ...row })) };
    },
    async importAll(snapshot) {
      hours = (snapshot.openingHours || []).map((row) => ({ ...row })).sort((a, b) => a.id - b.id);
      partyRows = (snapshot.parties || []).map((row) => ({ ...row }));
    },
  };
}
