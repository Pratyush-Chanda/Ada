const listView = document.getElementById("listView");
const pathNav = document.getElementById("pathNav");
const splash = document.getElementById("splash");
const contextMenu = document.getElementById("contextMenu");
const previewContainer = document.getElementById("previewContainer");
const mobilePreview = document.getElementById("mobilePreview");
const mobilePreviewContent = document.getElementById("mobilePreviewContent");
const mobilePreviewTitle = document.getElementById("mobilePreviewTitle");
const statusEl = document.getElementById("status");
const fileSearchInput = document.getElementById("fileSearchInput");
const clearFileSearchButton = document.getElementById("clearFileSearch");
const fileSearchShortcut = document.querySelector(".toolbar-search-shortcut");
const fileDrawer = document.getElementById("fileDrawer");
const fileDrawerToggle = document.getElementById("fileDrawerToggle");
const fileDrawerBackdrop = document.getElementById("fileDrawerBackdrop");
const workspaceEmptyState = document.getElementById("workspaceEmptyState");
if (fileSearchShortcut && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
  fileSearchShortcut.textContent = "⌘ K";
}

let currentNode = null;
let rootNode = null;
let fileSearchIndex = [];
let pathHistory = [];
let recentFilesOpen = false;
const RECENT_FILES_STORAGE_KEY = "ada-recent-files-v1";
const MAX_RECENT_FILES = 8;
let selected = null;
let previewId = 0;
const windows = {};
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
let updateDismissed = false;

let windowZIndex = 2000;
const windowRestoreBounds = new WeakMap();

function focusWindow(id) {
  const win = windows[id];
  if (!win || !win.isConnected || win.style.display === "none") return;
  Object.values(windows).forEach((other) => other.classList.remove("is-focused"));
  win.classList.add("is-focused");
  win.style.zIndex = String(++windowZIndex);
}

function addWindowResizeHandles(win) {
  if (!win || isMobile || window.matchMedia("(max-width: 768px)").matches) return;
  ["n", "s", "e", "w", "ne", "nw", "se", "sw"].forEach((direction) => {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `window-resize-handle window-resize-${direction}`;
    handle.setAttribute("aria-label", `Resize window ${direction}`);
    handle.title = `Resize ${direction}`;
    handle.addEventListener("pointerdown", (event) => {
      if (win.classList.contains("fullscreen")) return;
      event.preventDefault();
      event.stopPropagation();
      handle.focus({ preventScroll: true });
      focusWindow(win.dataset.id);
      const rect = win.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        let width = rect.width;
        let height = rect.height;
        let left = rect.left;
        let top = rect.top;
        if (direction.includes("e")) width = Math.max(320, rect.width + dx);
        if (direction.includes("w")) { width = Math.max(320, rect.width - dx); left = rect.right - width; }
        if (direction.includes("s")) height = Math.max(200, rect.height + dy);
        if (direction.includes("n")) { height = Math.max(200, rect.height - dy); top = rect.bottom - height; }
        Object.assign(win.style, { width: `${width}px`, height: `${height}px`, left: `${left}px`, top: `${top}px` });
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        window.removeEventListener("blur", onUp);
        win.classList.remove("is-resizing");
      };
      win.classList.add("is-resizing");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      window.addEventListener("blur", onUp, { once: true });
    });
    handle.addEventListener("keydown", (event) => {
      const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
      if (!delta || win.classList.contains("fullscreen")) return;
      event.preventDefault();
      const rect = win.getBoundingClientRect();
      const width = Math.max(320, rect.width + delta[0]);
      const height = Math.max(200, rect.height + delta[1]);
      const left = direction.includes("w") ? rect.right - width : rect.left;
      const top = direction.includes("n") ? rect.bottom - height : rect.top;
      Object.assign(win.style, { width: `${width}px`, height: `${height}px`, left: `${left}px`, top: `${top}px` });
      focusWindow(win.dataset.id);
    });
    win.appendChild(handle);
  });
}

function registerPreviewWindow(win) {
  if (!win) return;
  addWindowResizeHandles(win);
  win.classList.add("is-entering");
  requestAnimationFrame(() => {
    win.classList.remove("is-entering");
    focusWindow(win.dataset.id);
  });
}

function animateWindowOut(win, className, finish) {
  if (!win || win.classList.contains(className)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finish();
    return;
  }
  win.classList.add(className);
  setTimeout(() => {
    if (!win.isConnected) return;
    win.classList.remove(className);
    finish();
  }, 160);
}

previewContainer?.addEventListener("pointerdown", (event) => {
  const win = event.target.closest(".floating-window");
  if (win) focusWindow(win.dataset.id);
});

function featherSvg(name, className = "") {
  const icon = window.feather?.icons?.[name];
  if (!icon) return `<span class="icon-fallback ${className}" aria-hidden="true">•</span>`;
  return icon.toSvg({ class: `ada-icon ${className}`.trim(), "aria-hidden": "true", "stroke-width": 1.8 });
}

function setFileDrawerOpen(isOpen) {
  fileDrawer?.classList.toggle("is-open", isOpen);
  fileDrawerToggle?.setAttribute("aria-expanded", String(isOpen));
  fileDrawerBackdrop?.classList.toggle("is-visible", isOpen && window.matchMedia("(max-width: 768px)").matches);
}

fileDrawerToggle?.addEventListener("click", () => setFileDrawerOpen(!fileDrawer?.classList.contains("is-open")));
document.getElementById("fileDrawerClose")?.addEventListener("click", () => setFileDrawerOpen(false));
fileDrawerBackdrop?.addEventListener("click", () => setFileDrawerOpen(false));
document.getElementById("openFilesFromWorkspace")?.addEventListener("click", () => setFileDrawerOpen(true));
if (window.matchMedia("(max-width: 768px)").matches) setFileDrawerOpen(false);

function syncWorkspaceEmptyState() {
  const hasVisibleWindow = Object.values(windows).some((win) => win?.isConnected && win.style.display !== "none");
  if (workspaceEmptyState) workspaceEmptyState.hidden = hasVisibleWindow;
  renderWorkspaceRecentFiles();
}

