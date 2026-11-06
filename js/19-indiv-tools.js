/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// === INDIVIDUAL IMAGES, part 2: geometry, tone curve, histogram, white-balance picker, presets, copy, two-point alignment ===
// --- pure helpers (covered by the self-test) ---
function geoZero(g) { return !g || (!g.straighten && !g.keyV && !g.keyH && !g.lens); }
function curveZero(c) { return !c || (['rgb', 'r', 'g', 'b'].every(ch => c[ch].every(v => !v)) && (!c.pts || ['rgb', 'r', 'g', 'b'].every(ch => ptsIsId(c.pts[ch])))); }
// Curves (points): each channel is a list of [input, output] points, 0..255, inputs strictly increasing. The line through them is a
// monotone cubic (Fritsch-Carlson): smooth, and it never overshoots between two points, so no colour jumps past what was asked.
const PTS_MAX = 16, PTS_GAP = 3;
const ptsIsId = (p) => !p || (p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 255 && p[1][1] === 255);
function ptsClean(q) {   // points read from a file or a preset: numbers only, inside 0..255, sorted, not too close, 2..16 of them
    if (!Array.isArray(q)) return [[0, 0], [255, 255]];
    const a = q.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map(p => [Math.round(Math.max(0, Math.min(255, p[0]))), Math.round(Math.max(0, Math.min(255, p[1])))]).sort((u, v) => u[0] - v[0]);
    const out = []; a.forEach(p => { if (!out.length || p[0] - out[out.length - 1][0] >= PTS_GAP) out.push(p); });
    if (out.length < 2) return [[0, 0], [255, 255]];
    if (out.length > PTS_MAX) out.splice(PTS_MAX - 1, out.length - PTS_MAX);   // keeps the last point (the white end)
    return out;
}
function ptsLut(p) {   // the 256 output values of a point curve
    const lut = new Uint8ClampedArray(256);
    if (ptsIsId(p) || p.length < 2) { for (let i = 0; i < 256; i++) lut[i] = i; return lut; }
    const n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]), d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
        if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    for (let v = 0, k = 0; v < 256; v++) {
        let y;
        if (v <= xs[0]) y = ys[0]; else if (v >= xs[n - 1]) y = ys[n - 1];
        else { while (v > xs[k + 1]) k++; const h = xs[k + 1] - xs[k], t = (v - xs[k]) / h, t2 = t * t, t3 = t2 * t; y = (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1]; }
        lut[v] = Math.round(Math.min(255, Math.max(0, y)));
    }
    return lut;
}
function geoParams(geo, w, h) {   // output -> source mapping (straighten, keystone, lens) plus the zoom that keeps the corners filled
    const R = Math.max(w, h) / 2, th = geo.straighten * Math.PI / 180, P = { R, cx: w / 2, cy: h / 2, co: Math.cos(th), si: Math.sin(th), kv: geo.keyV / 100 * 0.4, kh: geo.keyH / 100 * 0.4, kl: geo.lens / 100 * 0.3, s: 1 };
    const hw = w / (2 * R), hh = h / (2 * R), raw = (u, v) => { const a = u * P.co - v * P.si, b = u * P.si + v * P.co, a2 = a * (1 + P.kv * b), b2 = b * (1 + P.kh * a), f = 1 + P.kl * (a2 * a2 + b2 * b2); return [a2 * f, b2 * f]; };
    const fits = (s) => { for (let i = 0; i <= 32; i++) { const t = i / 16 - 1; for (const [u, v] of [[t * hw, -hh], [t * hw, hh], [-hw, t * hh], [hw, t * hh]]) { const [a, b] = raw(u * s, v * s); if (Math.abs(a) > hw * 1.0001 || Math.abs(b) > hh * 1.0001) return false; } } return true; };
    if (!fits(1)) { let lo = 0.3, hi = 1; for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; } P.s = lo; }
    return P;
}
function geoApplyPixels(d, w, h, geo, dest) {   // bilinear sampling into dest (or a new buffer); returns it
    const out = dest || new Uint8ClampedArray(d.length); geoRows(d, 0, h, w, h, geoParams(geo, w, h), 0, h, out); return out;
}
function geoRows(d, sy0, sRows, w, h, P, oy0, oy1, out) {   // rows oy0..oy1 of the result; d holds source rows sy0..sy0+sRows. false if a needed row is not there
    const k = P.s / P.R, sy1 = sy0 + sRows;
    for (let y = oy0, o = 0; y < oy1; y++) {
        const v = (y + 0.5 - P.cy) * k;
        for (let x = 0; x < w; x++, o += 4) {
            const u = (x + 0.5 - P.cx) * k, a = u * P.co - v * P.si, b = u * P.si + v * P.co, a2 = a * (1 + P.kv * b), b2 = b * (1 + P.kh * a), f = 1 + P.kl * (a2 * a2 + b2 * b2);
            let sx = P.cx + a2 * f * P.R - 0.5, sy = P.cy + b2 * f * P.R - 0.5;
            sx = sx < 0 ? 0 : sx > w - 1 ? w - 1 : sx; sy = sy < 0 ? 0 : sy > h - 1 ? h - 1 : sy;
            const x0 = sx | 0, y0 = sy | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0, tx = sx - x0, ty = sy - y0;
            if (y0 < sy0 || y1 >= sy1) return false;
            const r0 = y0 - sy0, r1 = y1 - sy0, i00 = (r0 * w + x0) * 4, i10 = (r0 * w + x1) * 4, i01 = (r1 * w + x0) * 4, i11 = (r1 * w + x1) * 4;
            for (let c = 0; c < 4; c++) out[o + c] = (d[i00 + c] + (d[i10 + c] - d[i00 + c]) * tx) * (1 - ty) + (d[i01 + c] + (d[i11 + c] - d[i01 + c]) * tx) * ty;
        }
    }
    return true;
}
function curveLut(a) {   // parametric tone curve: a = [shadows, darks, lights, highlights], -100..100; black and white stay put, never decreasing
    const lut = new Uint8ClampedArray(256), C = [0.125, 0.375, 0.625, 0.875]; let prev = 0;
    for (let i = 0; i < 256; i++) {
        const x = i / 255; let y = x;
        for (let k = 0; k < 4; k++) if (a[k]) { const z = (x - C[k]) / 0.13; y += a[k] / 100 * 0.18 * Math.exp(-z * z) * 4 * x * (1 - x); }
        let v = Math.round(Math.min(1, Math.max(0, y)) * 255); if (v < prev) v = prev; prev = v; lut[i] = v;
    }
    return lut;
}
function curveLuts(c) {   // Tone curve (RGB, then the channel), then Curves (RGB, then the channel): one table per channel
    const rgb = curveLut(c.rgb), P = c.pts || null, prgb = P && !ptsIsId(P.rgb) ? ptsLut(P.rgb) : null;
    return ['r', 'g', 'b'].map(ch => { const L = curveLut(c[ch]), pc = P && !ptsIsId(P[ch]) ? ptsLut(P[ch]) : null; return Uint8ClampedArray.from(rgb, v => { let o = L[v]; if (prgb) o = prgb[o]; return pc ? pc[o] : o; }); });
}
function wbFromSample(r, g, b) {   // Temperature / Tint that make this colour neutral (same model as adjApplyPixels)
    const t = (b - r) / Math.max(1, b + r), m = r * (1 + t), u = 1 - m / Math.max(1, g), cl = (v) => Math.max(-100, Math.min(100, Math.round(v)));
    return { temperature: cl(t / 0.25 * 100), tint: cl(u / 0.25 * 100) };
}
function pointAlignOffsets(pL, pR, tL, tR) {   // pL / pR: [u, v] in 0..1 on the two photos; tL / tR: where each photo sits in its frame ([w, h, scale, x, y], see pairFit)
    const at = (p, t) => [p[0] * t[0] * t[2] + t[3], p[1] * t[1] * t[2] + t[4]], a = at(pL, tL), b = at(pR, tR);
    return [a[0] - b[0], a[1] - b[1]];   // the right photo is drawn shifted by this: the chosen detail lands on the screen plane
}
function indivGeoCanvas(src, geo, rf) {   // reads the source directly and writes straight into the result (no extra full-size copies)
    const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data, out = mkCanvas(w, h), x = ctx2d(out, rf), id = x.createImageData(w, h);
    geoApplyPixels(d, w, h, geo, id.data); x.putImageData(id, 0, 0); return out;
}

