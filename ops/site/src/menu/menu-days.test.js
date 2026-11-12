import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  cleanMenuDate,
  cleanMenuDays,
  menuDatesLabel,
  menuDayList,
  menuDaysLabel,
  menuRunsOn,
  menuStatus,
} from "./menu-days.js";

describe("a menu's days", () => {
  it("keeps them in week order, once each; all seven or none is every day", () => {
    assert.deepEqual(menuDayList("sat,thu, Fri"), ["thu", "fri", "sat"]);
    assert.deepEqual(menuDayList(["Saturday", "sat", "nope"]), ["sat"]);
    assert.deepEqual(menuDayList(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), []);
    assert.equal(cleanMenuDays(["sun", "mon"]), "mon,sun");
    assert.equal(cleanMenuDays(""), "");
  });

  it("says them in a few words", () => {
    assert.equal(menuDaysLabel(""), "Every day");
    assert.equal(menuDaysLabel("sat"), "Sat");
    assert.equal(menuDaysLabel("thu,fri"), "Thu & Fri");
    assert.equal(menuDaysLabel("wed,thu,fri,sat"), "Wed–Sat");
    assert.equal(menuDaysLabel("mon,wed,fri"), "Mon, Wed & Fri");
    assert.equal(menuDaysLabel("mon,tue,wed,fri"), "Mon–Wed & Fri");
  });
});

describe("a menu's dates", () => {
  it("reads only real days", () => {
    assert.equal(cleanMenuDate("2026-11-12"), "2026-11-12");
    assert.equal(cleanMenuDate("2026-02-30"), "");
    assert.equal(cleanMenuDate("12/11/2026"), "");
  });

  it("says them in a few words", () => {
    assert.equal(menuDatesLabel({}), "ongoing");
    assert.equal(menuDatesLabel({ startsOn: "2026-11-12", endsOn: "2026-11-30" }), "12–30 Nov");
    assert.equal(menuDatesLabel({ startsOn: "2026-11-28", endsOn: "2026-12-03" }), "28 Nov – 3 Dec");
    assert.equal(menuDatesLabel({ startsOn: "2026-12-28", endsOn: "2027-01-03" }), "28 Dec 2026 – 3 Jan 2027");
    assert.equal(menuDatesLabel({ startsOn: "2026-12-01" }), "from 1 Dec");
    assert.equal(menuDatesLabel({ endsOn: "2026-11-30" }), "until 30 Nov");
    assert.equal(menuDatesLabel({ startsOn: "2026-11-14", endsOn: "2026-11-14" }), "14 Nov");
  });

  it("is on now, coming up or ended by its dates; it runs on its days between them", () => {
    const brunch = { startsOn: "2026-11-14", endsOn: "2026-11-28", days: "sat" };
    assert.equal(menuStatus(brunch, "2026-11-12"), "coming");
    assert.equal(menuStatus(brunch, "2026-11-16"), "on", "on now on a Monday between its dates");
    assert.equal(menuStatus(brunch, "2026-11-28"), "on", "its last day");
    assert.equal(menuStatus(brunch, "2026-11-29"), "ended");
    assert.equal(menuStatus({}, "2026-11-12"), "on");
    assert.equal(menuRunsOn(brunch, "2026-11-21"), true, "a Saturday");
    assert.equal(menuRunsOn(brunch, "2026-11-20"), false, "a Friday");
    assert.equal(menuRunsOn(brunch, "2026-11-07"), false, "before it starts");
    assert.equal(menuRunsOn({}, "2026-11-20"), true);
  });
});
