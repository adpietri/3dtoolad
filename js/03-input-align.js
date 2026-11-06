/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- INPUT HANDLING (file pickers + drag & drop) ---
// On iPad / iPhone a picker that lists extensions offers only the types the system recognises (.jps, .mpo and .3dta are not
// among them): there the picker accepts any file, and the content decides what it is (as it always does here).
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
document.addEventListener('click', (e) => { const t = e.target; if (IS_IOS && t && t.tagName === 'INPUT' && t.type === 'file' && /\.(mpo|jps|3dta)/i.test(t.accept || '')) t.removeAttribute('accept'); }, true);
let loadSeq = 0;   // newest load wins; older, slower loads are discarded
async function loadSingleFile(file, layout) {   // layout: given when a project reopens its own source
    if (busy) { showToast('Wait for the export to finish.', true); return; }
    if (!layout && await looksLikeProject(file)) { await openProject(file); return; }
    const seq = ++loadSeq, jps = await jpsRead(file), lay = layout || (jps ? jps.layout : document.getElementById('sbsInputLayout').value);   // a JPS says its own layout
    openedMpoFile = null;
    try {
        const isMpoExt = /\.mpo$/i.test(file.name); let handled = false, pairOpened = null;
        if (isMpoExt || await looksLikeMPO(file)) {
            try {
                const [b1, b2] = await parseMPO(file);
                const [i1, i2] = await Promise.all([imgFromBuffer(b1), imgFromBuffer(b2)]); if (seq !== loadSeq) return;
                if (isMpoExt || (i1.width === i2.width && i1.height === i2.height)) {
                    const ch = await pairAsk(i1, i2); if (seq !== loadSeq) return;   // the two images of an MPO rarely differ, but can
                    if (!ch) { showToast('Not opened.'); return; }
                    setFrames(i1, i2, b1, b2, ch.mode); handled = true; openedMpoFile = file; pairOpened = ch;
                }
            } catch (mpoErr) { if (isMpoExt) throw mpoErr; }
        }
        if (!handled) {
            const url = URL.createObjectURL(jps || /\.jps$/i.test(file.name) ? new Blob([file], { type: 'image/jpeg' }) : file);   // a .jps is a JPEG, whatever type the system gave it
            try { const im = await loadImageAsync(url); if (seq !== loadSeq) return; extractFromSingle(im, lay, jps); }
            finally { URL.revokeObjectURL(url); }
        }
        projSrc = { kind: 'single', files: [file], layout: lay };
        onImagesReady(); if (pairOpened) pairAfterOpen(pairOpened);
        else if (jps && !layout) showToast({ sbs: 'JPS file: side-by-side layout read from the file.', cross: 'JPS file: cross-eye layout read from the file.', tb: 'JPS file: top-bottom layout read from the file.', 'tb-r': 'JPS file: top-bottom layout (right on top) read from the file.' }[jps.layout]);
    } catch (err) { console.error(err); showToast("Error reading image or MPO.", true); }
}

function setBadge(side, text, ok) {
    const b = document.getElementById(side === 'L' ? 'badgeLeft' : 'badgeRight');
    b.innerText = text; b.className = 'status-badge' + (ok ? ' success' : '');
}

async function checkSeparateUploads() {
    if (!fileL || !fileR) return;
    if (busy) { showToast('Wait for the export to finish.', true); return; }
    const seq = ++loadSeq;
    openedMpoFile = null;
    try {
        const uL = URL.createObjectURL(fileL), uR = URL.createObjectURL(fileR); let iL, iR;
        try { [iL, iR] = await Promise.all([loadImageAsync(uL), loadImageAsync(uR)]); }
        finally { URL.revokeObjectURL(uL); URL.revokeObjectURL(uR); }
        const isJpg = f => /jpe?g/i.test(f.type) || /\.jpe?g$/i.test(f.name);
        const [rL, rR] = (isJpg(fileL) && isJpg(fileR)) ? await Promise.all([fileL.arrayBuffer(), fileR.arrayBuffer()]) : [null, null];
        if (seq !== loadSeq) return;
        const ch = await pairAsk(iL, iR); if (seq !== loadSeq) return;   // different proportions: crop or borders?
        if (!ch) { showToast('Not opened.'); return; }
        setFrames(iL, iR, rL, rR, ch.mode); projSrc = { kind: 'pair', files: [fileL, fileR] }; onImagesReady(); pairAfterOpen(ch);
    } catch (err) { console.error(err); showToast("Error processing photos.", true); }
}

