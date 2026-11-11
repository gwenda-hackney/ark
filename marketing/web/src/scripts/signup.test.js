/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initSignup } from "./signup.js";

/** The form as it renders embedded in a page section (e.g. /contact#list). */
function mountEmbedded({ outerId }) {
  document.body.innerHTML = `
    <section ${outerId ? `id="${outerId}"` : ""} class="page-part">
      <section class="signup signup--embedded">
        <form class="signup-form" id="signup-form" novalidate>
          <input type="email" name="email" id="email" />
          <button type="submit">Sign me up</button>
          <input type="checkbox" name="consent" id="consent" />
          <input type="hidden" name="tag" value="prelaunch" />
          <input type="text" name="website" id="website" />
          <p class="signup-error" id="signup-error"></p>
        </form>
        <div class="signup-confirm" id="signup-confirm" aria-hidden="true"></div>
      </section>
    </section>`;
  const form = document.getElementById("signup-form");
  initSignup(form);
  return form;
}

function submit(form) {
  form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

describe("initSignup", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ csrfToken: "t", secret: "s" }),
      })),
    );
    Element.prototype.scrollIntoView = vi.fn();
    window.requestAnimationFrame = (cb) => cb();
  });

  it.each([{ outerId: "list" }, { outerId: null }])(
    "shows the confirmation on the signup itself (outer id: $outerId)",
    async ({ outerId }) => {
      const form = mountEmbedded({ outerId });
      form.querySelector("#email").value = "someone@example.com";
      form.querySelector("#consent").checked = true;

      submit(form);
      await vi.waitFor(() =>
        expect(
          document.querySelector(".signup").classList.contains("is-confirmed"),
        ).toBe(true),
      );
      expect(
        document.getElementById("signup-confirm").getAttribute("aria-hidden"),
      ).toBe("false");
    },
  );

  it("keeps two sign-ups on one page apart (the page's and the foot's)", async () => {
    document.body.innerHTML = `
      <section class="signup signup--embedded">
        <form class="signup-form" id="signup-form" novalidate>
          <input type="email" name="email" id="email" />
          <button type="submit">Sign me up</button>
          <input type="checkbox" name="consent" id="consent" />
          <p class="signup-error" id="signup-error"></p>
        </form>
        <div class="signup-confirm" id="signup-confirm" aria-hidden="true"></div>
      </section>
      <footer>
        <div class="signup signup--compact">
          <form class="signup-form" id="footer-signup-form" novalidate>
            <input type="email" name="email" id="footer-email" />
            <button type="submit">Sign me up</button>
            <input type="checkbox" name="consent" id="footer-consent" />
            <p class="signup-error" id="footer-signup-error"></p>
          </form>
          <div class="signup-confirm" id="footer-signup-confirm" aria-hidden="true"></div>
        </div>
      </footer>`;
    const page = document.getElementById("signup-form");
    const foot = document.getElementById("footer-signup-form");
    initSignup(page);
    initSignup(foot);

    submit(foot);
    expect(document.getElementById("footer-signup-error").textContent).toBe(
      "That doesn't look like an email.",
    );
    expect(document.getElementById("signup-error").textContent).toBe("");

    foot.querySelector("#footer-email").value = "someone@example.com";
    foot.querySelector("#footer-consent").checked = true;
    submit(foot);
    await vi.waitFor(() =>
      expect(
        document
          .getElementById("footer-signup-confirm")
          .getAttribute("aria-hidden"),
      ).toBe("false"),
    );
    expect(foot.closest(".signup").classList.contains("is-confirmed")).toBe(
      true,
    );
    expect(page.closest(".signup").classList.contains("is-confirmed")).toBe(
      false,
    );
    expect(
      document.getElementById("signup-confirm").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("asks the server for nothing until someone starts filling it in", () => {
    const form = mountEmbedded({ outerId: null });
    expect(fetch).not.toHaveBeenCalled();

    form
      .querySelector("#email")
      .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(fetch).toHaveBeenCalledWith("/api/subscribe", {
      credentials: "same-origin",
    });
  });

  it("asks for consent before sending anything", () => {
    const form = mountEmbedded({ outerId: "list" });
    form.querySelector("#email").value = "someone@example.com";

    submit(form);

    expect(document.getElementById("signup-error").textContent).toBe(
      "Need your OK to stay in touch.",
    );
    expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(
      false,
    );
  });
});
