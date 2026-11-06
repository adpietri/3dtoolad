/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- PHOTOS OF DIFFERENT SIZES ---
// The two photos are kept exactly as they were opened (pairSrc). First their resolution is matched: the photo with more
// pixels for the same detail is reduced (never enlarged), so both show the scene at the same scale. If their proportions
// still differ, both are put into frames of one size, either cut to the area both photos have ('crop') or completed with
// black borders ('pad'). Projects saved before 5.6 keep the earlier rule ('cover': the right photo scaled and cut to the
// left one). The choice is asked when the photos are opened, can be changed at any time in the Alignment panel
// ('Size difference'), and is part of the undo history and of the project file.
let pairSrc = null;          // { L, R }: the photos as opened (canvases)
let pairMode = 'crop';       // 'crop' | 'pad' | 'cover'
let pairOpenMode = 'crop';   // the choice made when the photos were opened ('Reset image' goes back to it)
let pairInfo = null;         // the last fit: { mode, W, H, L: t, R: t }; t = [w, h, s, ox, oy]: photo of w x h, drawn scaled by s at (ox, oy) in the frame
let pairPreset = null;       // a choice known in advance (a project reopening its photos): nothing is asked
let pairStartBase = null;    // { L, R }: the photos at the same scale when opened (Individual Images starts from these)
const PAIR_LABEL = { crop: 'Crop to the common area', pad: 'Add black borders', cover: 'Right photo fitted to the left (older projects)' };

