# Developing 3DToolAD

Since 5.0 the program is split into files to make development easier. The user guide is `README.md`.

**Open `index.html`** (double-click works, no server needed). Keep the `css/` and `js/` folders next to it.
`python3 build_single_file.py` makes a one-file version (`3DToolAD-<version>.html`) from them.

## Layout

```
index.html            page markup; loads the files below in order
css/app.css           the whole app's styles
css/history.css       History window
js/01-core.js         APP identity (name, version), shared state, DOM references, theme, tabs, Reset image
js/02-mpo-image.js    MPO parsing, image processing
js/03-input-align.js  file pickers, drag & drop, alignment
js/04-animation-anaglyph.js   wigglegram animation, anaglyph (WebGL + CPU)
js/05-export.js       SBS export dialog, export helpers, exports
js/06-mpo-create.js   MPO writer
js/07-keys-view.js    keyboard, arrow keys, diagnostics, settings, 3D comfort, zoom/pan, custom crop, MPO inspector
js/08-undo.js         undo / redo snapshots (histSubs: listeners called after every change)
js/09-extras.js       shortcuts help, APNG, full screen, watermark, info, floating window, grid, L/R ZIP, alignment files
js/10-project.js      .3dta project files
js/11-viewer.js       standalone HTML viewer
js/12-debug.js        polish, debug button and panel, About / credits
js/13-tool-depth.js   Tools: depth map
js/14-tools.js        Tools: shared helpers, stereo card splitter, 2D to 3D, anaglyph to SBS, launcher
js/15..19-indiv-*.js  Individual Images tab (pixel math, GPU, workers, rendering, geometry/curve/presets)
js/20-rotation-batch.js   rotation/scale sliders, batch conversion
js/21-pair-size.js    photos of different sizes: originals kept, resolution matched, crop or black borders (Size difference)
js/22-history.js      History window (U)
js/lang/pt-BR.js      Portuguese (Brazil) texts
js/24-sliders.js      a value box for every slider; colour tracks for the colour sliders (css/sliders.css)
js/25-curves.js       Curves graph of Individual Images (the line itself: ptsLut in 19-indiv-tools.js) (css/panels.css)
js/26-panels.js       − / + folding of every left-panel section (css/panels.css)
js/27-prefs.js        Settings window (css/prefs.css); the values themselves: PREFS in 01-core.js
js/28-zoom.js         Individual Images zoom (styles in css/prefs.css)
js/23-i18n.js         applies the language (button between theme and ?; ?lang=pt / ?lang=en; else saved choice; else browser language)
```

## Rules for the files

- They are plain `<script>` files, not ES modules: modules are blocked when a page is opened from disk (`file://`).
  Top-level `const`, `let` and `function` are shared by all files, exactly as in the single-file version.
- **Order matters only for code that runs while loading.** A file may *call* a function from a later file inside an
  event handler or a function body, but not at its top level. Example: `indivNewSt()` lives in `01-core.js`
  because `const indiv = {...}` needs it at load time.
- A new file needs three things:
  1. its line in `index.html`, in the list at the end: `<script src="js/NN-name.js" data-part="js/NN-name.js"></script>`
     (the same path twice: `data-part` is what the start-up check and `build_single_file.py` look for);
  2. as its **last line**: `APP_PARTS.push(document.currentScript);`
  3. nothing else: the start-up check and the single-file build pick it up from `index.html`.
- A new CSS file: `<link rel="stylesheet" href="css/name.css" data-part="css/name.css">` in the `<head>`, and as its last
  rule `:root { --part-name: 1; }` (the file name without `.css`).
- Version: `APP.version` in `js/01-core.js`. `APP.id` must never change.

## Start-up check

`index.html` checks, after the last script, that every `data-part` file was found and ran to the end (each JS file
pushes itself to `APP_PARTS` on its last line; each CSS file sets `--part-<name>`). If not, it shows a message in
English or Portuguese with the files and what to do — it does not depend on the app's own files, which may be the
ones missing. A file that stops with an error while loading counts as not loaded, so a mistake made while editing
is caught on the next reload.

## Single-file build

`build_single_file.py` (Python 3.6+, standard library only) copies `index.html`, replaces every `data-part` tag with the
file's content, tightens the Content-Security-Policy (no `'self' file:`), and writes `3DToolAD-<version>.html`.
`-o` chooses another name or folder. The start-up check stays in and passes, since everything is inside.

