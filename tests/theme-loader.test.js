const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const loaderSource = fs.readFileSync(path.join(__dirname, "../bin/theme-loader.js"), "utf8");

function createHarness() {
  const elements = new Map();
  const scripts = [];
  const timers = new Map();
  let nextTimerId = 0;
  const makeElement = (id) => ({
    id,
    hidden: id === "adaThemeLoadWarning",
    attributes: {},
    listeners: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      contains(value) { return this.values.has(value); },
      toggle(value, enabled) {
        if (enabled) this.values.add(value);
        else this.values.delete(value);
      }
    },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    setAttribute(name, value) { this.attributes[name] = value; }
  });
  const ids = [
    "adaThemeDashboard",
    "adaThemeStatus",
    "adaThemeLoadWarning",
    "adaThemeRetry",
    "adaThemeRefresh",
    "adaThemeSkip"
  ];
  for (const id of ids) elements.set(id, makeElement(id));
  const launcher = makeElement("themeLauncher");
  const window = {
    location: { reload() { window.reloaded = true; } },
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  const document = {
    head: {
      appendChild(script) { scripts.push(script); }
    },
    createElement() {
      return { remove() { this.removed = true; } };
    },
    getElementById(id) { return elements.get(id) || null; },
    querySelectorAll(selector) {
      return selector === "[data-ada-theme-launcher]" ? [launcher] : [];
    }
  };
  vm.runInNewContext(loaderSource, { window, document, console: { error() {} } });
  return { document, elements, launcher, scripts, timers, window };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("theme assets load only on demand and retry after a load failure", async () => {
  const harness = createHarness();
  const { elements, scripts, window } = harness;

  assert.equal(scripts.length, 0);
  window.openThemeDashboard();
  assert.equal(scripts[0].src, "/bin/theme-compat.js");
  scripts[0].onerror();
  await flushPromises();
  assert.equal(elements.get("adaThemeLoadWarning").hidden, false);

  elements.get("adaThemeRetry").listeners.click();
  const compatibilityScript = scripts[1];
  assert.equal(compatibilityScript.src, "/bin/theme-compat.js");
  window.AdaThemeCompat = {};
  compatibilityScript.onload();
  await flushPromises();

  const runtimeScript = scripts[2];
  assert.equal(runtimeScript.src, "/bin/theme-runtime.js");
  let dashboardOpened = 0;
  window.openThemeDashboard = () => { dashboardOpened += 1; };
  window.__adaThemeRuntimeReady = true;
  runtimeScript.onload();
  await flushPromises();

  assert.equal(dashboardOpened, 1);
  assert.equal(elements.get("adaThemeLoadWarning").hidden, true);
});

test("slow theme loading can be skipped for the current visit", () => {
  const harness = createHarness();
  const { elements, launcher, scripts, timers, window } = harness;

  window.openThemeDashboard();
  const slowTimer = [...timers.values()].find((timer) => timer.delay === 4000);
  assert.ok(slowTimer);
  slowTimer.callback();
  assert.equal(elements.get("adaThemeLoadWarning").hidden, false);
  elements.get("adaThemeRefresh").listeners.click();
  assert.equal(window.reloaded, true);

  elements.get("adaThemeSkip").listeners.click();
  assert.equal(scripts[0].removed, true);
  assert.equal(launcher.hidden, true);
  assert.equal(elements.get("adaThemeDashboard").classList.contains("active"), false);
  assert.equal(elements.get("adaThemeLoadWarning").hidden, true);
});
