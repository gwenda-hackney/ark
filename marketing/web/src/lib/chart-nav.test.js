import { describe, expect, it } from "vitest";
import { chartSections } from "./chart-nav.js";

/** The marked section on a page: its label and how it is marked. */
const marked = (pathname) =>
  chartSections(pathname)
    .filter((item) => item.current)
    .map((item) => [item.label, item.ariaCurrent]);

describe("chartSections", () => {
  it("lists the five places, numbered, in order, and nothing else", () => {
    expect(
      chartSections("/").map((item) => [item.numeral, item.label, item.href]),
    ).toEqual([
      ["I", "What's on", "/whats-on"],
      ["II", "Drinks", "/bar"],
      ["III", "Food", "/kitchen"],
      ["IV", "Parties", "/contact/party"],
      ["V", "Contact", "/contact"],
    ]);
  });

  it("sends home's links down the page, all but Contact, which goes to its page", () => {
    const anchors = chartSections("/").map((item) => [item.label, item.home]);
    expect(anchors).toEqual([
      ["What's on", "whats-on"],
      ["Drinks", "drinks"],
      ["Food", "food"],
      ["Parties", "party"],
      ["Contact", undefined],
    ]);
  });

  it("marks the page you are on as the page", () => {
    expect(marked("/bar/")).toEqual([["Drinks", "page"]]);
    expect(marked("/contact")).toEqual([["Contact", "page"]]);
  });

  it("marks the party form as Parties, not Contact", () => {
    expect(marked("/contact/party")).toEqual([["Parties", "page"]]);
  });

  it("marks a page inside a section as that section, not as the page", () => {
    expect(marked("/whats-on/karaoke-with-ross")).toEqual([
      ["What's on", "true"],
    ]);
    expect(marked("/contact/play")).toEqual([["Contact", "true"]]);
    expect(marked("/contact/party/submitted")).toEqual([["Parties", "true"]]);
  });

  it("marks nothing on home or on a page outside the five", () => {
    expect(marked("/")).toEqual([]);
    expect(marked("/photos")).toEqual([]);
    expect(marked("/about")).toEqual([]);
    expect(marked("/bartender")).toEqual([]);
  });
});
