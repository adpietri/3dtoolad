/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- KEYBOARD SHORTCUTS CONTROLLER ---
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (document.querySelector('.ov')) return;   // a panel is in front: Esc is the only key that acts on it
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return;

    const key = e.key.toLowerCase();
    const isUploadActive = screenUpload.classList.contains('active');
    const isEditorActive = screenEditor.classList.contains('active');
    const isModalActive = sbsModal.classList.contains('active');

    if (key === 'd' && !e.shiftKey) { toggleTheme(); return; }
    if (e.shiftKey && /^[a-z]$/.test(key)) { shiftShortcut(key, e, isUploadActive, isEditorActive, isModalActive); return; }   // Shift + letter: the extra shortcuts (below); never the single-letter ones

    if (isUploadActive) {
        if (key === 'o') document.getElementById('inputSbs').click();
        if (key === 'l') document.getElementById('inputLeft').click();
        if (key === 'r') document.getElementById('inputRight').click();
        return;
    }

    if (isModalActive) {
        if (key === 's') {
            e.preventDefault(); 
            document.getElementById('btnConfirmSbsSave').click();
        }
        return; 
    }

    if (isEditorActive) {
        if (key === ' ') {
            e.preventDefault(); 
            const ae = document.activeElement; if (ae && ae !== document.body && ae.type !== 'range') ae.blur();   // so Space cannot also toggle a focused checkbox/button
            if (currentTab === 'wiggle') document.getElementById('btnPlayPause').click();
            else if (currentTab === 'individual') document.getElementById('btnCompare').click();
        }
        if (key === 's') {
            e.preventDefault();
            document.getElementById('btnExportSBS').click();
        }
        if (key === 'x' && !busy) openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Clear this project?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The current photos and alignment will be discarded and you will return to the start screen.</p>', [['Clear project', () => document.getElementById('btnClear').click()], ['Cancel']]);
        if (key === 'o' && !busy) openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Open another file?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The current project (photos and alignment) is replaced as soon as you choose a new file. If you cancel the file picker, nothing changes.</p>', [['Choose a file...', () => document.getElementById('inputSbs').click()], ['Cancel']]);
        if (key === 'e') swapLR();
        if (key === 'n') autoAlign();
        if (key === 'w') document.querySelector('.view-tab[data-target="wiggle"]').click();
        if (key === 'a') document.querySelector('.view-tab[data-target="anaglyph"]').click();
        if (key === 't') document.querySelector('.view-tab[data-target="individual"]').click();
        if (key === 'm') document.getElementById('btnExportMPO').click();
        if (key === 'g') document.getElementById('btnExportGIF').click();
        if (key === 'v') document.getElementById('btnExportVideo').click();
        if (key === 'p') document.getElementById('btnExportAnaglyph').click();
    }
});

