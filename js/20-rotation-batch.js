/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- ROTATION / SCALE SLIDERS ---
function updateRS() {
    rotDeg = parseFloat(document.getElementById('alignRot').value); scaleK = parseFloat(document.getElementById('alignScale').value) / 100;
    document.getElementById('valRot').textContent = rotDeg.toFixed(2); document.getElementById('valScale').textContent = (scaleK * 100).toFixed(2);
    if (isAligning) renderGhosting();
}
['alignRot', 'alignScale'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { startAlignment(); updateRS(); });
    ['change', 'mouseup', 'touchend'].forEach(evt => el.addEventListener(evt, endAlignment));
});

// --- BATCH CONVERSION TO ZIP (store-only ZIP writer, no libraries) ---
function crc32(u8) {
    if (!crc32.t) { crc32.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } }
    let c = ~0; for (let i = 0; i < u8.length; i++) c = crc32.t[(c ^ u8[i]) & 255] ^ (c >>> 8); return ~c >>> 0;
}
function makeZip(files) {
    const parts = [], cd = [], enc = new TextEncoder(), d = new Date(); let off = 0;
    const dt = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dd = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
        const nm = enc.encode(f.name), crc = f.crc ?? crc32(f.data), sz = f.data.length;   // batch passes a CRC computed earlier, file by file
        const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true); lh.setUint16(26, nm.length, true);
        parts.push(new Uint8Array(lh.buffer), nm, f.data);
        const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
        cd.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + sz;
    }
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cd.reduce((a, b) => a + b.length, 0), true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cd, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function batchPair(file) {   // file -> {L, R canvases, b1, b2 raw JPEGs when lossless is possible}
    const ext = /\.mpo$/i.test(file.name);
    if (ext || await looksLikeMPO(file)) {
        try {
            const [b1, b2] = await parseMPO(file), [i1, i2] = await Promise.all([imgFromBuffer(b1), imgFromBuffer(b2)]);
            if (ext || (i1.width === i2.width && i1.height === i2.height)) {
                const cv = (im) => { const c = mkCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
                const src = { L: cv(i1), R: cv(i2) }, b = pairBases(src, 'crop'), [L, R] = pairFit(b.L, b.R, 'crop');   // different sizes: same scale, cropped to the common area
                [src.L, src.R, b.L, b.R].forEach(c => { if (c !== L && c !== R) releaseCanvas(c); });
                const ok = i2.width === i1.width && i2.height === i1.height && jpegOrientation(b1) === 1 && jpegOrientation(b2) === 1;
                return { L, R, b1: ok ? b1 : null, b2: ok ? b2 : null, exif: b1 };
            }
        } catch (e) { if (ext) throw e; }
    }
    const jps = await jpsRead(file), lay = jps ? jps.layout : document.getElementById('sbsInputLayout').value;   // a JPS says its own layout
    const url = URL.createObjectURL(jps || /\.jps$/i.test(file.name) ? new Blob([file], { type: 'image/jpeg' }) : file); let img; try { img = await loadImageAsync(url); } finally { URL.revokeObjectURL(url); }
    let w, h, a, b;
    if (lay === 'tb' || lay === 'tb-r') { w = img.width; h = Math.floor(img.height / 2); a = [0, 0]; b = [0, h]; if (lay === 'tb-r') [a, b] = [b, a]; } else { w = Math.floor(img.width / 2); h = img.height; a = [0, 0]; b = [w, 0]; if (lay === 'cross') [a, b] = [b, a]; }
    const W = w * (jps && jps.halfW ? 2 : 1), H = h * (jps && jps.halfH ? 2 : 1), L = mkCanvas(W, H), R = mkCanvas(W, H);   // squeezed JPS halves stretched back
    L.getContext('2d').drawImage(img, a[0], a[1], w, h, 0, 0, W, H); R.getContext('2d').drawImage(img, b[0], b[1], w, h, 0, 0, W, H);
    return { L, R, b1: null, b2: null, exif: null, lay };
}
function batchWiggleFrames(L, R) {
    const speed = parseInt(speedRange.value) || 150, smooth = interpolateCheck.checked, n = smooth ? Math.max(2, Math.min(6, Math.floor(speed / 20))) : 1;
    let W = L.width, H = L.height; const MAXW = parseInt(document.getElementById('expWidth').value) || 800; if (W > MAXW) { H = Math.max(1, Math.round(H * MAXW / W)); W = MAXW; }
    const off = mkCanvas(W, H), ctx = off.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high'; const frames = [];
    const grab = (ph) => { wm(ctx, W, H, ph); frames.push(ctx.getImageData(0, 0, W, H).data); };
    if (!smooth) { [L, R].forEach((im, k) => { ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); ctx.drawImage(im, 0, 0, W, H); grab(k); }); }
    else for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) {
        const a = Math.sin((i / n) * (Math.PI / 2)); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H); ctx.drawImage(j === 0 ? L : R, 0, 0, W, H);
        ctx.globalAlpha = a; ctx.drawImage(j === 0 ? R : L, 0, 0, W, H); ctx.globalAlpha = 1; grab(j === 0 ? a : 1 - a);
    }
    return { frames, W, H, delayMs: Math.round(smooth ? speed / n : speed) };
}
async function batchRun(files, fmt, status, opt) {
    if (fmt === 'apng' && typeof CompressionStream === 'undefined') { showToast("This browser cannot create APNG (no CompressionStream).", true); return; }
    busy = true; cancelReq = false; const out = [], used = new Set(), failed = [];
    try {
        for (let i = 0; i < files.length; i++) {
            if (cancelReq) break;
            const f = files[i]; status.textContent = `Converting ${i + 1} of ${files.length}: ${f.name}  (Esc cancels)`; await nextFrames();
            let pr = null;
            try {
                pr = await batchPair(f); if (opt && opt.vAlign && fmt !== '3dta') batchVAlign(pr); const w = pr.L.width, h = pr.L.height; let base = f.name.replace(/\.[^.]+$/, ''), n = 1; while (used.has(base)) base = `${f.name.replace(/\.[^.]+$/, '')}_${++n}`; used.add(base);
                let data, name;
                if (fmt === 'mpo') {
                    const j1 = pr.b1 || await canvasToJpegBuffer(pr.L), j2 = pr.b2 || await canvasToJpegBuffer(pr.R), e1 = findJpegEnd(j1, 0), e2 = findJpegEnd(j2, 0);
                    const [t1, t2] = await Promise.all([makeThumb(pr.L), makeThumb(pr.R)]);
                    data = new Uint8Array(createMPOBuffer(e1 > 0 ? j1.slice(0, e1) : j1, e2 > 0 ? j2.slice(0, e2) : j2, pr.exif, t1, t2)); name = base + '.mpo';
                } else if (fmt === 'gif' || fmt === 'apng') {   // same settings as the Wiggle export options (speed, crossfade, width, loops, watermark)
                    const fr = batchWiggleFrames(pr.L, pr.R), loops = parseInt(document.getElementById('expLoops').value) || 0;
                    if (fmt === 'gif') { const parts = await runGifJob(fr.frames, fr.W, fr.H, Math.max(2, Math.round(fr.delayMs / 10)), loops); abortGif = null; data = new Uint8Array(await new Blob(parts).arrayBuffer()); name = base + '_wiggle.gif'; }
                    else { data = new Uint8Array(await (await buildApng(fr.frames, fr.W, fr.H, Math.min(65535, Math.max(20, fr.delayMs)), loops)).arrayBuffer()); name = base + '_wiggle.png'; }
                } else if (fmt === '3dta') {   // a project of the original file, as if it had just been opened: no settings and no undo history
                    const te = new TextEncoder(), parts = [{ name: 'mimetype', data: te.encode(PROJ_MIME) }], fn = f.name.replace(/[^\w.\- ()]+/g, '_').slice(-100) || 'photo';
                    let src;
                    if (projPortable(new Uint8Array(await f.slice(0, 12).arrayBuffer()))) {   // kept byte for byte (MPO, JPS, JPEG, PNG...)
                        src = { kind: 'single', files: ['source/' + fn], names: [f.name], layout: pr.lay || 'sbs' }; parts.push({ name: 'source/' + fn, data: new Uint8Array(await f.arrayBuffer()) });
                    } else {   // a format only some browsers open (HEIC...): the two photos as lossless PNG
                        src = { kind: 'pixels', files: [], names: [] };
                        for (const [c, nm] of [[pr.L, 'left.png'], [pr.R, 'right.png']]) { const bb = await new Promise(r => c.toBlob(r, 'image/png')); if (!bb) throw new Error('could not encode the photos'); parts.push({ name: 'source/' + nm, data: new Uint8Array(await bb.arrayBuffer()) }); src.files.push('source/' + nm); src.names.push(nm); }
                    }
                    const manifest = { format: '3DToolAD project', formatVersion: PROJ_VER, app: APP.id, appVersion: APP.version, created: new Date().toISOString(), source: src, photoSize: [w, h], fresh: true };
                    parts.push({ name: 'manifest.json', data: te.encode(JSON.stringify(manifest, null, 2)) });
                    const k = Math.min(1, 320 / w), tc = scaledCanvas(pr.L, Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); parts.push({ name: 'preview.jpg', data: new Uint8Array(await canvasToJpegBuffer(tc, 0.8)) }); releaseCanvas(tc);
                    data = new Uint8Array(await makeZip(parts).arrayBuffer()); name = base + '.3dta';
                } else if (fmt === 'html') {
                    data = new TextEncoder().encode(await buildViewerHtml({ L: pr.L, R: pr.R, w, h })); name = base + '_viewer.html';
                } else {
                    const c = mkCanvas(fmt === 'sbs' ? w * 2 : w, h), x = c.getContext('2d');
                    if (fmt === 'sbs') { x.drawImage(pr.L, 0, 0); x.drawImage(pr.R, w, 0); }
                    else {
                        const dL = pr.L.getContext('2d').getImageData(0, 0, w, h), dR = pr.R.getContext('2d').getImageData(0, 0, w, h), o = x.createImageData(w, h);
                        anaglyphCPU(dL.data, dR.data, o.data, 'dubois'); x.putImageData(o, 0, 0);
                    }
                    data = new Uint8Array(await canvasToJpegBuffer(c, 0.92)); name = base + (fmt === 'sbs' ? '_sbs.jpg' : '_anaglyph.jpg');
                }
                if (opt && opt.pattern) { let cand = batchName(opt.pattern, f.name, i, fmt, name), k = 1; const ext = cand.slice(cand.lastIndexOf('.')), stem = cand.slice(0, cand.lastIndexOf('.')); while (out.some(o => o.name === cand)) cand = `${stem}_${++k}${ext}`; name = cand; }
                out.push({ name, data, crc: crc32(data) });
            } catch (e) { console.error(e); failed.push(f.name); }
            finally { if (pr) { releaseCanvas(pr.L); releaseCanvas(pr.R); } }
        }
        if (cancelReq) { showToast("Batch cancelled."); status.textContent = 'Cancelled.'; return; }
        if (!out.length) { showToast("No files could be converted.", true); status.textContent = 'Nothing was converted.'; return; }
        status.textContent = 'Creating ZIP...'; await nextFrames();
        await saveBlob(makeZip(out), `3d_batch_${stamp()}.zip`);
        status.textContent = `Done: ${out.length} file(s)` + (failed.length ? `, ${failed.length} failed (${failed.join(', ')})` : '') + '.';
        showToast(`ZIP saved: ${out.length} file(s)` + (failed.length ? `, ${failed.length} failed: ${failed.join(', ')}` : '') + '.', failed.length > 0);
    } finally { busy = false; }
}
// Batch conversion window (Tools). The conversion itself is batchRun, unchanged.
function openBatchTool() {
    if (document.querySelector('.ov.tool')) return;
    const box = openCard('tool batch', '<div style="font-weight:700;font-size:1.1rem">Batch convert to ZIP</div>'
        + '<p style="margin:10px 0 0;font-size:0.85rem;color:var(--text-muted)">Converts many MPO, JPS or side-by-side files at once and saves the results in one ZIP.</p>', [['Back', () => { if (busy) showToast('A conversion is running: press Esc to cancel it first.', true); else toolBack(box); }, true], ['Close', () => { if (busy) showToast('A conversion is running: press Esc to cancel it first.', true); else box.parentNode.remove(); }, true]]);
    box.style.maxWidth = '560px'; const o = box.parentNode; o.dataset.lock = '1';   // a click outside does not close it (a batch may be running)
    const b = document.createElement('div'); b.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:12px';
    const inp = document.createElement('input'); inp.type = 'file'; inp.id = 'inputBatch'; inp.accept = '.mpo,.jps,image/*'; inp.multiple = true; inp.style.display = 'none';
    const pickRow = document.createElement('div'); pickRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:0.85rem';
    const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn btn-outline'; pick.style.cssText = 'width:auto;padding:8px 14px'; pick.textContent = 'Choose files...';
    const count = document.createElement('span'); count.style.color = 'var(--text-muted)'; count.textContent = 'No files chosen'; pickRow.append(pick, count);
    const sel = document.createElement('select'); sel.innerHTML = '<option value="mpo">MPO (lossless when possible)</option><option value="sbs">Full side-by-side JPEG</option><option value="ana">Anaglyph (Dubois) JPEG</option><option value="gif">Wiggle GIF</option><option value="apng">Wiggle APNG (24-bit)</option><option value="html">Standalone 3D viewer (HTML)</option><option value="3dta">3DToolAD project (.3dta), without settings or history</option>';
    const selStyle = 'padding:8px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light)'; sel.style.cssText = selStyle;
    const layIn = document.getElementById('sbsInputLayout'), lay = document.createElement('select'); lay.innerHTML = layIn.innerHTML; lay.value = layIn.value; lay.style.cssText = selStyle;   // the same setting as on the start screen
    lay.addEventListener('change', () => { layIn.value = lay.value; layIn.dispatchEvent(new Event('change', { bubbles: true })); });
    const layNote = document.createElement('div'); layNote.style.cssText = 'font-size:12px;color:var(--text-muted)'; layNote.textContent = 'Layout of single non-MPO files (the same setting as on the start screen):';
    const note = document.createElement('div'); note.style.cssText = 'font-size:12px;color:var(--text-muted)'; note.textContent = 'Pairs are converted as they are (no alignment). The ZIP is built in memory, so keep batches moderate.';
    const pat = document.createElement('input'); pat.type = 'text'; pat.value = '{name}'; pat.title = 'File name pattern: {name} {n} {fmt}'; pat.style.cssText = selStyle;
    const vaLabel = document.createElement('label'); vaLabel.style.cssText = 'font-size:13px'; const va = document.createElement('input'); va.type = 'checkbox'; vaLabel.append(va, ' Fix vertical misalignment of each pair automatically');
    const patNote = document.createElement('div'); patNote.style.cssText = 'font-size:12px;color:var(--text-muted)'; patNote.textContent = 'File name pattern. Tokens: {name} original name, {n} counter, {fmt} format.';
    const status = document.createElement('div'); status.style.cssText = 'font-size:12px;word-break:break-all';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'btn'; go.style.cssText = 'width:auto;padding:8px 14px;align-self:flex-start'; go.textContent = 'Start'; go.disabled = true;
    const syncVa = () => { va.disabled = sel.value === '3dta'; vaLabel.style.opacity = va.disabled ? '0.5' : ''; };   // a .3dta keeps the photos as they are
    sel.addEventListener('change', syncVa); syncVa();
    let files = [];
    pick.onclick = () => { if (!busy) inp.click(); };
    inp.addEventListener('change', () => { files = [...inp.files]; inp.value = ''; count.textContent = files.length ? `${files.length} file(s) chosen` : 'No files chosen'; go.disabled = !files.length; status.textContent = ''; });
    go.onclick = async () => {
        if (busy || !files.length) { if (busy) showToast('Wait for the export to finish.', true); return; }
        go.disabled = sel.disabled = pick.disabled = lay.disabled = true;
        try { await batchRun(files, sel.value, status, { vAlign: va.checked, pattern: pat.value.trim() }); }
        finally { go.disabled = !files.length; sel.disabled = pick.disabled = lay.disabled = false; }
    };
    b.append(inp, pickRow, sel, layNote, lay, patNote, pat, vaLabel, note, status, go); box.insertBefore(b, box.lastChild);
}

// Typing in a text field (watermark, file name pattern...) must never trigger a hotkey
const typingTarget = (t) => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes(t.type)));
['keydown', 'keyup'].forEach(ev => window.addEventListener(ev, (e) => { if (typingTarget(e.target) && e.key !== 'Escape' && !e.target.classList.contains('sv-box')) e.stopPropagation(); }, true));   // slider value boxes handle their own keys (24-sliders.js)

document.addEventListener('change', (e) => { if (e.target && e.target.tagName === 'SELECT') e.target.blur(); });

// stop Space from also "clicking" a focused button after the shortcut already handled it
document.addEventListener('keyup', (e) => { if (e.key === ' ' && screenEditor.classList.contains('active')) e.preventDefault(); });

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
