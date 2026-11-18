const test = require("node:test");
const assert = require("node:assert/strict");

test("server cache uses TTLs and falls back cleanly when the cache is unavailable", async () => {
  const { createServerCache } = await import("../lib/api/server-cache.js");
  const values = new Map();
  const writes = [];
  const client = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options) {
      values.set(key, value);
      writes.push({ key, value, options });
    }
  };
  const cache = createServerCache(async () => client);

  assert.equal(await cache.set("key", "value", 300), true);
  assert.equal(await cache.get("key"), "value");
  assert.deepEqual(writes, [{ key: "key", value: "value", options: { ex: 300 } }]);

  const warnings = [];
  const failedCache = createServerCache(
    async () => ({ get: async () => { throw new Error("offline"); }, set: async () => { throw new Error("offline"); } }),
    { warn: (...args) => warnings.push(args) }
  );
  assert.equal(await failedCache.get("key"), null);
  assert.equal(await failedCache.set("key", "value", 60), false);
  assert.equal(warnings.length, 2);

  const unavailableCache = createServerCache(
    async () => { throw new Error("unavailable"); },
    { warn: (...args) => warnings.push(args) }
  );
  assert.equal(await unavailableCache.get("key"), null);
  assert.equal(await unavailableCache.set("key", "value", 60), false);
  assert.equal(warnings.length, 4);
});
