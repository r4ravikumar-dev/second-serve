# Second Serve — UI Design System (DNA v2.0)

All Second Serve UI is styled with **Visit Health's DNA Design System v2.0** (Figma file `5DoZOoPtPaIJtfrXDTLYE2`).
The tokens are vendored verbatim at [`src/styles/dna-tokens.css`](../src/styles/dna-tokens.css), copied from the skill. **Don't edit them by hand.** To update, re-copy them from the skill.

## Rules (from DNA, enforced in code review)

1. **Semantic tokens only** in components: `var(--bg-brand-normal)`, never `var(--color-purple-500)` or `#714FFF`.
2. **Component tokens win** where they exist: `--checkbox-*`, `--radio-button-*`, `--accordion-*`, `--alert-*`.
3. **Text always uses a `.t-*` class.** No raw `font-size` or `font-weight` in components.
4. **Spacing and radius come only from `--spacing-*` and `--radius-*`.** Off-scale values round to the nearest step (no 28, 40 or 72).
5. **No dark mode.** DNA v2.0 has none, so the app ships light-only and declares `color-scheme: light`.
6. **Lint gate (Phase 4):** a test fails the build if any `src/**/*.{css,tsx}` outside `dna-tokens.css` contains a hex colour, `rgb(`, a `px` font size, or a `--color-*` primitive.

## Platform and type scale

Second Serve is a **mobile-first web app**, so every app screen (customer, merchant, NGO) uses the **`mobile/*` text styles**. Only the public landing page and the admin console use **`web/*`** at ≥ 768 px.

| Use | Class |
|---|---|
| Screen title | `.t-mobile-heading-xl` (20) |
| Section title | `.t-mobile-heading-lg` (18) |
| Card title (offer name) | `.t-mobile-heading-md` (16) |
| Body copy | `.t-mobile-body-lg-regular` (14) |
| Secondary body / meta (distance, pickup time) | `.t-mobile-body-sm-regular` (12) |
| Buttons, tabs, inputs | `.t-mobile-label-xl-medium` (14) · small: `.t-mobile-label-lg-medium` (13) |
| Price | `.t-mobile-heading-lg` for the rescue price, with the original price in `.t-mobile-body-sm-regular` + `text-decoration: line-through` + `--text-gray-tertiary` |
| Big KPI numbers (dashboard) | `.t-mobile-display-md` (Bricolage 24) |
| Pickup code (counter) | `.t-mobile-display-lg` (Bricolage 28), letter-spaced via `--spacing-4` gaps between characters |
| Eyebrow above a section | `.t-mobile-overline-sm` |
| Landing hero (web ≥ 768 px) | `.t-web-display-lg` / `.t-web-heading-xl` |

Fonts: **Inter** (primary) and **Bricolage Grotesque** (display only), loaded with `next/font/google` and bound to `--font-family-primary` / `--font-family-secondary`.

### Hindi (हिंदी): a documented extension of DNA
Inter and Bricolage have **no Devanagari glyphs**. Without a fallback, browsers would pick an arbitrary system font for Hindi text. So:
- **Noto Sans Devanagari** (weights 400/500/600, loaded with `next/font/google`) is added as the **second font in both stacks**, after Inter or Bricolage. Latin text still renders in DNA fonts, and Devanagari falls through to Noto.
- This is done in `src/styles/app.css` by re-declaring `--font-family-primary` / `--font-family-secondary`. **`dna-tokens.css` is not edited.**
- Devanagari needs taller line boxes. Hindi strings keep the DNA `.t-*` sizes, but the `:lang(hi)` selector raises line-height to at least 1.5 for body and label styles, so matras aren't clipped.
- Hindi strings run 20–40% longer. Buttons and chips must wrap or shrink-fit; no fixed widths.
- The language toggle is a segmented control (`EN | हिं`) in the header.

## Accessibility: contrast audit of DNA text tokens on white

