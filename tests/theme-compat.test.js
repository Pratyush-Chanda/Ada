const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMPATIBILITY_MAP_VERSION,
  ADA_SELECTOR_TARGETS,
  parseThemeMetadata,
  translateBetterDiscordTheme,
  translateBetterDiscordThemeWithImports
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
  assert.match(result.css, /html\[data-theme-mode\]/);
  assert.match(result.css, /var\(--fg,\s*#eee\)/);
  assert.match(result.css, /var\(--bg\)/);
  assert.equal(result.translated.variableCount, 4);
  assert.deepEqual(result.warnings, []);
});

test("maps semantic color families and reports per-family selector and variable coverage", () => {
  const result = translateBetterDiscordTheme(`:root { --background-tertiary: #222; --text-feedback-warning: #fc0; --status-danger: #f00; --button-positive-background: #0f0; --text-normal: #eee; } .guilds_2JjMmN .active { color: var(--text-feedback-warning); } .wrapper_ef3116 { color: red; }`, {
    selectorMap: { ".guilds_2JjMmN": ADA_SELECTOR_TARGETS.find((target) => target.label === "File list").selector }
  });

  assert.match(result.css, /--surface-raised:\s*#222/);
  assert.match(result.css, /--warning:\s*#fc0/);
  assert.match(result.css, /--danger:\s*#f00/);
  assert.match(result.css, /--success:\s*#0f0/);
  assert.match(result.css, /--fg:\s*#eee/);
  assert.match(result.css, /data-ada-component="file-list"/);
  assert.equal(result.translated.coverage.selectors.mapped, 2);
  assert.equal(result.translated.coverage.selectors.unmapped, 1);
  assert.equal(result.translated.coverage.selectors.byTarget["file-list"], 1);
  assert.equal(result.translated.coverage.variables.byFamily.status, 4);
  assert.equal(result.translated.coverage.variables.byFamily.text, 1);
});

test("avoids self-referential aliases and leaves role-specific colors unmapped", () => {
  const result = translateBetterDiscordTheme(`:root { --main-theme-color: #43b581; --brand-experiment: var(--main-theme-color); --unread-message-divider-color: #f04747; }`);
  assert.match(result.css, /--accent:\s*#43b581/);
  assert.match(result.css, /--brand-experiment:\s*var\(--accent\)/);
  assert.doesNotMatch(result.css, /--accent:\s*var\(--accent\)/);
  assert.doesNotMatch(result.css, /--accent:\s*#f04747/);
  assert.ok(result.warnings.some((warning) => warning.includes("self-referential --accent")));
  assert.ok(result.warnings.some((warning) => warning.includes("Unmapped Discord variable declaration: --unread-message-divider-color")));
});

test("rewrites known app-root and dark-mode selectors while preserving media rules", () => {
  const result = translateBetterDiscordTheme(`@media (min-width: 600px) { #app-mount .appMount-2yBXZl { color: var(--text-normal); } .theme-dark .window { background: var(--background-secondary); } }`);
  assert.match(result.css, /@media \(min-width: 600px\)/);
  assert.match(result.css, /\[data-ada-component="app-shell"\]/);
  assert.match(result.css, /html\[data-theme-mode="dark"\]/);
  assert.equal(result.translated.selectorCount, 3);
  assert.equal(result.warnings.length, 0);
});

test("normalizes visual-refresh mode wrappers and maps modern Discord palette variables", () => {
  const result = translateBetterDiscordTheme(`.visual-refresh.theme-dark, .visual-refresh .theme-dark { --brand-500: #89b4fa; --brand-600: #4085f7; --background-base-lowest: #11111b; --background-base-lower: #181825; --background-base-low: #1c1c2b; --background-accent: #45475a; --text-default: #cdd6f4; --text-strong: #cdd6f4; } .visual-refresh.theme-dark .interactive:hover { color: var(--text-default); }`);

  assert.doesNotMatch(result.css, /\.visual-refresh\s*html|\.visual-refreshhtml/);
  assert.match(result.css, /html\[data-theme-mode="dark"\]/);
  assert.match(result.css, /--accent:\s*#89b4fa/);
  assert.match(result.css, /--accent-hover:\s*#4085f7/);
  assert.match(result.css, /--bg:\s*#11111b/);
  assert.match(result.css, /--item:\s*#181825/);
  assert.match(result.css, /--hover:\s*#1c1c2b/);
  assert.match(result.css, /--fg:\s*#cdd6f4/);
  assert.match(result.css, /--background-accent:\s*#45475a/);
  assert.doesNotMatch(result.css, /--accent:\s*#45475a/);
  assert.match(result.css, /color:\s*var\(--fg\)/);
  assert.equal(result.translated.selectorCount, 3);
  assert.ok(result.warnings.some((warning) => warning.includes("Unmapped Discord variable declaration: --background-accent")));
  assert.equal(result.mapVersion, COMPATIBILITY_MAP_VERSION);
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

test("maps Discord app-root CSS-module selectors to stable Ada components", () => {
  const result = translateBetterDiscordTheme(`.appMount__51fd7 { background-image: var(--theme-background-image); } .app__160d8 { background: transparent; } .wrapper_ef3116 { width: 126px; }`);
  assert.match(result.css, /\[data-ada-component="app-shell"\]/);
  assert.match(result.css, /\[data-ada-component="file-list"\]/);
  assert.ok(result.warnings.some((warning) => warning.includes(".wrapper_ef3116")));
  assert.equal(result.translated.selectorCount, 2);
});

test("preserves keyframe steps and warns when a synchronous translation sees imports", () => {
  const result = translateBetterDiscordTheme(`@import url("https://example.test/theme.css");\n@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }`);
  assert.match(result.css, /@import url\("https:\/\/example\.test\/theme\.css"\)/);
  assert.match(result.css, /@keyframes pulse/);
  assert.deepEqual(result.imports, ["https://example.test/theme.css"]);
  assert.ok(result.warnings.some((warning) => warning.includes("https://example.test/theme.css") && warning.includes("not analyzed or translated")));
  assert.equal(result.mapVersion, COMPATIBILITY_MAP_VERSION);
});

test("fetches, recursively translates, and rebases CORS-accessible remote imports", async () => {
  const requests = [];
  const files = new Map([
    ["https://example.test/build/theme.css", `.appMount__51fd7 { background-image: url("../images/bg.jpg"); }\n@import url("nested.css");`],
    ["https://example.test/build/nested.css", `.app__160d8 { background: transparent; }`]
  ]);
  const result = await translateBetterDiscordThemeWithImports(`/**\n * @name Remote test\n */\n@import url("https://example.test/build/theme.css");\n:root { --main-theme-color: rgb(67, 181, 129); }`, {
    from: "RemoteTest.theme.css",
    fetch: async (url, options) => {
      requests.push({ url, options });
      const css = files.get(url);
      return { ok: Boolean(css), status: css ? 200 : 404, url, text: async () => css || "" };
    }
  });

  assert.deepEqual(result.imports, [
    "https://example.test/build/theme.css",
    "https://example.test/build/nested.css"
  ]);
  assert.deepEqual(result.resolvedImports, result.imports);
  assert.deepEqual(result.unresolvedImports, []);
  assert.doesNotMatch(result.css, /@import/);
  assert.match(result.css, /--accent:\s*rgb\(67, 181, 129\)/);
  assert.match(result.css, /\[data-ada-component="app-shell"\]/);
  assert.match(result.css, /\[data-ada-component="file-list"\]/);
  assert.match(result.css, /url\(https:\/\/example\.test\/images\/bg\.jpg\)/);
  assert.equal(result.translated.selectorCount, 3);
  assert.ok(requests.every(({ options }) => options.mode === "cors" && options.credentials === "omit"));
});

test("translates remote imports with layer, supports, and media qualifiers", async () => {
  const url = "https://example.test/qualified.css";
  const result = await translateBetterDiscordThemeWithImports(`@import url("${url}") layer(ada-theme) supports(display: grid) screen and (min-width: 20rem);`, {
    fetch: async (requestUrl) => ({
      ok: requestUrl === url,
      status: requestUrl === url ? 200 : 404,
      url: requestUrl,
      text: async () => `.appMount__51fd7 { --text-normal: #eee; }`
    })
  });

  assert.deepEqual(result.resolvedImports, [url]);
  assert.deepEqual(result.unresolvedImports, []);
  assert.match(result.css, /@layer ada-theme/);
  assert.match(result.css, /@supports \(display: grid\)/);
  assert.match(result.css, /@media screen and \(min-width: 20rem\)/);
  assert.match(result.css, /\[data-ada-component="app-shell"\]/);
  assert.match(result.css, /--fg:\s*#eee/);
});

test("preserves imports and reports the specific fetch failure when CORS or network access blocks translation", async () => {
  const url = "https://example.test/private.css";
  const result = await translateBetterDiscordThemeWithImports(`@import url("${url}");`, {
    fetch: async () => { throw new TypeError("Failed to fetch"); }
  });
  assert.match(result.css, /@import url\("https:\/\/example\.test\/private\.css"\)/);
  assert.deepEqual(result.imports, [url]);
  assert.equal(result.resolvedImports.length, 0);
  assert.ok(result.unresolvedImports.some((item) => item.url === url));
  assert.ok(result.warnings.some((warning) => warning.includes(url) && warning.includes("CORS, network, or size limit")));
});

test("rejects invalid CSS with a parser error", () => {
  assert.throws(() => translateBetterDiscordTheme(".broken { color: red;"), /Unclosed block/);
});
