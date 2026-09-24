# Gwenda Instagram invites — setup checklist

Use this when wiring **ClickUp → Instagram DM → staging RSVP** for private events.

Check boxes in your editor (`- [ ]` → `- [x]`), or print this page.

**Related:** `[ops/event-invites/README.md](../ops/event-invites/README.md)` · `npm run setup:instagram` · `npm run event-invites`

---

## A. Instagram & Facebook (one-time)

### Already have a Page in Business Suite?

If you see **Gwenda’s Page** at [business.facebook.com](https://business.facebook.com) and it’s **assigned to you**, you can tick:

- [x] **Facebook Page** exists for Gwenda  
- [x] **Meta Business Portfolio** (you’re already inside one if the Page shows there)

**Still confirm these three:**

- [ ] **@gwendahackney** is a **Professional** account (Business or Creator)  
  ```
  Instagram app → Settings → Account type
  ```

- [ ] **@gwendahackney** is linked to that Page  
  ```
  Business Suite → **Settings** → **Accounts** → **Instagram accounts**  
  You should see @gwendahackney listed (if not, click **Add** and log in)
  ```

- [ ] **Second admin** on the portfolio (recommended)  
  ```
  **Settings** → **Users** → **People** → **Add**
  ```

Then skip to **section B** (Meta developer app).

---

### Full checklist (if starting from scratch)

- [ ] **@gwendahackney** is a **Professional** account (Business or Creator)  
  ```
  Instagram → Settings → Account type
  ```

- [ ] **Facebook Page** exists for Gwenda  
  ```
  [facebook.com/pages/create](https://www.facebook.com/pages/create)
  ```

- [ ] **@gwendahackney** is linked to that Page  
  ```
  Instagram → Settings → Account centre → Linked accounts  
  or [business.facebook.com](https://business.facebook.com)
  ```

- [ ] **Meta Business Portfolio** set up for Gwenda *(see below)*

- [ ] **Two admins** on the portfolio (you + someone else) *(see below)*  
  ```
  So access is not tied to one person leaving
  ```

### What is a “Business Portfolio”?

Meta’s name for the **business admin folder** that holds Gwenda’s assets together:

- Facebook Page  
- Instagram @gwendahackney  
- (Later) Meta app, ad account, etc.

You still log in with **your personal Facebook**. The portfolio is **not** a second Facebook account — it’s where Gwenda’s business stuff lives so it isn’t owned by only one person’s profile.

**You may already have one** if you’ve used Meta Business Suite or connected Canva to Instagram. Check first before creating a duplicate.

### Business Portfolio — step by step

**1. Open Meta Business Suite**

- Go to [business.facebook.com](https://business.facebook.com)  
- Log in with your **personal** Facebook (the one that can manage Gwenda’s Page / IG)

**2. See if a portfolio already exists**

- Top-left: click the **dropdown under “Home”** (may show a business name or “See all portfolios”)  
- If **Gwenda** (or similar) is already listed → select it → skip to step 4  
- If nothing exists, or you want a dedicated Gwenda one → continue to step 3

**3. Create a new portfolio** (only if needed)

- Same dropdown → **Create a business portfolio**  
- **Business name:** `Gwenda`  
- **Your name** + **business email:** e.g. `hello@gwenda.co.uk`  
- Confirm the email Meta sends you  
- Official guide: [Create a business portfolio](https://www.facebook.com/business/help/1710077379203657)

**4. Add the Facebook Page**

- Open **Settings** (gear icon) or **Business settings**  
- Go to **Accounts** → **Pages** → **Add**  
- Choose **Add a Page** (if you already created the Gwenda Page)  
- Search for your Page → confirm access  
- If the Page is already linked to your login, this is quick; if it’s owned elsewhere, you may need **Request access**

**5. Add Instagram @gwendahackney**

- **Accounts** → **Instagram accounts** → **Add**  
- Log in to Instagram and approve  
- Account must be **Professional** (Business or Creator)  
- If IG is already linked to the Page, it may appear automatically when you add the Page

**6. Confirm it worked**

You should see in Business settings:

- [ ] **Pages:** Gwenda (your Page)  
- [ ] **Instagram accounts:** @gwendahackney  

**7. Add a second admin** (recommended)

- **Settings** → **Users** → **People** → **Add**  
- Invite a colleague’s **personal Facebook** (email)  
- Role: **Full control** (or Admin)  
- They accept the invite

---

## B. Meta developer app (one-time)

- [ ] Logged into [developers.facebook.com](https://developers.facebook.com) with your **existing** personal Facebook (admin)

- [ ] **App created** (e.g. “Gwenda Invites”)  
  ```
  Contact email: `@gwenda.co.uk` address (not a second Facebook account)
  ```

- [ ] Products added: **Facebook Login** + **Instagram**

- [ ] OAuth redirect URI added (exact):  
  ```
  `http://localhost:8765/callback`
  ```

- [ ] Added to repo-root `.env`:
  ```
  ```env
  META_APP_ID=...
  META_APP_SECRET=...
  ```
  ```

---

## C. Connect Instagram (OAuth — same idea as Canva)

- [ ] Ran from repo root:
  ```
  ```bash
  npm run setup:instagram
  ```
  ```

- [ ] Browser opened → logged into Meta → approved **Gwenda Invites**

- [ ] `.env` updated with:
  - [ ] `INSTAGRAM_ACCESS_TOKEN`
  - [ ] `INSTAGRAM_BUSINESS_ACCOUNT_ID`

- [ ] (Optional) Synced secrets to GitHub for staging/production:
  ```
  ```bash
  npm run setup:event-ops
  ```
  ```

---

## D. ClickUp guest (test)

- [ ] Task in ClickUp invite list with:
  - [ ] **Name** — guest name
  - [ ] **Username/Email** — email or `@instagramhandle`
  - [ ] **Channel** — `Email` or `Instagram`

- [ ] For **Instagram** test: messaged **@gwendahackney** at least once from your personal IG  
  ```
  (Meta only allows DMs to existing conversations)
  ```

---

## E. Sanity event (staging)

- [ ] Event in the **staging** dataset: slug `private-launch-party`  
  ```
  [gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) → Events
  ```
  Publish, then rebuild staging before checking gwenda-staging.

- [ ] Event has a **hero image** (used in DM + RSVP page)

---

## F. Send test invite (staging)

- [ ] **Dry run** succeeded:
  ```
  ```bash
  npm run event-invites -- \
    --event-slug private-launch-party \
    --source clickup \
    --invite-base-url https://gwenda-staging.pages.dev \
    --dry-run
  ```
  Expect: guest synced from ClickUp → Baserow; Instagram route (not “manual”) if token + conversation exist
  ```

- [ ] **Live send**:
  ```
  ```bash
  npm run event-invites -- \
    --event-slug private-launch-party \
    --source clickup \
    --invite-base-url https://gwenda-staging.pages.dev \
    --send
  ```
  ```

- [ ] DM received from **@gwendahackney** (hero image + personal link)

- [ ] Opened invite link → RSVP page shows event title + hero

- [ ] Submitted RSVP headcount

- [ ] Headcount updated in **Baserow** (Event Invites) and/or **Studio → Event invites**

---

## G. Ops & handoff (do now)

- [ ] Page, Instagram, and Meta app live in **Business Portfolio** (not only one person’s account)

- [ ] Second admin on Business Portfolio **and** Meta app

- [ ] `INSTAGRAM_`* + `META_*` in **GitHub secrets** (not only local `.env`)

- [ ] Team knows: refresh token = re-run `npm run setup:instagram`

---

## Quick reference


| What                | Where                                                                |
| ------------------- | -------------------------------------------------------------------- |
| OAuth connect       | `npm run setup:instagram`                                            |
| Send invites        | `npm run event-invites -- --send …`                                  |
| Staging site        | [https://gwenda-staging.pages.dev](https://gwenda-staging.pages.dev) |
| Dev Studio          | [https://gwenda-dev.sanity.studio](https://gwenda-dev.sanity.studio) |
| ClickUp → send docs | `[ops/event-invites/README.md](../ops/event-invites/README.md)`  |


---

## If something fails


| Symptom                       | Check                                                          |
| ----------------------------- | -------------------------------------------------------------- |
| Redirect URI error            | Exact match: `http://localhost:8765/callback`                  |
| No Instagram account found    | Page ↔ @gwendahackney link in Business Suite                   |
| “Manual Instagram” in dry run | `INSTAGRAM_`* missing, or no prior DM to @gwendahackney        |
| Guest not synced from ClickUp | **Channel** + **Username/Email** filled on task                |
| RSVP page missing event copy  | Staging `SANITY_API_TOKEN` on Cloudflare; event in dev dataset |


