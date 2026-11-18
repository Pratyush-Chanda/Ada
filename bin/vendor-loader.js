(() => {
  const scripts = {
    markdownIt: "https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js",
    markdownSub: "https://cdn.jsdelivr.net/npm/markdown-it-sub@1/dist/markdown-it-sub.min.js",
    markdownSup: "https://cdn.jsdelivr.net/npm/markdown-it-sup@1/dist/markdown-it-sup.min.js",
    markdownFootnote: "https://cdn.jsdelivr.net/npm/markdown-it-footnote@3/dist/markdown-it-footnote.min.js",
    obsidianMarkdown: "/bin/obsidian-markdown-it.js?v=19",
    markdownInit: "/bin/md-init.js",
    mathjax: "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js",
    tikz: "/bin/tikzjax/output/tikzjax.js",
    mermaid: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
    desmos: "/api/desmos",
    highlight: "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js",
    jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    docx: "https://cdn.jsdelivr.net/npm/docx-preview@0.3.5/dist/docx-preview.min.js",
    xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    pdfViewer: "/bin/pdf-viewer.js?v=19"
  };
  const scriptLoads = new Map();
  const styleLoads = new Map();
  const vendorLoads = new Map();

  function loadScript(source) {
    if (scriptLoads.has(source)) return scriptLoads.get(source);

    const script = document.createElement("script");
    script.src = source;
    script.async = false;
    script.dataset.adaVendor = source;
    const pending = new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptLoads.delete(source);
        reject(new Error(`Unable to load document viewer dependency: ${source}`));
      };
      document.head.appendChild(script);
    });
    scriptLoads.set(source, pending);
    return pending;
  }

  function loadStyle(source, id) {
    if (styleLoads.has(source)) return styleLoads.get(source);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = source;
    link.dataset.adaVendor = source;
    if (id) link.id = id;
    const pending = new Promise((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        styleLoads.delete(source);
        reject(new Error(`Unable to load document viewer stylesheet: ${source}`));
      };
      document.head.appendChild(link);
    });
    styleLoads.set(source, pending);
    return pending;
  }

  async function loadMarkdownCore() {
    await Promise.all([
      loadScript(scripts.markdownIt),
      loadScript(scripts.markdownSub),
      loadScript(scripts.markdownSup),
      loadScript(scripts.markdownFootnote)
    ]);
    await loadScript(scripts.obsidianMarkdown);
    await loadScript(scripts.markdownInit);
    if (typeof window.markdownToHTML !== "function" || !window.md) {
      throw new Error("Markdown dependencies loaded, but the renderer could not be initialized.");
    }
  }

  async function loadPdfViewer() {
    await loadScript(scripts.pdfjs);
    await loadScript(scripts.pdfViewer);
    if (!window.AdaPdfViewer) throw new Error("PDF viewer dependencies loaded, but the viewer could not be initialized.");
  }

  function initializeMermaid() {
    if (typeof window.mermaid?.initialize !== "function") return;
    const setTheme = (mode) => {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: mode === "dark" ? "dark" : "default",
        securityLevel: "loose"
      });
    };
    setTheme(document.documentElement.dataset.themeMode);
    if (!window.__adaMermaidThemeListener) {
      window.__adaMermaidThemeListener = true;
      window.addEventListener("ada-theme-change", (event) => setTheme(event.detail?.mode));
    }
  }

  async function loadVendor(name) {
    if (vendorLoads.has(name)) return vendorLoads.get(name);

    let pending;
    switch (name) {
      case "markdown":
        pending = loadMarkdownCore();
        break;
      case "pdf":
        pending = loadPdfViewer();
        break;
      case "docx":
        pending = (async () => {
          await loadScript(scripts.jszip);
          await loadScript(scripts.docx);
        })();
        break;
      case "xlsx":
        pending = loadScript(scripts.xlsx);
        break;
      case "pptx":
        pending = loadScript(scripts.jszip);
        break;
      case "mathjax":
        pending = loadScript(scripts.mathjax);
        break;
      case "tikz":
        pending = Promise.all([
          loadStyle("/bin/tikzjax/css/fonts.css"),
          loadScript(scripts.tikz)
        ]);
        break;
      case "mermaid":
        pending = loadScript(scripts.mermaid).then(initializeMermaid);
        break;
      case "desmos":
        pending = loadScript(scripts.desmos);
        break;
      case "highlight":
        pending = (async () => {
          const lightMode = document.documentElement.dataset.themeMode !== "dark";
          const light = document.getElementById("adaHighlightLight");
          const dark = document.getElementById("adaHighlightDark");
          const activeId = lightMode ? "adaHighlightLight" : "adaHighlightDark";
          const activeHref = lightMode
            ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css"
            : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css";
          const activeStyle = loadStyle(activeHref, activeId);
          const darkLink = document.getElementById("adaHighlightDark");
          const lightLink = document.getElementById("adaHighlightLight");
          if (darkLink) darkLink.disabled = lightMode;
          if (lightLink) lightLink.disabled = !lightMode;
          if (!window.__adaHighlightThemeListener) {
            window.__adaHighlightThemeListener = true;
            window.addEventListener("ada-theme-change", (event) => {
              const mode = event.detail?.mode;
              const nextId = mode === "dark" ? "adaHighlightDark" : "adaHighlightLight";
              const nextHref = mode === "dark"
                ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css"
                : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css";
              const nextLink = document.getElementById(nextId);
              const otherLink = document.getElementById(nextId === "adaHighlightDark" ? "adaHighlightLight" : "adaHighlightDark");
              if (otherLink) otherLink.disabled = true;
              if (nextLink) nextLink.disabled = false;
              else loadStyle(nextHref, nextId).catch((error) => console.error(error));
            });
          }
          await Promise.all([activeStyle, loadScript(scripts.highlight)]);
        })();
        break;
      default:
        pending = Promise.reject(new Error(`Unknown document viewer dependency: ${name}`));
    }

    vendorLoads.set(name, pending);
    try {
      await pending;
    } catch (error) {
      vendorLoads.delete(name);
      throw error;
    }
  }

  async function loadMarkdownFeatures(container) {
    const jobs = [];
    if (container.querySelector(".tikz-source")) jobs.push(loadVendor("tikz"));
    if (container.querySelector(".math[data-math]")) jobs.push(loadVendor("mathjax"));
    if (container.querySelector(".obsidian-mermaid")) jobs.push(loadVendor("mermaid"));
    if (container.querySelector(".desmos-block")) jobs.push(loadVendor("desmos"));
    if (container.querySelector("pre code")) jobs.push(loadVendor("highlight"));
    if (container.querySelector(".ada-pdf-embed[data-pdf-src]")) jobs.push(loadVendor("pdf"));
    await Promise.all(jobs);
  }

  window.AdaVendorLoader = { load: loadVendor, loadMarkdownFeatures };
})();
