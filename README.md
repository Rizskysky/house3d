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
data/house-barat.json  comparison variant (garden on the side street), generated: do not edit
tools/mirror.py     builds house-barat.json by mirroring house.json west↔east (re-run after every data change)
src/main.js         loads the data, wires the controls, deep links
src/geometry.js     house.json → three.js meshes (walls, openings, stairs, roofs, furniture, plants)
src/furniture.js    parametric furniture, fixtures, cars and plants, sized from each item's rect
src/textures.js     procedural material patterns (wood, plaster, stone, terrazzo, grass…), drawn on canvas
src/plan.js         2D floor plans (SVG, 1:100 on A4) and the door/window schedule
docs.html           contractor documents: summary, plans, door/window schedule, technical notes, renders (print to PDF)
src/walk.js         first-person walk: collision and floor heights from house.json
src/viewer.js       renderer, sky, lights, shadows, ambient occlusion, day/night, camera, PNG snapshot
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
| `materials` | `color`, `rough`, `metal`, `opacity`, plus optional `tex` (procedural pattern), `scale` (m per tile), `bump`, `env` (sky reflection strength) | retune a finish |
| `floors` | floor surfaces per room (`name` becomes the room label) | resize or rename a room |
| `slabs` | floor-2 slab pieces (the gaps are the stair void) | move the stair void |
| `ceilings` | ceilings under the roof (`level`, `rect`, `z`, `t`), drawn while the roof is shown; with `cove` {`band`, `drop`, `raise`} a drop ceiling with a hidden LED strip | |
| `walls` | centerline `a → b`, `kind` (`ext`, `int`, `boundary`, `low`), optional `h`, and `open` | move a wall |
| `walls[].open` | `at` (m from the wall's lower-coordinate end), `w`, `type`, `sill`, `head` | move or resize a door/window |
| `stairs` | flights (`dir`, `steps`, `z0`, `z1`), landings, rails | change the stair |
| `boxes` | furniture and small objects: `rect`, `z` (above the level), `h`, `mat`; with `type` (and `face`: `+y`/`-y`/`+x`/`-x`, the side its front points to) it is modeled by `src/furniture.js`, otherwise drawn as a plain box | move furniture |
| `prayerMats` | center, size, rotation toward qibla (degrees) | |
| `roofs` | `gable` (`over.side` / `over.end`, or per side `over.west` / `over.east`), `flat` (with optional `posts` and one `skylight` strip), `glass` canopy | change roof pitch or overhang |
| `lights` | `level`, `at` [x, y], `z`, `kind` (`down`, `pendant`, `up`), `power`, optional `color`; on in **Malam** | add a lamp |
| `cars`, `plants` | position and size | |
| `context.houses` | simple neighbor blocks (toggle "Tetangga") | |
| `notes` | technical notes for the contractor, grouped by `topic`, shown in docs.html | add a note |
| `cameras` | camera presets (`pos`, `target`, optional `fov`) shown as buttons | add a viewpoint |
| `walk` | walk-mode `start` and `spots` (`label`, `level`, `at` [x, y], `yaw` in degrees, 0 = facing the back, −90 = facing east) | add a place to jump to |

Furniture `type` values: `bed`, `wardrobe`, `openWardrobe`, `kitchen` (with worktop, optional `backsplash`), `wallCabinet`, `lowCabinet`, `tvConsole`, `tv`, `sofa`, `coffeeTable`, `diningTable`, `diningChair`, `desk`, `monitor`, `officeChair`, `shelf`, `bench`, `toilet`, `vanity`, `fridge`, `cooktop`, `sink`, `hood`, `microwave`, `riceCooker`, `nightstand`, `sideTable`, `loungeChair`, `washer`, `laundrySink`, `dryingRack`, `mihrab`, `faucet`, `steppingStone`, `railing`.

Opening `type` values: `door` (gap; with `hinge` `start`/`end`, `side` ±1 and optional `leaf` material it gets a leaf drawn open 90°), `slide` (`panel`: `glass` or a material), `bifold` (`panels`, `out`: +1/−1 side the folded stack swings to), `sliding` (`leaves`: list of `fixed`/`slide` panes; fixed panes on the outer track toward `out`, slide panes drawn open behind the neighbouring fixed pane), `swing` (`leaves`: list of `fixed`/`swing` panes; swing leaves are drawn opened 180° toward `out`, flat against the neighbouring fixed pane), `window` (glass between `sill` and `head`; a `note` containing "kisi" adds wooden louvers), `gate` (wooden slats), `opening` (plain gap).

## Viewer controls

- **Varian denah**: Taman timur (the design, `data/house.json`) or Taman barat (`?varian=barat`, the mirrored comparison from `tools/mirror.py`). The docs link follows the variant.
- **Lantai**: Semua, Lantai 1, Lantai 2. Single-floor views hide everything above and, with **Potong dinding**, cut the walls to 1.3 m so the rooms are visible.
- **Atap**, **Label ruang**, **Tetangga** toggles.
- **Suasana**: Pagi (morning sun from the east-south-east), Sore (±15.30, low sun from the west) or Malam (moonlight and the lamps in `lights`).
- **Kualitas**: Tinggi adds ambient occlusion and sharper shadows; Standar is lighter and is the default on phones.
- **Kamera** presets come from `cameras` in the data.
- **Simpan gambar** saves the current view as PNG.
- **Jalan-jalan**: first-person walk. Joystick (phone) or W A S D / arrows (desktop), drag to look, Shift to run; the menu jumps to a room. Walls, doors, furniture and stairs come from the data (fixed glass panes stay solid).
- Tap or click a room to see its name, size and area.
- **Render kualitas tinggi**: a 2560 px still (1920 px on phones) averaged over 32 frames (16 on phones) with sub-pixel jitter, a slightly moving sun for soft shadows and ambient occlusion; downloads as PNG.
- Deep links: `[?varian=barat]#<view>-<camera>[-sore|-malam]`, for example `#lt1-top`, `#all-corner-malam`, `?varian=barat#all-living-sore`.

## Roadmap

- v2 (done): material textures, sky and environment light, ambient occlusion, night mode with lamps, door leaves.
- v3 (done): modeled furniture, cars and plants; first-person walk; tap-a-room; high-quality still render.
- Documents (done): docs.html draws the plans and schedule from the same data. The renders in docs/img are still images: re-render them after a design change.
- Later: path-traced renders, glTF hero pieces.
