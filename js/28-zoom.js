/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- ZOOM (Individual Images): the selected photo fills the centre view, to look at or pick a small detail ---
// Mouse wheel (or a trackpad / touch pinch) zooms around the pointer, dragging moves the photo; the bar at the bottom has
// − / + / fit and "Two photos". Only one photo is zoomed at a time. A click without dragging still picks (neutral colour),
// it never changes the selection. The zoomed photo is redrawn sharper (2400 px instead of 900). Not on phones: the view is too small.
const INDZ = { k: null, s: 1, tx: 0, ty: 0, fw: 0, fh: 0, l: 0, t: 0, moved: false, ptrs: new Map(), drag: null, pinch: null };
const INDZ_MAX = 16, INDZ_PHONE = 900;
const indzCard = () => $id('card' + INDZ.k), indzCv = () => $id('indivCanvas' + INDZ.k);
function indivZoomLayout() {   // the photo fitted to the view (scale 1), then the current zoom on top
    if (!INDZ.k) return;
    const card = indzCard(), cv = indzCv(), W = card.clientWidth, H = card.clientHeight; if (!W || !H) return;
    const f = Math.min(W / (cv.width || 1), H / (cv.height || 1)), fw = (cv.width || 1) * f, fh = (cv.height || 1) * f;
    if (INDZ.fw && Math.abs(fw - INDZ.fw) > 0.5) { INDZ.tx *= fw / INDZ.fw; INDZ.ty *= fh / INDZ.fh; }   // the view changed size: the same part stays in view
    INDZ.fw = fw; INDZ.fh = fh; INDZ.l = (W - fw) / 2; INDZ.t = (H - fh) / 2;
    Object.assign(cv.style, { width: fw + 'px', height: fh + 'px', left: INDZ.l + 'px', top: INDZ.t + 'px' });
    indivZoomApply();
}
function indivZoomApply() {   // keeps the photo covering the view (or centred when smaller), then shows it
    const card = indzCard(), W = card.clientWidth, H = card.clientHeight, w = INDZ.fw * INDZ.s, h = INDZ.fh * INDZ.s;
    let x = INDZ.l + INDZ.tx, y = INDZ.t + INDZ.ty;
    x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x)); y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, y));
    INDZ.tx = x - INDZ.l; INDZ.ty = y - INDZ.t;
    indzCv().style.transform = `translate(${INDZ.tx}px, ${INDZ.ty}px) scale(${INDZ.s})`;
    $id('zbPct').textContent = Math.round(INDZ.s * 100) + '%';
}
function indivZoomAt(px, py, s) {   // px, py: a point of the view that stays under the pointer
    s = Math.max(1, Math.min(INDZ_MAX, s));
    const ox = INDZ.l + INDZ.tx, oy = INDZ.t + INDZ.ty, ix = (px - ox) / INDZ.s, iy = (py - oy) / INDZ.s;
    INDZ.s = s; INDZ.tx = px - ix * s - INDZ.l; INDZ.ty = py - iy * s - INDZ.t; indivZoomApply();
}
const indzCentre = () => { const c = indzCard(); return [c.clientWidth / 2, c.clientHeight / 2]; };
function indivZoomOn(k) {
    if (window.innerWidth <= INDZ_PHONE || !imagesLoaded || !indiv.base.L) return;
    if (INDZ.k) indivZoomOff();
    Object.assign(INDZ, { k, s: 1, tx: 0, ty: 0, fw: 0, fh: 0, moved: false, drag: null, pinch: null }); INDZ.ptrs.clear();
    $id('indivView').classList.add('zoomed'); indzCard().classList.add('zoom-on');
    const b = $id('btnIndivZoom'); b.setAttribute('aria-pressed', 'true'); b.classList.add('compare-on'); b.title = 'Back to the two photos (Esc)';
    indivZoomLayout(); indivSched();   // the sharper copy follows
}
function indivZoomOff() {
    if (!INDZ.k) return;
    const card = indzCard(), cv = indzCv();
    card.classList.remove('zoom-on'); $id('indivView').classList.remove('zoomed');
    ['width', 'height', 'left', 'top', 'transform'].forEach(p => { cv.style[p] = ''; });
    INDZ.k = null; INDZ.ptrs.clear(); INDZ.drag = INDZ.pinch = null;
    const b = $id('btnIndivZoom'); b.setAttribute('aria-pressed', 'false'); b.classList.remove('compare-on'); b.title = 'Zoom the selected photo (mouse wheel or pinch to zoom, drag to move)';
    if (imagesLoaded) indivSched();   // back to the normal previews
}
$id('btnIndivZoom').addEventListener('click', () => {
    if (INDZ.k) { indivZoomOff(); return; }
    const sel = ['L', 'R'].filter(k => indiv.sel[k]);
    if (!sel.length) { showToast('Click a photo to select it, then press Zoom.'); return; }
    if (sel.length > 1) { showToast('Only one photo can be zoomed: select just one (click the other to deselect it).'); return; }
    indivZoomOn(sel[0]);
});
// the bar at the bottom of the zoomed view
const zbar = document.createElement('div'); zbar.className = 'zoom-bar';
zbar.innerHTML = '<button type="button" id="zbOut" title="Zoom out" aria-label="Zoom out">−</button><span id="zbPct" class="zb-pct" data-noi18n>100%</span><button type="button" id="zbIn" title="Zoom in" aria-label="Zoom in">+</button>'
    + '<button type="button" id="zbFit" title="Whole photo">Fit</button><button type="button" id="zbBack" title="Back to the two photos (Esc)">Two photos</button>';
