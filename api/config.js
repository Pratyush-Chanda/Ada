// api/config.js — Vercel serverless function
// Exposes safe, non-secret environment variables to the frontend.
// Called once on app load: fetch('/api/config').then(r => r.json())
//
// Required Vercel environment variables:
//   GITHUB_REPO    — e.g. pratyushchanda/ada
//   GITHUB_BRANCH  — e.g. main
//   APP_URL        — e.g. https://ada-one-rho.vercel.app
//   GITPAGE_URL    — e.g. https://pratyushchanda.github.io/ada

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({
    GITHUB_REPO:   process.env.GITHUB_REPO   || '',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    APP_URL:       process.env.APP_URL        || '',
    GITPAGE_URL:   process.env.GITPAGE_URL    || '',
  });
}
