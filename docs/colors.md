# Gwenda color palette

Single source of truth for hex values: **`src/config/colors.json`**

CSS variables: `src/styles/colors.css` (kept in sync by `src/config/colors.test.ts`)

The palette is **monochromatic black, brown, and gold** — drawn from the ship's world at Schwartz Wharf (hull black, teak and timber brown, brass gold). See [brand guidelines §1.1](../marketing/brand/brand-guidelines.md#11-ship-palette) and the [hero colour breakdown](../marketing/brand/brand-guidelines.md#30a-hero--colour-in-practice).

---

## Solid swatches

Use these exact hex values in Canva, Figma, print, and social templates.

| Name                       | Hex       | Where it appears                                     |
| -------------------------- | --------- | ---------------------------------------------------- |
| **Background**             | `#120e0a` | Page body, footer, hero base, browser theme color    |
| **Background elevated**    | `#1a140f` | Base fill for story, menu tease (before glow)        |
| **Background story**       | `#1b140f` | On-screen mathematical average (story section)       |
| **Background story print** | `#292117` | **Flat print / Canva — use this**                    |
| **Background card**        | `#201812` | Email signup section                                 |
| **Text**                   | `#efe5d2` | Body copy, headings                                  |
| **Text muted**             | `#9c8f7c` | Secondary copy, nav links                            |
| **Gold**                   | `#d4a44c` | Accent, buttons, links, eyebrows                     |
| **Gold dark**              | `#8b6914` | Deeper gold — shadows, depth, hover states           |
| **Error**                  | `#c97a7a` | Form validation, decline / opt-out buttons (outline) |

### Quick answers

- **“What is the website background?”** → `#120e0a`
- **“What is the charcoal section background?”** → `#292117` for print and flat fills (see below)
- **“What is the accent gold?”** → `#d4a44c`

---

## Story background (off-site & print)

The story section on the site is **not** a flat `#141414`. It layers:

1. `#141414` base fill
2. 4% gold radial glow from the top
3. 3.5% film grain (site-wide)

### Flat colour for print and Canva

Use **`#292117`** (`bgStoryPrint`).

This is a warm charcoal — slightly lighter than the raw `#141414` base — that simulates how the story section reads on screen when the gold glow and grain are visually “baked in” to a single solid. It is computed as:

1. `#141414` + 6% `#d4a44c` (gold glow dispersed as a flat fill)
2. - 2% `#efe5d2` (subtle lift so ink on paper matches on-screen brightness)

Do **not** use `#141414` or `#1b140f` for print — they are too dark and too cold.

| Token              | Hex           | When to use                                  |
| ------------------ | ------------- | -------------------------------------------- |
| `bgElevated`       | `#141414`     | Code only — base layer before glow           |
| `bgStory`          | `#1b140f`     | On-screen mathematical average               |
| **`bgStoryPrint`** | **`#292117`** | **Print, Canva, business cards, flat fills** |

### Image swatch (optional)

For pixel-perfect screen matching, use `public/brand/story-background.png` (regenerate: `npm run generate:brand-assets`).

## Hero gradient only

These are **not** general page backgrounds. They appear only in the hero decorative gradient.

| Name       | Hex       |
| ---------- | --------- |
| Warm light | `#161310` |
| Warm mid   | `#0f0e0c` |
| Deep       | `#0a0908` |

The hero still sits on `#120e0a` as its base fill.

---

## Brown-hue greens (material lane)

Green does **not** join gold as a UI accent. The only greens in the system are **brown-hue** — olive, moss, canal mud — so desaturated they read as timber shadow before they read as green (hue ~70–95°, lightness never above `#292117`).

| Token               | Hex       | When to use                                                               |
| ------------------- | --------- | ------------------------------------------------------------------------- |
| **`bgCanalShadow`** | `#1a2218` | Murky canal water at dusk, moss in deep shadow — photography grade target |
| **`bgDampTimber`**  | `#1e261c` | Wet deck wood, herb tones in shadow — brown extension of timber           |
| **`bgVerdigris`**   | `#2a3530` | Oxidized brass patina — overlay on gold only (6–12%), cool limit          |

**Where green appears:**

- **Photography** — herbs, garnish, canal (menu tease gallery, social). Grade toward olive-brown, not emerald.
- **Material shadows** — optional fills/overlays using the tokens above.
- **Never** — buttons, eyebrows, logos, or bright sage/emerald/mint accents.

Material ladder: `#0a0908` → `#161310` → `#292117` → `#1e261c` → `#1a2218`. See [brand guidelines §3.7](../marketing/brand/brand-guidelines.md#37-green--brown-hue-materials).

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
