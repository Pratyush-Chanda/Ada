(() => {
  "use strict";

  const connectionStatus = document.getElementById("connectionStatus");
  const connectionText = document.getElementById("connectionText");
  const hostName = document.getElementById("hostName");
  const platformName = document.getElementById("platformName");
  const fileName = document.getElementById("fileName");
  const copyButton = document.getElementById("copyFileName");
  const actionStatus = document.getElementById("actionStatus");
  let currentFileName = "";

  function setConnection(state, message) {
    connectionStatus.dataset.state = state;
    connectionText.textContent = message;
  }

  function enumName(enumObject, value) {
    if (value == null) return "Not available";
    if (enumObject && typeof enumObject === "object") {
      const entry = Object.entries(enumObject).find(([, enumValue]) => enumValue === value);
      if (entry) return entry[0];
    }
    return String(value);
  }

  function getSafeFileName() {
    try {
      const rawUrl = Office.context.document && Office.context.document.url;
      if (!rawUrl) return "Not available from this host";

      let path = String(rawUrl).split(/[?#]/, 1)[0];
      try {
        path = new URL(path, window.location.href).pathname;
      } catch (_) {}

      const lastSegment = path.split(/[\\/]/).filter(Boolean).pop();
      if (!lastSegment) return "Not available from this host";
      try { return decodeURIComponent(lastSegment); }
      catch (_) { return lastSegment; }
    } catch (_) {
      return "Not available from this host";
    }
  }

  async function copyCurrentFileName() {
    if (!currentFileName) return;
    try {
      await navigator.clipboard.writeText(currentFileName);
      actionStatus.textContent = "File name copied.";
    } catch (_) {
      actionStatus.textContent = "Copy is unavailable in this Office host.";
    }
  }

  copyButton.addEventListener("click", copyCurrentFileName);

  function renderOfficeContext(info) {
    const host = info && info.host;
    const platform = info && info.platform;

    if (!host) {
      setConnection("error", "Office host not detected");
      hostName.textContent = "Open inside Word, Excel, or PowerPoint";
      platformName.textContent = "Browser preview";
      fileName.textContent = "No Office document is available";
      copyButton.disabled = true;
      return;
    }

    setConnection("connected", "Connected to Office");
    hostName.textContent = enumName(Office.HostType, host);
    platformName.textContent = enumName(Office.PlatformType, platform);
    currentFileName = getSafeFileName();
    fileName.textContent = currentFileName;
    copyButton.disabled = currentFileName === "Not available from this host";
  }

  if (!window.Office || typeof Office.onReady !== "function") {
    setConnection("error", "Office.js could not be loaded");
    hostName.textContent = "Office add-in runtime unavailable";
    platformName.textContent = "—";
    fileName.textContent = "Open this pane from an Office app";
    copyButton.disabled = true;
    return;
  }

  const startupTimer = window.setTimeout(() => {
    setConnection("error", "Office is taking too long to respond");
  }, 8000);

  Office.onReady((info) => {
    window.clearTimeout(startupTimer);
    renderOfficeContext(info);
  }).catch(() => {
    window.clearTimeout(startupTimer);
    setConnection("error", "Office initialization failed");
    hostName.textContent = "Office could not provide host information";
    platformName.textContent = "—";
    fileName.textContent = "Document content was not accessed";
    copyButton.disabled = true;
  });
})();
