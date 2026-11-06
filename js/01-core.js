/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// ============================================================
//  APP IDENTITY: change the name / version / stage HERE ONLY.
//  It feeds the page title, the header, About, diagnostics, the self-test
//  and the EXIF Make / Model / Software written into MPO files.
// ============================================================
const APP = {
    name: '3DToolAD',
    version: '6.3',
    stage: 'Beta',                          // shown in the header; '' hides it
    repo: 'https://github.com/adpietri/3dtoolad',   // enables "Report a problem" (opens a new issue there)
    id: '3dToolAD'                          // file-format tag of saved alignment files: do NOT change, old files would stop loading
};
APP.label = APP.name + ' ' + APP.version;   // "3DToolAD 6.0"
APP.header = APP.name + ' v' + APP.version + (APP.stage ? ' (' + APP.stage + ')' : '');   // "3DToolAD v6.0 (Beta)"

// shared state declared up front so no function can ever touch it before initialization
const DBG = { force: 'auto', align: null, rebuild: null, mem: null, log: null, fps: null };   // force: the renderer ('auto' = graphics card when it can; Settings > Performance or the debug panel can force the processor); the rest: debug measurements
const view = { z: 1, x: 0, y: 0 };                    // zoom / pan of the preview
const hist = { a: [], i: -1 };   // undo history: snapshots of every left-panel setting ({ s: state, j: its JSON })
const ADJ_KEYS = ['exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'clarity', 'shadows', 'highlights', 'temperature', 'tint'];   // declared before 'indiv' because its initial state needs it at load time
const ANA_PRESETS = { dubois: [0.456, 0.5, 0.176, -0.043, -0.088, -0.002, -0.04, -0.038, -0.016, 0.378, 0.734, -0.018, -0.015, -0.021, -0.005, -0.072, -0.113, 1.226],
    halfcolor: [0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], optimized: [0, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    classic: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], grayscale: [0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0, 0.299, 0.587, 0.114] };
let anaMixFill = () => { };   // refreshes the custom-matrix cells (set by the mixer below)
let ANA_MIX = ANA_PRESETS.dubois.slice();   // custom anaglyph matrix (rows: output R, G, B; columns: left R G B, right R G B)
const EXTRA_SLIDERS = [];   // sliders of the geometry and tone-curve sections
// per-photo settings of the Individual Images tab, at their neutral values (here because 'indiv' needs it at load time)
function indivNewSt() { const adj = {}; ADJ_KEYS.forEach(k => { adj[k] = 0; }); return { rot: 0, hsl: Array.from({ length: 8 }, () => [0, 0, 0]), adj, geo: { straighten: 0, keyV: 0, keyH: 0, lens: 0 }, curve: { rgb: [0, 0, 0, 0], r: [0, 0, 0, 0], g: [0, 0, 0, 0], b: [0, 0, 0, 0], pts: { rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] } } }; }   // curve: the Tone curve sliders; curve.pts: the points of Curves (js/25-curves.js)
const indiv = { hist: {}, prep: {}, parBusy: {}, noParPrev: false, wfr: false, prepJob: null, dirty: false, pendGeo: false, drag: false, tPrev: undefined, tFull: undefined, pick: null, ptL: null, after: true, cache: {}, gen: {}, base: { L: null, R: null }, o: { L: null, R: null }, st: { L: indivNewSt(), R: indivNewSt() }, sel: { L: false, R: false }, match: null, band: 0 };   // Individual Images: untouched originals + per-photo settings   // undo history of the alignment