$id('indivView').appendChild(zbar);
zbar.addEventListener('click', (e) => e.stopPropagation());
$id('zbIn').addEventListener('click', () => { const [x, y] = indzCentre(); indivZoomAt(x, y, INDZ.s * 1.5); });
$id('zbOut').addEventListener('click', () => { const [x, y] = indzCentre(); indivZoomAt(x, y, INDZ.s / 1.5); });
$id('zbFit').addEventListener('click', () => { INDZ.s = 1; INDZ.tx = INDZ.ty = 0; indivZoomApply(); });
$id('zbBack').addEventListener('click', indivZoomOff);
// mouse wheel, trackpad pinch (a wheel with Ctrl), touch pinch and dragging, on either card (only the zoomed one is visible)
['L', 'R'].forEach(k => {
    const card = $id('card' + k), pos = (e) => { const r = card.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    card.addEventListener('wheel', (e) => {
        if (INDZ.k !== k) return; e.preventDefault();
        const [x, y] = pos(e); indivZoomAt(x, y, INDZ.s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015) * (e.ctrlKey ? 4 : 1)));
    }, { passive: false });
    card.addEventListener('pointerdown', (e) => {
        if (INDZ.k !== k || (e.pointerType === 'mouse' && e.button !== 0)) return;
        INDZ.ptrs.set(e.pointerId, pos(e)); try { card.setPointerCapture(e.pointerId); } catch (err) { }
        if (INDZ.ptrs.size === 1) { INDZ.moved = false; INDZ.drag = { p: pos(e), tx: INDZ.tx, ty: INDZ.ty }; INDZ.pinch = null; }
        else if (INDZ.ptrs.size === 2) { const [a, b] = [...INDZ.ptrs.values()]; INDZ.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: INDZ.s, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; INDZ.drag = null; INDZ.moved = true; }
    });
    card.addEventListener('pointermove', (e) => {
        if (INDZ.k !== k || !INDZ.ptrs.has(e.pointerId)) return;
        INDZ.ptrs.set(e.pointerId, pos(e));
        if (INDZ.pinch && INDZ.ptrs.size >= 2) {
            const [a, b] = [...INDZ.ptrs.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            INDZ.tx += m[0] - INDZ.pinch.m[0]; INDZ.ty += m[1] - INDZ.pinch.m[1]; INDZ.pinch.m = m;   // two fingers also move the photo
            indivZoomAt(m[0], m[1], INDZ.pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / INDZ.pinch.d);
        } else if (INDZ.drag) {
            const p = pos(e), dx = p[0] - INDZ.drag.p[0], dy = p[1] - INDZ.drag.p[1];
            if (Math.abs(dx) + Math.abs(dy) > 4) INDZ.moved = true;
            if (INDZ.moved) { INDZ.tx = INDZ.drag.tx + dx; INDZ.ty = INDZ.drag.ty + dy; indivZoomApply(); }
        }
    });
    const up = (e) => {
        if (!INDZ.ptrs.delete(e.pointerId)) return;
        if (INDZ.ptrs.size < 2) INDZ.pinch = null;
        if (INDZ.ptrs.size === 1) { const p = [...INDZ.ptrs.values()][0]; INDZ.drag = { p, tx: INDZ.tx, ty: INDZ.ty }; }   // the finger left on the glass keeps moving it
        if (!INDZ.ptrs.size) { INDZ.drag = null; setTimeout(() => { INDZ.moved = false; }, 0); }   // the click that follows a drag is ignored
    };
    ['pointerup', 'pointercancel'].forEach(ev => card.addEventListener(ev, up));
});
document.addEventListener('keydown', (e) => {   // + / - / 0 while zoomed
    if (!INDZ.k || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.ov') || typingTarget(e.target)) return;
    const [x, y] = indzCentre();
    if (e.key === '+' || e.key === '=') { e.preventDefault(); indivZoomAt(x, y, INDZ.s * 1.5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); indivZoomAt(x, y, INDZ.s / 1.5); }
    else if (e.key === '0') { e.preventDefault(); e.stopImmediatePropagation(); INDZ.s = 1; INDZ.tx = INDZ.ty = 0; indivZoomApply(); }
}, true);
document.addEventListener('keydown', (e) => {
    if (!INDZ.k || e.key !== 'Escape' || indiv.pick || document.querySelector('.ov') || sbsModal.classList.contains('active')) return;
    e.preventDefault(); indivZoomOff();
});
window.addEventListener('resize', () => { if (!INDZ.k) return; if (window.innerWidth <= INDZ_PHONE) indivZoomOff(); else indivZoomLayout(); });

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
