/**
 * Which visitors the preview gate lets through without the password: search
 * engines and the bots that build link previews (so a shared preview link
 * shows its card), known by the names they really send. A User-Agent that
 * only contains a common word (preview, teams, whatsapp) or is a person's
 * app is sent to the password page like anyone else.
 */
import { describe, expect, it } from "vitest";
import { gate } from "./_middleware.js";

const env = {
  SITE_ENV: "dev",
  SITE_PREVIEW: "true",
  SITE_PASSWORD: "password",
};

function visit(userAgent) {
  return gate({
    request: new Request("https://preview.gwenda-web-dev.pages.dev/menu", {
      headers: { "User-Agent": userAgent },
    }),
    env,
    next: () => new Response("page"),
  });
}

/** What these bots send, from their own documentation. */
const realBots = [
  [
    "Googlebot",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ],
  [
    "Googlebot on a phone",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  ],
  [
    "Google's inspection tool",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
  ],
  [
    "Google's shopping bot",
    "Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
  ],
  [
    "Bing",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ],
  [
    "Yahoo",
    "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
  ],
  ["DuckDuckGo", "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)"],
  [
    "Baidu",
    "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
  ],
  [
    "Yandex",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
  ],
  [
    "Applebot",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  ],
  [
    "Facebook and Instagram",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  ],
  [
    "iMessage",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
  ],
  ["X (Twitter)", "Twitterbot/1.0"],
  [
    "LinkedIn",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  ],
  [
    "Slack's link previews",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  ],
  ["Slackbot", "Slackbot 1.0 (+https://api.slack.com/robots)"],
  [
    "Discord",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  ],
  ["WhatsApp on Android", "WhatsApp/2.23.20.0 A"],
  ["WhatsApp on iPhone", "WhatsApp/2.23.18.78 i"],
  ["Telegram", "TelegramBot (like TwitterBot)"],
  [
    "Teams and Skype link previews",
    "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
  ],
  ["Iframely", "Iframely/1.3.1 (+https://iframely.com/docs/about)"],
  [
    "Embedly",
    "Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)",
  ],
  [
    "GPTBot",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)",
  ],
];

const notBots = [
  ["a bare word: preview", "preview"],
  ["a bare word: teams", "teams"],
  ["a bare word: whatsapp", "whatsapp"],
  ["a bare word: slurp", "slurp"],
  ["curl saying preview", "curl/8.4.0 (preview)"],
  [
    "a browser extension adding Preview",
    "Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0 LinkPreview",
  ],
  [
    "someone in the Teams app",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Teams/1.6.00.4472 Chrome/80.0.3987.165 Electron/8.5.1 Safari/537.36",
  ],
  [
    "someone in Outlook",
    "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.12026; Pro)",
  ],
  ["someone in Word", "Mozilla/4.0 (compatible; ms-office; MSOffice 16)"],
  ["a clone that borrows a name", "NotWhatsApp/1.0"],
  [
    "a person's browser",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  ],
];

describe("the preview gate and bots", () => {
  it.each(realBots)("lets %s through", async (_who, userAgent) => {
    const res = await visit(userAgent);
    expect(await res.text()).toBe("page");
  });

  it.each(notBots)("sends %s to the password page", async (_who, userAgent) => {
    const res = await visit(userAgent);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/gate?next=%2Fmenu");
  });
});
