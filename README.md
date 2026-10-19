# house3d

Interactive 3D model of a two-storey Japandi-tropical house, built with three.js from a single data file.

Everything about the house lives in **`data/house.json`**. The viewer reads that file and builds the model, so a design revision is a change to numbers in one place.

## Run locally

The page loads `data/house.json` with `fetch`, so it needs an HTTP server (opening `index.html` directly from disk will not work):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

three.js 0.160.0 is loaded from jsDelivr through the import map in `index.html`; no build step, no npm install.

## Deploy to GitHub Pages

Settings → Pages → Build and deployment → **Deploy from a branch** → `main` / `(root)`. The `.nojekyll` file keeps GitHub from processing the site.

## Project layout

```
index.html          page, controls, import map
data/house.json     the house: single source of truth
src/main.js         loads the data, wires the controls, deep links
src/geometry.js     house.json → three.js meshes (walls, openings, stairs, roofs, furniture, plants)
src/viewer.js       renderer, lights, shadows, camera, orbit controls, PNG snapshot
```

## Coordinates

All values are meters.

| Axis | Meaning | Range |
|---|---|---|
| `x` | west → east (0 = side-street edge) | 0 … 9 |
| `y` | back → front (0 = back boundary, 14 = front street) | 0 … 14 |
| `z` | height | lantai 1 at 0, lantai 2 at 3.45 |

A `rect` is always `[x0, y0, x1, y1]`. In three.js, `x → X`, `z → Y` (up), `y → Z`.

## Editing `data/house.json`

| Key | What it holds | Typical edit |
|---|---|---|
| `levels` | floor heights | change ceiling height |
| `materials` | color, roughness, metalness, opacity per material | retune a finish |
| `floors` | floor surfaces per room (`name` becomes the room label) | resize or rename a room |
| `slabs` | floor-2 slab pieces (the gaps are the stair void) | move the stair void |
| `walls` | centerline `a → b`, `kind` (`ext`, `int`, `boundary`, `low`), optional `h`, and `open` | move a wall |
| `walls[].open` | `at` (m from the wall's lower-coordinate end), `w`, `type`, `sill`, `head` | move or resize a door/window |
| `stairs` | flights (`dir`, `steps`, `z0`, `z1`), landings, rails | change the stair |
| `boxes` | furniture and small objects: `rect`, `z` (above the level), `h`, `mat` | move furniture |
| `prayerMats` | center, size, rotation toward qibla (degrees) | |
| `roofs` | `gable`, `flat` (with optional `posts`), `glass` canopy | change roof pitch or overhang |
| `cars`, `plants` | position and size | |
| `context.houses` | simple neighbor blocks (toggle "Tetangga") | |
| `cameras` | camera presets (`pos`, `target`, optional `fov`) shown as buttons | add a viewpoint |

Opening `type` values: `door` (gap), `slide` (`panel`: `glass` or a material), `bifold` (`panels`, `out`: +1/−1 side the folded stack swings to), `window` (glass between `sill` and `head`; a `note` containing "kisi" adds wooden louvers), `gate` (wooden slats), `opening` (plain gap).

## Viewer controls

- **Lantai**: Semua, Lantai 1, Lantai 2. Single-floor views hide everything above and, with **Potong dinding**, cut the walls to 1.3 m so the rooms are visible.
- **Atap**, **Label ruang**, **Tetangga** toggles.
- **Kamera** presets come from `cameras` in the data.
- **Simpan gambar** saves the current view as PNG.
- Deep links: `#<view>-<camera>`, for example `#lt1-top`, `#all-corner`.

## Roadmap

- v2: PBR textures (wood, plaster, stone), HDRI sky, ambient occlusion.
- v3: glTF furniture and plants, first-person walk mode, optional path-traced high-quality render on desktop.