I measured WCAG contrast for the tokens we'd use (AA needs ≥ 4.5 for normal text):

| Token | Ratio | Verdict for small text |
|---|---|---|
| `--text-gray-primary` / `-secondary` | 14.9 / 5.33 | ✅ |
| `--text-gray-tertiary` | 3.59 | ⚠️ Only for strikethrough original price and decorative text, never essential information |
| `--text-gray-caption` | 2.61 | ❌ Don't use for text; use `-secondary` |
| `--text-brand-primary` | 4.92 (4.56 on brand-subtle) | ✅ |
| `--text-success-normal` · `--text-warning-normal` | 2.75 · 2.73 | ❌ Use **`-intense`** (6.34 / ~6) |
| `--text-error-normal` · `--text-info-normal` | 4.11 · 4.05 | ❌ for small text; use **`-intense`** |
| `--text-accent-sand-intense`, `--text-accent-mint-intense`, `--text-accent-slate-normal`, `--text-accent-violet-normal` | 5.0–6.9 | ✅ |
| `--text-accent-coral-intense` · `--text-accent-pink-normal` · `--text-accent-orange-normal` | 4.49 · 4.35 · 3.15 | ❌ Not used for chip text |

**Rule:** status and accent *text* on light backgrounds uses the `-intense` step (or the accents marked ✅ above). `-normal` is for fills, icons ≥ 3:1 and borders. Focus ring: 2 px `--border-brand-normal` (`--border-width-200`) with an offset of `--spacing-2`.

## Product → token mapping

### Surfaces and layout
| Element | Tokens |
|---|---|
| App background | `--bg-gray-subtle` |
| Card | `--bg-gray-inverse`, `--radius-16`, padding `--spacing-16`, `--elevation-200`; pressed/hover `--elevation-300` |
| Bottom nav / sticky header | `--bg-gray-inverse`, top/bottom border `--border-width-100` `--border-gray-subtle`, `--elevation-300` when scrolled |
| Bottom sheet / modal | `--radius-24` (top corners), `--elevation-600`, scrim `--bg-overlay-normal` |
| Stack gaps | inside a card `--spacing-8`/`--spacing-12`, between cards `--spacing-12`, screen gutters `--spacing-16`, section gap `--spacing-32` |
| Divider | `--border-width-100` `--border-gray-subtle` |

### Buttons and inputs
| Element | Tokens |
|---|---|
| Primary button (Reserve, Approve & publish, Verify) | bg `--bg-brand-normal` → hover/pressed `--bg-brand-intense`; text `--text-brand-on-primary`; `--radius-8`; height 48 (from `--spacing-12` padding + 14 label); `.t-mobile-label-xl-medium` |
| Secondary button | bg `--bg-gray-inverse`, border `--border-width-100` `--border-brand-light`, text `--text-brand-primary` |
| Destructive (Reject draft, Cancel reservation) | text `--text-error-intense`, border `--border-error-normal`; a confirm sheet is always shown first |
| Disabled | bg `--bg-gray-disabled-subtle`, text `--text-gray-disabled-intense`, border `--border-gray-subtle` (the DNA disabled-border tokens resolve to white, a known v2.0 issue) |
| Hero CTA on landing | `--gradient-primary` |
| Text input | bg `--bg-gray-inverse`, border `--border-gray-normal` → focus `--border-brand-normal` 2 px, `--radius-8`, placeholder `--text-gray-placeholder`, `--elevation-100` |
| Field error | message in `--text-error-intense`, border `--border-error-normal` |
| Checkbox / radio (allergen confirm, attestation) | `--checkbox-*` / `--radio-button-*` component tokens |
| Segmented control (Sell / Donate) | selected: bg `--bg-brand-normal` + `--text-brand-on-primary`; unselected: `--bg-gray-normal` + `--text-gray-secondary`; container `--radius-round` |

