# Project Style Guide (mini)

This mini documentation collects the main visual tokens and recommendations used across the front-end.

## Design tokens (CSS variables)
File: `src/styles/design-tokens.css`

- Typography
  - `--font-sans` — main UI font: `Akrobat` (fallbacks provided).
  - `--font-mono` — monospace for code.

- Colors
  - `--color-primary`: project primary orange `#F47920`
  - `--color-secondary`: cyan `#06b6d4`
  - `--color-success`: green `#16a34a`
  - `--color-danger`: red `#ef4444`
  - `--color-warning`: amber `#f59e0b`
  - `--color-surface`: white `#ffffff`
  - `--color-text`: default text `#6d6d6d` (project)
  - `--color-muted`: muted gray `#6d6d6d`
  - `--color-bg`: page background `#f8fafc`

- Radiuses
  - `--radius-sm`: 4px
  - `--radius-md`: 8px
  - `--radius-lg`: 16px

- Spacing scale
  - `--space-1` — 4px
  - `--space-2` — 8px
  - `--space-3` — 12px
  - `--space-4` — 16px
  - `--space-5` — 24px

- Shadows
  - `--shadow-sm`, `--shadow-md`, `--shadow-lg` — subtle elevation presets

## Utilities
The file includes a few utility classes:

- `.u-radius-md`, `.u-shadow-sm`, `.text-muted`, `.text-primary`, `.bg-surface` etc.
- `.img-square` — useful for photo tiles (`aspect-ratio:1/1; object-fit:cover`).

Usage examples:

```html
<div class="card u-radius-md u-shadow-sm">
  <h3 class="text-primary">Card title</h3>
  <p class="text-muted">Some helper text</p>
</div>
```

```tsx
<img className={styles.imgSquare} src={photo} alt="user" />
```

## Typography
- Use CSS variable `var(--font-sans)` as default font-family across app. The font is included in `src/main.tsx` by importing the local `Akrobat` css.

## Colors accessibility
- Primary color should be used for interactive controls (buttons, links). Ensure sufficient contrast for text on primary backgrounds (use white text on `--color-primary`).

## Component notes
- Cards and panels: use `--color-surface` background, `--radius-md`, `--shadow-sm` for subtle elevation.
- Buttons: primary vs secondary, keep padding around `var(--space-2)` / `var(--space-3)`.

## Extending tokens
- Add new variables to `:root` in `src/styles/design-tokens.css`.
- Prefer tokens over hardcoded hex values in component CSS modules.

## Where to import
- `src/main.tsx` imports `src/styles/design-tokens.css` so variables are available globally.

---

If you want, I can:
- convert these tokens into a SCSS or JS tokens file,
- add a small Storybook or HTML preview page showing color palette and components,
- replace hard-coded colors in selected components with variables.

Which one do you prefer next?