// how two photos differ: 'same' size, only the resolution ('res'), the proportions ('prop'), or one upright and one lying ('orient')
function pairCompare(L, R) {
    if (L.width === R.width && L.height === R.height) return 'same';
    const a = L.width / L.height, b = R.width / R.height, side = (r) => r > 1.05 ? 1 : r < 0.95 ? -1 : 0;
    if (side(a) * side(b) < 0) return 'orient';
    return Math.abs(a / b - 1) <= 0.005 ? 'res' : 'prop';
}
function pairGray(src, w, h, rot) {   // small grey copy (mean removed), turned rot x 90 degrees clockwise
    const c = mkCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true }), dw = rot & 1 ? h : w, dh = rot & 1 ? w : h;
    x.imageSmoothingQuality = 'high'; x.translate(w / 2, h / 2); x.rotate((rot & 3) * Math.PI / 2); x.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h); let m = 0;
    for (let i = 0; i < w * h; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; m += g[i]; }
    m /= w * h; for (let i = 0; i < g.length; i++) g[i] -= m; releaseCanvas(c); return g;
}
function pairNcc(a, aw, ah, b, bw, bh) {   // best normalised correlation of b placed over a, near the centred position
    const cx = Math.round((aw - bw) / 2), cy = Math.round((ah - bh) / 2), rx = Math.round(aw * 0.15), ry = Math.round(ah * 0.15), minA = Math.min(aw * ah, bw * bh) * 0.4;
    let best = -2;
    for (let dy = cy - ry; dy <= cy + ry; dy++) for (let dx = cx - rx; dx <= cx + rx; dx++) {
        const x0 = Math.max(0, dx), x1 = Math.min(aw, dx + bw), y0 = Math.max(0, dy), y1 = Math.min(ah, dy + bh), n = (x1 - x0) * (y1 - y0);
        if (x1 <= x0 || y1 <= y0 || n < minA) continue;
        let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let y = y0; y < y1; y++) { const ra = y * aw, rb = (y - dy) * bw - dx; for (let x = x0; x < x1; x++) { const p = a[ra + x], q = b[rb + x]; sa += p; sb += q; saa += p * p; sbb += q * q; sab += p * q; } }
        const va = saa - sa * sa / n, vb = sbb - sb * sb / n; if (va <= 1e-6 || vb <= 1e-6) continue;
        const r = (sab - sa * sb / n) / Math.sqrt(va * vb); if (r > best) best = r;
    }
    return best;
}
// The plan for a pair: how they differ, and the size each photo gets so that both show the scene at the same scale.
// k = pixels of the right photo for one pixel of the left one. When the proportions differ, three explanations are tried on
// small copies and the one where the same details line up best wins: equal widths (e.g. a 16:9 photo that is a 4:3 one without
// its top and bottom), equal heights, or the same scale (two photos from one camera, cropped differently).
function pairPlan(L, R) {
    const kind = pairCompare(L, R), rot = kind === 'orient';
    if (kind === 'same') return { kind, k: 1, L: [L.width, L.height], R: [R.width, R.height] };
    const rw = rot ? R.height : R.width, rh = rot ? R.width : R.height, kw = rw / L.width, kh = rh / L.height;
    const sameShape = Math.abs(kw / kh - 1) <= 0.005;
    let k = (kw + kh) / 2;
    if (!sameShape) {
        const near = Math.max(Math.abs(kw - 1), Math.abs(kh - 1)) < 0.15, cands = [];   // close sizes: most likely the same camera
        for (const kc of near ? [1, kw, kh] : [kw, kh, 1]) if (!cands.some(c => Math.abs(c / kc - 1) < 0.005)) cands.push(kc);
        const W = 128, s = W / L.width, H = Math.max(8, Math.round(L.height * s)), gL = pairGray(L, W, H, 0); let best = -3;
        for (const kc of cands) for (const r of rot ? [1, 3] : [0]) {
            const w2 = Math.max(8, Math.round(rw / kc * s)), h2 = Math.max(8, Math.round(rh / kc * s)), sc = pairNcc(gL, W, H, pairGray(R, w2, h2, r), w2, h2);
            if (best === -3 || sc > best + 0.01) { best = sc; k = kc; }   // the likelier explanation (listed first) wins a near tie
        }
    }
    if (Math.abs(k - 1) <= 0.002) return { kind, k: 1, L: [L.width, L.height], R: [R.width, R.height] };
    if (sameShape) {   // only the resolution differs: the larger photo gets exactly the size of the smaller one
        if (k > 1) return { kind, k, L: [L.width, L.height], R: rot ? [L.height, L.width] : [L.width, L.height] };
        return { kind, k, L: rot ? [R.height, R.width] : [R.width, R.height], R: [R.width, R.height] };
    }
    if (k > 1) return { kind, k, L: [L.width, L.height], R: [Math.max(1, Math.round(R.width / k)), Math.max(1, Math.round(R.height / k))] };
    return { kind, k, L: [Math.max(1, Math.round(L.width * k)), Math.max(1, Math.round(L.height * k))], R: [R.width, R.height] };
}
function pairBases(src, mode, plan) {   // the two photos at the same scale ('cover' keeps them as opened)
    if (mode === 'cover') return { L: src.L, R: src.R };
    const p = plan || pairPlan(src.L, src.R), size = (c, d) => (c.width === d[0] && c.height === d[1]) ? c : scaledCanvas(c, d[0], d[1]);
    return { L: size(src.L, p.L), R: size(src.R, p.R) };
}
// Puts two photos of any size into two frames of one size, centred. Returns [frameL, frameR, info].
function pairFit(L, R, mode) {
    const id = (c) => [c.width, c.height, 1, 0, 0];
    if (L.width === R.width && L.height === R.height) return [L, R, { mode, W: L.width, H: L.height, L: id(L), R: id(R) }];
    if (mode === 'cover') {
        const W = L.width, H = L.height, f = mkCanvas(W, H), s = Math.max(W / R.width, H / R.height); coverDraw(f.getContext('2d'), R, W, H);
        return [L, f, { mode, W, H, L: id(L), R: [R.width, R.height, s, (W - R.width * s) / 2, (H - R.height * s) / 2] }];
    }
    const pad = mode === 'pad', W = (pad ? Math.max : Math.min)(L.width, R.width), H = (pad ? Math.max : Math.min)(L.height, R.height);
    const put = (c) => {
        const t = [c.width, c.height, 1, Math.round((W - c.width) / 2), Math.round((H - c.height) / 2)];
        if (c.width === W && c.height === H) return [c, t];
        const f = mkCanvas(W, H), x = f.getContext('2d'); if (pad) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); } x.drawImage(c, t[3], t[4]); return [f, t];
    };
    const [fL, tL] = put(L), [fR, tR] = put(R);
    return [fL, fR, { mode, W, H, L: tL, R: tR }];
}
function pairShow(L, R) { [frameL, frameR, pairInfo] = pairFit(L, R, pairMode); }   // the frames every view and export uses
// where the photo really is in its frame, in 0..1 ([x0, y0, x1, y1]); only borders ('pad') leave parts of a frame empty
function pairContent(k) {
    if (!pairInfo || pairInfo.mode !== 'pad') return [0, 0, 1, 1];
    const t = pairInfo[k], c = (v) => Math.max(0, Math.min(1, v));
    return [c(t[3] / pairInfo.W), c(t[4] / pairInfo.H), c((t[3] + t[0] * t[2]) / pairInfo.W), c((t[4] + t[1] * t[2]) / pairInfo.H)];
}
const pairDiffers = () => !!pairInfo && (pairInfo.L[0] !== pairInfo.R[0] || pairInfo.L[1] !== pairInfo.R[1]);

