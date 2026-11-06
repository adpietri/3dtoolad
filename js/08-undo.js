/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- UNDO / REDO (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y) ---
// Every step is a snapshot of all the left-panel settings: alignment, crop, floating window, left/right order, wigglegram,
// anaglyph and Individual Images. A step is recorded when a change is finished (slider released, button pressed...).
let histApplying = false, histT = 0;
const histJSON = (o) => JSON.stringify(o);
const histSubs = [];   // called after every change of the history (the History window listens here)
function histNotify() { histSubs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
function histState() {
    return { x: offsetX, y: offsetY, r: rotDeg, k: scaleK, f: floatPct, soft: document.getElementById('floatSoft').checked, crop: document.getElementById('cropAspect').value,
        cc: { x: customCrop.x, y: customCrop.y, w: customCrop.w, h: customCrop.h }, sw: swappedLR, sp: String(speedRange.value), xf: interpolateCheck.checked,
        am: document.getElementById('anaglyphMode').value, mix: ANA_MIX.slice(), L: JSON.parse(JSON.stringify(indiv.st.L)), R: JSON.parse(JSON.stringify(indiv.st.R)),
        m: indiv.match ? indiv.match.map(a => Array.from(a)) : null, fit: pairMode };
}
function histReset() { const c = histState(); hist.a = [{ s: c, j: histJSON(c), t: Date.now() }]; hist.i = 0; clearTimeout(histT); histT = 0; histNotify(); }   // newly opened photos (or Reset image)
function pushHist() {
    clearTimeout(histT); histT = 0;
    if (!imagesLoaded || !indiv.base.L || histApplying || indiv.pendGeo) return;   // a change of shape is recorded once the photos are rebuilt
    const c = histState(), j = histJSON(c), l = hist.a[hist.i];
    if (l && l.j === j) return;
    hist.a = hist.a.slice(0, hist.i + 1); hist.a.push({ s: c, j, t: Date.now() }); while (hist.a.length > PREFS.histMax) hist.a.shift(); hist.i = hist.a.length - 1;
    histNotify();
}
function histTrim() {   // the number of steps kept was lowered: the oldest steps go first, then (if still too many) the redo steps
    let n = hist.a.length - PREFS.histMax; if (n <= 0) return;
    const old = Math.min(n, hist.i); hist.a.splice(0, old); hist.i -= old; n -= old;
    if (n > 0) hist.a.length -= n;
    histNotify();
}
function histMark() { if (histApplying || !imagesLoaded) return; clearTimeout(histT); histT = setTimeout(pushHist, 80); }   // after the control's own handlers have run
['change', 'click'].forEach(ev => document.addEventListener(ev, (e) => {
    if (imagesLoaded && e.target && e.target.closest && e.target.closest('#workspaceToolsPanel, #alignmentPanel, #animSettingsPanel, #anaglyphSettingsPanel, #indivPanel')) histMark();
}));
function setCtl(id, v) {   // sets a control and lets its own handlers react
    const el = document.getElementById(id); if (!el) return;
    if (el.type === 'checkbox') { if (el.checked === !!v) return; el.checked = !!v; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
    if (el.value === String(v)) return;
    el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}
function cleanPhotoSt(q) {   // one photo's settings read from a file (project, preset, colours file): only known fields, numbers in range
    const n = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    const z = indivNewSt(); if (!q || typeof q !== 'object') return z;
    z.rot = Math.round(n(q.rot, 0, 3, 0)) & 3;
    if (q.adj && typeof q.adj === 'object') ADJ_KEYS.forEach(k => { z.adj[k] = n(q.adj[k], -100, 100, 0); });
    if (Array.isArray(q.hsl)) z.hsl.forEach((b, i) => { const src = Array.isArray(q.hsl[i]) ? q.hsl[i] : []; for (let c = 0; c < 3; c++) b[c] = n(src[c], -100, 100, 0); });
    if (q.geo && typeof q.geo === 'object') { z.geo.straighten = n(q.geo.straighten, -10, 10, 0); ['keyV', 'keyH', 'lens'].forEach(k => { z.geo[k] = n(q.geo[k], -100, 100, 0); }); }
    if (q.curve && typeof q.curve === 'object') {
        ['rgb', 'r', 'g', 'b'].forEach(c => { if (Array.isArray(q.curve[c])) for (let i = 0; i < 4; i++) z.curve[c][i] = n(q.curve[c][i], -100, 100, 0); });
        if (q.curve.pts && typeof q.curve.pts === 'object') ['rgb', 'r', 'g', 'b'].forEach(c => { z.curve.pts[c] = ptsClean(q.curve.pts[c]); });   // missing: saved before Curves existed
    }
    return z;
}
function cleanState(o) {   // a snapshot read from a file: only known fields, numbers in range (anything else -> default)
    if (!o || typeof o !== 'object') return null;
    const n = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    const opt = (id, v) => { const el = document.getElementById(id); return [...el.options].some(p => p.value === v) ? v : el.options[0].value; };
    const ind = cleanPhotoSt;
    const cc = o.cc, okCC = cc && [cc.x, cc.y, cc.w, cc.h].every(Number.isFinite) && cc.w > 0 && cc.h > 0 && cc.x >= 0 && cc.y >= 0 && cc.x + cc.w <= 1.0001 && cc.y + cc.h <= 1.0001;
    const okM = Array.isArray(o.m) && o.m.length === 3 && o.m.every(a => Array.isArray(a) && a.length === 256 && a.every(v => Number.isInteger(v) && v >= 0 && v <= 255));
    return { x: Math.round(n(o.x, -1e5, 1e5, 0)), y: Math.round(n(o.y, -1e5, 1e5, 0)), r: n(o.r, -5, 5, 0), k: n(o.k, 0.95, 1.05, 1), f: n(o.f, 0, 6, 0), soft: !!o.soft,
        crop: opt('cropAspect', o.crop), cc: okCC ? { x: cc.x, y: cc.y, w: cc.w, h: cc.h } : { x: 0, y: 0, w: 1, h: 1 }, sw: !!o.sw,
        sp: String(Math.round(n(Number(o.sp), 50, 500, 150) / 10) * 10), xf: o.xf !== false, am: opt('anaglyphMode', o.am),
        mix: Array.isArray(o.mix) && o.mix.length === 18 && o.mix.every(Number.isFinite) ? o.mix.map(v => Math.max(-3, Math.min(3, v))) : ANA_PRESETS.dubois.slice(),
        L: ind(o.L), R: ind(o.R), m: okM ? o.m : null, fit: PAIR_LABEL[o.fit] ? o.fit : null };   // fit missing: saved before 5.6 (see applyState)
}
function applyState(st) {   // puts every left-panel setting of a snapshot in place
    histApplying = true;
    try {
        ensureFrames();
        if (st.sw !== swappedLR) { indivSwap(); swappedLR = !swappedLR; }   // left / right order first: the other settings refer to it
        setCtl('speedRange', st.sp); setCtl('interpolateCheck', st.xf);
        if (histJSON(ANA_MIX) !== histJSON(st.mix)) { ANA_MIX = st.mix.slice(); anaMixFill(); try { localStorage.setItem('3dtool-anamix', JSON.stringify(ANA_MIX)); } catch (e) { } }
        setCtl('anaglyphMode', st.am); setCtl('floatSoft', st.soft);
        const curM = indiv.match ? indiv.match.map(a => Array.from(a)) : null;
        const fit = st.fit || (pairSrc && pairCompare(pairSrc.L, pairSrc.R) !== 'same' ? 'cover' : 'crop'), fitChanged = fit !== pairMode;   // older projects: the rule they were made with
        if (fitChanged || histJSON([indiv.st.L, indiv.st.R, curM]) !== histJSON([st.L, st.R, st.m])) {
            if (fitChanged) pairUseMode(fit);
            const shape = (q) => histJSON([q.L.rot, q.L.geo, q.R.rot, q.R.geo]), geo = fitChanged || shape(indiv.st) !== shape(st);
            indiv.st.L = JSON.parse(JSON.stringify(st.L)); indiv.st.R = JSON.parse(JSON.stringify(st.R)); indiv.match = st.m ? st.m.map(a => Uint8Array.from(a)) : null;
            indivRegen(geo); if (geo) ensureFrames();   // a change of shape resets the alignment: it is set again just below
        }
        const ca = document.getElementById('cropAspect'), wasEditing = cropEditing; if (ca.value !== st.crop) { ca.value = st.crop; ca.dispatchEvent(new Event('change', { bubbles: true })); }
        customCrop = { x: st.cc.x, y: st.cc.y, w: st.cc.w, h: st.cc.h }; cropEditing = wasEditing && st.crop === 'custom'; updateCropUI();
        rotDeg = st.r; scaleK = st.k; floatPct = st.f; syncRS(); setOffsets(st.x, st.y, true);
    } finally { histApplying = false; clearTimeout(histT); histT = 0; }
}
function histStep(d) {
    if (!imagesLoaded || busy) return;
    if (indiv.pendGeo) { whenFramesReady(() => histStep(d)); return; }   // a change of shape still being applied: finish it, then step
    pushHist();   // the current state, if it was not recorded yet
    const i = hist.i + d; if (i < 0 || i >= hist.a.length) return;
    hist.i = i; applyState(hist.a[i].s);
    const c = histState(); hist.a[i] = { s: c, j: histJSON(c), t: hist.a[i].t };   // as it really is now (values the controls rounded or limited)
    histNotify();
}
document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !imagesLoaded || document.querySelector('.ov')) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); if (!e.repeat) saveProject(); return; }   // instead of the browser's 'save page'
    if (busy) return;
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); histStep(-1); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); histStep(1); }
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
