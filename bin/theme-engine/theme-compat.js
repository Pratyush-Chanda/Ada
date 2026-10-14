const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");
const valueParser = require("postcss-value-parser");

const COMPATIBILITY_MAP_VERSION = "ada-bd-compat-2";

// This is deliberately a small, explicit first map. Extend it only when a
// mapping to a real Ada component has been reviewed and covered by a fixture.
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
  "--brand-experiment-560": "--accent-hover"
});

const DISCORD_SELECTOR_MAP = Object.freeze({
  "#app-mount": '[data-ada-component="app-shell"]',
  ".appMount-2yBXZl": '[data-ada-component="app-shell"]',
  ".theme-dark": 'html[data-theme-mode="dark"]',
  ".theme-light": 'html[data-theme-mode="light"]'
});

const DISCORD_CLASS_MAP = Object.freeze({
  "appMount-2yBXZl": '[data-ada-component="app-shell"]',
  "theme-dark": 'html[data-theme-mode="dark"]',
  "theme-light": 'html[data-theme-mode="light"]'
});

const DISCORD_ID_MAP = Object.freeze({
  "app-mount": '[data-ada-component="app-shell"]'
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
  return /^--(?:background-|background$|text-|header-|interactive-|brand-|channel|mention|deprecated-|elevation-)/i.test(name);
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
    return value.replace(/^(["'])(.*)\1$/, "$2");
  }
  return valueParser.stringify(first).trim();
}

function importWarning(target) {
  const label = /^(?:https?:)?\/\//i.test(target) ? "Remote @import" : "Imported stylesheet";
  const source = target || "(URL could not be parsed)";
  return `${label} not analyzed or translated: ${source}. Ada preserves @import, so the browser may load it when the theme is enabled; download and import that stylesheet separately to inspect and map its rules.`;
}

function mapCustomProperties(root, warnings, translated) {
  root.walkDecls((declaration) => {
    const mappedProperty = DISCORD_VARIABLE_MAP[declaration.prop];
    if (mappedProperty) {
      translated.variables.push({ from: declaration.prop, to: mappedProperty });
      declaration.prop = mappedProperty;
    } else if (isDiscordVariable(declaration.prop)) {
      warnings.add(`Unmapped Discord variable declaration: ${declaration.prop}`);
    }

    const parsedValue = valueParser(declaration.value);
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

function translateSelector(selectorText, customSelectorMap, warnings, translated) {
  const exactMap = { ...DISCORD_SELECTOR_MAP, ...customSelectorMap };
  const parser = selectorParser((selectors) => {
    selectors.each((selector) => {
      const original = selector.toString().trim();
      const directTarget = exactMap[original];
      if (directTarget) {
        selector.replaceWith(...cloneSelectorNodes(directTarget));
        translated.selectors.push({ from: original, to: directTarget });
        return;
      }

      selector.walk((node) => {
        if (node.type !== "class" && node.type !== "id") return;
        const literal = `${node.type === "class" ? "." : "#"}${node.value}`;
        const target = node.type === "class" ? DISCORD_CLASS_MAP[node.value] : DISCORD_ID_MAP[node.value];
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
    } catch (error) {
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

module.exports = {
  COMPATIBILITY_MAP_VERSION,
  DISCORD_VARIABLE_MAP,
  DISCORD_SELECTOR_MAP,
  parseThemeMetadata,
  translateBetterDiscordTheme
};
