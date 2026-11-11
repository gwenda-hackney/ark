/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrivalField,
  firstFillable,
  initFocusOnArrival,
} from "./focus-on-arrival.js";

/** The party form as ContactForm renders it, honeypot and all. */
const PARTY_FORM = `
  <main id="main">
    <h1>Book your party</h1>
    <div id="contact-panel" class="ch-form" data-focus-on-arrival="page">
      <form id="contact-form">
        <p>We need the ones marked * Required.</p>
        <section id="about-you">
          <label for="form-occasion">Occasion</label>
          <select id="form-occasion" name="occasion" hidden>
            <option value="">Select…</option>
          </select>
          <input type="hidden" name="tag" value="party" />
          <label for="form-name">Name</label>
          <input type="text" id="form-name" name="name" />
          <label for="form-email">Email</label>
          <input type="email" id="form-email" name="email" />
        </section>
        <section id="the-night">
          <label for="form-date">Date</label>
          <input type="date" id="form-date" name="date" />
          <div class="contact-other" hidden>
            <input type="text" id="form-other" name="occasionOther" />
          </div>
          <label for="form-message">Anything else</label>
          <textarea id="form-message" name="message"></textarea>
        </section>
        <div class="visually-hidden" aria-hidden="true">
          <label for="form-website">Website</label>
          <input type="text" name="website" id="form-website" tabindex="-1" />
        </div>
      </form>
    </div>
  </main>`;

/** Contact: a page holding the list's sign-up among other things. */
const CONTACT_PAGE = `
  <a href="#main" class="ch-skip" id="skip">Skip to content</a>
  <main id="main">
    <nav class="ch-jump">
      <a href="#find-us" id="to-find-us">Find us</a>
      <a href="#list" id="to-list">Get on the list</a>
    </nav>
    <section id="find-us"><h2>Find us</h2></section>
    <section id="list" data-focus-on-arrival="anchor">
      <h2>Get on the list</h2>
      <form class="signup-form" id="signup-form">
        <label for="email" class="visually-hidden">Email address</label>
        <input type="email" name="email" id="email" />
        <input type="checkbox" name="consent" id="consent" />
        <div class="visually-hidden" aria-hidden="true">
          <input type="text" name="website" id="website" tabindex="-1" />
        </div>
      </form>
    </section>
  </main>
  <footer>
    <form class="signup-form" id="footer-signup-form">
      <input type="email" name="email" id="footer-email" />
    </form>
  </footer>`;

const byId = (id) => document.getElementById(id);
const activeId = () => document.activeElement?.id || "";

/** @type {AbortController} */
let page;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  page = new AbortController();
  window.scrollTo = vi.fn();
});

afterEach(() => {
  page.abort();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("navigation-restore");
  vi.restoreAllMocks();
});

describe("firstFillable", () => {
  it("picks the name box: past the hidden select, the hidden input and the label", () => {
    document.body.innerHTML = PARTY_FORM;
    expect(firstFillable(byId("contact-panel"))?.id).toBe("form-name");
  });

  it("skips a box already filled in (answers put back) for the next empty one", () => {
    document.body.innerHTML = PARTY_FORM;
    byId("form-name").value = "Sam";
    expect(firstFillable(byId("contact-panel"))?.id).toBe("form-email");
  });

  it("never picks the honeypot, a hidden 'Other' box or a date", () => {
    document.body.innerHTML = PARTY_FORM;
    byId("form-name").value = "Sam";
    byId("form-email").value = "sam@example.com";
    expect(firstFillable(byId("contact-panel"))?.id).toBe("form-message");
    byId("form-message").value = "Forty of us";
    expect(firstFillable(byId("contact-panel"))).toBeNull();
  });

  it("skips a disabled box", () => {
    document.body.innerHTML = PARTY_FORM;
    byId("form-name").disabled = true;
    expect(firstFillable(byId("contact-panel"))?.id).toBe("form-email");
  });
});

