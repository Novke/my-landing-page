# novica.trif.rs — personal portfolio

Hand-written static portfolio site for Novica Trifković. No build step, no framework — just self-contained HTML/CSS/JS.

## Structure

- `dist/` — the entire live site (this is what nginx serves)
  - `index.html` — home (hero, about, featured skills & projects, contact)
  - `skills.html` — full skill inventory
  - `projects.html` — all projects
  - `publications.html` — research, publications, awards
  - `assets/` — favicon and images

Each HTML page is fully self-contained: CSS is inline in a `<style>` block, JS inline in a `<script>` block.

## Develop

Open `dist/index.html` in a browser. To edit, change the `dist/*.html` files directly — there is nothing to compile.

## Deploy

Push to `master`. GitHub Actions (`.github/workflows/deploy.yml`) SSHes to the server, runs `git pull` and reloads nginx. Whatever is in `dist/` goes live.
