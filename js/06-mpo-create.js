/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- MPO CREATION ---
async function makeThumb(cv) {   // small JPEG preview for the EXIF thumbnail (null if disabled or it fails)
    if (!MPO_OPTS.thumbnail) return null;
    try {
        const k = MPO_OPTS.thumbSize / Math.max(cv.width, cv.height);
        const t = scaledCanvas(cv, Math.max(1, Math.round(cv.width * k)), Math.max(1, Math.round(cv.height * k)));
        for (const q of [0.8, 0.6, 0.4]) { const b = new Uint8Array(await canvasToJpegBuffer(t, q)); if (b.length < 60000) return b; }   // must fit the 64 KB EXIF segment
        return null;
    } catch (e) { return null; }
}
function canvasToJpegBuffer(canvas, q) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(b => { if (!b) { reject(new Error('image too large for this browser')); return; } b.arrayBuffer().then(resolve, reject); }, 'image/jpeg', q || MPO_OPTS.quality);
    });
}

function splitJpeg(jpeg) {
    const v = new Uint8Array(jpeg); let p = 2; const segs = []; let w = 0, h = 0;
    while (p + 3 < v.length) {
        if (v[p] !== 0xFF) throw new Error('Invalid JPEG');
        const m = v[p + 1]; if (m === 0xDA) break;
        const len = (v[p + 2] << 8) | v[p + 3];
        if (m >= 0xC0 && m <= 0xC2) { h = (v[p + 5] << 8) | v[p + 6]; w = (v[p + 7] << 8) | v[p + 8]; }
        const isMpf = m === 0xE2 && v[p + 4] === 0x4D && v[p + 5] === 0x50 && v[p + 6] === 0x46 && v[p + 7] === 0;   // drop old MPF, a new one is written
        if (m !== 0xE0 && m !== 0xE1 && !isMpf) segs.push(v.subarray(p, p + 2 + len));
        p += 2 + len;
    }
    return { segs, scan: v.subarray(p), w, h };
}

// ---- MPO build options (turn flags off to test variants on picky viewers) ----
const MPO_OPTS = {
    disparityType: true,   // image type codes = Multi-frame "Disparity" (0x020002), the code used by 3D cameras
    attrIFD: true,         // write the MP Attribute IFD in BOTH images (image 1 too, as CIPA DC-007 expects)
    geometry: true,        // BaseViewpointNum / ConvergenceAngle / BaselineLength tags
    thumbnail: true,       // embed a small preview in each image's EXIF (file browsers use it)
    thumbSize: 160,        // thumbnail longest side in pixels
    quality: 0.95,         // JPEG quality used when the images must be re-encoded
    baselineMm: 65,        // stereo baseline length in millimetres
    make: APP.name,                 // used only when the source has no camera info
    model: APP.label,
    software: APP.label
};

// Generic little-endian TIFF IFD writer.
// entries: {tag, type, v}  type: 1 BYTE, 2 ASCII (string), 3 SHORT, 4 LONG, 5 RATIONAL [[n,d]], 7 UNDEFINED (bytes), 10 SRATIONAL [[n,d]]
// 'start' = offset of this IFD from the TIFF header; values > 4 bytes go right after the IFD.
function tiffIfd(entries, start, nextIfd) {
    const TS = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 };
    const list = entries.slice().sort((a, b) => a.tag - b.tag).map(e => {
        let v = e.v;
        if (e.type === 2) { v = Array.from(v).map(c => c.charCodeAt(0) & 0x7F); v.push(0); }
        else if (typeof v === 'number') v = [v];
        const count = v.length;
        const bytes = new Uint8Array(count * TS[e.type]); const dv = new DataView(bytes.buffer);
        v.forEach((x, i) => {
            if (e.type === 3) dv.setUint16(i * 2, x, true);
            else if (e.type === 4) dv.setUint32(i * 4, x >>> 0, true);
            else if (e.type === 5) { dv.setUint32(i * 8, x[0] >>> 0, true); dv.setUint32(i * 8 + 4, x[1] >>> 0, true); }
            else if (e.type === 10) { dv.setInt32(i * 8, x[0], true); dv.setInt32(i * 8 + 4, x[1], true); }
            else bytes[i] = x;
        });
        return { tag: e.tag, type: e.type, count, bytes };
    });
    const ifdLen = 2 + 12 * list.length + 4;
    let dataLen = 0; list.forEach(e => { if (e.bytes.length > 4) dataLen += e.bytes.length + (e.bytes.length & 1); });
    const out = new Uint8Array(ifdLen + dataLen); const dv = new DataView(out.buffer);
    dv.setUint16(0, list.length, true);
    let dp = ifdLen;
    list.forEach((e, i) => {
        const p = 2 + i * 12;
        dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true); dv.setUint32(p + 4, e.count, true);
        if (e.bytes.length <= 4) out.set(e.bytes, p + 8);
        else { dv.setUint32(p + 8, start + dp, true); out.set(e.bytes, dp); dp += e.bytes.length + (e.bytes.length & 1); }
    });
    dv.setUint32(2 + 12 * list.length, nextIfd || 0, true);
    return out;
}