// --- EXTRA SHORTCUTS: Shift + letter (listed in the ? panel; not written on the buttons) ---
function shiftShortcut(key, e, start, editor, modal) {
    if (modal) return;
    const click = (id) => { const el = document.getElementById(id); if (el && !el.disabled) { e.preventDefault(); el.click(); } };
    const any = { s: () => { e.preventDefault(); prefOpen(); }, t: () => click('btnTools'), b: () => { e.preventDefault(); if (typeof openBatchTool === 'function') openBatchTool(); } };
    if (any[key]) { any[key](); return; }
    if (start) { if (key === 'o') click('btnOpenProject'); return; }
    if (!editor) return;
    const indivOnly = (fn) => { if (currentTab !== 'individual') { showToast('This shortcut works in Individual Images (T).'); return; } fn(); };
    const map = {
        o: () => { if (!busy) openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Open a project?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The current project is replaced as soon as you choose a project file. If you cancel the file picker, nothing changes.</p>', [['Choose a project...', () => document.getElementById('inputProject').click()], ['Cancel']]); },
        c: () => click('btnCopyView'), j: () => click('btnSaveLR'), v: () => click('btnViewerHtml'), i: () => click('btnInfo'),
        a: () => { if (currentTab === 'individual') return; e.preventDefault(); toggleAdvanced.checked = !toggleAdvanced.checked; toggleAdvanced.dispatchEvent(new Event('change', { bubbles: true })); },
        f: () => { e.preventDefault(); pnlToggleAll(); },
        z: () => indivOnly(() => click('btnIndivZoom')),
        l: () => indivOnly(() => { if (INDZ.k) return; indiv.sel.L = !indiv.sel.L; indivUpdateUI(); }),
        r: () => indivOnly(() => { if (INDZ.k) return; indiv.sel.R = !indiv.sel.R; indivUpdateUI(); }),
        w: () => indivOnly(() => click('btnPickWB'))
    };
    if (map[key]) map[key]();
}

// --- ARROW KEYS: fine alignment (Shift = 10 px) ---
let nudgeTimer = null;
document.addEventListener('keydown', (e) => {
    if (!imagesLoaded || busy || currentTab === 'individual' || document.querySelector('.ov') || sbsModal.classList.contains('active') || e.ctrlKey || e.metaKey || e.altKey) return;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!mv || (document.activeElement && (document.activeElement.type === 'range' || document.activeElement.tagName === 'SELECT'))) return;
    e.preventDefault(); const k = e.shiftKey ? 10 : 1, lim = parseInt(alignX.max);
    startAlignment();
    offsetX = Math.max(-lim, Math.min(lim, offsetX + mv[0] * k)); offsetY = Math.max(-lim, Math.min(lim, offsetY + mv[1] * k));
    alignX.value = offsetX; alignY.value = offsetY; valX.innerText = offsetX; valY.innerText = offsetY; renderGhosting();
    clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => { endAlignment(); histMark(); }, 700);   // one history step per burst of key presses
});
document.getElementById('alignView').addEventListener('change', () => { if (imagesLoaded) { startAlignment(); renderGhosting(); } });

// --- DIAGNOSTICS (handy for bug reports) ---
function copyDiagnostics() {
    const t = diagLines().join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => showToast("Diagnostics copied."), () => prompt('Copy diagnostics:', t));
}
function diagLines() {
    if (imagesLoaded) ensureFrames();
    initGL();
    const mt = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const L = [APP.label, navigator.userAgent, `Screen ${screen.width}x${screen.height} @${window.devicePixelRatio}x`,
        'WebGL anaglyph: ' + (GL.ok ? 'yes, max texture ' + GL.maxTex : 'no (CPU fallback)'), 'GPU editing (WebGL2): ' + (igInit() ? 'yes, max ' + IG.max + ' px' + (IG.fl ? '' : ', Clarity on CPU') : 'no, CPU (' + IG.why + ')'), 'GPU anaglyph view (WebGL2): ' + (anaGpuInit() ? 'yes' : 'no (' + (ANA2.why || IG.why) + ')'), 'Multi-core CPU: ' + (parUsable() ? PAR.n + ' workers' : PAR.tried ? 'no (' + PAR.why + ')' : 'not needed yet'), 'Web Worker: ' + (typeof Worker !== 'undefined'),
        'MediaRecorder: ' + (typeof MediaRecorder !== 'undefined' ? mt.map(t => t + '=' + MediaRecorder.isTypeSupported(t)).join(', ') : 'no'),
        'Share files: ' + !!navigator.canShare];
    if (indiv.tPrev !== undefined || indiv.tFull !== undefined) L.push(`Individual Images timing: preview ${indiv.tPrev ?? '-'} ms, full-size rebuild ${indiv.tFull ?? '-'} ms`);
    if (ERRS.length) L.push('Recent errors:', ...ERRS);
    if (imagesLoaded) L.push(`Frames ${frameL.width}x${frameL.height}, preview scale ${pvScale.toFixed(2)}, offset ${offsetX},${offsetY}, lossless MPO: ${!!(origL && origR)}`);
    if (DBG.force !== 'auto') L.push('Debug: renderer forced to ' + DBG.force);
    if (DBG.align) L.push(`Last auto-align: reading ${DBG.align.read} ms, search ${DBG.align.search} ms, redraw ${DBG.align.redraw} ms`);
    if (DBG.rebuild !== null) L.push(`Last forced full-size rebuild: ${DBG.rebuild} ms`);
    return L;
}
document.addEventListener('keydown', (e) => { if (e.key === 'i' && isDebug() && !e.ctrlKey && !e.metaKey && !e.repeat && !sbsModal.classList.contains('active')) copyDiagnostics(); });

