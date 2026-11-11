# Ada UX redesign audit and behavior-preservation baseline

**Branch:** `newux`  
**Audit date:** 2026-11-10; **updated:** 2026-11-11  
**Scope:** The initial redesign audit and behavior-preservation baseline, with follow-on v20 window-system refinement and Office Add-in implementation.

## Current implementation against the brief

### Visual shell, icons, and typography

The `newux` source has a Material-inspired token layer in `bin/style.css`, a persistent top toolbar, and a collapsible left file drawer. The active shell uses flatter Google-style surfaces and colors; the toolbar brand is explicitly reset from the legacy gradient treatment. This is a meaningful baseline, but the original stylesheet remains in place underneath the new overrides, and some legacy gradient rules still exist. The redesign should continue checking the whole default experience rather than assuming every old component has been normalized.

Feather-style SVG icons are used in the redesigned shell and in converted upload/navigation UI. The implementation is not yet a repository-wide icon audit, so remaining text glyphs and legacy controls still need to be checked as each surface is refined.

Inter and Instrument Serif are defined as GUI and Markdown typography tokens. The Markdown content rules use the serif token, while the application shell uses the sans-serif token. Verify actual font loading and fallback behavior in the deployed build once its assets match the branch.

### Window-system port

At the initial audit baseline, the rOS-webarcade interaction model was incomplete. The follow-on v20 refinement keeps Ada's `.floating-window` preview path and adds the rOS-style user-facing behaviors: focus/z-order on click, title-bar drag that ignores control buttons, eight pointer/keyboard resize handles, animated open/minimize/maximize/close states, geometry-preserving maximize/restore, and taskbar restore/focus. The mobile override retains Ada's full-screen preview and minimized-window stack. This is an Ada-native adaptation rather than a direct import of rOS's event bus.

The reference implementations in `/tmp/ros-webarcade-ref/initrd/init/modules/window_manager.js` and `/tmp/ros-webarcade-ref/lib/desktop/panel.js` remain the interaction and presentation target. Direct browser checks on the local v20 build confirmed focus stacking, drag, resize, maximize/restore geometry, taskbar restore, and window close. Further visual checks across device classes remain part of the regression pass; Ada's file, preview, search, theme, and account logic remain behind the new window behavior.

### PDF and Office files

The branch contains a custom Mozilla PDF.js canvas viewer in `bin/pdf-viewer.js`, intended for direct PDF previews and Markdown PDF embeds so the browser's native PDF viewer is not used. Regression coverage should verify both entry points and confirm there is no native-viewer fallback.

An actual Office-hosted add-in now lives in `office-addin/`. Its XML manifest targets Word, Excel, and PowerPoint, uses the minimum `ReadDocument` permission, and loads a task pane hosted at the `newux` Vercel origin. The task pane loads Microsoft's Office.js CDN and initializes with `Office.onReady()`. It displays the Office host and platform and, when available, a locally derived filename; it does not transmit document contents to Ada. The manifest is downloadable from Ada's **More actions → Install Ada for Office** menu entry. Microsoft's production-level manifest validator accepts the XML and deployed icon URLs. [3] [4] [5] [6] [7]

This add-in is separate from Ada's standalone file preview. Office itself renders the open Office document inside Word, Excel, or PowerPoint; adding Office.js does not make Ada's browser page a general-purpose Office viewer. Ada's in-app preview routing remains `docx-preview` for `.docx`, SheetJS for spreadsheets, and slide-text extraction for `.pptx`; completeness for legacy `.doc`, `.xls`, and `.ppt` remains a separate viewer issue. [1] [2]

## Ada behavior to preserve

The visual redesign must keep Ada's existing responsibilities and data flows rather than replacing them with rOS desktop logic:

- Load the application configuration and file tree, render folders/files, and preserve path/breadcrumb navigation and empty/error states.
- Preserve file search, keyboard quick navigation, matching paths, opening a result, and the Recently Opened history.
- Keep file-type dispatch and Ada's Markdown/image/text/data/document preview behavior, including renderer plugins and the custom PDF.js path.
- Preserve Ada's open-preview lifecycle and its mobile-specific window adaptations while upgrading the presentation and window controls.
- Keep the built-in and imported theme systems, theme-mode switching, and applicable account/admin UI integrations.
- Preserve the upload flow, authentication/authorization boundaries, file downloads, and any remote file-management actions. Test mutating actions only against a safe test target; do not use production data for regression checks.

