/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- SHORTCUTS HELP (?) ---
function showShortcuts() {
    if (document.querySelector('.ov.help')) return;
    const rows = [['O', 'Open an SBS or MPO file (asks first if a project is open)'], ['L / R', 'Pick the left / right photo (start screen)'], ['Space', 'Play / pause the wigglegram; before / after in Individual Images'], ['W / A / T', 'Wigglegram / anaglyph / individual images view'],
        ['Arrow keys', 'Nudge the alignment (Shift = 10 px)'], ['N', 'Auto-align'], ['E', 'Swap left / right'], ['Ctrl + Z / Y', 'Undo / redo (every change in the left panels)'], ['U', 'Show the history (click a step to go back to it)'],
        ['S', 'Open the SBS export dialog (S again saves)'], ['M', 'Save MPO'], ['P', 'Save anaglyph PNG'], ['G', 'Save GIF'], ['V', 'Save video'],
        ['F', 'Full screen'], ['H', 'Rule-of-thirds grid'], ['0', 'Reset zoom'], ['D', 'Light / dark theme (also in Settings)'], ['X', 'Clear the project (asks first)'], ['Ctrl + S', 'Save the project (.3dta)'], ['Esc', 'Close the front-most panel, or cancel an export'], ['?', 'This help'],
        ['Shift + S', 'Settings'], ['Shift + T', 'Tools'], ['Shift + B', 'Batch convert'], ['Shift + O', 'Open a project (.3dta)'], ['Shift + A', 'Alignment mode on / off'], ['Shift + F', 'Fold or open all the panel sections'],
        ['Shift + C', 'Copy to the clipboard'], ['Shift + J', 'Save left / right as JPEGs (ZIP)'], ['Shift + V', 'Save the standalone 3D viewer'], ['Shift + I', 'Image info'],
        ['Shift + L / R', 'Select or deselect the left / right photo (Individual Images)'], ['Shift + Z', 'Zoom the selected photo (Individual Images); + / − / 0 zoom in, out, whole photo'], ['Shift + W', 'Pick a neutral color for white balance (Individual Images)']];
    if (isDebug()) rows.splice(16, 0, ['I', 'Copy diagnostics']);
    const o = document.createElement('div'); o.className = 'ov help'; o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px';
    const b = document.createElement('div'); b.style.cssText = 'background:var(--panel-bg);color:var(--text-light);border:1px solid var(--panel-border);border-radius:var(--radius);box-shadow:var(--shadow);max-width:460px;width:100%;max-height:88vh;overflow:auto;padding:20px';
    let h = '<div style="font-weight:700;font-size:1.05rem;margin-bottom:14px">Keyboard shortcuts</div><div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;align-items:center;font-size:0.88rem">';
    rows.forEach(([k, d]) => { h += `<span style="justify-self:start;background:var(--secondary);border:1px solid var(--panel-border);border-radius:6px;padding:2px 8px;font-weight:600;white-space:nowrap">${k}</span><span style="color:var(--text-muted)">${d}</span>`; });
    b.innerHTML = h + '</div><div style="display:flex;gap:8px;margin-top:18px"><button type="button" class="btn btn-outline" id="hClose" style="padding:8px 14px">Close</button><button type="button" class="btn btn-outline" id="hAbout" style="padding:8px 14px">About / report a problem</button></div>';
    b.querySelector('#hClose').onclick = () => o.remove(); b.querySelector('#hAbout').onclick = () => { o.remove(); showAbout(); }; o.addEventListener('click', (e) => { if (e.target === o) o.remove(); }); o.appendChild(b); document.body.appendChild(o);
}
document.getElementById('btnHelp').addEventListener('click', showShortcuts);
document.addEventListener('keydown', (e) => { if (e.key === '?' && !e.ctrlKey && !e.metaKey && !document.querySelector('.ov')) showShortcuts(); });

