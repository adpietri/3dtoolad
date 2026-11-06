/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- shared by the tools that make a stereo pair ---
function toolWork(btn, fn) {   // 'Working...' on the button, a moment to paint it, then fn (may be async)
    if (btn.disabled) return; const old = btn.textContent; btn.disabled = true; btn.textContent = 'Working...';
    setTimeout(async () => {
        try { await fn(); } catch (e) { console.error(e); showToast('Could not finish: ' + ((e && e.message) || e), true); }
        finally { btn.disabled = false; btn.textContent = old; }
    }, 30);
}
function toolSaveSbs(btn, make, name) {   // make() -> { L, R } made for this save (released here)
    toolWork(btn, () => new Promise((res) => {
        const v = make(); if (!v) { res(); return; }
        const w = v.L.width, h = v.L.height, c = mkCanvas(2 * w, h), x = c.getContext('2d');
        if (!x) { releaseCanvas(v.L); releaseCanvas(v.R); releaseCanvas(c); showToast('The image is too large for this browser to save side by side.', true); res(); return; }   // over the browser's canvas limit
        x.drawImage(v.L, 0, 0); x.drawImage(v.R, w, 0); releaseCanvas(v.L); releaseCanvas(v.R);
        c.toBlob((b) => { releaseCanvas(c); if (b) saveBlob(b, `${name}_sbs_${stamp()}.jpg`).then(() => showToast('Side-by-side saved.'), () => showToast('Cancelled.')); else showToast('Could not save the image.', true); res(); }, 'image/jpeg', 0.95);
    }));
}
function toolOpenPair(box, btn, make, msg) {   // opens make() -> { L, R } in the program (asks first when a project is open)
    const go = () => {
        if (busy) { showToast('Wait for the export to finish.', true); return; }
        toolWork(btn, () => {
            const v = make(); if (!v) return;
            box.parentNode.remove(); ++loadSeq; openedMpoFile = null;
            setFrames(v.L, v.R, null, null); releaseCanvas(v.L); releaseCanvas(v.R); projSrc = { kind: 'pixels' }; onImagesReady(); showToast(msg);
        });
    };
    if (imagesLoaded) openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Replace the open project?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The current photos and their alignment will be closed.</p>', [['Open as stereo pair', go], ['Cancel']]);
    else go();
}
function toolPicker(box, btnId, nameId, onImg) {   // a hidden file input for the button btnId; onImg(image, name without extension)
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = btnId + 'File'; inp.style.display = 'none'; box.appendChild(inp);
    box.querySelector('#' + btnId).addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
        const f = inp.files[0]; inp.value = ''; if (!f) return;
        const url = URL.createObjectURL(f);
        try { const im = await loadImageAsync(url); box.querySelector('#' + nameId).textContent = `${f.name} (${im.naturalWidth} × ${im.naturalHeight})`; onImg(im, f.name.replace(/\.[^.]+$/, '') || 'image'); }
        catch (e) { console.error(e); showToast('Could not open that image.', true); }
        finally { URL.revokeObjectURL(url); }
    });
}
const toolRow = 'display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:0.85rem;margin-top:10px';
const toolBtns = (a, b) => `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button type="button" class="btn" id="${a}" style="width:auto;padding:8px 14px" disabled>Open as stereo pair</button><button type="button" class="btn btn-outline" id="${b}" style="width:auto;padding:8px 14px" disabled>Save side-by-side JPEG</button></div>`;
const toolSlider = (id, label, min, max, step, val) => `<label style="display:flex;gap:8px;align-items:center;flex:1 1 220px">${label}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" style="flex:1;min-width:90px"><span id="${id}V" style="min-width:3.2em;text-align:right"></span></label>`;
const grayOfRGBA = (d, n) => { const g = new Float32Array(n); for (let p = 0, i = 0; p < n; p++, i += 4) g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; return g; };