// Runtime config loaded from /api/config (populated from Vercel env vars).
// Fallbacks keep the app functional when running outside Vercel (e.g. local dev).
let appConfig = {
  GITHUB_REPO:   '',
  GITHUB_BRANCH: 'main',
  APP_URL:       '',
  GITPAGE_URL:   '',
};

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      appConfig = { ...appConfig, ...data };
    }
  } catch (e) {
    console.warn('fetchConfig failed — using defaults:', e);
  }
}

const EXCLUDED_ROOT_FILES = [
  "fmtree.py", "files.json", "index.html", "favicon.png", "tree.py", "autocommit.ps1"
];

const FILE_ICONS = {
  folder: "folder",
  md: "file-text",
  markdown: "file-text",
  pdf: "file",
  txt: "file-text",
  json: "code",
  js: "code",
  html: "code",
  css: "code",
  py: "code",
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  svg: "image",
  doc: "file-text", docx: "file-text",
  xls: "grid", xlsx: "grid",
  ppt: "monitor", pptx: "monitor",
  default: "file"
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then(() => {
    console.log("Service Worker registered");
  }).catch(err => {
    console.error("SW registration failed:", err);
  });
}

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function dismissUpdateNotice() {
  document.getElementById("updateNotice").style.display = "none";
  updateDismissed = true;
}

function showStatus(message, isLoading = false) {
  statusEl.innerHTML = isLoading ? `<span class="loader"></span>${message}` : message;
  statusEl.classList.add("visible");
  setTimeout(() => {
    statusEl.classList.remove("visible");
  }, 3000);
}

// Function to automatically fetch and generate the file tree
async function generateFileTree() {
  showStatus("Generating file tree...", true);
  
  try {
    // This would be a server-side operation in reality
    // For this example, we'll just add a timestamp to show the concept
    const timestamp = new Date().toISOString();
    showStatus(`Tree generated at: ${timestamp}`);
    
    // In a real implementation, you would call your backend API to regenerate files.json
    // For now, we'll just refresh what we have
    await fetchTree();
  } catch (error) {
    showStatus("Failed to generate tree: " + error.message);
  }
}

function refreshFiles() {
  fetchTree();
  showStatus("Refreshing files list…");
}

async function fetchTree() {
  showStatus("Loading files...", true);

  try {
    const res = await fetch("files.json?" + new Date().getTime());
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }

    const tree = await res.json();
    const raw = JSON.stringify(tree, Object.keys(tree).sort());

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    lastHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    initialLoadComplete = true;

    try {
      lastCommit = await fetchLatestCommit();
    } catch (e) {
      console.warn("Failed to fetch initial commit:", e);
    }

    rootNode = tree;
    fileSearchIndex = window.AdaFileSearch.buildIndex(tree, {
      excludedRootFiles: EXCLUDED_ROOT_FILES
    });
    currentNode = tree;
    pathHistory = [];
    renderFolder(tree);
    updatePathNav();
    renderWorkspaceRecentFiles();

    const fontPromise = new Promise((resolve) => {
  const testSpan = document.createElement("span");
  testSpan.textContent = "A quick brown fox jumps";
  testSpan.style.position = "absolute";
  testSpan.style.visibility = "hidden";
  testSpan.style.fontSize = "32px";
  testSpan.style.fontFamily = "sans-serif";

  document.body.appendChild(testSpan);
  const baseWidth = testSpan.offsetWidth;

  testSpan.style.fontFamily = '"Roboto", sans-serif';

  requestAnimationFrame(() => {
    const testWidth = testSpan.offsetWidth;
    document.body.removeChild(testSpan);

    if (testWidth !== baseWidth) {
      console.log("Roboto is present.");
    } else {
      console.warn("Roboto not rendered. Falling back.");
      showStatus("Roboto font not available. Falling back to system font.");
    }

    resolve(); // Always resolve — don't block the splash or file loading
  });
});


    Promise.all([
      fontPromise,
      new Promise(res => setTimeout(res, 500))
    ]).then(() => {
      splash.style.opacity = 0;
      setTimeout(() => {
        splash.style.display = 'none';
      }, 600);

      if (!window.updateCheckStarted) {
        window.updateCheckStarted = true;
        setTimeout(() => setInterval(checkForUpdate, 20000), 5000);
      }

      showStatus("Files loaded successfully!");
    }).catch(error => {
      showStatus("Error loading files: " + error.message);
      console.error("Error fetching tree:", error);
    });

  } catch (error) {
    showStatus("Failed to generate tree: " + error.message);
    console.error(error);
    // Ensure splash is always dismissed even on fatal error
    splash.style.opacity = 0;
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }
}


	

function getFileIcon(file) {
  if (file.type === "folder") return featherSvg(FILE_ICONS.folder);
  
  const ext = file.name.split('.').pop().toLowerCase();
  return featherSvg(FILE_ICONS[ext] || FILE_ICONS.default);
}

function getFileTypeClass(file) {
  if (file.type === "folder") return "folder";

  const ext = file.name.split('.').pop().toLowerCase();

  if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return "image";
  }

  return ext; // returns 'py', 'html', 'css', etc.
}

function updateSearchClearButton() {
  if (clearFileSearchButton) clearFileSearchButton.hidden = !fileSearchInput.value;
}

function clearFileSearch(restoreFolder = true) {
  if (!fileSearchInput) return;
  fileSearchInput.value = "";
  updateSearchClearButton();
  if (restoreFolder && currentNode) renderFolder(currentNode);
}

function setRecentFilesOpen(isOpen) {
  recentFilesOpen = isOpen;
  const toggle = document.getElementById("recentFilesToggle");
  if (toggle) toggle.setAttribute("aria-expanded", String(isOpen));
}

function readRecentFiles() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_FILES_STORAGE_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((item) => item && typeof item.path === "string" && typeof item.name === "string")
        .slice(0, MAX_RECENT_FILES)
      : [];
  } catch (_) {
    return [];
  }
}

