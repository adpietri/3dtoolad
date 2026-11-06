/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- CPU on several cores (Web Workers) ---
// Used when the graphics card cannot do the work (no WebGL2, or a photo too big for it). The photo is cut into horizontal
// bands, one per core, each worker runs the very same functions as the single-core code (sent as text, so they cannot
// drift apart), and the bands are put back together. One core, no Web Workers, a failed check or any error: single-core code.
const PAR = { tried: false, ok: false, n: 0, ws: [], url: null, seq: 0, rr: 0, wait: new Map(), check: null, good: false, why: '' };
function parSource() {
    return [geoRows, adjPixelsCore, boxBlur, clarityPassRQ, hslApplyPixels].map(f => f.toString()).join('\n') + `
    function lut3(d, L) { for (let i = 0; i < d.length; i += 4) { d[i] = L[0][d[i]]; d[i + 1] = L[1][d[i + 1]]; d[i + 2] = L[2][d[i + 2]]; } }
    self.onmessage = function (e) {
        const m = e.data;
        try {
            const w = m.w, rows = m.hy1 - m.hy0; let reg;
            if (m.P) { reg = new Uint8ClampedArray(w * rows * 4); if (!geoRows(m.src, m.sy0, m.src.length / (w * 4), w, m.h, m.P, m.hy0, m.hy1, reg)) { self.postMessage({ id: m.id, fail: 'rows' }); return; } }
            else reg = m.src;
            if (m.adj) adjPixelsCore(reg, m.adj.lut, m.adj.rg, m.adj.gg, m.adj.bg, m.adj.sat, m.adj.vib);
            if (m.clar) clarityPassRQ(reg, w, rows, m.clar.amt, m.clar.r, m.clar.q);
            const core = (m.y0 === m.hy0 && m.y1 === m.hy1) ? reg : reg.slice((m.y0 - m.hy0) * w * 4, (m.y1 - m.hy0) * w * 4);
            if (m.curve) lut3(core, m.curve);
            if (m.hsl) hslApplyPixels(core, m.hsl);
            if (m.luts) lut3(core, m.luts);
            self.postMessage({ id: m.id, out: core }, [core.buffer]);
        } catch (err) { self.postMessage({ id: m.id, fail: String((err && err.message) || err) }); }
    };`;
}
function parStop(why) {   // single-core from now on
    PAR.ok = false; PAR.good = false; if (why) PAR.why = why;
    PAR.ws.forEach(wk => { try { wk.terminate(); } catch (e) { } }); PAR.ws = [];
    if (PAR.url) { URL.revokeObjectURL(PAR.url); PAR.url = null; }
    PAR.wait.forEach(j => j.reject(new Error(PAR.why || 'stopped'))); PAR.wait.clear();
}
function parInit() {
    if (PAR.tried) return PAR.ok;
    PAR.tried = true;
    try {
        const n = Math.min(8, Number(navigator.hardwareConcurrency) || 0);
        if (n < 2) throw new Error('one processor core');
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined') throw new Error('no Web Workers');
        PAR.url = URL.createObjectURL(new Blob([parSource()], { type: 'application/javascript' }));
        for (let i = 0; i < n; i++) {
            const wk = new Worker(PAR.url);
            wk.onmessage = (e) => { const m = e.data, j = PAR.wait.get(m.id); if (!j) return; PAR.wait.delete(m.id); if (m.fail) j.reject(new Error(m.fail)); else j.resolve(m.out); };
            wk.onerror = (e) => { e.preventDefault && e.preventDefault(); parStop('worker error'); };
            PAR.ws.push(wk);
        }
        PAR.n = n; PAR.ok = true;
    } catch (e) { parStop(e.message || String(e)); }
    return PAR.ok;
}
function parReady() {   // Promise<boolean>: pool made and checked once against the single-core code
    if (!parInit()) return Promise.resolve(false);
    if (!PAR.check) PAR.check = (async () => {
        const w = 61, h = 45, src = mkCanvas(w, h), x = src.getContext('2d'), id = x.createImageData(w, h), d = id.data;
        for (let y = 0, i = 0; y < h; y++) for (let k = 0; k < w; k++, i += 4) { d[i] = (k * 9 + y * 2) % 256; d[i + 1] = (y * 13 + k) % 256; d[i + 2] = (255 - k * 4) & 255; d[i + 3] = 255; }
        x.putImageData(id, 0, 0);
        const st = indivNewSt(); st.rot = 3; st.geo = { straighten: -3, keyV: 15, keyH: 10, lens: -12 };
        Object.assign(st.adj, { exposure: 15, contrast: 10, saturation: -20, vibrance: 25, shadows: 15, highlights: -10, temperature: -25, tint: 15, clarity: 55 });
        st.curve = { rgb: [10, 0, -10, 5], r: [0, 5, 0, 0], g: [0, 0, 0, -6], b: [8, 0, 0, 0], pts: { rgb: [[0, 0], [255, 255]], r: [[0, 20], [140, 150], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [200, 180], [255, 240]] } }; st.hsl = BANDS.map((b, i) => [(i * 23) % 40 - 20, (i * 41) % 60 - 30, (i * 17) % 30 - 15]);
        const luts = [0, 1, 2].map(ch => Uint8ClampedArray.from({ length: 256 }, (v, i) => Math.min(255, Math.round(i * (0.9 + ch * 0.06)))));
        const par = await parRun(src, st, false, luts, true, 4), one = indivApplyLutsCPU(indivRenderCPU(src, st, false, true), luts, true);   // canvases made for reading
        if (!par) return false;
        const a = par.getContext('2d').getImageData(0, 0, par.width, par.height).data, b = one.getContext('2d').getImageData(0, 0, one.width, one.height).data;
        if (a.length !== b.length) return false;
        let far = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1) far++;
        return far <= a.length * 0.002;
    })().then(ok => { PAR.good = ok; if (!ok) parStop('self-test mismatch'); return ok; }, (e) => { parStop(e.message || String(e)); return false; });
    return PAR.check;
}
const parUsable = () => PAR.ok && PAR.good && DBG.force !== 'single';   // ready and checked (otherwise the single-core code runs this time)
function parJob(msg, transfer) {
    return new Promise((resolve, reject) => {
        if (!PAR.ok || !PAR.ws.length) { reject(new Error('no workers')); return; }
        const id = ++PAR.seq; PAR.wait.set(id, { resolve, reject }); msg.id = id;
        PAR.ws[PAR.rr++ % PAR.ws.length].postMessage(msg, transfer);
    });
}
// Same result as indivRenderCPU (+ indivApplyLutsCPU when luts are given), computed in bands on all cores.
// Returns a canvas, or null (nothing to do, or it could not be done this way: the caller runs the single-core code).
async function parRun(src0, st0, before, luts, rf, bands) {
    const st = st0 ? JSON.parse(JSON.stringify(st0)) : null;   // the settings at the time of the request (sliders may move meanwhile)
    const geo = !!st && !geoZero(st.geo), adj = !!st && !before && !adjZero(st.adj), curve = !!st && !before && !curveZero(st.curve), hsl = !!st && !before && st.hsl.some(b => b[0] || b[1] || b[2]);
    if ((!geo && !adj && !curve && !hsl && !luts) || !PAR.ok) return null;
    const c = st ? indivRotateCanvas(src0, st.rot, rf) : src0, w = c.width, h = c.height;
    const out = mkCanvas(w, h), x = ctx2d(out, rf); x.drawImage(c, 0, 0); if (c !== src0) releaseCanvas(c);
    const id = x.getImageData(0, 0, w, h), d = id.data;
    const clar = adj && st.adj.clarity ? st.adj.clarity / 100 : 0, [cr, q] = clarityRQ(w, h), rq = q === 1 ? cr : Math.max(1, Math.round(cr / q)), halo = clar ? (3 * rq + 2) * q : 0;
    const P = geo ? geoParams(st.geo, w, h) : null, A = adj ? adjParams(st.adj) : null;
    const common = { w, h, P, adj: A ? { lut: A.lut, rg: A.rg, gg: A.gg, bg: A.bg, sat: A.sat, vib: A.vib } : null, clar: clar ? { amt: clar, r: cr, q } : null,
        curve: curve ? curveLuts(st.curve) : null, hsl: hsl ? hslLut(st.hsl) : null, luts: luts || null };
    const nb = Math.max(1, Math.min(bands || PAR.n, Math.floor(h / 8))), step = Math.max(q, Math.ceil(h / nb / q) * q), jobs = [];
    const srcRows = (hy0, hy1) => {   // source rows the geometry needs for these result rows (checked again by the worker)
        if (!P) return [hy0, hy1];
        const k = P.s / P.R; let lo = h, hi = 0;
        for (let y = hy0; y < hy1; y++) {
            const v = (y + 0.5 - P.cy) * k;
            for (let i = 0; i <= 64; i++) {
                const xx = Math.min(w - 1, Math.round(i * (w - 1) / 64)), u = (xx + 0.5 - P.cx) * k, a = u * P.co - v * P.si, b = u * P.si + v * P.co, a2 = a * (1 + P.kv * b), b2 = b * (1 + P.kh * a), f = 1 + P.kl * (a2 * a2 + b2 * b2);
                const sy = Math.min(h - 1, Math.max(0, P.cy + b2 * f * P.R - 0.5)); if (sy < lo) lo = sy; if (sy > hi) hi = sy;
            }
        }
        return [Math.max(0, Math.floor(lo) - 3), Math.min(h, Math.floor(hi) + 5)];
    };
    for (let y0 = 0; y0 < h; y0 += step) {
        const y1 = Math.min(h, y0 + step), hy0 = clar ? Math.floor(Math.max(0, y0 - halo) / q) * q : y0, hy1 = clar ? Math.min(h, Math.ceil((y1 + halo) / q) * q) : y1;
        const [sa, sb] = srcRows(hy0, hy1), part = d.slice(sa * w * 4, sb * w * 4);
        jobs.push(parJob(Object.assign({ src: part, sy0: P ? sa : hy0, hy0, hy1, y0, y1 }, common), [part.buffer]).then(res => ({ y0, res })));
    }
    try {
        const done = await Promise.all(jobs);
        done.forEach(j => d.set(j.res, j.y0 * w * 4));
        x.putImageData(id, 0, 0); return out;
    } catch (e) {
        if (e.message !== 'rows') console.info('Multi-core editing failed, using one core:', e.message || e);
        releaseCanvas(out); return null;
    }
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
