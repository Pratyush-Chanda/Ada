const test = require("node:test");
const assert = require("node:assert/strict");
const { buildIndex, search } = require("../bin/file-search.js");

function sampleTree() {
  return {
    type: "folder",
    name: "Ada",
    children: [
      { type: "file", name: "README.md", path: "README.md" },
      {
        type: "folder",
        name: "docs",
        children: [
          { type: "file", name: "Theme Guide.md", path: "docs/Theme Guide.md" },
          { type: "file", name: "search-notes.txt", path: "docs/search-notes.txt" }
        ]
      },
      { type: "folder", name: ".github", children: [{ type: "file", name: "workflow.yml" }] },
      { type: "folder", name: "waiting-list", children: [{ type: "file", name: "pending.css" }] },
      { type: "file", name: "files.json", path: "files.json" }
    ]
  };
}

test("builds a recursive index with relative paths and parent ancestry", () => {
  const root = sampleTree();
  const index = buildIndex(root, { excludedRootFiles: ["files.json"] });
  const guide = index.find((entry) => entry.node.name === "Theme Guide.md");

  assert.deepEqual(index.map((entry) => entry.path), [
    "README.md",
    "docs",
    "docs/Theme Guide.md",
    "docs/search-notes.txt"
  ]);
  assert.equal(guide.parent.name, "docs");
  assert.deepEqual(guide.ancestors.map((folder) => folder.name), ["Ada", "docs"]);
});

test("does not index Ada-hidden folders at any depth and excludes selected root files only", () => {
  const root = sampleTree();
  root.children[1].children.push({
    type: "folder",
    name: ".github",
    children: [{ type: "file", name: "nested-secret.txt" }]
  });
  root.children[1].children.push({ type: "file", name: "files.json", path: "docs/files.json" });
  const index = buildIndex(root, { excludedRootFiles: ["files.json"] });

  assert.equal(index.some((entry) => entry.path.includes(".github")), false);
  assert.equal(index.some((entry) => entry.path.startsWith("waiting-list/")), false);
  assert.equal(index.some((entry) => entry.path === "files.json"), false);
  assert.equal(index.some((entry) => entry.path === "docs/files.json"), true);
});

test("searches case-insensitively by filename and path and ranks exact/prefix names first", () => {
  const index = buildIndex(sampleTree());
  const exact = search(index, "README.md");
  const byPath = search(index, "docs theme");
  const byExtension = search(index, ".TXT");

  assert.equal(exact.total, 1);
  assert.equal(exact.items[0].path, "README.md");
  assert.deepEqual(byPath.items.map((entry) => entry.path), ["docs/Theme Guide.md"]);
  assert.deepEqual(byExtension.items.map((entry) => entry.path), ["docs/search-notes.txt"]);
});

test("returns an empty result for blank queries and reports totals separately from the limit", () => {
  const index = buildIndex(sampleTree());

  assert.deepEqual(search(index, "   "), { items: [], total: 0 });
  const result = search(index, "docs", 1);
  assert.equal(result.items.length, 1);
  assert.ok(result.total > result.items.length);
});
