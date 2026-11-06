# 3dtoolad
3DToolAD - Stereoscopic 3D Image Creator

![Version](https://img.shields.io/badge/version-6.3_Beta-orange.svg)
![License](https://img.shields.io/badge/license-GPLv3-blue.svg)

**3DToolAD** is a lightweight, fully-featured web application for creating, aligning, editing and exporting stereoscopic 3D images. Whether you are digitizing historical stereocards, working with MPO files, or creating modern wigglegrams, this tool provides a complete workspace directly in your browser — plain HTML, CSS and JavaScript, with no installation, no build step and no dependencies.

Although this application was designed to also work on smartphones, we recommend using it on a desktop or tablet with a minimum resolution of 1280x720 (1920x1080 recommended) for the best user experience.

🔒 **100% Offline & Private:**
This application operates entirely client-side. Your photos never leave your device and the page makes no network requests. You can download it and run it offline. (The optional **Report a problem** button only opens this repository's issue page in a new tab when you click it.)

---

## 🚀 Getting started

1. Download the latest release (ZIP) and **unzip the whole folder**.
2. Open **`index.html`** in your browser (double-click works; no server needed).

Keep the `css/` and `js/` folders next to `index.html`. If a file is missing or damaged, the program says so when it opens (in English or Portuguese) and lists the files, instead of showing a broken page.

**Prefer a single file?** Run the script that comes with the program:

```
python3 build_single_file.py        (Windows: py build_single_file.py)
```

It creates `3DToolAD-<version>.html`: the whole program in one file you can open, copy or send on its own. It needs only Python 3.6 or newer, nothing to install, and does not change the original files. Releases may also include this file ready to use.

---

## ✨ Features

* **Versatile Import Options:**
  * Load `.mpo` (Multi-Picture Object) files — read through the MPF index, with a fallback for damaged or rewritten files.
  * Load single-file Side-by-Side, Cross-eyed or Top-Bottom images.
  * Load separate Left and Right photos independently.
  * **Photos of different sizes:** the resolution is matched automatically (the larger photo is reduced, never enlarged). When the proportions differ, you choose: crop both to the area they share, or keep them whole with black borders — and you can change it later in the Alignment panel (**Size difference**) without losing anything, since the photos are kept as opened. If one photo is upright and the other lying down, the program offers to turn it. With black borders, auto-align, 3D comfort and the depth map ignore the borders.
  * Open a saved **3DToolAD project** (`.3dta`).
  * Drag & drop one file or two photos, or paste an image from the clipboard.

* **Precision Alignment:**
  * Ghosting mode with X/Y sliders and pixel-perfect arrow-key nudging.
  * Alignment views: Ghost, Difference, Checkerboard and horizontal guides.
  * Fast coarse-to-fine **auto-align**, vertical-only auto-align, and **align on one detail** (two clicks).
  * Rotation and scale correction of the right image.
  * Floating stereo window (with soft edges) and a **3D comfort check** with window-violation warnings.
  * Crop to fixed aspect ratios or a custom crop with drag handles.
  * Swap L/R, and save / load the alignment to a file.
  * Zoom, pan, full screen and a rule-of-thirds grid.

* **↩️ Undo / Redo for everything:**
  * `Ctrl+Z` / `Ctrl+Y` undo and redo **every change made in the left panels**: alignment, crop, floating window, left/right swap, wigglegram, anaglyph and all Individual Images edits (256 steps by default; Settings > History).
  * **History window** (`U`, or **Show history** in the Export Center): every step in plain words — what changed and its new value, the area it belongs to, and when. Click a step to go back to it; undone steps stay visible (faded) until you make a new change. The window does not cover the picture, so you see each step as you browse.
  * **Reset image** returns the photos to exactly how they were when you opened them (asks first).

* **🖼️ Individual Images Editor:**
  * Edit the left and right photos separately or together.
  * 90° rotation and auto-rotate, straighten, vertical/horizontal keystone and lens distortion.
  * Exposure, brightness, contrast, saturation, vibrance and clarity.
  * Shadows and highlights, parametric tone curve (RGB and per channel).
  * **Curves:** the classic curves graph for RGB, red, green and blue. Click the line to add a point and drag it; drag a point off the graph (or double-click it) to remove it; arrow keys move the selected point. The photo's histogram is shown behind the line.
  * White balance (temperature and tint) with a **neutral picker**.
  * 8-band color mixer (hue, saturation, luminance).
  * Match colors between the two photos, copy settings L↔R, and presets. Colors and tone can also be **saved to a `.json` file and opened again** (on another computer or browser, or to share them).
  * Live histogram and before/after comparison.
  * **Zoom** (computers and tablets): one selected photo fills the view; mouse wheel or pinch to zoom up to 1600%, drag to move. The neutral-color picker works in it, to pick a small detail.
  * **GPU-accelerated** editing (see Performance below).

* **🎬 Wigglegram Studio:**
  * Generate 3D "wiggle" animations with adjustable speed.
  * Toggle smooth crossfade interpolation for seamless transitions.

* **👓 Anaglyph 3D Generator:**
  * Dubois Optimized, Classic (Red/Cyan), Half-Color, Optimized, Grayscale, Red/Blue and Trioscopic (Green/Magenta).
  * **Custom mixer** with an editable color matrix.
  * Parallel and cross-eyed free-viewing modes.
  * Live view rendered on the GPU (WebGL2, or WebGL) with automatic CPU fallback.

* **Rich Export Center:**
  * **Project (`.3dta`):** saves the original photos untouched, every setting and the undo history, so you can continue later exactly where you stopped (see below).
  * **MPO:** complete stereo metadata, camera EXIF (GPS never copied), embedded thumbnail, **lossless** when the images were not changed, and compatibility profiles for strict viewers.
  * **SBS & more:** optionally as **JPS** (a JPEG that records its 3D layout; side-by-side, cross-eyed and top-bottom layouts). Full, Half and Anamorphic Side-by-Side / Top-Bottom, Cross-eyed, Freeview L-R-L / R-L-R, Row/Column/Checkerboard interlaced, VR, and a classic printable **Stereo Card** with title.
  * Optional square or vintage arched borders, background color, and a border watermark with adjustable depth. JPEG (with quality control) or PNG.
  * **Static Render:** Anaglyph as a high-quality PNG.
  * **Animation:** Animated GIF (shared palette, no flicker), 24-bit APNG, and MP4/WebM video, with width, loops, length and frame rate options, plus a text/logo watermark with 3D depth.
  * **Standalone 3D Viewer:** a single HTML file anyone can open — wigglegram (with optional smooth crossfade), parallel, cross-eye and anaglyph (Dubois, Classic, Half-color or Optimized). The control bar hides itself when the mouse or finger is idle, and **Fit to window** enlarges small pictures to fill the screen.
  * Left/right as separate JPEGs (ZIP) and **copy to the clipboard**: both photos side by side (paste them back to reopen the 3D photo), or the anaglyph in the Anaglyph tab.

* **🧰 Tools** (the wrench button in the header; each tool opens in its own window):
  * **Batch convert to ZIP:** convert many files at once to MPO, SBS, anaglyph, GIF, APNG, HTML viewers or **.3dta projects** (the original file only, no settings or history, opened like new photos) in a single ZIP, with file-name patterns and optional automatic vertical alignment.
  * **Depth map:** measures the depth of a stereo pair — the open image (with its alignment, crop and edits) or a loaded SBS / MPO file — and saves it as a grey PNG (white = near). Grayscale or color view, three quality levels, edge-aware smoothing.
  * **Stereo card splitter:** load the scan of a vintage stereo card; the two photos are found, the scan is straightened and the card around them is cut away. Adjust the boxes by dragging, then open the pair in the program or save it as SBS.
  * **2D to 3D from a depth map:** makes a stereo pair from a single photo and its depth map, with 3D strength, screen plane, depth smoothing, and a side-by-side or anaglyph preview.
  * **Anaglyph to side-by-side:** splits a Red/Cyan, Red/Blue, Red/Green, Green/Magenta or Amber/Blue anaglyph back into its left and right views, in grey or in the two original colors, with brightness balancing. (Colors lost in an anaglyph cannot come back.)

* **🌐 Languages:**
  * English and Portuguese (Brazil). The language follows your browser; **Settings > Languages** changes it and remembers your choice.
  * The standalone 3D viewer is saved in the language in use.
  * New languages are one file each (see `DEVELOPING.md`).

* **Modern UI & Reliability:**
  * Clean interface with Light/Dark theme (follows your system by default; Settings > Appearance, or `D`) and remembered settings.
  * On phones the preview stays fixed at the top while the panels scroll underneath.
  * Every section of the side panels folds away with its **−** button (and opens again with **+**); folded sections are remembered.
  * **Settings** (the gear button in the header), in tabs; changes show at once but are kept only with **Save** (Cancel or Esc puts everything back); « and » go through the tabs when they do not all fit:
    * *Appearance:* theme (same as the device, light or dark), colors of the panels, header, tabs and windows (Night, Stone, Dusk, Earth, Smoke, Paper), background around the picture (also on the start screen), panel order (tools on the right and export on the left by default), the tab the program opens in, remembering folded sections.
    * *Files:* MPO and SBS file names (`{name}`, `{date}`, `{layout}`), asking before the page is closed while photos are open.
    * *Compatibility:* MPO profile and camera information; the warning before project photos are saved as PNG; the question about photos of different sizes.
    * *Performance:* who does the work: the graphics card (when available), several processor cores, or one core.
    * *History:* how many undo steps are kept (256 by default, 20 to 1000).
    * *Presets:* where "Save preset" saves (browser or `.json` file); save or open **all the settings** in one `.json` file (settings, theme, language, export and view choices, color presets).
    * *Languages:* the language of the program.
  * Built-in keyboard shortcuts panel (`?`).
  * Every slider has a small box with its exact value: type a number to jump there (kept within the slider's range), or use the Up / Down keys for one step. Colour sliders show the colour they push towards (black to white, grey to vivid, the colour mixer's hues).
  * Built-in **self-test** that checks your browser (`?selftest=yes`).
  * Start-up check: every file is verified when the program opens.

---

## 💾 Project files (`.3dta`)

Save with **Save project (.3dta)** in the Export Center or `Ctrl+S`. Open it with **Open project (.3dta)...** on the start screen, the normal **Load** button, or drag & drop.

A `.3dta` file is a standard ZIP archive:

| Entry | Contents |
|---|---|
| `mimetype` | `application/x-3dtoolad-project` (stored first and uncompressed, so the file is recognised by its content) |
| `manifest.json` | format version, program version, where the photos came from |
| `source/` | the original file(s) **byte for byte** (MPO, SBS, or the left and right photos); lossless PNG when the photos did not come from a file (pasted or made by a tool), or when they are in a format only some browsers open (HEIC/HEIF, AVIF, JPEG XL, TIFF...: the program asks first) |
| `settings.json` | every left-panel setting (including how photos of different sizes are fitted), plus the view (tab, alignment mode, grid) |
| `history.json` | the undo steps and the current position |
| `preview.jpg` | a small picture of the left photo |

* Nothing is recompressed: reopening a project gives back the same pixels, and a lossless MPO export remains possible.
* Every part is checked (sizes and CRC) when opening; damaged files and files from a newer version are refused with a clear message.
* The format is open and documented here; projects stay readable by future versions.

---

## ⚡ Performance

3DToolAD picks the fastest method your device supports and always keeps a safe fallback. Every fast path is checked once against the standard CPU code before it is used, so the results are the same either way.

* **GPU editing (WebGL2):** all Individual Images edits are computed on the graphics card. The photos stay on the card while you move the sliders, so previews update almost instantly even with large photos.
* **Multi-core CPU:** without WebGL2 (or for a photo too big for the graphics card), the work is split across all processor cores using Web Workers. The page stays responsive while full-size photos are processed.
* **Single-core CPU:** the final fallback, used on one-core devices or when Web Workers are unavailable.
* **Smart full-size processing:** sliders work on a light preview; the full-size photos are prepared in the background when you pause, and an "Applying your edits..." message appears if an export needs them first.
* **Anaglyph live view** is drawn straight from the photos kept on the graphics card (crop, offset, rotation, scale and floating window included).
* **Auto-align** prepares its analysis in the background and uses a coarse-to-fine search, so it responds quickly even on slower devices.
* **Depth map** matching runs in a Web Worker, so the page stays responsive while it works.
* A **Renderer** line in the Wigglegram, Anaglyph and Individual Images panels shows what is doing the work (for example `GPU (WebGL2)` or `CPU (8 cores)`).

---

## 🌐 Supported Browsers

Current versions of **Chrome, Edge, Firefox and Safari** (2023 or newer recommended), on desktop and tablets, including iPad Safari.

* GPU acceleration uses WebGL2, available in all current major browsers. Without it, everything still works on the CPU.
* Video is recorded with the browser's own encoder (MP4 where available, otherwise WebM).
* On iPad/iPhone, photos up to about 24 megapixels per image are recommended because of the memory available to the browser on these devices.
* Run `index.html?selftest=yes` to check every feature in your browser.

---

## ⌨️ Keyboard Shortcuts

Press `?` inside the app to see the full list. Shortcuts are disabled while typing in a text field.

**Global**
* `D` - Toggle Dark/Light Theme
* `?` - Keyboard shortcuts help
* `Esc` - Close the front-most panel or cancel an export

**Start Screen (Upload)**
* `O` - Load SBS, MPO or project file
* `L` - Load Left Image
* `R` - Load Right Image
* `Ctrl/Cmd + V` - Paste an image

**Editor Workspace**
* `Space` - Play / Pause Wigglegram (Before / After in Individual Images)
* `W` - Switch to Wigglegram Tab
* `A` - Switch to Anaglyph Tab
* `T` - Switch to Individual Images Tab
* `Arrow keys` - Nudge alignment (Shift = 10 px)
* `N` - Auto-align
* `E` - Swap Left / Right
* `Ctrl/Cmd + Z` / `Ctrl/Cmd + Y` - Undo / Redo (every change in the left panels)
* `U` - Show the history (click a step to go back to it)
* `Ctrl/Cmd + S` - Save project (`.3dta`)
* `F` - Full screen
* `H` - Rule-of-thirds grid
* `0` - Reset zoom
* `O` - Open another file (asks first)
* `X` - Clear current project and return to start (asks first)

**Export Shortcuts**
* `S` - Open Save SBS Modal
* `M` - Save as MPO
* `P` - Save Anaglyph PNG
* `G` - Save High-Res GIF
* `V` - Save Video (MP4/WebM)

**More shortcuts (Shift + letter; browsers do not use these)**
* `Shift+S` - Settings · `Shift+T` - Tools · `Shift+B` - Batch convert · `Shift+O` - Open a project (.3dta)
* `Shift+A` - Alignment mode on / off · `Shift+F` - Fold or open all the panel sections
* `Shift+C` - Copy to the clipboard (both photos side by side; the anaglyph in the Anaglyph tab) · `Shift+J` - Save left / right as JPEGs (ZIP) · `Shift+V` - Save the standalone 3D viewer · `Shift+I` - Image info
* Individual Images: `Shift+L` / `Shift+R` select the left / right photo, `Shift+Z` zoom (then `+` / `-` / `0`), `Shift+W` neutral color picker

**SBS Export Modal**
* `S` - Confirm Save Image
* `Esc` - Close Modal

---

## 🔧 URL Options

* `?lang=pt` / `?lang=en` - Open in Portuguese or English (otherwise: your last choice, then the browser's language).
* `?selftest=yes` - Run the built-in self-test and copy a PASS/FAIL report (it also checks the GPU and multi-core paths).
* `?debug=yes` - Debug Mode:
  * "Debug" next to the title and a **debug panel button** (first button in the header).
  * The panel shows the graphics card, renderers, processor cores, memory used, timings, where the photos came from, the undo position and the program state.
  * Force a renderer (GPU, several cores or one core) and time a full-size rebuild.
  * **Undo history** with what changed in each step (click one to jump to it), copy the current settings as JSON, **inspect a `.3dta` file** (contents and integrity), message log, FPS meter, simulate a GPU loss, free caches, clear saved settings.
  * Copy diagnostics, save a debug bundle (no photos), run the self-test.
  * The **Inspect MPO data** button and the `I` shortcut (copy diagnostics).
  * The reason shown next to each **Renderer** line when the GPU is not used, and the timing of each step in the auto-align message.

---

## 🛠️ Project structure

```
index.html              the page; loads the files below in order, then checks them
css/                    styles
js/01-core.js ...       the program, split by area (alignment, exports, tools, Individual Images, history...)
js/lang/pt-BR.js        Portuguese (Brazil) texts
build_single_file.py    makes the one-file version
DEVELOPING.md           how the files fit together, how to add a file or a language
```

The files are plain scripts (not ES modules), so the program still opens straight from disk. Version 4.9 was the last release made as a single source file.

---

## 🐞 Reporting a Problem

Open the `?` panel and choose **Report a problem**. It copies a short diagnostics report (browser, GPU support, timings, recent errors — never your photos) to the clipboard and opens a new issue on this repository, where you can paste it.

---

## 🙏 Credits

All of 3DToolAD's code was written for this project — no third-party code or libraries are included. It implements these published methods and open formats, with thanks to their authors (also listed in the app under **? > About > Credits**):

**Anaglyph**
* Eric Dubois — least-squares anaglyph matrices (2001)

**Depth map**
* Ramin Zabih and John Woodfill — census transform (1994)
* Xing Mei et al. — AD-Census matching cost (2011)
* Heiko Hirschmüller — Semi-Global Matching (2005)
* Carlo Tomasi and Roberto Manduchi — bilateral filter (1998), used as a joint bilateral filter (Petschnigg et al.; Eisemann and Durand, 2004)
* Steven Gortler et al. — push-pull filling of missing values (The Lumigraph, 1996)

**2D to 3D**
* Christoph Fehn — depth-image-based rendering (2004)

**GIF export**
* Paul Heckbert — median-cut color quantization (1982)
* Bryce Bayer — ordered dithering (1973)
* Terry Welch — LZW compression (1984)

**File formats**
* CIPA DC-007 (MPO) and DC-008 (Exif)
* APNG specification (Mozilla)
* ZIP (PKWARE APPNOTE) and CRC-32

---

## ⚠️ Beta Notice & Disclaimer

**3DToolAD is currently in BETA.**
While the tool is fully functional, you may encounter occasional bugs, unexpected behaviors, or performance drops, particularly when rendering large GIFs or high-resolution videos depending on hardware limitations.

**DISCLAIMER:**
THIS SOFTWARE IS PROVIDED BY THE AUTHOR "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** (or later). The full text is in the [`LICENSE`](LICENSE) file; when you share the program (also the single-file version), include it.

Developed by adpietri
