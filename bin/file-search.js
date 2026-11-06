(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (global) global.AdaFileSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_HIDDEN_FOLDERS = new Set([".github"]);
  const DEFAULT_HIDDEN_ROOT_FOLDERS = new Set(["waiting-list"]);

  function buildIndex(root, options = {}) {
    const entries = [];
    const excludedRootFiles = new Set(options.excludedRootFiles || []);
    const hiddenFolders = new Set([...DEFAULT_HIDDEN_FOLDERS, ...(options.hiddenFolders || [])]);
    const hiddenRootFolders = new Set([...DEFAULT_HIDDEN_ROOT_FOLDERS, ...(options.hiddenRootFolders || [])]);

    function visit(folder, ancestors, pathSegments, depth) {
      if (!folder || !Array.isArray(folder.children)) return;

      for (const node of folder.children) {
        if (!node || typeof node.name !== "string") continue;
        if (node.type === "folder" && hiddenFolders.has(node.name)) continue;
        if (depth === 0 && node.type === "folder" && hiddenRootFolders.has(node.name)) continue;
        if (depth === 0 && node.type === "file" && excludedRootFiles.has(node.name)) continue;
        if (node.type !== "file" && node.type !== "folder") continue;

        const nextSegments = [...pathSegments, node.name];
        const parentChain = [...ancestors, folder];
        entries.push({
          node,
          parent: folder,
          ancestors: parentChain,
          path: nextSegments.join("/")
        });

        if (node.type === "folder") visit(node, parentChain, nextSegments, depth + 1);
      }
    }

    visit(root, [], [], 0);
    return entries;
  }

  function search(index, query, limit = 100) {
    const normalizedQuery = String(query || "").trim().normalize("NFKC").toLocaleLowerCase();
    if (!normalizedQuery) return { items: [], total: 0 };

    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    const matches = [];

    for (const entry of index || []) {
      const name = String(entry.node.name || "").normalize("NFKC").toLocaleLowerCase();
      const path = String(entry.path || "").normalize("NFKC").toLocaleLowerCase();
      const haystack = `${name} ${path}`;
      if (!terms.every((term) => haystack.includes(term))) continue;

      const rank = name === normalizedQuery ? 0
        : name.startsWith(normalizedQuery) ? 1
          : path.startsWith(normalizedQuery) ? 2
            : 3;
      matches.push({ entry, rank });
    }

    matches.sort((a, b) => a.rank - b.rank
      || a.entry.node.name.localeCompare(b.entry.node.name)
      || a.entry.path.localeCompare(b.entry.path));

    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 100;
    return {
      items: matches.slice(0, safeLimit).map(({ entry }) => entry),
      total: matches.length
    };
  }

  return { buildIndex, search };
});