// --- GLOBALS ---
let frameL = null, frameR = null;
let pvL = null, pvR = null, pvScale = 1;      // reduced-resolution copies used by the live views
let origL = null, origR = null;               // original JPEG bytes (lossless MPO pass-through)
let fileL = null, fileR = null;               // separate uploads
let floatPct = 0, floatSoft = false;                             // floating stereo window width (% of frame width)
let rotDeg = 0, scaleK = 1;                   // rotation (deg) and scale applied to the right image
let projSrc = null;                           // where the open photos came from, for 'Save project': { kind: 'single' | 'pair', files, layout } or { kind: 'pixels' }
let openedMpoFile = null;                     // the file currently open, only when it is a real MPO
let busy = false;                             // an export is running
let cancelReq = false, abortGif = null;       // Esc cancels GIF / video
let exifBuf = null;                           // first source JPEG (camera EXIF is copied from it)
let colorBackup = null;                       // for undoing 'Match colors'
let sbsAl = null, sbsSaving = false; let customCrop = { x: 0, y: 0, w: 1, h: 1 }, cropEditing = false, zoomMode = false;                             // aligned frames cached while the SBS modal is open
const PREVIEW_MAX = 1600;
let imagesLoaded = false;
let isPlaying = false;
let currentFrame = 0;
let animationId = null;
let lastSwapTime = 0;

let offsetX = 0, offsetY = 0;
let isAligning = false;
let wasPlayingBeforeAlign = false;

let currentTab = 'wiggle';

// --- DOM ELEMENTS ---
const screenUpload = document.getElementById('screenUpload');
const screenEditor = document.getElementById('screenEditor');
const btnClear = document.getElementById('btnClear');

const wiggleCanvas = document.getElementById('wiggleCanvas');
const wiggleCtx = wiggleCanvas.getContext('2d');
const anaglyphCanvas = document.getElementById('anaglyphCanvas');
const anaglyphCtx = anaglyphCanvas.getContext('2d');

const speedRange = document.getElementById('speedRange');
const interpolateCheck = document.getElementById('interpolateCheck');
const valSpeed = document.getElementById('valSpeed');
const playControls = document.getElementById('playControls');
const btnPlayPause = document.getElementById('btnPlayPause');

const toggleAdvanced = document.getElementById('toggleAdvanced');
const alignmentPanel = document.getElementById('alignmentPanel');
const animSettingsPanel = document.getElementById('animSettingsPanel');
const anaglyphSettingsPanel = document.getElementById('anaglyphSettingsPanel');
const alignX = document.getElementById('alignX');
const alignY = document.getElementById('alignY');
const valX = document.getElementById('valX');
const valY = document.getElementById('valY');

const toast = document.getElementById('toast');
let toastTimeout;

// --- THEME LOGIC ---
function applyTheme(t, save) {
    if (t === 'light') document.body.setAttribute('data-theme', 'light'); else document.body.removeAttribute('data-theme');
    if (save) { try { localStorage.setItem('3dtool-theme', t); } catch (e) { } }
}
(function initTheme() {
    let t = null; try { t = localStorage.getItem('3dtool-theme'); } catch (e) { }
    if (t !== 'light' && t !== 'dark') t = null;   // anything else stored: follow the device
    if (!t && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) t = 'light';
    if (t) applyTheme(t, false);
})();
if (window.matchMedia) {   // no theme chosen: follow the device live
    const mq = matchMedia('(prefers-color-scheme: light)'), follow = () => { let t = null; try { t = localStorage.getItem('3dtool-theme'); } catch (e) { } if (t !== 'light' && t !== 'dark' && !document.querySelector('.ov.prefs')) applyTheme(mq.matches ? 'light' : 'dark', false); };
    if (mq.addEventListener) mq.addEventListener('change', follow); else if (mq.addListener) mq.addListener(follow);
}
function toggleTheme() { applyTheme(document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true); }   // the D key (the choice itself: Settings > Appearance)

