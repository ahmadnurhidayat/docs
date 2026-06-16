# docs

[![License](https://img.shields.io/github/license/ahmadnurhidayat/docs?style=flat-square&color=4169E1)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Static%20Hosting-lightgrey?style=flat-square)](https://pages.github.com/)

A static knowledge base and engineering notebook. **docs** is designed for engineers who want a lightning-fast, searchable, and distraction-free platform to organize runbooks, cheat sheets, lab notes, and portfolios using pure Markdown.

Live Demo: [docs.beyondyou.my.id](https://docs.beyondyou.my.id/)

## Features

- **Lightning Fast & Static** — Built with [Astro](https://astro.build) for optimal performance. Zero database queries.
- **Full-Text Search** — Powered by [Pagefind](https://pagefind.app) for instant search across all documents.
- **Modern Aesthetics** — Clean layout, elegant typography, responsive design, and dark/light mode toggle.
- **Auto-Generated Navigation** — Sidebar and breadcrumbs are dynamically generated from your content folder structure.
- **Build-Time Syntax Highlighting** — Native Shiki highlighting for HCL, YAML, Bash, Python, Dockerfile, JSON, and more.
- **One-Click Code Copy** — Interactive copy button on all code snippets with collapse for long blocks.
- **Serverless Deployment** — Perfect for GitHub Pages, Cloudflare Pages, Vercel, or any static host.

## Directory Structure

The content is logically organized into dedicated modules:

| Directory | Purpose |
| :--- | :--- |
| `src/content/docs/01-knowledge-base/` | In-depth technical guides (AWS, Kubernetes, SRE, CI/CD, IaC) |
| `src/content/docs/02-interview-prep/` | Dynamic cheat sheets and core platform engineering Q&A |
| `src/content/docs/03-labs/` | Step-by-step platform engineering lab tutorials |
| `src/content/docs/99-cv/` | Professional curriculum vitae formatted in Markdown |

## Getting Started (Local Development)

Launch your personal knowledge base locally in under 5 minutes.

### Prerequisites

- **Git**
- **Node.js** v22+
- **pnpm** (corepack enabled)

### 1. Clone the Repository

```bash
git clone https://github.com/ahmadnurhidayat/docs.git
cd docs
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Add Your Content

Add or modify `.md` files inside the `src/content/docs/` directory. Subdirectories automatically map to navigation categories.

```
src/content/docs/
├── 01-knowledge-base/
│   └── aws-vpc-peering.md
├── 02-interview-prep/
│   └── kubernetes-networking.md
└── 99-cv/
    └── resume.md
```

### 4. Development Server

Run the development server with hot reload:

```bash
pnpm dev
```

Visit **http://localhost:4321** in your browser.

### 5. Build for Production

Build the static site:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

## Repository Layout

```
docs/
├── .github/
│   └── workflows/
│       ├── ci.yaml               # Type check & build pipeline
│       ├── CodeQL.yml            # CodeQL security analysis
│       └── security.yaml         # TruffleHog, Gitleaks, Trivy scans
├── src/
│   ├── components/               # Reusable UI components
│   ├── content/
│   │   └── docs/                 # Markdown documents
│   │       ├── 01-knowledge-base/
│   │       ├── 02-interview-prep/
│   │       ├── 03-labs/
│   │       └── 99-cv/
│   ├── layouts/                  # Page layouts
│   ├── pages/                    # Routes and pages
│   ├── scripts/                  # Client-side TypeScript
│   ├── styles/                   # Global and component CSS
│   └── utils/                    # Utility functions
├── content.config.ts             # Astro content collection config
├── astro.config.mjs              # Astro configuration
├── package.json                  # Dependencies and scripts
├── pnpm-lock.yaml                # Lockfile
└── README.md
```

## License

Distributed under the MIT License. Feel free to fork, adapt, and build your own.
