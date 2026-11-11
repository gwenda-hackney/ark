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
          <p id="signup-error"></p>
        </form>
        <div id="signup-confirm" aria-hidden="true"></div>
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