// --- UI & TAB LOGIC ---
document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const target = e.currentTarget.getAttribute('data-target'), el = e.currentTarget;
        if (target !== 'individual' && indiv.dirty) { whenFramesReady(() => el.click()); return; }   // finish pending edits first, with a message
        const prevTab = currentTab;
        currentTab = target;
        if (target === 'anaglyph' && imagesLoaded) scheduleAlignWarm(800);   // a still picture: prepare auto-align (js/03-input-align.js)
        
        document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        document.querySelectorAll('.canvas-container canvas').forEach(c => c.classList.remove('active'));
        const cv = document.getElementById(`${target}Canvas`); if (cv) cv.classList.add('active');
        indivShow(target === 'individual');   // the individual-images view and its own left panel

        if(target === 'wiggle') {
            animSettingsPanel.style.display = 'block';
            anaglyphSettingsPanel.style.display = 'none';
            playControls.classList.remove('hidden');
            if (imagesLoaded && isPlaying && !animationId) {
                lastSwapTime = performance.now();
                animationId = requestAnimationFrame(renderWiggleLoop);
            } else if (imagesLoaded && !isPlaying && !isAligning) {
                drawWiggleStatic(currentFrame);
            }
        } else if (target === 'anaglyph') {
            animSettingsPanel.style.display = 'none';
            anaglyphSettingsPanel.style.display = 'block';
            playControls.classList.add('hidden');
            if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
            generateAnaglyph();
        } else {   // individual images
            animSettingsPanel.style.display = 'none';
            anaglyphSettingsPanel.style.display = 'none';
            playControls.classList.add('hidden');
            if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        }
        if (isAligning && target !== 'individual') renderGhosting();
        if (prevTab !== target) leftPanelToTop();   // the left panel now shows other tools: show them from the top
    });
});
// A panel whose content just became much shorter may keep its old scroll position in some browsers and show an empty
// column until the user scrolls. So the position is set explicitly.
const leftPanel = document.querySelector('.sidebar');
function leftPanelToTop() {
    if (leftPanel) leftPanel.scrollTop = 0;
    if (window.matchMedia && matchMedia('(max-width: 900px)').matches && window.scrollY > 0) window.scrollTo(0, 0);   // phones: the page itself scrolls
}
function clampPanel(el) {   // content got shorter: never stay scrolled past its end
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    if (el.scrollTop > max) el.scrollTop = max;
}
const clampLeftPanel = () => clampPanel(leftPanel);
document.addEventListener('toggle', (e) => {   // a collapsible section closed (e.g. Wiggle export options): the same scroll position issue in that panel
    const d = e.target; if (!d || d.tagName !== 'DETAILS' || d.open) return;
    const side = d.closest && d.closest('.sidebar'); if (side) requestAnimationFrame(() => clampPanel(side));
}, true);

speedRange.addEventListener('input', (e) => valSpeed.innerText = e.target.value);

