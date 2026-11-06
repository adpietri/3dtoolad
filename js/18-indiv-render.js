/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- rendering from the untouched originals ---
// Small preview canvases of this tab are read back on every edit: keep them in normal memory ('willReadFrequently')
// so reading is fast. Full-size frames keep the browser's default (they are drawn far more than they are read).
const ctx2d = (cv, rf) => cv.getContext('2d', rf ? { willReadFrequently: true } : undefined);
function indivRotateCanvas(c, rot, rf) {
    if (!(rot & 3)) return c;
    const sw = rot & 1, out = mkCanvas(sw ? c.height : c.width, sw ? c.width : c.height), x = ctx2d(out, rf);
    x.translate(out.width / 2, out.height / 2); x.rotate((rot & 3) * Math.PI / 2); x.drawImage(c, -c.width / 2, -c.height / 2); return out;
}
function indivApplyLuts(src, luts, rf) {   // GPU first, CPU if not possible
    const g = igRender(src, null, false, luts, rf); igNote(!!g, rf); return g || indivApplyLutsCPU(src, luts, rf);
}
function indivApplyLutsCPU(src, luts, rf) {
    const out = mkCanvas(src.width, src.height), x = ctx2d(out, rf); x.drawImage(src, 0, 0);
    const id = x.getImageData(0, 0, out.width, out.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = luts[0][d[i]]; d[i + 1] = luts[1][d[i + 1]]; d[i + 2] = luts[2][d[i + 2]]; }
    x.putImageData(id, 0, 0); return out;
}
const indivIdentity = (k) => !indiv.st[k].rot && indiv.st[k].hsl.every(b => !b[0] && !b[1] && !b[2]) && adjZero(indiv.st[k].adj) && geoZero(indiv.st[k].geo) && curveZero(indiv.st[k].curve);
function indivScaledBase(k, maxDim) {   // the reduced copy of an original is made once, not on every slider move
    const c = indiv.base[k], big = Math.max(c.width, c.height);
    if (!maxDim || big <= maxDim) return c;
    const key = 's' + k + '_' + maxDim, ck = indiv.cache[key];
    if (ck && ck.src === c) return ck.cv;
    const big9 = indiv.cache['s' + k + '_900'], from = (maxDim < 900 && big9 && big9.src === c) ? big9.cv : c, fb = Math.max(from.width, from.height);   // smaller copies come from the 900 px one, not from the full photo
    const cv = mkCanvas(Math.max(1, Math.round(from.width * maxDim / fb)), Math.max(1, Math.round(from.height * maxDim / fb))), cx = ctx2d(cv, true);
    cx.imageSmoothingQuality = 'high'; cx.drawImage(from, 0, 0, cv.width, cv.height);
    if (ck) releaseCanvas(ck.cv); indiv.cache[key] = { src: c, max: maxDim, cv }; return cv;
}
function indivRender(k, maxDim, before) {   // base -> (smaller) -> rotated -> exposure / tone / white balance -> color mixer; 'before' keeps only the orientation
    if (!maxDim && !before && indiv.prep[k]) {   // already computed on all cores in the background
        const p = indiv.prep[k]; delete indiv.prep[k];
        if (p.base === indiv.base[k] && p.key === JSON.stringify(indiv.st[k])) { igNote(false, false); return p.cv; }
        releaseCanvas(p.cv);
    }
    const st = indiv.st[k], src0 = indivScaledBase(k, maxDim), rf = !!maxDim;
    const g = igRender(src0, st, before, null, rf, true); if (igWork(st, before, null)) igNote(!!g, rf);   // GPU first, CPU if not possible
    return g || indivRenderCPU(src0, st, before, rf);
}
function indivRenderCPU(src0, st, before, rf) {
    let c = indivRotateCanvas(src0, st.rot, rf);
    if (!geoZero(st.geo)) { const g = indivGeoCanvas(c, st.geo, rf); if (c !== src0) releaseCanvas(c); c = g; }   // geometry belongs to the 'before' view too, like the rotation
    if (before) return c;
    const useAdj = !adjZero(st.adj), useHsl = st.hsl.some(b => b[0] || b[1] || b[2]), useCurve = !curveZero(st.curve);
    if (!useAdj && !useHsl && !useCurve) return c;
    const out = mkCanvas(c.width, c.height), x = ctx2d(out, rf); x.drawImage(c, 0, 0);   // one read and one write of the pixels for both steps
    if (c !== src0) releaseCanvas(c);   // intermediate step (rotated or geometry) no longer needed
    const id = x.getImageData(0, 0, out.width, out.height);
    if (useAdj) adjApplyPixels(id.data, out.width, out.height, st.adj);   // exposure, tone, white balance
    if (useCurve) { const L = curveLuts(st.curve), d = id.data; for (let i = 0; i < d.length; i += 4) { d[i] = L[0][d[i]]; d[i + 1] = L[1][d[i + 1]]; d[i + 2] = L[2][d[i + 2]]; } }   // tone curve
    if (useHsl) hslApplyPixels(id.data, hslLut(st.hsl));               // color mixer
    x.putImageData(id, 0, 0); return out;
}
// rebuilds the real frames (used by the other tabs and by every export) from the originals + the per-photo settings
// Edits in the Individual Images tab update only the small previews right away. The full-size frames (used by the other
// tabs and by every export) are rebuilt once, the first time something needs them - so sliders stay fluid with big photos.
function indivRegen(geometry) {
    if (!indiv.base.L) return;   // no photos yet
    indivMatchRefresh();   // Match colors on: the right photo follows the left one's edits
    indiv.dirty = true; if (geometry) indiv.pendGeo = true; indiv.drag = false; sbsAl = null;
    if (currentTab === 'individual') { const t0 = performance.now(); indivRenderDisplays(); indiv.tPrev = Math.round(performance.now() - t0); scheduleIdleBuild(); }
    else { ensureFrames(); refreshView(); }
    indivUpdateUI(); histMark();
}
function ensureFrames() { if (indiv.dirty && indiv.base.L) indivBuildFrames(); }
let idleBuildT = 0;
function scheduleIdleBuild() {   // prepare the full-size frames while the user is not touching anything
    clearTimeout(idleBuildT);
    idleBuildT = setTimeout(() => {
        const go = () => indiv.dirty && !indiv.drag && !busy && imagesLoaded && !document.querySelector('.ov');
        if (!go()) return;
        const step = (n) => { if (!go()) return; const p = n < 3 ? parPrepare() : null; if (!p) ensureFrames(); else p.then(() => step(n + 1)); };
        step(0);   // computed on all cores without freezing the page (again if the settings changed meanwhile), then put in place
    }, 1500);
}
// Full-size photos that only the CPU can do (no WebGL2, or too big for the card): computed on all cores in the background.
// Returns null when there is nothing to wait for (then everything is done right away, as before).
function parPrepare() {
    if (!indiv.dirty || !indiv.base.L || (PAR.tried && !PAR.ok) || DBG.force === 'single') return null;
    if (indiv.prepJob) return indiv.prepJob;
    const todo = ['L', 'R'].filter(k => {
        const st = indiv.st[k], b = indiv.base[k], key = JSON.stringify(st), g = indiv.gen[k], p = indiv.prep[k];
        if (!igWork(st, false, null)) return false;            // nothing but a quarter turn: instant
        if (g && g.base === b && g.key === key) return false;  // already built
        if (p && p.base === b && p.key === key) return false;  // already prepared
        return !igCan(b, st, false, null);                     // the graphics card does it quickly anyway
    });
    if (!todo.length || !parInit()) return null;   // the workers are only started when they are needed
    indiv.prepJob = (async () => {
        if (!(await parReady())) return;
        for (const k of todo) {   // one photo at a time (less memory at once), each on all cores
            const b = indiv.base[k]; if (!b || !indiv.dirty || !b.width || b.width < 2) continue;   // photos gone, or already built
            const key = JSON.stringify(indiv.st[k]), cv = await parRun(b, indiv.st[k], false, null, false);
            if (!cv) continue;
            if (indiv.base[k] !== b || !indiv.dirty) { releaseCanvas(cv); continue; }   // other photos now, or the frames were built meanwhile
            if (indiv.prep[k]) releaseCanvas(indiv.prep[k].cv);
            indiv.prep[k] = { base: b, key, cv };
        }
    })().catch(() => { }).finally(() => { indiv.prepJob = null; });
    return indiv.prepJob;
}
// When something needs the full-size frames and they are still pending: show a short message, let it paint, then continue.
function whenFramesReady(fn, always) {   // 'always' runs at the end even if something failed (e.g. to restore a button)
    if (!indiv.base.L) indiv.dirty = false;   // nothing to build (never loop)
    if (!indiv.dirty) { try { fn(); } finally { if (always) always(); } return; }
    if (indiv.wfr) { showToast('Applying your edits...'); if (always) always(); return; }   // already applying them for another action
    clearTimeout(idleBuildT); showToast('Applying your edits...'); document.body.classList.add('busy-cursor'); indiv.wfr = true;
    setTimeout(() => {
        const finish = () => { indiv.wfr = false; try { ensureFrames(); fn(); } finally { document.body.classList.remove('busy-cursor'); if (always) always(); } };
        const step = (n) => { const p = n < 3 ? parPrepare() : null; if (!p) finish(); else p.then(() => step(n + 1), finish); };
        step(0);   // on several cores the page stays responsive meanwhile
    }, 40);
}
function indivBuildFrames() {
    const t0 = performance.now(), geometry = indiv.pendGeo; indiv.dirty = false; indiv.pendGeo = false;
    const g = indiv.gen, old = [frameL, frameR, pvL, pvR, g.L && g.L.cv, g.R && g.R.cv];
    if (indivIdentity('L') && indivIdentity('R') && !indiv.match) { pairShow(indiv.base.L, indiv.base.R); origL = indiv.o.L; origR = indiv.o.R; g.L = g.R = null; }
    else {   // a photo is rebuilt at full size only when its own settings changed; both are then fitted to frames of one size (21-pair-size.js)
        const kL = JSON.stringify(indiv.st.L), kR = JSON.stringify(indiv.st.R);
        if (!(g.L && g.L.base === indiv.base.L && g.L.key === kL)) g.L = { base: indiv.base.L, key: kL, cv: indivRender('L') };
        if (!(g.R && g.R.base === indiv.base.R && g.R.key === kR && g.R.match === indiv.match)) {
            const r0 = indivRender('R'), r = indiv.match ? indivApplyLuts(r0, indiv.match) : r0;
            if (r0 !== r && r0 !== indiv.base.R) releaseCanvas(r0);   // temporary step
            g.R = { base: indiv.base.R, key: kR, match: indiv.match, cv: r };
        }
        pairShow(g.L.cv, g.R.cv);
        origL = origR = null;   // pixels changed: no lossless MPO
    }
    colorBackup = indiv.match; sbsAl = null; buildPreview();
    const keep = new Set([indiv.base.L, indiv.base.R, frameL, frameR, pvL, pvR, g.L && g.L.cv, g.R && g.R.cv, pairSrc && pairSrc.L, pairSrc && pairSrc.R, pairStartBase && pairStartBase.L, pairStartBase && pairStartBase.R]);
    old.forEach(c => { if (c && !keep.has(c)) releaseCanvas(c); });   // replaced full-size frames, photos and previews
    pairFitUI();
    if (geometry) { setAlignRange(); customCrop = { x: 0, y: 0, w: 1, h: 1 }; cropEditing = false; updateCropUI(); histMark(); }   // the photo changed shape: the alignment starts again (one undo step)
    indiv.tFull = Math.round(performance.now() - t0); indivRendererLabel();
}
function indivDropPrep() { Object.values(indiv.prep).forEach(p => releaseCanvas(p.cv)); indiv.prep = {}; }
function indivReset() {   // new photos loaded
    indiv.dirty = false; indiv.pendGeo = false; indiv.drag = false;
    igForget(); indivDropPrep(); indiv.base = pairStartBase ? { L: pairStartBase.L, R: pairStartBase.R } : { L: frameL, R: frameR }; indiv.o = { L: origL, R: origR }; indiv.match = null; indiv.band = 0; indiv.cache = {}; indiv.gen = {}; indiv.hist = {}; indiv.pick = null; indiv.ptL = null; indivSetAfter(true);
    ['L', 'R'].forEach(k => { indiv.st[k] = indivNewSt(); indiv.sel[k] = false; });
    indivUpdateUI(); if (currentTab === 'individual') indivRenderDisplays();
}
function indivSwap() {   // called by 'Swap L/R'
    ensureFrames();
    if (!indiv.base.L) { [frameL, frameR] = [frameR, frameL]; [pvL, pvR] = [pvR, pvL]; [origL, origR] = [origR, origL]; return; }
    [indiv.base.L, indiv.base.R] = [indiv.base.R, indiv.base.L]; [indiv.st.L, indiv.st.R] = [indiv.st.R, indiv.st.L];
    [indiv.o.L, indiv.o.R] = [indiv.o.R, indiv.o.L]; [indiv.sel.L, indiv.sel.R] = [indiv.sel.R, indiv.sel.L];
    const adjusted = indiv.match || !(indivIdentity('L') && indivIdentity('R')); indiv.match = null; colorBackup = null;
    if (adjusted) indivRegen(false);   // rebuild both frames from the swapped sources
    else { [frameL, frameR] = [frameR, frameL]; [pvL, pvR] = [pvR, pvL]; [origL, origR] = [origR, origL]; if (pairInfo) [pairInfo.L, pairInfo.R] = [pairInfo.R, pairInfo.L]; }   // centred fits: swapping the frames is the same as fitting the swapped photos
    indivUpdateUI();
}

