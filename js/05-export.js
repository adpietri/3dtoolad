/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// === SBS EXPORT MODAL ===
const sbsModal = document.getElementById('sbsModal');
const sbsLayoutMode = document.getElementById('sbsLayoutMode');
const sbsBorderStyle = document.getElementById('sbsBorderStyle');
const sbsBgColor = document.getElementById('sbsBgColor');
const sbsPreviewCanvas = document.getElementById('sbsPreviewCanvas');
const sbsPreviewCtx = sbsPreviewCanvas.getContext('2d');

document.getElementById('btnExportSBS').addEventListener('click', () => {
    const btn = document.getElementById('btnExportSBS'), txt = document.getElementById('btnExportSBSText');
    if (!imagesLoaded || btn.disabled) return;
    const done = () => { btn.disabled = false; txt.textContent = 'Save as SBS (S)'; };
    btn.disabled = true; txt.textContent = 'Saving...';   // shown right away, while the edits are applied and the dialog is prepared
    setTimeout(() => {   // gives the browser a moment to paint the new text first
        whenFramesReady(() => { sbsSaving = false; sbsAl = null; sbsModal.classList.add('active'); updateSBSPreview(); }, done);
    }, 30);
});

function releaseCanvas(c) { if (c) { c.width = 1; c.height = 1; } }   // some browsers free canvas memory sooner when the size is dropped
function closeSbsDialog() { sbsModal.classList.remove('active'); if (sbsAl) { releaseCanvas(sbsAl.L); releaseCanvas(sbsAl.R); } sbsAl = null; releaseCanvas(sbsPreviewCanvas); }
document.getElementById('btnCloseSbsModal').addEventListener('click', closeSbsDialog);

[sbsLayoutMode, sbsBorderStyle, sbsBgColor].forEach(el => el.addEventListener('change', updateSBSPreview));
function updateSbsFormatUI() {   // the quality slider only applies to JPEG
    document.getElementById('sbsQualGroup').style.display = document.getElementById('sbsFormat').value === 'jpg' ? '' : 'none';
    document.getElementById('sbsJpsGroup').style.display = document.getElementById('sbsFormat').value === 'jpg' && JPS_MODES[sbsLayoutMode.value] ? '' : 'none';   // JPS: JPEG, and a layout it can describe
    document.getElementById('sbsQualVal').textContent = document.getElementById('sbsQuality').value;
}
['sbsFormat', 'sbsQuality', 'sbsLayoutMode'].forEach(id => document.getElementById(id).addEventListener(id === 'sbsQuality' ? 'input' : 'change', updateSbsFormatUI));
const schedSbsPreview = (() => { let pending = false; return () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (imagesLoaded && sbsModal.classList.contains('active')) updateSBSPreview(); }); }; })();
['sbsWmColor', 'sbsWm', 'sbsCardTitle', 'sbsCardColor', 'sbsCardText', 'sbsWmDepth'].forEach(id => document.getElementById(id).addEventListener('input', schedSbsPreview));
sbsBgColor.addEventListener('input', schedSbsPreview);