### Offer status badges (pill, `--radius-round`, `.t-mobile-label-md-medium`, padding `--spacing-4` × `--spacing-8`)
| Status | bg | text |
|---|---|---|
| Live | `--bg-success-subtle` | `--text-success-intense` |
| Ending soon (< 30 min) | `--bg-warning-subtle` | `--text-warning-intense` |
| Few left (≤ 2) | `--bg-brand-subtle` | `--text-brand-primary` |
| Sold out / Expired / Withdrawn | `--bg-gray-normal` | `--text-gray-secondary` |
| Reservation: Reserved | `--bg-brand-subtle` | `--text-brand-primary` |
| Reservation: Collected | `--bg-success-normal` | `--text-gray-inverse` |
| Reservation: Cancelled / No-show | `--bg-error-subtle` | `--text-error-intense` |
| Donation (offered/claimed/collected) | `--bg-info-subtle` | `--text-info-intense` |
| Merchant/NGO verified | `--bg-success-subtle` + check icon `--icon-success-normal` | `--text-success-intense` |
| Pending verification | `--bg-warning-subtle` | `--text-warning-intense` |

### Food category chips (accent `Subtle` bg + accessible text)
| Category | bg | text |
|---|---|---|
| Bakery & breads | `--bg-accent-sand-subtle` | `--text-accent-sand-intense` |
| Meals & mains | `--bg-accent-slate-subtle` | `--text-accent-slate-normal` |
| Fresh, salads & fruit | `--bg-accent-mint-subtle` | `--text-accent-mint-intense` |
| Desserts & sweets | `--bg-accent-violet-subtle` | `--text-accent-violet-normal` |
| Beverages & other | `--bg-gray-normal` | `--text-gray-secondary` |

**Veg / non-veg marker** (the familiar square-and-dot food mark): veg uses a `--icon-success-*` border and dot at the `intense` step (≥ 3:1); non-veg uses `--text-accent-sand-intense` (brown). It's always paired with a text label for screen readers.

### AI draft review (merchant)
| Element | Tokens |
|---|---|
| "AI suggested" banner | `--alert-background-info` + `--alert-border-info`, text `--text-gray-primary`, sparkle icon `--icon-info-normal` |
| Field Gemini filled in, still unedited | left border `--border-width-200` `--border-brand-light`, bg `--bg-brand-subtle` |
| Allergens "must confirm" block | `--alert-background-warning` + `--alert-border-warning`; the publish button stays disabled until the box is ticked |
| Low-confidence item | inline `--text-warning-intense` note "Please check quantity" |
| Food-safety block (category not allowed / too old) | `--alert-background-error` + `--alert-border-error`, `--text-error-intense` |

### Merchant dashboard
| Element | Tokens |
|---|---|
| KPI card | card tokens; number `.t-mobile-display-md` `--text-gray-primary`; label `.t-mobile-body-sm-regular` `--text-gray-secondary` |
| Revenue recovered KPI | number in `--text-brand-primary` |
| Meals donated KPI | icon `--icon-info-normal` |
| At-risk item row | `--bg-warning-subtle` row, item `.t-mobile-heading-sm`, suggested action `.t-mobile-body-sm-regular` + secondary button "Start discount" |
| Chart series (Phase 3 uses simple SVG bars) | sold `--bg-brand-normal`, donated `--bg-info-normal`, wasted `--bg-gray-disabled-intense`; gridlines `--border-gray-subtle`; axis labels `.t-mobile-body-xs-regular` `--text-gray-secondary` |