describe("arrivalField", () => {
  it("a form page: its first box, with no hash needed", () => {
    document.body.innerHTML = PARTY_FORM;
    expect(arrivalField(document, "")).toMatchObject({
      field: byId("form-name"),
      mode: "page",
    });
  });

  it("a page that only holds a form: nothing without a hash", () => {
    document.body.innerHTML = CONTACT_PAGE;
    expect(arrivalField(document, "")).toBeNull();
    expect(arrivalField(document, "#find-us")).toBeNull();
  });

  it("a hash at the form's part, or into it: that form's first box", () => {
    document.body.innerHTML = CONTACT_PAGE;
    expect(arrivalField(document, "#list")?.field).toBe(byId("email"));
    expect(arrivalField(document, "#signup-form")?.field).toBe(byId("email"));
  });

  it("the skip link's #main holds the form but isn't for it", () => {
    document.body.innerHTML = CONTACT_PAGE;
    expect(arrivalField(document, "#main")).toBeNull();
  });

  it("a hash into a form page's part starts from there", () => {
    document.body.innerHTML = PARTY_FORM;
    expect(arrivalField(document, "#the-night")?.field).toBe(
      byId("form-message"),
    );
  });

  it("hashOnly: a form page with no hash at it is not a link to it", () => {
    document.body.innerHTML = PARTY_FORM;
    expect(arrivalField(document, "", { hashOnly: true })).toBeNull();
    expect(arrivalField(document, "#main", { hashOnly: true })).toBeNull();
  });
});

describe("initFocusOnArrival", () => {
  it("arriving at a form page puts the cursor in its first box, the page left at the top", () => {
    document.body.innerHTML = PARTY_FORM;
    initFocusOnArrival({ signal: page.signal });
    expect(activeId()).toBe("form-name");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("arriving at Contact with no hash leaves focus alone", () => {
    document.body.innerHTML = CONTACT_PAGE;
    initFocusOnArrival({ signal: page.signal });
    expect(document.activeElement).toBe(document.body);
  });

  it("arriving at /contact#list puts the cursor in the email box", () => {
    window.history.replaceState(null, "", "/contact#list");
    document.body.innerHTML = CONTACT_PAGE;
    initFocusOnArrival({ signal: page.signal });
    expect(activeId()).toBe("email");
  });

  it("never takes the cursor from a box the visitor is already in", () => {
    document.body.innerHTML = PARTY_FORM;
    byId("form-email").focus();
    initFocusOnArrival({ signal: page.signal });
    expect(activeId()).toBe("form-email");
  });

  it("a link on the page to the list moves the cursor there once the click is through", async () => {
    window.history.replaceState(null, "", "/contact");
    document.body.innerHTML = CONTACT_PAGE;
    initFocusOnArrival({ signal: page.signal });
    byId("to-list").click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(activeId()).toBe("email");
  });

  it("the skip link and other jump links leave the form alone", async () => {
    window.history.replaceState(null, "", "/contact");
    document.body.innerHTML = CONTACT_PAGE;
    initFocusOnArrival({ signal: page.signal });
    byId("skip").click();
    byId("to-find-us").click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).not.toBe(byId("email"));
  });

  describe("a form page whose first box starts below the fold", () => {
    beforeEach(() => {
      document.body.innerHTML = PARTY_FORM;
      vi.spyOn(byId("form-name"), "getBoundingClientRect").mockReturnValue(
        /** @type {DOMRect} */ ({
          top: 950,
          bottom: 999,
          width: 350,
          height: 49,
        }),
      );
    });

    it("scrolls it up, then puts the cursor in it", async () => {
      initFocusOnArrival({ signal: page.signal });
      expect(document.activeElement).toBe(document.body);
      await vi.waitFor(() => expect(activeId()).toBe("form-name"));
      expect(window.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ top: 950 - 16 }),
      );
    });

    it("stands down once the visitor has started to tap or scroll", async () => {
      initFocusOnArrival({ signal: page.signal });
      window.dispatchEvent(new Event("pointerdown"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(document.activeElement).toBe(document.body);
      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it("on back/forward leaves the page where it was, and the cursor out of sight alone", async () => {
      document.documentElement.classList.add("navigation-restore");
      initFocusOnArrival({ signal: page.signal });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(document.activeElement).toBe(document.body);
      expect(window.scrollTo).not.toHaveBeenCalled();
    });
  });
});