function tiffSegment(marker, prefix, ifdBytes) {
    // marker(2) + length(2) + prefix + TIFF header(8) + IFD data
    const len = 2 + prefix.length + 8 + ifdBytes.length;
    const out = new Uint8Array(2 + len); const dv = new DataView(out.buffer);
    dv.setUint16(0, marker, false); dv.setUint16(2, len, false);
    out.set(prefix, 4);
    const t = 4 + prefix.length;
    out.set([0x49, 0x49, 0x2A, 0x00], t); dv.setUint32(t + 4, 8, true);
    out.set(ifdBytes, t + 8);
    return out;
}

// Reads a whitelist of EXIF tags (camera, exposure, lens). GPS is deliberately NOT copied (privacy).
function readExifTags(buf) {
    const out = { ifd0: {}, exif: {} };
    try {
        const v = new DataView(buf); let p = 2;
        while (p + 4 < v.byteLength && v.getUint8(p) === 0xFF) {
            const m = v.getUint8(p + 1); if (m === 0xDA) break; const len = v.getUint16(p + 2);
            if (m === 0xE1 && v.getUint32(p + 4) === 0x45786966) {
                const t = p + 10, le = v.getUint16(t) === 0x4949, g16 = o => v.getUint16(t + o, le), g32 = o => v.getUint32(t + o, le);
                const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
                const rd = (ifd, dst, want, ptrOut) => {
                    const n = g16(ifd);
                    for (let i = 0; i < n; i++) {
                        const e = ifd + 2 + i * 12, tag = g16(e), ty = g16(e + 2), c = g32(e + 4);
                        if (tag === 0x8769 && ptrOut) ptrOut.ptr = g32(e + 8);
                        if (!want.includes(tag) || !SZ[ty] || c < 1 || c > 256) continue;   // only a few known tags are read; long values are still bounded
                        const sz = SZ[ty] * c, pos = sz > 4 ? t + g32(e + 8) : t + e + 8; let val;
                        if (ty === 2) { val = ''; for (let k = 0; k < c - 1; k++) val += String.fromCharCode(v.getUint8(pos + k)); }
                        else if (ty === 3) { val = []; for (let k = 0; k < c; k++) val.push(v.getUint16(pos + k * 2, le)); }
                        else if (ty === 4) { val = []; for (let k = 0; k < c; k++) val.push(v.getUint32(pos + k * 4, le)); }
                        else if (ty === 5) { val = []; for (let k = 0; k < c; k++) val.push([v.getUint32(pos + k * 8, le), v.getUint32(pos + k * 8 + 4, le)]); }
                        else continue;
                        dst[tag] = { type: ty, v: val };
                    }
                };
                const po = {}; rd(g32(4), out.ifd0, [0x010F, 0x0110, 0x0131], po);
                if (po.ptr) rd(po.ptr, out.exif, [0x829A, 0x829D, 0x8827, 0x9003, 0x920A, 0xA434]);
                return out;
            }
            p += 2 + len;
        }
    } catch (e) { }
    return out;
}