// --- generic slider for the new sections ---
function indivSlider(box, id, label, min, max, step, get, set, bg) {
    const g = document.createElement('div'); g.className = 'control-group';
    g.innerHTML = `<label>${label} <span id="val_${id}">0</span></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="0">`;
    $id(box).appendChild(g); const el = g.querySelector('input'); if (bg) el.style.background = bg;
    el.addEventListener('input', () => { const v = parseFloat(el.value); indivSelected().forEach(k => set(indiv.st[k], v)); $id('val_' + id).textContent = v; indiv.drag = true; indivEdited(); indivSched(); });
    el.addEventListener('change', () => { document.body.classList.add('busy-cursor'); setTimeout(() => { try { indivRegen(false); } finally { document.body.classList.remove('busy-cursor'); } }, 20); });
    EXTRA_SLIDERS.push({ id, get });
}
[['geoStraighten', 'Straighten (degrees)', -10, 10, 0.1, 'straighten'], ['geoKeyV', 'Vertical keystone', -100, 100, 1, 'keyV'], ['geoKeyH', 'Horizontal keystone', -100, 100, 1, 'keyH'], ['geoLens', 'Lens distortion', -100, 100, 1, 'lens']]
    .forEach(([id, label, mn, mx, st, key]) => indivSlider('adjGeo', id, label, mn, mx, st, (s) => s.geo[key], (s, v) => { s.geo[key] = v; }));