function showToast(message, isError = false) {
    if (DBG.log) { DBG.log.push([new Date().toTimeString().slice(0, 8), String(message), !!isError]); if (DBG.log.length > 40) DBG.log.shift(); }   // debug mode only
    clearTimeout(toastTimeout);
    toast.innerText = message;
    toast.style.background = isError ? "var(--danger)" : "var(--primary)";
    toast.classList.add('show');
    toastTimeout = setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

btnClear.addEventListener('click', () => { if (busy) { showToast('Wait for the export to finish (or press Esc to cancel).', true); return; } resetApp(); });

// --- RESET IMAGE: every change made in the left panels, back to how the photos were when they were opened ---
function resetImage() {
    if (!imagesLoaded) return;
    if (busy) { showToast('Wait for the export to finish (or press Esc to cancel).', true); return; }
    const keep = new Set(), drop = new Set();
    if (indiv.base.L) {
        if (swappedLR) { [indiv.base.L, indiv.base.R] = [indiv.base.R, indiv.base.L]; [indiv.o.L, indiv.o.R] = [indiv.o.R, indiv.o.L]; }   // undo Swap L/R
        swappedLR = false;
        [frameL, frameR, pvL, pvR, sbsAl && sbsAl.L, sbsAl && sbsAl.R].forEach(c => c && drop.add(c));
        [indiv.cache, indiv.gen, indiv.prep].forEach(o => Object.values(o || {}).forEach(e => e && e.cv && drop.add(e.cv)));
        const st0 = pairStartBase; pairUseMode(pairOpenMode);   // 'Size difference' as chosen when opening (the photos are made again only if needed)
        pairStartBase = { L: indiv.base.L, R: indiv.base.R };
        if (st0) [st0.L, st0.R].forEach(c => { if (c && c !== pairStartBase.L && c !== pairStartBase.R && (!pairSrc || (c !== pairSrc.L && c !== pairSrc.R))) drop.add(c); });
        keep.add(indiv.base.L); keep.add(indiv.base.R); if (pairSrc) { keep.add(pairSrc.L); keep.add(pairSrc.R); }
        pairShow(indiv.base.L, indiv.base.R); origL = indiv.o.L; origR = indiv.o.R;   // the untouched photos
    }
    sbsAl = null; swappedLR = false;
    if (openSnap) OPEN_SNAP_IDS.forEach(id => {   // left-panel settings as they were when the photos were opened
        const el = document.getElementById(id); if (!el || !(id in openSnap)) return;
        if (el.type === 'checkbox') { if (el.checked !== openSnap[id]) { el.checked = openSnap[id]; el.dispatchEvent(new Event('change', { bubbles: true })); } }
        else if (el.value !== openSnap[id]) { el.value = openSnap[id]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    resettingImage = true;
    try { finishFrames(); } finally { resettingImage = false; }   // alignment, rotation, scale, floating window, crop, undo history, zoom and every Individual Images edit
    drop.forEach(c => { if (!keep.has(c) && c !== pvL && c !== pvR && c !== frameL && c !== frameR) releaseCanvas(c); });
    refreshView();
    if (currentTab === 'wiggle' && isPlaying && !animationId) { lastSwapTime = performance.now(); animationId = requestAnimationFrame(renderWiggleLoop); }
    showToast('Image reset to how it was when opened.');
}
function askResetImage() {
    if (!imagesLoaded) return;
    if (busy) { showToast('Wait for the export to finish (or press Esc to cancel).', true); return; }
    openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Reset the image?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">Every change made in the left panels is undone: alignment, rotation and scale, floating window, crop, a left/right swap and all Individual Images edits. The photos return to how they were when you opened them. This cannot be undone.</p>',
        [['Reset image', resetImage], ['Cancel']]);
}
document.getElementById('btnResetImage').addEventListener('click', askResetImage);

function resetApp() {
    if (!busy) releaseProject();
    imagesLoaded = false;
    isPlaying = false; currentFrame = 0;
    isAligning = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;

    frameL = null; frameR = null; pvL = null; pvR = null; origL = null; origR = null; sbsAl = null; exifBuf = null; colorBackup = null; indiv.base = { L: null, R: null }; indiv.match = null;
    fileL = null; fileR = null; openedMpoFile = null; projSrc = null; updateInspectBtn();

    offsetX = 0; offsetY = 0; resetRS();
    alignX.value = 0; alignY.value = 0;
    valX.innerText = "0"; valY.innerText = "0";
    toggleAdvanced.checked = false;
    alignmentPanel.style.display = 'none';

    document.getElementById('inputSbs').value = '';
    document.getElementById('inputLeft').value = '';
    document.getElementById('inputRight').value = '';
    
    setBadge('L', 'Waiting...', false); setBadge('R', 'Waiting...', false);

    screenEditor.classList.remove('active');
    screenUpload.classList.add('active');
    btnClear.style.display = 'none';
    
    wiggleCtx.clearRect(0, 0, wiggleCanvas.width, wiggleCanvas.height);
    anaglyphCtx.clearRect(0, 0, anaglyphCanvas.width, anaglyphCanvas.height);
    if (typeof goStartTab === 'function') goStartTab();   // the start screen opens in the tab chosen in Settings (js/27-prefs.js)
}

function onImagesReady() {
    pairFitUI();   // Size difference: shown when the two photos differ
    imagesLoaded = true; updateInspectBtn(); if (typeof indivZoomOff === 'function') indivZoomOff();
    screenUpload.classList.remove('active');
    screenEditor.classList.add('active');
    btnClear.style.display = 'block';

    isPlaying = true; currentFrame = 0;
    updatePlayButtonIcon();

    if (window.innerWidth <= 900) {
        document.querySelector('.viewport-area').scrollIntoView({ behavior: 'smooth' });
    }

    if (currentTab === 'wiggle') {
        drawWiggleStatic(0);
        lastSwapTime = performance.now();
        if (!animationId) animationId = requestAnimationFrame(renderWiggleLoop);
    } else if (currentTab === 'individual') {
        indivRenderDisplays();
    } else {
        generateAnaglyph();
    }
}

// --- PREFERENCES (the Settings window, js/27-prefs.js): kept in this browser; anything unknown or out of range falls back to the default ---
const PREFS_KEY = '3dtool-prefs';
const PREF_DEFAULTS = { centerBg: 'theme', panelBg: 'theme', toolsSide: 'right', startTab: 'wiggle', rememberFolds: true, warnFormats: true, warnSizes: true, warnLeave: false,
    mpoName: 'stereoscopic_3d_{date}', sbsName: '3d_{layout}_{date}', histMax: 256, presetSave: 'browser', render: 'auto' };
const PREF_CHOICES = { centerBg: ['theme', 'black', 'dark', 'mid', 'light', 'white'], panelBg: ['theme', 'charcoal', 'graphite', 'slate', 'warm', 'mid', 'light'],
    toolsSide: ['right', 'left'], startTab: ['wiggle', 'anaglyph', 'individual'], presetSave: ['browser', 'file'], render: ['auto', 'multi', 'single'] };
const HIST_MIN = 20, HIST_MAX = 1000;
function prefPut(p, k, v) {   // stores v in p[k] only if it is a valid value for k; returns whether it did
    const d = PREF_DEFAULTS[k];
    if (PREF_CHOICES[k]) { if (!PREF_CHOICES[k].includes(v)) return false; }
    else if (typeof d === 'boolean') { if (typeof v !== 'boolean') return false; }
    else if (k === 'histMax') { v = Math.round(Number(v)); if (!Number.isFinite(v)) return false; v = Math.max(HIST_MIN, Math.min(HIST_MAX, v)); }
    else if (typeof d === 'string') { if (typeof v !== 'string') return false; v = v.replace(/[\x00-\x1f]/g, '').trim().slice(0, 120) || d; }
    else return false;
    p[k] = v; return true;
}
const PREFS = (() => {
    const p = Object.assign({}, PREF_DEFAULTS); let o = null;
    try { o = JSON.parse(localStorage.getItem(PREFS_KEY)); } catch (e) { }
    if (o && typeof o === 'object') Object.keys(PREF_DEFAULTS).forEach(k => { if (k in o) prefPut(p, k, o[k]); });
    return p;
})();
// File names from the patterns in Settings > Files: {name} the opened file, {date} date and time, {layout} the SBS layout.
window.addEventListener('beforeunload', (e) => { if (PREFS.warnLeave && imagesLoaded) { e.preventDefault(); e.returnValue = ''; } });   // Settings > Files
function prefFileName(kind, ext, layout) {
    const pat = PREFS[kind + 'Name'] || PREF_DEFAULTS[kind + 'Name'];
    const src = projSrc && projSrc.files && projSrc.files[0] && projSrc.files[0].name ? projSrc.files[0].name.replace(/\.[^.]+$/, '') : 'photo';
    const s = pat.replace(/\{date\}/gi, stamp()).replace(/\{name\}/gi, src).replace(/\{layout\}/gi, layout || '')
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').slice(0, 120);
    return (s || kind + '_' + stamp()) + '.' + ext;
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