// 'Size difference' in the Alignment panel
function pairFitUI() {
    const row = document.getElementById('pairFitRow'), sel = document.getElementById('pairFit'); if (!row || !sel) return;
    const on = pairDiffers();   // pairInfo exists only while photos are open
    row.style.display = on ? '' : 'none';
    let cov = sel.querySelector('option[value="cover"]');
    if (pairMode === 'cover' && !cov) { cov = document.createElement('option'); cov.value = 'cover'; cov.textContent = PAIR_LABEL.cover; sel.appendChild(cov); }
    if (pairMode !== 'cover' && cov) cov.remove();   // the older rule is offered only to projects that use it
    sel.value = pairMode;
    if (on) document.getElementById('pairFitInfo').textContent = `Left photo ${pairInfo.L[0]} × ${pairInfo.L[1]}, right photo ${pairInfo.R[0]} × ${pairInfo.R[1]}.`;
}
function pairUseMode(m) {   // switches the mode; the photos at the same scale are made again only between 'cover' and the others
    const was = pairMode; pairMode = m;
    if (!pairSrc || (was === 'cover') === (m === 'cover')) return;
    const b0 = pairBases(pairSrc, m), b = swappedLR ? { L: b0.R, R: b0.L } : b0, old = [indiv.base.L, indiv.base.R];   // pairSrc stays as opened; the bases follow Swap L/R
    igForget(); indivDropPrep();
    [indiv.cache, indiv.gen].forEach(o => Object.values(o || {}).forEach(e => { if (e && e.cv && e.cv !== frameL && e.cv !== frameR) releaseCanvas(e.cv); }));
    indiv.cache = {}; indiv.gen = {}; indiv.base = { L: b.L, R: b.R };
    const st = pairStartBase || {}; old.forEach(c => { if (c && c !== b.L && c !== b.R && c !== pairSrc.L && c !== pairSrc.R && c !== st.L && c !== st.R && c !== frameL && c !== frameR) releaseCanvas(c); });
}
function setPairMode(m) {
    if (!imagesLoaded || !PAIR_LABEL[m] || m === pairMode) return;
    if (busy) { showToast('Wait for the export to finish (or press Esc to cancel).', true); pairFitUI(); return; }
    pairUseMode(m); indivRegen(true);   // a change of shape: the frames are rebuilt, the alignment starts again (one undo step)
    pairFitUI(); showToast(m === 'pad' ? 'Size difference: black borders.' : m === 'crop' ? 'Size difference: cropped to the common area.' : 'Size difference: as in older versions.');
}
document.getElementById('pairFit').addEventListener('change', (e) => setPairMode(e.target.value));