function curveCh() { const v = $id('curveCh').value; return ['rgb', 'r', 'g', 'b'].includes(v) ? v : 'rgb'; }
['Shadows', 'Darks', 'Lights', 'Highlights'].forEach((label, i) => indivSlider('adjCurve', 'curve' + i, label, -100, 100, 1, (s) => s.curve[curveCh()][i], (s, v) => { s.curve[curveCh()][i] = v; }));
function indivSyncExtra(first) {
    EXTRA_SLIDERS.forEach(({ id, get }) => { const v = first ? get(indiv.st[first]) : 0; $id(id).value = v; $id('val_' + id).textContent = v; });
    drawCurvePlot(first); indivDrawHist(first);
    if (typeof crvDraw === 'function') crvDraw();   // the Curves graph (js/25-curves.js)
}
function drawCurvePlot(first) {
    const cv = $id('curvePlot'), x = cv.getContext('2d'), n = cv.width, ch = curveCh(), col = { rgb: '#d4d4d8', r: '#ef4444', g: '#22c55e', b: '#3b82f6' }[ch];
    x.clearRect(0, 0, n, n); x.strokeStyle = 'rgba(128,128,128,.35)'; x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * n / 4, 0); x.lineTo(i * n / 4, n); x.moveTo(0, i * n / 4); x.lineTo(n, i * n / 4); x.stroke(); }
    const lut = curveLut(first ? indiv.st[first].curve[ch] : [0, 0, 0, 0]); x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 256; i++) { const px = i / 255 * n, py = n - lut[i] / 255 * n; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke();
}
$id('curveCh').addEventListener('change', () => { const s = indivSelected(); indivSyncExtra(s[0]); });
$id('btnResetGeo').addEventListener('click', () => { const s = indivSelected(); if (!s.length) return; s.forEach(k => { indiv.st[k].geo = indivNewSt().geo; }); indivEdited(); indivRegen(false); });
$id('btnResetCurve').addEventListener('click', () => { const s = indivSelected(); if (!s.length) return; s.forEach(k => { const z = indivNewSt().curve; ['rgb', 'r', 'g', 'b'].forEach(c => { indiv.st[k].curve[c] = z[c]; }); }); indivEdited(); indivRegen(false); });   // the sliders only: Curves has its own reset