function buildExifSegment(w, h, src, thumb) {
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}:${p2(d.getMonth() + 1)}:${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    const o = (src && MPO_OPTS.camera !== false) ? readExifTags(src) : { ifd0: {}, exif: {} };
    const isOurs = (v) => { v = String(v || '').toLowerCase(); return [APP.name, APP.id, 'wigglegram studio', 'web 3d / wigglegram'].some(n => n && v.startsWith(n.toLowerCase())); };
    if (isOurs(o.ifd0[0x0131] && o.ifd0[0x0131].v) || isOurs(o.ifd0[0x010F] && o.ifd0[0x010F].v)) { delete o.ifd0[0x010F]; delete o.ifd0[0x0110]; }   // a file made by this program (any version): use the CURRENT identity, not the old one
    const keep = (map, tag, fb) => map[tag] ? { tag, type: map[tag].type, v: map[tag].v } : fb;
    const taken = o.exif[0x9003] ? o.exif[0x9003].v : stamp;
    const ifd0 = (ptr, nxt) => tiffIfd([
        keep(o.ifd0, 0x010F, { tag: 0x010F, type: 2, v: MPO_OPTS.make }),
        keep(o.ifd0, 0x0110, { tag: 0x0110, type: 2, v: MPO_OPTS.model }),
        { tag: 0x0112, type: 3, v: 1 },
        { tag: 0x011A, type: 5, v: [[72, 1]] },
        { tag: 0x011B, type: 5, v: [[72, 1]] },
        { tag: 0x0128, type: 3, v: 2 },
        { tag: 0x0131, type: 2, v: MPO_OPTS.software },
        { tag: 0x0132, type: 2, v: stamp },
        { tag: 0x0213, type: 3, v: 1 },
        { tag: 0x8769, type: 4, v: ptr }
    ], 8, nxt || 0);
    const exifStart = 8 + ifd0(0, 0).length;
    const ex = [
        { tag: 0x9000, type: 7, v: [0x30, 0x32, 0x33, 0x30] },
        { tag: 0x9003, type: 2, v: taken },
        { tag: 0x9004, type: 2, v: taken },
        { tag: 0x9101, type: 7, v: [1, 2, 3, 0] },
        { tag: 0xA000, type: 7, v: [0x30, 0x31, 0x30, 0x30] },
        { tag: 0xA001, type: 3, v: 1 },
        { tag: 0xA002, type: 4, v: w },
        { tag: 0xA003, type: 4, v: h }
    ];
    [0x829A, 0x829D, 0x8827, 0x920A, 0xA434].forEach(t => { if (o.exif[t]) ex.push(keep(o.exif, t)); });
    const exifIfd = tiffIfd(ex, exifStart, 0);
    const ifd1Start = exifStart + exifIfd.length, useTh = !!(thumb && thumb.length && thumb.length < 60000);   // APP1 holds at most 64 KB
    const ifd0b = ifd0(exifStart, useTh ? ifd1Start : 0);
    let ifd1 = new Uint8Array(0);
    if (useTh) {   // IFD1 = the thumbnail: JPEG-compressed, with offset and length of the bytes that follow it
        const mk = off => tiffIfd([
            { tag: 0x0103, type: 3, v: 6 }, { tag: 0x011A, type: 5, v: [[72, 1]] }, { tag: 0x011B, type: 5, v: [[72, 1]] }, { tag: 0x0128, type: 3, v: 2 },
            { tag: 0x0201, type: 4, v: off }, { tag: 0x0202, type: 4, v: thumb.length }
        ], ifd1Start, 0);
        ifd1 = mk(ifd1Start + mk(0).length);
    }
    const all = new Uint8Array(ifd0b.length + exifIfd.length + ifd1.length + (useTh ? thumb.length : 0));
    all.set(ifd0b, 0); all.set(exifIfd, ifd0b.length); all.set(ifd1, ifd0b.length + exifIfd.length); if (useTh) all.set(thumb, ifd0b.length + exifIfd.length + ifd1.length);
    return tiffSegment(0xFFE1, [0x45, 0x78, 0x69, 0x66, 0, 0], all);
}

// MP Attribute IFD (one per image). num = this image's 1-based number.
function mpAttrIfd(num, start, next) {
    const e = [
        { tag: 0xB000, type: 7, v: [0x30, 0x31, 0x30, 0x30] },
        { tag: 0xB101, type: 4, v: num }
    ];
    if (MPO_OPTS.geometry) {
        e.push({ tag: 0xB204, type: 4, v: 1 });                                   // Base viewpoint = image 1
        e.push({ tag: 0xB205, type: 10, v: [[0, 1]] });                           // Convergence angle (parallel)
        e.push({ tag: 0xB206, type: 5, v: [[Math.round(MPO_OPTS.baselineMm * 1000), 1000]] }); // Baseline (mm)
    }
    return tiffIfd(e, start, next);
}