// When the photos are opened: ask what to do if their proportions differ. Resolves to { mode, turn } or null (not opened).
// Every choice is explained on its own button, so it is clear that nothing happens until one is chosen.
function pairAsk(L, R) {
    if (pairPreset) return Promise.resolve({ mode: pairPreset, turn: false });
    const kind = pairCompare(L, R);
    if (kind === 'same' || kind === 'res') return Promise.resolve({ mode: 'crop', turn: false });
    if (!PREFS.warnSizes) return Promise.resolve({ mode: 'crop', turn: kind === 'orient', auto: true });   // Settings > Files: no question
    const p = pairPlan(L, R), dims = (c) => `${c.width} × ${c.height}`;
    const W = Math.min(p.L[0], p.R[0]), H = Math.min(p.L[1], p.R[1]), cutL = p.L[0] > W || p.L[1] > H, cutR = p.R[0] > W || p.R[1] > H, both = cutL && cutR;
    const crop = both ? ['Crop both photos', 'Cuts both photos down to the area they share, so they get the same shape. A little of each picture is lost.']
        : cutL ? ['Crop the left photo', 'Cuts off the part of the left photo that the right one does not show, so both get the same shape. A little of the picture is lost.']
        : ['Crop the right photo', 'Cuts off the part of the right photo that the left one does not show, so both get the same shape. A little of the picture is lost.'];
    const pad = both ? ['Add black borders to both photos', 'Keeps both photos whole: the area each one lacks is filled with black.']
        : cutL ? ['Add black borders to the right photo', 'Keeps both photos whole: the area the right photo lacks is filled with black.']
        : ['Add black borders to the left photo', 'Keeps both photos whole: the area the left photo lacks is filled with black.'];
    const muted = 'margin-top:8px;font-size:0.85rem;color:var(--text-muted)';
    const res = p.k === 1 ? '' : `<p style="${muted}">${p.k > 1
        ? 'Before anything else, the right photo is reduced to the resolution of the left one, so that both show the scene at the same size. This always happens, whatever you choose below.'
        : 'Before anything else, the left photo is reduced to the resolution of the right one, so that both show the scene at the same size. This always happens, whatever you choose below.'}</p>`;
    const head = kind === 'orient'
        ? `<div style="font-weight:700;font-size:1.05rem">One photo is upright and the other is lying down</div><p style="${muted}">This usually means one of them needs turning.</p>`
        : '<div style="font-weight:700;font-size:1.05rem">The two photos do not have the same shape</div>';
    const html = head + `<p style="margin-top:10px;font-size:0.9rem">Left photo: ${dims(L)}<br>Right photo: ${dims(R)}</p>` + res
        + '<p style="margin-top:12px;font-size:0.9rem;font-weight:600">What should be done with the difference in shape?</p>';
    return new Promise((resolve) => {
        let done = false; const end = (v) => { if (!done) { done = true; resolve(v); } };
        const opts = [];
        if (kind === 'orient') opts.push(['Turn the right photo', 'Turns it 90° so that both photos stand the same way. Usually the best choice.', { mode: 'crop', turn: true }]);
        opts.push([crop[0], crop[1], { mode: 'crop', turn: false }], [pad[0], pad[1], { mode: 'pad', turn: false }], ['Cancel', 'Does not open the photos.', null]);
        const box = openCard('pairask', html, opts.map(([t, , v]) => [t, () => end(v)])), ov = box.parentNode; ov.dataset.lock = '1';
        box.querySelectorAll('button').forEach((b, n) => {   // each choice: what it is, and underneath what it does
            const [t, d] = opts[n]; b.textContent = '';
            b.style.cssText += ';flex:1 1 100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:10px 14px';
            const a = document.createElement('span'), c = document.createElement('span');
            a.style.fontWeight = '600'; a.textContent = t; c.style.cssText = 'font-size:0.8rem;color:var(--text-muted);font-weight:400;line-height:1.35'; c.textContent = d;
            b.append(a, c);
        });
        const note = document.createElement('p'); note.style.cssText = muted + ';margin-top:12px';
        note.textContent = 'Nothing is lost for good: the photos are kept as opened, and you can switch between these choices later in the Alignment panel (Size difference).';
        box.appendChild(note);
        new MutationObserver((_, obs) => { if (!document.body.contains(ov)) { obs.disconnect(); end(null); } }).observe(document.body, { childList: true });   // Esc: not opened
    });
}
// after the photos are on screen: turn the right one if asked, and say what was done to the resolution
function pairAfterOpen(ch) {
    if (!pairSrc) return;
    const L = pairSrc.L, R = pairSrc.R, kind = pairCompare(L, R);
    if (ch && ch.turn) {
        try {
            const N = 48, gl = grayData(indivRender('L', 96), N, N), g = (r) => grayData(indivRotateCanvas(indivRender('R', 96), r, true), N, N);
            const s1 = g(1), s3 = g(3), sad = (x) => { let s = 0; for (let i = 0; i < gl.length; i++) s += Math.abs(gl[i] - x[i]); return s; };
            indiv.st.R.rot = sad(s3) < sad(s1) ? 3 : 1; indivRegen(true);
            showToast(`Right photo turned 90° ${indiv.st.R.rot === 1 ? 'right' : 'left'}. If it is wrong, turn it in Individual Images.`);
        } catch (e) { console.error(e); showToast('Could not turn the photo: do it in Individual Images.', true); }
        return;
    }
    if (ch && ch.auto && (kind === 'prop' || kind === 'orient')) { showToast('The photos have different shapes: they were cropped to the area they share. To change it, use Size difference in the Alignment panel.'); return; }
    if (kind === 'res' && pairMode !== 'cover' && !pairPreset) {
        const k = pairPlan(L, R).k; if (k === 1) return;   // a pixel or two of difference: nothing was resized
        showToast(`The photos have different resolutions (left ${L.width} × ${L.height}, right ${R.width} × ${R.height}): the ${k > 1 ? 'right' : 'left'} one was reduced to match.`);
    }
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