document.getElementById('inputSbs').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    await loadSingleFile(file); e.target.value = '';
});
document.getElementById('inputLeft').addEventListener('change', (e) => {
    if (!e.target.files[0]) return; fileL = e.target.files[0]; setBadge('L', 'Ready', true); checkSeparateUploads();
});
document.getElementById('inputRight').addEventListener('change', (e) => {
    if (!e.target.files[0]) return; fileR = e.target.files[0]; setBadge('R', 'Ready', true); checkSeparateUploads();
});

function askReplace(go) {   // a project is open: replacing it by pasting or dropping a file asks first
    if (!imagesLoaded) { go(); return; }
    openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Replace the current project?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The photos, alignment and edits open now are replaced by the new file. Save a project (.3dta) first to keep them.</p>', [['Replace', go], ['Cancel']]);
}
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
    e.preventDefault(); if (busy || document.querySelector('.ov') || sbsModal.classList.contains('active')) return;
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => f.type.startsWith('image/') || /\.(mpo|jps|3dta)$/i.test(f.name));
    if (!files.length) return;
    askReplace(() => {
        if (files.length === 1) { loadSingleFile(files[0]); return; }
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (files.length > 2) showToast('Using the first two files (sorted by name). For many files use Tools > Batch convert.', true);
        fileL = files[0]; fileR = files[1]; setBadge('L', 'Ready', true); setBadge('R', 'Ready', true); checkSeparateUploads();
    });
});

// --- ALIGNMENT ---
toggleAdvanced.addEventListener('change', (e) => {
    alignmentPanel.style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) { startAlignment(); scheduleAlignWarm(400); }   // the picture stands still now: a good moment to prepare auto-align
    else { if (cropEditing) { cropEditing = false; updateCropUI(); } endAlignment(); if (offsetX || offsetY) showToast(`Alignment kept (X ${offsetX}, Y ${offsetY}). Use Reset to clear.`); }
    if (!e.target.checked) clampLeftPanel();   // the alignment tools were hidden: the panel is much shorter now
});

// Right image placed with offset + rotation + scale around its centre (src-sized coordinate space).
function placeR(ctx, src, ox, oy, rot = rotDeg, k = scaleK) {
    const w = src.width, h = src.height;
    ctx.translate(w / 2 + ox, h / 2 + oy); ctx.rotate(rot * Math.PI / 180); ctx.scale(k, k); ctx.drawImage(src, -w / 2, -h / 2, w, h);
}
function drawRGhost(ctx, ox, oy) { ctx.save(); placeR(ctx, pvR, ox, oy); ctx.restore(); }
function syncRS() {
    const r = document.getElementById('alignRot'), k = document.getElementById('alignScale');
    r.value = rotDeg; k.value = scaleK * 100; document.getElementById('alignFloat').value = floatPct; document.getElementById('valFloat').textContent = floatPct.toFixed(1); document.getElementById('valRot').textContent = rotDeg.toFixed(2); document.getElementById('valScale').textContent = (scaleK * 100).toFixed(2);
}
function resetRS() { rotDeg = 0; scaleK = 1; floatPct = 0; syncRS(); }
function renderGhosting() {
    if (!imagesLoaded) return;
    ensureFrames();   // full-size frames up to date (Individual Images edits are applied lazily)
    const w = pvL.width, h = pvL.height, mode = document.getElementById('alignView').value;
    const canvas = currentTab === 'wiggle' ? wiggleCanvas : anaglyphCanvas; const ctx = currentTab === 'wiggle' ? wiggleCtx : anaglyphCtx;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ox = offsetX * pvScale, oy = offsetY * pvScale;
    ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h); ctx.drawImage(pvL, 0, 0, w, h);
    if (mode === 'diff') {
        ctx.globalCompositeOperation = 'difference'; drawRGhost(ctx, ox, oy); ctx.globalCompositeOperation = 'source-over';
    } else if (mode === 'checker') {
        const t = Math.max(24, Math.round(Math.min(w, h) / 10));
        for (let j = 0; j * t < h; j++) for (let i = 0; i * t < w; i++) {
            if ((i + j) % 2) continue;
            ctx.save(); ctx.beginPath(); ctx.rect(i * t, j * t, t, t); ctx.clip(); drawRGhost(ctx, ox, oy); ctx.restore();
        }
    } else {
        ctx.globalAlpha = 0.5; drawRGhost(ctx, ox, oy); ctx.globalAlpha = 1.0;
        if (mode === 'guides') {
            ctx.strokeStyle = 'rgba(0,255,255,0.8)'; ctx.lineWidth = Math.max(1, w / 1200); ctx.beginPath();
            for (let k = 1; k < 8; k++) { const y = Math.round(h * k / 8) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
            ctx.stroke();
        }
    }
    if (!cropEditing) {   // the photos stay whole for aligning; what the crop will remove is darkened, with the final frame outlined
        const c = getCropRect(true);
        if (!c.fallback && (c.w < w || c.h < h)) {
            ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, w, c.y0); ctx.fillRect(0, c.y0 + c.h, w, h - c.y0 - c.h); ctx.fillRect(0, c.y0, c.x0, c.h); ctx.fillRect(c.x0 + c.w, c.y0, w - c.x0 - c.w, c.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, w / 900); ctx.strokeRect(c.x0 + 0.5, c.y0 + 0.5, c.w - 1, c.h - 1); ctx.restore();
        }
    }
}

