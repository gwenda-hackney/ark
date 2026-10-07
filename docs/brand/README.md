# Reference images

Images that design work keeps coming back to: the rebrand renders, the logo concepts, food and room photos. Not site assets (those are imported from `marketing/web/src/assets/`), and not the brand guidelines (`marketing/brand/`).

WebP only, 1600px on the long edge, under 400KB each, so the folder stays small in every clone. Originals stay on your machine or in Drive.

```bash
npm run brand:add -- "~/Downloads/render.png" photo.jpg      # converts into this folder
npm run brand:add -- --name logo-torn-flag "~/Downloads/x.png" # with a chosen name
npm run brand:check                                            # what the PR check runs
```

Name files for what they show: `render-<room>`, `logo-<concept>`, `food-<dish>`, `room-<what>`.
