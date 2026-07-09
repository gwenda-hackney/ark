# Gwenda color palette

Single source of truth for hex values: **`src/config/colors.json`**

CSS variables: `src/styles/colors.css` (kept in sync by `src/config/colors.test.ts`)

---

## Solid swatches

Use these exact hex values in Canva, Figma, print, and social templates.

| Name                       | Hex       | Where it appears                                  |
| -------------------------- | --------- | ------------------------------------------------- |
| **Background**             | `#0d0d0d` | Page body, footer, hero base, browser theme color |
| **Background elevated**    | `#141414` | Base fill for story, menu tease (before glow)     |
| **Background story**       | `#151414` | On-screen mathematical average (story section)    |
| **Background story print** | `#23211b` | **Flat print / Canva — use this**                 |
| **Background card**        | `#1a1a1a` | Email signup section                              |
| **Text**                   | `#e8e4dc` | Body copy, headings                               |
| **Text muted**             | `#8a8680` | Secondary copy, nav links                         |
| **Gold**                   | `#c9a84c` | Accent, buttons, links, eyebrows                  |
| **Error**                  | `#c97a7a` | Form validation messages                          |

### Quick answers

- **“What is the website background?”** → `#0d0d0d`
- **“What is the charcoal section background?”** → `#23211b` for print and flat fills (see below)
- **“What is the accent gold?”** → `#c9a84c`

---

## Story background (off-site & print)

The story section on the site is **not** a flat `#141414`. It layers:

1. `#141414` base fill
2. 4% gold radial glow from the top
3. 3.5% film grain (site-wide)

### Flat colour for print and Canva

Use **`#23211b`** (`bgStoryPrint`).

This is a warm charcoal — slightly lighter than the raw `#141414` base — that simulates how the story section reads on screen when the gold glow and grain are visually “baked in” to a single solid. It is computed as:

1. `#141414` + 6% `#c9a84c` (gold glow dispersed as a flat fill)
2. - 2% `#e8e4dc` (subtle lift so ink on paper matches on-screen brightness)

Do **not** use `#141414` or `#151414` for print — they are too dark and too cold.

| Token              | Hex           | When to use                                  |
| ------------------ | ------------- | -------------------------------------------- |
| `bgElevated`       | `#141414`     | Code only — base layer before glow           |
| `bgStory`          | `#151414`     | On-screen mathematical average               |
| **`bgStoryPrint`** | **`#23211b`** | **Print, Canva, business cards, flat fills** |

### Image swatch (optional)

For pixel-perfect screen matching, use `public/brand/story-background.png` (regenerate: `npm run generate:brand-assets`).

## Hero gradient only

These are **not** general page backgrounds. They appear only in the hero decorative gradient.

| Name       | Hex       |
| ---------- | --------- |
| Warm light | `#161310` |
| Warm mid   | `#0f0e0c` |
| Deep       | `#0a0908` |

The hero still sits on `#0d0d0d` as its base fill.

---

## Overlays (not separate swatches)

The site layers effects on top of the solid palette. These are **not** extra colors to pick in Canva — they explain why a flat swatch can look different on screen.

| Effect        | What it does                                         |
| ------------- | ---------------------------------------------------- |
| Film grain    | White noise at 3.5% opacity across the whole page    |
| Gold glow     | 4% gold radial gradient at the top of story sections |
| Hero wash     | 5.5% gold linear gradient over the hero              |
| Warm gradient | Hero uses the three hero-only stops above            |

If Canva looks colder or flatter than the site, you are comparing a flat swatch to a layered screen render — not the wrong hex.

---

## Changing colors

1. Edit `src/config/colors.json`
2. Mirror the same hex in `src/styles/colors.css` (`--color-*` variables)
3. Run `npm test` — the sync test will fail if JSON and CSS diverge
