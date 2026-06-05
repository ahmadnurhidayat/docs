# 📓 docs

[![License](https://img.shields.io/github/license/ahmadnurhidayat/docs?style=flat-square&color=4169E1)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Static%20Hosting-lightgrey?style=flat-square)](https://pages.github.com/)

A static knowledge base and engineering notebook. **docs** is designed for engineers who want a lightning-fast, searchable, and distraction-free platform to organize runbooks, cheat sheets, lab notes, and portfolios using pure Markdown.

🌐 **Live Demo**: [docs.beyondyou.my.id](https://docs.beyondyou.my.id/)

---

## ✨ Features

- **Lightning Fast & Static** — Built with [Astro](https://astro.build) for optimal performance. Zero database queries.
- **Full-Text Search** — Powered by [Pagefind](https://pagefind.app) for instant search across all documents.
- **Modern Aesthetics** — Clean layout, elegant typography, responsive design, and dark/light mode toggle.
- **Auto-Generated Navigation** — Sidebar and breadcrumbs are dynamically generated from your `content/` folder structure.
- **Build-Time Syntax Highlighting** — Native Shiki highlighting for HCL, YAML, Bash, Python, Dockerfile, JSON, and more.
- **One-Click Code Copy** — Interactive copy button on all code snippets with collapse for long blocks.
- **Serverless Deployment** — Perfect for GitHub Pages, Cloudflare Pages, Vercel, or any static host.

---

## 📂 Directory Structure

The content is logically organized into dedicated modules:

| Directory | Purpose |
| :--- | :--- |
| `content/01-knowledge-base/` | In-depth technical guides (AWS, Kubernetes, SRE, CI/CD, IaC) |
| `content/02-interview-prep/` | Dynamic cheat sheets and core platform engineering Q&A |
| `content/03-labs/` | Step-by-step platform engineering lab tutorials |
| `content/99-cv/` | Professional curriculum vitae formatted in Markdown |

---

## 🛠️ Getting Started (Local Development)

Launch your personal knowledge base locally in under 5 minutes.

### Prerequisites
* **Git**
* **Node.js** v20+

### 1. Clone the Repository
```bash
git clone https://github.com/ahmadnurhidayat/docs.git
cd docs
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Add Your Content
Add or modify `.md` files inside the `content/` directory. Subdirectories automatically map to navigation categories.
```
content/
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
npm run dev
```
Visit **http://localhost:4321** in your browser.

### 5. Build for Production
Build the static site:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

---

## 🌐 Automated Deployment (GitHub Pages)

This repository includes a pre-configured GitHub Actions pipeline (`.github/workflows/deploy.yml`) to automatically rebuild and host your site for free.

1. **Fork** this repository.
2. Go to your repository **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment**, set the **Source** to **GitHub Actions**.
4. Push any changes to the `main` branch to trigger an automatic deployment.

Your site will automatically go live at:
```
https://<your-github-username>.github.io/docs/
```

---

## 📁 Repository Layout

```
docs/
├── .github/
│   └── workflows/
│       └── d.yaml            # Automated GitHub Actions build & deploy pipeline
├── content/                  # Write your Markdown documents here
│   ├── 01-knowledge-base/
│   ├── 02-interview-prep/
│   ├── 03-labs/
│   └── 99-cv/
├── src/                      # Astro source files
│   ├── components/           # Reusable UI components
│   ├── layouts/              # Page layouts
│   ├── pages/                # Routes and pages
│   ├── scripts/              # Client-side TypeScript
│   ├── styles/               # Global and component CSS
│   └── utils/                # Utility functions
├── public/                   # Static assets (favicon, images)
├── astro.config.mjs          # Astro configuration
├── package.json              # Dependencies and scripts
└── README.md
```

---

## 📄 License

Distributed under the MIT License. Feel free to fork, adapt, and build your own.
