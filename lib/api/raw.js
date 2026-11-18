// lib/api/raw.js — Next.js Pages API handler
// Fetches a file from the private GitHub repo using GITHUB_PAT and pipes it back
// with the correct Content-Type so the Microsoft Office Online viewer can reach it.
//
// Usage:  GET /api/raw?path=some/folder/file.docx
// The Office viewer calls:
//   https://view.officeapps.live.com/op/embed.aspx?src=https://your-app.vercel.app/api/raw?path=...
import { serverCache } from "./server-cache.js";

const REPO = process.env.GITHUB_REPO;
const BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();
const METADATA_TTL_SECONDS = 300;
const CONTENT_TTL_SECONDS = 3600;
const MAX_CACHEABLE_CONTENT_BYTES = 512 * 1024;

const MIME_TYPES = {
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  svg:  'image/svg+xml',
  webp: 'image/webp',
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  mp4:  'video/mp4',
  webm: 'video/webm',
  txt:  'text/plain',
  md:   'text/plain',
  html: 'text/html',
  htm:  'text/html',
  css:  'text/css',
  js:   'application/javascript',
  json: 'application/json',
};

function authHeader(pat) {
  return pat.startsWith('github_pat_') ? `Bearer ${pat}` : `token ${pat}`;
}

function validMetadata(value) {
  return Boolean(value)
    && typeof value === 'object'
    && typeof value.sha === 'string'
    && typeof value.download_url === 'string'
    && typeof value.size === 'number';
}

function matchesEtag(header, etag) {
  return String(header || '').split(',').some((value) => {
    const candidate = value.trim();
    return candidate === '*' || candidate === etag;
  });
}

function cacheControl() {
  return process.env.GITHUB_REPO_PUBLIC === 'true'
    ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=1800'
    : 'private, max-age=60';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path query parameter' });
  }

  const pat = (process.env.GITHUB_PAT || '').trim();
  if (!pat) {
    return res.status(503).json({ error: 'GITHUB_PAT is not configured.' });
  }

  // Normalise path — files.json may store full raw.githubusercontent.com URLs.
  // Extract just the repo-relative portion so the GitHub Contents API receives a clean path.
  // Handles both:
  //   https://raw.githubusercontent.com/owner/repo/branch/some/file.txt  → some/file.txt
  //   some/file.txt  → some/file.txt (already relative, used as-is)
  let repoPath = filePath;
  const rawMatch = filePath.match(
    /^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/
  );
  if (rawMatch) {
    repoPath = rawMatch[1];
  } else if (filePath.startsWith('http')) {
    // Some other absolute URL we can't resolve — reject cleanly
    return res.status(400).json({ error: 'Unsupported URL format for path parameter' });
  }

  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const metadataKey = `ada:raw:v1:metadata:${encodeURIComponent(REPO)}:${encodeURIComponent(BRANCH)}:${encodeURIComponent(repoPath)}`;
  let meta = await serverCache.get(metadataKey);
  if (!validMetadata(meta)) {
    const metaRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${encodedPath}?ref=${encodeURIComponent(BRANCH)}`,
      { headers: { Authorization: authHeader(pat), Accept: 'application/vnd.github.v3+json' } }
    );

    if (metaRes.status === 404) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}));
      return res.status(metaRes.status).json({ error: err.message || 'GitHub API error' });
    }

    const responseMetadata = await metaRes.json();
    meta = {
      sha: responseMetadata.sha,
      size: responseMetadata.size,
      download_url: responseMetadata.download_url
    };
    if (validMetadata(meta)) {
      await serverCache.set(metadataKey, meta, METADATA_TTL_SECONDS);
    }
  }

  if (!validMetadata(meta)) {
    return res.status(502).json({ error: 'GitHub returned invalid file metadata' });
  }

  // Determine Content-Type from extension
  const ext = filePath.split('.').pop().toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  // Private repositories stay out of shared caches; public repositories can use the edge cache.
  res.setHeader('Cache-Control', cacheControl());
  res.setHeader('ETag', `"${meta.sha}"`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', contentType);
  if (matchesEtag(req.headers?.['if-none-match'], `"${meta.sha}"`)) {
    return res.status(304).end();
  }

  const contentKey = `ada:raw:v1:content:${encodeURIComponent(REPO)}:${meta.sha}`;
  let buffer = null;
  if (meta.size <= MAX_CACHEABLE_CONTENT_BYTES) {
    const cachedContent = await serverCache.get(contentKey);
    if (typeof cachedContent === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(cachedContent)) {
      buffer = Buffer.from(cachedContent, 'base64');
    }
  }

  if (!buffer) {
    const rawRes = await fetch(meta.download_url, {
      headers: { Authorization: authHeader(pat) }
    });

    if (!rawRes.ok) {
      return res.status(rawRes.status).json({ error: 'Failed to fetch raw file' });
    }

    buffer = Buffer.from(await rawRes.arrayBuffer());
    if (meta.sha && meta.size <= MAX_CACHEABLE_CONTENT_BYTES) {
      await serverCache.set(contentKey, buffer.toString('base64'), CONTENT_TTL_SECONDS);
    }
  }
  return res.status(200).send(buffer);
}
