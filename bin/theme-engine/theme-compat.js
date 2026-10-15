const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const valueParser = require("postcss-value-parser");

const COMPATIBILITY_MAP_VERSION = "ada-bd-compat-3";
const MAX_REMOTE_IMPORTS = 16;
const MAX_REMOTE_IMPORT_DEPTH = 5;
const MAX_REMOTE_IMPORT_BYTES = 512 * 1024;
const MAX_COMPILED_THEME_BYTES = 2 * 1024 * 1024;
const REMOTE_IMPORT_TIMEOUT_MS = 8000;

// Keep translations limited to palette variables with useful Ada equivalents.
const DISCORD_VARIABLE_MAP = Object.freeze({
  "--background-primary": "--bg",
  "--background-secondary": "--item",
  "--background-secondary-alt": "--hover",
  "--background-tertiary": "--bg",
  "--background-accent": "--accent",
  "--background-floating": "--item",
  "--background-modifier-hover": "--hover",
  "--background-modifier-selected": "--selected",
  "--background-modifier-accent": "--border",
  "--text-normal": "--fg",
  "--header-primary": "--fg",
  "--header-secondary": "--fg",
  "--interactive-normal": "--fg",
  "--interactive-hover": "--accent-hover",
  "--brand-experiment": "--accent",
  "--brand-experiment-560": "--accent-hover",
  "--main-theme-color": "--accent",
  "--category-hover-color": "--accent-hover"
});

const ADA_APP_SHELL = '[data-ada-component="app-shell"]';
const ADA_FILE_LIST = '[data-ada-component="file-list"]';
const DISCORD_SELECTOR_MAP = Object.freeze({
  "#app-mount": ADA_APP_SHELL,
  ".appMount-2yBXZl": ADA_APP_SHELL,
  ".theme-dark": 'html[data-theme-mode="dark"]',
  ".theme-light": 'html[data-theme-mode="light"]'
});

const DISCORD_CLASS_MAP = Object.freeze({
  "appMount-2yBXZl": ADA_APP_SHELL,
  "theme-dark": 'html[data-theme-mode="dark"]',
  "theme-light": 'html[data-theme-mode="light"]'
});

const DISCORD_ID_MAP = Object.freeze({
  "app-mount": ADA_APP_SHELL
});

