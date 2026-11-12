# Ada UX redesign audit and behavior-preservation baseline

**Branch:** `newux`  
**Audit date:** 2026-11-10; **updated:** 2026-11-12
**Scope:** The initial redesign audit and behavior-preservation baseline, with follow-on v20 window-system refinement, Office Add-in, public Office Web Viewer, DOCX fallback corrections, and v25 workspace/header refinement.

## Current implementation against the brief

### Visual shell, icons, and typography

The `newux` source has a Material-inspired token layer in `bin/style.css`, a persistent top toolbar, and a collapsible left file drawer. The active shell uses flatter Google-style surfaces and colors; the toolbar brand is explicitly reset from the legacy gradient treatment. This is a meaningful baseline, but the original stylesheet remains in place underneath the new overrides, and some legacy gradient rules still exist. The redesign should continue checking the whole default experience rather than assuming every old component has been normalized.

Feather-style SVG icons are used in the redesigned shell and in converted upload/navigation UI. The implementation is not yet a repository-wide icon audit, so remaining text glyphs and legacy controls still need to be checked as each surface is refined.

Inter is used for the GUI and Markdown body text. Instrument Serif is loaded from Google Fonts and applied only to Markdown headings and subheadings; it is specified directly so the theme's legacy serif token cannot replace it. A local Chromium check confirmed the Instrument Serif face can be loaded and the computed heading/body families are Instrument Serif and Inter, respectively.

### Window-system port

At the initial audit baseline, the rOS-webarcade interaction model was incomplete. The follow-on v20 refinement keeps Ada's `.floating-window` preview path and adds the rOS-style user-facing behaviors: focus/z-order on click, title-bar drag that ignores control buttons, eight pointer/keyboard resize handles, animated open/minimize/maximize/close states, and geometry-preserving maximize/restore. The v25 refinement removes the desktop taskbar and mobile minimize stack: minimized preview windows remain in memory, appear as recently opened workspace items, and are restored in place when reopened. This is an Ada-native adaptation rather than a direct import of rOS's event bus.

The reference implementations in `/tmp/ros-webarcade-ref/initrd/init/modules/window_manager.js` and `/tmp/ros-webarcade-ref/lib/desktop/panel.js` remain the interaction and presentation target. Earlier direct browser checks on the local v20 build confirmed focus stacking, drag, resize, maximize/restore geometry, and close. The v25 browser test confirmed that minimize retains a hidden window, the workspace shows it in Recent, reopening restores the same window, and Clear all removes history without closing the minimized preview. Ada's file, preview, search, theme, and account logic remain behind the new window behavior.

The v25 shell centers search in the persistent header at desktop, 390px, and 320px widths; the Ada wordmark now lives in the file drawer beside a Feather refresh action. The workspace displays recently opened files and a Clear all control, with no taskbar or mobile minimized-item stack.

### PDF and Office files

The branch contains a custom Mozilla PDF.js canvas viewer in `bin/pdf-viewer.js`, intended for direct PDF previews and Markdown PDF embeds so the browser's native PDF viewer is not used. Regression coverage should verify both entry points and confirm there is no native-viewer fallback.

An actual Office-hosted add-in now lives in `office-addin/`. Its XML manifest targets Word, Excel, and PowerPoint, uses the minimum `ReadDocument` permission, and loads a task pane hosted at the `newux` Vercel origin. The task pane loads Microsoft's Office.js CDN and initializes with `Office.onReady()`. It displays the Office host and platform and, when available, a locally derived filename; it does not transmit document contents to Ada. The manifest is downloadable from Ada's **More actions → Install Ada for Office** menu entry. Microsoft's production-level manifest validator accepts the XML and deployed icon URLs. [3] [4] [5] [6] [7]

Ada's standalone preview now attempts Microsoft's public Office Web Viewer for tracked `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, and `.pptx` files only after an anonymous GitHub API check confirms the configured repository is public. It gives Microsoft a raw GitHub URL, not Ada's PAT-backed `/api/raw` proxy or an authenticated URL. The preview always keeps a visible **Use Ada reader** action; cross-origin restrictions mean Ada cannot reliably detect an internal viewer error from the iframe's `load` event. The Microsoft endpoint is best-effort and is not documented as a supported general-purpose embedding API, so the existing `docx-preview`, SheetJS, and PowerPoint-text fallback remains important. [8] [9] [10]

The Office.js add-in is still a separate feature: Office itself renders the open document inside Word, Excel, or PowerPoint. Office.js does not turn Ada's browser page into a general-purpose Office viewer. [1] [2]

Implementation and reliability notes for this public-only embed are in `docs/office-web-viewer.md`.

## Ada behavior to preserve

The visual redesign must keep Ada's existing responsibilities and data flows rather than replacing them with rOS desktop logic:

- Load the application configuration and file tree, render folders/files, and preserve path/breadcrumb navigation and empty/error states.
- Preserve file search, keyboard quick navigation, matching paths, opening a result, and the Recently Opened history.
- Keep file-type dispatch and Ada's Markdown/image/text/data/document preview behavior, including renderer plugins and the custom PDF.js path.
- Preserve Ada's open-preview lifecycle and its mobile-specific window adaptations while upgrading the presentation and window controls.
- Keep the built-in and imported theme systems, theme-mode switching, and applicable account/admin UI integrations.
- Preserve the upload flow, authentication/authorization boundaries, file downloads, and any remote file-management actions. Test mutating actions only against a safe test target; do not use production data for regression checks.

The branch's existing unit checks cover search and theme compatibility plus the Python file-tree tooling. After the Office viewer changes, all 15 JavaScript tests and 11 Python tests passed; direct URL-builder checks also confirmed traversal, untrusted-origin, and wrong-branch paths are rejected. The v25 source passed the same full suite and local headless Chromium checks at 1280px, 390px, and 320px: search stayed centered with no horizontal overflow; recent-file restore/Clear all behaved as expected; no taskbar/minimize-stack DOM remained; and no browser page exceptions were reproduced on the final check. A local browser check confirmed dark-mode switching and restoration of the original system preference. For the add-in, browser verification confirmed that Office.js loads outside an Office host and the page reports that host absence clearly; the menu link and manifest return HTTP 200, and the Office task-pane route does not receive Ada's COOP/COEP headers. An actual Word/Excel/PowerPoint host was not available for in-Office sideload testing.

## Browser and deployment findings

The provided deployment, `https://ada-newux.vercel.app`, initially lagged behind: the first audit saw v13 assets while local source was at v19. Before the v25 UX update is pushed, the last confirmed live Vercel build serves app v23, CSS v22, mobile v21, and service-worker cache v23. `/api/config` reports `Pratyush-Chanda/Ada` and `GITHUB_BRANCH=newux`; the live root, Office manifest, task-pane, and 32px/64px icons all return HTTP 200, and the file tree includes `office-addin/`.