// --- display of the two photos ---
function indivShowDisplay(k, src, key) {   // puts a rendered preview on screen and takes its histogram data
    const cv = $id('indivCanvas' + k); cv.width = src.width; cv.height = src.height; cv.getContext('2d').drawImage(src, 0, 0);
    indiv.hist[k] = indivHistStats(src);   // histogram data, taken while the pixels are at hand
    indiv.cache['d' + k] = { base: indiv.base[k], key };
    if (typeof INDZ !== 'undefined' && INDZ.k === k) indivZoomLayout();   // zoomed: the sharper copy takes the place of the first one
}
function indivRenderDisplays() {
    if (!imagesLoaded || !indiv.base.L) return;
    ['L', 'R'].forEach(k => {
        const z = typeof INDZ !== 'undefined' && INDZ.k === k, dim = indiv.drag ? (z ? 1200 : 600) : (z ? 2400 : 900);   // lighter preview while a slider is being dragged; sharper when zoomed
        const key = [indiv.after, JSON.stringify(indiv.st[k]), k === 'R' && indiv.after ? indiv.match : null, dim], ck = indiv.cache['d' + k];
        if (ck && ck.base === indiv.base[k] && ck.key[0] === key[0] && ck.key[1] === key[1] && ck.key[2] === key[2] && ck.key[3] === key[3]) return;   // unchanged: no redraw
        if (indiv.parBusy[k]) return;   // a multi-core preview of this photo is still running: it asks for a redraw when it ends
        const st = indiv.st[k], before = !indiv.after, luts = key[2] ? indiv.match : null, src0 = indivScaledBase(k, dim);
        const heavy = !geoZero(st.geo) || (!before && (!!st.adj.clarity || st.hsl.some(b => b[0] || b[1] || b[2])));   // with 2-3 cores, splitting a light edit costs more than it saves
        if (!indiv.noParPrev && parUsable() && (PAR.n >= 4 || heavy || DBG.force === 'multi') && igWork(st, before, luts) && src0.width * src0.height >= 150000 && !igCan(src0, st, before, luts)) {
            const base = indiv.base[k]; indiv.parBusy[k] = true;
            parRun(src0, st, before, luts, true).then(cv => {
                indiv.parBusy[k] = false;
                if (cv && indiv.base[k] === base) { indivShowDisplay(k, cv, key); releaseCanvas(cv); igNote(false, true); }
                else if (!cv) indiv.noParPrev = true;   // could not: one core for the previews from now on
                indivSched();   // the newest settings, if they changed meanwhile
            });
            return;
        }
        const r0 = indivRender(k, dim, before), src = key[2] ? indivApplyLuts(r0, indiv.match, true) : r0, sc = { cv: null }, cached = (t) => Object.values(indiv.cache).some(e => e && e.cv === t);
        indivShowDisplay(k, src, key);
        [r0, src].forEach(t => { if (t !== indiv.base[k] && t !== sc.cv && !cached(t)) releaseCanvas(t); });   // display temporaries
    });
    const dim = (k) => (indiv.st[k].rot & 1) ? [indiv.base[k].height, indiv.base[k].width] : [indiv.base[k].width, indiv.base[k].height], a = dim('L'), b = dim('R');
    indivDrawHist(indivSelected()[0]); indivRendererLabel();
    $id('indivWarn').textContent = Math.abs(a[0] / a[1] - b[0] / b[1]) <= 0.02 ? '' : pairMode === 'pad'
        ? 'The two photos have different proportions: in the other views and in the exports they get black borders (Size difference, in the Alignment panel).'
        : pairMode === 'crop' ? 'The two photos have different proportions: in the other views and in the exports they are cropped to the area they share (Size difference, in the Alignment panel).'
        : 'The two photos have different proportions: the right photo will be cropped to fit the left one in the other views and in the exports.';
}
function indivSetAfter(on) {
    indiv.after = on; const b = $id('btnCompare');
    if (b) { b.classList.toggle('compare-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? 'Before / after (Space): showing your edits' : 'Before / after (Space): showing the original colors'; }
}
let indivRaf = 0;
const indivSched = () => { if (indivRaf) return; indivRaf = requestAnimationFrame(() => { indivRaf = 0; indivRenderDisplays(); }); };
function indivUpdateUI() {
    const sel = ['L', 'R'].filter(k => indiv.sel[k]), first = sel[0];
    ['L', 'R'].forEach(k => { const el = $id('card' + k); if (el) el.setAttribute('aria-pressed', indiv.sel[k] ? 'true' : 'false'); });
    $id('indivTools').classList.toggle('indiv-disabled', !sel.length);
    if (!indiv.pick) $id('indivHint').textContent = sel.length ? 'The tools act on: ' + sel.map(k => k === 'L' ? 'Left' : 'Right').join(' and ') + '.' : 'Click an image to select it (click again to deselect). The tools act on the selected images.';
    const v = first ? indiv.st[first].hsl[indiv.band] : [0, 0, 0], hue = BANDS[indiv.band][1];
    [['bandH', 0, 'valBandH', `linear-gradient(to right, hsl(${hue - 40},80%,50%), hsl(${hue},80%,50%), hsl(${hue + 40},80%,50%))`], ['bandS', 1, 'valBandS', `linear-gradient(to right, hsl(${hue},0%,50%), hsl(${hue},100%,50%))`],
        ['bandL', 2, 'valBandL', `linear-gradient(to right, hsl(${hue},80%,14%), hsl(${hue},80%,50%), hsl(${hue},80%,88%))`]].forEach(([id, q, vid, bg]) => { $id(id).value = v[q]; $id(vid).textContent = v[q]; $id(id).style.background = bg; });
    document.querySelectorAll('.band-dot').forEach(b => b.classList.toggle('on', +b.dataset.band === indiv.band));
    ADJ_KEYS.forEach(key => { const v2 = first && indiv.st[first].adj ? indiv.st[first].adj[key] : 0; $id('adj_' + key).value = v2; $id('val_' + key).textContent = v2; });
    indivSyncExtra(first);
    $id('btnMatchColors').textContent = indiv.match ? 'Undo match colors' : 'Match colors (right to left)';
}
function indivShow(on) {   // swaps the center view and the left panel
    $id('indivView').classList.toggle('show', on); $id('indivPanel').style.display = on ? 'block' : 'none';
    $id('workspaceToolsPanel').style.display = on ? 'none' : ''; $id('alignmentPanel').style.display = on ? 'none' : (toggleAdvanced.checked ? 'block' : 'none');
    $id('compareControls').classList.toggle('hidden', !on); $id('zoomControls').classList.toggle('hidden', !on);
    if (!on && typeof indivZoomOff === 'function') indivZoomOff();
    if (on) { if (!igInit()) parReady().then(indivRendererLabel); indivRendererLabel(); }   // checks the graphics card (or else the cores) once and says which one does the work
    if (!on && indiv.pick) indivCancelPick();
    if (on) { cropLayer.style.display = 'none'; indivUpdateUI(); indivRenderDisplays(); }
}

// --- controls ---
BANDS.forEach(([name, hue], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'band-dot'; b.dataset.band = i; b.title = name; b.setAttribute('aria-label', name + ' colors');
    b.style.background = `hsl(${hue},85%,50%)`; b.onclick = () => { indiv.band = i; indivUpdateUI(); }; $id('bandRow').appendChild(b);
});
['L', 'R'].forEach(k => $id('card' + k).addEventListener('click', (e) => {
    if (typeof INDZ !== 'undefined' && INDZ.k) { if (!INDZ.moved && indiv.pick) indivPickAt(k, e); return; }   // zoomed: a click only picks (dragging moves the photo; the selection stays)
    if (indiv.pick) { indivPickAt(k, e); return; } indiv.sel[k] = !indiv.sel[k]; indivUpdateUI();
}));
const indivSelected = () => ['L', 'R'].filter(k => indiv.sel[k]);
function indivRotate(delta) { const s = indivSelected(); if (!imagesLoaded || !indiv.base.L || !s.length) return; indivEdited(); s.forEach(k => { indiv.st[k].rot = (indiv.st[k].rot + delta + 4) & 3; }); indivRegen(true); }
$id('btnCompare').addEventListener('click', () => { if (!imagesLoaded) return; indivSetAfter(!indiv.after); indivRenderDisplays(); });   // preview only: frames and exports keep the edits
const indivEdited = () => { if (!indiv.after) indivSetAfter(true); };   // changing anything shows the result again
$id('btnRotL').addEventListener('click', () => indivRotate(-1));
$id('btnRotR').addEventListener('click', () => indivRotate(1));
[['bandH', 0, 'valBandH'], ['bandS', 1, 'valBandS'], ['bandL', 2, 'valBandL']].forEach(([id, q, vid]) => {
    const el = $id(id);
    el.addEventListener('input', () => { const v = parseInt(el.value); indivSelected().forEach(k => { indiv.st[k].hsl[indiv.band][q] = v; }); $id(vid).textContent = v; indiv.drag = true; indivEdited(); indivSched(); });   // live: small previews only
    el.addEventListener('change', () => {   // released: rebuild the real frames
        document.body.classList.add('busy-cursor');
        setTimeout(() => { try { indivRegen(false); } finally { document.body.classList.remove('busy-cursor'); } }, 20);
    });
});
$id('btnResetColors').addEventListener('click', () => { const s = indivSelected(); if (!s.length) return; s.forEach(k => { indiv.st[k].hsl = Array.from({ length: 8 }, () => [0, 0, 0]); }); indivRegen(false); });
$id('btnResetIndiv').addEventListener('click', () => { const s = indivSelected(); if (!s.length) return; s.forEach(k => { indiv.st[k] = indivNewSt(); }); indivRegen(true); });


// exposure / shadows and highlights / white balance sliders (built from ADJ_UI)
Object.entries(ADJ_UI).forEach(([box, list]) => list.forEach(([key, label]) => {
    const g = document.createElement('div'); g.className = 'control-group'; g.innerHTML = `<label>${label} <span id="val_${key}">0</span></label><input type="range" id="adj_${key}" min="-100" max="100" step="1" value="0">`;
    $id(box).appendChild(g); const el = g.querySelector('input');
    if (key === 'temperature') el.style.background = 'linear-gradient(to right, #4a7bd8, #d9d9d9, #ec8f35)';   // cool -> warm
    if (key === 'tint') el.style.background = 'linear-gradient(to right, #3fae5a, #d9d9d9, #c3479e)';   // green -> magenta
    el.addEventListener('input', () => { const v = parseInt(el.value); indivSelected().forEach(k => { indiv.st[k].adj[key] = v; }); $id('val_' + key).textContent = v; indiv.drag = true; indivEdited(); indivSched(); });   // live: small previews only
    el.addEventListener('change', () => { document.body.classList.add('busy-cursor'); setTimeout(() => { try { indivRegen(false); } finally { document.body.classList.remove('busy-cursor'); } }, 20); });   // released: rebuild the real frames
}));
[['btnResetExposure', ['exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'clarity']], ['btnResetShadows', ['shadows', 'highlights']], ['btnResetWB', ['temperature', 'tint']]].forEach(([id, keys]) => {
    $id(id).addEventListener('click', () => { const s2 = indivSelected(); if (!s2.length) return; s2.forEach(k => keys.forEach(key => { indiv.st[k].adj[key] = 0; })); indivRegen(false); });
});

// auto-rotate: first make the right photo agree with the left one (any 90 degree step), then turn both upright if they look upside down (sky below)
function indivAutoRotate() {
    if (!imagesLoaded || !indiv.base.L) return;
    try {
        const N = 48, small = (k, rot) => indivRotateCanvas(indivRender(k, 96), rot, true);
        const gl = grayData(small('L', 0), N, N), rel = pickRelativeRotation(gl, [0, 1, 2, 3].map(r => grayData(small('R', r), N, N))), notes = [];
        if (rel) { indiv.st.R.rot = (indiv.st.R.rot + rel) & 3; notes.push('right photo turned ' + rel * 90 + ' degrees to match the left'); }
        const rgba = (k) => { const x = mkCanvas(32, 32).getContext('2d', { willReadFrequently: true }); x.drawImage(indivRender(k, 96), 0, 0, 32, 32); return x.getImageData(0, 0, 32, 32).data; };
        if (uprightScore(rgba('L'), 32, 32) + uprightScore(rgba('R'), 32, 32) < -28) { indiv.st.L.rot = (indiv.st.L.rot + 2) & 3; indiv.st.R.rot = (indiv.st.R.rot + 2) & 3; notes.push('both photos turned upside-down to upright'); }
        if (!notes.length) { showToast("No rotation needed, or the orientation could not be detected reliably."); return; }
        indivRegen(true); showToast('Auto-rotate: ' + notes.join('; ') + '.');
    } catch (e) { console.error(e); showToast("Auto-rotate failed.", true); }
}
$id('btnAutoRotate').addEventListener('click', indivAutoRotate);

// match colors: per-channel histogram matching of the right photo (with its edits) to the left (with its edits), as one lookup
// table per channel applied after the right photo's own edits. While it is on, the right photo is kept matched: the tables are
// made again after every finished edit (indivRegen), so a neutral picked on the left, a preset or a curve on both photos keeps
// the two alike. (Made once and kept, a preset applied to both photos left the right one with the old correction on top.)
function indivMatchLuts() {
    const hist = (cv) => {
        const tw = Math.min(cv.width, 400), c = scaledCanvas(cv, tw, Math.max(1, Math.round(cv.height * tw / cv.width))), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const H = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
        for (let i = 0; i < d.length; i += 4) { H[0][d[i]]++; H[1][d[i + 1]]++; H[2][d[i + 2]]++; } releaseCanvas(c); return H;
    };
    const hl = hist(indivRender('L', 400)), hr = hist(indivRender('R', 400));
    const cdf = (h) => { let a = 0; const t = h.reduce((x, y) => x + y, 0), o = new Float64Array(256); for (let i = 0; i < 256; i++) { a += h[i]; o[i] = a / t; } return o; };
    return [0, 1, 2].map(ch => { const cl = cdf(hl[ch]), cr = cdf(hr[ch]), lut = new Uint8Array(256); let j = 0; for (let i = 0; i < 256; i++) { while (j < 255 && cl[j] < cr[i]) j++; lut[i] = j; } return lut; });
}
const indivMatchKey = () => JSON.stringify([indiv.st.L, indiv.st.R, indiv.base.L && [indiv.base.L.width, indiv.base.L.height], indiv.base.R && [indiv.base.R.width, indiv.base.R.height]]);
function indivMatchRefresh() {   // match on and the edits changed since the tables were made: made again (same result as pressing the button now)
    if (!indiv.match || !indiv.base.L || !indiv.base.R) return;
    const k = indivMatchKey(); if (indiv.matchKey === k) return;
    const m = indivMatchLuts(), same = indiv.match.every((a, ch) => a.length === m[ch].length && a.every((v, i) => v === m[ch][i]));
    if (!same) indiv.match = m;   // unchanged tables keep their identity (nothing redrawn for nothing)
    indiv.matchKey = k;
}
function toggleMatchColors() {
    if (!imagesLoaded || !indiv.base.L) return;
    if (indiv.match) { indiv.match = null; indiv.matchKey = null; indivRegen(false); showToast("Original colors restored."); return; }
    indiv.match = indivMatchLuts(); indiv.matchKey = indivMatchKey();
    indivEdited(); indivRegen(false); showToast("Right photo matched to the left (and kept matched while this is on). Press again to undo.");
}
$id('btnMatchColors').addEventListener('click', toggleMatchColors);

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