function parseThemeMetadata(cssText) {
  const metadata = {};
  const match = String(cssText).match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) return metadata;

  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^\s*\*?\s*@([a-zA-Z][\w-]*)\s+(.+?)\s*$/);
    if (!field) continue;
    const key = field[1].toLowerCase();
    const value = field[2];
    if (["name", "author", "description", "version", "source", "website"].includes(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

function isDiscordVariable(name) {
  return /^--(?:background-|background$|text-|header-|interactive-|brand-|channel|mention|unread|new-messages|voice-channel|channel-limit|deprecated-|elevation-)/i.test(name);
}

function isLikelyHashedDiscordClass(name) {
  const match = name.match(/[-_]+([A-Za-z0-9]{5,})$/);
  return Boolean(match && /[A-Za-z]/.test(match[1]) && /\d/.test(match[1]));
}

function readImportTarget(params) {
  const parsed = valueParser(String(params || ""));
  const first = parsed.nodes.find((node) => node.type !== "space" && node.type !== "comment");
  if (!first) return "";
  if (first.type === "string") return first.value;
  if (first.type === "function" && first.value.toLowerCase() === "url") {
    const value = valueParser.stringify(first.nodes).trim();
    return value.replace(/^(?:(['"])(.*)\1)$/, "$2");
  }
  return valueParser.stringify(first).trim();
}

function readPlainImportTarget(params) {
  const parsed = valueParser(String(params || ""));
  const significant = parsed.nodes.filter((node) => node.type !== "space" && node.type !== "comment");
  if (significant.length !== 1) return null;
  const first = significant[0];
  if (first.type === "string") return first.value;
  if (first.type === "function" && first.value.toLowerCase() === "url") {
    const value = valueParser.stringify(first.nodes).trim();
    return value.replace(/^(?:(['"])(.*)\1)$/, "$2");
  }
  return null;
}

function importWarning(target) {
  const label = /^(?:https?:)?\/\//i.test(target) ? "Remote @import" : "Imported stylesheet";
  const source = target || "(URL could not be parsed)";
  return `${label} not analyzed or translated: ${source}. Ada preserves @import, so the browser may load it when the theme is enabled; download and import that stylesheet separately to inspect and map its rules.`;
}

function utf8ByteLength(text) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
  return unescape(encodeURIComponent(text)).length;
}

function unresolvedImport(url, reason) {
  return { url: url || "(URL could not be parsed)", reason };
}

function rewriteRelativeAssetUrls(root, baseUrl) {
  root.walkDecls((declaration) => {
    const parsed = valueParser(declaration.value);
    parsed.walk((node) => {
      if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
      const raw = valueParser.stringify(node.nodes).trim();
      const target = raw.replace(/^(?:(['"])(.*)\1)$/, "$2").trim();
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target) || /var\s*\(/i.test(target)) return;
      try {
        node.nodes = [{ type: "word", value: new URL(target, baseUrl).href }];
      } catch (_) {
        // Keep malformed or non-resolvable asset URLs unchanged.
      }
    });
    declaration.value = parsed.toString();
  });
}

async function resolveRemoteImports(cssText, options = {}) {
  const source = String(cssText);
  const fetcher = options.fetch || (typeof fetch === "function" ? fetch : null);
  const imports = new Set();
  const resolvedImports = new Set();
  const unresolvedImports = [];
  const unresolvedKeys = new Set();
  const fetched = new Map();
  let requestCount = 0;
  let totalBytes = utf8ByteLength(source);

  function addUnresolved(url, reason) {
    const item = unresolvedImport(url, reason);
    const key = `${item.url}\n${item.reason}`;
    if (!unresolvedKeys.has(key)) {
      unresolvedKeys.add(key);
      unresolvedImports.push(item);
    }
  }

  async function visit(root, baseUrl, depth, ancestry) {
    const atRules = [];
    root.walkAtRules((rule) => {
      if (rule.name.toLowerCase() === "import") atRules.push(rule);
    });

    for (const rule of atRules) {
      if (!rule.parent) continue;
      const target = readImportTarget(rule.params);
      const plainTarget = readPlainImportTarget(rule.params);
      if (!plainTarget) {
        imports.add(target || "(URL could not be parsed)");
        addUnresolved(target, "Only plain URL imports without media, layer, or supports qualifiers can be translated.");
        continue;
      }

      let url;
      try {
        url = new URL(plainTarget, baseUrl || undefined);
      } catch (_) {
        imports.add(plainTarget);
        addUnresolved(plainTarget, "The import URL is relative to a local theme file and has no remote base URL.");
        continue;
      }

      if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
        imports.add(url.href);
        addUnresolved(url.href, "Only credential-free HTTP or HTTPS stylesheet URLs can be fetched.");
        continue;
      }

      const requestUrl = url.href;
      imports.add(requestUrl);
      if (depth >= MAX_REMOTE_IMPORT_DEPTH) {
        addUnresolved(requestUrl, `The nested import depth limit (${MAX_REMOTE_IMPORT_DEPTH}) was reached.`);
        continue;
      }
      if (ancestry.has(requestUrl)) {
        rule.remove();
        addUnresolved(requestUrl, "A circular import was removed to prevent recursion.");
        continue;
      }

      let entry = fetched.get(requestUrl);
      if (!entry) {
        if (!fetcher) {
          addUnresolved(requestUrl, "Fetch is unavailable in this browser.");
          continue;
        }
        if (requestCount >= MAX_REMOTE_IMPORTS) {
          addUnresolved(requestUrl, `The remote import limit (${MAX_REMOTE_IMPORTS}) was reached.`);
          continue;
        }
        requestCount += 1;
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REMOTE_IMPORT_TIMEOUT_MS) : null;
        try {
          const response = await fetcher(requestUrl, {
            mode: "cors",
            credentials: "omit",
            cache: "no-cache",
            ...(controller ? { signal: controller.signal } : {})
          });
          if (!response || !response.ok) {
            throw new Error(`HTTP ${response ? response.status : "error"}`);
          }
          const finalUrl = response.url ? new URL(response.url).href : requestUrl;
          const text = await response.text();
          const bytes = utf8ByteLength(text);
          if (bytes > MAX_REMOTE_IMPORT_BYTES) {
            throw new Error(`Stylesheet exceeds the ${MAX_REMOTE_IMPORT_BYTES} byte per-file limit`);
          }
          if (totalBytes + bytes > MAX_COMPILED_THEME_BYTES) {
            throw new Error(`Combined theme exceeds the ${MAX_COMPILED_THEME_BYTES} byte limit`);
          }
          totalBytes += bytes;
          entry = { url: finalUrl, text };
          fetched.set(requestUrl, entry);
          fetched.set(finalUrl, entry);
        } catch (error) {
          const reason = error && error.name === "AbortError"
            ? `The request timed out after ${REMOTE_IMPORT_TIMEOUT_MS} ms.`
            : `The stylesheet could not be fetched (CORS, network, or size limit): ${error && error.message ? error.message : "fetch failed"}.`;
          addUnresolved(requestUrl, reason);
          continue;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      if (ancestry.has(entry.url)) {
        rule.remove();
        addUnresolved(entry.url, "A circular import was removed to prevent recursion.");
        continue;
      }

      let importedRoot;
      try {
        importedRoot = postcss.parse(entry.text, { from: entry.url });
      } catch (error) {
        addUnresolved(entry.url, `The imported stylesheet contains invalid CSS: ${error.message}`);
        continue;
      }
      resolvedImports.add(requestUrl);
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(requestUrl);
      nextAncestry.add(entry.url);
      await visit(importedRoot, entry.url, depth + 1, nextAncestry);
      importedRoot.walkAtRules((atRule) => {
        if (atRule.name.toLowerCase() === "charset") atRule.remove();
      });
      rewriteRelativeAssetUrls(importedRoot, entry.url);
      const importedNodes = importedRoot.nodes.map((node) => node.clone());
      if (importedNodes.length) rule.replaceWith(...importedNodes);
      else rule.remove();
    }
  }

  const root = postcss.parse(source, { from: options.from || undefined });
  await visit(root, options.baseUrl || "", 0, new Set());
  return {
    css: root.toString(),
    imports: [...imports],
    resolvedImports: [...resolvedImports],
    unresolvedImports
  };
}

function mapCustomProperties(root, warnings, translated) {
  root.walkDecls((declaration) => {
    const parsedValue = valueParser(declaration.value);
    const mappedProperty = DISCORD_VARIABLE_MAP[declaration.prop];
    let aliasesOwnTarget = false;
    if (mappedProperty) {
      parsedValue.walk((node) => {
        if (node.type !== "function" || node.value.toLowerCase() !== "var") return;
        const variable = node.nodes.find((child) => child.type === "word");
        if (variable && DISCORD_VARIABLE_MAP[variable.value] === mappedProperty) aliasesOwnTarget = true;
      });
    }
    if (mappedProperty && aliasesOwnTarget) {
      warnings.add(`Kept ${declaration.prop} as a source alias to avoid a self-referential ${mappedProperty} declaration.`);
    } else if (mappedProperty) {
      translated.variables.push({ from: declaration.prop, to: mappedProperty });
      declaration.prop = mappedProperty;
    } else if (isDiscordVariable(declaration.prop)) {
      warnings.add(`Unmapped Discord variable declaration: ${declaration.prop}`);
    }

    parsedValue.walk((node) => {
      if (node.type !== "function" || node.value.toLowerCase() !== "var") return;
      const variable = node.nodes.find((child) => child.type === "word");
      if (!variable) return;
      const mapped = DISCORD_VARIABLE_MAP[variable.value];
      if (mapped) {
        translated.variables.push({ from: variable.value, to: mapped });
        variable.value = mapped;
      } else if (isDiscordVariable(variable.value)) {
        warnings.add(`Unmapped Discord variable reference: ${variable.value}`);
      }
    });
    declaration.value = parsedValue.toString();
  });
}

function cloneSelectorNodes(selectorText) {
  const parsed = selectorParser().astSync(selectorText);
  if (parsed.nodes.length !== 1) {
    throw new Error(`A selector mapping must resolve to one selector: ${selectorText}`);
  }
  return parsed.nodes[0].nodes.map((node) => node.clone());
}

function hashedClassTarget(name) {
  if (/^appMount__[A-Za-z0-9_-]+$/.test(name)) return ADA_APP_SHELL;
  if (/^app__[A-Za-z0-9_-]+$/.test(name)) return ADA_FILE_LIST;
  return null;
}

function translateSelector(selectorText, customSelectorMap, warnings, translated) {
  const exactMap = { ...DISCORD_SELECTOR_MAP, ...customSelectorMap };
  const parser = selectorParser((selectors) => {
    selectors.each((selector) => {
      const original = selector.toString().trim();
      const directTarget = exactMap[original] || (original === ":root" ? "html[data-theme-mode]" : null);
      if (directTarget) {
        selector.removeAll();
        cloneSelectorNodes(directTarget).forEach((node) => selector.append(node));
        translated.selectors.push({ from: original, to: directTarget });
        return;
      }

      selector.walk((node) => {
        if (node.type !== "class" && node.type !== "id") return;
        const literal = `${node.type === "class" ? "." : "#"}${node.value}`;
        const target = node.type === "class"
          ? DISCORD_CLASS_MAP[node.value] || hashedClassTarget(node.value)
          : DISCORD_ID_MAP[node.value];
        if (target) {
          node.replaceWith(...cloneSelectorNodes(target));
          translated.selectors.push({ from: literal, to: target });
        } else if (isLikelyHashedDiscordClass(node.value)) {
          warnings.add(`Unmapped Discord selector component: ${literal}`);
        }
      });
    });
  });
  return parser.processSync(selectorText);
}

function insideKeyframes(rule) {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === "atrule" && /^(?:-[\w]+-)?keyframes$/i.test(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

function translateBetterDiscordTheme(cssText, options = {}) {
  const source = String(cssText);
  const metadata = parseThemeMetadata(source);
  const warnings = new Set();
  const translated = { variables: [], selectors: [] };
  const selectorMap = options.selectorMap && typeof options.selectorMap === "object"
    ? options.selectorMap
    : {};
  const root = postcss.parse(source, { from: options.from || undefined });
  const imports = [];

  root.walkAtRules((rule) => {
    if (rule.name.toLowerCase() !== "import") return;
    const target = readImportTarget(rule.params);
    imports.push(target);
    warnings.add(importWarning(target));
  });

  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    try {
      rule.selector = translateSelector(rule.selector, selectorMap, warnings, translated);
    } catch (_) {
      warnings.add(`Selector could not be parsed or translated: ${rule.selector}`);
    }
  });

  mapCustomProperties(root, warnings, translated);

  return {
    css: root.toString(),
    metadata,
    imports,
    mapVersion: COMPATIBILITY_MAP_VERSION,
    warnings: [...warnings],
    translated: {
      variableCount: translated.variables.length,
      selectorCount: translated.selectors.length,
      variables: translated.variables,
      selectors: translated.selectors
    }
  };
}

async function translateBetterDiscordThemeWithImports(cssText, options = {}) {
  const resolved = await resolveRemoteImports(cssText, options);
  const translated = translateBetterDiscordTheme(resolved.css, options);
  const unresolvedUrls = new Set(resolved.unresolvedImports.map((item) => item.url));
  const warnings = translated.warnings.filter((warning) => {
    if (!warning.includes("not analyzed or translated")) return true;
    return ![...unresolvedUrls].some((url) => url !== "(URL could not be parsed)" && warning.includes(url));
  });
  for (const item of resolved.unresolvedImports) {
    const label = /^(?:https?:)?\/\//i.test(item.url) ? "Remote @import" : "Imported stylesheet";
    warnings.push(`${label} could not be fetched and translated: ${item.url}. ${item.reason} The original import was preserved when possible.`);
  }
  return {
    ...translated,
    css: translated.css,
    resolvedCss: resolved.css,
    imports: resolved.imports,
    resolvedImports: resolved.resolvedImports,
    unresolvedImports: resolved.unresolvedImports,
    warnings: [...new Set(warnings)]
  };
}

module.exports = {
  COMPATIBILITY_MAP_VERSION,
  DISCORD_VARIABLE_MAP,
  DISCORD_SELECTOR_MAP,
  parseThemeMetadata,
  resolveRemoteImports,
  translateBetterDiscordTheme,
  translateBetterDiscordThemeWithImports
};