function startAlignment() {
    if (!isAligning) { isAligning = true; wasPlayingBeforeAlign = isPlaying; isPlaying = false; updatePlayButtonIcon(); renderGhosting(); }
}

function updateAlignment() {
    offsetX = parseInt(alignX.value); offsetY = parseInt(alignY.value);
    valX.innerText = offsetX; valY.innerText = offsetY; if (isAligning) renderGhosting();
}

function endAlignment() {
    if (!isAligning) return;
    pushHist();
    isAligning = false; isPlaying = wasPlayingBeforeAlign; updatePlayButtonIcon();
    if (currentTab === 'wiggle') {
        drawWiggleStatic(currentFrame);
        if (isPlaying) { lastSwapTime = performance.now(); if (animationId) cancelAnimationFrame(animationId); animationId = requestAnimationFrame(renderWiggleLoop); }
    } else { generateAnaglyph(); }
}

alignX.addEventListener('input', () => { startAlignment(); updateAlignment(); });
alignY.addEventListener('input', () => { startAlignment(); updateAlignment(); });
['change', 'mouseup', 'touchend'].forEach(evt => { alignX.addEventListener(evt, endAlignment); alignY.addEventListener(evt, endAlignment); });

function setOffsets(x, y, noHist) {
    const lim = parseInt(alignX.max);
    offsetX = Math.max(-lim, Math.min(lim, Math.round(x))); offsetY = Math.max(-lim, Math.min(lim, Math.round(y)));
    alignX.value = offsetX; alignY.value = offsetY; valX.innerText = offsetX; valY.innerText = offsetY;
    if (!noHist) pushHist();
    if (isAligning) endAlignment(); else refreshView();   // leave the ghost view and resume the animation
}

function refreshView() {
    if (!imagesLoaded) return;
    if (currentTab === 'individual') { indivRenderDisplays(); return; }
    if (isAligning) renderGhosting();
    else if (currentTab === 'wiggle') drawWiggleStatic(currentFrame);
    else generateAnaglyph();
}

document.getElementById('btnResetAlign').addEventListener('click', () => { resetRS(); setOffsets(0, 0); });

function swapLR() {
    if (!imagesLoaded || busy) return;
    if (indiv.dirty) { whenFramesReady(() => swapLR()); return; }   // pending Individual Images edits: show 'Applying your edits...' first
                rotDeg = -rotDeg; scaleK = 1 / scaleK; syncRS();
    indivSwap(); swappedLR = !swappedLR;
    setOffsets(-offsetX, -offsetY); showToast("Left and right swapped.");
}
document.getElementById('btnSwapLR').addEventListener('click', swapLR);

