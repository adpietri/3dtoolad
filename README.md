# 3dtoolad
3DToolAD - Stereoscopic 3D Image Creator


![Version](https://img.shields.io/badge/version-1.0_Beta-orange.svg)
![License](https://img.shields.io/badge/license-GPLv3-blue.svg)

**3DToolAD** is a lightweight, fully-featured web application designed for creating, aligning, and exporting stereoscopic 3D images. Whether you are digitizing historical stereocards, working with MPO files, or creating modern wigglegrams, this tool provides a complete workspace directly in your browser.

🔒 **100% Offline & Private:** 
This application operates entirely client-side.

---

## ✨ Features

* **Versatile Import Options:**
  * Load `.mpo` (Multi-Picture Object) files.
  * Load existing Side-by-Side (SBS) images.
  * Load separate Left and Right photos independently.
* **Precision Alignment (Ghosting Mode):**
  * Interactive X and Y axis sliders to perfectly align the right frame over the left using a semi-transparent overlay.
* **🎬 Wigglegram Studio:**
  * Generate 3D "wiggle" animations with adjustable speed.
  * Toggle smooth crossfade interpolation for seamless transitions.
* **👓 Anaglyph 3D Generator:**
  * Multiple color algorithms including Dubois Optimized, Classic (Red/Cyan), Half-Color, Grayscale, Trioscopic (Green/Magenta), and more.
* **Rich Export Center:**
  * **Stereoscopic:** Save as MPO or custom SBS formats (Full, Half, Top-Bottom, Cross-eyed) with optional borders and background colors (including a classic Vintage arched top).
  * **Static Render:** Export your Anaglyph creation as a high-quality PNG.
  * **Animation:** Export your Wigglegram as a high-resolution Animated GIF or an MP4/WebM Video file.
* **Modern UI:**
  * Clean interface with native Light/Dark theme toggle.

---

## ⌨️ Keyboard Shortcuts

Speed up your workflow with these global keyboard shortcuts:

**Global**
* `D` - Toggle Dark/Light Theme

**Start Screen (Upload)**
* `O` - Load SBS or MPO File
* `L` - Load Left Image
* `R` - Load Right Image

**Editor Workspace**
* `Space` - Play / Pause Wigglegram animation
* `W` - Switch to Wigglegram Tab
* `A` - Switch to Anaglyph Tab
* `X` - Clear current project and return to start

**Export Shortcuts**
* `S` - Open Save SBS Modal
* `M` - Save as MPO
* `P` - Save Anaglyph PNG
* `G` - Save High-Res GIF
* `V` - Save Video (MP4)

**SBS Export Modal**
* `S` - Confirm Save Image
* `X` - Close Modal

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