// --- REMEMBER SETTINGS ---
const UI_KEEP_IDS = ['anaglyphMode', 'speedRange', 'interpolateCheck', 'sbsLayoutMode', 'sbsFormat', 'sbsJps', 'alignView', 'sbsInputLayout', 'cropAspect', 'expWidth', 'expLoops', 'expVidSec', 'expFps', 'wmText', 'sbsWm', 'sbsWmColor', 'sbsQuality', 'wmDepth', 'sbsWmDepth', 'sbsCardTitle', 'sbsCardColor', 'sbsCardText', 'floatSoft', 'mpoProfile', 'mpoCamera'];   // export and view choices remembered in this browser (also in Settings > Presets files)
(function () {
    const ids = UI_KEEP_IDS, K = '3dtool-settings'; let st = {};
    const obj = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};   // anything else stored there (damaged, or from another program) counts as nothing
    try { st = obj(JSON.parse(localStorage.getItem(K))); } catch (e) { st = {}; }
    ids.forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        if (id in st) { if (el.type === 'checkbox') el.checked = st[id]; else el.value = st[id]; el.dispatchEvent(new Event('input')); }
        el.addEventListener('change', () => { try { st = obj(JSON.parse(localStorage.getItem(K))); } catch (e) { st = {}; } st[id] = el.type === 'checkbox' ? el.checked : el.value; try { localStorage.setItem(K, JSON.stringify(st)); } catch (e) { } });
    });
})();

// --- 3D COMFORT (block-matching disparity range) ---
// A full-size frame read into a small analysis image: its reduced on-screen copy (up to 1600 px) gives the same result much faster.
// Reading a full-size frame back from the graphics card (where the edits now leave it) costs hundreds of milliseconds each time.
function smallSource(src, w) {
    if (src === frameL && pvL && pvL !== frameL && pvL.width >= w) return pvL;
    if (src === frameR && pvR && pvR !== frameR && pvR.width >= w) return pvR;
    return src;
}
function smallRead(src, w, h) {   // a w x h version of src, ready to be read: shrunk on the canvas of the photo (graphics card when it is there), then copied small
    const t = mkCanvas(w, h), tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(smallSource(src, w), 0, 0, w, h);
    const x = mkCanvas(w, h).getContext('2d', { willReadFrequently: true }); x.drawImage(t, 0, 0); releaseCanvas(t); return x;
}
function grayData(src, w, h, f) {   // f: the part that is photo, when the frame has black borders (see grayCenter)
    const x = smallRead(src, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    grayCenter(g, w, h, f); return g;
}
function checkComfort() {
    if (!imagesLoaded) return;
    if (indiv.dirty) { whenFramesReady(() => checkComfort()); return; }   // pending Individual Images edits: show 'Applying your edits...' first
                ensureFrames();   // full-size frames up to date (Individual Images edits are applied lazily)
    const pad = !!pairInfo && pairInfo.mode === 'pad', cL = pairContent('L'), cR = pairContent('R');   // black borders: blocks and matches only on the photos
    const w = 256, s = w / frameL.width, h = Math.max(8, Math.round(frameL.height * s)), A = grayData(frameL, w, h, pad ? cL : null), B = grayData(frameR, w, h, pad ? cR : null);
    const cx = Math.round(offsetX * s), cy = Math.round(offsetY * s), R = Math.round(w * 0.2), bw = Math.floor(w / 8), bh = Math.floor(h / 6), vals = [], edges = [];
    const ax0 = cL[0] * w, ay0 = cL[1] * h, ax1 = cL[2] * w, ay1 = cL[3] * h, rx0 = Math.ceil(cR[0] * w), ry0 = Math.ceil(cR[1] * h), rx1 = Math.floor(cR[2] * w), ry1 = Math.floor(cR[3] * h);
    const colIn = (bx) => bx * bw >= ax0 - 0.5 && bx * bw + bw <= ax1 + 0.5, rowIn = (by) => by * bh >= ay0 - 0.5 && by * bh + bh <= ay1 + 0.5;
    const cols = [0, 1, 2, 3, 4, 5, 6, 7].filter(colIn), firstCol = cols[0], lastCol = cols[cols.length - 1];   // the left and right edges of the picture
    for (let by = 0; by < 6; by++) for (let bx = 0; bx < 8; bx++) {
        if (!colIn(bx) || !rowIn(by)) continue;                 // a block on a black border
        const x0 = bx * bw, y0 = by * bh; let e = 0;
        for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) e += A[y * w + x] * A[y * w + x];
        if (e / (bw * bh) < 80) continue;                       // not enough texture
        let best = Infinity, bd = 0;
        for (let dx = cx - R; dx <= cx + R; dx++) {
            let sum = 0, n = 0;
            for (let y = y0; y < y0 + bh; y += 2) { const yy = y - cy; if (yy < ry0 || yy >= ry1) continue; for (let x = x0; x < x0 + bw; x += 2) { const xx = x - dx; if (xx < rx0 || xx >= rx1) continue; sum += Math.abs(A[y * w + x] - B[yy * w + xx]); n++; } }
            if (n > bw * bh / 8) { sum /= n; if (sum < best) { best = sum; bd = dx; } }
        }
        if (best < Infinity) { vals.push(bd); if (bx === firstCol || bx === lastCol) edges.push(bd - cx); }
    }
    const el = document.getElementById('parallaxInfo');
    if (vals.length < 6) { el.textContent = 'Not enough texture to measure parallax.'; return; }
    vals.sort((a, b) => a - b);
    const pct = (vals[Math.ceil(vals.length * 0.95) - 1] - vals[Math.floor(vals.length * 0.05)]) / w * 100;
    el.textContent = `Disparity range ~${pct.toFixed(1)}% of width: ${pct <= 3 ? 'comfortable' : pct <= 5 ? 'noticeable, may tire some viewers' : 'high, likely uncomfortable'} (rule of thumb: up to ~3%).`;
    const en = edges.length ? Math.max(...edges) : 0;   // nearer-than-window content touching the left/right frame edge
    if (en > w * 0.01) el.textContent += ` Border warning: content at the frame edge is in front of the window (about ${(en / w * 100).toFixed(1)}% of width). Try a floating window of about ${Math.min(6, en / w * 100).toFixed(1)}% or move the convergence. (If the 3D looks inverted, use Swap L/R.)`;
}
document.getElementById('btnComfort').addEventListener('click', checkComfort);

