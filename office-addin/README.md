# Ada for Office

Ada for Office is a Microsoft Office task-pane add-in for Word, Excel, and PowerPoint. Office itself renders the open document; the add-in provides an Ada companion pane. It is separate from Ada's standalone browser previews.

## What it does

The task pane initializes through the Office.js CDN and `Office.onReady()`. It displays the Office host and platform and, when the host exposes it, the current document's filename. The filename is derived locally from the document URL; the full URL and document contents are not displayed, uploaded, or sent to Ada. The permission in the manifest is `ReadDocument`.

The pane also provides a button to copy the filename and a link to open the Ada `newux` workspace. Office remains responsible for viewing and editing the document.

## Sideload the add-in

1. Make sure the `newux` deployment serves `https://ada-newux.vercel.app/office-addin/taskpane.html` over HTTPS.
2. Download `manifest.xml` from Ada's **More actions → Install Ada for Office** entry, or use this folder's manifest directly.
3. In Word, Excel, or PowerPoint, open the app's **My Add-ins** / **Upload My Add-in** command and upload the XML manifest. The exact command placement depends on the Office client and account policy.
4. Open the installed **Ada for Office** task pane from the add-ins list.

For local development, replace `ada-newux.vercel.app` in the XML manifest with a trusted HTTPS development host and use matching URLs for the icon assets and task pane. Office Add-ins require HTTPS for production and Office on the web.

## Files

- `manifest.xml` — add-in-only XML manifest targeting Word (`Document`), Excel (`Workbook`), and PowerPoint (`Presentation`).
- `taskpane.html`, `taskpane.css`, `taskpane.js` — the Office-hosted task pane.
- `icons/` — small PNG icons referenced by the manifest.

This manifest has no ribbon commands; users launch the pane from the Office add-ins list. It requests no document write permission, does not add document contents to Ada, and does not turn Ada's standalone app into an Office file viewer.

Validate the XML manifest with Microsoft's recommended CLI:

```sh
npx --yes office-addin-manifest validate office-addin/manifest.xml
```

## Microsoft documentation

- [Office Add-ins manifest formats](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/add-in-manifests)
- [XML manifest overview and task-pane example](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/xml-manifest-overview)
- [Specify Office hosts and API requirements](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/specify-office-hosts-and-api-requirements)
- [Initialize an Office Add-in](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/initialize-add-in)
- [Validate an Office Add-in manifest](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/troubleshoot-manifest)