const MPF_SIG = [0x4D, 0x50, 0x46, 0x00];

// First image: Index IFD (+ Attribute IFD). Other images: Attribute IFD only.
function buildMpfSegment(isIndex, num, size1, size2, offset2) {
    if (!isIndex) return tiffSegment(0xFFE2, MPF_SIG, mpAttrIfd(num, 8, 0));
    const D = MPO_OPTS.disparityType;
    const ent = new Uint8Array(32); const ev = new DataView(ent.buffer);
    ev.setUint32(0, D ? 0x20020002 : 0x20030000, true); ev.setUint32(4, size1, true); ev.setUint32(8, 0, true);
    ev.setUint32(16, D ? 0x00020002 : 0x00000000, true); ev.setUint32(20, size2, true); ev.setUint32(24, offset2, true);
    const index = next => tiffIfd([
        { tag: 0xB000, type: 7, v: [0x30, 0x31, 0x30, 0x30] },
        { tag: 0xB001, type: 4, v: 2 },
        { tag: 0xB002, type: 7, v: Array.from(ent) }
    ], 8, next);
    if (!MPO_OPTS.attrIFD) return tiffSegment(0xFFE2, MPF_SIG, index(0));
    const attrStart = 8 + index(0).length;
    const idx = index(attrStart), at = mpAttrIfd(1, attrStart, 0);
    const all = new Uint8Array(idx.length + at.length); all.set(idx, 0); all.set(at, idx.length);
    return tiffSegment(0xFFE2, MPF_SIG, all);
}

function createMPOBuffer(jpeg1, jpeg2, exifSrc, th1, th2) {
    const a = splitJpeg(jpeg1), b = splitJpeg(jpeg2);
    const exif1 = buildExifSegment(a.w, a.h, exifSrc, th1), exif2 = buildExifSegment(b.w, b.h, exifSrc, th2);
    const bodyLen = x => x.segs.reduce((t, s) => t + s.length, 0) + x.scan.length;
    const mpf2 = buildMpfSegment(false, 2);
    const mpf1Len = buildMpfSegment(true, 1, 0, 0, 0).length; // length does not depend on the values
    const size1 = 2 + exif1.length + mpf1Len + bodyLen(a);
    const size2 = 2 + exif2.length + mpf2.length + bodyLen(b);
    const mpfTiffPos = 2 + exif1.length + 8;               // offsets are relative to the "II*\0" header
    const mpf1 = buildMpfSegment(true, 1, size1, size2, size1 - mpfTiffPos);
    const out = new Uint8Array(size1 + size2); let o = 0;
    const put = arr => { out.set(arr, o); o += arr.length; };
    [[exif1, mpf1, a], [exif2, mpf2, b]].forEach(([ex, mpf, x]) => {
        put([0xFF, 0xD8]); put(ex); put(mpf); x.segs.forEach(put); put(x.scan);
    });
    return out.buffer;
}

document.getElementById('btnExportMPO').addEventListener('click', (e) => {
    withBusy(e.currentTarget, 'Generating MPO...', 'MPO', async () => {
        const c = getCropRect(false); let j1, j2, sL, sR;
        if (!c.fallback && rotDeg === 0 && floatPct === 0 && scaleK === 1 && c.w === frameL.width && c.h === frameL.height && c.dx === 0 && c.dy === 0 && origL && origR) { j1 = origL; j2 = origR; sL = pvL; sR = pvR; }   // lossless: original JPEG bytes
        else { const al = getAlignedFrames(false); [j1, j2] = await Promise.all([canvasToJpegBuffer(al.L), canvasToJpegBuffer(al.R)]); sL = al.L; sR = al.R; }
        const [t1, t2] = await Promise.all([makeThumb(sL), makeThumb(sR)]);
        if (sL !== pvL) { releaseCanvas(sL); releaseCanvas(sR); }   // temporary aligned copies (never the live previews)
        const e1 = findJpegEnd(j1, 0), e2 = findJpegEnd(j2, 0);
        const mpo = createMPOBuffer(e1 > 0 ? j1.slice(0, e1) : j1, e2 > 0 ? j2.slice(0, e2) : j2, exifBuf, t1, t2);
        await saveBlob(new Blob([mpo], { type: 'image/mpo' }), prefFileName('mpo', 'mpo'));
        showToast("MPO Image saved successfully!");
    });
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
