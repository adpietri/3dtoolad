/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- MPO PARSING ---
function findJpegEnd(buffer, start = 0) {
    const v = new Uint8Array(buffer); const len = v.length;
    if (start + 1 >= len || v[start] !== 0xFF || v[start + 1] !== 0xD8) return -1;
    let p = start + 2;
    while (p + 1 < len) {
        if (v[p] !== 0xFF) { p++; continue; }
        const m = v[p + 1];
        if (m === 0xFF) { p++; continue; }
        if (m === 0x00 || m === 0x01 || m === 0xD8 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
        if (m === 0xD9) return p + 2;
        if (p + 3 >= len) return -1;
        p += 2 + ((v[p + 2] << 8) | v[p + 3]);
        if (m === 0xDA) {
            while (p + 1 < len) {
                if (v[p] === 0xFF) { const n = v[p + 1]; if (n !== 0x00 && !(n >= 0xD0 && n <= 0xD7)) break; }
                p++;
            }
        }
    }
    return -1;
}

function findSecondImageOffset(buffer) {
    const v = new Uint8Array(buffer);
    let p = findJpegEnd(buffer, 0);
    if (p === -1) return -1;
    while (p < v.length && (v[p] === 0x00 || v[p] === 0xFF) && !(v[p] === 0xFF && v[p + 1] === 0xD8)) p++;
    return (p + 1 < v.length && v[p] === 0xFF && v[p + 1] === 0xD8) ? p : -1;
}

// Reads the MP Entry table (tag 0xB002) so images are located by their real offsets.
function readMpfOffsets(buffer) {
    try {
        const v = new Uint8Array(buffer), dv = new DataView(buffer);
        if (v.length < 8 || dv.getUint16(0) !== 0xFFD8) return null;
        let p = 2;
        while (p + 4 < v.length && v[p] === 0xFF) {
            const m = v[p + 1]; if (m === 0xDA || m === 0xD9) break;
            const len = dv.getUint16(p + 2);
            if (m === 0xE2 && v[p + 4] === 0x4D && v[p + 5] === 0x50 && v[p + 6] === 0x46 && v[p + 7] === 0) {
                const t = p + 8, le = v[t] === 0x49;
                const g16 = o => dv.getUint16(t + o, le), g32 = o => dv.getUint32(t + o, le);
                const ifd = g32(4), n = g16(ifd);
                for (let i = 0; i < n; i++) {
                    const e = ifd + 2 + i * 12;
                    if (g16(e) === 0xB002) {
                        const cnt = g32(e + 4), off = g32(e + 8), res = [];
                        for (let j = 0; j < Math.floor(cnt / 16); j++) { const q = off + j * 16; res.push({ size: g32(q + 4), offset: j === 0 ? 0 : t + g32(q + 8) }); }
                        return res;
                    }
                }
                return null;
            }
            p += 2 + len;
        }
    } catch (e) { }
    return null;
}

function jpegOrientation(buf) {
    try {
        const v = new DataView(buf); let p = 2;
        while (p + 4 < v.byteLength && v.getUint8(p) === 0xFF) {
            const m = v.getUint8(p + 1); if (m === 0xDA) break;
            const len = v.getUint16(p + 2);
            if (m === 0xE1 && v.getUint32(p + 4) === 0x45786966) {
                const t = p + 10, le = v.getUint16(t) === 0x4949, ifd = v.getUint32(t + 4, le), n = v.getUint16(t + ifd, le);
                for (let i = 0; i < n; i++) { const e = t + ifd + 2 + i * 12; if (v.getUint16(e, le) === 0x0112) return v.getUint16(e + 8, le); }
                return 1;
            }
            p += 2 + len;
        }
    } catch (e) { }
    return 1;
}

async function looksLikeMPO(file) {
    const b = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    for (let i = 0; i + 3 < b.length; i++) if (b[i] === 0x4D && b[i+1] === 0x50 && b[i+2] === 0x46 && b[i+3] === 0x00) return true;
    return false;
}

// Split an MPO into its first two JPEGs (MPF index first, marker scan as fallback).
async function parseMPO(file) {
    const buffer = await file.arrayBuffer(), v = new Uint8Array(buffer);
    let b = -1, end = buffer.byteLength;
    const mp = readMpfOffsets(buffer);
    if (mp && mp.length >= 2 && mp[1].offset > 0 && v[mp[1].offset] === 0xFF && v[mp[1].offset + 1] === 0xD8) {
        b = mp[1].offset;
        const real = findJpegEnd(buffer, b);   // trust the real JPEG end: a file whose metadata was rewritten may keep an outdated MPF size
        end = real > 0 ? real : (mp[1].size > 0 ? Math.min(end, b + mp[1].size) : end);
    }
    if (b < 0) b = findSecondImageOffset(buffer);
    if (b <= 0) throw new Error("Could not split MPO.");
    return [buffer.slice(0, b), buffer.slice(b, end)];
}

// --- IMAGE PROCESSING ---
function loadImageAsync(src) {
    return new Promise((resolve, reject) => {
        const img = new Image(); img.decoding = 'async'; img.onerror = reject;
        img.onload = () => {   // decode the pixels now, off the main thread where the browser can, so the first drawing does not freeze the page
            if (typeof img.decode !== 'function') { resolve(img); return; }
            img.decode().then(() => resolve(img), () => resolve(img));   // if decode() fails, drawing still decodes it the usual way
        };
        img.src = src;
    });
}
function imgFromBuffer(buf) {
    const url = URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' }));
    return loadImageAsync(url).finally(() => URL.revokeObjectURL(url));
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function scaledCanvas(src, w, h) { const c = mkCanvas(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h); return c; }
function coverDraw(ctx, img, w, h) { // fills w x h without distortion (centre crop)
    const iw = img.width, ih = img.height;
    if (iw === w && ih === h) { ctx.drawImage(img, 0, 0); return; }
    const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
}

// Low-resolution copies drive every live view; full-resolution frames are only used for export.
function buildPreview() {   // called whenever the frames change
    scheduleAlignWarm();
    const w = frameL.width, h = frameL.height;
    pvScale = Math.min(1, PREVIEW_MAX / Math.max(w, h));
    if (pvScale >= 1) { pvScale = 1; pvL = frameL; pvR = frameR; return; }
    const pw = Math.max(2, Math.round(w * pvScale)), ph = Math.max(2, Math.round(h * pvScale));
    pvScale = pw / w; pvL = scaledCanvas(frameL, pw, ph); pvR = scaledCanvas(frameR, pw, ph);
}

function setAlignRange() {
    const lim = Math.max(200, Math.round(Math.max(frameL.width, frameL.height) * 0.1));
    [alignX, alignY].forEach(s => { s.min = -lim; s.max = lim; s.value = 0; });
    offsetX = 0; offsetY = 0; valX.innerText = "0"; valY.innerText = "0"; resetRS();
}

// 'Reset image' returns to this: the left-panel settings and the left/right order of the moment the photos were opened
const OPEN_SNAP_IDS = ['cropAspect', 'alignView', 'anaglyphMode', 'speedRange', 'interpolateCheck', 'floatSoft', 'gridToggle'];
let openSnap = null, swappedLR = false, resettingImage = false;
function finishFrames() {
    if (!resettingImage) {   // a newly opened pair
        swappedLR = false; openSnap = {};
        OPEN_SNAP_IDS.forEach(id => { const el = document.getElementById(id); if (el) openSnap[id] = el.type === 'checkbox' ? el.checked : el.value; });
    }
    view.z = 1; applyView(); colorBackup = null; indivReset(); buildPreview(); setAlignRange(); isAligning = false; toggleAdvanced.checked = false; alignmentPanel.style.display = 'none'; customCrop = { x: 0, y: 0, w: 1, h: 1 }; cropEditing = false; updateCropUI(); histReset(); pairFitUI(); if (!resettingImage && frameL.width * frameL.height > 36e6) setTimeout(() => showToast(`Very large photo (${Math.round(frameL.width * frameL.height / 1e6)} MP): exports may be slow, and some phones may run out of memory.`, true), 900); }

// Frees every full-size canvas of the current project (some browsers keep canvas memory until the size is dropped).
function releaseProject() {
    const seen = new Set(), drop = (c) => { if (c && c.getContext && !seen.has(c)) { seen.add(c); releaseCanvas(c); } };
    [frameL, frameR, pvL, pvR, indiv.base.L, indiv.base.R, pairSrc && pairSrc.L, pairSrc && pairSrc.R, pairStartBase && pairStartBase.L, pairStartBase && pairStartBase.R].forEach(drop);
    Object.values(indiv.cache || {}).forEach(e => drop(e && e.cv)); Object.values(indiv.gen || {}).forEach(e => drop(e && e.cv));
    if (sbsAl) { drop(sbsAl.L); drop(sbsAl.R); }
    Object.values(indiv.prep || {}).forEach(e => drop(e && e.cv)); indiv.prep = {};
    igForget();   // photos kept on the graphics card
    pairSrc = pairStartBase = pairInfo = null; pairFitUI();
}
function setFrames(imgL, imgR, rawL, rawR, mode) {   // mode: how photos of different sizes are fitted (21-pair-size.js); 'legacy' = what a project saved before 5.6 expects
    if (!busy) releaseProject();
    exifBuf = rawL || null;
    const cv = (im) => { const c = mkCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
    pairSrc = { L: cv(imgL), R: cv(imgR) };   // kept as opened: a later change of 'Size difference' or a turn starts from the whole photos
    if (mode === 'legacy') mode = pairCompare(pairSrc.L, pairSrc.R) === 'same' ? 'crop' : 'cover';
    pairMode = pairOpenMode = PAIR_LABEL[mode] ? mode : 'crop';
    pairStartBase = pairBases(pairSrc, pairMode); pairShow(pairStartBase.L, pairStartBase.R);
    // keep original bytes for a lossless MPO export when nothing was resampled
    const okRaw = rawL && rawR && imgR.width === imgL.width && imgR.height === imgL.height && jpegOrientation(rawL) === 1 && jpegOrientation(rawR) === 1;
    origL = okRaw ? rawL : null; origR = okRaw ? rawR : null;
    finishFrames();
}

function extractFromSingle(img, layout, jps) {   // jps: what a JPS file says about itself (squeezed halves are stretched back)
    if (!busy) releaseProject();
    let w, h, sa, sb;
    if (layout === 'tb' || layout === 'tb-r') { w = img.width; h = Math.floor(img.height / 2); sa = [0, 0]; sb = [0, h]; if (layout === 'tb-r') [sa, sb] = [sb, sa]; }
    else { w = Math.floor(img.width / 2); h = img.height; sa = [0, 0]; sb = [w, 0]; if (layout === 'cross') [sa, sb] = [sb, sa]; }
    const W = w * (jps && jps.halfW ? 2 : 1), H = h * (jps && jps.halfH ? 2 : 1);
    frameL = mkCanvas(W, H); frameR = mkCanvas(W, H);
    frameL.getContext('2d').drawImage(img, sa[0], sa[1], w, h, 0, 0, W, H);
    frameR.getContext('2d').drawImage(img, sb[0], sb[1], w, h, 0, 0, W, H);
    pairSrc = { L: frameL, R: frameR }; pairMode = pairOpenMode = 'crop'; pairStartBase = { L: frameL, R: frameR }; pairShow(frameL, frameR);   // two halves: always the same size
    origL = origR = exifBuf = null; finishFrames();
}

// --- JPS: a JPEG with the stereo layout written in an APP3 segment ("_JPSJPS_") ---
// Descriptor (32 bits, big-endian): separation | flags (1 half height, 2 half width, 4 left image first) | layout (2 side by
// side, 3 over/under) | media type (1 = stereo). Without "left first", a side-by-side JPS is cross-eyed (right image on the left).
const JPS_ID = '_JPSJPS_';
async function jpsRead(file) {   // { layout: 'sbs' | 'cross' | 'tb' | 'tb-r', halfW, halfH } or null (not a JPS, or a kind this program does not open)
    let b; try { b = new Uint8Array(await file.slice(0, 262144).arrayBuffer()); } catch (e) { return null; }
    if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
    for (let i = 2; i + 4 <= b.length;) {
        if (b[i] !== 0xFF) return null;
        const m = b[i + 1]; if (m === 0xFF) { i++; continue; }
        if (m === 0xDA || m === 0xD9) return null;   // picture data starts: no JPS header before it
        if ((m >= 0xD0 && m <= 0xD7) || m === 0x01) { i += 2; continue; }
        const len = (b[i + 2] << 8) | b[i + 3]; if (len < 2) return null;
        if (m === 0xE3 && len >= 16 && i + 18 <= b.length && String.fromCharCode(...b.subarray(i + 4, i + 12)) === JPS_ID) {
            const dl = (b[i + 12] << 8) | b[i + 13], fl = b[i + 15], lay = b[i + 16], type = b[i + 17];
            if (dl < 4 || type !== 1) return null;
            const half = { halfW: !!(fl & 2), halfH: !!(fl & 1) };
            if (lay === 2) return Object.assign({ layout: fl & 4 ? 'sbs' : 'cross' }, half);
            if (lay === 3) return Object.assign({ layout: fl & 4 ? 'tb' : 'tb-r' }, half);
            return null;
        }
        i += 2 + len;
    }
    return null;
}
// SBS export layouts a JPS can describe: [layout, flags]
const JPS_MODES = { 'full-sbs': [2, 4], 'half-sbs': [2, 4], 'half-sbs-ana': [2, 4 | 2], crosseye: [2, 0], 'top-bottom': [3, 4], 'half-tb': [3, 4], 'half-tb-ana': [3, 4 | 1] };
function jpsWrap(buf, mode) {   // the same JPEG with the JPS header added after its JFIF header
    const [lay, fl] = JPS_MODES[mode], src = new Uint8Array(buf), note = APP.name;
    const seg = new Uint8Array(4 + 8 + 2 + 4 + 2 + note.length); let o = 0; const put = (...v) => v.forEach(x => { seg[o++] = x; });
    put(0xFF, 0xE3, (seg.length - 2) >> 8, (seg.length - 2) & 255); for (const c of JPS_ID) put(c.charCodeAt(0));
    put(0, 4, 0, fl, lay, 1, 0, note.length); for (const c of note) put(c.charCodeAt(0) & 127);
    let at = 2; while (at + 4 <= src.length && src[at] === 0xFF && src[at + 1] === 0xE0) at += 2 + ((src[at + 2] << 8) | src[at + 3]);
    const out = new Uint8Array(src.length + seg.length); out.set(src.subarray(0, at)); out.set(seg, at); out.set(src.subarray(at), at + seg.length); return out;
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
