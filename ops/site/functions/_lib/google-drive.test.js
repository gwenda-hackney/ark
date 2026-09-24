import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  driveFolderWebUrl,
  findNamedFolder,
  isDriveImage,
  isHeroDriveFileName,
  isOccurrenceHeroDriveName,
  isSeriesHeroDriveName,
  mapDriveImage,
  occurrenceHeroDriveName,
  parseDriveServiceAccount,
  pickReusableDriveFolder,
  seriesHeroDriveName,
} from "./google-drive.js";

describe("google-drive helpers", () => {
  it("builds a folder web URL", () => {
    assert.equal(
      driveFolderWebUrl("1b0d9UueixYma-IgRrHkiK6f8qJdWgOuX"),
      "https://drive.google.com/drive/folders/1b0d9UueixYma-IgRrHkiK6f8qJdWgOuX",
    );
    assert.equal(driveFolderWebUrl(""), "");
  });

  it("parses a service account JSON env value", () => {
    const account = parseDriveServiceAccount({
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: "service_account",
        client_email: "drive@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n",
      }),
    });
    assert.equal(account.client_email, "drive@example.iam.gserviceaccount.com");
    assert.equal(parseDriveServiceAccount({}), null);
    assert.equal(
      parseDriveServiceAccount({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: "{" }),
      null,
    );
  });

  it("finds a gallery folder and ignores files and other folders", () => {
    const children = [
      {
        id: "file",
        name: "gallery",
        mimeType: "image/jpeg",
      },
      {
        id: "other",
        name: "Notes",
        mimeType: "application/vnd.google-apps.folder",
      },
      {
        id: "gal",
        name: "Gallery",
        mimeType: "application/vnd.google-apps.folder",
      },
    ];
    assert.equal(findNamedFolder(children, "gallery")?.id, "gal");
    assert.equal(findNamedFolder(children, "missing"), null);
    assert.equal(findNamedFolder([], "gallery"), null);
  });

  it("reuses an unreferenced folder and skips folders already on an event", () => {
    const folder = "application/vnd.google-apps.folder";
    const children = [
      { id: "old", name: "Jazz", mimeType: folder, modifiedTime: "2026-09-22T14:00:00.000Z" },
      { id: "new", name: "Jazz", mimeType: folder, modifiedTime: "2026-09-22T15:00:00.000Z" },
      { id: "kept", name: "Jazz", mimeType: folder, modifiedTime: "2026-09-22T16:00:00.000Z" },
      { id: "file", name: "Jazz", mimeType: "image/jpeg", modifiedTime: "2026-09-22T17:00:00.000Z" },
    ];
    assert.equal(pickReusableDriveFolder(children, "jazz", ["kept"])?.id, "new");
    assert.equal(pickReusableDriveFolder(children, "missing", []), null);
    assert.equal(pickReusableDriveFolder(children, "Jazz", ["old", "new", "kept"]), null);
  });

  it("maps and filters Drive image files", () => {
    assert.equal(isDriveImage({ mimeType: "image/jpeg" }), true);
    assert.equal(isDriveImage({ mimeType: "application/pdf" }), false);
    assert.deepEqual(
      mapDriveImage({
        id: "abc",
        name: "hero.jpg",
        mimeType: "image/jpeg",
        webViewLink: "https://drive.google.com/file/d/abc/view",
        modifiedTime: "2026-09-22T12:00:00.000Z",
      }),
      {
        id: "abc",
        name: "hero.jpg",
        mimeType: "image/jpeg",
        url: "https://drive.google.com/file/d/abc/view",
        modifiedTime: "2026-09-22T12:00:00.000Z",
      },
    );
  });

  it("names hero copies in the series folder", () => {
    assert.equal(seriesHeroDriveName("Poster.PNG"), "hero.png");
    assert.equal(seriesHeroDriveName("flyer.jpeg"), "hero.jpg");
    assert.equal(seriesHeroDriveName("noext", "image/webp"), "hero.webp");
    assert.equal(seriesHeroDriveName(""), "hero.jpg");
    assert.equal(
      occurrenceHeroDriveName("2026-10-10", "night.gif"),
      "hero-2026-10-10.gif",
    );
    assert.equal(isSeriesHeroDriveName("hero.jpg"), true);
    assert.equal(isSeriesHeroDriveName("hero-2026-10-10.jpg"), false);
    assert.equal(isOccurrenceHeroDriveName("hero-2026-10-10.png", "2026-10-10"), true);
    assert.equal(isOccurrenceHeroDriveName("hero-2026-10-10.png", "2026-10-11"), false);
    assert.equal(isHeroDriveFileName("hero.webp"), true);
    assert.equal(isHeroDriveFileName("hero-2026-10-10.gif"), true);
    assert.equal(isHeroDriveFileName("crowd.jpg"), false);
  });
});