## Languages

- The program is written in English. `js/lang/pt-BR.js` maps each English text to Portuguese (`words`), plus patterns
  for texts with numbers or names in them (`rx`). Anything shown on the page is translated as it appears.
- **To change a translation:** edit its line in `js/lang/pt-BR.js`.
- **To add a language:** copy `js/lang/pt-BR.js` (e.g. to `es.js`), change the key (`I18N_PACKS.es`), `name`, `label`
  and `html`, translate the right-hand sides, and add `<script src="js/lang/es.js" data-part="js/lang/es.js"></script>` next to the Portuguese one
  (the copied file already ends with the `APP_PARTS` line).
  The language button cycles through every language loaded.
- New English text in the program needs a line in each language file, or it stays in English there.
- The debug panel stays in English (bug reports).
- "Made in Brazil" after the copyright line in About stays in English in every language, on purpose (`data-noi18n`).
  Any element with `data-noi18n` is never translated.

## History window

- Button **Show history (U)** in the Export Center, or the `U` key.
- Each row is one undo step described in words (what changed and its new value), the area it belongs to,
  and how long ago. Click a row to go to that step; later steps are faded and can be brought back until a new change is made.
- It reads the same snapshots as Ctrl+Z, so nothing is stored twice; the steps are saved in `.3dta` projects as before
  (the times are not saved, so steps opened from a project show no time).

## Photos of different sizes

- `pairSrc` keeps both photos as opened. `pairBases()` brings them to the same scale (the larger is reduced; when the
  proportions differ, three explanations are tried on small copies and the best match wins: equal widths, equal
  heights, or the same scale — two photos from one camera cropped differently).
- Individual Images edits each photo at its own size; `pairFit()` then puts both into frames of one size, centred:
  `crop` (the area both share) or `pad` (black borders). `pairInfo` says where each photo sits in its frame
  (used by "Align on one detail"); `pairContent()` gives the part that is photo, so auto-align, 3D comfort and the
  depth map leave the borders out.
- The mode is `fit` in each undo step and in `settings.json`. Projects saved before 5.6 have no `fit`: their photos of
  different sizes keep the earlier rule (`cover`: right photo scaled and cut to the left one), so their alignment still fits.

## Slider value boxes

- `js/24-sliders.js` gives every `input[type=range]` a small text box, including sliders created later (Tools, export
  windows). Where a slider already showed its number in the label (or next to it, in Tools), the box takes that
  number's place; the old element stays hidden (`.sv-old`) and the program keeps writing to it as before.
- The slider's `value` property is watched on each slider, so any change made by the program (undo, reset, presets,
  switching photos) shows in its box. A typed value is kept inside the slider's range and on its steps, then the
  slider's own `input` and `change` events are sent, so the rest of the program reacts as if it was dragged.
- Keys typed in a box stay there (`.sv-box` is exempt from the global typing guard in `20-rotation-batch.js`, and the
  box stops them itself): Enter applies, Esc goes back, Up / Down change one step (Shift: ten).
- Colour sliders (`.sv-color`) draw their own track so the colour shows: black to white (exposure, brightness,
  shadows, highlights, RGB curve), grey to vivid (saturation, vibrance), the colour pairs of the curve channels and of
  white balance, and the colour mixer's tracks (set in `18-indiv-render.js`).

## Curves

- Each photo's `curve` holds the four Tone curve sliders per channel and, in `curve.pts`, the Curves points per channel
  (`rgb`, `r`, `g`, `b`): lists of `[input, output]`, 0..255, inputs at least 3 apart, 2 to 16 points. Straight = `[[0,0],[255,255]]`.
- `ptsLut` (19-indiv-tools.js) draws a monotone cubic through the points (no overshoot); `curveLuts` puts it after the
  Tone curve, so the previews, the GPU, the workers and every export need nothing of their own.
- Anything read from a file (project, preset, colours file) goes through `cleanPhotoSt` (08-undo.js) and `ptsClean`:
  projects and presets saved before 5.7alt2 get straight Curves.

## Colours file

`{ "format": "3DToolAD colors", "formatVersion": 1, "app", "appVersion", "name", "adj", "hsl", "curve" }` — the same parts as a
preset. Opening one applies it to the selected photos and adds it to the preset list.

## Folding sections