function recordRecentFile(path, name) {
  if (!path || !name) return;
  const recent = readRecentFiles().filter((item) => item.path !== path);
  recent.unshift({ path, name, openedAt: Date.now() });
  try {
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_FILES)));
  } catch (_) {
    // Recent navigation is optional; private browsing or storage limits should not block previews.
  }
  renderWorkspaceRecentFiles();
  if (recentFilesOpen) renderRecentFiles();
}

function getRecentFileEntries() {
  const saved = readRecentFiles();
  if (!rootNode) return [];
  const entries = saved.map((recent) => ({
    recent,
    result: fileSearchIndex.find((entry) => entry.node.type === "file" && entry.node.path === recent.path)
  })).filter((item) => item.result);

  if (entries.length !== saved.length) {
    try {
      localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(entries.map((item) => item.recent)));
    } catch (_) {}
  }
  return entries;
}

function clearRecentFiles() {
  try { localStorage.removeItem(RECENT_FILES_STORAGE_KEY); } catch (_) {}
  renderWorkspaceRecentFiles();
  if (recentFilesOpen) renderRecentFiles();
}

function openRecentFile(path) {
  const entry = fileSearchIndex.find((item) => item.node.type === "file" && item.node.path === path);
  if (!entry) {
    showStatus("This recent file is no longer available.");
    renderWorkspaceRecentFiles();
    return;
  }
  recordRecentFile(entry.node.path, entry.node.name);
  openPreview(entry.node.path, entry.node.name);
}

function renderWorkspaceRecentFiles() {
  const list = document.getElementById("workspaceRecentFiles");
  const clearButton = document.getElementById("workspaceClearRecents");
  if (!list) return;

  const entries = getRecentFileEntries();
  if (clearButton) clearButton.disabled = entries.length === 0;
  list.replaceChildren();

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "workspace-recent-empty";
    empty.textContent = "No recent files yet.";
    list.appendChild(empty);
    return;
  }

  for (const { recent, result } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-recent-item";
    button.setAttribute("aria-label", `Open recently viewed file ${result.node.name || recent.name}, ${result.path}`);

    const icon = document.createElement("span");
    icon.className = "workspace-recent-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = getFileIcon(result.node);

    const copy = document.createElement("span");
    copy.className = "workspace-recent-copy";
    const name = document.createElement("span");
    name.className = "workspace-recent-name";
    name.textContent = result.node.name || recent.name;
    const path = document.createElement("span");
    path.className = "workspace-recent-path";
    path.textContent = result.path;
    copy.append(name, path);

    const openIcon = document.createElement("span");
    openIcon.className = "workspace-recent-open";
    openIcon.setAttribute("aria-hidden", "true");
    openIcon.innerHTML = featherSvg("arrow-up-right");
    button.append(icon, copy, openIcon);
    button.addEventListener("click", () => openRecentFile(result.path));
    list.appendChild(button);
  }
}

function toggleRecentFiles() {
  if (recentFilesOpen) {
    setRecentFilesOpen(false);
    if (currentNode) renderFolder(currentNode);
    return;
  }
  clearFileSearch(false);
  setRecentFilesOpen(true);
  setFileDrawerOpen(true);
  renderRecentFiles();
}

function renderRecentFiles() {
  const entries = getRecentFileEntries();
  listView.replaceChildren();
  selected = null;
  const heading = document.createElement("div");
  heading.className = "recent-list-heading";
  const summary = document.createElement("div");
  summary.className = "search-results-meta";
  summary.setAttribute("role", "status");
  summary.textContent = entries.length
    ? `Recently opened · ${entries.length} ${entries.length === 1 ? "file" : "files"}`
    : "Recently opened · no files yet";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "recent-clear-all";
  clearButton.disabled = entries.length === 0;
  clearButton.innerHTML = `${featherSvg("trash-2")}<span>Clear all</span>`;
  clearButton.addEventListener("click", clearRecentFiles);
  heading.append(summary, clearButton);
  listView.appendChild(heading);

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state search-empty-state";
    empty.innerHTML = `<div class="icon" aria-hidden="true">${featherSvg("clock")}</div><h3>No recent files</h3><p>Files you preview will appear here for quick access on this device.</p>`;
    listView.appendChild(empty);
    return;
  }

  for (const { recent, result } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.setAttribute("aria-label", `Open recently viewed file ${result.node.name}, ${result.path}`);

    const icon = document.createElement("span");
    icon.className = "search-result-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = getFileIcon(result.node);

    const copy = document.createElement("span");
    copy.className = "search-result-copy";
    const name = document.createElement("span");
    name.className = "search-result-name";
    name.textContent = result.node.name || recent.name;
    const path = document.createElement("span");
    path.className = "search-result-path";
    path.textContent = result.path;
    copy.append(name, path);

    const kind = document.createElement("span");
    kind.className = "search-result-kind";
    kind.textContent = "Recent";
    button.append(icon, copy, kind);
    button.addEventListener("click", () => openSearchResult(result));
    listView.appendChild(button);
  }
}

function renderSearchResults() {
  const query = fileSearchInput.value.trim();
  const { items, total } = window.AdaFileSearch.search(fileSearchIndex, query, 100);
  listView.replaceChildren();
  selected = null;

  const summary = document.createElement("div");
  summary.className = "search-results-meta";
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  summary.textContent = total === 0
    ? `No matches for “${query}”`
    : `${total} ${total === 1 ? "match" : "matches"}${total > items.length ? ` · showing first ${items.length}` : ""}`;
  listView.appendChild(summary);

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state search-empty-state";
    empty.innerHTML = `<div class="icon" aria-hidden="true">${featherSvg("search")}</div><h3>No matching files or folders</h3><p>Try a shorter name or a word from the folder path.</p>`;
    listView.appendChild(empty);
    return;
  }

  for (const result of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.setAttribute("aria-label", `${result.node.type}: ${result.node.name}, ${result.path}`);

    const icon = document.createElement("span");
    icon.className = "search-result-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = getFileIcon(result.node);

    const copy = document.createElement("span");
    copy.className = "search-result-copy";
    const name = document.createElement("span");
    name.className = "search-result-name";
    name.textContent = result.node.name;
    const path = document.createElement("span");
    path.className = "search-result-path";
    path.textContent = result.path;
    copy.append(name, path);

    const kind = document.createElement("span");
    kind.className = "search-result-kind";
    kind.textContent = result.node.type === "folder" ? "Folder" : "File";
    button.append(icon, copy, kind);
    button.addEventListener("click", () => openSearchResult(result));
    listView.appendChild(button);
  }
}

