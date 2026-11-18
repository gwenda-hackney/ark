/**
 * WifiGuestRepository in memory: for tests, and the reference for what every
 * adapter must do (wifi-guest-repository.contract.test.js).
 */
const copy = (value) => structuredClone(value);
const sameEmail = (a, b) => a.toLowerCase() === String(b).toLowerCase();

export function memoryWifiGuestRepository() {
  const records = new Map();
  let nextId = 1;

  const sorted = () => [...records.values()].sort((a, b) => a.id - b.id);
  const find = (email) => sorted().find((r) => sameEmail(r.email, email));

  return {
    async recordVisit({ email, on }) {
      const existing = find(email);
      if (existing) {
        existing.lastSeenOn = String(on);
        return copy(existing);
      }
      const record = {
        id: nextId++,
        email: String(email),
        firstSeenOn: String(on),
        lastSeenOn: String(on),
      };
      records.set(record.id, record);
      return copy(record);
    },
    async getByEmail(email) {
      const record = find(email);
      return record ? copy(record) : null;
    },
    async remove(id) {
      records.delete(Number(id));
    },
    async count() {
      return records.size;
    },
    async exportAll() {
      return { wifiGuests: sorted().map(copy) };
    },
    async importAll({ wifiGuests = [] }) {
      records.clear();
      for (const record of wifiGuests) {
        records.set(Number(record.id), {
          ...copy(record),
          id: Number(record.id),
        });
        nextId = Math.max(nextId, Number(record.id) + 1);
      }
    },
  };
}
