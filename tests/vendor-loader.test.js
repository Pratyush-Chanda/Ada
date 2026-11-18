const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createLoader() {
  const elements = [];
  const window = {
    addEventListener() {},
    __adaMermaidThemeListener: false,
    __adaHighlightThemeListener: false
  };
  const document = {
    documentElement: { dataset: { themeMode: "light" } },
    head: {
      appendChild(element) {
        elements.push(element);
        queueMicrotask(() => {
          if (element.src === "/bin/md-init.js") {
            window.md = {};
            window.markdownToHTML = () => "";
          }
          if (element.src === "/bin/pdf-viewer.js?v=19") {
            window.AdaPdfViewer = {};
          }
          element.onload?.();
        });
      }
    },
    createElement(tagName) {
      return {
        tagName,
        dataset: {},
        remove() {}
      };
    },
    getElementById(id) {
      return elements.find((element) => element.id === id) || null;
    }
  };
  const source = fs.readFileSync(path.join(__dirname, "../bin/vendor-loader.js"), "utf8");
  vm.runInNewContext(source, { window, document, console, Promise, Map });
  return { elements, loader: window.AdaVendorLoader };
}

test("does not fetch optional vendors until requested and deduplicates loads", async () => {
  const { elements, loader } = createLoader();
  assert.equal(elements.length, 0);

  await loader.load("pdf");
  await loader.load("pdf");

  assert.deepEqual(
    elements.map((element) => element.src),
    [
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      "/bin/pdf-viewer.js?v=19"
    ]
  );
});

test("loads Markdown core without loading document-specific renderers", async () => {
  const { elements, loader } = createLoader();
  await loader.load("markdown");

  const loadedScripts = elements.map((element) => element.src);
  assert.deepEqual(loadedScripts, [
    "https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js",
    "https://cdn.jsdelivr.net/npm/markdown-it-sub@1/dist/markdown-it-sub.min.js",
    "https://cdn.jsdelivr.net/npm/markdown-it-sup@1/dist/markdown-it-sup.min.js",
    "https://cdn.jsdelivr.net/npm/markdown-it-footnote@3/dist/markdown-it-footnote.min.js",
    "/bin/obsidian-markdown-it.js?v=19",
    "/bin/md-init.js"
  ]);
});

test("loads only feature dependencies present in a Markdown document", async () => {
  const { elements, loader } = createLoader();
  await loader.loadMarkdownFeatures({
    querySelector(selector) {
      return selector === ".tikz-source" ? {} : null;
    }
  });

  assert.deepEqual(
    elements.map((element) => element.src || element.href),
    ["/bin/tikzjax/css/fonts.css", "/bin/tikzjax/output/tikzjax.js"]
  );
});