// --- Stereo card splitter: finds the two photos on a scanned stereo card, straightens and crops them ---
function cardDeskew(c) {   // degrees the scan is turned (clockwise positive), from how sharply its straight edges line up
    const w = c.width, h = c.height, g = grayOfRGBA(c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, w * h), H = [], V = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const p = y * w + x, gx = Math.abs(g[p + 1] - g[p - 1]), gy = Math.abs(g[p + w] - g[p - w]);
        if (gy > 36 && gy > 2 * gx) H.push(x, y, gy); else if (gx > 36 && gx > 2 * gy) V.push(x, y, gx);
    }
    const D = Math.ceil(Math.hypot(w, h)) + 2, bins = new Float32Array(2 * D);
    const score = (a) => {
        const t = a * Math.PI / 180, co = Math.cos(t), si = Math.sin(t); let s = 0;
        bins.fill(0); for (let k = 0; k < H.length; k += 3) bins[Math.round(H[k + 1] * co - H[k] * si) + D] += H[k + 2];
        for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
        bins.fill(0); for (let k = 0; k < V.length; k += 3) bins[Math.round(V[k] * co + V[k + 1] * si) + D] += V[k + 2];
        for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
        return s;
    };
    let best = 0, bs = -1;
    for (let a = -5; a <= 5.001; a += 0.25) { const s = score(a); if (s > bs) { bs = s; best = a; } }
    const a0 = best; for (let a = a0 - 0.2; a <= a0 + 0.201; a += 0.05) { const s = score(a); if (s > bs) { bs = s; best = a; } }
    return Math.round(best * 20) / 20;
}
function cardRotate(src, deg, w, h, fill) {   // src drawn at w x h, turned back by deg around the centre
    const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = fill; x.fillRect(0, 0, w, h);
    x.imageSmoothingQuality = 'high'; x.translate(w / 2, h / 2); x.rotate(-deg * Math.PI / 180); x.drawImage(src, -w / 2, -h / 2, w, h); return c;
}
function cardColour(c) {   // colour of the card: median of a thin ring along the edges
    const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, b = Math.max(2, Math.round(Math.min(w, h) * 0.02)), ch = [[], [], []];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { if (x >= b && x < w - b && y >= b && y < h - b) continue; const i = (y * w + x) * 4; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
    return ch.map(a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; });
}
function cardBoxes(c, cc) {   // the two photos as [x, y, w, h] in 0..1 of c, the same size; halves when nothing is found
    const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, g = grayOfRGBA(d, w * h), m = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const p = y * w + x, i = p * 4, dist = Math.abs(d[i] - cc[0]) + Math.abs(d[i + 1] - cc[1]) + Math.abs(d[i + 2] - cc[2]);
        m[p] = (dist > 54 || Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + w] - g[p - w]) > 44) ? 1 : 0;   // not card colour, or detailed
    }
    const p90 = (a) => { const s = Array.from(a).sort((p, q) => p - q); return s[Math.floor(s.length * 0.9)] || 0; };
    const run = (prof, lo, hi) => {   // the longest run of prof >= half its 90th percentile within [lo, hi), closing small dips
        const t = 0.5 * p90(prof.subarray(lo, hi)), gap = Math.max(2, Math.round((hi - lo) * 0.03)); let best = null, s = -1, last = -1;
        for (let i = lo; i <= hi; i++) {
            const on = i < hi && prof[i] >= t && t > 0;
            if (on) { if (s < 0 || i - last > gap) s = i; last = i; if (!best || last - s > best[1] - best[0]) best = [s, last + 1]; }
        }
        return best;
    };
    const col = new Float32Array(w), y0 = Math.round(h * 0.2), y1 = Math.round(h * 0.8);
    for (let x = 0; x < w; x++) { let s = 0; for (let y = y0; y < y1; y++) s += m[y * w + x]; col[x] = s / Math.max(1, y1 - y0); }
    let split = Math.round(w / 2), mn = Infinity;
    for (let x = Math.round(w * 0.38); x < Math.round(w * 0.62); x++) { const v = col[x - 1] + col[x] + col[x + 1]; if (v < mn - 1e-6 || (Math.abs(v - mn) < 1e-6 && Math.abs(x - w / 2) < Math.abs(split - w / 2))) { mn = v; split = x; } }
    const side = (a, b) => {
        const cx = run(col, a, b); if (!cx) return null;
        const row = new Float32Array(h); for (let y = 0; y < h; y++) { let s = 0; for (let x = cx[0]; x < cx[1]; x++) s += m[y * w + x]; row[y] = s / (cx[1] - cx[0]); }
        const cy = run(row, 0, h); if (!cy) return null;
        return [cx[0], cy[0], cx[1] - cx[0], cy[1] - cy[0]];
    };
    let A = side(0, split), B = side(split, w);
    const bad = (r) => !r || r[2] < w * 0.15 || r[3] < h * 0.3;
    if (bad(A) || bad(B)) { const i = Math.round(w * 0.01); A = [i, i, Math.round(w / 2) - 2 * i, h - 2 * i]; B = [Math.round(w / 2) + i, i, Math.round(w / 2) - 2 * i, h - 2 * i]; }
    const bw = Math.min(A[2], B[2]), bh = Math.min(A[3], B[3]), fit = (r) => [(r[0] + (r[2] - bw) / 2) / w, (r[1] + (r[3] - bh) / 2) / h, bw / w, bh / h];
    return [fit(A), fit(B)];
}
function openCardTool() {
    if (document.querySelector('.ov.tool')) return;
    const box = openCard('tool cardsplit', '<div style="font-weight:700;font-size:1.1rem">Stereo card splitter</div>'
        + '<p style="margin:10px 0;font-size:0.85rem;color:var(--text-muted)">Load the scan of a stereo card. The two photos are found, the scan is straightened and the card around them is cut away. Drag a box to move it, or a corner to resize both. Fine alignment is done afterwards in the program (Auto-align).</p>'
        + '<div style="' + toolRow + '"><button type="button" class="btn btn-outline" id="crdLoad" style="width:auto;padding:8px 14px">Load scan...</button><span id="crdName" style="color:var(--text-muted)">No image loaded</span></div>'
        + '<div style="' + toolRow + '">' + toolSlider('crdAngle', 'Straighten', -5, 5, 0.05, 0)
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="crdSwap"> Swap left / right (cross-eyed card)</label>'
        + '<button type="button" class="btn btn-outline" id="crdRedo" style="width:auto;padding:6px 12px" disabled>Detect again</button></div>'
        + '<canvas id="crdCanvas" style="display:none;margin-top:12px;max-width:100%;max-height:46vh;width:auto;height:auto;border-radius:6px;box-shadow:none;touch-action:none;cursor:move"></canvas>'
        + toolBtns('crdOpen', 'crdSave'), [['Back', () => toolBack(box), true], ['Close']]);
    box.style.maxWidth = '760px';
    const q = (id) => box.querySelector('#' + id), cv = q('crdCanvas'), ang = q('crdAngle');
    let img = null, name = 'card', small = null, rot = null, cc = [255, 255, 255], boxes = null, drag = null;
    const fill = () => `rgb(${cc[0]},${cc[1]},${cc[2]})`;
    const showAngle = () => { q('crdAngleV').textContent = (+ang.value).toFixed(2) + '°'; };
    const draw = () => {
        if (!rot || !boxes) return;
        const x = cv.getContext('2d'); x.drawImage(rot, 0, 0); const W = cv.width, H = cv.height, lw = Math.max(2, Math.round(W / 300));
        boxes.forEach((b, i) => {
            const r = [b[0] * W, b[1] * H, b[2] * W, b[3] * H], col = i === 0 ? '#e53935' : '#00acc1';
            x.lineWidth = lw; x.strokeStyle = col; x.strokeRect(r[0], r[1], r[2], r[3]);
            x.fillStyle = col; const k = lw * 4; [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v]) => x.fillRect(r[0] + u * r[2] - k, r[1] + v * r[3] - k, 2 * k, 2 * k));
            x.font = `bold ${Math.round(H / 18)}px sans-serif`; x.fillText((i === 0) !== q('crdSwap').checked ? 'L' : 'R', r[0] + k * 2, r[1] + H / 14);
        });
    };
    const rerot = () => { if (!small) return; if (rot) releaseCanvas(rot); rot = cardRotate(small, +ang.value, small.width, small.height, fill()); draw(); };
    const detect = () => {
        if (!small) return;
        ang.value = cardDeskew(small); showAngle(); rerot(); boxes = cardBoxes(rot, cc); draw();
    };
    showAngle();
    toolPicker(box, 'crdLoad', 'crdName', (im, nm) => {
        img = im; name = nm; const W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, 1000 / Math.max(W, H));
        if (small) releaseCanvas(small); small = scaledCanvas(im, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)));
        cc = cardColour(small); cv.width = small.width; cv.height = small.height; cv.style.display = 'block';
        detect(); ['crdOpen', 'crdSave', 'crdRedo'].forEach(id => { q(id).disabled = false; });
    });
    ang.addEventListener('input', () => { showAngle(); rerot(); });
    q('crdSwap').addEventListener('change', draw);
    q('crdRedo').addEventListener('click', detect);
    // dragging: inside a box moves it, a corner resizes both boxes (they always stay the same size)
    const at = (e) => { const r = cv.getBoundingClientRect(), t = e.pointerType === 'touch' ? 24 : 14; return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, t / r.width, t / r.height]; };   // corners are easier to catch with a finger
    cv.addEventListener('pointerdown', (e) => {
        if (!boxes) return; const [u, v, tu, tv] = at(e); drag = null;
        boxes.forEach((b, i) => {
            [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([cu, cvv], ci) => { if (!drag && Math.abs(u - (b[0] + cu * b[2])) < tu && Math.abs(v - (b[1] + cvv * b[3])) < tv) drag = { i, corner: ci, u, v, b0: b.slice() }; });
        });
        if (!drag) boxes.forEach((b, i) => { if (!drag && u > b[0] && u < b[0] + b[2] && v > b[1] && v < b[1] + b[3]) drag = { i, corner: -1, u, v, b0: b.slice() }; });
        if (drag) { cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener('pointermove', (e) => {
        if (!drag) return; const [u, v] = at(e), du = u - drag.u, dv = v - drag.v, b0 = drag.b0, cl = (t, a, z) => Math.min(z, Math.max(a, t));
        if (drag.corner < 0) { boxes[drag.i] = [cl(b0[0] + du, 0, 1 - b0[2]), cl(b0[1] + dv, 0, 1 - b0[3]), b0[2], b0[3]]; }
        else {
            const L = drag.corner === 0 || drag.corner === 3, T = drag.corner === 0 || drag.corner === 1;
            let x0 = b0[0], y0 = b0[1], x1 = b0[0] + b0[2], y1 = b0[1] + b0[3];
            if (L) x0 = cl(x0 + du, 0, x1 - 0.05); else x1 = cl(x1 + du, x0 + 0.05, 1);
            if (T) y0 = cl(y0 + dv, 0, y1 - 0.05); else y1 = cl(y1 + dv, y0 + 0.05, 1);
            const nw = x1 - x0, nh = y1 - y0, o = boxes[1 - drag.i], ox = o[0] + o[2] / 2, oy = o[1] + o[3] / 2;
            boxes[drag.i] = [x0, y0, nw, nh];
            boxes[1 - drag.i] = [cl(ox - nw / 2, 0, 1 - nw), cl(oy - nh / 2, 0, 1 - nh), nw, nh];
        }
        draw();
    });
    const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const make = () => {   // the two photos at full size
        if (!img || !boxes) return null;
        const W = img.naturalWidth, H = img.naturalHeight, a = +ang.value, full = a ? cardRotate(img, a, W, H, fill()) : img;
        const bw = Math.max(1, Math.round(boxes[0][2] * W)), bh = Math.max(1, Math.round(boxes[0][3] * H));
        const cut = (b) => { const c = mkCanvas(bw, bh), x = c.getContext('2d'); x.fillStyle = fill(); x.fillRect(0, 0, bw, bh); x.drawImage(full, Math.round(b[0] * W), Math.round(b[1] * H), bw, bh, 0, 0, bw, bh); return c; };
        const A = cut(boxes[0]), B = cut(boxes[1]); if (full !== img) releaseCanvas(full);
        return q('crdSwap').checked ? { L: B, R: A } : { L: A, R: B };
    };
    q('crdSave').addEventListener('click', () => toolSaveSbs(q('crdSave'), make, name));
    q('crdOpen').addEventListener('click', () => toolOpenPair(box, q('crdOpen'), make, 'Stereo card opened as a stereo pair.'));
    new MutationObserver((_, obs) => { if (!document.body.contains(box.parentNode)) { obs.disconnect(); releaseCanvas(small); releaseCanvas(rot); small = rot = null; img = null; } }).observe(document.body, { childList: true });
}

// --- 2D to 3D from a depth map: the photo's pixels are moved sideways by their depth (near = more) ---
function d3DepthField(dimg, w, h, invert, smooth) {   // 0 (far) .. 1 (near) per pixel of a w x h photo
    const c = scaledCanvas(dimg, w, h), g = grayOfRGBA(c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, w * h); releaseCanvas(c);
    const hist = new Uint32Array(256); for (let p = 0; p < g.length; p++) hist[Math.min(255, g[p] | 0)]++;
    const at = (f) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= g.length * f) return v; } return 255; };
    const lo = at(0.01), hi = Math.max(lo + 1, at(0.99));
    let z = new Float32Array(g.length); for (let p = 0; p < g.length; p++) { const t = Math.min(1, Math.max(0, (g[p] - lo) / (hi - lo))); z[p] = invert ? 1 - t : t; }
    const r = Math.round(smooth * w / 1000); if (r > 0) z = boxBlur(z, w, h, r);
    return z;
}
function d3Warp(d, z, w, h, f, z0) {   // view with each pixel moved by f * (depth - z0); nearer pixels cover farther ones; gaps filled from the background
    const out = new Uint8ClampedArray(w * h * 4), oz = new Float32Array(w * h).fill(-1), hole = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        const put = (q, zz, i, j, t) => { const o = row + q; if (zz <= oz[o]) return; oz[o] = zz; const k = o * 4; for (let ch = 0; ch < 3; ch++) out[k + ch] = d[i + ch] + (d[j + ch] - d[i + ch]) * t; out[k + 3] = 255; };
        for (let x = 0; x < w; x++) {
            const p = row + x, a = x + f * (z[p] - z0), i = p * 4;
            const b = x < w - 1 ? x + 1 + f * (z[p + 1] - z0) : a + 1;
            if (x < w - 1 && b > a && b - a < 2.5) {   // neighbours still close: fill the pixels between them
                for (let q = Math.ceil(a); q <= b && q < w; q++) if (q >= 0) { const t = (q - a) / (b - a); put(q, z[p] + (z[p + 1] - z[p]) * t, i, i + 4, t); }
            } else { const q = Math.round(a); if (q >= 0 && q < w) put(q, z[p], i, i, 0); }
        }
        for (let x = 0; x < w;) {   // gaps (uncovered background): take the farther of the two sides
            if (oz[row + x] >= 0) { x++; continue; }
            let e = x; while (e < w && oz[row + e] < 0) e++;
            const l = x > 0 ? row + x - 1 : -1, r = e < w ? row + e : -1, s = l < 0 ? r : r < 0 ? l : (oz[l] <= oz[r] ? l : r);
            for (let k = x; k < e; k++) { const o = (row + k) * 4; hole[row + k] = 1; if (s >= 0) { out[o] = out[s * 4]; out[o + 1] = out[s * 4 + 1]; out[o + 2] = out[s * 4 + 2]; } out[o + 3] = 255; }
            x = e;
        }
    }
    const fin = new Uint8ClampedArray(out);   // soften the filled gaps up and down so they do not look like streaks
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x; if (!hole[p]) continue; let n = 0, s0 = 0, s1 = 0, s2 = 0;
        for (let yy = Math.max(0, y - 4); yy <= Math.min(h - 1, y + 4); yy++) { const k = (yy * w + x) * 4; s0 += out[k]; s1 += out[k + 1]; s2 += out[k + 2]; n++; }
        fin[p * 4] = s0 / n; fin[p * 4 + 1] = s1 / n; fin[p * 4 + 2] = s2 / n;
    }
    const c = mkCanvas(w, h); c.getContext('2d').putImageData(new ImageData(fin, w, h), 0, 0); return c;
}
function d3Views(photo, dimg, o, maxW) {   // { L, R } canvases, at most maxW wide
    const W0 = photo.naturalWidth || photo.width, H0 = photo.naturalHeight || photo.height, k = Math.min(1, maxW / W0, Math.sqrt(24e6 / (W0 * H0))),   // at most 24 MP per view (memory)
         w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k));
    const pc = scaledCanvas(photo, w, h), d = pc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const z = d3DepthField(dimg, w, h, o.invert, o.smooth), px = o.strength * w / 100, z0 = o.plane / 100;
    if (o.photoLeft) return { L: pc, R: d3Warp(d, z, w, h, -px, z0) };
    releaseCanvas(pc); return { L: d3Warp(d, z, w, h, px / 2, z0), R: d3Warp(d, z, w, h, -px / 2, z0) };
}
function open2Dto3DTool() {
    if (document.querySelector('.ov.tool')) return;
    const box = openCard('tool d2to3', '<div style="font-weight:700;font-size:1.1rem">2D to 3D from a depth map</div>'
        + '<p style="margin:10px 0;font-size:0.85rem;color:var(--text-muted)">Load a photo and its depth map (grey image, white = near, like the one made by the Depth map tool). The two views are made by moving each part of the photo sideways by its depth. Edges of near objects may show some stretching.</p>'
        + '<div style="' + toolRow + '"><button type="button" class="btn btn-outline" id="d3Photo" style="width:auto;padding:8px 14px">Load photo...</button><span id="d3PhotoName" style="color:var(--text-muted)">No photo loaded</span></div>'
        + '<div style="' + toolRow + '"><button type="button" class="btn btn-outline" id="d3Depth" style="width:auto;padding:8px 14px">Load depth map...</button><span id="d3DepthName" style="color:var(--text-muted)">No depth map loaded</span></div>'
        + '<div style="' + toolRow + '">' + toolSlider('d3Str', '3D strength', 0.5, 6, 0.1, 2.5) + toolSlider('d3Plane', 'Screen plane', 0, 100, 1, 85) + '</div>'
        + '<div style="' + toolRow + '">' + toolSlider('d3Smooth', 'Smooth depth', 0, 10, 1, 2)
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="d3Inv"> Invert depth (black = near)</label></div>'
        + '<div style="' + toolRow + '"><label>Photo is <select id="d3Mode" style="padding:6px 8px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light)"><option value="mid">the centre (both views made, best)</option><option value="left">the left view (only the right one made)</option></select></label>'
        + '<label>Preview <select id="d3View" style="padding:6px 8px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light)"><option value="sbs">Side-by-side</option><option value="ana">Anaglyph (red/cyan)</option></select></label></div>'
        + '<div id="d3Status" style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)"></div>'
        + '<canvas id="d3Canvas" style="display:none;margin-top:8px;max-width:100%;max-height:46vh;width:auto;height:auto;border-radius:6px;box-shadow:none"></canvas>'
        + toolBtns('d3Open', 'd3Save'), [['Back', () => toolBack(box), true], ['Close']]);
    box.style.maxWidth = '760px';
    const q = (id) => box.querySelector('#' + id), cv = q('d3Canvas'); let photo = null, dmap = null, name = 'photo', raf = 0;
    const opts = () => ({ strength: +q('d3Str').value, plane: +q('d3Plane').value, smooth: +q('d3Smooth').value, invert: q('d3Inv').checked, photoLeft: q('d3Mode').value === 'left' });
    const labels = () => { q('d3StrV').textContent = (+q('d3Str').value).toFixed(1) + '%'; q('d3PlaneV').textContent = q('d3Plane').value + '%'; q('d3SmoothV').textContent = q('d3Smooth').value; };
    const render = () => {
        raf = 0; labels(); if (!photo || !dmap) return;
        const v = d3Views(photo, dmap, opts(), 800), w = v.L.width, h = v.L.height, x = cv.getContext('2d');
        if (q('d3View').value === 'ana') {
            cv.width = w; cv.height = h; const a = v.L.getContext('2d').getImageData(0, 0, w, h), b = v.R.getContext('2d').getImageData(0, 0, w, h), o = x.createImageData(w, h);
            anaglyphCPU(a.data, b.data, o.data, 'halfcolor'); x.putImageData(o, 0, 0);
        } else { cv.width = 2 * w; cv.height = h; x.drawImage(v.L, 0, 0); x.drawImage(v.R, w, 0); }
        releaseCanvas(v.L); releaseCanvas(v.R); cv.style.display = 'block'; q('d3Open').disabled = false; q('d3Save').disabled = false;
    };
    const later = () => { labels(); if (!raf) raf = requestAnimationFrame(render); };
    const check = () => {
        if (!photo || !dmap) { q('d3Status').textContent = !photo ? 'Load a photo.' : 'Load its depth map.'; return; }
        const a = photo.naturalWidth / photo.naturalHeight, b = dmap.naturalWidth / dmap.naturalHeight;
        q('d3Status').textContent = Math.abs(a / b - 1) > 0.03 ? 'The depth map has a different shape from the photo: it is stretched to fit, so the depth may not match exactly.' : '';
    };
    labels(); check();
    toolPicker(box, 'd3Photo', 'd3PhotoName', (im, nm) => { photo = im; name = nm; check(); render(); });
    toolPicker(box, 'd3Depth', 'd3DepthName', (im) => { dmap = im; check(); render(); });
    ['d3Str', 'd3Plane', 'd3Smooth'].forEach(id => q(id).addEventListener('input', later));
    ['d3Inv', 'd3Mode', 'd3View'].forEach(id => q(id).addEventListener('change', later));
    const make = () => (photo && dmap) ? d3Views(photo, dmap, opts(), 6000) : null;
    q('d3Save').addEventListener('click', () => toolSaveSbs(q('d3Save'), make, name + '_3d'));
    q('d3Open').addEventListener('click', () => toolOpenPair(box, q('d3Open'), make, 'Photo opened as a stereo pair.'));
    new MutationObserver((_, obs) => { if (!document.body.contains(box.parentNode)) { obs.disconnect(); if (raf) cancelAnimationFrame(raf); photo = dmap = null; } }).observe(document.body, { childList: true });
}

