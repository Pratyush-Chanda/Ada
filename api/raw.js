// api/raw.js — Vercel serverless function
// Fetches a file from the private GitHub repo using GITHUB_PAT and pipes it back
// with the correct Content-Type so the Microsoft Office Online viewer can reach it.
//
// Usage:  GET /api/raw?path=some/folder/file.docx
// The Office viewer calls:
//   https://view.officeapps.live.com/op/embed.aspx?src=https://your-app.vercel.app/api/raw?path=...

const REPO = process.env.GITHUB_REPO;

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  // Fetch file metadata from GitHub Contents API to get download_url
  const encodedPath = repoPath.split('/').map(encodeURIComponent).join('/');
  const metaRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${encodedPath}`,
    { headers: { Authorization: authHeader(pat), Accept: 'application/vnd.github.v3+json' } }
  );

  if (metaRes.status === 404) {
    return res.status(404).json({ error: 'File not found' });
  }
  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    return res.status(metaRes.status).json({ error: err.message || 'GitHub API error' });
  }

  const meta = await metaRes.json();

  // Use download_url which gives the raw file bytes directly
  const rawRes = await fetch(meta.download_url, {
    headers: { Authorization: authHeader(pat) }
  });

  if (!rawRes.ok) {
    return res.status(rawRes.status).json({ error: 'Failed to fetch raw file' });
  }

  // Determine Content-Type from extension
  const ext = filePath.split('.').pop().toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Pipe the file back with correct headers
  // Cache for 5 minutes — short enough to stay fresh, long enough for the viewer to load
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const buffer = Buffer.from(await rawRes.arrayBuffer());
  return res.status(200).send(buffer);
}
