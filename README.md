# Ada

> A self-hosted document browser and knowledge management web app — deployed on Vercel, backed by GitHub.

![Ada — main interface](placeholder-main-interface.png)

---

## Table of Contents

1. [What is Ada](#what-is-ada)
2. [Features](#features)
3. [Technical Architecture](#technical-architecture)
4. [Project Structure](#project-structure)
5. [Environment Variables](#environment-variables)
6. [Getting Started](#getting-started)
7. [Deployment](#deployment)
8. [Credits](#credits)

---

## What is Ada

Ada is a web-based file browser and document viewer that uses a **GitHub repository as its file store**. Files live in your repo; Ada reads them through the GitHub API and renders them in a clean, feature-rich interface — with full support for Markdown, PDFs, Office documents, spreadsheets, math notation, diagrams, and code.

The app is deployed entirely on Vercel (static frontend + serverless API functions). There is no dedicated server to maintain — GitHub holds the content, Upstash Redis holds user sessions, and Vercel Blob holds pending uploads until they are reviewed.

---

## Features

### File Browser

Ada reads a `files.json` manifest from your GitHub repo and builds an interactive file tree from it. Folders are collapsible, files open in preview windows, and a breadcrumb trail tracks your location.

![File browser and folder navigation](placeholder-file-browser.png)

- Navigate folders with click or keyboard
- Breadcrumb trail and back navigation
- Emoji file-type icons (📝 Markdown, 📕 PDF, 📘 Word, 📗 Excel, 📙 PowerPoint…)
- Right-click context menu for Preview or Download

### Document Preview

Click any file to open a floating preview window. Multiple files can be open at once on desktop, each in its own draggable, resizable window with a minimise button that docks it to a taskbar at the bottom.

![Floating document preview windows with taskbar](placeholder-preview-windows.png)

Supported formats:

- **Markdown** — full rendering with all extensions (see below)
- **PDF** — in-browser PDF viewer via PDF.js
- **DOCX / XLSX / PPTX / PPT** — rendered via Microsoft Office Online viewer
- **Images** — inline display
- **Plain text and code** — syntax-highlighted

### Rich Markdown Rendering

Markdown files are rendered with a full scientific extension stack:

- **MathJax 3** — inline `\(...\)` and display `\[...\]` LaTeX math
- **TikZJax** — renders `` ```tikz `` fenced blocks as TikZ/PGF diagrams using a WASM TeX engine
- **Mermaid** — `` ```mermaid `` blocks for flowcharts, sequence diagrams, and more
- **Desmos** — interactive graphing calculator embeds
- **Highlight.js** — syntax highlighting for code blocks, auto light/dark themed
- **Obsidian syntax compatibility** — Obsidian-flavoured Markdown (callouts, wikilinks, etc.) renders correctly
- Footnotes, subscript, superscript via markdown-it plugins

![Markdown rendering with math, diagrams, and code](placeholder-markdown-rendering.png)

### Authentication

A full email + password auth system is built in, backed by Upstash Redis and secured with industry-standard practices.

![Login and registration screens](placeholder-auth-screens.png)

- **Register** — email + password (min. 8 characters), reCAPTCHA v3
- **Login** — JWT issued on success, session lasts 30 days
- **Forgot Password** — email reset link via Resend, valid for 15 minutes, 15-minute cooldown between requests
- **Security** — bcrypt (10 salt rounds), JWT, reCAPTCHA v3, rate limiting

### Anonymous Upload & Review Queue

Any visitor can submit a file for admin review without logging in. Uploaded files are held in Vercel Blob storage and their metadata queued in the GitHub repo until an admin approves or rejects them.

![Upload flow and admin review queue](placeholder-upload-queue.png)

- Drag-and-drop or click-to-pick file upload
- 25 MB per-file size limit enforced server-side
- Upload queue stored in `waiting-list/index.json` in the repo
- Approved files are committed to the repo and appear in the file tree

### Admin Panel

Admins access a management panel from the toolbar. Role-based permissions (Create, Delete, Modify, Approve) can be assigned per admin code.

![Admin panel overview](placeholder-admin-panel.png)

Inside the panel:

- **Pending Uploads** — review, approve, or reject queued submissions
- **SSH User Management** — manage SSH-authenticated users
- **Admin Code Management** — create, revoke, and rotate admin codes (super-admin only)
- **Developer Console** — an SSH-style browser terminal (`admin-terminal.js`) for inspecting users, logs, and session state

![Admin terminal](placeholder-admin-terminal.png)

### PWA & Offline Support

Ada is a Progressive Web App. The service worker pre-caches the app shell, fonts, and all CDN assets on first load. Subsequent visits load instantly and work offline (file content requires a network connection, but the app shell and previously-cached assets are available).

### Mobile Support

A dedicated mobile layout (`bin/mobile.js`) adapts the interface for small screens — the floating-window desktop model is replaced with a full-screen drawer-style preview.

![Mobile interface](placeholder-mobile.png)

### Installer Wizard

`installer.html` is a step-by-step setup wizard for configuring a new Ada instance. It walks through:

1. Entering a GitHub PAT and detecting the repo
2. Naming the instance
3. Triggering and monitoring GitHub Actions workflows
4. Setting up Vercel (with exact env var instructions)
5. Entering the Vercel deployment URL and patching it into the repo

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│  index.html + bin/*.js + bin/style.css              │
│  (Vanilla JS, no framework)                         │
└────────────────────┬────────────────────────────────┘
                     │  fetch()
          ┌──────────▼──────────┐
          │   Vercel Serverless  │
          │   /api/*.js / .mjs   │
          └──┬────┬─────┬───┬───┘
             │    │     │   │
     GitHub  │  Blob  Redis  Resend
     API     │  Store (Upstash)  Email
```

### Frontend

- Pure HTML5 + CSS + Vanilla JavaScript — no frontend framework
- `bin/app.js` — core file tree, window management, preview routing
- `bin/auth.js` — session/token management on the client
- `bin/modern-auth.js` — email+password auth UI controllers
- `bin/upload.js` — upload flow and waiting-list management
- `bin/mobile.js` — mobile-specific layout and interactions
- `bin/markdown.js` + `bin/md-init.js` — Markdown rendering pipeline
- `bin/obsidian-markdown-it.js` — Obsidian syntax compatibility layer
- `bin/style.css` — all styling via CSS custom properties / design tokens
- `bin/tikzjax/` — bundled TikZJax WASM engine

### Backend (Vercel Serverless Functions)

| File | Purpose |
|---|---|
| `api/config.js` | Exposes public env vars to the frontend on app load |
| `api/auth.mjs` | Register, login, forgot password, reset password |
| `api/gh.js` | GitHub Contents API proxy (getFile, putFile, deleteFile) |
| `api/raw.js` | Serves raw file bytes from the GitHub repo (for Office viewer) |
| `api/blob.js` | Vercel Blob proxy (upload, delete, fetch) |
| `api/desmos.js` | Proxies the Desmos calculator JS (keeps the API key server-side) |
| `api/ssh.js` | SSH-key auth backend (legacy, uses a separate Upstash Redis instance) |

### Storage

| Store | What it holds |
|---|---|
| **GitHub repo** | All content files, `files.json` manifest, `waiting-list/index.json` |
| **Upstash Redis** (`KV_REST_API_*`) | User accounts, JWT sessions, password-reset tokens |
| **Upstash Redis** (`DATABASE_KV_*`) | SSH auth data (separate database) |
| **Vercel Blob** | Pending upload file bytes (before admin approval) |

---

## Project Structure

```
ada/
├── index.html                  # App entry point (single-page app shell)
├── offline.html                # Shown by service worker when offline
├── installer.html              # Setup wizard for new instances
├── service-worker.js           # PWA caching strategy
├── manifest.json               # PWA manifest (name, icons, theme colour)
├── files.json                  # File tree manifest (read by the app)
├── favicon.png                 # App icon
├── package.json                # npm dependencies (Vercel runtime)
│
├── api/                        # Vercel serverless functions
│   ├── config.js               # Public env var endpoint
│   ├── auth.mjs                # Auth (register / login / password reset)
│   ├── gh.js                   # GitHub Contents API proxy
│   ├── raw.js                  # Raw file serving proxy
│   ├── blob.js                 # Vercel Blob proxy
│   ├── desmos.js               # Desmos API proxy
│   └── ssh.js                  # SSH auth backend (legacy)
│
├── bin/                        # Frontend JS & static assets
│   ├── app.js                  # Core app logic (file tree, windows, routing)
│   ├── auth.js                 # Client-side session management
│   ├── modern-auth.js          # Email+password auth UI
│   ├── upload.js               # Upload flow & waiting-list helpers
│   ├── mobile.js               # Mobile layout
│   ├── markdown.js             # Markdown rendering
│   ├── md-init.js              # Markdown initialisation
│   ├── obsidian-markdown-it.js # Obsidian syntax layer
│   ├── admin-terminal.js       # In-browser admin terminal
│   ├── gh-proxy.js             # Client-side GitHub proxy helpers
│   ├── ssh-auth.js             # SSH auth client helpers (legacy)
│   ├── ssh-crypto.js           # SSH key crypto (legacy)
│   ├── ssh-login-ui.js         # SSH login UI (legacy)
│   ├── style.css               # All styles (CSS custom properties)
│   ├── admins.json             # Admin code list (managed via panel)
│   └── tikzjax/                # Bundled TikZJax WASM engine
│       └── output/tikzjax.js
│
├── community/
│   └── community.html          # Community page
│
└── waiting-list/
    └── index.json              # Pending upload queue metadata
```

---

## Environment Variables

Set these in your Vercel project dashboard under **Settings → Environment Variables**.

### Public (non-secret, exposed to the frontend via `/api/config`)

| Variable | Example | Description |
|---|---|---|
| `GITHUB_REPO` | `yourname/reponame` | The GitHub repository that stores your content |
| `GITHUB_BRANCH` | `main` | The branch to read from |
| `APP_URL` | `https://your-app.vercel.app` | Your Vercel deployment URL |
| `GITPAGE_URL` | `https://yourname.github.io/reponame` | Your GitHub Pages URL (used as CDN fallback) |

### Secret (server-side only, never sent to the browser)

| Variable | Description | Where to get it |
|---|---|---|
| `GITHUB_PAT` | GitHub Personal Access Token with `repo` scope (or fine-grained: Contents read+write) | [GitHub Developer Settings](https://github.com/settings/personal-access-tokens/new) |
| `JWT_SECRET` | Secret key for signing JWTs | `openssl rand -base64 32` |
| `RESEND_API_KEY` | API key for sending password-reset emails | [resend.com](https://resend.com) |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v3 server-side secret | [Google reCAPTCHA Console](https://www.google.com/recaptcha/admin) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for upload storage | Auto-populated by the Vercel Blob integration |
| `KV_REST_API_URL` | Upstash Redis URL — user accounts & sessions | [Upstash Console](https://console.upstash.com/) |
| `KV_REST_API_TOKEN` | Upstash Redis token (same database as above) | [Upstash Console](https://console.upstash.com/) |
| `DATABASE_KV_REST_API_URL` | Upstash Redis URL — SSH auth (separate database) | [Upstash Console](https://console.upstash.com/) |
| `DATABASE_KV_REST_API_TOKEN` | Upstash Redis token — SSH auth | [Upstash Console](https://console.upstash.com/) |
| `DESMOS_API_KEY` | Desmos API key (optional — degrades gracefully if unset) | [Desmos API](https://www.desmos.com/api) |

> `KV_REST_API_URL` and `KV_REST_API_TOKEN` are auto-populated by the **Vercel × Upstash Redis** marketplace integration if you connect it from the Vercel dashboard. Same for `BLOB_READ_WRITE_TOKEN` with the Vercel Blob integration.

---

## Getting Started

### Option A — Installer Wizard (recommended)

1. Fork this repository to your GitHub account.
2. Enable **GitHub Pages** on the repo (source: root of `main` branch).
3. Open `https://<your-username>.github.io/<repo-name>/installer.html`.
4. Follow the wizard — it will ask for a GitHub PAT, configure the repo, walk you through Vercel setup step by step, and patch the deployment URL back into the repo automatically.

### Option B — Manual Setup

**Prerequisites:** Node.js 18+, a Vercel account, an Upstash account.

1. **Fork / clone the repository**

   ```bash
   git clone https://github.com/yourname/ada.git
   cd ada
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set environment variables**

   Create `.env.local` at the project root for local development:

   ```env
   GITHUB_REPO=yourname/reponame
   GITHUB_BRANCH=main
   APP_URL=http://localhost:3000
   GITPAGE_URL=https://yourname.github.io/reponame

   GITHUB_PAT=your_github_pat
   JWT_SECRET=your_jwt_secret
   RESEND_API_KEY=your_resend_key
   RECAPTCHA_SECRET_KEY=your_recaptcha_secret
   KV_REST_API_URL=your_upstash_url
   KV_REST_API_TOKEN=your_upstash_token
   DATABASE_KV_REST_API_URL=your_ssh_upstash_url
   DATABASE_KV_REST_API_TOKEN=your_ssh_upstash_token
   DESMOS_API_KEY=your_desmos_key
   ```

4. **Run locally**

   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`.

---

## Deployment

Ada is designed to run on **Vercel**.

1. Push your fork to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import your repository.
3. Add all the environment variables listed above under **Settings → Environment Variables** before deploying.
4. Click **Deploy**.
5. Once deployed, set `APP_URL` to your Vercel deployment URL and redeploy.

Vercel will automatically re-deploy on every push to the configured branch.

---

## Credits

- **Pratyush Chanda**
- **Harshit Saha**

**Libraries & services used:**

- [Markdown-it](https://github.com/markdown-it/markdown-it) — Markdown parsing
- [MathJax 3](https://www.mathjax.org/) — LaTeX math rendering
- [TikZJax](https://github.com/kisonecat/tikzjax) — TikZ diagram rendering
- [Mermaid](https://mermaid.js.org/) — Flowchart and diagram rendering
- [Highlight.js](https://highlightjs.org/) — Code syntax highlighting
- [Desmos API](https://www.desmos.com/api) — Graphing calculator
- [Upstash Redis](https://upstash.com/) — Serverless Redis for auth storage
- [Resend](https://resend.com/) — Transactional email
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) — Upload staging storage
- [Google reCAPTCHA v3](https://developers.google.com/recaptcha) — Bot protection
- [Vercel](https://vercel.com/) — Deployment platform

---

**Ada** — your files, your way.