// --- Anaglyph to side-by-side: each eye's view is taken from its colour channels ---
const ANA_SPLIT = {   // per type: grey value of each eye from r, g, b, and which channels keep the eye's own colour
    rc: { name: 'Red / Cyan (classic, half-color, optimized, Dubois)', L: (r, g, b) => r, R: (r, g, b) => (g + b) / 2, cL: [1, 0, 0], cR: [0, 1, 1] },
    rb: { name: 'Red / Blue', L: (r, g, b) => r, R: (r, g, b) => b, cL: [1, 0, 0], cR: [0, 0, 1] },
    rg: { name: 'Red / Green', L: (r, g, b) => r, R: (r, g, b) => g, cL: [1, 0, 0], cR: [0, 1, 0] },
    gm: { name: 'Green / Magenta (Trioscopic)', L: (r, g, b) => g, R: (r, g, b) => (r + b) / 2, cL: [0, 1, 0], cR: [1, 0, 1] },
    ab: { name: 'Amber / Blue', L: (r, g, b) => (r + g) / 2, R: (r, g, b) => b, cL: [1, 1, 0], cR: [0, 0, 1] }
};
function anaSplit(img, type, mono, balance, swap) {   // returns { L, R } canvases
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, src = mkCanvas(w, h), sx = src.getContext('2d', { willReadFrequently: true });
    sx.drawImage(img, 0, 0); const d = sx.getImageData(0, 0, w, h).data; releaseCanvas(src);
    const T = ANA_SPLIT[type], n = w * h, gL = new Float32Array(n), gR = new Float32Array(n);
    for (let i = 0, p = 0; p < n; i += 4, p++) { gL[p] = T.L(d[i], d[i + 1], d[i + 2]); gR[p] = T.R(d[i], d[i + 1], d[i + 2]); }
    const stretch = (g) => {   // both views to the same brightness range (the two colour channels are rarely equally bright)
        const hist = new Uint32Array(256); for (let p = 0; p < n; p++) hist[g[p] | 0]++;
        const at = (f) => { let c = 0; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= n * f) return v; } return 255; };
        const lo = at(0.005), hi = Math.max(lo + 1, at(0.995)), k = 255 / (hi - lo);
        for (let p = 0; p < n; p++) g[p] = (g[p] - lo) * k;
    };
    if (balance) { stretch(gL); stretch(gR); }
    const out = (g, col) => {
        const c = mkCanvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), o = id.data;
        for (let i = 0, p = 0; p < n; i += 4, p++) { const v = g[p]; if (mono) { o[i] = o[i + 1] = o[i + 2] = v; } else { o[i] = v * col[0]; o[i + 1] = v * col[1]; o[i + 2] = v * col[2]; } o[i + 3] = 255; }
        x.putImageData(id, 0, 0); return c;
    };
    const L = out(gL, T.cL), R = out(gR, T.cR);
    return swap ? { L: R, R: L } : { L, R };
}
function openAnaToSbsTool() {
    if (document.querySelector('.ov.tool')) return;
    const box = openCard('tool ana2sbs', '<div style="font-weight:700;font-size:1.1rem">Anaglyph to side-by-side</div>'
        + '<p style="margin:10px 0;font-size:0.85rem;color:var(--text-muted)">Each eye\'s view is rebuilt from its colour channel. Colours lost in the anaglyph cannot come back, so the result is grey or tinted, and some ghosting of the other eye may remain.</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:0.85rem">'
        + '<button type="button" class="btn btn-outline" id="a2sLoad" style="width:auto;padding:8px 14px">Load anaglyph...</button><span id="a2sName" style="color:var(--text-muted)">No image loaded</span></div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:0.85rem;margin-top:10px">'
        + '<label>Type <select id="a2sType" style="padding:6px 8px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light);max-width:100%">' + Object.entries(ANA_SPLIT).map(([k, t]) => `<option value="${k}">${t.name}</option>`).join('') + '</select></label>'
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="a2sMono" checked> Monochrome (unchecked: the two original colours)</label>'
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="a2sBal" checked> Balance brightness</label>'
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="a2sSwap"> Swap left / right</label></div>'
        + '<canvas id="a2sCanvas" style="display:none;margin-top:12px;max-width:100%;max-height:46vh;width:auto;height:auto;border-radius:6px;box-shadow:none"></canvas>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px"><button type="button" class="btn" id="a2sOpen" style="width:auto;padding:8px 14px" disabled>Open as stereo pair</button>'
        + '<button type="button" class="btn btn-outline" id="a2sSave" style="width:auto;padding:8px 14px" disabled>Save side-by-side JPEG</button></div>'
        + '<input type="file" id="a2sFile" accept="image/*" style="display:none">', [['Back', () => toolBack(box), true], ['Close']]);
    box.style.maxWidth = '760px';
    const q = (id) => box.querySelector('#' + id), cv = q('a2sCanvas'); let img = null, views = null, name = 'anaglyph';
    const render = () => {
        if (!img) return;
        if (views) { releaseCanvas(views.L); releaseCanvas(views.R); }
        views = anaSplit(img, q('a2sType').value, q('a2sMono').checked, q('a2sBal').checked, q('a2sSwap').checked);
        const w = views.L.width, h = views.L.height, k = Math.min(1, 1600 / (2 * w));   // the preview is at most 1600 px wide
        cv.width = Math.round(2 * w * k); cv.height = Math.round(h * k);
        const x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(views.L, 0, 0, w * k, h * k); x.drawImage(views.R, w * k, 0, w * k, h * k);
        cv.style.display = 'block'; q('a2sOpen').disabled = false; q('a2sSave').disabled = false;
    };
    ['a2sType', 'a2sMono', 'a2sBal', 'a2sSwap'].forEach(id => q(id).addEventListener('change', render));
    q('a2sLoad').addEventListener('click', () => q('a2sFile').click());
    q('a2sFile').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        const url = URL.createObjectURL(f);
        try { img = await loadImageAsync(url); name = f.name.replace(/\.[^.]+$/, '') || 'anaglyph'; q('a2sName').textContent = f.name + ' (' + img.naturalWidth + ' × ' + img.naturalHeight + ')'; render(); }
        catch (err) { showToast('Could not open that image.', true); }
        finally { URL.revokeObjectURL(url); }
    });
    q('a2sSave').addEventListener('click', () => {
        if (!views) return;
        const w = views.L.width, h = views.L.height, c = mkCanvas(2 * w, h), x = c.getContext('2d'); x.drawImage(views.L, 0, 0); x.drawImage(views.R, w, 0);
        c.toBlob((b) => { releaseCanvas(c); if (b) saveBlob(b, `${name}_sbs_${stamp()}.jpg`).then(() => showToast('Side-by-side saved.'), () => showToast('Cancelled.')); }, 'image/jpeg', 0.95);
    });
    q('a2sOpen').addEventListener('click', () => {
        if (!views) return;
        const go = () => {
            if (busy) { showToast('Wait for the export to finish.', true); return; }
            const L = views.L, R = views.R; views = null;
            box.parentNode.remove();
            ++loadSeq; openedMpoFile = null;
            setFrames(L, R, null, null); releaseCanvas(L); releaseCanvas(R); projSrc = { kind: 'pixels' }; onImagesReady();
            showToast('Anaglyph opened as a stereo pair.');
        };
        if (imagesLoaded) openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Replace the open project?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The current photos and their alignment will be closed.</p>', [['Open as stereo pair', go], ['Cancel']]);
        else go();
    });
    new MutationObserver((_, obs) => { if (!document.body.contains(box.parentNode)) { obs.disconnect(); if (views) { releaseCanvas(views.L); releaseCanvas(views.R); views = null; } img = null; } }).observe(document.body, { childList: true });
}
document.getElementById('btnTools').addEventListener('click', openTools);

