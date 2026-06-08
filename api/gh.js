// api/gh.js — Vercel serverless function
// Proxies GitHub Contents API calls so the PAT never has to be stored in the repo.
//
// Required Vercel environment variables:
//   GITHUB_PAT      — GitHub PAT (classic `repo` scope, or fine-grained Contents: read+write)
//
// Supported POST actions:
//   { action: "getFile", path }
//     → { sha }  (null if file doesn't exist)
//
//   { action: "getFileContent", path }
//     → { sha, content }  (content is base64, newlines stripped; null if not found)
//
//   { action: "putFile", path, content, message, sha }
//     → { ok: true }
//
//   { action: "deleteFile", path, sha, message }
//     → { ok: true }

const REPO = process.env.GITHUB_REPO;

function authHeader(pat) {
  return pat.startsWith('github_pat_') ? `Bearer ${pat}` : `token ${pat}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, path: filePath, content, sha, message } = req.body || {};

  // ── All actions require the PAT ──────────────────────────────────────────
  const pat = (process.env.GITHUB_PAT || '').trim();
  if (!pat) {
    return res.status(503).json({ error: 'GITHUB_PAT is not configured in Vercel environment variables.' });
  }

  const auth = authHeader(pat);
  const ghBase = `https://api.github.com/repos/${REPO}/contents`;

  function encodePath(p) {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  // ── LATEST COMMIT SHA ────────────────────────────────────────────────────
  if (action === 'latestCommit') {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=1`, {
      headers: { Authorization: auth, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Vercel-Serverless-Proxy' }
    });
    if (r.ok) {
      const data = await r.json();
      const sha = Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
      return res.status(200).json({ sha });
    }
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub commits failed (${r.status})` });
  }

  // ── GET FILE SHA ──────────────────────────────────────────────────────────
  if (action === 'getFile') {
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    const r = await fetch(`${ghBase}/${encodePath(filePath)}`, {
      headers: { Authorization: auth, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Vercel-Serverless-Proxy' }
    });
    if (r.ok) { const d = await r.json(); return res.status(200).json({ sha: d.sha }); }
    if (r.status === 404) return res.status(200).json({ sha: null });
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub GET failed (${r.status})` });
  }

  // ── GET FILE CONTENT (sha + base64 content) ───────────────────────────────
  if (action === 'getFileContent') {
    if (!filePath) return res.status(400).json({ error: 'Missing path' });
    const r = await fetch(`${ghBase}/${encodePath(filePath)}`, {
      headers: { Authorization: auth, Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Vercel-Serverless-Proxy' }
    });
    if (r.ok) {
      const d = await r.json();
      // GitHub wraps base64 at 60 chars with \n — strip them for direct re-use in putFile
      return res.status(200).json({ sha: d.sha, content: d.content.replace(/\n/g, '') });
    }
    if (r.status === 404) return res.status(200).json({ sha: null, content: null });
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub GET failed (${r.status})` });
  }

  // ── PUT FILE (create or update) ───────────────────────────────────────────
  if (action === 'putFile') {
    if (!filePath || !content || !message) {
      return res.status(400).json({ error: 'Missing path, content, or message' });
    }
    const body = { message, content };
    if (sha) body.sha = sha;
    const r = await fetch(`${ghBase}/${encodePath(filePath)}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json', 'User-Agent': 'Vercel-Serverless-Proxy' },
      body: JSON.stringify(body)
    });
    if (r.ok) return res.status(200).json({ ok: true });
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub PUT failed (${r.status})` });
  }

  // ── DELETE FILE ───────────────────────────────────────────────────────────
  if (action === 'deleteFile') {
    if (!filePath || !sha) return res.status(400).json({ error: 'Missing path or sha' });
    const body = { message: message || `Delete: ${filePath}`, sha };
    const r = await fetch(`${ghBase}/${encodePath(filePath)}`, {
      method: 'DELETE',
      headers: { Authorization: auth, 'Content-Type': 'application/json', 'User-Agent': 'Vercel-Serverless-Proxy' },
      body: JSON.stringify(body)
    });
    if (r.ok) return res.status(200).json({ ok: true });
    const err = await r.json().catch(() => ({}));
    return res.status(r.status).json({ error: err.message || `GitHub DELETE failed (${r.status})` });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
