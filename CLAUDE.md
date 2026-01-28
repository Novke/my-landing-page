# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal landing page built on Start Bootstrap Freelancer template (v7.0.7). Single-page portfolio site with navbar, masthead, portfolio grid with modals, about section, contact form, and footer.

## Build Commands

```bash
npm start          # Build and launch dev server with live reload
npm run build      # Full production build
npm run build:pug  # Compile Pug templates only
npm run build:scss # Compile SCSS only
npm run clean      # Remove dist directory
```

## Tech Stack

- **Templating**: Pug → HTML
- **Styling**: SCSS → CSS (with autoprefixer)
- **Framework**: Bootstrap 5.2.3
- **Icons**: Font Awesome 6.3.0 (CDN)
- **Dev Server**: Browser-sync with chokidar file watching

## Architecture

```
src/
├── pug/
│   ├── index.pug              # Main page template (all sections)
│   └── includes/              # Portfolio modal templates (1-6)
├── scss/
│   ├── styles.scss            # Entry point (imports all modules)
│   ├── _variables.scss        # Main variables
│   ├── variables/             # Color, typography, spacing configs
│   ├── components/            # Navbar, buttons, forms, divider
│   └── sections/              # Masthead, portfolio, footer styles
├── js/scripts.js              # Bootstrap interactions (navbar shrink, scrollspy)
└── assets/img/                # Images including portfolio/
```

**Output**: `dist/` directory contains compiled HTML, CSS, JS, and assets.

## Build System

Custom Node.js scripts in `/scripts` directory:
- File changes in `src/` trigger automatic rebuilds via chokidar
- Browser-sync provides live reload with 2-second debounce
- SCSS compilation includes autoprefixer and license header

## Deployment

GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys to `/srv/sites/novica/my-landing-page` on push to master, then reloads nginx.

## Code Style

- 4-space indentation (see `.editorconfig`)
- UTF-8 encoding
- Trim trailing whitespace (except markdown)