// drag & drop highlight, accessibility labels and tooltips
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('drop', () => { dragDepth = 0; document.body.classList.remove('dragging'); }, true);
[['btnTheme', 'Toggle light or dark theme'], ['btnPlayPause', 'Play or pause the animation'], ['btnHelp', 'Keyboard shortcuts and about'], ['btnClear', 'Discard the project']].forEach(([id, t]) => { const el = document.getElementById(id); if (el) el.setAttribute('aria-label', t); });
Object.entries({ alignX: 'Horizontal offset of the right image', alignY: 'Vertical offset of the right image', alignRot: 'Rotation of the right image', alignScale: 'Scale of the right image', alignFloat: 'Width of the floating window bars' }).forEach(([id, t]) => { const el = document.getElementById(id); if (el && !el.title) el.title = t; });

// MPO compatibility profiles (find out which metadata a picky viewer needs, without editing code)
const MPO_PROFILES = {
    std: { disparityType: true, attrIFD: true, geometry: true, thumbnail: true }, nothumb: { disparityType: true, attrIFD: true, geometry: true, thumbnail: false },
    nogeo: { disparityType: true, attrIFD: true, geometry: false, thumbnail: true }, basic: { disparityType: false, attrIFD: false, geometry: false, thumbnail: false }
};
function applyMpoProfile() { Object.assign(MPO_OPTS, MPO_PROFILES[document.getElementById('mpoProfile').value] || MPO_PROFILES.std); MPO_OPTS.camera = document.getElementById('mpoCamera').checked; }
['mpoProfile', 'mpoCamera'].forEach(id => ['change', 'input'].forEach(ev => document.getElementById(id).addEventListener(ev, applyMpoProfile)));
applyMpoProfile();

