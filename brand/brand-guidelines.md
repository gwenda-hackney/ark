# Gwenda — Brand Guidelines

**Version 1.0 · 8 July 2026 · Confidential**

**Location:** `ark/brand/brand-guidelines.md` (monorepo)  
**Published site:** [brand.gwenda.co.uk](https://brand.gwenda.co.uk) (`ark/brand/src/index.html`)  
**Paths below** are relative to the `ark/` repo root unless noted.

---

## Contents

1. [Brand Overview](#1-brand-overview)
2. [Logo](#2-logo)
3. [Colour Palette](#3-colour-palette)
4. [Typography](#4-typography)
5. [Design Elements](#5-design-elements)
6. [Voice & Tone](#6-voice--tone)
7. [Key Copy & CTAs](#7-key-copy--ctas)

---

## 1. Brand Overview

**Gwenda** is a canalside ristobar at Schwartz Wharf, Hackney Wick, London — opening Summer 2026.

Gwenda is not a restaurant with a drinks list. Not a bar with a kitchen annex. It is an **archive salon** where food, drink, art, and sound converge. Craft cocktails, Italian small plates, natural wines, and vinyl on the decks — refined for candlelight and elevated for the lounge.

The brand is deliberately, intentionally mysterious. *Who is Gwenda?* is a question, not an answer.

| | |
|---|---|
| **Concept** | Archive salon |
| **Location** | Schwartz Wharf, Hackney Wick, London E9 5AA |
| **Website** | [gwenda.co.uk](https://gwenda.co.uk) |
| **Instagram** | [@gwendahackney](https://www.instagram.com/gwendahackney) |
| **Contact** | hello@gwenda.co.uk |

### 1.1 Ship palette

Gwenda sits at **Schwartz Wharf** on the Hackney Wick canal. The palette evokes a ship's world — **blacks**, **browns**, and **gold**:

| Material | Brand role | Hex |
|----------|------------|-----|
| **Hull & tar** | Near-black grounds — page body, hero base, shadows | `#0d0d0d` · `#0a0908` |
| **Teak & timber** | Warm browns — charcoals, hero gradient, print fills | `#161310` – `#23211b` |
| **Brass & flame** | Accent — buttons, eyebrows, wordmark, rule lines | `#c9a84c` · `#8b6914` |

Hull black and tar in shadow. Teak, aged timber, and warm iron in the mid-tones. Brass hardware and candlelight as accent — timber, iron, and lamplight in a hold or salon below deck.

**How the systems connect:**

| System | Role |
|--------|------|
| **Typography** | Serif type evokes engraved brass and ship's-log lettering — measured capitals with wide tracking (hero location line, eyebrows, nav) |
| **Colour** | Black grounds; brown carries wood and iron; gold appears only where light would catch |
| **Lines** | 1px hairline dividers echo deck seams, ledger rules, and brass inlay |

### 1.2 Theme keywords

The shorthand for Gwenda everywhere — site, social, email, motion, photography, and copy. Split by what the eye reads and what the words imply.

**Look** — palette, light, type, texture, composition:

**Teak & brass** · grain & low light · ship's-log serif · deck · ledger · inlay · shadow & vignette

**Feel & tone** — place, mood, culture, voice:

**Mystery** · ship's salon · behind the doors · unhurried · vinyl & sound

Lead with implication, not explanation. Hairline rules read as deck seams and brass inlay (§5). The homepage hero (§3) is the reference for look; §6 shows feel and tone in practice.

---

## 2. Logo

The Gwenda wordmark is the primary brand mark — gold and cream on dark backgrounds. A **black-only variant** exists for light backgrounds and single-colour print.

| Asset | Path / Source |
|-------|---------------|
| Primary logo (PNG) | `brand/src/logo.png` · `web/src/assets/images/logos/logo.png` |
| Black-only wordmark (PNG) | `web/public/brand/logo-black.png` · `brand/src/logo-black.png` |
| Organisation logo (PNG, dark bg) | `web/public/brand/logo-organization.png` (511 × 344 px) |
| Sign artwork (SVG) | `marketing/signs/logo.svg` (workspace `marketing/` shared drive) |
| Illustrator master | `marketing/logos/logo-only.ai` |

### Approved usage

| Variant | Background | When |
|---------|------------|------|
| Primary (gold/cream) | `#0d0d0d` or `#23211b` | Website, social, all standard digital |
| Black-only | `#e8e4dc` (cream) or white in print | Light backgrounds, single-colour applications |

### Logo background

Always place the **primary** logo on a dark background. The canonical dark fills are:

- **Digital:** `#0d0d0d` (page background)
- **Print / flat:** `#23211b` (warm charcoal — see Colour Palette §3.2)

Use the **black-only** variant on cream (`#e8e4dc`) or white in print — never the gold wordmark on a light field.

Never distort, recolour, or place the primary logo on white or saturated colours.

---

## 3. Colour Palette

Single source of truth: `web/src/config/colors.json`

### 3.0 Colour scheme

**Monochromatic** — black, brown, and gold from the ship palette (§1.1). All hues cluster around **~43°** on the colour wheel. Cream and charcoals share the same hue at different saturation and lightness; gold is the accent. The colours evoke hull shadow, aged timber, and brass in lamplight.

### 3.1 Primary palette

These are the five colours to reach for in all design work.

| Swatch | Name | Hex | Usage |
|--------|------|-----|-------|
| ■ | **Background** | `#0d0d0d` | Page body, hero, footer, any digital dark fill |
| ■ | **Cream** | `#e8e4dc` | Body copy, headings, primary text |
| ■ | **Gold** | `#c9a84c` | Accent colour — buttons, links, section eyebrows, decorative dividers |
| ■ | **Gold dark** | `#8b6914` | Deeper gold variant — shadows, depth, hover states |
| ■ | **Muted** | `#8a8680` | Secondary copy, navigation links, captions |
| ■ | **Warm Charcoal** | `#23211b` | Print, Canva, business cards, any flat off-screen fill |

### 3.2 Extended palette (digital / code use)

These values are used on the website but are rarely needed for off-site design work.

| Name | Hex | Notes |
|------|-----|-------|
| Background elevated | `#141414` | Base layer for story and menu sections (before glow effects) |
| Background story | `#151414` | On-screen mathematical average of the story section |
| Background card | `#1a1a1a` | Email signup card |
| Mobile nav scrim | `rgba(8, 8, 8, 0.94)` | Full-screen mobile navigation overlay |
| Error / alert | `#c97a7a` | Form validation messages |

### 3.3 Hero — colour in practice

The homepage hero at [gwenda.co.uk](https://gwenda.co.uk) shows how the swatches above layer on screen — hull black through timber brown to brass gold. See the published brand guidelines site for the live demo and layer breakdown.

Hero photograph: `web/src/assets/images/hero/hero.png`

### 3.4 Hero gradient (website only)

The hero section uses a warm decorative gradient. These are **not** general-purpose colours — do not use them in print or off-site design.

| Name | Hex |
|------|-----|
| Warm light | `#161310` |
| Warm mid | `#0f0e0c` |
| Deep | `#0a0908` |

### 3.5 Derived effects

The website layers effects over the solid palette to create depth and atmosphere. These explain why a flat swatch may look slightly different from the live site.

| Effect | Specification |
|--------|--------------|
| Film grain | White noise at 3.5% opacity, applied site-wide |
| Gold glow | 4% gold radial gradient at the top of story sections |
| Hero gold wash | 5.5% gold linear gradient over the hero image |
| Gold border | 10% gold mixed with transparent (`color-mix`) |
| Gold subtle border | 6% gold mixed with transparent |
| Selection highlight | 28% gold mixed with transparent |

> **For Canva / print:** if your artwork looks colder or flatter than the live site, you are comparing a flat swatch to a layered screen render. Use `#23211b` as your charcoal fill — not `#141414` or `#151414`, which are too dark and too cool.

### 3.6 Colour don'ts

- Do not use `#1c1b18` — this was an explicitly rejected substitute charcoal
- Do not introduce new colours without updating `web/src/config/colors.json`
- Do not use white (`#ffffff`) as a background at any scale
- Do not use bright or saturated colours — the palette is intentionally restrained and warm-dark

---

## 4. Typography

### 4.1 Typefaces

| Role | Family | Weights | Fallback |
|------|--------|---------|---------|
| **Display / Headings** | Cormorant Garamond | 400 Regular, 500 Medium, 600 SemiBold; 400 Italic | Georgia, serif |
| **Body** | Lora | 400 Regular; 400 Italic | Georgia, serif |

Both typefaces are served via `@fontsource` (self-hosted) in Latin subset only. They evoke ship's-log lettering and engraved brass — editorial, archival, unhurried. Wide letter-spacing on labels (hero location, eyebrows, navigation) mirrors nameplate capitals on a vessel.

> **Do not** use sans-serif typefaces in branded communications. Gwenda's visual identity is entirely serif.

### 4.2 Type scale

| Element | Size | Weight | Letter-spacing | Notes |
|---------|------|--------|---------------|-------|
| Section headings | `clamp(2.25rem, 5vw, 3.5rem)` | 500 | `0.04em` | Cormorant Garamond |
| Eyebrows (section labels) | `0.6875rem` | 600 | `0.28em` | Uppercase, Cormorant Garamond |
| Hero eyebrow | small | 600 | `0.35em` | Uppercase |
| Body copy | base | 400 | normal | Lora, `line-height: 1.6` |
| Navigation links | small | — | `0.12em` | Uppercase |
| Buttons / CTAs | small | 600 | `0.08em` | Uppercase |
| Italic accent lines | — | 400 italic | — | Story opening/closing, menu tease lead |

### 4.3 Typography principles

- **Anti-aliasing:** `-webkit-font-smoothing: antialiased` — render at the thinnest weight possible on screen
- **Italic gold accents** are used sparingly for atmosphere — story opening, closing lines, and the menu tease lead
- Heading hierarchy is established by size and letter-spacing, not weight alone
- Line lengths are constrained to roughly 65–70 characters for readability

---

## 5. Design Elements

### 5.1 Layout & spacing

| Token | Value | Notes |
|-------|-------|-------|
| Max content width | `min(1100px, 100% − 48px)` | 24px margin each side |
| Header height (desktop) | `72px` | |
| Header height (mobile, ≤640px) | `56px` | |
| Standard section padding | `6rem 0` | Top and bottom |
| Story section padding | `5rem 0` | |

### 5.2 Borders & corners

- **Radius:** `2px` on buttons, form fields, and focus rings. No pill shapes. No large radii.
- **Dividers:** 1px gradient lines using gold at low opacity — deck seams, ledger rules, brass inlay. Used below section headings, flanking the hero location line, between footer blocks, and in the menu tease
- **Borders:** Gold at 10% opacity (`color-mix`) for cards; 6% for very subtle separators

### 5.3 Buttons

| Variant | Style |
|---------|-------|
| **Primary** (`.btn-primary`) | Gold fill, dark text. Hover: ghost with gold glow (`box-shadow: 0 0 28px` gold at 22%) |
| **Ghost** (`.btn-ghost`) | Transparent fill, subtle gold border |

All buttons: uppercase, `padding: 0.9rem 2.2rem`, `letter-spacing: 0.08em`, weight 600, `border-radius: 2px`.

### 5.4 Shadows & glows

| Element | Specification |
|---------|--------------|
| Primary button hover | `box-shadow: 0 0 28px` gold at 22% |
| Header CTA hover | `box-shadow: 0 0 20px` gold at 18% |
| Hero logo | `drop-shadow(0 4px 24px rgba(0,0,0,0.5))` |
| Form field focus | Animated gold border + box-shadow glow |
| Focus ring (accessibility) | Double ring: 1px solid gold at 50%, outer 4px at 14% |

### 5.5 Imagery treatment

| Context | Treatment |
|---------|-----------|
| Hero image | `brightness(0.55)` with warm gradient and 5.5% gold wash overlay |
| Atmosphere / section background | `brightness(0.45) saturate(0.85)` with fade-to-background gradients at edges |
| Gallery images | `brightness(0.9)`, hover scale `1.06`, `4px` gap grid |
| Logo on dark | `drop-shadow(0 4px 24px rgba(0,0,0,0.5))` |

Images should feel moody, warm, and slightly withdrawn — never bright, high-contrast, or overexposed.

### 5.6 Backdrop blur

| Context | Value |
|---------|-------|
| Header (on scroll) | `blur(14px)` |
| Mobile navigation overlay | `blur(18px)` |

### 5.7 Motion & animation

All animations respect `prefers-reduced-motion`.

| Animation | Description |
|-----------|------------|
| `fadeUp` | Hero elements stagger in on font load (`translateY` + opacity) |
| Scroll-triggered reveal | Sections fade up `14px` as they enter the viewport |
| Word dissolve | "Antiquated ↔ modern" word reveal loops every 28 seconds (story section) |
| Scroll chevron | Gentle bounce loop |
| Form field glow | Keyframe border + shadow pulse on focus |

Easing curves:
- `--ease-out`: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — exits and fades
- `--ease-smooth`: `cubic-bezier(0.22, 1, 0.36, 1)` — elegant overshoots

### 5.8 Film grain

A white noise texture at **3.5% opacity** is applied site-wide as a fixed overlay (`z-index: 9998`). This adds tactility and a slightly analogue feel — intentionally referencing print, archival materials, and late-night atmospheric spaces. Replicate in Canva or print by overlaying a grain texture at low opacity.

---

## 6. Voice & Tone

Gwenda's voice is **evocative, restrained, and slightly mysterious**. The *feel & tone* keywords in §1.2 are the benchmark — this section shows them in practice.

### 6.1 Character

Gwenda's voice is **evocative, restrained, and slightly mysterious**. It is not corporate. It is not hard-sell. It is the voice of somewhere that knows exactly what it is and invites you to discover it yourself.

| Tone quality | In practice |
|-------------|------------|
| Evocative | Describe the experience and atmosphere; avoid factual lists |
| Restrained | Say less. One precise sentence over three vague ones |
| Mysterious | Imply rather than state; the brand is a question, not a pitch |
| Warm | Canalside, local, genuine — not distant or cold |
| Unhurried | Long vowels, serif type, no urgency |

### 6.2 British English

Always write in British English:

- *organise*, not *organize*
- *colour*, not *color*
- Dates in DD Month YYYY format: *4 July 2026*
- Currency: £

### 6.3 What Gwenda is not

Gwenda's positioning is deliberately expressed as negation — it defines itself against categories:

> *Not a restaurant with a drinks list. Not a bar with a kitchen annex.*

Use this framework when explaining the concept. Avoid generic hospitality language: *award-winning*, *great atmosphere*, *something for everyone*.

### 6.4 "Who is Gwenda?"

The mystery of Gwenda's identity is intentional and must be preserved in all customer-facing communications. Do not invent backstory, explain the name, or resolve the question. The answer is: *come and find out*.

### 6.5 Language to use

| Preferred | Avoid |
|-----------|-------|
| Ristobar | Restaurant, bar, venue |
| Archive salon | Pop-up, concept space |
| Hackney Wick / the Wick | East London (too broad) |
| Italian small plates | Italian food, pizza, pasta |
| Craft cocktails, hand-crafted in-house | Drinks, cocktail menu |
| Canalside | Waterfront, riverside |
| *Enter our world* | Sign up, book now, click here |
| *Join the experience* | Register, subscribe |

---

## 7. Key Copy & CTAs

### 7.1 Approved calls-to-action

| CTA | Context |
|-----|---------|
| **Enter our world** | Primary hero CTA |
| **Join the experience** | Secondary / email sign-up CTA |
| **Let me know** | Email form submit button |
| **First to know** | Navigation link to sign-up section |

Do not use "Sign up", "Subscribe", "Register", or "Book now".

### 7.2 Approved short descriptions

**Primary (SEO / listings):**
> A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art, and vinyl on the decks.

**Social / share:**
> A canalside ristobar in Hackney Wick. Craft cocktails, Italian small plates, art and vinyl. Opening Summer 2026.

**Tagline / location:**
> Hackney Wick

**Concept sentence:**
> An archive salon where food, drink, art, and sound converge.

### 7.3 Approved heading / section copy

| Element | Copy |
|---------|------|
| Story heading | *Behind the Doors* |
| Menu section heading | *What we serve* |
| Menu tease lead | *The full list opens with the door. Until then, a glimpse.* |
| Team heading | *Who we are* |
| Sign-up heading | *Be the first to know* |
| Sign-up subheading | *Opening updates, private invitations, and the occasional whisper.* |
| Closing story line | *Who is Gwenda? We can't say. Come experience for yourself.* |

### 7.4 Establishment year

Gwenda was established in **2026** — displayed as **MMXXVI** in Roman numerals on brand materials.

---

## Appendix: File Reference

| Need | Path |
|------|------|
| Brand guidelines (this doc) | `brand/brand-guidelines.md` |
| Published guidelines (HTML) | `brand/src/index.html` |
| Exact hex values | `web/src/config/colors.json` |
| CSS colour variables | `web/src/styles/colors.css` |
| Designer colour guide | `docs/colors.md` |
| All component styling | `web/src/styles/global.css` |
| Font imports | `web/src/styles/fonts.css` |
| All brand copy | `web/src/config/site.ts` |
| Logo (PNG) | `web/src/assets/images/logos/logo.png` |
| Logo master (AI) | `marketing/logos/logo-only.ai` |
| Sign artwork (SVG) | `marketing/signs/logo.svg` |
| Story background (PNG swatch) | `web/public/brand/story-background.png` |

---

*Gwenda Brand Guidelines · White Post Partners Ltd · Confidential*
