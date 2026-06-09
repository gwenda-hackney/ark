# Gwenda — Decor & Visual Brand Guidelines

**Physical space · Derived from the website**

Hackney Wick · Schwartz Wharf

*Companion to [brand-manifesto.md](./brand-manifesto.md) and [brand-brief.md](./brand-brief.md). The website is the visual source of truth; the hero and concept imagery are **directional mood boards**, not a literal fit-out brief.*

---

## Design intent

The room should feel like the website made physical: **dark ground, warm gold accent, serif elegance, low light, tactile depth.** Polished friction—industrial warehouse bones held with salon-grade care, on the canal.

If it reads bright, generic, or “modern restaurant beige,” it is off-brand.

---

## Colour palette

Values taken from the live site CSS (`src/styles/global.css`).

### Core

| Role | Hex | Use in the room |
| --- | --- | --- |
| **Background** | `#0D0D0D` | Primary wall and ceiling tone—not pure black; soft charcoal |
| **Background elevated** | `#141414` | Bar back wall, alcoves, secondary surfaces |
| **Background card** | `#1A1A1A` | Banquette backs, menu boards, raised panels |
| **Text primary** | `#E8E4DC` | Warm off-white—menu paper, wayfinding if needed |
| **Text muted** | `#8A8680` | Secondary copy, subtle labels |
| **Gold accent** | `#C9A84C` | Brass hardware, candle-adjacent light, key details |
| **Gold dim** | `rgba(201, 168, 76, 0.35)` | Thin borders, edge lighting, muted highlights |

### Supporting tones (hero gradient)

The site hero uses a warm dark gradient—not flat black. Use these for timber, stone, and layered surfaces:

| Hex | Character |
| --- | --- |
| `#161310` | Warm brown-black—dark timber stain target |
| `#0F0E0C` | Mid depth—bar front, shelving |
| `#0A0908` | Deepest recess—shadow zones, ceiling coves |

### Gold wash

The site applies gold at **~5% opacity** as ambient warmth (`rgba(201, 168, 76, 0.055)`). In the room: amber LED behind glass block, candle clusters, very subtle uplighting on brick—never a gold-painted wall.

### Proportions

- **~85–90%** dark ground (charcoal, brick, dark timber, concrete)
- **~8–12%** warm neutral (text tones, linen, stone)
- **~2–3%** gold accent—brass, light, small hardware. Gold is punctuation, not wallpaper.

---

## Typography

Fonts loaded on the website ([Google Fonts](https://fonts.google.com/)):

| Role | Font | Weights used |
| --- | --- | --- |
| **Display** | [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond?query=cormorant) | 400, 500, 600, 700 (+ italic) |
| **Body** | [Lora](https://fonts.google.com/specimen/Lora?query=lora) | 400, 500 (+ italic) |

### Physical application

| Surface | Font | Treatment |
| --- | --- | --- |
| Logo / external brass plate | Cormorant Garamond | Wordmark only—minimal, confident |
| Menu headings, section titles | Cormorant Garamond | Medium weight (500), slight letter-spacing |
| Menu body, descriptions | Lora | Regular; archive footnotes may feel typewriter-adjacent but stay in Lora |
| Eyebrows / labels (“Cocktails”, “Small Plates”) | Cormorant Garamond | Uppercase, wide letter-spacing (~0.2–0.3em)—see site `.section-eyebrow` |
| Buttons / CTAs (if printed) | Cormorant Garamond | Uppercase, semi-bold, gold on dark or reverse |

### Do not use

- Sans-serif system fonts (Helvetica, Arial, Gotham) on guest-facing materials
- Script or “Italian restaurant” novelty type
- All-caps body copy

---

## Light

The site is built on **low luminance + warm accent + vignette.**

### Target feel

- Hero imagery on site: **~55% brightness**, soft blur, radial vignette darkening edges
- Story sections: faint gold radial glow at top (~4% opacity)—candlelight implied, not installed
- Overall: lantern and lounge, not office or club

### In the room

| Layer | Guideline |
| --- | --- |
| **Ambient** | Low. Dimmed throughout. No flat white ceiling wash |
| **Accent** | Warm amber (~2700K–3000K). Candles on bar. Edison or equivalent over bar seats |
| **Feature** | Glass-block or back-bar glow using gold wash at low intensity |
| **Art** | Spotlights on work only—museum-style, not gallery track everywhere |
| **Avoid** | Neon, RGB, cool white (4000K+), bright downlights on tables |

---

## Texture & atmosphere

### Film grain

The site uses a subtle **fixed grain overlay** at ~3.5% opacity. In physical space: matte finishes, unpolished brick, fine plaster texture, linen—not high-gloss everything.

### Photography / imagery (in-room or marketing)

Match site treatment:

- Low brightness, high shadow
- Warm grade; desaturate slightly (~85% saturation on atmosphere strips)
- Close detail: glass, steam, stone, candle edge
- Vignette at edges—center glow, dark perimeter

### Materials (aligned to manifesto + site)

| Element | Direction |
| --- | --- |
| **Bar** | Dark timber (`#0F0E0C`–`#161310` range), honed not high gloss |
| **Walls** | Exposed brick or charcoal plaster—site background family |
| **Metal** | Brass and aged brass toward `#C9A84C`—handles, rails, menu clips |
| **Stone / slate** | Dark grey, raw edge—for plate presentation and surfaces |
| **Seating** | Deep tan or emerald leather—manifesto; sits against dark ground |
| **Linens** | Off-white toward `#E8E4DC`—warm, not bleached white |
| **Canal / wharf** | Subtle—weathered metal, lantern forms. No portholes, rope nets, anchor décor |

---

## Logo & signage

- **Exterior:** Small brass plate, wordmark only—“Gwenda”. Cormorant-derived lettering or approved logo asset; no loud box signage
- **Colour:** Gold mark on dark, or dark etch on brass—mirror site favicon / logo treatment
- **Interior:** Restrained. Logo at bar or entry—not repeated on every surface

---

## Borders & lines

Site borders use gold at **6–10% opacity**. In fit-out:

- Thin brass inlay or pencil-line grout—not heavy gold trim
- Menu dividers: hairline gold or muted warm grey
- Avoid thick contrasting mouldings

---

## Motion & mood (digital → physical)

The site uses slow fades and staggered reveals (`cubic-bezier(0.25, 0.46, 0.45, 0.94)`). The room equivalent:

- Transitions feel **unhurried**—door opens to dim light, not a blast of brightness
- No strobe, no busy digital screens
- Sound fades in below conversation—never jumps

---

## Quick reference — on brand vs off brand

| On brand | Off brand |
| --- | --- |
| Charcoal walls, warm amber pools of light | White walls, bright even lighting |
| `#C9A84C` brass accents, sparse | Gold leaf everywhere, glitter, neon gold |
| Cormorant + Lora on menus and signs | Sans-serif, chalkboard clichés |
| Dark timber bar, matte brick | Blonde wood, glossy laminate |
| Candle depth, vignette, grain | Ring-light brightness, clinical clean |
| Canal-side industrial, on the wharf | Nautical theme pub, pirate kitsch |

---

## Source files

| Asset | Location |
| --- | --- |
| CSS tokens | `src/styles/global.css` (`:root` variables) |
| Fonts | `src/layouts/BaseLayout.astro` |
| Logo | `src/assets/images/logos/` |
| Hero / atmosphere imagery | `src/assets/images/` — **conceptual guides only** |

---

## Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0 | June 2026 | Initial decor guidelines from website tokens |

*Update this document when site palette or typography changes. Fit-out specs, lighting plans, and FF&E schedules live in separate operations documents.*
