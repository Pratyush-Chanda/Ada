const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("raw file proxy requests contents from the configured branch", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/api/raw.js"), "utf8");
  const executableSource = source
    .replace('import { serverCache } from "./server-cache.js";\n', "")
    .replace("export default async function handler", "async function handler");
  assert.notEqual(executableSource, source, "expected to find the exported handler");

  const requests = [];
  const cacheWrites = [];
  const handler = vm.runInNewContext(`${executableSource}\nhandler`, {
    Buffer,
    serverCache: {
      get: async () => null,
      set: async (...args) => { cacheWrites.push(args); }
    },
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
          json: async () => ({
            download_url: "https://raw.example.test/branch-only.docx",
            sha: "branch-only-sha",
            size: 3
          })
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
    end() { this.ended = true; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  await handler({ method: "GET", query: { path: "branch-only.docx" }, headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(response.headers["Cache-Control"], "private, max-age=60");
  assert.equal(response.headers.ETag, '"branch-only-sha"');
  assert.deepEqual([...response.body], [1, 2, 3]);
  assert.equal(cacheWrites.length, 2);
  assert.equal(cacheWrites[0][2], 300);
  assert.equal(cacheWrites[1][2], 3600);
  assert.equal(
    requests[0],
    "https://api.github.com/repos/Pratyush-Chanda/Ada/contents/branch-only.docx?ref=feature%2Fnewux"
  );
});

test("raw file proxy serves cached content and returns 304 for a matching ETag", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../lib/api/raw.js"), "utf8");
  const executableSource = source
    .replace('import { serverCache } from "./server-cache.js";\n', "")
    .replace("export default async function handler", "async function handler");
  const metadata = {
    download_url: "https://raw.example.test/branch-only.txt",
    sha: "cached-sha",
    size: 3
  };
  const contentKey = "ada:raw:v1:content:Pratyush-Chanda%2FAda:cached-sha";
  const fetchCalls = [];
  const env = {
    GITHUB_REPO: "Pratyush-Chanda/Ada",
    GITHUB_BRANCH: "feature/newux",
    GITHUB_PAT: "test-token"
  };
  const handler = vm.runInNewContext(`${executableSource}\nhandler`, {
    Buffer,
    serverCache: {
      get: async (key) => key.includes(":metadata:") ? metadata : key === contentKey ? "AQID" : null,
      set: async () => {}
    },
    process: { env },
    fetch: async (url) => {
      fetchCalls.push(url);
      throw new Error("cached requests should not reach GitHub");
    }
  });
  const response = {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };

  await handler({ method: "GET", query: { path: "branch-only.txt" }, headers: {} }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual([...response.body], [1, 2, 3]);
  assert.equal(fetchCalls.length, 0);

  const notModifiedResponse = {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; return this; }
  };
  await handler(
    { method: "GET", query: { path: "branch-only.txt" }, headers: { "if-none-match": '"cached-sha"' } },
    notModifiedResponse
  );
  assert.equal(notModifiedResponse.statusCode, 304);
  assert.equal(notModifiedResponse.ended, true);
  assert.equal(fetchCalls.length, 0);

  env.GITHUB_REPO_PUBLIC = "true";
  const publicResponse = {
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; }
  };
  await handler({ method: "GET", query: { path: "branch-only.txt" }, headers: {} }, publicResponse);
  assert.equal(publicResponse.headers["Cache-Control"], "public, max-age=0, s-maxage=300, stale-while-revalidate=1800");
});