// clipboard. Wigglegram and Individual Images copy the two photos side by side (left | right, edits applied), so pasting
// the copy here opens the same 3D photo again; Anaglyph copies the anaglyph picture. (6.1 copied the frame shown by the
// wigglegram, a single photo: pasted back, it was cut in two halves of the same eye.)
// The picture is handed to the clipboard as a promise inside the tap: some browsers accept a write only during the tap itself.
let lastCopy = null;   // { w, h, kind: 'pair' | 'anaglyph' } of the last picture copied by this program
const COPY_MAX_PX = 40e6;   // a bigger pair is copied smaller (memory, and what other programs accept)
const pngOf = (cv) => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('empty')), 'image/png'));
function copyPairCanvas() {   // the two photos, aligned and cropped as shown, side by side
    ensureFrames(); const al = getAlignedFrames(false), k = Math.min(1, Math.sqrt(COPY_MAX_PX / (2 * al.w * al.h)));
    const w = Math.max(1, Math.round(al.w * k)), h = Math.max(1, Math.round(al.h * k)), cv = mkCanvas(w * 2, h), cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high'; cx.drawImage(al.L, 0, 0, w, h); cx.drawImage(al.R, w, 0, w, h); releaseCanvas(al.L); releaseCanvas(al.R);
    return cv;
}
document.getElementById('btnCopyView').addEventListener('click', async () => {
    if (!imagesLoaded) return;
    if (busy) { showToast('Wait for the export to finish (or press Esc to cancel).', true); return; }
    if (!navigator.clipboard || !navigator.clipboard.write || !window.ClipboardItem) { showToast("Could not copy (the browser may require a secure page).", true); return; }
    const kind = currentTab === 'anaglyph' ? 'anaglyph' : 'pair';
    let made = null;
    const make = () => made || (made = new Promise((res, rej) => setTimeout(() => {   // a moment for the message to show first
        let cv = null;
        try { cv = kind === 'pair' ? copyPairCanvas() : anaglyphCanvas; } catch (e) { rej(e); return; }
        const size = { w: cv.width, h: cv.height };
        pngOf(cv).then(b => { made.size = size; res(b); }, rej).finally(() => { if (cv !== anaglyphCanvas) releaseCanvas(cv); });
    }, 30)));
    if (kind === 'pair' && indiv.dirty) showToast('Applying your edits...');
    try {
        try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })]); }
        catch (e) { if (e && e.name === 'NotAllowedError') throw e; await navigator.clipboard.write([new ClipboardItem({ 'image/png': await make() })]); }   // browsers that want the picture itself
        lastCopy = Object.assign({ kind }, made.size);
        showToast(kind === 'pair' ? 'The two photos were copied side by side (left | right).' : 'The anaglyph picture was copied.');
    } catch (e) { console.warn(e); showToast("Could not copy (the browser may require a secure page).", true); }
});
window.addEventListener('paste', (e) => {
    if (busy || typingTarget(e.target) || document.querySelector('.ov') || sbsModal.classList.contains('active')) return;
    const f = [...((e.clipboardData && e.clipboardData.files) || [])].find(x => x.type.startsWith('image/')); if (!f) return;
    e.preventDefault();
    (async () => {   // a copy made here is recognised by its size: the pair opens side by side whatever the layout chosen
        let mine = null;
        if (lastCopy) { const u = URL.createObjectURL(f); try { const im = await loadImageAsync(u); if (im.width === lastCopy.w && im.height === lastCopy.h) mine = lastCopy.kind; } catch (err) { } finally { URL.revokeObjectURL(u); } }
        if (mine === 'anaglyph') { showToast('This is the anaglyph picture copied here: one picture, it cannot be opened as a 3D pair. To copy the 3D photo, use Copy in the Wigglegram tab.', true); return; }
        askReplace(() => mine === 'pair' ? loadSingleFile(f, 'sbs') : loadSingleFile(f));
    })();
});

