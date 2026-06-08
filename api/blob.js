// api/blob.js — Vercel Blob Storage proxy
// Keeps BLOB_READ_WRITE_TOKEN server-side; the browser never sees it.
//
// POST body: { action, ...params }
//   action = 'upload'  → { filename: string, content: base64 }  → { url }
//   action = 'delete'  → { url: string }                        → {}
//   action = 'fetch'   → { url: string }                        → { content: base64 }

import { put, del } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, filename, content, url } = req.body || {};

  try {
    // ── UPLOAD ──────────────────────────────────────────────────────────────
    if (action === 'upload') {
      if (!filename || !content) {
        return res.status(400).json({ error: 'Missing filename or content' });
      }

      // Decode base64 → Buffer
      const buffer = Buffer.from(content, 'base64');

      // Enforce 25 MB limit server-side (can't trust the client check alone)
      if (buffer.byteLength > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'File exceeds 25 MB limit' });
      }

      const blob = await put(filename, buffer, {
        access: 'private',   // Not publicly guessable; served only via this proxy
        addRandomSuffix: false
      });

      return res.status(200).json({ url: blob.url });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!url) return res.status(400).json({ error: 'Missing url' });
      await del(url);
      return res.status(200).json({ ok: true });
    }

    // ── FETCH (for preview / download / approve) ──────────────────────────
    if (action === 'fetch') {
      if (!url) return res.status(400).json({ error: 'Missing url' });

      // Fetch from Vercel Blob using the token automatically via the SDK
      const blobRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`
        }
      });

      if (!blobRes.ok) {
        return res.status(blobRes.status).json({ error: `Blob fetch failed: ${blobRes.status}` });
      }

      const buffer = Buffer.from(await blobRes.arrayBuffer());
      return res.status(200).json({ content: buffer.toString('base64') });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[api/blob]', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}