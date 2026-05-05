# Design System Document: The Digital Vault

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Curated Sanctum."** 

This system moves beyond standard utility to create a digital environment that feels as high-end as the physical assets it tracks—be it a '59 Les Paul or a Patek Philippe. We reject the "flat" web; instead, we build with tonal depth, intentional asymmetry, and a focus on "Object-First" hierarchy. The interface should feel like a custom-built cabinet: heavy, precise, and silent. We break the template look by using generous, variable white space (referencing the Spacing Scale) and overlapping editorial elements that prioritize the beauty of the collection over the density of the data.

---

## 2. Colors & Materiality
The palette is a study in "Dark Neutrals" punctuated by "Warm Metallics." 

### The "No-Line" Rule
**Standard 1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background creates a natural architectural break without the "cheap" feel of a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the `surface-container` tiers to create "nested" depth:
- **Base Layer:** `surface` (#121416) for the primary application canvas.
- **Secondary Z-Space:** `surface-container` (#1e2022) for main content areas.
- **Elevated Assets:** `surface-container-high` (#282a2c) for interactive cards.
- **Inset Details:** `surface-container-lowest` (#0c0e10) for data-heavy tables or search bars to create an "etched" look.

### The "Glass & Metallic" Rule
To evoke a premium vault feel, use Glassmorphism for floating navigation or modal overlays. 
- Use `surface-variant` at 60% opacity with a `backdrop-blur` of 20px.
- **Signature Textures:** For primary CTAs, use a subtle linear gradient transitioning from `primary` (#e9c176) to `primary_container` (#1a1000) at a 135-degree angle. This mimics the luster of brushed brass or gold leaf.

---

## 3. Typography
The typographic system balances the heritage of the past with the precision of the future.

- **Display & Headlines (`notoSerif`):** Used for asset names and high-level navigation. The serif evokes the feeling of a printed auction catalog or a luxury watch certificate.
- **Body & Titles (`manrope`):** A modern, geometric sans-serif used for descriptions and metadata. It provides a technical, functional counter-balance to the serif's elegance.
- **Data & Labels (`inter`):** Selected for its high legibility at small sizes. Used for serial numbers, dates, and technical specs.

**Hierarchy Tip:** Use `display-lg` for hero asset titles with `0.5` spacing leading into `label-md` uppercase tags. This high-contrast scale shift creates an editorial, high-end feel.

---

## 4. Elevation & Depth
We eschew traditional shadows in favor of **Tonal Layering.**

- **The Layering Principle:** Depth is achieved by stacking. Place a `surface-container-highest` object on a `surface-dim` background to create a "lift" of perceived 4dp without a single shadow pixel.
- **Ambient Shadows:** When an element must float (e.g., a detail modal), use an ultra-diffused shadow: `box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5)`. The shadow should feel like ambient occlusion, not a drop shadow.
- **The "Ghost Border" Fallback:** If a border is required for accessibility, use `outline-variant` (#444748) at **15% opacity**. It should be felt, not seen.
- **Precision Corners:** Use the `sm` (0.125rem) or `md` (0.375rem) roundedness for a sharp, machined look. Avoid `full` or `xl` unless it is for a floating action button.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`). Text in `on_primary_fixed` (#261900). 
- **Secondary:** `surface-bright` background with a `Ghost Border` of `outline`. 
- **Tertiary:** Text-only using `primary` color, strictly for low-emphasis actions like "Cancel."

### Inputs & Search
- Use `surface-container-lowest` for the input field background to create an "inset" feel. 
- On focus, transition the `outline` to `primary` (#e9c176) at 40% opacity.

### Cards & Asset Displays
- **Rule:** No dividers. Use `spacing-6` (2rem) of vertical white space to separate card content. 
- Use `surface-container-high` for the card body. On hover, transition to `surface-container-highest` to simulate a "glow" from within the vault.

### Signature Component: The "Vault Chronology"
A custom vertical list for history or provenance. Use a single vertical line in `outline_variant` at 20% opacity. Points on the line should be `primary` dots. This reflects the precision of a watch movement.

---

## 6. Do's and Don'ts

### Do
- Use **Asymmetric Layouts**: Place an image off-center with `display-md` typography overlapping the edge of the container.
- Use **Micro-Interactions**: Elements should fade and slide 4px upwards when appearing, mimicking the soft opening of a velvet-lined drawer.
- Use **High Tonal Contrast**: Ensure `on_surface` text sits on `surface` for maximum readability.

### Don't
- **No Pure Black:** Never use #000000. Use `surface-container-lowest` (#0c0e10) to maintain "visual air."
- **No Standard Dividers:** Never use a solid 100% opaque line to separate content. It breaks the "Vault" immersion.
- **No Bright Saturation:** Aside from the `primary` metallic accents, avoid high-saturation colors. Even `error` states should be used sparingly and leaned toward the `error_container` tones.

---

## 7. Spacing & Rhythm
Rhythm is dictated by the **3.5 Ratio.** Use `spacing-3` (1rem) for internal component padding and `spacing-10` (3.5rem) or `spacing-16` (5.5rem) for section margins. This generous use of space signals luxury—only premium brands can afford to "waste" screen real estate.