// --- APNG (24-bit animated PNG; zlib via the browser's CompressionStream, no libraries) ---
async function buildApng(frames, w, h, delayMs, loops) {
    const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255], enc = new TextEncoder(), parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
    const chunk = (type, data) => {
        const t = enc.encode(type), body = new Uint8Array(4 + data.length); body.set(t, 0); body.set(data, 4);
        parts.push(new Uint8Array([...u32(data.length)]), body, new Uint8Array(u32(crc32(body))));
    };
    const deflate = async (raw) => new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    chunk('IHDR', new Uint8Array([...u32(w), ...u32(h), 8, 6, 0, 0, 0]));
    chunk('acTL', new Uint8Array([...u32(frames.length), ...u32(loops || 0)]));
    let seq = 0;
    for (let i = 0; i < frames.length; i++) {
        chunk('fcTL', new Uint8Array([...u32(seq++), ...u32(w), ...u32(h), ...u32(0), ...u32(0), (delayMs >> 8) & 255, delayMs & 255, 0x03, 0xE8, 0, 0]));
        const raw = new Uint8Array((w * 4 + 1) * h);
        for (let y = 0; y < h; y++) raw.set(frames[i].subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);   // filter byte 0 per row
        const z = await deflate(raw);
        if (i === 0) chunk('IDAT', z); else { const d = new Uint8Array(4 + z.length); d.set(u32(seq++), 0); d.set(z, 4); chunk('fdAT', d); }
    }
    chunk('IEND', new Uint8Array(0));
    return new Blob(parts, { type: 'image/png' });
}
document.getElementById('btnExportAPNG').addEventListener('click', (e) => {
    if (typeof CompressionStream === 'undefined') { showToast("This browser cannot create APNG (no CompressionStream).", true); return; }
    withBusy(e.currentTarget, 'Generating APNG...', 'APNG', async () => {
        await nextFrames();
        const speed = parseInt(speedRange.value), smooth = interpolateCheck.checked, n = smooth ? Math.max(2, Math.min(6, Math.floor(speed / 20))) : 1;
        const c = getCropRect(false); let W = c.w, H = c.h; const MAXW = parseInt(document.getElementById('expWidth').value);
        if (W > MAXW) { H = Math.max(1, Math.round(H * MAXW / W)); W = MAXW; }
        const off = mkCanvas(W, H), ctx = off.getContext('2d'); ctx.imageSmoothingQuality = 'high'; const frames = [], rd = mkCanvas(W, H), rx = rd.getContext('2d', { willReadFrequently: true });   // drawn where the photos are (often the graphics card); only the small frame is read back
        const grab = (ph) => { wm(ctx, W, H, ph); rx.clearRect(0, 0, W, H); rx.drawImage(off, 0, 0); frames.push(rx.getImageData(0, 0, W, H).data); };
        if (!smooth) { for (const wh of ['L', 'R']) { ctx.clearRect(0, 0, W, H); drawAligned(ctx, wh, W, H, c, false); grab(wh === 'L' ? 0 : 1); } }
        else for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) {
            ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); drawAligned(ctx, j === 0 ? 'L' : 'R', W, H, c, false);
            const a = Math.sin((i / n) * (Math.PI / 2)); ctx.globalAlpha = a; drawAligned(ctx, j === 0 ? 'R' : 'L', W, H, c, false); ctx.globalAlpha = 1; grab(j === 0 ? a : 1 - a);
        }
        releaseCanvas(off); releaseCanvas(rd);
        const blob = await buildApng(frames, W, H, Math.min(65535, Math.max(20, Math.round(smooth ? speed / n : speed))), parseInt(document.getElementById('expLoops').value));
        await saveBlob(blob, `wiggle_${stamp()}.png`); showToast("Animated PNG saved successfully!");
    });
});

// --- FULL SCREEN (F) for the current view ---
let fsPending = false;   // a request still on its way: a second press waits for it (two quick presses could leave full screen on)
function toggleFullscreen() {
    if (fsPending) return;
    const el = document.querySelector('.canvas-container'), cur = document.fullscreenElement || document.webkitFullscreenElement;
    const f = cur ? (document.exitFullscreen || document.webkitExitFullscreen) : (el.requestFullscreen || el.webkitRequestFullscreen);
    if (!f) { showToast("Full screen is not supported here.", true); return; }
    fsPending = true; let r; try { r = f.call(cur ? document : el); } catch (e) { r = null; }
    Promise.resolve(r).catch(() => { }).finally(() => { fsPending = false; });
}
document.addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !e.shiftKey && imagesLoaded && !e.ctrlKey && !e.metaKey && !e.repeat && !document.querySelector('.ov') && !sbsModal.classList.contains('active')) toggleFullscreen(); });