// --- histogram of the first selected photo (as shown) ---
let histProbe = null;
function indivHistStats(src) {   // samples the preview through a small canvas made for reading (nearest neighbour = real pixel values)
    const k = Math.min(1, 512 / Math.max(src.width, src.height)), w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    if (!histProbe) histProbe = mkCanvas(1, 1);
    if (histProbe.width !== w || histProbe.height !== h) { histProbe.width = w; histProbe.height = h; }
    const x = histProbe.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; x.clearRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, Hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; let lo = 0, hi = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { Hs[0][d[i]]++; Hs[1][d[i + 1]]++; Hs[2][d[i + 2]]++; const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; if (y < 2) lo++; else if (y > 253) hi++; n++; }
    return { Hs, lo, hi, n };
}
function indivDrawHist(first) {
    const cv = $id('indivHist'), x = cv.getContext('2d'), W = cv.width, H = cv.height, info = $id('indivClip');
    x.clearRect(0, 0, W, H); if (!first || !imagesLoaded) { info.textContent = ''; return; }
    const st = indiv.hist && indiv.hist[first]; if (!st || !st.n) { info.textContent = ''; return; }   // no pixels are read here
    const { Hs, lo, hi, n } = st;
    let mx = 1; Hs.forEach(h => { for (let i = 2; i < 254; i++) if (h[i] > mx) mx = h[i]; });
    x.globalCompositeOperation = 'lighter';
    ['rgba(239,68,68,.75)', 'rgba(34,197,94,.75)', 'rgba(59,130,246,.75)'].forEach((c, k) => { x.fillStyle = c; x.beginPath(); x.moveTo(0, H); for (let i = 0; i < 256; i++) x.lineTo(i / 255 * W, H - Math.min(1, Hs[k][i] / mx) * H); x.lineTo(W, H); x.fill(); });
    x.globalCompositeOperation = 'source-over';
    const pc = (v) => (n ? v / n * 100 : 0).toFixed(1);
    info.textContent = (first === 'L' ? 'Left' : 'Right') + ' photo. Pure black: ' + pc(lo) + '%, pure white: ' + pc(hi) + '%' + (lo / n > 0.02 || hi / n > 0.02 ? ' (detail lost)' : '');
}

// --- picking on the photos: neutral for white balance, or one detail in each photo for alignment ---
function indivMark(k, u, v) { const card = $id('card' + k), cv = $id('indivCanvas' + k), m = document.createElement('span'); m.className = 'pt-mark'; m.style.left = (cv.offsetLeft + u * cv.offsetWidth) + 'px'; m.style.top = (cv.offsetTop + v * cv.offsetHeight) + 'px'; card.appendChild(m); }
function indivCancelPick(msg) { indiv.pick = null; indiv.ptL = null; document.querySelectorAll('.pt-mark').forEach(m => m.remove()); $id('indivView').classList.remove('picking'); indivUpdateUI(); if (msg) showToast(msg); }
function indivStartPick(mode) {
    if (!imagesLoaded || !indiv.base.L) return;
    if (mode !== 'wb' && INDZ.k) indivZoomOff();   // aligning on a detail needs both photos
    indivCancelPick(); indiv.pick = mode; $id('indivView').classList.add('picking');
    $id('indivHint').textContent = mode === 'wb' ? 'Click something that should be neutral grey or white in either photo (Esc cancels).' : 'Click a detail in the LEFT photo (Esc cancels).';
}
function indivPickAt(k, e) {
    const cv = $id('indivCanvas' + k), r = cv.getBoundingClientRect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return;
    if (indiv.pick === 'wb') {
        const src = indivRender(k, INDZ.k ? 2400 : 900, true),   // zoomed: a sharper copy, so a small detail can be picked
             x = src.getContext('2d'), px = Math.round(u * (src.width - 1)), py = Math.round(v * (src.height - 1)), x0 = Math.max(0, px - 2), y0 = Math.max(0, py - 2);
        const d = x.getImageData(x0, y0, Math.min(5, src.width - x0), Math.min(5, src.height - y0)).data; let R = 0, G = 0, B = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
        if (!n || (R + G + B) / n < 15 || Math.max(R, G, B) / n > 252) { indivCancelPick('Pick a mid-grey or light area (not pure black or a blown-out white).'); return; }
        const wb = wbFromSample(R / n, G / n, B / n); indiv.st[k].adj.temperature = wb.temperature; indiv.st[k].adj.tint = wb.tint; indiv.sel[k] = true;
        indivCancelPick(); indivEdited(); indivRegen(false); showToast(`White balance set on the ${k === 'L' ? 'left' : 'right'} photo (Temperature ${wb.temperature}, Tint ${wb.tint}).`); return;
    }
    if (indiv.pick === 'pt1') { if (k !== 'L') { showToast('First click the detail in the LEFT photo.'); return; } indiv.ptL = [u, v]; indivMark('L', u, v); indiv.pick = 'pt2'; $id('indivHint').textContent = 'Now click the SAME detail in the RIGHT photo (Esc cancels).'; return; }
    if (indiv.pick === 'pt2') {
        if (k !== 'R') { showToast('Now click the same detail in the RIGHT photo.'); return; }
        if (indiv.dirty) { const ev = { clientX: e.clientX, clientY: e.clientY }; whenFramesReady(() => indivPickAt(k, ev)); return; }
        ensureFrames();
        const [dx, dy] = pointAlignOffsets(indiv.ptL, [u, v], pairInfo.L, pairInfo.R);
        indivCancelPick(); setOffsets(dx, dy); showToast(`Aligned on that detail (X ${offsetX}, Y ${offsetY}): it now sits on the screen plane.`);
    }
}
$id('btnPickWB').addEventListener('click', () => indivStartPick('wb'));
$id('btnPointAlign').addEventListener('click', () => indivStartPick('pt1'));