// self-test: runs the checks in YOUR browser (add ?selftest=yes to the address, or use About > Run self-test)
async function runSelfTest() {
    const rows = [], esc = (t) => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const T = async (name, fn) => { try { rows.push([true, name, (await fn()) || '']); } catch (e) { rows.push([false, name, (e && e.message) || String(e)]); } };
    const dec = (blob) => new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('the browser could not decode it')); }; i.src = u; });
    const mk = (color) => { const c = mkCanvas(96, 64), x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 96, 64); x.fillStyle = '#fff'; x.fillRect(10, 10, 30, 20); return c; };
    let j1, j2;
    await T('JPEG encoder (canvas)', async () => { j1 = await canvasToJpegBuffer(mk('#c33')); j2 = await canvasToJpegBuffer(mk('#33c')); if (j1.byteLength < 200) throw new Error('too small'); return j1.byteLength + ' bytes'; });
    await T('MPO build, MPF index and read-back', async () => {
        const thumb = await makeThumb(mk('#3c3')), mpo = createMPOBuffer(j1, j2, null, thumb, thumb), mp = readMpfOffsets(mpo);
        if (!mp || mp.length !== 2) throw new Error('MPF index missing');
        if (mp[0].size !== mp[1].offset) throw new Error('image 1 size does not match image 2 offset');
        if (findJpegEnd(mpo, mp[1].offset) - mp[1].offset !== mp[1].size) throw new Error('image 2 size does not match its real end');
        const parts = await parseMPO(new File([mpo], 't.mpo')), im = await imgFromBuffer(parts[1]); if (im.width !== 96) throw new Error('image 2 did not decode');
        return 'thumbnail ' + (thumb ? thumb.length + ' bytes' : 'off') + ', ' + mpo.byteLength + ' bytes';
    });
    await T('CRC32 and ZIP writer', async () => { if (crc32(new TextEncoder().encode('hello')) !== 0x3610a686) throw new Error('bad CRC'); const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]); if (z.size < 60) throw new Error('ZIP too small'); });
    const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    await T('GIF encoder, decoded by the browser', async () => { const parts = gifEncodeAll([px(mk('#c33')), px(mk('#33c'))], 96, 64, 5, 0), im = await dec(new Blob(parts, { type: 'image/gif' })); if (im.width !== 96) throw new Error('wrong size'); });
    await T('GIF in a Web Worker', async () => { const parts = await runGifJob([px(mk('#c33')), px(mk('#33c'))], 96, 64, 5, 0); if (!parts || !parts.length) throw new Error('no output'); return typeof Worker !== 'undefined' ? 'worker available' : 'no worker (main thread used)'; });
    await T('APNG (CompressionStream)', async () => { if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream not supported'); const im = await dec(await buildApng([px(mk('#c33')), px(mk('#33c'))], 96, 64, 100, 0)); if (im.width !== 96) throw new Error('wrong size'); });
    await T('Anaglyph view from the graphics card', async () => (anaGpuInit() ? 'WebGL2, matched the previous way' : 'previous way (' + (ANA2.why || IG.why) + ')'));
    await T('Multi-core CPU path', async () => ((await parReady()) ? PAR.n + ' workers, same result as one core' : 'one core (' + PAR.why + ')'));
    await T('Individual Images renderer', async () => (igInit() ? 'GPU (WebGL2) passed its own check against the CPU, max ' + IG.max + ' px' + (IG.fl ? '' : ', Clarity on CPU') : 'CPU fallback (' + IG.why + ')'));
    await T('Anaglyph renderer', async () => (initGL() ? 'GPU (WebGL) passed its own check, max texture ' + GL.maxTex + ' px' : 'CPU fallback (no usable WebGL)'));
    await T('Video recording', async () => { if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder not available'); return ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter(t => MediaRecorder.isTypeSupported(t)).join(', ') || 'no supported type'; });
    await T('Saved settings (localStorage)', async () => { localStorage.setItem('3dtool-test', '1'); if (localStorage.getItem('3dtool-test') !== '1') throw new Error('not working'); localStorage.removeItem('3dtool-test'); });
    await T('Clipboard and share', async () => 'clipboard ' + !!(navigator.clipboard && window.ClipboardItem) + ', share files ' + !!navigator.canShare);
    // ---- extra tests (group A): file formats and metadata ----
    await T('MPO profiles (standard, no thumbnail, no geometry, basic)', async () => {
        const saved = { ...MPO_OPTS }, out = [];
        try {
            for (const [name, p] of Object.entries(MPO_PROFILES)) {
                Object.assign(MPO_OPTS, p);
                const th = p.thumbnail ? await makeThumb(mk('#3c3')) : null, mpo = createMPOBuffer(j1, j2, null, th, th), mp = readMpfOffsets(mpo);
                if (!mp || mp.length !== 2 || mp[0].size !== mp[1].offset || findJpegEnd(mpo, mp[1].offset) - mp[1].offset !== mp[1].size) throw new Error(name + ': inconsistent MPF');
                const parts = await parseMPO(new File([mpo], 't.mpo'));
                if ((await imgFromBuffer(parts[1])).width !== 96) throw new Error(name + ': second image did not decode');
                out.push(name + ' ' + mpo.byteLength + ' B');
            }
        } finally { Object.assign(MPO_OPTS, saved); }
        return out.join(', ');
    });
    await T('EXIF: camera info kept, old program signature replaced', async () => {
        const saved = MPO_OPTS.camera; MPO_OPTS.camera = true;
        try {
            const withExif = (make, model, soft) => {   // a copy of the JPEG that carries these EXIF tags
                const e = [{ tag: 0x010F, type: 2, v: make }, { tag: 0x0110, type: 2, v: model }]; if (soft) e.push({ tag: 0x0131, type: 2, v: soft });
                const seg = tiffSegment(0xFFE1, [0x45, 0x78, 0x69, 0x66, 0, 0], tiffIfd(e, 8, 0)), src = new Uint8Array(j1), out = new Uint8Array(src.length + seg.length);
                out.set(src.subarray(0, 2), 0); out.set(seg, 2); out.set(src.subarray(2), 2 + seg.length); return out.buffer;
            };
            const read = (src) => readExifTags(createMPOBuffer(j1, j2, src, null, null).slice(0, 4000)).ifd0;
            const a = read(withExif('TestCam', 'X100', 'Firmware 1.0')), b = read(withExif('OldMake', 'OldModel', APP.name + ' 0.1'));
            if (!a[0x010F] || a[0x010F].v !== 'TestCam' || a[0x0110].v !== 'X100') throw new Error('real camera info was not preserved');
            if (!b[0x010F] || b[0x010F].v === 'OldMake' || b[0x0110].v === 'OldModel') throw new Error('an old program signature was copied');
            if (a[0x0131].v !== MPO_OPTS.software) throw new Error('Software is not the current one');
            return MPO_OPTS.software;
        } finally { MPO_OPTS.camera = saved; }
    });
    await T('EXIF thumbnail: embedded, and skipped when too big', async () => {
        const th = await makeThumb(mk('#3c3')); if (!th) throw new Error('thumbnail could not be made');
        const segLen = (mpo) => new DataView(mpo).getUint16(4);   // length of the first APP1 (Exif) segment
        const withTh = createMPOBuffer(j1, j2, null, th, th), noTh = createMPOBuffer(j1, j2, null, null, null), huge = createMPOBuffer(j1, j2, null, new Uint8Array(70000), null);
        if (segLen(withTh) < segLen(noTh) + th.length) throw new Error('thumbnail was not written');
        if (segLen(huge) !== segLen(noTh)) throw new Error('an oversized thumbnail was not skipped');
        return 'thumbnail ' + th.length + ' B';
    });
    await T('MPO import tolerates an outdated size in the index', async () => {
        const mpo = createMPOBuffer(j1, j2, null, null, null), expected = readMpfOffsets(mpo)[1].size, u = new Uint8Array(mpo), dv = new DataView(mpo);
        let i = 0; while (i < u.length - 4 && !(u[i] === 0x4D && u[i + 1] === 0x50 && u[i + 2] === 0x46 && u[i + 3] === 0)) i++;
        const t = i + 4, ifd = dv.getUint32(t + 4, true), n = dv.getUint16(t + ifd, true); let patched = false;
        for (let k = 0; k < n; k++) { const e = t + ifd + 2 + k * 12; if (dv.getUint16(e, true) === 0xB002) { const sp = t + dv.getUint32(e + 8, true) + 16 + 4; dv.setUint32(sp, dv.getUint32(sp, true) - 37, true); patched = true; } }
        if (!patched) throw new Error('could not build the test file');
        const parts = await parseMPO(new File([mpo], 't.mpo'));
        if (parts[1].byteLength !== expected) throw new Error('second image was cut (' + parts[1].byteLength + ' of ' + expected + ' bytes)');
        if ((await imgFromBuffer(parts[1])).width !== 96) throw new Error('second image did not decode');
    });
    await T('ZIP round trip (read back and verify every CRC)', async () => {
        const files = [{ name: 'a.bin', data: new Uint8Array(1000).map((_, k) => k * 7) }, { name: 'é.txt', data: new TextEncoder().encode('hello') }];
        const slowCrc = (u) => { let c = ~0; for (const x of u) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; } return ~c >>> 0; };   // independent bit-by-bit CRC
        const buf = await makeZip(files).arrayBuffer(), dv = new DataView(buf); let p = 0;
        for (const f of files) {
            if (dv.getUint32(p, true) !== 0x04034b50) throw new Error('bad local header');
            const crc = dv.getUint32(p + 14, true), sz = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), data = new Uint8Array(buf, p + 30 + nl, sz);
            if (sz !== f.data.length || crc !== slowCrc(data) || crc !== slowCrc(f.data)) throw new Error('data or CRC mismatch in ' + f.name);
            p += 30 + nl + sz;
        }
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('central directory missing');
        if (dv.getUint32(buf.byteLength - 22, true) !== 0x06054b50 || dv.getUint16(buf.byteLength - 12, true) !== 2) throw new Error('end record wrong');
    });
    // ---- extra tests (group B): what only a real browser can check ----
    await T('GIF colors survive encode and decode', async () => {
        const im = await dec(new Blob(gifEncodeAll([px(mk('#c33')), px(mk('#33c'))], 96, 64, 5, 0), { type: 'image/gif' })), c = mkCanvas(96, 64), x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(80, 50, 1, 1).data; if (Math.abs(d[0] - 204) > 16 || Math.abs(d[1] - 51) > 16 || Math.abs(d[2] - 51) > 16) throw new Error('color mismatch: ' + Array.from(d.slice(0, 3)));
    });
    await T('APNG colors are exact', async () => {
        if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream not supported');
        const im = await dec(await buildApng([px(mk('#c33')), px(mk('#33c'))], 96, 64, 100, 0)), c = mkCanvas(96, 64), x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(80, 50, 1, 1).data; if (Math.abs(d[0] - 204) > 3 || Math.abs(d[1] - 51) > 3 || Math.abs(d[2] - 51) > 3) throw new Error('color mismatch: ' + Array.from(d.slice(0, 3)));
    });
    await T('Pair alignment on real pixels (finds a 10 px vertical offset)', async () => {
        const W = 256, H = 192, L = mkCanvas(W, H), R = mkCanvas(W, H), lx = L.getContext('2d'), id = lx.createImageData(W, H); let seed = 7;
        for (let k = 0; k < W * H; k++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const v = (seed >> 8) & 255; id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255; }
        lx.putImageData(id, 0, 0); R.getContext('2d').drawImage(L, 0, 10);   // the right image sits 10 px lower
        const pr = { L, R, b1: 1, b2: 1 }; batchVAlign(pr);
        if (pr.L.height !== H - 10) throw new Error('expected a height of ' + (H - 10) + ', got ' + pr.L.height);
    });
    await T('Largest canvas this browser allows (info)', async () => {
        let best = 'less than 4096 x 4096';
        for (const [w, h] of [[4096, 4096], [6000, 4000]]) {
            try { const c = mkCanvas(w, h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(w - 1, h - 1, 1, 1); const ok = x.getImageData(w - 1, h - 1, 1, 1).data[3] === 255; c.width = 1; c.height = 1; if (!ok) break; best = w + ' x ' + h + ' (' + Math.round(w * h / 1e6) + ' MP)'; } catch (e) { break; }
        }
        return best;
    });
    await T('Speed on this device (info)', async () => {
        const a = new Uint8ClampedArray(4e6), b = new Uint8ClampedArray(4e6), o = new Uint8ClampedArray(4e6); let t0 = performance.now(); anaglyphCPU(a, b, o, 'dubois'); const t1 = performance.now() - t0;
        const big = mkCanvas(1600, 1200), bx = big.getContext('2d'); bx.fillStyle = '#789'; bx.fillRect(0, 0, 1600, 1200); t0 = performance.now(); await canvasToJpegBuffer(big); const t2 = performance.now() - t0;
        const f = px(mk('#c33')); t0 = performance.now(); gifEncodeAll([f, f, f, f], 96, 64, 5, 0); const t3 = performance.now() - t0;
        return 'anaglyph on the CPU (1 MP) ' + Math.round(t1) + ' ms, JPEG encode (2 MP) ' + Math.round(t2) + ' ms, small GIF ' + Math.round(t3) + ' ms';
    });
    // ---- extra tests (group C): individual images ----
    await T('Color mixer math (HSL)', async () => {
        const z = () => Array.from({ length: 8 }, () => [0, 0, 0]), px4 = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);
        let hs = z(), d = px4(200, 60, 40); hslApplyPixels(d, hslLut(hs)); if (d[0] !== 200 || d[1] !== 60 || d[2] !== 40) throw new Error('pixels changed with all sliders at zero');
        hs = z(); hs[0][1] = -100; d = px4(255, 0, 0); hslApplyPixels(d, hslLut(hs)); if (Math.abs(d[0] - d[1]) > 3 || Math.abs(d[1] - d[2]) > 3) throw new Error('red was not desaturated: ' + Array.from(d.slice(0, 3)));
        const bl = px4(0, 0, 255); hslApplyPixels(bl, hslLut(hs)); if (bl[2] !== 255 || bl[0] !== 0) throw new Error('blue was changed by the red band');
        hs = z(); hs.forEach(b => { b[0] = 50; b[1] = 50; b[2] = 50; }); const gr = px4(128, 128, 128); hslApplyPixels(gr, hslLut(hs)); if (gr[0] !== 128 || gr[1] !== 128 || gr[2] !== 128) throw new Error('a grey pixel changed');
        hs = z(); hs[0][0] = 100; d = px4(255, 0, 0); hslApplyPixels(d, hslLut(hs)); if (!(d[1] > 100 && d[0] > 200)) throw new Error('hue shift not as expected: ' + Array.from(d.slice(0, 3)));
        hs = z(); hs[0][2] = 100; d = px4(180, 30, 30); hslApplyPixels(d, hslLut(hs)); if (!(d[0] > 180 && d[1] > 30)) throw new Error('luminance did not lighten red');
    });
    await T('Auto-rotate decisions', async () => {
        const W = 24, H = 24, sky = new Uint8ClampedArray(W * H * 4), flip = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = y < H / 2 ? [120, 160, 235] : [60, 80, 40], a = (y * W + x) * 4, f = ((H - 1 - y) * W + x) * 4; sky.set([...c, 255], a); flip.set([...c, 255], f); }
        if (!(uprightScore(sky, W, H) > 30)) throw new Error('an upright scene was not recognised'); if (!(uprightScore(flip, W, H) < -30)) throw new Error('an upside-down scene was not recognised');
        let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, base = Array.from({ length: 400 }, () => rnd() * 200 - 100), other = () => Array.from({ length: 400 }, () => rnd() * 200 - 100);
        if (pickRelativeRotation(base, [base, other(), other(), other()]) !== 0) throw new Error('a matching pair was rotated');
        if (pickRelativeRotation(base, [other(), other(), other(), base]) !== 3) throw new Error('a 270 degree mismatch was not found');
    });
    await T('Exposure, tone and white balance math', async () => {
        const Z = () => { const a = {}; ADJ_KEYS.forEach(k => { a[k] = 0; }); return a; }, run = (adj, r, g, b) => { const d = new Uint8ClampedArray([r, g, b, 255]); adjApplyPixels(d, 1, 1, adj); return Array.from(d.slice(0, 3)); };
        const ch = (cond, msg) => { if (!cond) throw new Error(msg); };
        let a = Z(); let p = run(a, 90, 140, 200); ch(p[0] === 90 && p[1] === 140 && p[2] === 200, 'pixels changed with every slider at zero: ' + p);
        a = Z(); a.exposure = 100; ch(run(a, 128, 128, 128)[0] > 190, 'exposure +100 did not brighten'); a.exposure = -100; ch(run(a, 128, 128, 128)[0] < 70, 'exposure -100 did not darken');
        a = Z(); a.brightness = 60; ch(run(a, 128, 128, 128)[0] > 150, 'brightness did not lift the mid-tones'); ch(run(a, 0, 0, 0)[0] === 0 && run(a, 255, 255, 255)[0] === 255, 'brightness moved black or white');
        a = Z(); a.contrast = 60; ch(run(a, 80, 80, 80)[0] < 80 && run(a, 180, 180, 180)[0] > 180, 'contrast did not spread the tones'); a.contrast = -100; ch(Math.abs(run(a, 20, 20, 20)[0] - 128) < 3 && Math.abs(run(a, 240, 240, 240)[0] - 128) < 3, 'contrast -100 is not flat');
        a = Z(); a.shadows = 100; ch(run(a, 60, 60, 60)[0] > 75, 'shadows did not lift a dark tone'); ch(run(a, 0, 0, 0)[0] === 0 && run(a, 255, 255, 255)[0] === 255, 'shadows moved pure black or white'); ch(Math.abs(run(a, 235, 235, 235)[0] - 235) < 4, 'shadows changed a bright tone');
        a = Z(); a.highlights = -100; ch(run(a, 200, 200, 200)[0] < 188, 'highlights -100 did not recover a bright tone'); ch(Math.abs(run(a, 40, 40, 40)[0] - 40) < 3, 'highlights changed a dark tone');
        a = Z(); a.saturation = -100; p = run(a, 220, 90, 40); ch(Math.abs(p[0] - p[1]) < 3 && Math.abs(p[1] - p[2]) < 3, 'saturation -100 is not grey: ' + p);
        a = Z(); a.vibrance = 100; const dull = run(a, 130, 120, 110), vivid = run(a, 150, 90, 60), gain = (o, n) => (Math.max(...n) - Math.min(...n)) / (Math.max(...o) - Math.min(...o));
        ch(gain([130, 120, 110], dull) > gain([150, 90, 60], vivid) + 0.2, 'vibrance did not favour the dull color');
        a = Z(); a.temperature = 100; p = run(a, 128, 128, 128); ch(p[0] > p[1] && p[2] < p[1], 'warm did not add red and remove blue: ' + p); a.temperature = -100; p = run(a, 128, 128, 128); ch(p[2] > p[1] && p[0] < p[1], 'cool did not add blue and remove red: ' + p);
        a = Z(); a.tint = 100; p = run(a, 128, 128, 128); ch(p[1] < p[0] && p[1] < p[2], 'magenta tint did not reduce green: ' + p); a.tint = -100; p = run(a, 128, 128, 128); ch(p[1] > p[0] && p[1] > p[2], 'green tint did not raise green: ' + p);
        a = Z(); a.tint = 60; a.temperature = 40; p = run(a, 128, 128, 128); ch(p[0] > p[2] && p[1] < p[0], 'tint and temperature did not combine: ' + p);
        const W = 32, d = new Uint8ClampedArray(W * W * 4); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) d.set(x < 16 ? [100, 100, 100, 255] : [160, 160, 160, 255], (y * W + x) * 4);
        a = Z(); a.clarity = 100; adjApplyPixels(d, W, W, a); const at = (x) => d[(16 * W + x) * 4];
        ch(at(14) < 100 && at(17) > 160, 'clarity did not sharpen the edge: ' + at(14) + ' / ' + at(17)); ch(Math.abs(at(2) - 100) <= 1 && Math.abs(at(29) - 160) <= 1, 'clarity changed flat areas');
    });
    await T('Geometry, tone curve, white-balance picker and 2-point alignment math', async () => {
        const ch = (c, m) => { if (!c) throw new Error(m); }, W = 40, H = 30, img = new Uint8ClampedArray(W * H * 4);
        for (let i = 0; i < img.length; i += 4) { img[i] = (i / 4) % 251; img[i + 1] = ((i / 4) * 7) % 253; img[i + 2] = 99; img[i + 3] = 255; }
        const z = { straighten: 0, keyV: 0, keyH: 0, lens: 0 }, same = geoApplyPixels(img, W, H, z); ch(same.every((v, i) => v === img[i]), 'zero geometry changed the pixels');
        for (const g of [{ ...z, straighten: 6 }, { ...z, keyV: 80 }, { ...z, keyH: -80 }, { ...z, lens: 100 }, { ...z, lens: -100 }, { straighten: -8, keyV: 50, keyH: 40, lens: 60 }]) {
            const P = geoParams(g, W, H), k = P.s / P.R;
            for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], [W / 2, 0], [0, H / 2]]) {   // every edge of the result must come from inside the photo (no empty corners)
                const u = (x + 0.5 - P.cx) * k, v = (y + 0.5 - P.cy) * k, a = u * P.co - v * P.si, b = u * P.si + v * P.co, a2 = a * (1 + P.kv * b), b2 = b * (1 + P.kh * a), f = 1 + P.kl * (a2 * a2 + b2 * b2);
                const sx = P.cx + a2 * f * P.R - 0.5, sy = P.cy + b2 * f * P.R - 0.5; ch(sx >= -0.6 && sx <= W - 0.4 && sy >= -0.6 && sy <= H - 0.4, 'empty corner with ' + JSON.stringify(g));
            }
        }
        ch(geoParams({ ...z, straighten: 6 }, W, H).s < 1, 'straightening did not zoom in to fill the corners');
        const id = curveLut([0, 0, 0, 0]); ch(id.every((v, i) => v === i), 'flat curve is not identity');
        for (const a of [[100, 100, 100, 100], [-100, -100, -100, -100], [100, -100, 100, -100]]) { const L = curveLut(a); ch(L[0] === 0 && L[255] === 255, 'curve moved black or white'); for (let i = 1; i < 256; i++) ch(L[i] >= L[i - 1], 'curve goes down'); }
        ch(curveLut([100, 0, 0, 0])[32] > 40, 'shadows +100 did not lift the shadows'); ch(curveLut([0, 0, 0, -100])[224] < 214, 'highlights -100 did not lower the highlights');
        ch(Math.abs(curveLut([100, 0, 0, 0])[224] - 224) <= 2, 'shadows changed the highlights');
        const cl = curveLuts({ rgb: [0, 0, 0, 0], r: [0, 60, 60, 0], g: [0, 0, 0, 0], b: [0, 0, 0, 0] }); ch(cl[0][128] > 128 && cl[1][128] === 128 && cl[2][128] === 128, 'channel curve leaked into other channels');
        // Curves (points): straight = no change, passes through its points, smooth without overshoot, cleaned when read from a file
        ch(ptsLut([[0, 0], [255, 255]]).every((v, i) => v === i), 'straight Curves line is not identity');
        const P3 = [[0, 0], [64, 100], [192, 220], [255, 255]], L3 = ptsLut(P3); ch(P3.every(([a, b]) => L3[a] === b), 'Curves line misses its points');
        for (let i = 1; i < 256; i++) ch(L3[i] >= L3[i - 1], 'rising Curves points gave a falling line');
        const Lf = ptsLut([[0, 0], [128, 255], [255, 0]]); ch(Lf.every(v => v >= 0 && v <= 255) && Lf[128] === 255 && Lf[0] === 0 && Lf[255] === 0, 'peaked Curves line overshot');
        const Le = ptsLut([[40, 30], [200, 220]]); ch(Le[0] === 30 && Le[20] === 30 && Le[255] === 220 && Le[230] === 220, 'Curves end points do not hold the ends');
        const pc = ptsClean([[300, -5], [0, 0], 'x', [1, 1], [128, 128.4], [NaN, 3]]); ch(JSON.stringify(pc) === '[[0,0],[128,128],[255,0]]', 'Curves points not cleaned: ' + JSON.stringify(pc));
        ch(JSON.stringify(ptsClean(null)) === '[[0,0],[255,255]]' && ptsClean(Array.from({ length: 40 }, (_, i) => [i * 6, i * 6])).length === PTS_MAX, 'Curves points: bad default or too many points kept');
        const cz = indivNewSt().curve; ch(curveZero(cz), 'new photo has a Curves change'); cz.pts.g = [[0, 0], [128, 160], [255, 255]]; ch(!curveZero(cz), 'Curves change not seen');
        const cl2 = curveLuts(cz); ch(cl2[1][128] === 160 && cl2[0][128] === 128 && cl2[2][128] === 128, 'green Curves leaked into other channels');
        const Z = () => { const a = {}; ADJ_KEYS.forEach(k => { a[k] = 0; }); return a; };
        for (const [r, g, b] of [[180, 150, 120], [110, 130, 170], [140, 120, 150]]) {
            const wb = wbFromSample(r, g, b), a = Z(); a.temperature = wb.temperature; a.tint = wb.tint; const d = new Uint8ClampedArray([r, g, b, 255]); adjApplyPixels(d, 1, 1, a);
            ch(Math.max(d[0], d[1], d[2]) - Math.min(d[0], d[1], d[2]) <= 6, 'picked colour is not neutral: ' + [r, g, b] + ' -> ' + Array.from(d.slice(0, 3)));
        }
        const fitT = (lw, lh, rw, rh, m) => pairFit(mkCanvas(lw, lh), mkCanvas(rw, rh), m)[2];   // photos of different sizes (21-pair-size.js)
        let f = fitT(1000, 600, 1000, 600, 'crop'), o = pointAlignOffsets([0.5, 0.5], [0.45, 0.52], f.L, f.R); ch(Math.abs(o[0] - 50) < 1e-6 && Math.abs(o[1] + 12) < 1e-6, 'same-size offsets wrong: ' + o);
        f = fitT(1000, 600, 1000, 500, 'crop'); ch(f.W === 1000 && f.H === 500, 'crop: wrong frame size ' + [f.W, f.H]); o = pointAlignOffsets([0.5, 0.5], [0.5, 0.5], f.L, f.R); ch(Math.abs(o[0]) < 1e-6 && Math.abs(o[1]) < 1e-6, 'crop: the centres do not meet: ' + o);
        f = fitT(1000, 600, 900, 600, 'pad'); ch(f.W === 1000 && f.H === 600 && f.R[3] === 50, 'borders: wrong frame ' + [f.W, f.H, f.R[3]]); o = pointAlignOffsets([0.25, 0.5], [0.25, 0.5], f.L, f.R); ch(Math.abs(o[0] + 25) < 1e-6 && Math.abs(o[1]) < 1e-6, 'borders: wrong offsets ' + o);
        f = fitT(800, 600, 1200, 800, 'cover'); o = pointAlignOffsets([0.5, 0.5], [0.5, 0.5], f.L, f.R); ch(Math.abs(o[0]) < 1e-6 && Math.abs(o[1]) < 1e-6, 'older rule: the centre of the right photo did not map to the centre: ' + o);
        let p = pairPlan(mkCanvas(400, 300), mkCanvas(200, 150)); ch(p.kind === 'res' && p.L + '' === '200,150' && p.R + '' === '200,150', 'resolution: ' + JSON.stringify(p));
        p = pairPlan(mkCanvas(400, 300), mkCanvas(150, 200)); ch(p.kind === 'orient' && p.L + '' === '200,150' && p.R + '' === '150,200', 'upright and lying: ' + JSON.stringify(p));
        p = pairPlan(mkCanvas(400, 300), mkCanvas(400, 225)); ch(p.kind === 'prop' && p.L + '' === '400,300' && p.R + '' === '400,225', 'proportions: ' + JSON.stringify(p));
    });
    await T('Custom anaglyph matrix and watermark depth', async () => {
        const ch = (c, m) => { if (!c) throw new Error(m); }, saved = ANA_MIX, L = new Uint8ClampedArray(64 * 4), R = new Uint8ClampedArray(64 * 4);
        for (let i = 0; i < L.length; i++) { L[i] = (i * 37) % 256; R[i] = (i * 91 + 13) % 256; }
        try {
            for (const name of ['dubois', 'halfcolor', 'optimized', 'classic', 'grayscale']) {
                ANA_MIX = ANA_PRESETS[name].slice(); const a = new Uint8ClampedArray(L.length), b = new Uint8ClampedArray(L.length);
                anaglyphCPU(L, R, a, 'custom'); anaglyphCPU(L, R, b, name);
                for (let i = 0; i < a.length; i++) ch(Math.abs(a[i] - b[i]) <= 1, 'custom matrix "' + name + '" differs from the built-in mode');
            }
        } finally { ANA_MIX = saved; }
        const fake = () => { const calls = []; return { calls, save() {}, restore() {}, fillText(t, x) { calls.push(x); }, drawImage() {} }; }, el = document.getElementById('wmText'), dp = document.getElementById('wmDepth'), keep = [el.value, dp.value];
        try {
            el.value = 'Test'; dp.value = '0'; const a0 = fake(), a1 = fake(); wm(a0, 1000, 600, 0); wm(a1, 1000, 600, 1); ch(a0.calls[0] === a1.calls[0], 'depth 0 still moves the text between the eyes');
            dp.value = '2'; const b0 = fake(), b1 = fake(), bn = fake(); wm(b0, 1000, 600, 0); wm(b1, 1000, 600, 1); wm(bn, 1000, 600);
            ch(Math.abs((b0.calls[0] - b1.calls[0]) - 20) < 1e-6, 'depth 2% should separate the eyes by 20 px of 1000: got ' + (b0.calls[0] - b1.calls[0]));
            ch(Math.abs(bn.calls[0] - a0.calls[0]) < 1e-6, 'a single image (anaglyph) must not be shifted');
        } finally { el.value = keep[0]; dp.value = keep[1]; }
    });
    const fails = rows.filter(r => !r[0]).length, text = [APP.label + ' self-test', navigator.userAgent, ...rows.map(r => (r[0] ? 'PASS ' : 'FAIL ') + r[1] + (r[2] ? ' - ' + r[2] : ''))].join('\n');
    openCard('selftest', `<div style="font-weight:700;font-size:1.05rem">Self-test: ${fails ? fails + ' failed' : 'all passed'}</div><div style="margin-top:12px;font-size:0.85rem;line-height:1.6">${rows.map(r => `<div><span style="color:${r[0] ? '#22c55e' : '#ef4444'};font-weight:700">${r[0] ? 'PASS' : 'FAIL'}</span> ${esc(r[1])}<div style="color:var(--text-muted);font-size:0.8rem;margin-left:42px">${esc(r[2])}</div></div>`).join('')}</div>`,
        [['Copy results', () => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => showToast("Results copied."), () => prompt('Copy the results:', text)); }, true], ['Close']]);
}
if (/[?&#]selftest=yes/i.test(location.search + location.hash)) setTimeout(runSelfTest, 600);

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
