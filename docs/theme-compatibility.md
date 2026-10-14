# Ada Theme Dashboard and BetterDiscord CSS Compatibility

## What is included

Ada now has a **Themes** dashboard opened from the paint-palette button in the toolbar (or the mobile overflow menu). It provides:

- System, light, and dark appearance modes. System mode follows the device preference; the selected mode is applied before the main stylesheet paints.
- Three Ada-native CSS palettes: Ada Default, Midnight, and High Contrast.
- A visible **Use this theme** action for imported CSS. It makes that custom theme the active base instead of the selected built-in palette. The separate **Enable overlay** toggle layers additional CSS on top.
- Import, edit, and remove controls for CSS theme files.
- A versioned BetterDiscord compatibility translator, `ada-bd-compat-2`, that parses CSS structurally and reports selectors and variables it cannot map.
- An editor for exact, per-theme selector mappings from a Discord selector to an Ada selector.
- An emergency safe appearance that disables imported stylesheets. It is available at `?ada-theme-safe=1` and with **Ctrl + Alt + Shift + S**.

Imported theme files are kept in the browser's IndexedDB. They are not uploaded to Ada, GitHub, or an account, and they do not sync across browsers/devices.

## Importing a theme

1. Open **Themes** and choose a `.theme.css` (or `text/css`) file up to 512 KiB.
2. Leave **Translate BetterDiscord variables and known Discord selectors** enabled for BetterDiscord-style themes. Turn it off for Ada-native CSS. Newly imported themes stay disabled until you choose **Use this theme** or enable **Enable overlay**.
3. Inspect each theme's **Compatibility report**. An unmapped Discord class is not silently represented as if it had an Ada equivalent.
4. Use **Edit / map selectors** to add exact selector translations when a matching Ada component exists. Save to re-parse and re-apply the theme.

CSS rules and ordinary CSS at-rules are preserved, including media queries, keyframes, and font-face rules. The translator changes only mappings it knows. For each `@import`, the compatibility report shows its URL and explains that Ada preserves the import for the browser but does not inspect or translate the imported stylesheet. To see diagnostics for those rules, download the imported CSS and import it separately. A wrapper theme can therefore show zero rewrites even when its remote stylesheet contains many Discord selectors.

## Current translation map

The current mapping version covers selected shared palette variables:

| Discord variable | Ada variable |
| --- | --- |
| `--background-primary` | `--bg` |
| `--background-secondary` | `--item` |
| `--background-secondary-alt` | `--hover` |
| `--background-tertiary` | `--bg` |
| `--background-accent`, `--brand-experiment` | `--accent` |
| `--brand-experiment-560` | `--accent-hover` |
| `--background-floating` | `--item` |
| `--background-modifier-hover` | `--hover` |
| `--background-modifier-selected` | `--selected` |
| `--background-modifier-accent` | `--border` |
| `--text-normal`, `--header-primary`, `--header-secondary` | `--fg` |
| `--interactive-normal` | `--fg` |
| `--interactive-hover` | `--accent-hover` |

The selector map translates `#app-mount`, `.appMount-2yBXZl`, `.theme-dark`, and `.theme-light` to Ada's app-shell and mode hooks. Discord CSS-module names such as `.appMount__51fd7` and `.wrapper_ef3116` are also detected in imported CSS and reported when unmapped. Many describe UI that Ada does not have; they need an explicit Ada target only when a meaningful counterpart exists.

## Ada component hooks

Theme authors can target these stable attributes directly, or use them as the target side of a custom mapping:

- `[data-ada-component="app-shell"]`
- `[data-ada-component="toolbar"]`
- `[data-ada-component="path-navigation"]`
- `[data-ada-component="file-list"]`
- `[data-ada-component="file-entry"]`
- `[data-ada-component="file-icon"]`
- `[data-ada-component="file-name"]`
- `[data-ada-component="file-actions"]` and `[data-ada-component="file-action"]`
- `[data-ada-component="preview-area"]`, `[data-ada-component="preview-window"]`, `[data-ada-component="window-titlebar"]`, and `[data-ada-component="preview-body"]`
- `[data-ada-component="mobile-preview"]`, `[data-ada-component="taskbar"]`, and `[data-ada-component="theme-dashboard"]`

A per-theme selector map is a JSON object whose keys are complete source selectors and whose values are single Ada selectors. Example:

```json
{
  ".guilds-2JjMmN": "[data-ada-component=\"file-list\"]"
}
```

That mapping is a deliberate author choice; Ada cannot infer that every Discord component has a meaningful Ada counterpart.

## Compatibility boundaries and safety

This is a **CSS compatibility layer, not a Discord UI emulator**. Colors, font rules, responsive rules, animations, and layout declarations can apply when their selectors target Ada elements. Discord-only widgets or states—such as voice controls, server lists, and chat message states—have no equivalent unless Ada adds one. The dashboard reports unsupported selectors and variables; it does not promise pixel-identical results for arbitrary third-party themes.

Theme CSS does not run JavaScript, but CSS can still restyle the application and can request external resources through mechanisms such as `url(...)` or `@import`. Import stylesheets only from sources you trust. Safe appearance disables imported CSS while leaving the built-in palette available.

## Development and tests

The source translator is `bin/theme-engine/theme-compat.js`; `npm run build:theme-compat` produces the checked-in browser bundle `bin/theme-compat.js`. Run `npm test` for the JavaScript translator tests and the existing Python test suite. GitHub Actions verifies the generated bundle and runs both suites.