The branch's existing unit checks cover search and theme compatibility plus the Python file-tree tooling. They passed before and after the window refinement (15 JavaScript tests and 11 Python tests). A local browser check also confirmed that dark mode toggles and the original system preference can be restored. For the add-in, browser verification confirmed that Office.js loads outside an Office host and the page reports that host absence clearly; the menu link and manifest return HTTP 200, and the Office task-pane route does not receive Ada's COOP/COEP headers. An actual Word/Excel/PowerPoint host was not available for in-Office sideload testing. No automated end-to-end UI suite was found, so device-specific shell/window checks still need browser verification at desktop and narrow mobile widths.

## Browser and deployment findings

The provided deployment, `https://ada-newux.vercel.app`, initially lagged behind: the first audit saw v13 assets while local source was at v19. After the `newux` pushes, Vercel now serves v21 CSS/app/mobile assets. `/api/config` reports `Pratyush-Chanda/Ada` and `GITHUB_BRANCH=newux`; the live root, Office manifest, task-pane, and 32px/64px icons all return HTTP 200, and the file tree includes `office-addin/`.

The initial deployment check also saw an HTTP 503 on a README preview and a `GITHUB_PAT is not configured` response. The latest `/api/raw?path=README.md` request returns HTTP 200 with README content. This confirms that the tested public read path is currently healthy, but it does not establish that protected routes or mutating GitHub actions are configured. The live task pane loads Office.js in a browser and shows the expected no-host state; Microsoft's production manifest validator accepts the manifest and its live assets. Actual sideloading and behavior inside Word, Excel, or PowerPoint remain untested until an Office host is available.

## Regression baseline for subsequent work

Before and after changing the shell or window manager, verify these user-facing paths:

1. **Startup and navigation:** configuration/tree loading, root and nested folders, breadcrumbs, parent navigation, empty folders, and loading/error feedback.
2. **Search and history:** filename/path matching, keyboard shortcut, result open, search dismissal, Recently Opened persistence, and reopening a recent item.
3. **Preview routing and Office Add-in:** representative text/Markdown/image/Office/PDF files; correct file-type dispatch; unsupported/error state; no accidental native PDF viewer. Sideload the add-in in Word, Excel, and PowerPoint and verify host/filename metadata and that document contents stay in Office.
4. **Window interactions:** open multiple previews, drag, focus/raise, resize, minimize, restore from taskbar, maximize/restore size, close, and sensible behavior with long titles/content.
5. **Responsive behavior:** toolbar and drawer at 390px and 320px widths; mobile window sizing, scrollability, and no clipped controls.
6. **Themes and account UI:** light/dark and custom-theme selection remain intact; theme CSS does not make the redesigned default unusable; account/admin visibility continues to respect current permissions.
7. **File actions and safety:** confirm download behavior. Exercise upload/delete/remote mutations only with a safe test repository or controlled fixtures.
8. **Assets and caching:** deployed HTML, CSS, scripts, and service worker all refer to the same build/version; hard reload and a fresh session show the same shell.

Vercel now serves the v21 `newux` UI and the Office Add-in URLs. Remaining end-to-end checks are sideloading inside a real Office host, exercising host-specific filename behavior, and testing protected or mutating GitHub actions only with a safe fixture.

## References

[1]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understand-the-javascript-api-for-office "Understand the Office JavaScript API"
[2]: https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins "Office Add-ins platform overview"
[3]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/xml-manifest-overview "XML manifest overview"
[4]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/specify-office-hosts-and-api-requirements "Specify Office hosts and API requirements"
[5]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/initialize-add-in "Initialize an Office Add-in"
[6]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests "Office Add-in manifest formats and hosting"
[7]: https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest "Validate an Office Add-in manifest"