// --- copy colour / tone settings between the photos, and presets ---
const COLOR_PARTS = ['adj', 'hsl', 'curve'], cloneParts = (st) => JSON.parse(JSON.stringify({ adj: st.adj, hsl: st.hsl, curve: st.curve }));   // curve includes the Curves points
function indivCopy(from, to) { if (!imagesLoaded || !indiv.base.L) return; const c = cloneParts(indiv.st[from]); COLOR_PARTS.forEach(p => { indiv.st[to][p] = c[p]; }); indivEdited(); indivRegen(false); showToast(`Colors and tone copied from the ${from === 'L' ? 'left' : 'right'} photo to the ${to === 'L' ? 'left' : 'right'} one.`); }
$id('btnCopyLR').addEventListener('click', () => indivCopy('L', 'R'));
$id('btnCopyRL').addEventListener('click', () => indivCopy('R', 'L'));
const PRESET_KEY = '3dtool-presets';
const loadPresets = () => { try { const o = JSON.parse(localStorage.getItem(PRESET_KEY)), out = {}; if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(k => { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v; }); return out; } catch (e) { return {}; } };   // only objects: a damaged store lists nothing
const PRESET_SESSION = {};   // presets opened while Settings > Presets says "to a .json file": in the list until the page closes, never stored
const presetAll = () => Object.assign({}, loadPresets(), PRESET_SESSION);
function presetAdd(name, val) {   // into the list: this browser, or only this session (Settings > Presets)
    if (PREFS.presetSave === 'file') { PRESET_SESSION[name] = val; return true; }
    const all = loadPresets(); all[name] = val; try { localStorage.setItem(PRESET_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
}
function colorFileBlob(name, parts) { return new Blob([JSON.stringify(Object.assign({ format: COLOR_FILE, formatVersion: 1, app: APP.id, appVersion: APP.version, name }, parts), null, 2)], { type: 'application/json' }); }
const colorFileName = (name) => (name.replace(/[^\w.\- ()]+/g, '_').trim() || 'colors_' + stamp()) + '.json';
function fillPresets() { const sel = $id('presetSel'), all = presetAll(), names = Object.keys(all).sort(); sel.innerHTML = ''; if (!names.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(no presets yet)'; sel.appendChild(o); } names.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); }); }
function validPreset(p) { const z = indivNewSt(); return p && p.adj && Array.isArray(p.hsl) && p.hsl.length === 8 && p.curve && ADJ_KEYS.every(k => Number.isFinite(p.adj[k] ?? 0)) && ['rgb', 'r', 'g', 'b'].every(c => Array.isArray(p.curve[c]) && p.curve[c].length === z.curve[c].length); }
$id('btnPresetSave').addEventListener('click', () => {
    const s = indivSelected(), name = ($id('presetName').value || '').trim().slice(0, 40); if (!s.length) return;
    if (!name) { showToast('Type a name for the preset first.', true); return; }
    const val = cloneParts(indiv.st[s[0]]);
    if (PREFS.presetSave === 'file') {   // Settings > Presets: to a .json file (and in the list until the page closes)
        saveBlob(colorFileBlob(name, val), colorFileName(name)).then(() => { PRESET_SESSION[name] = val; fillPresets(); $id('presetSel').value = name; $id('presetName').value = ''; showToast(`Preset "${name}" saved to a file.`); },
            (e) => { if (e && e.message === 'cancelled') showToast('Cancelled.'); else showToast('Could not save the file.', true); });
        return;
    }
    if (!presetAdd(name, val)) { showToast('Could not save the preset in this browser.', true); return; }
    fillPresets(); $id('presetSel').value = name; $id('presetName').value = ''; showToast(`Preset "${name}" saved.`);
});
$id('btnPresetApply').addEventListener('click', () => {
    const s = indivSelected(), p = presetAll()[$id('presetSel').value]; if (!s.length || !p) return;
    if (!validPreset(p)) { showToast('This preset is damaged and cannot be applied.', true); return; }
    indivPutColors(s, p); showToast('Preset applied.');
});
function indivPutColors(keys, p) {   // colours and tone from a preset or a file, checked (old presets without Curves get straight curves)
    const c = cleanPhotoSt(p); keys.forEach(k => { const z = JSON.parse(JSON.stringify(c)); indiv.st[k].adj = z.adj; indiv.st[k].hsl = z.hsl; indiv.st[k].curve = z.curve; });
    indivEdited(); indivRegen(false);
}
$id('btnPresetDel').addEventListener('click', () => { const n = $id('presetSel').value; if (!n) return; delete PRESET_SESSION[n]; const all = loadPresets(); delete all[n]; try { localStorage.setItem(PRESET_KEY, JSON.stringify(all)); } catch (e) { } fillPresets(); showToast(`Preset "${n}" deleted.`); });
fillPresets();
// --- colours and tone in a file (.json): to keep them, move them to another computer or browser, or share them ---
const COLOR_FILE = '3DToolAD colors', PRESETS_FILE = '3DToolAD presets';
function presetImport(o, fileName) {   // one preset from a colours file into the list; a name already used for something else gets " (2)"...
    const base = (typeof o.name === 'string' && o.name.trim() ? o.name : String(fileName || '').replace(/\.json$/i, '')).trim().slice(0, 36) || 'Preset', all = presetAll(), val = cloneParts(cleanPhotoSt(o));
    let nm = base; for (let i = 2; all[nm] && JSON.stringify(all[nm]) !== JSON.stringify(val); i++) nm = base + ' (' + i + ')';
    return presetAdd(nm, val) ? nm : null;
}
$id('btnPresetFileSave').addEventListener('click', async () => {
    const s = indivSelected(); if (!s.length) return;
    const name = ($id('presetName').value || '').trim().slice(0, 40) || $id('presetSel').value || '';
    try { await saveBlob(colorFileBlob(name, cloneParts(indiv.st[s[0]])), colorFileName(name)); showToast('Colors and tone saved to a file.'); }
    catch (e) { if (e && e.message === 'cancelled') showToast('Cancelled.'); else { console.error(e); showToast('Could not save the file.', true); } }
});
$id('btnPresetFileOpen').addEventListener('click', () => $id('inputPresetFile').click());
$id('inputPresetFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; const s = indivSelected(); if (!f || !s.length) return;
    let o = null;
    try { if (f.size <= 1e6) o = JSON.parse(await f.text()); } catch (err) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || !(o.adj || o.hsl || o.curve) || (o.format && o.format !== COLOR_FILE)) { showToast('This file does not contain colors and tone saved by ' + APP.name + '.', true); return; }
    indivPutColors(s, o);
    const nm = presetImport(o, f.name); if (nm) { fillPresets(); $id('presetSel').value = nm; }   // kept in the list too
    showToast('Colors and tone applied from the file.');
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
