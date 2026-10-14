(() => {
  "use strict";

  const compat = window.AdaThemeCompat;
  const DB_NAME = "ada-theme-library";
  const DB_VERSION = 1;
  const STORE_NAME = "themes";
  const MODE_KEY = "ada-theme-mode";
  const BUILTIN_KEY = "ada-builtin-theme";
  const ACTIVE_THEME_KEY = "ada-active-imported-theme";
  const SAFE_KEY = "ada-theme-safe-mode";
  const MAX_THEME_BYTES = 512 * 1024;
  const BUILTIN_THEMES = [
    { id: "ada-default", name: "Ada Default", description: "The standard Ada palette.", href: "bin/themes/ada-default.theme.css" },
    { id: "ada-midnight", name: "Midnight", description: "A cool, low-light reading palette.", href: "bin/themes/ada-midnight.theme.css" },
    { id: "ada-contrast", name: "High Contrast", description: "Sharper borders and clearer text separation.", href: "bin/themes/ada-contrast.theme.css" }
  ];

  let databasePromise;
  let installedThemes = [];
  let activeEditorId = null;
  let safeMode = new URLSearchParams(window.location.search).get("ada-theme-safe") === "1";
  let modePreference = "system";

  function randomId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `theme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("This browser does not support local theme storage."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open local theme storage."));
    });
    return databasePromise;
  }

  async function storeRequest(mode, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let request;
      if (mode === "readonly") request = store.getAll();
      else if (value && mode === "readwrite" && value.removeId) request = store.delete(value.removeId);
      else request = store.put(value);
      transaction.oncomplete = () => resolve(request && request.result);
      transaction.onerror = () => reject(transaction.error || new Error("Theme storage operation failed."));
      transaction.onabort = () => reject(transaction.error || new Error("Theme storage operation was cancelled."));
    });
  }

  function readPreference(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (_) { return fallback; }
  }

  function writePreference(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { return false; }
  }

  function resolvedMode(preference = modePreference) {
    if (preference === "light" || preference === "dark") return preference;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function announceThemeChange() {
    const mode = resolvedMode();
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.themePreference = modePreference;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const background = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      if (background) meta.setAttribute("content", background);
    }
    const lightCode = document.getElementById("adaHighlightLight");
    const darkCode = document.getElementById("adaHighlightDark");
    if (lightCode) lightCode.disabled = mode !== "light";
    if (darkCode) darkCode.disabled = mode !== "dark";
    window.dispatchEvent(new CustomEvent("ada-theme-change", { detail: { mode, preference: modePreference } }));
    renderModeButtons();
  }

  function renderModeButtons() {
    document.querySelectorAll("[data-ada-theme-mode]").forEach((button) => {
      const active = button.dataset.adaThemeMode === modePreference;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function safeModeActive() {
    return safeMode || readPreference(SAFE_KEY, "0") === "1";
  }

  function activeImportedTheme() {
    const id = readPreference(ACTIVE_THEME_KEY, "");
    return id ? installedThemes.find((record) => record.id === id && record.enabled) || null : null;
  }

  function importOnlyWarnings(warnings) {
    return (warnings || []).filter((warning) => warning.includes("@import") || warning.includes("Imported stylesheet not analyzed"));
  }

  function showStatus(message, isError = false) {
    const status = document.getElementById("adaThemeStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function styleIdFor(record) {
    return `ada-imported-theme-${String(record.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  }

  async function themeCss(record) {
    if (record.compiledCss !== undefined && record.compiledCss !== null) return record.compiledCss;
    if (record.href) {
      const response = await fetch(record.href, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Could not load built-in theme (${response.status}).`);
      return response.text();
    }
    return "";
  }

  async function applyThemeSheets() {
    document.querySelectorAll("[data-ada-dynamic-theme]").forEach((element) => element.remove());
    if (safeModeActive()) {
      document.documentElement.dataset.adaBuiltinTheme = "ada-default";
      document.documentElement.dataset.adaActiveTheme = "";
      showStatus("Safe appearance is on. Imported stylesheets are disabled.");
      return;
    }

    const builtinId = readPreference(BUILTIN_KEY, "ada-default");
    const builtin = BUILTIN_THEMES.find((item) => item.id === builtinId) || BUILTIN_THEMES[0];
    let activeTheme = activeImportedTheme();
    const activeId = readPreference(ACTIVE_THEME_KEY, "");
    if (activeId && !activeTheme) writePreference(ACTIVE_THEME_KEY, "");
    document.documentElement.dataset.adaBuiltinTheme = activeTheme ? "" : builtin.id;
    document.documentElement.dataset.adaActiveTheme = activeTheme ? activeTheme.id : "";
    const records = installedThemes
      .filter((record) => record.enabled)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

    try {
      if (!activeTheme && builtin.href) {
        const css = await themeCss(builtin);
        const style = document.createElement("style");
        style.id = "ada-selected-builtin-theme";
        style.dataset.adaDynamicTheme = "builtin";
        style.textContent = css;
        document.head.appendChild(style);
      }
      const loadOrder = activeTheme
        ? [activeTheme, ...records.filter((record) => record.id !== activeTheme.id)]
        : records;
      for (const record of loadOrder) {
        const style = document.createElement("style");
        style.id = styleIdFor(record);
        style.dataset.adaDynamicTheme = "imported";
        style.dataset.adaThemeId = record.id;
        style.textContent = record.compiledCss || record.originalCss || "";
        document.head.appendChild(style);
      }
      const overlays = records.filter((record) => record.id !== activeTheme?.id).length;
      showStatus(activeTheme
        ? `Active custom theme: ${activeTheme.name || activeTheme.fileName}. ${overlays} additional overlay${overlays === 1 ? "" : "s"} enabled.`
        : `Using ${builtin.name}. ${overlays} imported overlay${overlays === 1 ? "" : "s"} enabled.`, false);
    } catch (error) {
      showStatus(error.message || "A theme stylesheet could not be loaded.", true);
    }
    announceThemeChange();
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderBuiltinThemes() {
    const container = document.getElementById("adaBuiltinThemeList");
    if (!container) return;
    container.replaceChildren();
    const activeCustom = activeImportedTheme();
    const selected = activeCustom ? "" : safeModeActive() ? "ada-default" : readPreference(BUILTIN_KEY, "ada-default");
    for (const theme of BUILTIN_THEMES) {
      const card = makeElement("article", "ada-theme-card");
      card.dataset.adaBuiltinTheme = theme.id;
      const preview = makeElement("div", `ada-theme-swatch ada-theme-swatch--${theme.id.replace("ada-", "")}`);
      preview.setAttribute("aria-hidden", "true");
      const copy = makeElement("div", "ada-theme-card-copy");
      copy.append(makeElement("strong", "", theme.name), makeElement("p", "", theme.description));
      const isActive = selected === theme.id;
      const apply = makeElement("button", "ada-theme-action", isActive ? "Active" : "Use theme");
      apply.type = "button";
      apply.disabled = isActive;
      apply.setAttribute("aria-pressed", String(isActive));
      apply.addEventListener("click", async () => {
        const previousActive = readPreference(ACTIVE_THEME_KEY, "");
        const previousRecord = installedThemes.find((record) => record.id === previousActive);
        if (previousRecord) {
          previousRecord.enabled = false;
          await storeRequest("readwrite", previousRecord);
        }
        writePreference(ACTIVE_THEME_KEY, "");
        writePreference(BUILTIN_KEY, theme.id);
        await applyThemeSheets();
        renderAll();
      });
      card.append(preview, copy, apply);
      container.appendChild(card);
    }
  }

  function renderWarnings(record, card) {
    const warnings = Array.isArray(record.warnings) ? record.warnings : [];
    if (!warnings.length) return;
    const details = makeElement("details", "ada-theme-warnings");
    details.appendChild(makeElement("summary", "", `Compatibility report · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`));
    const list = makeElement("ul");
    for (const warning of warnings) list.appendChild(makeElement("li", "", warning));
    details.appendChild(list);
    card.appendChild(details);
  }

  function renderInstalledThemes() {
    const container = document.getElementById("adaInstalledThemeList");
    if (!container) return;
    container.replaceChildren();
    if (!installedThemes.length) {
      container.appendChild(makeElement("p", "ada-theme-empty", "No imported themes yet. Choose a .theme.css file to add one."));
      return;
    }

    for (const record of installedThemes.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const active = readPreference(ACTIVE_THEME_KEY, "") === record.id && Boolean(record.enabled);
      const card = makeElement("article", "ada-theme-card ada-installed-theme");
      const header = makeElement("div", "ada-installed-theme-header");
      const copy = makeElement("div", "ada-theme-card-copy");
      copy.appendChild(makeElement("strong", "", record.name || record.fileName || "Imported theme"));
      copy.appendChild(makeElement("p", "", [record.author, record.version && `v${record.version}`, record.format === "betterdiscord-css" ? "BetterDiscord translated" : "Ada CSS"].filter(Boolean).join(" · ")));
      if (record.description) copy.appendChild(makeElement("p", "ada-theme-description", record.description));
      header.appendChild(copy);
      const enabledControl = document.createElement("label");
      enabledControl.className = "ada-theme-enabled-control";
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = Boolean(record.enabled);
      enabled.disabled = safeModeActive();
      enabled.setAttribute("aria-label", active
        ? `Enable ${record.name || "theme"} as the active custom theme`
        : `Enable ${record.name || "theme"} as an overlay`);
      enabled.addEventListener("change", async () => {
        record.enabled = enabled.checked;
        if (!record.enabled && readPreference(ACTIVE_THEME_KEY, "") === record.id) writePreference(ACTIVE_THEME_KEY, "");
        await storeRequest("readwrite", record);
        installedThemes = await storeRequest("readonly");
        await applyThemeSheets();
        renderAll();
      });
      enabledControl.append(enabled, makeElement("span", "", active ? "Active stylesheet" : "Enable overlay"));
      header.appendChild(enabledControl);
      card.appendChild(header);

      if (record.translated) {
        const importedCount = Array.isArray(record.imports) ? record.imports.length : 0;
        const summary = makeElement("p", "ada-theme-translation-summary", `${record.translated.selectorCount || 0} selector rewrites · ${record.translated.variableCount || 0} variable rewrites · ${importedCount} imported stylesheet${importedCount === 1 ? "" : "s"} not analyzed · map ${record.mapVersion || "unknown"}`);
        card.appendChild(summary);
      }
      renderWarnings(record, card);

      const actions = makeElement("div", "ada-theme-actions");
      const activate = makeElement("button", `ada-theme-action ${active ? "" : "ada-theme-action--primary"}`, active && safeModeActive() ? "Selected (safe mode)" : active ? "Active custom theme" : "Use this theme");
      activate.type = "button";
      activate.disabled = active || safeModeActive();
      activate.setAttribute("aria-pressed", String(active));
      activate.addEventListener("click", async () => {
        const previousId = readPreference(ACTIVE_THEME_KEY, "");
        const previous = installedThemes.find((theme) => theme.id === previousId && theme.id !== record.id);
        if (previous) {
          previous.enabled = false;
          await storeRequest("readwrite", previous);
        }
        record.enabled = true;
        await storeRequest("readwrite", record);
        writePreference(ACTIVE_THEME_KEY, record.id);
        installedThemes = await storeRequest("readonly");
        await applyThemeSheets();
        renderAll();
      });
      const edit = makeElement("button", "ada-theme-action ada-theme-action--secondary", "Edit / map selectors");
      edit.type = "button";
      edit.addEventListener("click", () => openThemeEditor(record.id));
      const remove = makeElement("button", "ada-theme-action ada-theme-action--danger", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (readPreference(ACTIVE_THEME_KEY, "") === record.id) writePreference(ACTIVE_THEME_KEY, "");
        await storeRequest("readwrite", { removeId: record.id });
        installedThemes = await storeRequest("readonly");
        await applyThemeSheets();
        renderAll();
        showStatus(`${record.name || "Theme"} removed.`);
      });
      actions.append(activate, edit, remove);
      card.appendChild(actions);
      container.appendChild(card);
    }
  }

  function renderAll() {
    renderBuiltinThemes();
    renderInstalledThemes();
    renderModeButtons();
    const safeToggle = document.getElementById("adaThemeSafeToggle");
    if (safeToggle) safeToggle.textContent = safeModeActive() ? "Re-enable imported CSS" : "Disable imported CSS";
  }

  async function refreshThemeList() {
    try {
      installedThemes = await storeRequest("readonly") || [];
      for (const record of installedThemes) {
        if (record.mapVersion === compat.COMPATIBILITY_MAP_VERSION && Array.isArray(record.imports)) continue;
        const analysis = compat.translateBetterDiscordTheme(record.originalCss || "", {
          selectorMap: record.selectorMap || {},
          from: record.fileName
        });
        record.imports = analysis.imports || [];
        record.mapVersion = analysis.mapVersion;
        if (record.format === "betterdiscord-css") {
          record.compiledCss = analysis.css;
          record.warnings = analysis.warnings;
          record.translated = analysis.translated;
          record.metadata = analysis.metadata;
        } else {
          record.compiledCss = record.originalCss || "";
          record.warnings = importOnlyWarnings(analysis.warnings);
          record.translated = record.translated || { selectorCount: 0, variableCount: 0 };
        }
        await storeRequest("readwrite", record);
      }
      renderAll();
      await applyThemeSheets();
    } catch (error) {
      installedThemes = [];
      renderAll();
      showStatus(error.message || "Theme storage is unavailable.", true);
    }
  }

  function setMode(preference) {
    if (!["system", "light", "dark"].includes(preference)) return;
    modePreference = preference;
    writePreference(MODE_KEY, preference);
    announceThemeChange();
    showStatus(`Theme mode: ${preference === "system" ? `System (${resolvedMode()})` : preference}.`);
  }

  function openThemeDashboard() {
    const overlay = document.getElementById("adaThemeDashboard");
    if (!overlay) return;
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    refreshThemeList();
    requestAnimationFrame(() => document.getElementById("adaThemeClose")?.focus());
  }

  function closeThemeDashboard() {
    const overlay = document.getElementById("adaThemeDashboard");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    const desktopButton = document.getElementById("themeDashboardToolbarBtn");
    const focusTarget = desktopButton && desktopButton.getClientRects().length
      ? desktopButton
      : document.getElementById("mobOverflowBtn");
    focusTarget?.focus();
  }

  function openThemeEditor(id) {
    const record = installedThemes.find((theme) => theme.id === id);
    if (!record) return;
    activeEditorId = id;
    document.getElementById("adaThemeEditorName").textContent = record.name || record.fileName || "Imported theme";
    document.getElementById("adaThemeCssEditor").value = record.originalCss || "";
    document.getElementById("adaThemeSelectorMap").value = JSON.stringify(record.selectorMap || {}, null, 2);
    document.getElementById("adaThemeEditorPanel").hidden = false;
    document.getElementById("adaThemeCssEditor").focus();
  }

  function closeThemeEditor() {
    activeEditorId = null;
    document.getElementById("adaThemeEditorPanel").hidden = true;
  }

  async function saveThemeEditor() {
    const record = installedThemes.find((theme) => theme.id === activeEditorId);
    if (!record) return;
    const sourceCss = document.getElementById("adaThemeCssEditor").value;
    if (new TextEncoder().encode(sourceCss).length > MAX_THEME_BYTES) {
      showStatus("Theme exceeds the 512 KiB size limit.", true);
      return;
    }
    let selectorMap;
    try {
      selectorMap = JSON.parse(document.getElementById("adaThemeSelectorMap").value || "{}");
      if (!selectorMap || typeof selectorMap !== "object" || Array.isArray(selectorMap)) throw new Error("Mapping must be a JSON object.");
      if (Object.keys(selectorMap).length > 200) throw new Error("Use no more than 200 custom selector mappings per theme.");
      for (const [from, to] of Object.entries(selectorMap)) {
        if (typeof from !== "string" || typeof to !== "string" || from.length > 300 || to.length > 300) throw new Error("Each selector mapping must be a string pair of at most 300 characters.");
      }
    } catch (error) {
      showStatus(`Selector mappings are invalid: ${error.message}`, true);
      return;
    }

    try {
      const analysis = compat.translateBetterDiscordTheme(sourceCss, { selectorMap, from: record.fileName });
      const translated = record.format === "betterdiscord-css"
        ? analysis
        : { ...analysis, css: sourceCss, warnings: importOnlyWarnings(analysis.warnings), translated: { selectorCount: 0, variableCount: 0 } };
      record.originalCss = sourceCss;
      record.compiledCss = translated.css;
      record.selectorMap = selectorMap;
      record.warnings = translated.warnings;
      record.imports = translated.imports;
      record.metadata = translated.metadata;
      record.translated = translated.translated;
      record.mapVersion = translated.mapVersion;
      record.name = translated.metadata.name || record.name;
      await storeRequest("readwrite", record);
      installedThemes = await storeRequest("readonly");
      await applyThemeSheets();
      renderInstalledThemes();
      closeThemeEditor();
      showStatus("Theme saved and translated.");
    } catch (error) {
      showStatus(`Could not translate theme: ${error.message}`, true);
    }
  }

  async function importThemeFile(file) {
    if (!file) return;
    if (!/\.theme\.css$/i.test(file.name) && file.type !== "text/css") {
      showStatus("Choose a .theme.css or text/css file.", true);
      return;
    }
    if (file.size > MAX_THEME_BYTES) {
      showStatus("Theme exceeds the 512 KiB size limit.", true);
      return;
    }
    const sourceCss = await file.text();
    const translate = document.getElementById("adaThemeTranslateImport").checked;
    try {
      const parsed = compat.translateBetterDiscordTheme(sourceCss, { from: file.name });
      const record = {
        id: randomId(),
        fileName: file.name,
        name: parsed.metadata.name || file.name.replace(/\.theme\.css$/i, ""),
        author: parsed.metadata.author || "",
        description: parsed.metadata.description || "",
        version: parsed.metadata.version || "",
        source: parsed.metadata.source || parsed.metadata.website || "",
        format: translate ? "betterdiscord-css" : "ada-css",
        originalCss: sourceCss,
        compiledCss: translate ? parsed.css : sourceCss,
        selectorMap: {},
        warnings: translate ? parsed.warnings : importOnlyWarnings(parsed.warnings),
        imports: parsed.imports || [],
        translated: translate ? parsed.translated : { selectorCount: 0, variableCount: 0 },
        mapVersion: parsed.mapVersion,
        enabled: false,
        order: Date.now(),
        installedAt: new Date().toISOString()
      };
      await storeRequest("readwrite", record);
      installedThemes = await storeRequest("readonly");
      await applyThemeSheets();
      renderAll();
      showStatus(`${record.name} imported and left disabled. Choose “Use this theme” to replace the built-in palette, or enable it as an overlay.`);
    } catch (error) {
      showStatus(`Could not import theme: ${error.message}`, true);
    }
  }

  async function toggleSafeMode() {
    const next = !safeModeActive();
    safeMode = next;
    writePreference(SAFE_KEY, next ? "1" : "0");
    if (!next) {
      const url = new URL(window.location.href);
      url.searchParams.delete("ada-theme-safe");
      window.history.replaceState(null, "", url);
    }
    await applyThemeSheets();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const storedMode = readPreference(MODE_KEY, "system");
    modePreference = ["system", "light", "dark"].includes(storedMode) ? storedMode : "system";
    announceThemeChange();
    renderModeButtons();
    refreshThemeList();

    document.querySelectorAll("[data-ada-theme-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.adaThemeMode));
    });
    document.getElementById("adaThemeFileInput")?.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      try { await importThemeFile(file); }
      finally { event.target.value = ""; }
    });
    document.getElementById("adaThemeClose")?.addEventListener("click", closeThemeDashboard);
    document.getElementById("adaThemeDashboard")?.addEventListener("click", (event) => {
      if (event.target.id === "adaThemeDashboard") closeThemeDashboard();
    });
    document.getElementById("adaThemeEditorCancel")?.addEventListener("click", closeThemeEditor);
    document.getElementById("adaThemeEditorSave")?.addEventListener("click", saveThemeEditor);
    document.getElementById("adaThemeSafeToggle")?.addEventListener("click", toggleSafeMode);
    document.addEventListener("keydown", (event) => {
      const overlay = document.getElementById("adaThemeDashboard");
      const dashboardOpen = overlay?.classList.contains("active");
      if (event.key === "Escape" && dashboardOpen) closeThemeDashboard();
      if (event.key === "Tab" && dashboardOpen) {
        const focusable = [...overlay.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)')]
          .filter((element) => element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.ctrlKey && event.altKey && event.shiftKey && event.key.toLowerCase() === "s") {
        writePreference(SAFE_KEY, "1");
        window.location.reload();
      }
    });

    if (window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const updateSystemMode = () => { if (modePreference === "system") announceThemeChange(); };
      if (media.addEventListener) media.addEventListener("change", updateSystemMode);
      else if (media.addListener) media.addListener(updateSystemMode);
    }
  });

  window.openThemeDashboard = openThemeDashboard;
  window.closeThemeDashboard = closeThemeDashboard;
})();