function openSearchResult(result) {
  const isFolder = result.node.type === "folder";
  currentNode = isFolder ? result.node : result.parent;
  pathHistory = isFolder ? [...result.ancestors] : result.ancestors.slice(0, -1);
  clearFileSearch(false);
  renderFolder(currentNode);
  updatePathNav();

  if (!isFolder) {
    const row = [...listView.querySelectorAll(".file-item")]
      .find((item) => item._childData === result.node);
    if (row) {
      row.classList.add("selected");
      selected = result.node;
      handlePreview();
    }
  }
}

function focusFileSearch() {
  fileSearchInput?.focus();
  fileSearchInput?.select();
}

fileSearchInput?.addEventListener("input", () => {
  setRecentFilesOpen(false);
  updateSearchClearButton();
  if (fileSearchInput.value.trim()) setFileDrawerOpen(true);
  if (fileSearchInput.value.trim()) renderSearchResults();
  else if (currentNode) renderFolder(currentNode);
});

fileSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (fileSearchInput.value) {
      clearFileSearch();
      event.preventDefault();
    }
  } else if (event.key === "ArrowDown") {
    listView.querySelector(".search-result")?.focus();
    event.preventDefault();
  } else if (event.key === "Enter") {
    listView.querySelector(".search-result")?.click();
    event.preventDefault();
  }
});

listView.addEventListener("keydown", (event) => {
  if (!(event.target instanceof Element)) return;
  const results = [...listView.querySelectorAll(".search-result")];
  const index = results.indexOf(event.target.closest(".search-result"));
  if (index < 0) return;

  if (event.key === "ArrowDown") {
    results[Math.min(index + 1, results.length - 1)]?.focus();
    event.preventDefault();
  } else if (event.key === "ArrowUp") {
    if (index === 0) fileSearchInput?.focus();
    else results[index - 1]?.focus();
    event.preventDefault();
  }
});

clearFileSearchButton?.addEventListener("click", () => {
  clearFileSearch();
  focusFileSearch();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && fileDrawer?.classList.contains("is-open") && window.matchMedia("(max-width: 768px)").matches) {
    setFileDrawerOpen(false);
    event.preventDefault();
    return;
  }
  const target = event.target;
  const isEditable = target instanceof HTMLElement
    && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && (!isEditable || target === fileSearchInput)) {
    event.preventDefault();
    focusFileSearch();
  } else if (event.key === "Escape" && fileSearchInput?.value && target !== fileSearchInput) {
    clearFileSearch();
  } else if (event.key === "Escape" && recentFilesOpen) {
    setRecentFilesOpen(false);
    if (currentNode) renderFolder(currentNode);
    event.preventDefault();
  } else if (event.key === "/" && !isEditable && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    focusFileSearch();
  }
});


function renderFolder(node) {
  if (!node) return;
  setRecentFilesOpen(false);
  if (fileSearchInput?.value.trim()) {
    renderSearchResults();
    return;
  }
  listView.innerHTML = "";
  selected = null;
  
  const children = (node.children || []).filter(item => {
    // Exclude .github/ folder
    if (item.type === "folder" && item.name === ".github") return false;
    // Exclude internal waiting-list folder from public browser
    if (pathHistory.length === 0 && item.type === "folder" && item.name === "waiting-list") return false;
    // Fix #6: exclude system files only at root level (pathHistory empty = we are at root)
    if (pathHistory.length === 0 && item.type === "file" && EXCLUDED_ROOT_FILES.includes(item.name)) return false;
    return true;
  });
  
  // Sort folders first, then files alphabetically
  children.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === "folder" ? -1 : 1;
  });

  if (children.length === 0) {
    listView.innerHTML = `
      <div class="empty-state">
        <div class="icon" aria-hidden="true">${featherSvg("folder")}</div>
        <h3>This folder is empty</h3>
        <p>No files or folders to display</p>
      </div>
    `;
    return;
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const item = document.createElement("div");
    item.className = "file-item";
    item.setAttribute("data-ada-component", "file-entry");
    item.setAttribute("data-index", i);
    // Fix #4 prep: store child reference so downloadFile can access it directly
    item._childData = child;
    
    const fileIcon = getFileIcon(child);
    const fileTypeClass = getFileTypeClass(child);
    
    item.innerHTML = `
      <div class="file-icon" data-ada-component="file-icon" data-type="${fileTypeClass}">${fileIcon}</div>
      <div class="file-name" data-ada-component="file-name">${child.name}</div>
      <div class="file-actions" data-ada-component="file-actions">
        ${child.type === "file" ? `
          <div class="file-action" data-ada-component="file-action" onclick="previewFile(event, ${i})" title="Preview ${child.name}" aria-label="Preview ${child.name}">${featherSvg("eye")}</div>
          <div class="file-action" data-ada-component="file-action" onclick="downloadFile(event, ${i})" title="Download ${child.name}" aria-label="Download ${child.name}">${featherSvg("download")}</div>
          ${isAdmin() ? `<div class="file-action file-action--delete" onclick="deleteFile(event, ${i})" title="Delete file" aria-label="Delete ${child.name}">${featherSvg("trash-2")}</div>` : ''}
        ` : ''}
      </div>
      ${child.type === "file" ? `<div class="file-action-mob" onclick="openMobFileSheet(event, ${i})" aria-label="More file actions">${featherSvg("more-horizontal")}</div>` : ''}
    `;

    item.onclick = (e) => {
      // Clear previous selection
      document.querySelectorAll('.file-item.selected').forEach(el => 
        el.classList.remove('selected')
      );
      
      // Set new selection
      item.classList.add('selected');
      selected = child;
      
      // Handle single click to open
      if (child.type === "folder") {
        pathHistory.push(currentNode);
        currentNode = child;
        renderFolder(child);
        updatePathNav();
      } else {
        // For files, open preview immediately (single click behavior)
        if (!e.target.closest('.file-action')) {
          handlePreview();
        }
      }
    };
    
    item.oncontextmenu = e => {
      e.preventDefault();
      // Clear previous selection
      document.querySelectorAll('.file-item.selected').forEach(el => 
        el.classList.remove('selected')
      );
      
      // Set new selection
      item.classList.add('selected');
      selected = child;
      showContextMenu(e.pageX, e.pageY);
    };

    listView.appendChild(item);
    
    // Add a small delay between each item animation
    item.style.animationDelay = `${i * 30}ms`;
  }
}

