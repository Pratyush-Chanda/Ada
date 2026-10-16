# Ada Theme Dashboard and BetterDiscord CSS Compatibility

## What is included

Ada now has a **Themes** dashboard opened from the paint-palette button in the toolbar (or the mobile overflow menu). It provides:

- System, light, and dark appearance modes. System mode follows the device preference; the selected mode is applied before the main stylesheet paints.
- Three Ada-native CSS palettes: Ada Default, Midnight, and High Contrast.
- A visible **Use this theme** action for imported CSS. It makes that custom theme the active base instead of the selected built-in palette. The separate **Enable overlay** toggle layers additional CSS on top.
- Import, edit, and remove controls for CSS theme files.
- A versioned BetterDiscord compatibility translator, `ada-bd-compat-4`, that parses CSS structurally, resolves accessible remote imports, and reports selectors and variables it cannot map.
- An editor for exact, per-theme selector mappings from a Discord selector to an Ada selector.
- An emergency safe appearance that disables imported stylesheets. It is available at `?ada-theme-safe=1` and with **Ctrl + Alt + Shift + S**.

Imported theme files are kept in the browser's IndexedDB. They are not uploaded to Ada, GitHub, or an account, and they do not sync across browsers/devices.

## Importing a theme

1. Open **Themes** and choose a `.theme.css` (or `text/css`) file up to 512 KiB.
2. Leave **Translate BetterDiscord variables and known Discord selectors** enabled for BetterDiscord-style themes. Turn it off for Ada-native CSS. Newly imported themes stay disabled until you choose **Use this theme** or enable **Enable overlay**.
   Themes that target only Discord dark or light mode need Ada's matching appearance mode; the dashboard shows a notice when they do not match.
3. Inspect each theme's **Compatibility report**. An unmapped Discord class is not silently represented as if it had an Ada equivalent.
4. Use **Edit / map selectors** to add exact selector translations when a matching Ada component exists. Save to re-parse and re-apply the theme.

CSS rules and ordinary CSS at-rules are preserved, including media queries, keyframes, and font-face rules. Plain HTTP(S) `@import` URLs are fetched with CORS and credentials omitted, recursively flattened, and translated when the host permits access. Relative asset URLs in fetched CSS are rebased to that stylesheet's URL. The dashboard reports translated and unresolved import counts. Fetching is bounded to 16 imports, five nested levels, 512 KiB per remote sheet, 2 MiB combined CSS, and an eight-second request timeout. Imports with media/layer/supports qualifiers, CORS or network failures, and imports beyond those limits remain unresolved and are reported; the original import is preserved when possible. In that case, the browser may still load the remote stylesheet, but Discord-only selectors will not affect Ada. You can download that stylesheet and import the combined CSS to get a complete translation report.

## Current translation map

The current mapping version covers selected shared palette variables:

| Discord variable | Ada variable |
| --- | --- |
| `--background-primary` | `--bg` |
| `--background-secondary` | `--item` |
| `--background-secondary-alt` | `--hover` |
| `--background-base-lowest`, `--background-base-lower`, `--background-base-low` | `--bg`, `--item`, `--hover` |
| `--background-tertiary` | `--bg` |
| `--brand-experiment`, `--brand-500`, `--text-link` | `--accent` |
| `--brand-experiment-560`, `--brand-600` | `--accent-hover` |
| `--background-floating` | `--item` |
| `--background-modifier-hover` | `--hover` |
| `--background-modifier-selected` | `--selected` |
| `--background-modifier-accent` | `--border` |
| `--text-normal`, `--text-default`, `--text-strong`, `--header-primary`, `--header-secondary` | `--fg` |
| `--interactive-normal` | `--fg` |
| `--interactive-hover` | `--accent-hover` |
| `--main-theme-color` | `--accent` |
| `--category-hover-color` | `--accent-hover` |

Role-specific variables (for mentions, unread dividers, voice channels, message bars, and Discord's neutral `--background-accent` surface) are reported as unmapped instead of being collapsed into Ada's global accent or text tokens. This avoids unrelated Discord colors overriding Ada's main palette. A source alias that would become a self-referential Ada token is retained as an alias and called out in diagnostics.

The selector map translates `#app-mount`, `.appMount-2yBXZl`, hashed `.appMount__…` root selectors, and hashed `.app__…` main-content selectors to Ada's app-shell and file-list hooks. `.theme-dark` and `.theme-light` map to Ada's mode hooks; modern Discord root wrappers such as `.visual-refresh.theme-dark`, `.visual-refresh .theme-dark`, `.visual-refresh.theme-light`, and `.visual-refresh .theme-light` are normalized to Ada's mode root rather than preserved as unmatched wrapper selectors. Other Discord CSS-module names such as `.wrapper_ef3116` are reported when unmapped; many describe UI Ada does not have and need an explicit Ada target only when a meaningful counterpart exists.

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

This is a **CSS compatibility layer, not a Discord UI emulator**. Colors, font rules, responsive rules, animations, and layout declarations can apply when their selectors target Ada elements. A theme wallpaper or palette may therefore apply while Discord-only server, channel, member, and chat rules remain unsupported; the dashboard reports those unmatched rules rather than implying the entire theme was ported. Such Discord-only widgets or states have no equivalent unless Ada adds one, so the system does not promise pixel-identical results for arbitrary third-party themes.

Theme CSS does not run JavaScript, but CSS can still restyle the application and can request external resources through mechanisms such as `url(...)` or `@import`. Import stylesheets only from sources you trust. Safe appearance disables imported CSS while leaving the built-in palette available.

## Development and tests

The source translator is `bin/theme-engine/theme-compat.js`; `npm run build:theme-compat` produces the checked-in browser bundle `bin/theme-compat.js`. Run `npm test` for the JavaScript translator tests and the existing Python test suite. GitHub Actions verifies the generated bundle and runs both suites.