The initial deployment check also saw an HTTP 503 on a README preview and a `GITHUB_PAT is not configured` response. The latest `/api/raw?path=README.md` request returns HTTP 200 with README content. This confirms that the tested public read path is currently healthy, but it does not establish that protected routes or mutating GitHub actions are configured. The live task pane loads Office.js in a browser and shows the expected no-host state; Microsoft's production manifest validator accepts the manifest and its live assets. Actual sideloading and behavior inside Word, Excel, or PowerPoint remain untested until an Office host is available.

The live v22 browser check opened a public DOCX through Microsoft's embed and confirmed the Ada-reader fallback is visible. Clicking that fallback exposed two existing DOCX integration defects: Ada expected `window.docxPreview` instead of the library's `window.docx.renderAsync` API, and JSZip loaded after docx-preview had initialized. Both were fixed in v23. The deployed v23 browser test confirmed that Ada builds the public raw GitHub source URL, creates the Microsoft iframe, and shows the fallback for DOCX and XLSX. Clicking **Use Ada reader** removed the iframe and successfully rendered the DOCX sample text through docx-preview and the XLSX sample as a SheetJS table. The iframe's `load` event only confirms the viewer page loaded; actual Office rendering could not be verified cross-origin, and a prior direct probe showed a blank viewer shell.

## Regression baseline for subsequent work

Before and after changing the shell or window manager, verify these user-facing paths:

1. **Startup and navigation:** configuration/tree loading, root and nested folders, breadcrumbs, parent navigation, empty folders, and loading/error feedback.
2. **Search and history:** filename/path matching, keyboard shortcut, result open, search dismissal, Recently Opened persistence, reopening a recent item, and Clear all from both the workspace and drawer.
3. **Preview routing and Office Add-in:** representative text/Markdown/image/Office/PDF files; public Office files attempt the Microsoft embed and retain the visible Ada-reader fallback; private or unverified repositories skip the embed; correct file-type dispatch; unsupported/error state; no accidental native PDF viewer. Sideload the add-in in Word, Excel, and PowerPoint and verify host/filename metadata and that document contents stay in Office.
4. **Window interactions:** open multiple previews, drag, focus/raise, resize, minimize without a dock, restore the same window from workspace Recent or the file list, maximize/restore size, close, and sensible behavior with long titles/content.
5. **Responsive behavior:** centered toolbar search and drawer at 390px and 320px widths; mobile window sizing, scrollability, and no horizontal overflow or clipped controls.
6. **Themes and account UI:** light/dark and custom-theme selection remain intact; theme CSS does not make the redesigned default unusable; account/admin visibility continues to respect current permissions.
7. **File actions and safety:** confirm download behavior. Exercise upload/delete/remote mutations only with a safe test repository or controlled fixtures.
8. **Assets and caching:** deployed HTML and the service-worker cache use the expected cache-busted URL for each asset; hard reload and a fresh session show the same shell.

The last confirmed live build before the v25 push is v23. The public Office Web Viewer route is best-effort; Ada's DOCX fallback has been verified against the sample file. Remaining end-to-end checks include confirming actual document rendering in Microsoft's cross-origin viewer, sideloading inside a real Office host, exercising host-specific filename behavior, and testing protected or mutating GitHub actions only with a safe fixture.

## References

[1]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/understand-the-javascript-api-for-office "Understand the Office JavaScript API"
[2]: https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins "Office Add-ins platform overview"
[3]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/xml-manifest-overview "XML manifest overview"
[4]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/specify-office-hosts-and-api-requirements "Specify Office hosts and API requirements"
[5]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/initialize-add-in "Initialize an Office Add-in"
[6]: https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests "Office Add-in manifest formats and hosting"
[7]: https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest "Validate an Office Add-in manifest"
[8]: https://learn.microsoft.com/en-us/office365/servicedescriptions/office-online-service-description/office-online-service-description "Office for the web service description"
[9]: https://learn.microsoft.com/en-us/answers/questions/5883721/microsoft-office-online-viewer-does-not-load-docum "Microsoft Learn Q&A on public Office Viewer reliability"
[10]: https://learn.microsoft.com/en-ie/answers/questions/5973167/office-online-viewer-fails-to-open-powerpoint-file "Microsoft Learn Q&A on Office Viewer retrieval behavior"
