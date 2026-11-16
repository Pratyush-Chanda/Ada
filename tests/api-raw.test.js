const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("raw file proxy requests contents from the configured branch", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/raw.js"), "utf8");
  const executableSource = source.replace(
    "export default async function handler",
    "async function handler"
  );
  assert.notEqual(executableSource, source, "expected to find the exported handler");

  const requests = [];
  const handler = vm.runInNewContext(`${executableSource}\nhandler`, {
    Buffer,
    process: {
      env: {
        GITHUB_REPO: "Pratyush-Chanda/Ada",
        GITHUB_BRANCH: "feature/newux",
        GITHUB_PAT: "test-token"
      }
    },
    fetch: async (url) => {
      requests.push(url);
      if (url.startsWith("https://api.github.com/")) {
        if (!url.endsWith("?ref=feature%2Fnewux")) {
          return { status: 404, ok: false };
        }
        return {
          status: 200,
          ok: true,
          json: async () => ({ download_url: "https://raw.example.test/branch-only.docx" })
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer
      };
    }
  });

  const response = {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  await handler({ method: "GET", query: { path: "branch-only.docx" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.deepEqual([...response.body], [1, 2, 3]);
  assert.equal(
    requests[0],
    "https://api.github.com/repos/Pratyush-Chanda/Ada/contents/branch-only.docx?ref=feature%2Fnewux"
  );
});