// The dialog shows a SMALL preview (built from the reduced live copies); the full-size image is only built when saving, then released.
// Building the preview at full size made every layout or border change reallocate a huge canvas, which could use up the memory of a tablet.
function updateSBSPreview() {
    if (!imagesLoaded) return;
    updateSbsFormatUI();
    renderSBS(sbsPreviewCanvas, sbsAl || (sbsAl = getAlignedFrames(true)));
}
function renderSBS(sbsPreviewCanvas, al) {
    const sbsPreviewCtx = sbsPreviewCanvas.getContext('2d');
    const mode = sbsLayoutMode.value;
    const borderStyle = sbsBorderStyle.value;
    const bgColor = sbsBgColor.value;
    const noBorder = ['lrl', 'rlr', 'row-int', 'col-int', 'checker-int', 'vr', 'card'].includes(mode);   // these layouts ignore borders
    document.getElementById('sbsCardGroup').style.display = mode === 'card' ? '' : 'none';
    sbsBorderStyle.disabled = noBorder; sbsBgColor.disabled = noBorder;
    document.getElementById('sbsWmGroup').style.display = (!noBorder && borderStyle !== 'none') ? '' : 'none';
    
    let w = al.w, h = al.h;
    let finalW, finalH;
    let Lx = 0, Ly = 0, Lw = w, Lh = h;
    let Rx = 0, Ry = 0, Rw = w, Rh = h;

    let img1 = al.L, img2 = al.R;
    if (mode === 'crosseye') { img1 = al.R; img2 = al.L; }

    if (mode === 'card') {   // classic stereo card: two squares of S on a 7 x 3.5 card, title underneath
        const S = Math.max(2, Math.min(w, h)), CW = Math.round(S * 7 / 3), CH = Math.round(S * 3.5 / 3), gap = Math.round((CW - 2 * S) / 3), top = Math.round(S * 0.06), rad = Math.round(S * 0.05), cx = sbsPreviewCtx;
        sbsPreviewCanvas.width = CW; sbsPreviewCanvas.height = CH; cx.fillStyle = document.getElementById('sbsCardColor').value; cx.fillRect(0, 0, CW, CH);
        const sx = Math.round((w - S) / 2), sy = Math.round((h - S) / 2);
        [[al.L, gap], [al.R, CW - gap - S]].forEach(([im, x]) => {
            cx.save(); cx.beginPath(); cx.moveTo(x + rad, top); cx.arcTo(x + S, top, x + S, top + S, rad); cx.arcTo(x + S, top + S, x, top + S, rad); cx.arcTo(x, top + S, x, top, rad); cx.arcTo(x, top, x + S, top, rad); cx.closePath(); cx.clip();
            cx.drawImage(im, sx, sy, S, S, x, top, S, S); cx.restore();
        });
        const title = (document.getElementById('sbsCardTitle').value || '').trim();
        if (title) { cx.fillStyle = document.getElementById('sbsCardText').value; cx.font = `${Math.max(10, Math.round(S * 0.055))}px Georgia, 'Times New Roman', serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(title, CW / 2, top + S + (CH - top - S) / 2, CW - 2 * gap); }
        return;
    }
    if (mode === 'lrl' || mode === 'rlr') {   // three panels: the middle one is the opposite eye
        const [a, b] = mode === 'lrl' ? [al.L, al.R] : [al.R, al.L];
        sbsPreviewCanvas.width = w * 3; sbsPreviewCanvas.height = h; sbsPreviewCtx.drawImage(a, 0, 0); sbsPreviewCtx.drawImage(b, w, 0); sbsPreviewCtx.drawImage(a, w * 2, 0); return;
    }
    if (mode === 'row-int' || mode === 'col-int' || mode === 'checker-int' || mode === 'vr') {
        const cx = sbsPreviewCtx;
        if (mode === 'vr') {   // each eye letterboxed in a w x w cell
            sbsPreviewCanvas.width = w * 2; sbsPreviewCanvas.height = w; cx.fillStyle = '#000'; cx.fillRect(0, 0, w * 2, w);
            const k = Math.min(1, w / h), dw = Math.round(w * k), dh = Math.round(h * k), ox = Math.round((w - dw) / 2), oy = Math.round((w - dh) / 2); cx.drawImage(al.L, ox, oy, dw, dh); cx.drawImage(al.R, w + ox, oy, dw, dh); return;
        }
        sbsPreviewCanvas.width = w; sbsPreviewCanvas.height = h;
        const dL = al.L.getContext('2d').getImageData(0, 0, w, h), dR = al.R.getContext('2d').getImageData(0, 0, w, h), o = dL.data, r = dR.data;
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
            const useR = mode === 'row-int' ? (y & 1) : mode === 'col-int' ? (x & 1) : ((x + y) & 1);
            if (useR) { o[i] = r[i]; o[i + 1] = r[i + 1]; o[i + 2] = r[i + 2]; }
        }
        cx.putImageData(dL, 0, 0); return;   // left eye on even lines/columns
    }
    if (mode === 'full-sbs' || mode === 'crosseye') {
        finalW = w * 2; finalH = h;
        Rx = w;
    } else if (mode === 'half-sbs') {
        finalW = w; finalH = h / 2;
        Lw = w / 2; Lh = h / 2; Rw = w / 2; Rh = h / 2;
        Rx = w / 2;
    } else if (mode === 'top-bottom') {
        finalW = w; finalH = h * 2;
        Ry = h;
    } else if (mode === 'half-sbs-ana') {
        finalW = w; finalH = h; Lw = w / 2; Rw = w / 2; Rx = w / 2;
    } else if (mode === 'half-tb-ana') {
        finalW = w; finalH = h; Lh = h / 2; Rh = h / 2; Ry = h / 2;
    } else if (mode === 'half-tb') {
        finalW = w / 2; finalH = h;
        Lw = w / 2; Lh = h / 2; Rw = w / 2; Rh = h / 2;
        Ry = h / 2;
    }

    // half layouts can give fractional sizes (odd pixel counts): snap to whole pixels so no half-pixel seams appear
    finalW = Math.round(finalW); finalH = Math.round(finalH); Lw = Math.round(Lw); Lh = Math.round(Lh); Rx = Math.round(Rx); Ry = Math.round(Ry);
    Rw = (mode === 'half-sbs' || mode === 'half-sbs-ana') ? finalW - Rx : Math.round(Rw);
    Rh = (mode === 'half-tb' || mode === 'half-tb-ana') ? finalH - Ry : Math.round(Rh);
    let padX = 0, padY = 0, gapX = 0, gapY = 0;
    if (borderStyle !== 'none') {
        const minDim = Math.min(finalW, finalH);
        padX = Math.round(minDim * 0.04); 
        padY = Math.round(minDim * 0.08);
        gapX = padX * 2;
        gapY = padY * 2;
        
        if (mode.includes('sbs') || mode === 'crosseye') {
            finalW += (padX * 2) + gapX;
            finalH += (padY * 2);
            Lx += padX; Ly += padY;
            Rx += padX + gapX;
            Ry += padY;
        } else { 
            finalW += (padX * 2);
            finalH += (padY * 2) + gapY;
            Lx += padX; Ly += padY;
            Rx += padX; Ry += padY + gapY;
        }
    }

    sbsPreviewCanvas.width = finalW;
    sbsPreviewCanvas.height = finalH;

    if (borderStyle !== 'none') {
        sbsPreviewCtx.fillStyle = bgColor;
        sbsPreviewCtx.fillRect(0, 0, finalW, finalH);
    }

    function drawImageClipped(img, x, y, iw, ih) {
        sbsPreviewCtx.save();
        if (borderStyle === 'vintage') {
            const archRadius = Math.min(iw / 2, ih * 0.4); 
            sbsPreviewCtx.beginPath();
            sbsPreviewCtx.moveTo(x, y + ih);
            sbsPreviewCtx.lineTo(x, y + archRadius);
            sbsPreviewCtx.ellipse(
                x + (iw / 2), y + archRadius, iw / 2, archRadius, 
                0, Math.PI, 0, false
            );
            sbsPreviewCtx.lineTo(x + iw, y + ih);
            sbsPreviewCtx.closePath();
            sbsPreviewCtx.clip();
        }
        sbsPreviewCtx.drawImage(img, x, y, iw, ih);
        sbsPreviewCtx.restore();
    }

    drawImageClipped(img1, Lx, Ly, Lw, Lh);
    drawImageClipped(img2, Rx, Ry, Rw, Rh);
    document.getElementById('sbsWmGroup').style.display = borderStyle !== 'none' ? '' : 'none';
    const wmt = (document.getElementById('sbsWm').value || '').trim();
    if (borderStyle !== 'none' && wmt) { const dep = (parseFloat(document.getElementById('sbsWmDepth').value) || 0) / 100 * (mode === 'crosseye' ? -1 : 1); [[Lx, Ly, Lw, Lh], [Rx, Ry, Rw, Rh]].forEach(([x, y, iw, ih], k) => wmBorder(sbsPreviewCtx, x + (k === 0 ? 0.5 : -0.5) * dep * iw, y, iw, ih, padY, wmt, document.getElementById('sbsWmColor').value)); }   // identical spot under each eye
}

document.getElementById('btnConfirmSbsSave').addEventListener('click', () => {
    if (sbsSaving || !imagesLoaded) return; sbsSaving = true;
    const jpg = document.getElementById('sbsFormat').value === 'jpg', btn = document.getElementById('btnConfirmSbsSave'), label = btn.innerText;
    btn.innerText = 'Saving...'; document.body.classList.add('busy-cursor');
    let out = null, full = null;
    const done = () => { releaseCanvas(out); if (full) { releaseCanvas(full.L); releaseCanvas(full.R); } out = full = null; sbsSaving = false; btn.innerText = label; document.body.classList.remove('busy-cursor'); };
    setTimeout(() => {   // let the 'Saving...' label paint first
        try { full = getAlignedFrames(false); out = mkCanvas(1, 1); renderSBS(out, full); releaseCanvas(full.L); releaseCanvas(full.R); full = null; }
        catch (e) { console.error(e); done(); showToast("Error building the image (too large for this browser).", true); return; }
        out.toBlob(async (blob) => {
            try {
                if (!blob) { showToast("Error saving image (too large for this browser).", true); return; }
                const mode = sbsLayoutMode.value, jps = jpg && document.getElementById('sbsJps').checked && !!JPS_MODES[mode];
                if (jps) blob = new Blob([jpsWrap(await blob.arrayBuffer(), mode)], { type: 'image/jpeg' });   // the 3D layout written into the file
                await saveBlob(blob, prefFileName('sbs', jps ? 'jps' : jpg ? 'jpg' : 'png', mode));
                showToast("SBS Image saved successfully!"); closeSbsDialog();
            } catch (e) { if (e && e.message === 'cancelled') showToast('Cancelled.'); else { console.error(e); showToast('Error saving image: ' + ((e && e.message) || 'unknown error'), true); } }
            finally { done(); }
        }, jpg ? 'image/jpeg' : 'image/png', jpg ? parseInt(document.getElementById('sbsQuality').value) / 100 : undefined);
    }, 30);
});

{   // the video button names the format this browser records (MP4 where it can, otherwise WebM)
    const vb = document.getElementById('btnExportVideo'), mp4 = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/mp4');
    if (vb && !mp4) vb.textContent = 'Save Video WebM (V)';
}
// --- EXPORT HELPERS ---
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const nextFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

// Touch devices get the native share sheet (Save to Files, AirDrop...); everything else downloads.
// iPad / iPhone (also an iPad with a trackpad or mouse, which tells pages it has a "fine" pointer) and other touch devices:
// the share sheet ("Save to Files", AirDrop...). Elsewhere: a normal download.
const shareWanted = () => !!navigator.canShare && ((typeof IS_IOS !== 'undefined' && IS_IOS) || (window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches)));
const shareNo = () => Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
function shareAsk(f) {   // the browser opens the share sheet only right after a tap; a long export loses that tap, so one more is asked for
    return new Promise((res) => {
        let done = false; const end = (mk) => { if (!done) { done = true; res(mk()); } };   // mk: made only when used (a rejection nobody waits for would be reported)
        const box = openCard('confirm shareask', '<div style="font-weight:700;font-size:1.05rem">The file is ready</div><p class="sa-name" data-noi18n style="margin-top:10px;font-size:0.9rem;color:var(--text-muted);word-break:break-all"></p>',
            [['Save or share...', () => end(() => navigator.share({ files: [f], title: f.name }).then(() => 'shared'))], ['Cancel', () => end(shareNo)]]);   // share() is called inside the tap itself
        box.querySelector('.sa-name').textContent = f.name;
        const ov = box.parentNode; new MutationObserver((_, o) => { if (!document.body.contains(ov)) { o.disconnect(); setTimeout(() => end(shareNo), 0); } }).observe(document.body, { childList: true });   // Esc or a tap outside
    });
}
async function saveBlob(blob, name) {
    if (shareWanted()) {
        const f = new File([blob], name, { type: blob.type || 'application/octet-stream' });
        let can = false; try { can = navigator.canShare({ files: [f] }); } catch (e) { }
        if (can) {
            try { await navigator.share({ files: [f], title: name }); return 'shared'; }
            catch (e) {
                if (e && e.name === 'AbortError') throw new Error('cancelled');   // closed without saving: the caller says "Cancelled", never "saved"
                if (e && e.name === 'NotAllowedError') {   // too long since the tap
                    try { return await shareAsk(f); } catch (e2) { if (e2 && (e2.name === 'AbortError' || e2.message === 'cancelled')) throw new Error('cancelled'); }
                }
            }   // anything else: a normal download below
        }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'download';   // the browser does not tell a page whether a download was kept
}

async function withBusy(btn, label, what, fn) {
    if (busy || !imagesLoaded) return;
    busy = true; cancelReq = false; document.body.classList.add('busy-cursor'); const old = btn.innerText; btn.disabled = true; btn.innerText = label;
    try {
        if (indiv.dirty) { showToast('Applying your edits...'); await new Promise(res => setTimeout(res, 40)); ensureFrames(); }   // let the label and message paint before the heavy step
        await fn();
    }
    catch (e) { if (e && e.message === 'cancelled') showToast('Cancelled.'); else { console.error(e); showToast(`Error exporting ${what}: ${(e && e.message) || 'unknown error'}`, true); } }
    finally { document.body.classList.remove('busy-cursor'); abortGif = null; busy = false; btn.disabled = false; btn.innerText = old; }
}

// --- EXPORTS ---
document.getElementById('btnExportAnaglyph').addEventListener('click', (e) => {
    withBusy(e.currentTarget, 'Rendering...', 'anaglyph', async () => {
        const c = document.createElement('canvas'); renderAnaglyphTo(c, false); wm(c.getContext('2d'), c.width, c.height);   // always full resolution
        let blob; try { blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('image too large for this browser')), 'image/png')); } finally { releaseCanvas(c); }
        await saveBlob(blob, `anaglyph_3d_${stamp()}.png`); showToast("3D Image saved successfully!");
    });
});

// Video: rendered on a dedicated even-sized canvas, driven every frame, covering whole wiggle cycles.
document.getElementById('btnExportVideo').addEventListener('click', (e) => {
    if (!imagesLoaded) return;
    if (currentTab !== 'wiggle') { showToast("Switch to the Wiggle tab to record video.", true); return; }
    if (typeof MediaRecorder === 'undefined') { showToast("This browser cannot record video.", true); return; }
    const vbtn = e.currentTarget;
    withBusy(vbtn, 'Recording... (Esc cancels)', 'video', async () => {
        const speed = parseInt(speedRange.value), smooth = interpolateCheck.checked;
        const cycles = Math.max(1, Math.ceil(parseInt(document.getElementById('expVidSec').value) * 1000 / (speed * 2))), duration = cycles * speed * 2;
        const c = getCropRect(false); let vw = c.w, vh = c.h; const MAXV = 1920;
        if (Math.max(vw, vh) > MAXV) { const s = MAXV / Math.max(vw, vh); vw = Math.round(vw * s); vh = Math.round(vh * s); }
        vw &= ~1; vh &= ~1; if (vw < 2 || vh < 2) throw new Error('image too small');
        const cv = mkCanvas(vw, vh), cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
        // render the aligned pair ONCE at video size: every frame is then two cheap blits, even for huge photos
        const pre = ['L', 'R'].map(which => { const k = mkCanvas(vw, vh), kx = k.getContext('2d'); kx.imageSmoothingQuality = 'high'; drawAligned(kx, which, vw, vh, c, false); return k; });
        const draw = (t) => {
            const ph = t / speed, idx = Math.floor(ph) % 2, frac = ph - Math.floor(ph);
            const a = smooth ? Math.sin(Math.min(frac, 1) * Math.PI / 2) : 0;
            cx.globalAlpha = 1; cx.clearRect(0, 0, vw, vh); cx.drawImage(pre[idx], 0, 0);
            if (smooth) { cx.globalAlpha = a; cx.drawImage(pre[1 - idx], 0, 0); cx.globalAlpha = 1; }
            wm(cx, vw, vh, idx === 0 ? a : 1 - a);
        };
        let mime = 'video/mp4';
        if (!MediaRecorder.isTypeSupported(mime)) { mime = 'video/webm;codecs=vp9'; if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm'; }
        const stream = cv.captureStream(parseInt(document.getElementById('expFps').value)), chunks = [];
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 });
        rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        const stopped = new Promise((res, rej) => { rec.onstop = res; rec.onerror = ev => rej((ev && ev.error) || new Error('recorder error')); });
        draw(0); rec.start(); const t0 = performance.now();
        try {
            await new Promise(res => { const step = now => { const t = Math.max(0, now - t0); if (cancelReq || t >= duration) { res(); return; } vbtn.innerText = `Recording ${Math.round(t / duration * 100)}% (Esc cancels)`; draw(t); requestAnimationFrame(step); }; requestAnimationFrame(step); });
        } finally { if (rec.state !== 'inactive') rec.stop(); }
        await stopped; stream.getTracks().forEach(t => t.stop());
        releaseCanvas(pre[0]); releaseCanvas(pre[1]); releaseCanvas(cv);
        if (cancelReq) throw new Error('cancelled');
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        await saveBlob(new Blob(chunks, { type: mime.split(';')[0] }), `wiggle_${stamp()}.${ext}`); showToast(`Video .${ext} saved successfully!`);
    });
});

// Self-contained (no outside references) so it can run in a Web Worker or on the main thread.
// frames: array of RGBA Uint8ClampedArray. Builds ONE shared 256-colour palette (median cut) and uses
// position-based ordered dithering, so identical pixels in both frames get identical indices (no flicker).
function gifEncodeAll(frames, w, h, delayCs, loops) {
    const N = w * h;
    const lzw = (indices) => {
        const minCode = 8, clear = 256, eoi = 257;
        const out = new Uint8Array(Math.ceil(indices.length * 1.6) + 4096);
        let p = 0; out[p++] = minCode; let sub = p++;
        let next = eoi + 1, size = minCode + 1, shift = 0, cur = 0;
        const flush = (bits) => { while (shift >= bits) { out[p++] = cur & 0xFF; cur >>>= 8; shift -= 8; if (p === sub + 256) { out[sub] = 255; sub = p++; } } };
        const emit = (c) => { cur |= c << shift; shift += size; flush(8); };
        const table = new Map(); let ib = indices[0];
        emit(clear);
        for (let i = 1; i < indices.length; i++) {
            const k = indices[i], key = (ib << 8) | k, found = table.get(key);
            if (found === undefined) {
                emit(ib);
                if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; table.clear(); }
                else { if (next >= (1 << size)) size++; table.set(key, next++); }
                ib = k;
            } else ib = found;
        }
        emit(ib); emit(eoi); flush(1);
        if (p === sub + 1) out[sub] = 0; else { out[sub] = p - sub - 1; out[p++] = 0; }
        return out.subarray(0, p);
    };
    const raw = (indices) => {
        const out = new Uint8Array(Math.ceil(indices.length * 9 / 8) + Math.ceil(indices.length / 254) * 2 + Math.ceil(indices.length * 1.2 / 255) + 64);
        let p = 0; out[p++] = 8; let sub = p++; let shift = 0, cur = 0;
        const emit = (c) => { cur |= c << shift; shift += 9; while (shift >= 8) { out[p++] = cur & 0xFF; cur >>>= 8; shift -= 8; if (p === sub + 256) { out[sub] = 255; sub = p++; } } };
        emit(256);
        for (let i = 0; i < indices.length; i++) { emit(indices[i]); if ((i % 254) === 253 && i < indices.length - 1) emit(256); }
        emit(257);
        while (shift > 0) { out[p++] = cur & 0xFF; cur >>>= 8; shift -= 8; if (p === sub + 256) { out[sub] = 255; sub = p++; } }
        if (p === sub + 1) out[sub] = 0; else { out[sub] = p - sub - 1; out[p++] = 0; }
        return out.subarray(0, p);
    };
    // ---- median-cut palette on a 5-5-5 histogram ----
    const hist = new Uint32Array(32768), step = Math.max(1, Math.floor((N * frames.length) / 80000));
    for (const f of frames) for (let i = 0; i < N; i += step) { const o = i * 4; hist[((f[o] >> 3) << 10) | ((f[o + 1] >> 3) << 5) | (f[o + 2] >> 3)]++; }
    const keys = []; for (let k = 0; k < 32768; k++) if (hist[k]) keys.push(k);
    const ch = (k, a) => a === 0 ? (k >> 10) & 31 : a === 1 ? (k >> 5) & 31 : k & 31;
    const boxes = [keys];
    while (boxes.length < 256) {
        let bi = -1, bs = 0, ba = 0;
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i]; if (b.length < 2) continue;
            const mn = [31, 31, 31], mx = [0, 0, 0]; let pop = 0;
            for (const k of b) { pop += hist[k]; for (let a = 0; a < 3; a++) { const v = ch(k, a); if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } }
            let axis = 0; for (let a = 1; a < 3; a++) if (mx[a] - mn[a] > mx[axis] - mn[axis]) axis = a;
            const score = pop * (mx[axis] - mn[axis]); if (score > bs) { bs = score; bi = i; ba = axis; }
        }
        if (bi < 0) break;
        const b = boxes[bi]; b.sort((x, y) => ch(x, ba) - ch(y, ba));
        let pop = 0; for (const k of b) pop += hist[k];
        let acc = 0, cut = 1; for (let i = 0; i < b.length - 1; i++) { acc += hist[b[i]]; cut = i + 1; if (acc >= pop / 2) break; }
        boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
    }
    const pal = new Uint8Array(768);
    boxes.forEach((b, i) => {
        let r = 0, g = 0, bl = 0, pop = 0;
        for (const k of b) { const c = hist[k]; pop += c; r += ((k >> 10) & 31) * c; g += ((k >> 5) & 31) * c; bl += (k & 31) * c; }
        pal[i * 3] = Math.round(r / pop * 255 / 31); pal[i * 3 + 1] = Math.round(g / pop * 255 / 31); pal[i * 3 + 2] = Math.round(bl / pop * 255 / 31);
    });
    const np = boxes.length, lut = new Uint8Array(32768);
    for (let k = 0; k < 32768; k++) {
        const r = ((k >> 10) & 31) * 255 / 31, g = ((k >> 5) & 31) * 255 / 31, b = (k & 31) * 255 / 31; let best = 1e9, bi = 0;
        for (let p = 0; p < np; p++) { const dr = r - pal[p * 3], dg = g - pal[p * 3 + 1], db = b - pal[p * 3 + 2], d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (d < best) { best = d; bi = p; } }
        lut[k] = bi;
    }
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const head = []; const byte = (b) => head.push(b & 0xFF), word = (v) => { head.push(v & 0xFF); head.push((v >> 8) & 0xFF); };
    const str = (t) => { for (let i = 0; i < t.length; i++) head.push(t.charCodeAt(i)); };
    const parts = [];
    str("GIF89a"); word(w); word(h); byte(0xF7); byte(0); byte(0);
    for (let i = 0; i < 768; i++) byte(pal[i]);
    byte(0x21); byte(0xFF); byte(0x0B); str("NETSCAPE2.0"); byte(0x03); byte(0x01); word(loops || 0); byte(0x00);
    for (const f of frames) {
        const idx = new Uint8Array(N);
        for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
            const d = (bayer[((y & 3) << 2) | (x & 3)] / 16 - 0.5) * 10, o = i * 4;
            let r = f[o] + d, g = f[o + 1] + d, b = f[o + 2] + d;
            r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
            idx[i] = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
        }
        byte(0x21); byte(0xF9); byte(0x04); byte(0x00); word(delayCs); byte(0x00); byte(0x00);
        byte(0x2C); word(0); word(0); word(w); word(h); byte(0x00);
        parts.push(new Uint8Array(head)); head.length = 0;
        const lz = lzw(idx); parts.push(lz.length <= Math.ceil(N * 9 / 8) ? lz : raw(idx));
    }
    byte(0x3B); parts.push(new Uint8Array(head));
    return parts;
}

// Runs the encoder in a Web Worker (UI stays responsive); falls back to the main thread if workers are unavailable.
function runGifJob(frames, w, h, delay, loops) {
    return new Promise((resolve, reject) => {
        const direct = () => { try { resolve(gifEncodeAll(frames, w, h, delay, loops)); } catch (e) { reject(e); } };
        let url = null, wk = null;
        try {
            if (typeof Worker === 'undefined' || !window.Blob || !URL.createObjectURL) return direct();
            const src = `self.onmessage=function(e){var d=e.data;try{self.postMessage({parts:(${gifEncodeAll.toString()})(d.frames,d.w,d.h,d.delay,d.loops)});}catch(err){self.postMessage({error:String(err)});}};`;
            url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' })); wk = new Worker(url);
            const done = () => { wk.terminate(); URL.revokeObjectURL(url); };
            abortGif = () => { done(); reject(new Error('cancelled')); };
            wk.onmessage = (ev) => { done(); ev.data.error ? reject(new Error(ev.data.error)) : resolve(ev.data.parts); };
            wk.onerror = (ev) => { if (ev && ev.preventDefault) ev.preventDefault(); done(); direct(); };
            wk.postMessage({ frames, w, h, delay, loops });
        } catch (e) { if (wk) wk.terminate(); if (url) URL.revokeObjectURL(url); direct(); }
    });
}

document.getElementById('btnExportGIF').addEventListener('click', (e) => {
    withBusy(e.currentTarget, 'Generating GIF... (Esc cancels)', 'GIF', async () => {
        await nextFrames();
        const speed = parseInt(speedRange.value), smooth = interpolateCheck.checked;
        const framesCount = smooth ? Math.max(2, Math.min(6, Math.floor(speed / 20))) : 1;
        const c = getCropRect(false); let W = c.w, H = c.h; const MAXW = parseInt(document.getElementById('expWidth').value);
        if (W > MAXW) { H = Math.max(1, Math.round(H * MAXW / W)); W = MAXW; }
        const off = mkCanvas(W, H), ctx = off.getContext('2d'); ctx.imageSmoothingQuality = 'high'; const frames = [], rd = mkCanvas(W, H), rx = rd.getContext('2d', { willReadFrequently: true });   // drawn where the photos are (often the graphics card); only the small frame is read back
        const grab = (ph) => { wm(ctx, W, H, ph); rx.clearRect(0, 0, W, H); rx.drawImage(off, 0, 0); frames.push(rx.getImageData(0, 0, W, H).data); };
        if (!smooth) {
            for (const which of ['L', 'R']) { ctx.clearRect(0, 0, W, H); drawAligned(ctx, which, W, H, c, false); grab(which === 'L' ? 0 : 1); }
        } else {
            for (let j = 0; j < 2; j++) {
                const base = j === 0 ? 'L' : 'R', over = j === 0 ? 'R' : 'L';
                for (let i = 0; i < framesCount; i++) {
                    ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); drawAligned(ctx, base, W, H, c, false);
                    const a = Math.sin((i / framesCount) * (Math.PI / 2)); ctx.globalAlpha = a; drawAligned(ctx, over, W, H, c, false); ctx.globalAlpha = 1; grab(j === 0 ? a : 1 - a);
                }
            }
        }
        const delayCs = Math.max(2, Math.round((smooth ? speed / framesCount : speed) / 10));
        releaseCanvas(off); releaseCanvas(rd);
        const parts = await runGifJob(frames, W, H, delayCs, parseInt(document.getElementById('expLoops').value));
        await saveBlob(new Blob(parts, { type: 'image/gif' }), `wiggle_${stamp()}.gif`); showToast("Animated GIF exported successfully!");
    });
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