function startDrag(e, id) {
  const el = windows[id];
  if (!el || el.classList.contains("fullscreen") || e.button !== 0 || e.target.closest(".buttons, .window-resize-handle")) return;
  e.preventDefault();
  focusWindow(id);

  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = parseInt(el.style.left, 10) || 0;
  const startTop = parseInt(el.style.top, 10) || 0;

  function onMouseMove(ev) {
    el.style.left = startLeft + (ev.clientX - startX) + "px";
    el.style.top = startTop + (ev.clientY - startY) + "px";
  }

  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function updatePathNav() {
  pathNav.replaceChildren();
  pathNav.setAttribute("aria-label", "Folder path");

  const addSeparator = () => {
    const separator = document.createElement("span");
    separator.className = "path-separator";
    separator.setAttribute("aria-hidden", "true");
    separator.textContent = "/";
    pathNav.appendChild(separator);
  };

  const rootButton = document.createElement("button");
  rootButton.type = "button";
  rootButton.className = "path-segment path-crumb-button";
  rootButton.setAttribute("aria-label", "Go to Ada root");
  rootButton.title = "Ada root";
  rootButton.innerHTML = `${featherSvg("home")}<span class="visually-hidden">Ada root</span>`;
  rootButton.addEventListener("click", goToRoot);
  pathNav.appendChild(rootButton);

  pathHistory.forEach((node, index) => {
    addSeparator();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "path-segment path-crumb-button";
    button.textContent = node.name;
    button.setAttribute("aria-label", `Open folder ${node.name}`);
    button.addEventListener("click", () => goToPath(index));
    pathNav.appendChild(button);
  });

  if (currentNode) {
    addSeparator();
    const current = document.createElement("span");
    current.className = "path-segment path-crumb-current";
    current.setAttribute("aria-current", "page");
    current.textContent = currentNode.name;
    pathNav.appendChild(current);
  }

  requestAnimationFrame(() => { pathNav.scrollLeft = pathNav.scrollWidth; });
}

function goToRoot() {
  clearFileSearch(false);
  fetchTree();
}

function goToPath(index) {
  if (index < 0 || index >= pathHistory.length) return;
  clearFileSearch(false);
  currentNode = pathHistory[index];
  pathHistory = pathHistory.slice(0, index);
  renderFolder(currentNode);
  updatePathNav();
}

function goUp() {
  if (pathHistory.length > 0) {
    clearFileSearch(false);
    currentNode = pathHistory.pop();
    renderFolder(currentNode);
    updatePathNav();
  }
}

function previewFile(e, index) {
  e.stopPropagation();
  const items = document.querySelectorAll('.file-item');
  if (index >= 0 && index < items.length) {
    // item.click() sets selected AND opens preview via its own onclick handler
    items[index].click();
  }
}

function downloadFile(e, index) {
  e.stopPropagation();
  const items = document.querySelectorAll('.file-item');
  if (index >= 0 && index < items.length) {
    // Fix #4: set selection directly using stored _childData — no click() to avoid opening a preview
    document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    items[index].classList.add('selected');
    selected = items[index]._childData;
    handleDownload();
  }
}

let _pendingDeletePath = null;
let _pendingDeleteName = null;

function deleteFile(e, index) {
  e.stopPropagation();
  if (!isAdmin()) return;
  const items = document.querySelectorAll('.file-item');
  if (index < 0 || index >= items.length) return;
  const child = items[index]._childData;
  _pendingDeletePath = child.path;
  _pendingDeleteName = child.name;

  if (isMobile) {
    document.getElementById('deleteMobileMsg').textContent =
      `"${child.name}" will be permanently removed from the repository.`;
    const o = document.getElementById('deleteMobileOverlay');
    o.style.display = 'flex';
    requestAnimationFrame(() => o.classList.add('active'));
  } else {
    document.getElementById('deleteConfirmMsg').textContent =
      `"${child.name}" will be permanently removed from the repository. This cannot be undone.`;
    document.getElementById('deleteConfirm').style.display = 'flex';
  }
}

function cancelDeleteFile() {
  _pendingDeletePath = null;
  _pendingDeleteName = null;
  document.getElementById('deleteConfirm').style.display = 'none';
  const o = document.getElementById('deleteMobileOverlay');
  o.classList.remove('active');
  setTimeout(() => { o.style.display = 'none'; }, 380);
}

async function confirmDeleteFile() {
  if (!_pendingDeletePath || !_pendingDeleteName) return;
  const path = _pendingDeletePath;
  const name = _pendingDeleteName;
  cancelDeleteFile();
  showStatus(`Deleting "${name}"…`, true);
  const getRes = await ghProxy('getFile', { path });
  if (!getRes.ok || !getRes.data.sha) {
    showStatus(`✗ Could not retrieve file info: ${getRes.error || 'file not found'}`);
    return;
  }
  const delRes = await ghProxy('deleteFile', { path, sha: getRes.data.sha, message: `Delete: ${path}` });
  if (delRes.ok) {
    showStatus(`✓ "${name}" deleted.`);
    fetchTree();
  } else {
    showStatus(`✗ Delete failed: ${delRes.error}`);
  }
}

function closeWindow(id) {
  const win = windows[id];
  if (win && !win.classList.contains("is-closing")) {
    animateWindowOut(win, "is-closing", () => {
      if (windows[id] !== win) return;
      win.remove();
      delete windows[id];
      syncWorkspaceEmptyState();
    });
  }
}

function minimizeWindow(id) {
  const win = windows[id];
  if (win && win.style.display !== "none") {
    animateWindowOut(win, "is-minimizing", () => {
      if (windows[id] !== win) return;
      win.style.display = "none";
      syncWorkspaceEmptyState();
    });
  }
}

function toggleFullscreen(id, forceFull = false) {
  const w = windows[id];
  if (!w) return;

  const isFullscreen = w.classList.contains("fullscreen");

  if (forceFull && isFullscreen) return;

  w.classList.add("is-geometry-transitioning");
  if (isFullscreen) {
    w.classList.remove("fullscreen");
    const previousBounds = windowRestoreBounds.get(w);
    if (previousBounds) Object.assign(w.style, previousBounds);
    windowRestoreBounds.delete(w);
  } else {
    windowRestoreBounds.set(w, { top: w.style.top, left: w.style.left, width: w.style.width, height: w.style.height });
    w.classList.add("fullscreen");
  }
  focusWindow(id);
  setTimeout(() => w.classList.remove("is-geometry-transitioning"), 220);
}

/*
 * The following preview/file handlers intentionally remain Ada-owned. The window layer
 * wraps these flows; it does not replace their file routing or rendering behavior.
 */


function showContextMenu(x, y) {
  contextMenu.style.top = y + 'px';
  contextMenu.style.left = x + 'px';
  contextMenu.style.display = 'flex';
}

function handlePreview() {
  if (selected && selected.type === "file") {
    recordRecentFile(selected.path, selected.name);
    isMobile
      ? openMobilePreview(selected.path, selected.name)
      : openPreview(selected.path, selected.name);
  }
  contextMenu.style.display = 'none';
}

function handleDownload() {
  if (selected && selected.type === "file") {
    const a = document.createElement("a");
    a.href = selected.path;
    a.download = selected.name;
    a.click();
    showStatus(`Downloading: ${selected.name}`);
  }
  contextMenu.style.display = 'none';
}

function openMobilePreview(path, filename) {
  mobilePreviewTitle.textContent = filename;
  fetchFileContent(path, filename, mobilePreviewContent);
  mobilePreview.style.display = "flex";
  if (window.matchMedia("(max-width: 768px)").matches) setFileDrawerOpen(false);
}

function closeMobilePreview() {
  mobilePreview.style.display = "none";
  mobilePreviewContent.innerHTML = "";
}

function restoreExistingPreview(path) {
  const match = Object.entries(windows).find(([, win]) => win?.isConnected && win.dataset.filePath === path);
  if (!match) return false;

  const [id, win] = match;
  if (isMobile) {
    for (const [otherId, otherWin] of Object.entries(windows)) {
      if (otherId !== id && otherWin?.isConnected) otherWin.style.display = "none";
    }
  }
  win.style.display = "flex";
  win.classList.remove("is-minimizing", "is-closing", "is-entering");
  focusWindow(id);
  if (window.matchMedia("(max-width: 768px)").matches) setFileDrawerOpen(false);
  syncWorkspaceEmptyState();
  return true;
}

function openPreview(path, filename) {
  if (restoreExistingPreview(path)) return;
  const id = 'preview-' + (++previewId);
  const win = document.createElement("div");
  win.className = "floating-window";
  win.dataset.adaComponent = "preview-window";
  win.dataset.filePath = path;
  win.style.top = `${100 + previewId * 10}px`;
  win.style.left = `${100 + previewId * 10}px`;
  win.dataset.id = id;
  
  const ext = filename.split('.').pop().toLowerCase();
  const isFullScreen = ext === 'md' || ext === 'markdown' || ext === 'pdf' || ext === 'html' || ext === 'htm'
    || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx' || ext === 'ppt' || ext === 'pptx';

  win.innerHTML = `
    <div class="title-bar" data-ada-component="window-titlebar" onmousedown="startDrag(event, '${id}')">
      <div class="title">${filename}</div>
      <div class="buttons">
        <button type="button" onclick="minimizeWindow('${id}')" aria-label="Minimize window" title="Minimize">${featherSvg("minus")}</button>
        <button type="button" onclick="toggleFullscreen('${id}')" aria-label="Maximize window" title="Maximize">${featherSvg("maximize-2")}</button>
        <button type="button" onclick="closeWindow('${id}')" aria-label="Close window" title="Close">${featherSvg("x")}</button>
      </div>
    </div>
    <div class="preview-body" data-ada-component="preview-body" id="${id}-body">Loading...</div>
  `;
  previewContainer.appendChild(win);
  windows[id] = win;
  registerPreviewWindow(win);
  syncWorkspaceEmptyState();
  if (window.matchMedia("(max-width: 768px)").matches) setFileDrawerOpen(false);

  const container = document.getElementById(id + "-body");
  fetchFileContent(path, filename, container);
  
  // Auto fullscreen for markdown and PDF
  if (isFullScreen) {
    setTimeout(() => toggleFullscreen(id, true), 100);
  }
}

const officeViewerPublicRepoChecks = new Map();

async function isPublicGitHubRepository(repo) {
  const fullName = String(repo || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) return false;

  const cacheKey = fullName.toLowerCase();
  if (!officeViewerPublicRepoChecks.has(cacheKey)) {
    const check = (async () => {
      try {
        const encodedRepo = fullName.split("/").map(encodeURIComponent).join("/");
        const response = await fetch(`https://api.github.com/repos/${encodedRepo}`, {
          headers: { Accept: "application/vnd.github+json" },
          credentials: "omit",
          cache: "no-store",
        });
        if (!response.ok) return false;
        const metadata = await response.json();
        return metadata.full_name?.toLowerCase() === cacheKey && metadata.private === false;
      } catch (_) {
        return false;
      }
    })();
    officeViewerPublicRepoChecks.set(cacheKey, check);
  }
  return officeViewerPublicRepoChecks.get(cacheKey);
}

function buildPublicOfficeSourceUrl(path) {
  const repo = String(appConfig.GITHUB_REPO || "").trim();
  const branch = String(appConfig.GITHUB_BRANCH || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !branch) return null;

  const encodePathSegments = (value) => value.split("/").map(encodeURIComponent).join("/");
  const encodedRepo = encodePathSegments(repo);
  const encodedBranch = encodePathSegments(branch);
  const rawOrigin = "https://raw.githubusercontent.com";
  const expectedPrefix = `/${encodedRepo}/${encodedBranch}/`;
  let repoPath = String(path || "").trim();

  if (/^https?:\/\//i.test(repoPath)) {
    let rawUrl;
    try { rawUrl = new URL(repoPath); } catch (_) { return null; }
    if (rawUrl.origin !== rawOrigin || rawUrl.search || rawUrl.hash || !rawUrl.pathname.startsWith(expectedPrefix)) return null;
    try {
      repoPath = rawUrl.pathname.slice(expectedPrefix.length).split("/").map(decodeURIComponent).join("/");
    } catch (_) {
      return null;
    }
  }

  repoPath = repoPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const pathParts = repoPath.split("/");
  if (!repoPath || pathParts.some((part) => !part || part === "." || part === "..")) return null;
  return `${rawOrigin}/${encodedRepo}/${encodedBranch}/${encodePathSegments(repoPath)}`;
}

async function getPublicOfficeSourceUrl(path) {
  const repo = String(appConfig.GITHUB_REPO || "").trim();
  if (!await isPublicGitHubRepository(repo)) return null;
  return buildPublicOfficeSourceUrl(path);
}

function renderOfficeWebPreview(path, filename, container, sourceUrl) {
  container.style.cssText = "padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;";

  const shell = document.createElement("section");
  shell.className = "office-web-preview";

  const controls = document.createElement("div");
  controls.className = "office-web-preview__controls";

  const status = document.createElement("span");
  status.className = "office-web-preview__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Loading Microsoft Office for the web. Microsoft will fetch this public file; use Ada's reader if it fails.";

  const fallbackButton = document.createElement("button");
  fallbackButton.type = "button";
  fallbackButton.className = "office-web-preview__fallback";
  fallbackButton.dataset.officeViewerFallback = "true";
  fallbackButton.setAttribute("aria-label", "Use Ada's built-in file preview");
  fallbackButton.innerHTML = `${featherSvg("file-text")}<span>Use Ada reader</span>`;
  fallbackButton.addEventListener("click", () => {
    fallbackButton.disabled = true;
    fetchFileContent(path, filename, container, { skipOfficeWeb: true });
  });

  const frame = document.createElement("iframe");
  frame.className = "office-web-preview__frame";
  frame.title = `Microsoft Office for the web preview of ${filename}`;
  frame.referrerPolicy = "no-referrer";
  frame.allowFullscreen = true;
  const viewerUrl = new URL("https://view.officeapps.live.com/op/embed.aspx");
  viewerUrl.searchParams.set("src", sourceUrl);
  frame.src = viewerUrl.toString();
  frame.addEventListener("load", () => {
    status.textContent = "Microsoft's viewer page loaded. If the document is blank or shows an error, use Ada's reader.";
  });
  frame.addEventListener("error", () => {
    status.textContent = "Microsoft's viewer could not load. Use Ada's reader instead.";
  });

  controls.append(status, fallbackButton);
  shell.append(controls, frame);
  container.replaceChildren(shell);
}

async function fetchFileContent(path, filename, container, options = {}) {
  const ext = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();

  container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><span class="loader"></span> Loading...</div>';

  // On Vercel, static repo files are not served directly — route through /api/raw (GitHub PAT proxy).
  // On GitHub Pages, files are served as static assets so fetch(path) works directly.
  const isGitHubPages = window.location.hostname.endsWith('github.io');
  const fetchUrl = (p) => isGitHubPages
    ? `https://raw.githubusercontent.com/${appConfig.GITHUB_REPO}/${appConfig.GITHUB_BRANCH}/${p}`
    : `${window.location.origin}/api/raw?path=${encodeURIComponent(p)}`;
  const rawUrl = `${window.location.origin}/api/raw?path=${path}`;

  try {
    if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename)) {
      container.innerHTML = `<img src="${fetchUrl(path)}" style="max-width:100%;height:auto;display:block;margin:auto;" alt="${filename}" />`;

    } else if (/\.(mp3|wav|ogg|flac)$/i.test(filename)) {
      container.innerHTML = `<audio controls src="${fetchUrl(path)}" style="width:100%;display:block;margin-top:20px"></audio>`;

    } else if (/\.(mp4|webm)$/i.test(filename)) {
      container.innerHTML = `<video controls src="${fetchUrl(path)}" style="max-width:100%;max-height:100%;display:block;margin:auto"></video>`;

    } else if (/\.(docx?|xlsx?|pptx?)$/i.test(filename.includes('.') ? filename : path)) {
      const fileExt = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';

      if (!options.skipOfficeWeb) {
        const publicSourceUrl = await getPublicOfficeSourceUrl(path);
        if (publicSourceUrl) {
          renderOfficeWebPreview(path, filename, container, publicSourceUrl);
          return;
        }
      }

      const response = await fetch(fetchUrl(path));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      if (fileExt === 'docx') {
        // docx-preview@0.3.x exposes its browser API on `window.docx`.
        const docxApi = window.docx || window.docxPreview;
        if (!docxApi || typeof docxApi.renderAsync !== 'function') throw new Error('docx-preview library not loaded');
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'flex:1;overflow:auto;padding:20px;background:white;color:#000;';
        container.innerHTML = '';
        container.appendChild(wrapper);
        await docxApi.renderAsync(arrayBuffer, wrapper, null, {
          className: 'docx-render',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
        });

      } else if (fileExt === 'xlsx' || fileExt === 'xls') {
        // SheetJS — renders spreadsheet as HTML table
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'flex:1;overflow:auto;padding:16px;background:white;color:#000;font-family:monospace;font-size:13px;';

        // Tab buttons for each sheet
        const tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;';
        const tableContainer = document.createElement('div');

        const renderSheet = (sheetName) => {
          const ws = workbook.Sheets[sheetName];
          const html = XLSX.utils.sheet_to_html(ws, { header: '', footer: '' });
          tableContainer.innerHTML = `<style>table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:4px 8px;white-space:nowrap;}</style>${html}`;
        };

        workbook.SheetNames.forEach((name, i) => {
          const btn = document.createElement('button');
          btn.textContent = name;
          btn.style.cssText = 'padding:4px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#f5f5f5;';
          btn.onclick = () => { renderSheet(name); tabs.querySelectorAll('button').forEach(b => b.style.background='#f5f5f5'); btn.style.background='#dbeafe'; };
          if (i === 0) btn.style.background = '#dbeafe';
          tabs.appendChild(btn);
        });

        renderSheet(workbook.SheetNames[0]);
        wrapper.appendChild(tabs);
        wrapper.appendChild(tableContainer);
        container.innerHTML = '';
        container.appendChild(wrapper);

      } else if (fileExt === 'pptx') {
        // JSZip — extract slide text from pptx XML (.pptx is ZIP-based)
        const zip = await JSZip.loadAsync(arrayBuffer);
        const slideFiles = Object.keys(zip.files)
          .filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/))
          .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'flex:1;overflow:auto;padding:16px;background:#1e1e2e;color:#cdd6f4;font-family:sans-serif;';

        for (let i = 0; i < slideFiles.length; i++) {
          const xmlText = await zip.files[slideFiles[i]].async('string');
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
          const texts = Array.from(xmlDoc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't'))
            .map(t => t.textContent).filter(t => t.trim());

          const slide = document.createElement('div');
          slide.style.cssText = 'border:1px solid #45475a;border-radius:8px;padding:16px;margin-bottom:12px;';
          slide.innerHTML = `<div style="font-size:11px;opacity:.5;margin-bottom:8px;">Slide ${i + 1}</div>`
            + texts.map(t => `<div style="margin:4px 0;">${t}</div>`).join('');
          wrapper.appendChild(slide);
        }

        if (slideFiles.length === 0) wrapper.innerHTML = '<div style="opacity:.5;padding:20px;">No slides found.</div>';
        container.innerHTML = '';
        container.appendChild(wrapper);

      } else {
        // Legacy binary formats (.ppt, .doc, .xls) — not supported client-side
        container.innerHTML = `<div style="padding:20px;opacity:.6;">
          Legacy format (.${fileExt}) cannot be rendered in the browser.<br>
          Please convert to a newer format (.pptx, .docx, .xlsx) and re-upload.
        </div>`;
      }

    } else if (ext === 'html' || ext === 'htm') {
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
      container.innerHTML = `<iframe src="${fetchUrl(path)}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;

    } else if (ext === 'pdf') {
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
      const response = await fetch(fetchUrl(path));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!window.AdaPdfViewer) throw new Error("Ada’s PDF.js viewer did not load");
      await window.AdaPdfViewer.render(container, await response.arrayBuffer());

    } else if (ext === 'md' || ext === 'markdown') {
      const response = await fetch(fetchUrl(path));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const wrapper = document.createElement('div');
      wrapper.className = 'markdown-content';
      wrapper.innerHTML = markdownToHTML(text, path);
      container.innerHTML = '';
      container.appendChild(wrapper);
      setTimeout(function () { initMarkdownFeatures(wrapper); }, 0);

    } else {
      // All other file types: display as plain text
      try {
        const response = await fetch(fetchUrl(path));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        container.innerHTML = `<pre style="margin:0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;line-height:1.5">${escapeHTML(text)}</pre>`;
      } catch (error) {
        container.innerHTML = `<div class="error">Error loading file: ${error.message}</div>`;
      }
    }
  } catch (error) {
    container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  }
}

function escapeHTML(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener("click", (e) => {
  const isItem = e.target.closest(".file-item");
  const isSearchResult = e.target.closest(".search-result");
  const isContext = e.target.closest(".context-menu");
  if (!isItem && !isSearchResult && !isContext) {
    document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    selected = null;
    contextMenu.style.display = "none";
  }
});

const manifest = {
  name: "Root",
  short_name: "Root",
  start_url: ".",
  display: "standalone",
  background_color: "#1e1e1e",
  theme_color: "#1e1e1e",
  icons: [
    {
      src: "favicon.png",
      sizes: "192x192",
      type: "image/png"
    }
  ]
};

// Fix #8: manifest.json is already declared in <head> via static <link rel="manifest">.
// The dynamic blob manifest below was a duplicate and has been removed.

// --- GitHub Pages → Vercel popup ---
function hasVercelDismissCookie() {
  return document.cookie.split(';').some(c => c.trim().startsWith('vercel_redirect_dismissed=1'));
}

function goToVercel() {
  document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
  window.location.href = appConfig.APP_URL;
}

function dismissVercelPopup() {
  document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
  const popup = document.getElementById('vercelPopup');
  popup.classList.remove('visible');
  setTimeout(() => { popup.style.display = 'none'; }, 400);
}

function maybeShowVercelPopup() {
  if (hasVercelDismissCookie()) return;
  if (appConfig.GITPAGE_URL && window.location.hostname === new URL(appConfig.GITPAGE_URL).hostname) {
    setTimeout(() => {
      document.getElementById('vercelPopup').classList.add('visible');
    }, 1800);
  }
}

// --- Community ---
function openCommunity() {
  const path = 'primenotepad.rf.gd';
  if (isMobile) {
    openMobilePreview(path, 'Community 💬');
  } else {
    openPreview(path, 'Community 💬');
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await fetchConfig();
  fetchTree();
  maybeShowVercelPopup();
});


				     