### Live maps (customer, NGO, admin)
| Element | Tokens |
|---|---|
| List ⇄ Map tabs | DNA tab recipe: selected `--text-brand-primary` + 2 px `--border-brand-normal` underline; default `--text-gray-secondary` |
| Offer pin | Circle 32 px, `--bg-brand-normal`, 2 px ring `--border-gray-inverse`, `--elevation-300`; price label inside in `.t-mobile-label-sm-semibold` `--text-brand-on-primary` |
| Offer pin: ending soon | Fill `--bg-warning-normal`, label `--text-gray-primary` |
| Selected pin | Scaled to 40 px plus a ring in `--border-brand-light` |
| Donation pin (NGO map) | Fill `--bg-info-normal`, white icon `--icon-gray-inverse` |
| Merchant pin (admin map) | Verified `--bg-success-normal` · pending `--bg-warning-normal` · suspended `--bg-error-normal` |
| "You are here" | 12 px `--bg-info-normal` dot with a `--bg-info-subtle` halo |
| Pin cluster | `--bg-gray-dark` circle, count in `--text-gray-inverse` `.t-mobile-label-md-semibold` |
| Map bottom sheet (tapped pin) | Card recipe, top `--radius-24`, `--elevation-500` |
| Map unavailable / quota reached | `--alert-background-neutral` banner: "Map is busy right now; showing the list." Then switch to the list view |

Pin colours are passed to the Maps advanced markers as CSS variables on the marker's DOM content, so no hex values appear in code. The map base style is Google's default light style; no custom map styling at MVP.

### Live stock board (merchant)
| Element | Tokens |
|---|---|
| Item tile | Card recipe, `--radius-12`, padding `--spacing-12`; name `.t-mobile-heading-sm`; remaining count `.t-mobile-display-sm` |
| +/− buttons | 44 × 44 touch targets, `--bg-gray-normal`, `--radius-round`, icon `--icon-size-lg` |
| At-risk badge | `--bg-warning-subtle` + `--text-warning-intense` "Likely leftover: 8" |
| Out of stock | Count in `--text-gray-tertiary`, tile bg `--bg-gray-subtle` |
| Voice update button | Primary button with mic icon; recording state `--bg-error-normal` pulsing at `--opacity-60`↔`100` |
| Voice result confirm sheet | List of proposed changes (old → new) with per-row checkboxes (`--checkbox-*`); "Apply" primary button |

### Verification status (merchant/NGO onboarding, admin queue)
| Step | Tokens |
|---|---|
| Stepper: Upload → Auto-checks → Admin review → Verified | Done `--bg-brand-normal` dot; current `--border-brand-normal` ring; upcoming `--bg-gray-disabled-subtle` |
| Auto-check row ✓ / ✗ | `--icon-success-normal` / `--icon-error-normal` + `.t-mobile-body-sm-regular` |
| Licence expiring within 30 days | `--alert-background-warning` banner |
| Suspended | `--alert-background-error` banner + re-upload CTA |

### Pickup verification (counter screen)
- Code entry: 6 boxes with `--radius-12`, 48 × 56, `.t-mobile-display-md`, border `--border-gray-normal` → filled `--border-brand-normal`.
- Success: full-width `--alert-background-success-intense` sheet, `--text-gray-inverse`, big check icon `--icon-size-xl`.
- Wrong code: `--alert-background-error` with remaining attempts shown.

### Icons
`--icon-size-md` (16) inline with body text, `--icon-size-lg` (20) in buttons and nav, `--icon-size-xl` (24) for empty states and success. Stroke `--icon-stroke-150`. Default colour `--icon-gray-intense`; active nav `--icon-brand-normal`.

## Known DNA v2.0 quirks we work around
- Disabled border tokens resolve to white, so we use `--border-gray-subtle` for disabled borders.
- `--elevation-none` is a 1 px ring: used only as a hairline outline, never as "flat".
- There is no `spacing/28`, `40` or `72`, so we round to 24/32, 48 and 64/80.
- `web/label/lg-Semibold` is actually Medium; this only affects the web scale (landing/admin).
- The mint border jumps from 50 to 800; we avoid mint borders and use mint only for chips.

## Brand note
DNA is Visit Health's design system, so Second Serve will look like a Visit Health product: purple brand, Inter + Bricolage. If Second Serve should have its own brand identity, the semantic layer is the place to remap. Change the `--bg-brand-*` and `--text-brand-*` aliases only; components need no edits.
