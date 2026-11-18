const test = require("node:test");
const assert = require("node:assert/strict");

const routePaths = {
  auth: "../api/auth.js",
  blob: "../api/blob.js",
  config: "../api/config.js",
  desmos: "../api/desmos.js",
  gh: "../api/gh.js",
  raw: "../api/raw.js",
  ssh: "../api/ssh.js"
};

function createResponse() {
  return {
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    }
  };
}

test("root Vercel function adapters delegate to the shared API handlers", async () => {
  const originalResendApiKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY ||= "re_test";
  const routes = Object.fromEntries(
    await Promise.all(Object.entries(routePaths).map(async ([name, path]) => [
      name,
      (await import(path)).default
    ]))
  );

  for (const [name, handler] of Object.entries(routes)) {
    assert.equal(typeof handler, "function", `${name} adapter should export a handler`);
  }

  const cases = [
    ["auth", { method: "GET", query: {} }, 404],
    ["blob", { method: "GET", query: {} }, 405],
    ["config", { method: "GET", query: {} }, 200],
    ["gh", { method: "GET", query: {} }, 405],
    ["raw", { method: "GET", query: {}, headers: {} }, 400],
    ["ssh", { method: "GET", query: {} }, 405]
  ];

  for (const [name, req, expectedStatus] of cases) {
    const res = createResponse();
    await routes[name](req, res);
    assert.equal(res.statusCode, expectedStatus, `${name} adapter should invoke its handler`);
  }

  if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalResendApiKey;
});
