/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initChartNav } from "./chart-nav.js";

const PAGE = (home) => `
  <div class="ch-page${home ? " ch-home" : ""}">
    <a href="#main" class="ch-skip" id="skip">Skip to content</a>
    <main id="main">
      ${home ? '<section id="hero"><h1>Gwenda</h1></section>' : ""}
      <h2 id="first">What's on</h2>
      <a href="/whats-on" id="whats-on">All of it</a>
    </main>
    <footer class="ch-footer">
      <div class="ch-footer-small">
        <a href="#main" class="ch-footer-top" id="top"
          ><svg role="img" aria-label="Back to top"></svg
        ></a>
      </div>
    </footer>
  </div>`;

const byId = (id) => document.getElementById(id);

describe("back up to the top of the page (#240)", () => {
  for (const home of [false, true]) {
    describe(home ? "on home" : "on any other page", () => {
      beforeEach(() => {
        document.body.innerHTML = PAGE(home);
        initChartNav();
      });

      it("Skip to content puts the keyboard at the start of main", () => {
        byId("skip").click();
        expect(document.activeElement).toBe(byId("main"));
      });

      it("the record at the foot puts it there too, not on a heading down the page", () => {
        byId("top").focus();
        byId("top").click();
        expect(document.activeElement).toBe(byId("main"));
      });
    });
  }
});
