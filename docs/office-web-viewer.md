# Ada Office Web Viewer behavior

Ada's in-app preview can try Microsoft's public Office Web Viewer for repository-tracked `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, and `.pptx` files. Before creating the iframe, the app queries GitHub's anonymous repository metadata endpoint and requires `private: false`. It builds the document URL from the configured repository and branch and points Microsoft directly at the public `raw.githubusercontent.com` file. It does not send a private URL, GitHub token, or Ada's PAT-backed `/api/raw` URL to Microsoft.

The preview shows a visible **Use Ada reader** button beside the embedded viewer. That returns to Ada's existing readers: `docx-preview` for DOCX, SheetJS for XLS/XLSX, and the existing slide-text extraction for PPTX. The bundled `docx-preview@0.3.5` exposes its API as `window.docx.renderAsync`; Ada uses that global and retains `window.docxPreview` as a compatibility alias. JSZip is loaded before docx-preview so its `loadAsync` dependency is available during initialization. Legacy `.doc` and `.ppt` still have no equivalent built-in renderer when Microsoft's viewer is unavailable. Ada cannot reliably distinguish a successful document render from an error inside the cross-origin iframe; the iframe `load` event only confirms that the viewer page loaded. The user-facing status therefore keeps the fallback action available even after that event.

## Reliability and privacy

The `view.officeapps.live.com/op/embed.aspx` endpoint is a best-effort public viewer, not Office.js and not documented by Microsoft as a supported general-purpose embed API. Microsoft's Office for the web service description lists browser support for Office formats, but that does not guarantee this legacy public endpoint will embed them. Microsoft Learn Q&A discussions report intermittent failures and note that an HTTP 200 from the embed shell does not prove the document rendered. Those Q&A replies are community guidance and reports, not an official service-status notice. [1] [2] [3]

A document URL is sent to Microsoft's viewer service when the user opens it. This is intentional only for files in a repository verified as public. Public files should not contain content the user intends to keep confidential. If GitHub cannot confirm the repository is public, Ada skips the Microsoft iframe and continues with its own preview path. If Microsoft's viewer is blank, slow, or errors, use **Use Ada reader**. In the live v23 check, the iframe URL and fallback control were verified for both DOCX and XLSX. Clicking the fallback rendered Ada's DOCX sample and displayed the XLSX sample as a SheetJS table. The iframe's `load` event did not prove that Microsoft rendered either document; a prior direct probe showed a blank viewer shell.

## References

[1]: https://learn.microsoft.com/en-us/office365/servicedescriptions/office-online-service-description/office-online-service-description "Office for the web service description"
[2]: https://learn.microsoft.com/en-us/answers/questions/5191451/what-is-the-status-of-view-officeapps-live-com "Microsoft Learn Q&A discussion of the public Office Viewer"
[3]: https://learn.microsoft.com/en-us/answers/a/13004029 "Community report of Office Viewer PowerPoint failures"
