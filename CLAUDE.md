# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio site for Novica Trifković. **Hand-written static HTML/CSS/JS** — there is no build step. It began life as a Start Bootstrap Freelancer fork, but that template (Pug/SCSS/Bootstrap and the Node build pipeline) has been removed; the live site is the set of self-contained pages in `dist/`.

## Important: no build, edit `dist/` directly

There is no Pug, SCSS, or `npm` build. Each page in `dist/` is fully self-contained: all CSS lives in an inline `<style>` block and all JS in an inline `<script>` block. **Edit the `dist/*.html` files directly.** Do not look for a `src/` or run a build — they don't exist.

## Architecture

```
dist/
├── index.html          # Home: hero, about, featured skills, featured projects, contact
├── skills.html         # "See all skills" — full categorized skill inventory
├── projects.html       # "See all projects" — all projects by category
├── publications.html   # Research, publications, awards
└── assets/
    ├── favicon.ico
    └── img/
        ├── professional.jpg           # original professional portrait (source of the site palette)
        ├── wide-professional.jpg      # Photoshop-extended near-square variant with dark space on the left
        ├── wide-professional-web.jpg  # 1400px optimized copy used in the index hero (regenerate from wide-professional.jpg if replaced)
        ├── pfp.png, pfpmini.png   # older profile photos (currently unused, kept for future use)
        └── education/             # degree badges (currently unused, kept for future use)
```

- Shared "wine & gold" design system across all pages, derived from the professional portrait: warm near-black background (`--ink: #171012`), bordeaux (`--bordeaux: #722f37`) for primary fills/buttons/left-border accents, dark gold (`--gold: #d4a24e`) as the pop accent (icons, links, logo, nav underline), rose (`--rose: #c98a94`) as a secondary accent, ivory (`--ivory: #f4ece1`) for headings. All defined as CSS custom properties in each page's `:root`.
- Typography: Fraunces (Google Fonts, serif) for display/headings and the italic logo; Inter for body text. Font `<link>`s are duplicated in each page's `<head>`.
- Index hero is a split-screen: text left, full-height portrait photo right (not sticky — scrolls with the page); on mobile the photo stacks above the text.
- Scroll-reveal animations via `IntersectionObserver`; responsive nav with a mobile hamburger toggle. These scripts are duplicated inline in each page.
- The home page features a curated subset (skills/projects) with "See All" buttons linking to the full `skills.html` / `projects.html` pages.

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) runs on push to `master`. It SSHes to the server and runs `git pull origin master` + `systemctl reload nginx` in `/srv/sites/novica/my-landing-page`. **Nginx serves the `dist/` files directly from the pulled repo — nothing is compiled on the server.** So whatever is committed in `dist/` is what goes live.

## Content source

`Novica_Trifkovic_Master_Profile.md` (one directory up, outside this repo) is the authoritative dossier of all professional/project facts used to populate the site.

## Code Style

- 4-space indentation (see `.editorconfig`)
- UTF-8 encoding
- Trim trailing whitespace (except markdown)
- Keep each page self-contained (inline CSS/JS); when changing the design system, update the `:root` variables consistently across pages.
