# 3dtoolad
3DToolAD - Stereoscopic 3D Image Creator

![Version](https://img.shields.io/badge/version-4.9_Beta-orange.svg)
![License](https://img.shields.io/badge/license-GPLv3-blue.svg)

**3DToolAD** is a lightweight, fully-featured web application for creating, aligning, editing and exporting stereoscopic 3D images. Whether you are digitizing historical stereocards, working with MPO files, or creating modern wigglegrams, this tool provides a complete workspace directly in your browser — in a **single HTML file**, with no installation and no dependencies.

Although this application was designed to also work on smartphones, we recommend using it on a desktop or tablet with a minimum resolution of 1280x720 (1920x1080 recommended) for the best user experience.

🔒 **100% Offline & Private:**
This application operates entirely client-side. Your photos never leave your device and the page makes no network requests. You can download `index.html` and run it offline. (The optional **Report a problem** button only opens this repository's issue page in a new tab when you click it.)

---

## ✨ Features

* **Versatile Import Options:**
  * Load `.mpo` (Multi-Picture Object) files — read through the MPF index, with a fallback for damaged or rewritten files.
  * Load single-file Side-by-Side, Cross-eyed or Top-Bottom images.
  * Load separate Left and Right photos independently.
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
  * `Ctrl+Z` / `Ctrl+Y` undo and redo **every change made in the left panels**: alignment, crop, floating window, left/right swap, wigglegram, anaglyph and all Individual Images edits (up to 60 steps).
  * **Reset image** returns the photos to exactly how they were when you opened them (asks first).

* **🖼️ Individual Images Editor:**
  * Edit the left and right photos separately or together.
  * 90° rotation and auto-rotate, straighten, vertical/horizontal keystone and lens distortion.
  * Exposure, brightness, contrast, saturation, vibrance and clarity.
  * Shadows and highlights, parametric tone curve (RGB and per channel).
  * White balance (temperature and tint) with a **neutral picker**.
  * 8-band color mixer (hue, saturation, luminance).
  * Match colors between the two photos, copy settings L↔R, and presets.
  * Live histogram and before/after comparison.
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
  * **SBS & more:** Full, Half and Anamorphic Side-by-Side / Top-Bottom, Cross-eyed, Freeview L-R-L / R-L-R, Row/Column/Checkerboard interlaced, VR, and a classic printable **Stereo Card** with title.
  * Optional square or vintage arched borders, background color, and a border watermark with adjustable depth. JPEG (with quality control) or PNG.
  * **Static Render:** Anaglyph as a high-quality PNG.
  * **Animation:** Animated GIF (shared palette, no flicker), 24-bit APNG, and MP4/WebM video, with width, loops, length and frame rate options, plus a text/logo watermark with 3D depth.
  * **Standalone 3D Viewer:** a single HTML file anyone can open — wigglegram (with optional smooth crossfade), parallel, cross-eye and anaglyph (Dubois, Classic, Half-color or Optimized). The control bar hides itself when the mouse or finger is idle, and **Fit to window** enlarges small pictures to fill the screen.
  * Left/right as separate JPEGs (ZIP) and copy to clipboard.

* **🧰 Tools** (the wrench button in the header; each tool opens in its own window):
  * **Batch convert to ZIP:** convert many files at once to MPO, SBS, anaglyph, GIF, APNG or HTML viewers in a single ZIP, with file-name patterns and optional automatic vertical alignment.
  * **Depth map:** measures the depth of a stereo pair — the open image (with its alignment, crop and edits) or a loaded SBS / MPO file — and saves it as a grey PNG (white = near). Grayscale or color view, three quality levels, edge-aware smoothing.
  * **Stereo card splitter:** load the scan of a vintage stereo card; the two photos are found, the scan is straightened and the card around them is cut away. Adjust the boxes by dragging, then open the pair in the program or save it as SBS.
  * **2D to 3D from a depth map:** makes a stereo pair from a single photo and its depth map, with 3D strength, screen plane, depth smoothing, and a side-by-side or anaglyph preview.
  * **Anaglyph to side-by-side:** splits a Red/Cyan, Red/Blue, Red/Green, Green/Magenta or Amber/Blue anaglyph back into its left and right views, in grey or in the two original colors, with brightness balancing. (Colors lost in an anaglyph cannot come back.)

* **Modern UI & Reliability:**
  * Clean interface with Light/Dark theme (follows your system by default) and remembered settings.
  * On phones the preview stays fixed at the top while the panels scroll underneath.
  * Built-in keyboard shortcuts panel (`?`).
  * Built-in **self-test** that checks your browser (`?selftest=yes`).

---

## 💾 Project files (`.3dta`)

Save with **Save project (.3dta)** in the Export Center or `Ctrl+S`. Open it with **Open project (.3dta)...** on the start screen, the normal **Load** button, or drag & drop.

A `.3dta` file is a standard ZIP archive:

| Entry | Contents |
|---|---|
| `mimetype` | `application/x-3dtoolad-project` (stored first and uncompressed, so the file is recognised by its content) |
| `manifest.json` | format version, program version, where the photos came from |
| `source/` | the original file(s) **byte for byte** (MPO, SBS, or the left and right photos); lossless PNG when the photos did not come from a file (pasted or made by a tool) |
| `settings.json` | every left-panel setting, plus the view (tab, alignment mode, grid) |
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
* On iPad/iPhone, photos up to about 24 megapixels per image are recommended because of Safari's memory limits.
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

**SBS Export Modal**
* `S` - Confirm Save Image
* `Esc` - Close Modal

---

## 🔧 URL Options

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

This project is licensed under the **GNU General Public License v3.0**.

Developed by adpietri
