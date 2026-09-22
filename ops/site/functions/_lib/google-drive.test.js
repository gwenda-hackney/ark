import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  driveFolderWebUrl,
  isDriveImage,
  mapDriveImage,
  parseDriveServiceAccount,
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
});
