const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPATIBILITY_MAP_VERSION,
  parseThemeMetadata,
  translateBetterDiscordTheme
} = require("../bin/theme-engine/theme-compat.js");

test("reads BetterDiscord-style metadata from the leading comment", () => {
  const metadata = parseThemeMetadata(`/**\n * @name Midnight Ada\n * @author Example\n * @description A theme\n * @version 2.1.0\n * @source https://example.test/theme.css\n */\n:root { color: white; }`);
  assert.deepEqual(metadata, {
    name: "Midnight Ada",
    author: "Example",
    description: "A theme",
    version: "2.1.0",
    source: "https://example.test/theme.css"
  });
});

test("rewrites mapped Discord variables in declarations and var() references", () => {
  const result = translateBetterDiscordTheme(`:root { --background-primary: #111; --brand-experiment: #8a3ffc; }\n.title { color: var(--text-normal, #eee); background: var(--background-primary); }`);
  assert.match(result.css, /--bg:\s*#111/);
  assert.match(result.css, /--accent:\s*#8a3ffc/);
  assert.match(result.css, /var\(--fg,\s*#eee\)/);
  assert.match(result.css, /var\(--bg\)/);
  assert.equal(result.translated.variableCount, 4);
  assert.deepEqual(result.warnings, []);
});

test("rewrites known app-root and dark-mode selectors while preserving media rules", () => {
  const result = translateBetterDiscordTheme(`@media (min-width: 600px) { #app-mount .appMount-2yBXZl { color: var(--text-normal); } .theme-dark .window { background: var(--background-secondary); } }`);
  assert.match(result.css, /@media \(min-width: 600px\)/);
  assert.match(result.css, /\[data-ada-component="app-shell"\]/);
  assert.match(result.css, /html\[data-theme-mode="dark"\]/);
  assert.equal(result.translated.selectorCount, 3);
  assert.equal(result.warnings.length, 0);
});

test("supports exact per-theme selector overrides and reports unknown hashed Discord selectors", () => {
  const result = translateBetterDiscordTheme(`.guilds-2JjMmN .custom { color: red; }`, {
    selectorMap: { ".guilds-2JjMmN .custom": '[data-ada-component="file-list"] .custom' }
  });
  assert.match(result.css, /data-ada-component="file-list"/);
  assert.equal(result.warnings.length, 0);

  const unmatched = translateBetterDiscordTheme(`.guilds-2JjMmN { color: red; }`);
  assert.ok(unmatched.warnings.some((warning) => warning.includes("Unmapped Discord selector component")));
});

test("reports Discord CSS-module class hashes with underscores", () => {
  const result = translateBetterDiscordTheme(`.appMount__51fd7 .wrapper_ef3116 { color: red; }`);
  assert.ok(result.warnings.some((warning) => warning.includes(".appMount__51fd7")));
  assert.ok(result.warnings.some((warning) => warning.includes(".wrapper_ef3116")));
});

test("preserves keyframe steps and warns that imported styles are not translated", () => {
  const result = translateBetterDiscordTheme(`@import url("https://example.test/theme.css");\n@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }`);
  assert.match(result.css, /@import url\("https:\/\/example\.test\/theme\.css"\)/);
  assert.match(result.css, /@keyframes pulse/);
  assert.deepEqual(result.imports, ["https://example.test/theme.css"]);
  assert.ok(result.warnings.some((warning) => warning.includes("https://example.test/theme.css") && warning.includes("not analyzed or translated")));
  assert.equal(result.mapVersion, COMPATIBILITY_MAP_VERSION);
});

test("rejects invalid CSS with a parser error", () => {
  assert.throws(() => translateBetterDiscordTheme(".broken { color: red;"), /Unclosed block/);
});
