/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- CURVES (Individual Images): the classic curves graph, for RGB and for each colour channel ---
// The horizontal axis is the brightness going in, the vertical one what comes out. Each channel has its own list of points
// (indiv.st[k].curve.pts, 0..255); the line through them is computed in js/19-indiv-tools.js (ptsLut) and added to the
// tone-curve table, so the previews, the graphics card, the workers and every export use it with no change of their own.
//   click the line: adds a point (drag it straight away)      drag a point: moves it (never past its neighbours)
//   drag a point off the graph, or double-click it: removes it (the two end points stay)
//   keyboard (graph focused): arrows move the selected point (Shift: 10), Delete removes it
const CRV = { ch: 'rgb', sel: -1, hover: -1, drag: null, M: 10 };   // M: margin around the graph, in screen pixels (the end points stay visible)
const crvStraight = () => [[0, 0], [255, 255]];
function crvOf(k) { const c = indiv.st[k].curve; if (!c.pts) c.pts = indivNewSt().curve.pts; return c.pts; }
function crvFirst() { return imagesLoaded && indiv.base.L ? indivSelected()[0] : undefined; }
function crvGeom(cv) { const n = cv.width, m = CRV.M * n / Math.max(1, cv.clientWidth || n), S = n - 2 * m; return { n, m, S, X: (v) => m + v / 255 * S, Y: (v) => m + (1 - v / 255) * S }; }
function crvPos(cv, e) {   // the pointer on the graph: canvas pixels and curve values
    const r = cv.getBoundingClientRect(), g = crvGeom(cv), k = cv.width / Math.max(1, cv.clientWidth), px = (e.clientX - r.left - cv.clientLeft) * k, py = (e.clientY - r.top - cv.clientTop) * k;   // inside the border, like the drawing
    return { r, g, k, px, py, vx: (px - g.m) / g.S * 255, vy: (1 - (py - g.m) / g.S) * 255 };
}
function crvNearest(P, q, rad) { let best = -1, bd = rad; P.forEach((p, i) => { const d = Math.hypot(q.g.X(p[0]) - q.px, q.g.Y(p[1]) - q.py) / q.k; if (d <= bd) { bd = d; best = i; } }); return best; }
function crvDraw() {
    const cv = $id('crvPlot'); if (!cv) return;
    const css = cv.clientWidth; if (!css) return;   // not on screen (another tab, or the section is folded): drawn when it shows
    const dpr = Math.min(3, window.devicePixelRatio || 1), size = Math.max(64, Math.round(css * dpr));
    if (cv.width !== size) { cv.width = size; cv.height = size; }
    const x = cv.getContext('2d'), { n, m, S, X, Y } = crvGeom(cv), u = n / css, f = crvFirst(), cs = getComputedStyle(cv);   // the panel's own colours (Settings > Appearance)
    const ink = cs.getPropertyValue('--text-light').trim() || '#d4d4d8', col = { rgb: ink, r: '#ef4444', g: '#22c55e', b: '#3b82f6' };
    const all = f ? crvOf(f) : null, cur = CRV.drag ? CRV.drag.view : all ? all[CRV.ch] : crvStraight();
    x.clearRect(0, 0, n, n);
    const H = f && indiv.hist && indiv.hist[f];   // the photo's histogram (as shown), faint, behind the lines
    if (H && H.n) {
        const h = CRV.ch === 'rgb' ? Array.from({ length: 256 }, (_, i) => H.Hs[0][i] + H.Hs[1][i] + H.Hs[2][i]) : Array.from(H.Hs['rgb'.indexOf(CRV.ch)]);
        let mx = 1; for (let i = 2; i < 254; i++) if (h[i] > mx) mx = h[i];
        x.fillStyle = CRV.ch === 'rgb' ? 'rgba(128,128,128,0.22)' : col[CRV.ch] + '33'; x.beginPath(); x.moveTo(X(0), Y(0));
        for (let i = 0; i < 256; i++) x.lineTo(X(i), Y(0) - Math.min(1, h[i] / mx) * S * 0.9);
        x.lineTo(X(255), Y(0)); x.closePath(); x.fill();
    }
    x.strokeStyle = 'rgba(128,128,128,0.35)'; x.lineWidth = u;
    x.strokeRect(m, m, S, S);
    x.beginPath(); for (let i = 1; i < 4; i++) { x.moveTo(X(i * 63.75), Y(0)); x.lineTo(X(i * 63.75), Y(255)); x.moveTo(X(0), Y(i * 63.75)); x.lineTo(X(255), Y(i * 63.75)); } x.stroke();
    x.setLineDash([4 * u, 4 * u]); x.beginPath(); x.moveTo(X(0), Y(0)); x.lineTo(X(255), Y(255)); x.stroke(); x.setLineDash([]);
    const line = (P, c, w, a) => { const L = ptsLut(P); x.globalAlpha = a; x.strokeStyle = c; x.lineWidth = w * u; x.beginPath(); for (let i = 0; i < 256; i++) { if (i) x.lineTo(X(i), Y(L[i])); else x.moveTo(X(i), Y(L[i])); } x.stroke(); x.globalAlpha = 1; };
    if (all) ['rgb', 'r', 'g', 'b'].forEach(c => { if (c !== CRV.ch && !ptsIsId(all[c])) line(all[c], col[c], 1.2, 0.5); });   // the other channels that were changed, faint
    line(cur, col[CRV.ch], 2, 1);
    if (f) cur.forEach((p, i) => {
        const on = i === CRV.sel || i === CRV.hover;
        x.beginPath(); x.arc(X(p[0]), Y(p[1]), (on ? 5.5 : 4.5) * u, 0, Math.PI * 2);
        x.fillStyle = i === CRV.sel ? col[CRV.ch] : cs.getPropertyValue('--bg-dark').trim() || '#000'; x.fill(); x.lineWidth = 1.6 * u; x.strokeStyle = col[CRV.ch]; x.stroke();
    });
    if (CRV.drag && CRV.drag.out) {   // the point that will be removed on release: hollow and faint where the pointer is
        const p = CRV.drag.P[CRV.drag.i]; x.globalAlpha = 0.4; x.beginPath(); x.arc(X(p[0]), Y(p[1]), 4.5 * u, 0, Math.PI * 2); x.strokeStyle = col[CRV.ch]; x.lineWidth = 1.6 * u; x.stroke(); x.globalAlpha = 1;
    }
    const sp = CRV.drag && !CRV.drag.out ? CRV.drag.P[CRV.drag.i] : cur[CRV.hover >= 0 ? CRV.hover : CRV.sel];
    $id('crvIn').textContent = f && sp ? String(sp[0]) : '–'; $id('crvOut').textContent = f && sp ? String(sp[1]) : '–';
}
function crvApply(P, commit) {   // the points of the channel shown, on every selected photo; commit = finished (like releasing a slider)
    const s = indivSelected(); if (!s.length) return;
    s.forEach(k => { crvOf(k)[CRV.ch] = P.map(p => p.slice()); });
    indivEdited();
    if (commit) indivRegen(false); else { indiv.drag = true; indivSched(); crvDraw(); }
}
const crvCv = $id('crvPlot');
crvCv.addEventListener('pointerdown', (e) => {
    const f = crvFirst(); if (!f || CRV.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); try { crvCv.focus({ preventScroll: true }); } catch (err) { }
    const q = crvPos(crvCv, e), P = crvOf(f)[CRV.ch].map(p => p.slice());
    let i = crvNearest(P, q, e.pointerType === 'mouse' ? 9 : 18), added = false;
    if (i < 0) {   // on the line (or anywhere): a new point where the line is, then dragged from there (no jump)
        const ix = Math.round(Math.max(0, Math.min(255, q.vx)));
        if (P.some(p => Math.abs(p[0] - ix) < PTS_GAP)) return;
        if (P.length >= PTS_MAX) { showToast('A curve can have up to 16 points.'); return; }
        i = P.findIndex(p => p[0] > ix); if (i < 0) i = P.length;
        P.splice(i, 0, [ix, ptsLut(P)[ix]]); added = true;
    }
    CRV.sel = i; CRV.hover = -1;
    CRV.drag = { id: e.pointerId, P, i, sx: e.clientX, sy: e.clientY, ox: P[i][0], oy: P[i][1], out: false, view: P, moved: false, added };
    try { crvCv.setPointerCapture(e.pointerId); } catch (err) { }
    if (added) crvApply(P, false); else crvDraw();
});
crvCv.addEventListener('pointermove', (e) => {
    const d = CRV.drag;
    if (!d) {   // hovering: the point under the pointer is highlighted and its numbers shown
        const f = crvFirst(); if (!f) return;
        const h = crvNearest(crvOf(f)[CRV.ch], crvPos(crvCv, e), 9); crvCv.style.cursor = h >= 0 ? 'grab' : 'crosshair';
        if (h !== CRV.hover) { CRV.hover = h; crvDraw(); }
        return;
    }
    if (e.pointerId !== d.id) return;
    e.preventDefault();
    const q = crvPos(crvCv, e), per = 255 * q.k / q.g.S, P = d.P, i = d.i, last = P.length - 1;
    const lo = i > 0 ? P[i - 1][0] + PTS_GAP : 0, hi = i < last ? P[i + 1][0] - PTS_GAP : 255;
    P[i] = [Math.round(Math.max(lo, Math.min(hi, d.ox + (e.clientX - d.sx) * per))), Math.round(Math.max(0, Math.min(255, d.oy - (e.clientY - d.sy) * per)))];
    const far = 28, r = q.r, outside = e.clientX < r.left - far || e.clientX > r.right + far || e.clientY < r.top - far || e.clientY > r.bottom + far;
    d.out = i > 0 && i < last && outside; d.view = d.out ? P.filter((p, j) => j !== i) : P; d.moved = true;
    crvApply(d.view, false);
});
function crvEnd(e) {
    const d = CRV.drag; if (!d || (e && e.pointerId !== d.id)) return;
    CRV.drag = null; if (d.out) CRV.sel = -1;
    if (d.moved || d.added) crvApply(d.view, true); else crvDraw();
}
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => crvCv.addEventListener(ev, crvEnd));
crvCv.addEventListener('pointerleave', () => { if (!CRV.drag && CRV.hover >= 0) { CRV.hover = -1; crvDraw(); } });
crvCv.addEventListener('dblclick', (e) => {
    const f = crvFirst(); if (!f) return;
    const P = crvOf(f)[CRV.ch], i = crvNearest(P, crvPos(crvCv, e), 12);
    if (i > 0 && i < P.length - 1) { CRV.sel = -1; crvApply(P.filter((p, j) => j !== i), true); }
});
crvCv.addEventListener('keydown', (e) => {
    const f = crvFirst(); if (!f || e.ctrlKey || e.metaKey || e.altKey) return;
    const P = crvOf(f)[CRV.ch].map(p => p.slice()), last = P.length - 1, st = e.shiftKey ? 10 : 1;
    let i = CRV.sel >= 0 && CRV.sel <= last ? CRV.sel : 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const lo = i > 0 ? P[i - 1][0] + PTS_GAP : 0, hi = i < last ? P[i + 1][0] - PTS_GAP : 255; P[i][0] = Math.max(lo, Math.min(hi, P[i][0] + (e.key === 'ArrowRight' ? st : -st))); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') P[i][1] = Math.max(0, Math.min(255, P[i][1] + (e.key === 'ArrowUp' ? st : -st)));
    else if ((e.key === 'Delete' || e.key === 'Backspace') && i > 0 && i < last) { P.splice(i, 1); i = -1; }
    else return;
    e.preventDefault(); e.stopPropagation(); CRV.sel = i; crvApply(P, true);
});
document.querySelectorAll('#crvChs .crv-ch').forEach(b => b.addEventListener('click', () => {
    CRV.ch = b.dataset.ch; CRV.sel = -1; CRV.hover = -1;
    document.querySelectorAll('#crvChs .crv-ch').forEach(o => o.setAttribute('aria-pressed', String(o === b))); crvDraw();
}));
$id('btnCrvResetCh').addEventListener('click', () => { if (!crvFirst()) return; CRV.sel = -1; crvApply(crvStraight(), true); });
$id('btnCrvReset').addEventListener('click', () => { const s = indivSelected(); if (!s.length || !crvFirst()) return; CRV.sel = -1; s.forEach(k => { indiv.st[k].curve.pts = indivNewSt().curve.pts; }); indivEdited(); indivRegen(false); });
if (typeof ResizeObserver === 'function') new ResizeObserver(() => crvDraw()).observe(crvCv);   // shown again, or the panel changed width
new MutationObserver(() => crvDraw()).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });   // light / dark theme: the line colours follow
crvDraw();

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
