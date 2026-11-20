// @vitest-environment jsdom
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { patchEmail } from "./frame-patch";

const email = (...rows: string[]) =>
	`<!doctype html><html><head><title>S</title></head><body><p>preheader</p><table><tbody>${rows.join("")}</tbody></table></body></html>`;
const part = (at: number, words: string) => `<tr data-section="${at}"><td><img src="https://cdn/${words}.jpg">${words}</td></tr>`;
const add = (at: number) => `<tr data-insert="${at}"><td></td></tr>`;

function frame(html: string): Document {
	const doc = document.implementation.createHTMLDocument("");
	doc.documentElement.innerHTML = new DOMParser().parseFromString(html, "text/html").documentElement.innerHTML;
	return doc;
}

describe("bringing the email up to date in place", () => {
	it("a part that moved is moved, the same element, with its new place; the editor's own additions stay", () => {
		const before = email(add(0), part(0, "a"), add(1), part(1, "b"), add(2));
		const doc = frame(before);
		const a = doc.querySelector('tr[data-section="0"]')!;
		const b = doc.querySelector('tr[data-section="1"]')!;
		// The editor's grip, and its toolbar on the page.
		const grip = doc.createElement("span");
		grip.dataset.ops = "";
		a.querySelector("td")!.prepend(grip);
		const tools = doc.createElement("div");
		tools.dataset.ops = "";
		doc.body.append(tools);

		patchEmail(doc, before, email(add(0), part(0, "b"), add(1), part(1, "a"), add(2)));

		const rows = Array.from(doc.querySelectorAll("tr[data-section]"));
		assert.equal(rows[0], b, "b is the same element, now first");
		assert.equal(rows[1], a);
		assert.equal(b.getAttribute("data-section"), "0");
		assert.equal(a.getAttribute("data-section"), "1");
		assert.ok(a.contains(grip));
		assert.ok(doc.body.contains(tools));
		assert.deepEqual(
			Array.from(doc.querySelectorAll("tr[data-insert]")).map((row) => row.getAttribute("data-insert")),
			["0", "1", "2"],
		);
	});

	it("a part that changed is drawn anew; the rest stay as they are", () => {
		const before = email(part(0, "a"), part(1, "b"));
		const doc = frame(before);
		const a = doc.querySelector('tr[data-section="0"]')!;
		const preheader = doc.querySelector("p")!;
		patchEmail(doc, before, email(part(0, "a"), part(1, "c")).replace("preheader", "new line"));
		assert.equal(doc.querySelector('tr[data-section="0"]'), a);
		assert.match(doc.querySelector('tr[data-section="1"]')!.innerHTML, /c\.jpg/);
		assert.equal(doc.querySelectorAll("tr[data-section]").length, 2);
		assert.notEqual(doc.querySelector("p"), preheader);
		assert.equal(doc.querySelector("p")!.textContent, "new line");
	});

	it("parts added and removed", () => {
		const before = email(part(0, "a"), part(1, "b"), part(2, "c"));
		const doc = frame(before);
		const c = doc.querySelector('tr[data-section="2"]')!;
		patchEmail(doc, before, email(part(0, "c"), part(1, "d")));
		const rows = Array.from(doc.querySelectorAll("tr[data-section]"));
		assert.equal(rows.length, 2);
		assert.equal(rows[0], c);
		assert.match(rows[1].innerHTML, /d\.jpg/);
	});
});