// --- ESC cancels a running GIF / video export ---
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const ask = document.querySelector('.ov.shareask'); if (ask) { ask.remove(); return; }   // "The file is ready" (iPad): Esc is its Cancel
    if (busy) { cancelReq = true; if (abortGif) abortGif(); showToast("Cancelling..."); }
    else { const ov = [...document.querySelectorAll('.ov')].pop(); if (ov) ov.remove(); else if (sbsModal.classList.contains('active')) document.getElementById('btnCloseSbsModal').click(); else if (indiv.pick) indivCancelPick('Cancelled.'); }   // close the front-most panel
});

// crop-ratio change: refresh the view
/* crop-ratio changes are handled in the custom-crop block below */

// --- ZOOM & PAN (wheel, drag, pinch; double-click or 0 resets) ---
const viewBox = document.querySelector('.canvas-container'); viewBox.style.touchAction = 'none';
function applyView() {
    view.z = Math.max(1, Math.min(12, view.z)); if (view.z === 1) { view.x = 0; view.y = 0; }
    const t = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    wiggleCanvas.style.transform = t; anaglyphCanvas.style.transform = t; viewBox.style.cursor = view.z > 1 ? 'grab' : '';
}
function zoomAt(nz, cx, cy) {   // cx, cy relative to the container centre
    nz = Math.max(1, Math.min(12, nz)); const r = nz / view.z;
    view.x = cx - (cx - view.x) * r; view.y = cy - (cy - view.y) * r; view.z = nz; applyView();
}
const centreRel = (e) => { const r = viewBox.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
viewBox.addEventListener('wheel', (e) => { if (!imagesLoaded || currentTab === 'individual') return; e.preventDefault(); const [cx, cy] = centreRel(e); zoomAt(view.z * Math.exp(-e.deltaY * 0.0015), cx, cy); }, { passive: false });
const ptrs = new Map(); let lastDist = 0;
viewBox.addEventListener('pointerdown', (e) => { if (!imagesLoaded || currentTab === 'individual' || e.target.closest('button, input, select, label, summary')) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); viewBox.setPointerCapture(e.pointerId); lastDist = 0; });
viewBox.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1 && view.z > 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; applyView(); }
    else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = viewBox.getBoundingClientRect();
        if (lastDist) zoomAt(view.z * d / lastDist, (a[0] + b[0]) / 2 - r.left - r.width / 2, (a[1] + b[1]) / 2 - r.top - r.height / 2);
        lastDist = d;
    }
});
['pointerup', 'pointercancel'].forEach(t => viewBox.addEventListener(t, (e) => { ptrs.delete(e.pointerId); lastDist = 0; }));
viewBox.addEventListener('dblclick', (e) => { if (e.target.closest('button, input, select, label')) return; view.z = 1; applyView(); });
// --- CUSTOM CROP: draggable handles (mouse or touch). Choosing any other crop mode, or Reset crop, discards it ---
const cropLayer = document.createElement('div'); cropLayer.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:6';
const cropBox = document.createElement('div'); cropBox.dataset.h = 'move'; cropBox.style.cssText = 'position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);pointer-events:auto;cursor:move;touch-action:none;box-sizing:border-box';
cropLayer.appendChild(cropBox);
const CROP_H = { nw: [0, 0, 'nwse-resize'], n: [.5, 0, 'ns-resize'], ne: [1, 0, 'nesw-resize'], e: [1, .5, 'ew-resize'], se: [1, 1, 'nwse-resize'], s: [.5, 1, 'ns-resize'], sw: [0, 1, 'nesw-resize'], w: [0, .5, 'ew-resize'] };
Object.entries(CROP_H).forEach(([k, [fx, fy, cur]]) => {
    const h = document.createElement('div'); h.dataset.h = k;
    h.style.cssText = `position:absolute;left:${fx * 100}%;top:${fy * 100}%;width:30px;height:30px;margin:-15px 0 0 -15px;pointer-events:auto;touch-action:none;cursor:${cur};display:flex;align-items:center;justify-content:center`;
    h.innerHTML = '<span style="width:12px;height:12px;background:#fff;border:2px solid var(--primary);border-radius:3px;display:block"></span>'; cropBox.appendChild(h);
});
viewBox.appendChild(cropLayer);
function drawCropBox() { const c = customCrop; cropBox.style.left = c.x * 100 + '%'; cropBox.style.top = c.y * 100 + '%'; cropBox.style.width = c.w * 100 + '%'; cropBox.style.height = c.h * 100 + '%'; }
let cdrag = null, cropRaf = 0;
cropLayer.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-h]'); if (!t) return;
    e.preventDefault(); e.stopPropagation(); t.setPointerCapture(e.pointerId);
    const r = cropLayer.getBoundingClientRect(); cdrag = { h: t.dataset.h, id: e.pointerId, sx: e.clientX, sy: e.clientY, o: { ...customCrop }, W: r.width || 1, H: r.height || 1 };
});
cropLayer.addEventListener('pointermove', (e) => {
    if (!cdrag || e.pointerId !== cdrag.id) return;
    const dx = (e.clientX - cdrag.sx) / cdrag.W, dy = (e.clientY - cdrag.sy) / cdrag.H, o = cdrag.o, M = 0.05, h = cdrag.h;
    let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
    if (h === 'move') { l = Math.max(0, Math.min(1 - o.w, o.x + dx)); t = Math.max(0, Math.min(1 - o.h, o.y + dy)); r = l + o.w; b = t + o.h; }
    else {
        if (h.includes('w')) l = Math.max(0, Math.min(r - M, o.x + dx));
        if (h.includes('e')) r = Math.min(1, Math.max(l + M, o.x + o.w + dx));
        if (h.includes('n')) t = Math.max(0, Math.min(b - M, o.y + dy));
        if (h.includes('s')) b = Math.min(1, Math.max(t + M, o.y + o.h + dy));
    }
    customCrop = { x: l, y: t, w: r - l, h: b - t }; drawCropBox();
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cropLayer.addEventListener(ev, (e) => { if (cdrag && e.pointerId === cdrag.id) { cdrag = null; histMark(); } }));
function placeCrop() {
    cropRaf = 0;
    if (!imagesLoaded || !cropEditing || currentTab === 'individual' || document.getElementById('cropAspect').value !== 'custom') { cropLayer.style.display = 'none'; return; }
    const crossView = currentTab === 'anaglyph' && ['crosseye', 'parallel'].includes(document.getElementById('anaglyphMode').value);
    if (crossView) cropLayer.style.display = 'none';
    else {
        const r = (currentTab === 'wiggle' ? wiggleCanvas : anaglyphCanvas).getBoundingClientRect(), b = viewBox.getBoundingClientRect();
        const W = pvL.width, H = pvL.height, kx = Math.round(offsetX * pvScale) || 0, ky = Math.round(offsetY * pvScale) || 0;
        const B = { x: Math.max(0, kx), y: Math.max(0, ky), w: Math.max(2, W - Math.abs(kx)), h: Math.max(2, H - Math.abs(ky)) };   // area the custom rectangle is relative to (common area of both photos)
        const D = isAligning ? { x0: 0, y0: 0, w: W, h: H } : getCropRect(true);   // area the canvas shows right now (whole frame in ghost view)
        cropLayer.style.left = (r.left - b.left + (B.x - D.x0) / D.w * r.width) + 'px'; cropLayer.style.top = (r.top - b.top + (B.y - D.y0) / D.h * r.height) + 'px';
        cropLayer.style.width = (B.w / D.w * r.width) + 'px'; cropLayer.style.height = (B.h / D.h * r.height) + 'px';
        cropLayer.style.display = 'block'; drawCropBox();
    }
    cropRaf = requestAnimationFrame(placeCrop);
}
function updateCropUI() {
    const on = document.getElementById('cropAspect').value === 'custom';
    document.getElementById('cropCustomRow').style.display = on ? 'flex' : 'none';
    document.getElementById('btnCropEdit').textContent = cropEditing ? 'Done' : 'Edit crop';
    if (on && cropEditing) { if (!cropRaf) cropRaf = requestAnimationFrame(placeCrop); }
    else { cropLayer.style.display = 'none'; if (cropRaf) { cancelAnimationFrame(cropRaf); cropRaf = 0; } }
}
document.getElementById('cropAspect').addEventListener('change', (e) => { customCrop = { x: 0, y: 0, w: 1, h: 1 }; cropEditing = e.target.value === 'custom'; updateCropUI(); refreshView(); });   // any mode change discards the custom rectangle
document.getElementById('btnCropEdit').addEventListener('click', () => { cropEditing = !cropEditing; updateCropUI(); if (!cropEditing && isAligning) endAlignment(); else refreshView(); });   // 'Done' leaves the ghost view so the cropped result is shown
document.getElementById('btnCropReset').addEventListener('click', () => { customCrop = { x: 0, y: 0, w: 1, h: 1 }; cropEditing = true; updateCropUI(); refreshView(); });
updateCropUI();

// --- Explicit zoom / pan mode for touch screens: by default a finger on the image scrolls the page; switch the magnifier on to pinch and pan ---
const zoomBtn = document.createElement('button'); zoomBtn.type = 'button'; zoomBtn.id = 'btnZoomMode'; zoomBtn.className = 'btn-icon zoom-toggle'; zoomBtn.textContent = '\uD83D\uDD0D';
zoomBtn.title = 'Zoom / pan mode (touch): on = pinch and drag the image, off = the page scrolls'; zoomBtn.setAttribute('aria-label', 'Toggle zoom and pan mode'); zoomBtn.setAttribute('aria-pressed', 'false');
function applyTouchAction() { viewBox.style.touchAction = (matchMedia('(pointer: coarse)').matches && !zoomMode) ? 'pan-y' : 'none'; zoomBtn.classList.toggle('on', zoomMode); zoomBtn.setAttribute('aria-pressed', String(zoomMode)); }
zoomBtn.addEventListener('click', () => { zoomMode = !zoomMode; applyTouchAction(); showToast(zoomMode ? 'Zoom mode on: pinch and drag the image.' : 'Zoom mode off: swipe scrolls the page.'); });
viewBox.appendChild(zoomBtn); applyTouchAction();

document.addEventListener('keydown', (e) => { if (e.key === '0' && imagesLoaded && !e.ctrlKey && !e.metaKey && !document.querySelector('.ov') && !sbsModal.classList.contains('active')) { view.z = 1; applyView(); } });

// --- MPO INSPECTOR (structure report for debugging viewer compatibility) ---
function inspectMPO(buf) {
    const v = new Uint8Array(buf), dv = new DataView(buf), L = [], hex = n => '0x' + n.toString(16).toUpperCase();
    const TYPES = { 0x030000: 'Baseline MP Primary', 0x020002: 'Multi-frame: Disparity (stereo)', 0x020003: 'Multi-frame: Multi-angle', 0x020001: 'Multi-frame: Panorama', 0x010001: 'Large thumbnail VGA', 0x010002: 'Large thumbnail Full HD', 0: 'Undefined' };
    L.push(`File size: ${buf.byteLength} bytes`);
    const mp = readMpfOffsets(buf), starts = mp && mp.length ? mp.map(m => m.offset) : [0];
    L.push(mp ? `MPF index lists ${mp.length} image(s)` : 'No MPF index found: this is a plain JPEG (or a non-standard MPO).');
    const mpfAt = (st) => { let p = st + 2; while (p + 8 < v.length && v[p] === 0xFF) { const m = v[p + 1]; if (m === 0xDA) break; if (m === 0xE2 && v[p + 4] === 0x4D && v[p + 5] === 0x50 && v[p + 6] === 0x46) return p + 8; p += 2 + dv.getUint16(p + 2); } return -1; };
    const ifdDump = (t, le, off) => {
        const n = dv.getUint16(t + off, le);
        for (let i = 0; i < n; i++) {
            const e = t + off + 2 + i * 12, tag = dv.getUint16(e, le), ty = dv.getUint16(e + 2, le), c = dv.getUint32(e + 4, le); let val = '';
            if (ty === 4 && c === 1) val = dv.getUint32(e + 8, le); else if (ty === 3 && c === 1) val = dv.getUint16(e + 8, le);
            else if ((ty === 5 || ty === 10) && c === 1) { const po = t + dv.getUint32(e + 8, le); val = (ty === 10 ? dv.getInt32(po, le) : dv.getUint32(po, le)) + '/' + dv.getUint32(po + 4, le); }
            else if (ty === 7 && c === 4) val = String.fromCharCode(v[e + 8], v[e + 9], v[e + 10], v[e + 11]);
            L.push(`    ${hex(tag)} type ${ty} x${c} = ${val}`);
            if (tag === 0xB002) {
                const o = dv.getUint32(e + 8, le);
                for (let j = 0; j < Math.floor(c / 16); j++) {
                    const q = t + o + j * 16, at = dv.getUint32(q, le), tc = at & 0xFFFFFF;
                    L.push(`      entry ${j + 1}: attr ${hex(at)} [${at & 0x80000000 ? 'parent ' : ''}${at & 0x40000000 ? 'child ' : ''}${at & 0x20000000 ? 'representative ' : ''}${TYPES[tc] || 'type ' + hex(tc)}] size ${dv.getUint32(q + 4, le)} offset ${dv.getUint32(q + 8, le)}`);
                }
            }
        }
        return dv.getUint32(t + off + 2 + n * 12, le);
    };
    starts.forEach((st, i) => {
        L.push(`\n== Image ${i + 1} at byte ${st}${mp && mp[i] ? ' (MPF size ' + mp[i].size + ')' : ''} ==`);
        if (v[st] !== 0xFF || v[st + 1] !== 0xD8) { L.push('  !! no JPEG start marker (FFD8) at this offset'); return; }
        let p = st + 2;
        while (p + 4 < v.length && v[p] === 0xFF) {
            const m = v[p + 1]; if (m === 0xDA) { L.push('  SOS (compressed data)'); break; }
            const len = dv.getUint16(p + 2); let tag = '';
            if (m === 0xE1 && dv.getUint32(p + 4) === 0x45786966) tag = ' Exif'; else if (m === 0xE2 && v[p + 4] === 0x4D && v[p + 5] === 0x50 && v[p + 6] === 0x46) tag = ' MPF'; else if (m === 0xE2) tag = ' ICC/other'; else if (m >= 0xC0 && m <= 0xC2) tag = ` SOF ${dv.getUint16(p + 7)}x${dv.getUint16(p + 5)}`;
            L.push(`  ${hex(m)} length ${len}${tag}`); p += 2 + len;
        }
        const end = findJpegEnd(buf, st);
        if (mp && mp[i] && mp[i].size && end > 0 && st + mp[i].size !== end) {   // the size recorded in the MPF index and where the JPEG really ends
            const next = i + 1 < starts.length ? starts[i + 1] : v.length, extra = st + mp[i].size - end;
            const zeros = extra > 0 && st + mp[i].size <= next && v.subarray(end, st + mp[i].size).every(b => b === 0 || b === 0xFF);
            if (zeros) L.push(`  Note: the MPF size (${mp[i].size}) also counts ${extra} filler byte${extra === 1 ? '' : 's'} after the end of the JPEG (${end - st}). Some programs add them so that each picture starts at a round position; it does not affect the file.`);
            else L.push(`  Note: the size recorded in the MPF index (${mp[i].size}) differs from the length of the JPEG (${end - st}). 3DToolAD reads the picture from the JPEG itself; other readers may handle it differently.`);
        }
        const ex = readExifTags(buf.slice(st, st + 200000)); const mk = ex.ifd0[0x010F], md = ex.ifd0[0x0110];
        if (mk || md) L.push(`  Exif camera: ${mk ? mk.v : '?'} / ${md ? md.v : '?'}`);
        const swt = ex.ifd0[0x0131]; if (swt) L.push(`  Exif software: ${swt.v}`);
        const t = mpfAt(st);
        if (t > 0) {
            try { const le = v[t] === 0x49; L.push(`  MPF IFD (${le ? 'little' : 'big'}-endian):`); const nx = ifdDump(t, le, dv.getUint32(t + 4, le)); if (nx) { L.push('  MP Attribute IFD:'); ifdDump(t, le, nx); } }
            catch (err) { L.push('  !! MPF structure is damaged or out of range'); }
        } else L.push('  (no MPF segment in this image)');
    });
    return L.join('\n');
}
function showReport(text, copied) {
    const o = document.createElement('div'); o.className = 'ov'; o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:16px';
    const b = document.createElement('div'); b.style.cssText = 'background:var(--panel-bg);color:var(--text-light);border:1px solid var(--panel-border);border-radius:var(--radius);max-width:780px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:16px;gap:10px';
    const pre = document.createElement('pre'); pre.textContent = text; pre.style.cssText = 'overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;flex:1;user-select:text';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px';
    const mk = (label, fn) => { const x = document.createElement('button'); x.className = 'btn btn-outline'; x.style.padding = '8px 14px'; x.textContent = label; x.onclick = fn; row.appendChild(x); };
    mk('Copy data', () => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => showToast(copied || 'Copied to the clipboard.'), () => showToast("Select the text and copy it manually.", true)); });
    mk('Close', () => o.remove()); b.append(pre, row); o.appendChild(b); o.addEventListener('click', (e) => { if (e.target === o) o.remove(); }); document.body.appendChild(o);
}
// Inspect button: only visible when the opened file is an MPO
function isDebug() { return /[?&#]debug=yes(?:[&#]|$)/i.test(location.search + location.hash); }   // add ?debug=yes (or &debug=yes) to the URL
function updateInspectBtn() { document.getElementById('btnInspect').style.display = (isDebug() && openedMpoFile) ? '' : 'none'; }
document.getElementById('btnInspect').addEventListener('click', async () => {
    if (!openedMpoFile) return;
    try { showReport(inspectMPO(await openedMpoFile.arrayBuffer()), 'MPO data copied.'); } catch (err) { console.error(err); showToast("Could not read this file.", true); }
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