// Auto-align: coarse-to-fine search that minimises the luminance difference (aligns the dominant subject).
const alignGray = new WeakMap();   // auto-align analysis images per frame canvas (freed with the frame)
function alignGrayOf(src, w, h, tm, f) {   // kept per photo: pressing auto-align again on unchanged photos reads nothing. f: the part that is photo ([x0, y0, x1, y1] in 0..1), when the frame has black borders
    let c = alignGray.get(src); if (!c || c.w0 !== src.width || c.h0 !== src.height) { c = { w0: src.width, h0: src.height }; alignGray.set(src, c); }
    const key = w + 'x' + h + (f ? ':' + f.join(',') : ''); if (c[key]) return c[key];
    const t0 = performance.now(), x = smallRead(src, w, h);   // the reduced on-screen copy, shrunk where it lives: only the small image is read back
    const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    grayCenter(g, w, h, f); if (tm) tm.read += performance.now() - t0; return (c[key] = g);
}
function grayCenter(g, w, h, f) {   // removes the mean brightness, measured on the photo only (black borders left out)
    const x0 = f ? Math.ceil(f[0] * w) : 0, y0 = f ? Math.ceil(f[1] * h) : 0, x1 = f ? Math.floor(f[2] * w) : w, y1 = f ? Math.floor(f[3] * h) : h; let m = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { m += g[y * w + x]; n++; }
    m = n ? m / n : 0; for (let i = 0; i < g.length; i++) g[i] -= m;
}
// Prepare those small images ahead, so the first press of auto-align does not wait for the photos to be shrunk and read.
// Only while the picture stands still (alignment mode, the animation paused, or the anaglyph view), and one small image at a
// time with a pause in between: done in one go while the wigglegram played, it froze the animation for a moment after
// every file was opened (shrinking a 12 MP photo takes a while). Auto-align does whatever is still missing itself.
let alignWarmT = 0;
function scheduleAlignWarm(delay) {
    clearTimeout(alignWarmT);
    const still = () => isAligning || !isPlaying || currentTab === 'anaglyph';
    const ok = () => imagesLoaded && !busy && !indiv.dirty && currentTab !== 'individual' && !document.querySelector('.ov') && frameL && frameR && still();
    const jobs = []; let fL = null;
    const next = () => {
        if (!ok()) return;   // tried again when the picture stands still (see the callers)
        if (fL !== frameL) {   // the list of small images for the current photos
            fL = frameL; jobs.length = 0; const fw = frameL.width, fh = frameL.height;
            for (const tw of [256, Math.min(fw, 1024)]) { const h = Math.max(8, Math.round(fh * tw / fw)); jobs.push([tw, h, 'L'], [tw, h, 'R']); }
        }
        const j = jobs.shift(); if (!j) return;
        try { alignGrayOf(j[2] === 'L' ? frameL : frameR, j[0], j[1]); } catch (e) { return; }   // only a head start
        alignWarmT = setTimeout(next, 120);   // the page draws in between
    };
    alignWarmT = setTimeout(next, delay === undefined ? 2500 : delay);
}
function autoAlign(vOnly) {
    if (!imagesLoaded) return;
    if (indiv.dirty) { whenFramesReady(() => autoAlign(vOnly)); return; }   // pending Individual Images edits: show 'Applying your edits...' first
                ensureFrames();   // full-size frames up to date (Individual Images edits are applied lazily)
    const fw = frameL.width, fh = frameL.height, tm = { read: 0 }, pad = !!pairInfo && pairInfo.mode === 'pad', cL = pairContent('L'), cR = pairContent('R');
    const gray = (src, w, h) => alignGrayOf(src, w, h, tm, pad ? (src === frameL ? cL : cR) : null);   // black borders: only the photos are compared
    // Coarse to fine: the wide search runs on a 128 px version, then the result is refined at 256, 512 and 1024 px.
    // About 8 times fewer operations than searching the whole range at 256 px and +/-6 px at 1024 px, same final precision.
    const half = (P) => {   // 2 x 2 average
        const w = P.w >> 1, h = P.h >> 1, g = new Float32Array(w * h), W = P.w;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 2 * y * W + 2 * x; g[y * w + x] = (P.g[i] + P.g[i + 1] + P.g[i + W] + P.g[i + W + 1]) * 0.25; }
        return { g, w, h };
    };
    const level = (A, B, sx, sy, rx, ry, st = 2) => {   // best shift of B against A within sx +/- rx, sy +/- ry (mean absolute difference, every st-th pixel)
        const w = A.w, h = A.h, a = A.g, b = B.g; let best = Infinity, bx = sx, by = sy;
        const ax0 = Math.ceil(cL[0] * w), ay0 = Math.ceil(cL[1] * h), ax1 = Math.floor(cL[2] * w), ay1 = Math.floor(cL[3] * h);   // the photo inside each frame (all of it, unless black borders)
        const bx0 = Math.ceil(cR[0] * w), by0 = Math.ceil(cR[1] * h), bx1 = Math.floor(cR[2] * w), by1 = Math.floor(cR[3] * h);
        const minW = Math.min(ax1 - ax0, bx1 - bx0) / 2, minH = Math.min(ay1 - ay0, by1 - by0) / 2;
        for (let dy = sy - ry; dy <= sy + ry; dy++) for (let dx = sx - rx; dx <= sx + rx; dx++) {
            const x0 = Math.max(0, dx, ax0, bx0 + dx), x1 = Math.min(w, w + dx, ax1, bx1 + dx), y0 = Math.max(0, dy, ay0, by0 + dy), y1 = Math.min(h, h + dy, ay1, by1 + dy);
            if (x1 - x0 < minW || y1 - y0 < minH) continue;
            let sum = 0;
            for (let y = y0; y < y1; y += st) { const ra = y * w, rb = (y - dy) * w - dx; for (let x = x0; x < x1; x += st) sum += Math.abs(a[ra + x] - b[rb + x]); }
            sum /= (x1 - x0) * (y1 - y0);
            if (sum < best) { best = sum; bx = dx; by = dy; }
        }
        return { x: bx, y: by };
    };
    const pyr = (tw) => { const h = Math.max(8, Math.round(fh * tw / fw)); return { L: { g: gray(frameL, tw, h), w: tw, h }, R: { g: gray(frameR, tw, h), w: tw, h } }; };
    const alignSearch = () => {
        const p256 = pyr(256), L128 = half(p256.L), R128 = half(p256.R), fx = (w) => Math.round(offsetX * w / fw);   // vertical-only keeps the current X
        let r = level(L128, R128, vOnly ? fx(L128.w) : 0, 0, vOnly ? 0 : 19, 10);
        r = level(p256.L, p256.R, vOnly ? fx(256) : r.x * 2, r.y * 2, vOnly ? 0 : 2, 2);
        let cur = 256;
        const tw = Math.min(fw, 1024);
        if (tw > 256) {
            const pt = pyr(tw), mid = tw >= 512 ? { L: half(pt.L), R: half(pt.R) } : null;
            if (mid) { const k = mid.L.w / cur; r = level(mid.L, mid.R, vOnly ? fx(mid.L.w) : Math.round(r.x * k), Math.round(r.y * k), vOnly ? 0 : 3, 3); cur = mid.L.w; }
            const k = tw / cur; r = level(pt.L, pt.R, vOnly ? fx(tw) : Math.round(r.x * k), Math.round(r.y * k), vOnly ? 0 : 2, 2, tw > 600 ? 4 : 2); cur = tw;   // 1024 px: every 4th pixel is plenty for the last +/-2 px
        }
        return { x: r.x * fw / cur, y: r.y * fw / cur };
    };
    showToast("Auto-aligning…");
    setTimeout(() => {
        try {
            const t0 = performance.now();
            const r = alignSearch();
            const t1 = performance.now(); setOffsets(vOnly ? offsetX : r.x, r.y); const t2 = performance.now();
            if (isDebug()) DBG.align = { read: Math.round(tm.read), search: Math.round(t1 - t0 - tm.read), redraw: Math.round(t2 - t1) };
            const dbg = isDebug() ? ` [debug: reading ${DBG.align.read} ms, search ${DBG.align.search} ms, redraw ${DBG.align.redraw} ms]` : '';
            showToast(`Auto-aligned (X ${offsetX}, Y ${offsetY}).` + dbg);
        } catch (e) { console.error(e); showToast("Auto-align failed.", true); }
    }, 30);
}
document.getElementById('btnAutoAlign').addEventListener('click', () => autoAlign(false));
document.getElementById('btnAutoAlignV').addEventListener('click', () => autoAlign(true));

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