// --- WATERMARK (text, bottom-right; drawn after the pair is composed so it has zero parallax) ---
function wmBorder(ctx, x, y, iw, ih, pad, t, color) {   // text in the border strip under one photo; same relative spot under both photos = zero parallax
    const fs = Math.max(10, Math.round(pad * 0.5));
    ctx.save(); ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(t, x + iw, y + ih + pad * 0.5, iw); ctx.restore();   // maxWidth keeps long text inside the photo's width
}
let wmLogo = null;   // optional logo (kept in memory only)
function wm(ctx, w, h, ph) {   // ph: 0 = left-eye frame, 1 = right-eye frame (in between while cross-fading); undefined = no depth
    const t = (document.getElementById('wmText').value || '').trim(); if (!t && !wmLogo) return;
    const fs = Math.max(10, Math.round(w * 0.03)), dep = parseFloat(document.getElementById('wmDepth').value) || 0, shift = ph === undefined ? 0 : (0.5 - ph) * dep / 100 * w;
    let right = w - fs * 0.6 + shift;
    if (wmLogo && wmLogo.width && wmLogo.height) {
        let lh = h * 0.1, lw = lh * wmLogo.width / wmLogo.height; if (lw > w * 0.25) { lw = w * 0.25; lh = lw * wmLogo.height / wmLogo.width; }
        ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(wmLogo, right - lw, h - fs * 0.5 - lh, lw, lh); ctx.restore(); right -= lw + fs * 0.4;
    }
    if (!t) return;
    ctx.save(); ctx.globalAlpha = 1; ctx.font = `600 ${fs}px sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = fs * 0.2; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(t, right, h - fs * 0.5); ctx.restore();
}
document.getElementById('wmDepth').addEventListener('input', (e) => { document.getElementById('valWmDepth').textContent = (parseFloat(e.target.value) || 0).toFixed(1); });
document.getElementById('sbsWmDepth').addEventListener('input', (e) => { document.getElementById('valSbsWmDepth').textContent = (parseFloat(e.target.value) || 0).toFixed(1); });
document.getElementById('btnWmLogo').addEventListener('click', () => document.getElementById('wmLogoFile').click());
document.getElementById('wmLogoFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const url = URL.createObjectURL(f), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); wmLogo = im; document.getElementById('wmLogoInfo').textContent = 'Logo: ' + f.name; };
    im.onerror = () => { URL.revokeObjectURL(url); showToast('This image could not be opened.', true); };
    im.src = url;
});
document.getElementById('btnWmLogoClear').addEventListener('click', () => { wmLogo = null; document.getElementById('wmLogoInfo').textContent = 'No logo.'; });

// --- IMAGE INFO ---
document.getElementById('btnInfo').addEventListener('click', () => {
    if (!imagesLoaded) return;
    if (indiv.dirty) { whenFramesReady(() => document.getElementById('btnInfo').click()); return; }   // pending Individual Images edits: show 'Applying your edits...' first
                ensureFrames();
    const ex = exifBuf ? readExifTags(exifBuf) : { ifd0: {}, exif: {} }, g = (m, t) => m[t] ? m[t].v : null, rat = (v) => (v && v[0] && v[0][1]) ? v[0][0] / v[0][1] : null;
    const exp = rat(g(ex.exif, 0x829A)), fn = rat(g(ex.exif, 0x829D)), fl = rat(g(ex.exif, 0x920A)), iso = g(ex.exif, 0x8827), mk = g(ex.ifd0, 0x010F), md = g(ex.ifd0, 0x0110), ln = g(ex.exif, 0xA434), dt = g(ex.exif, 0x9003);
    const lossless = origL && origR && !colorBackup && !rotDeg && !floatPct && scaleK === 1 && !offsetX && !offsetY && cropRatio() === 0 && document.getElementById('cropAspect').value !== 'custom';
    const L = ['IMAGE INFO', '', `Left frame:  ${frameL.width} x ${frameL.height} px`, `Right frame: ${frameR.width} x ${frameR.height} px`, `Live preview scale: ${Math.round(pvScale * 100)}%`,
        `Source: ${openedMpoFile ? 'MPO (' + openedMpoFile.name + ')' : 'photos or a single image'}`,
        `Lossless MPO export possible: ${lossless ? 'yes' : 'no (alignment, crop, rotation or color change in use)'}`,
        `Alignment: X ${offsetX}, Y ${offsetY}, rotation ${rotDeg.toFixed(2)} deg, scale ${(scaleK * 100).toFixed(2)}%`, ''];
    if (mk || md) L.push(`Camera: ${mk || '?'} ${md || ''}`.trim()); if (ln) L.push(`Lens: ${ln}`); if (dt) L.push(`Taken: ${dt}`);
    if (exp) L.push(`Exposure: ${exp < 1 ? '1/' + Math.round(1 / exp) : exp} s`); if (fn) L.push(`Aperture: f/${fn.toFixed(1)}`); if (fl) L.push(`Focal length: ${fl} mm`); if (iso) L.push(`ISO: ${iso[0]}`);
    if (!(mk || md || exp || iso)) L.push('No camera EXIF available for this source.');
    showReport(L.join('\n'), 'Image info copied.');
});

// --- FLOATING WINDOW slider ---
['change', 'input'].forEach(ev => document.getElementById('floatSoft').addEventListener(ev, (e) => { if (floatSoft === e.target.checked) return; floatSoft = e.target.checked; sbsAl = null; if (!isAligning) refreshView(); }));
document.getElementById('alignFloat').addEventListener('input', (e) => {
    floatPct = parseFloat(e.target.value); document.getElementById('valFloat').textContent = floatPct.toFixed(1); if (!isAligning) refreshView();
});

// --- RULE-OF-THIRDS GRID (follows the image, zoom and pan) ---
let gridOn = false;
const gridEl = document.createElement('div');
gridEl.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:5';
gridEl.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 3 3" preserveAspectRatio="none"><g stroke="rgba(255,255,255,.65)" stroke-width="1" vector-effect="non-scaling-stroke"><line x1="1" y1="0" x2="1" y2="3" vector-effect="non-scaling-stroke"/><line x1="2" y1="0" x2="2" y2="3" vector-effect="non-scaling-stroke"/><line x1="0" y1="1" x2="3" y2="1" vector-effect="non-scaling-stroke"/><line x1="0" y1="2" x2="3" y2="2" vector-effect="non-scaling-stroke"/></g></svg>';
if (getComputedStyle(viewBox).position === 'static') viewBox.style.position = 'relative';
viewBox.appendChild(gridEl);
let gridRaf = 0;
function placeGrid() {
    gridRaf = 0;
    if (!gridOn) return;
    if (!imagesLoaded) { setGrid(false); return; }
    if (currentTab === 'individual') { gridEl.style.display = 'none'; gridRaf = requestAnimationFrame(placeGrid); return; }
    gridEl.style.display = 'block';
    const r = (currentTab === 'wiggle' ? wiggleCanvas : anaglyphCanvas).getBoundingClientRect(), b = viewBox.getBoundingClientRect();
    gridEl.style.left = (r.left - b.left) + 'px'; gridEl.style.top = (r.top - b.top) + 'px'; gridEl.style.width = r.width + 'px'; gridEl.style.height = r.height + 'px';
    gridRaf = requestAnimationFrame(placeGrid);
}
function setGrid(on) { if (gridRaf) { cancelAnimationFrame(gridRaf); gridRaf = 0; } gridOn = on; document.getElementById('gridToggle').checked = on; gridEl.style.display = on ? 'block' : 'none'; if (on) placeGrid(); }
document.getElementById('gridToggle').addEventListener('change', (e) => setGrid(e.target.checked));
document.addEventListener('keydown', (e) => { if ((e.key === 'h' || e.key === 'H') && imagesLoaded && !e.ctrlKey && !e.metaKey && !e.repeat && !document.querySelector('.ov') && !sbsModal.classList.contains('active')) setGrid(!gridOn); });

// --- BATCH: vertical auto-align per pair ---
function batchVAlign(pr) {
    const W = 256, s = W / pr.L.width, H = Math.max(8, Math.round(pr.L.height * s)), A = grayData(pr.L, W, H), B = grayData(pr.R, W, H), R = Math.round(H * 0.08) + 1;
    let best = Infinity, bdy = 0;
    for (let dy = -R; dy <= R; dy++) {
        const y0 = Math.max(0, dy), y1 = Math.min(H, H + dy); let sum = 0, n = 0;
        for (let y = y0; y < y1; y += 2) { const rb = (y - dy) * W; for (let x = 0; x < W; x += 2) { sum += Math.abs(A[y * W + x] - B[rb + x]); n++; } }
        if (n) { sum /= n; if (sum < best) { best = sum; bdy = dy; } }
    }
    const dy = Math.round(bdy / s), w = pr.L.width, h = pr.L.height, ch = h - Math.abs(dy); if (!dy || ch < 2) return;
    const L2 = mkCanvas(w, ch), R2 = mkCanvas(w, ch);
    L2.getContext('2d').drawImage(pr.L, 0, Math.max(0, dy), w, ch, 0, 0, w, ch); R2.getContext('2d').drawImage(pr.R, 0, Math.max(0, dy) - dy, w, ch, 0, 0, w, ch);
    releaseCanvas(pr.L); releaseCanvas(pr.R); pr.L = L2; pr.R = R2; pr.b1 = pr.b2 = null;   // pixels changed: no lossless pass-through
}
function batchName(pattern, fileName, i, fmt, outName) {
    const ext = outName.slice(outName.lastIndexOf('.')), stem = fileName.replace(/\.[^.]+$/, '');
    return pattern.replace(/\{name\}/g, stem).replace(/\{n\}/g, String(i + 1).padStart(3, '0')).replace(/\{fmt\}/g, fmt).replace(/[\\/:*?"<>|]/g, '_') + ext;
}

// --- SAVE LEFT / RIGHT AS TWO JPEGs (ZIP) ---
document.getElementById('btnSaveLR').addEventListener('click', (e) => {
    withBusy(e.currentTarget, 'Saving L/R...', 'left/right', async () => {
        const al = getAlignedFrames(false); let a, b; try { [a, b] = await Promise.all([canvasToJpegBuffer(al.L), canvasToJpegBuffer(al.R)]); } finally { releaseCanvas(al.L); releaseCanvas(al.R); } const st = stamp();
        await saveBlob(makeZip([{ name: `left_${st}.jpg`, data: new Uint8Array(a) }, { name: `right_${st}.jpg`, data: new Uint8Array(b) }]), `3d_LR_${st}.zip`);
        showToast("Left and right images saved in a ZIP.");
    });
});

// --- SAVE / LOAD ALIGNMENT (small JSON file) ---
document.getElementById('btnSaveAlign').addEventListener('click', () => {
    if (!imagesLoaded) return;
    if (indiv.dirty) { whenFramesReady(() => document.getElementById('btnSaveAlign').click()); return; }   // pending Individual Images edits: show 'Applying your edits...' first
                ensureFrames();
    const o = { app: APP.id, type: 'alignment', x: offsetX, y: offsetY, rotation: rotDeg, scale: scaleK, floating: floatPct, crop: document.getElementById('cropAspect').value, custom: customCrop, size: [frameL.width, frameL.height] };
    saveBlob(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }), `alignment_${stamp()}.json`).catch(() => showToast('Cancelled.'));
});
document.getElementById('btnLoadAlign').addEventListener('click', () => { if (imagesLoaded) document.getElementById('inputLoadAlign').click(); });
document.getElementById('inputLoadAlign').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !imagesLoaded) return;
    if (indiv.dirty) await new Promise(res => whenFramesReady(res));   // with the 'Applying your edits...' message
    ensureFrames();
    try {
        const o = JSON.parse(await f.text()); if (!o || o.app !== APP.id || o.type !== 'alignment') throw new Error('not an alignment file');
        const k = (Array.isArray(o.size) && o.size[0] > 0) ? frameL.width / o.size[0] : 1, num = (v, d) => Number.isFinite(v) ? v : d;   // offsets are in pixels: rescale to this image size
        rotDeg = Math.max(-5, Math.min(5, num(o.rotation, 0))); scaleK = Math.max(0.95, Math.min(1.05, num(o.scale, 1))); floatPct = Math.max(0, Math.min(6, num(o.floating, 0)));
        const ca = document.getElementById('cropAspect'); if ([...ca.options].some(op => op.value === o.crop)) ca.value = o.crop;
        const cc = o.custom; customCrop = (cc && [cc.x, cc.y, cc.w, cc.h].every(Number.isFinite) && cc.w > 0 && cc.h > 0 && cc.x >= 0 && cc.y >= 0 && cc.x + cc.w <= 1.0001 && cc.y + cc.h <= 1.0001) ? { x: cc.x, y: cc.y, w: cc.w, h: cc.h } : { x: 0, y: 0, w: 1, h: 1 };
        cropEditing = false; updateCropUI();
        syncRS(); setOffsets(num(o.x, 0) * k, num(o.y, 0) * k); showToast("Alignment loaded.");
    } catch (err) { showToast("This is not a valid alignment file.", true); }
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
