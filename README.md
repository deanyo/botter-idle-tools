# Botter — Authoring Portal

Public companion repo to **[deanyo/botter-idle](https://github.com/deanyo/botter-idle)** (the
private game source). Hosts the browser-based authoring portal — atlas
viewer, biome / item / affix editors, drop-tuning sliders — and the
CC0 tile assets they render against.

> Live: **https://dnyo.co.uk/botter-idle-tools/** (GitHub Pages)

This split exists because the editors need GitHub Pages, and Pages on
private repos is a paid GitHub Enterprise feature. The game is private;
the public-facing portal lives here.

## Repo relationship

```
deanyo/botter-idle           (private)  — game source, Godot project
deanyo/botter-idle-tools     (public)   — this repo, the authoring portal
```

`botter-idle/.github/workflows/mirror-tools.yml` syncs the relevant
files from the private repo on every push to `main` — `tools/*.html`,
`tools/portal.{css,js}`, `tools/items_*_manifest.json`,
`project/data/*.json` (whitelisted), `project/assets/tiles/`, and the
`dcss/` CC0 pack. Edits land in the private repo's `tools/`; this repo
is the *deploy artifact*, not the canonical edit surface.

To make an authoring change: edit in `deanyo/botter-idle/tools/`, push;
the mirror picks it up within a few minutes; Pages rebuilds.

## What's here

| Path | What |
|---|---|
| `*.html` | The editors — open in a browser via the live URL above, or `python3 -m http.server` locally. |
| `data/` | Whitelisted JSON from the private repo's `project/data/` (items, affixes, biomes, enemies, etc.). The editors `fetch()` these. |
| `assets/tiles/` | The curated 23 MB CC0 sprite subset shipped with the game. |
| `dcss/` | Full DCSS tile pack (CC0 1.0 Universal, ~35 MB) — atlas viewer browses this. |
| `items_*_manifest.json` | Per-slot item manifests the item editor merges before showing entries. |
| `biome_manifest.json` | Per-biome tile groupings the biome editor renders. |

## Authoring workflow

1. Open the live portal (or `python3 -m http.server` from this repo's
   root and visit `http://localhost:8000/`).
2. Pick an editor (Item / Biome / Affix / etc.).
3. Make changes in-page.
4. Each editor has an **⬇ Export** button — downloads the modified JSON.
5. Open a [GitHub issue](https://github.com/deanyo/botter-idle/issues/new)
   in the private game repo with the JSON contents (or DM the maintainer).
6. The maintainer commits the JSON to `deanyo/botter-idle`'s
   `project/data/`; the next mirror run propagates the change here.

## Licensing

- **Tile sprites** under `dcss/` and `assets/tiles/` are **CC0 1.0
  Universal** (RLTiles / DCSS contributors). No attribution required;
  the game and this portal both credit the original team voluntarily.
- **HTML / CSS / JS** in this repo: see the upstream
  [`deanyo/botter-idle`](https://github.com/deanyo/botter-idle) for
  the canonical license; the authoring tools are part of the
  development surface for the game and follow the same terms.
- **JSON game data** under `data/` is mirror-copied from the private
  repo for the editors to render and is not licensed for redistribution.
  It exists here as a runtime input for authoring against, the same
  way build artifacts are not source.

## Future companion repos

A public **wiki / playtest portal** at `deanyo/botter-idle-wiki` is
planned alongside this one. The model: keep the game itself private,
host all public-facing surfaces (tools, wiki, playtest builds) as
companion repos that mirror from `deanyo/botter-idle` selectively.