`js/26-panels.js` adds a − / + button to every `.panel-title` and `.indiv-sub` of the left sidebar. Folding only adds a class
(`pnl-hide-p` for a panel, `pnl-hide-s` for a section) to the elements after the heading; nothing is moved, so code that shows
or hides parts itself keeps working. Folded sections are kept in `localStorage` (`3dtool-folded`).

## Project photos in formats only some browsers open

`saveProject` checks the first bytes of the original files. Only JPEG (MPO, JPS), PNG, GIF, WebP and BMP are kept byte for
byte; anything else (HEIC/HEIF on iPad, AVIF, JPEG XL, TIFF...) is saved as lossless PNG after a Continue / Cancel question
that does not name the format.

## Settings

- `PREFS` (01-core.js) is read once at start-up from `localStorage['3dtool-prefs']`; every value goes through `prefPut`, so
  anything unknown, of the wrong type or out of range keeps its default (`PREF_DEFAULTS`).
- In the window, a change is shown at once (`prefPut` + `prefApply`) and kept only with Save; closing without Save restores
  the values kept when the window opened (and the language). `prefSet` changes and keeps at once (for code and tests).
- Language: Settings > Languages (`setLang`, js/23-i18n.js; the header button is gone). MPO profile: Settings >
  Compatibility mirrors the hidden `#mpoProfile` select, which keeps storing and applying it.
- `prefSet` (27-prefs.js) stores a change and applies it at once: panel order and colours (`body.tools-right`,
  `body[data-panel]`, `--canvas-bg`), `histTrim()` when fewer undo steps are kept, `pnlStore()`, `fillPresets()`.
- Panel order only changes the CSS `order` of the three columns on screens wider than 900 px; the HTML order is unchanged.
- File names: `prefFileName('mpo' | 'sbs', ext, layout)`.

## JPS

APP3 segment after the JFIF header: `FF E3 len "_JPSJPS_" 00 04 [separation, flags, layout, 1] 00 n "3DToolAD"`.
Layout 2 = side by side, 3 = over/under; flags 1 = half height, 2 = half width, 4 = left image first (without it a side-by-side
JPS is cross-eyed). `jpsWrap` writes it (SBS export, JPEG, layouts in `JPS_MODES`); `jpsRead` reads it when one file is
opened, and its layout wins over the start-screen choice; squeezed halves are stretched back.

## iPad / iPhone file pickers

On iPad / iPhone a picker whose `accept` lists extensions the system does not recognise (.mpo, .jps, .3dta) does not offer
those files, so there the `accept` is removed when such a picker opens (03-input-align.js); the content of the file decides what it is.

## Performance, settings files, batch .3dta, zoom

- Settings > Performance sets `DBG.force` ('auto' | 'multi' | 'single'), the same switch the debug panel uses; `prefRender`
  clears the preview caches so the chosen path redraws them.
- Settings files (`"format": "3DToolAD settings"`): `prefs`, `language`, `theme`, `ui` (the ids in `UI_KEEP_IDS`, 07-keys-view.js,
  each checked against its control before it is set and a change event sent) and `presets` (colour presets).
- Tools > Batch convert to .3dta: `manifest.fresh = true`, only `source/` and `preview.jpg` (no settings.json, no history.json);
  `openProject` opens such a project like new photos (it asks about different sizes). JPS files keep their layout.
- Zoom (28-zoom.js): CSS transform on the display canvas inside the card (`translate` + `scale`, origin 0 0); the picker uses
  `getBoundingClientRect`, so it needs no change. The zoomed photo is rendered at 2400 px (1200 while dragging a slider).
- `html.modal-open` (27-prefs.js) stops the page behind a window from scrolling; every `.ov > div` scrolls itself.
- MPO inspector: an MPF size that also counts zero/FF filler bytes up to the next picture is a note, not "!!". Any other
  difference between the MPF size and the JPEG length is a neutral note too (6.3); "!!" is kept for a missing JPEG start or a
  damaged MPF structure.

## Shortcuts, theme, screen readers

- Shift + letter shortcuts: `shiftShortcut` (07-keys-view.js); the single-letter shortcuts ignore Shift (F full screen included).
- The header theme button is gone: `toggleTheme()` (D) and Settings > Appearance.
- Settings: "Save settings to a .json file" first keeps what the window shows (`commit()`); closing with unkept changes says so.
- Screen readers: `a11yName` (26-panels.js) links each label to the control after it and names every slider value box.

