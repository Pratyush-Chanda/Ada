# Ada UX redesign audit and behavior-preservation baseline

**Branch:** `newux`  
**Audit date:** 2026-11-10  
**Scope:** The first two authorized redesign steps: audit the current implementation against the full brief, then establish the Ada behavior that later window/UI changes must preserve.

## Current implementation against the brief

### Visual shell, icons, and typography

The `newux` source has a Material-inspired token layer in `bin/style.css`, a persistent top toolbar, and a collapsible left file drawer. The active shell uses flatter Google-style surfaces and colors; the toolbar brand is explicitly reset from the legacy gradient treatment. This is a meaningful baseline, but the original stylesheet remains in place underneath the new overrides, and some legacy gradient rules still exist. The redesign should continue checking the whole default experience rather than assuming every old component has been normalized.

Feather-style SVG icons are used in the redesigned shell and in converted upload/navigation UI. The implementation is not yet a repository-wide icon audit, so remaining text glyphs and legacy controls still need to be checked as each surface is refined.

Inter and Instrument Serif are defined as GUI and Markdown typography tokens. The Markdown content rules use the serif token, while the application shell uses the sans-serif token. Verify actual font loading and fallback behavior in the deployed build once its assets match the branch.

### Window-system port

The shell redesign is present, but the rOS-webarcade window-system behavior is **not yet fully ported**. Ada still uses its own `.floating-window` preview implementation and Ada callbacks. The current work includes basic preview/window presentation, but it does not yet reproduce the rOS manager's complete interaction model.

The reference implementation in `/tmp/ros-webarcade-ref/initrd/init/modules/window_manager.js` provides per-window z-order/focus, title-bar dragging, eight resize handles, animated open/minimize/maximize/close states, programmatic restore/focus/close methods, and lifecycle events. Its panel listens to those events and maintains taskbar entries that restore minimized windows. The reference panel and window manager are the specific behavior/presentation targets for the next window-system refinement; Ada's file, preview, search, theme, and account logic must remain the application logic behind them.

### PDF and Office files

The branch contains a custom Mozilla PDF.js canvas viewer in `bin/pdf-viewer.js`, intended for direct PDF previews and Markdown PDF embeds so the browser's native PDF viewer is not used. Regression coverage should verify both entry points and confirm there is no native-viewer fallback.

Office rendering is **not implemented with Office.js**. The existing application instead uses `docx-preview` for `.docx`, SheetJS for spreadsheet rendering, and slide-text extraction for `.pptx`; these are not equivalent to complete visual rendering of every Office format, and legacy `.doc`, `.xls`, and `.ppt` coverage must be verified separately.

There is an important technology distinction: Microsoft describes Office.js as the JavaScript API used by an Office Add-in to interact with the Office document in which the add-in is running. The CDN loads that API library; it does not itself render arbitrary Office files inside a separate web application. An actual add-in also has a manifest/package and a web app hosted for Office to load. Therefore adding only the Office.js CDN to Ada would not satisfy the requested “view Office files” behavior. The branch needs an explicit viewer/conversion approach for Ada's fetched files, or the requirement must instead be scoped as an Office Add-in that runs inside Word, Excel, and PowerPoint. [1] [2]

## Ada behavior to preserve

The visual redesign must keep Ada's existing responsibilities and data flows rather than replacing them with rOS desktop logic:

- Load the application configuration and file tree, render folders/files, and preserve path/breadcrumb navigation and empty/error states.
- Preserve file search, keyboard quick navigation, matching paths, opening a result, and the Recently Opened history.
- Keep file-type dispatch and Ada's Markdown/image/text/data/document preview behavior, including renderer plugins and the custom PDF.js path.
- Preserve Ada's open-preview lifecycle and its mobile-specific window adaptations while upgrading the presentation and window controls.
- Keep the built-in and imported theme systems, theme-mode switching, and applicable account/admin UI integrations.
- Preserve the upload flow, authentication/authorization boundaries, file downloads, and any remote file-management actions. Test mutating actions only against a safe test target; do not use production data for regression checks.

The branch's existing unit checks cover search and theme compatibility plus the Python file-tree tooling. They passed during this audit (15 JavaScript tests and 11 Python tests). No automated end-to-end UI suite was found, so later shell/window changes still need browser verification at desktop and narrow mobile widths.

## Browser and deployment findings

The provided deployment, `https://ada-newux.vercel.app`, was checked directly in a browser. A no-store page request still served `bin/style.css?v=13`, `bin/app.js?v=13`, and `bin/mobile.js?v=13`; its HTML has the old toolbar and no `#fileDrawer`. The local `newux` source is at service-worker/cache version 19 and contains the new drawer shell. The deployment's `/api/config` reports the Ada repository and `GITHUB_BRANCH=newux`, so the live page is not currently a reliable validation target for the checked-out `newux` UI; its deployed HTML/assets need to be brought into sync.

On that deployed page, searching for `README` returned one result and opening it recorded a Recently Opened entry. The preview then displayed `Error: HTTP 503`. A direct request to `/api/raw?path=README.md` returned `503` with `{"error":"GITHUB_PAT is not configured."}`. This is a Vercel environment/configuration blocker, not a PDF/Office viewer failure. The page search and preview error were handled in the UI; no page-level JavaScript exception was identified in the captured browser output. A valid server-side `GITHUB_PAT` must be configured in the Vercel project before protected/raw file previews can be validated there.

## Regression baseline for subsequent work

Before and after changing the shell or window manager, verify these user-facing paths:

1. **Startup and navigation:** configuration/tree loading, root and nested folders, breadcrumbs, parent navigation, empty folders, and loading/error feedback.
2. **Search and history:** filename/path matching, keyboard shortcut, result open, search dismissal, Recently Opened persistence, and reopening a recent item.
3. **Preview routing:** representative text/Markdown/image/Office/PDF files; correct file-type dispatch; unsupported/error state; no accidental native PDF viewer.
4. **Window interactions:** open multiple previews, drag, focus/raise, resize, minimize, restore from taskbar, maximize/restore size, close, and sensible behavior with long titles/content.
5. **Responsive behavior:** toolbar and drawer at 390px and 320px widths; mobile window sizing, scrollability, and no clipped controls.
6. **Themes and account UI:** light/dark and custom-theme selection remain intact; theme CSS does not make the redesigned default unusable; account/admin visibility continues to respect current permissions.
7. **File actions and safety:** confirm download behavior. Exercise upload/delete/remote mutations only with a safe test repository or controlled fixtures.
8. **Assets and caching:** deployed HTML, CSS, scripts, and service worker all refer to the same build/version; hard reload and a fresh session show the same shell.

The Vercel deployment's current v13 assets and missing `GITHUB_PAT` prevent it from serving as the end-to-end regression target for the `newux` UI until those deployment issues are corrected. Local/isolated-browser verification should continue in the meantime.

## References

[1]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understand-the-javascript-api-for-office "Understand the Office JavaScript API"
[2]: https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins "Office Add-ins platform overview"
