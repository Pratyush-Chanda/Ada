const test = require("node:test");
const assert = require("node:assert/strict");

const originalResendApiKey = process.env.RESEND_API_KEY;
process.env.RESEND_API_KEY ||= "re_test";
const routes = {
  auth: require("../api/auth.js"),
  blob: require("../api/blob.js"),
  config: require("../api/config.js"),
  desmos: require("../api/desmos.js"),
  gh: require("../api/gh.js"),
  raw: require("../api/raw.js"),
  ssh: require("../api/ssh.js")
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

  try {
    for (const [name, req, expectedStatus] of cases) {
      const res = createResponse();
      await routes[name](req, res);
      assert.equal(res.statusCode, expectedStatus, `${name} adapter should invoke its handler`);
    }
  } finally {
    if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendApiKey;
  }
});
