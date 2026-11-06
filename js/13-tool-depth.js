/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// === TOOLS: extra tools in their own window (header button next to "?") ===
// --- Depth map from the stereo pair: AD-Census matching cost + Semi-Global Matching (8 directions), left-right check,
//     speckle removal, occlusion filling and an edge-aware (joint bilateral) filter. Runs in a background worker. ---
function depthWorkerMain() {
    const pc = (v) => { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
    const ok = (v) => v === v;   // not NaN
    function census(I, w, h) {   // 5 x 5 census: which neighbours are darker than the centre (robust to brightness differences)
        const C = new Uint32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const c = I[y * w + x]; let b = 0;
            for (let dy = -2; dy <= 2; dy++) {
                const yy = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
                for (let dx = -2; dx <= 2; dx++) { if (!dx && !dy) continue; const xx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx; b = (b << 1) | (I[yy * w + xx] < c ? 1 : 0); }
            }
            C[y * w + x] = b >>> 0;
        }
        return C;
    }
    function costVolume(L, R, CL, CR, w, h, dmin, D) {   // census distance x3 + clipped intensity difference: 0..96; best of rows y-1..y+1 (pairs are rarely aligned to the exact pixel)
        const C = new Uint8Array(w * h * D);
        for (let y = 0; y < h; y++) {
            const rows = [y, y > 0 ? y - 1 : y, y < h - 1 ? y + 1 : y];
            for (let x = 0; x < w; x++) {
                const p = y * w + x, cl = CL[p], il = L[p], o = p * D;
                for (let i = 0; i < D; i++) {
                    let xr = x - (dmin + i); if (xr < 0) xr = 0; else if (xr >= w) xr = w - 1;
                    let best = 255;
                    for (let r = 0; r < 3; r++) { const q = rows[r] * w + xr, ad = Math.abs(il - R[q]), c = pc(cl ^ CR[q]) * 3 + (ad > 95 ? 24 : ad >> 2) + (r ? 4 : 0); if (c < best) best = c; }
                    C[o + i] = best > 96 ? 96 : best;
                }
            }
        }
        return C;
    }
    function sgm(C, I, w, h, D, P1, P2, prog) {   // Semi-Global Matching along 8 directions (Hirschmüller)
        const S = new Uint16Array(w * h * D), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
        let Lp = new Int16Array(w * D), Lc = new Int16Array(w * D), Mp = new Int16Array(w), Mc = new Int16Array(w);
        dirs.forEach(([dx, dy], k) => {
            const sy = dy >= 0 ? 1 : -1, sx = dx >= 0 ? 1 : -1, ye = dy >= 0 ? h : -1, xe = dx >= 0 ? w : -1;
            for (let y = dy >= 0 ? 0 : h - 1; y !== ye; y += sy) {
                for (let x = dx >= 0 ? 0 : w - 1; x !== xe; x += sx) {
                    const p = y * w + x, o = p * D, lo = x * D, px = x - dx, py = y - dy; let mn = 32767;
                    if (px < 0 || px >= w || py < 0 || py >= h) {
                        for (let i = 0; i < D; i++) { const v = C[o + i]; Lc[lo + i] = v; S[o + i] += v; if (v < mn) mn = v; }
                    } else {
                        const B = dy === 0 ? Lc : Lp, mp = dy === 0 ? Mc[px] : Mp[px], bo = px * D;
                        const g = Math.abs(I[p] - I[py * w + px]), p2 = Math.max(P1 + 1, Math.round(P2 / (1 + g / 10)));   // depth may jump at image edges
                        for (let i = 0; i < D; i++) {
                            let best = B[bo + i];
                            if (i > 0 && B[bo + i - 1] + P1 < best) best = B[bo + i - 1] + P1;
                            if (i < D - 1 && B[bo + i + 1] + P1 < best) best = B[bo + i + 1] + P1;
                            if (mp + p2 < best) best = mp + p2;
                            const v = C[o + i] + best - mp; Lc[lo + i] = v; S[o + i] += v; if (v < mn) mn = v;
                        }
                    }
                    Mc[x] = mn;
                }
                let t = Lp; Lp = Lc; Lc = t; t = Mp; Mp = Mc; Mc = t;
            }
            if (prog) prog((k + 1) / dirs.length);
        });
        return S;
    }
    function wta(S, w, h, D, dmin) {   // best disparity, rejected when not clearly better than the others; sub-pixel refinement
        const disp = new Float32Array(w * h);
        for (let p = 0; p < w * h; p++) {
            const o = p * D; let b = 0, bv = S[o];
            for (let i = 1; i < D; i++) if (S[o + i] < bv) { bv = S[o + i]; b = i; }
            let sv = 65535; for (let i = 0; i < D; i++) if ((i < b - 1 || i > b + 1) && S[o + i] < sv) sv = S[o + i];
            if (sv < 65535 && (sv - bv) * 100 < bv * 4) { disp[p] = NaN; continue; }
            let d = b;
            if (b > 0 && b < D - 1) { const a = S[o + b - 1], c = S[o + b + 1], den = a - 2 * bv + c; if (den > 0) d = b + (a - c) / (2 * den); }
            disp[p] = d + dmin;
        }
        return disp;
    }
    function lrCheck(S, disp, w, h, D, dmin) {   // the right image must agree: hides occlusions and mismatches
        const dR = new Float32Array(w);
        for (let y = 0; y < h; y++) {
            for (let xr = 0; xr < w; xr++) {
                let b = -1, bv = 65535;
                for (let i = 0; i < D; i++) { const xl = xr + dmin + i; if (xl < 0 || xl >= w) continue; const v = S[(y * w + xl) * D + i]; if (v < bv) { bv = v; b = i; } }
                dR[xr] = b < 0 ? NaN : b + dmin;
            }
            for (let x = 0; x < w; x++) {
                const p = y * w + x, d = disp[p]; if (!ok(d)) continue;
                const xr = Math.round(x - d); if (xr < 0 || xr >= w || !(Math.abs(dR[xr] - d) <= 2)) disp[p] = NaN;
            }
        }
    }
    function speckles(disp, w, h, maxSize, diff) {   // small islands that disagree with their surroundings are errors
        const lab = new Uint8Array(w * h), list = new Int32Array(w * h);
        for (let s = 0; s < w * h; s++) {
            if (lab[s] || !ok(disp[s])) continue;
            let head = 0, tail = 0; list[tail++] = s; lab[s] = 1;
            while (head < tail) {
                const p = list[head++], x = p % w, d = disp[p];
                const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
                for (const q of nb) if (q >= 0 && q < w * h && !lab[q] && ok(disp[q]) && Math.abs(disp[q] - d) <= diff) { lab[q] = 1; list[tail++] = q; }
            }
            if (tail < maxSize) for (let i = 0; i < tail; i++) disp[list[i]] = NaN;
        }
    }
    function fill(disp, w, h) {
        const gap = Math.max(4, Math.round(w / 60));
        for (let y = 0; y < h; y++) {   // short gaps (hidden areas beside a near object): the farther of the two neighbours
            const r = y * w; let x = 0;
            while (x < w) {
                if (ok(disp[r + x])) { x++; continue; }
                let e = x; while (e < w && !ok(disp[r + e])) e++;
                const a = x > 0 ? disp[r + x - 1] : NaN, b = e < w ? disp[r + e] : NaN;
                if (e - x <= gap && (ok(a) || ok(b))) { const v = ok(a) && ok(b) ? Math.min(a, b) : ok(a) ? a : b; for (let k = x; k < e; k++) disp[r + k] = v; }
                x = e;
            }
        }
        pushPull(disp, w, h);   // bigger areas (smooth water, sky...): smoothly from all sides, no streaks
    }
    function pushPull(d, w, h) {   // fills NaN from coarser and coarser averages of the known values, then back down
        const lv = [{ v: d, w, h }];
        while (lv[lv.length - 1].w > 2 || lv[lv.length - 1].h > 2) {
            const a = lv[lv.length - 1], W = Math.max(1, Math.ceil(a.w / 2)), H = Math.max(1, Math.ceil(a.h / 2)), v = new Float32Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                let s = 0, n = 0;
                for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const yy = 2 * y + j, xx = 2 * x + i; if (yy < a.h && xx < a.w) { const t = a.v[yy * a.w + xx]; if (ok(t)) { s += t; n++; } } }
                v[y * W + x] = n ? s / n : NaN;
            }
            lv.push({ v, w: W, h: H });
            if (W === 1 && H === 1) break;
        }
        const top = lv[lv.length - 1]; for (let i = 0; i < top.v.length; i++) if (!ok(top.v[i])) top.v[i] = 0;
        for (let k = lv.length - 2; k >= 0; k--) {
            const a = lv[k], c = lv[k + 1];
            for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
                const p = y * a.w + x; if (ok(a.v[p])) continue;
                const fy = Math.min(c.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5)), fx = Math.min(c.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), y0 = fy | 0, x0 = fx | 0, y1 = Math.min(c.h - 1, y0 + 1), x1 = Math.min(c.w - 1, x0 + 1), ty = fy - y0, tx = fx - x0;
                a.v[p] = (c.v[y0 * c.w + x0] * (1 - tx) + c.v[y0 * c.w + x1] * tx) * (1 - ty) + (c.v[y1 * c.w + x0] * (1 - tx) + c.v[y1 * c.w + x1] * tx) * ty;
            }
        }
    }
    function median5(a, w, h) {   // removes isolated wrong values, keeps edges
        const out = new Float32Array(w * h), v = new Float32Array(25);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let n = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx)); v[n++] = a[yy * w + xx]; }
            v.sort(); out[y * w + x] = v[12];
        }
        return out;
    }
    function boxMean(src, w, h, r) {   // mean over a (2r+1)^2 window, via an integral image
        const W = w + 1, I = new Float64Array(W * (h + 1)), out = new Float32Array(w * h);
        for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row; } }
        for (let y = 0; y < h; y++) {
            const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
            for (let x = 0; x < w; x++) {
                const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
                out[y * w + x] = (I[(y1 + 1) * W + x1 + 1] - I[y0 * W + x1 + 1] - I[(y1 + 1) * W + x0] + I[y0 * W + x0]) / ((x1 - x0 + 1) * (y1 - y0 + 1));
            }
        }
        return out;
    }
    function edgeSmooth(G, p, w, h, r) {   // joint bilateral filter (Tomasi & Manduchi, 1998): neighbours of similar photo brightness count more, so depth edges stay on the photo's edges
        const st = Math.max(1, Math.round(r / 4)), ss = Math.max(1, r / 2), taps = [], rw = new Float32Array(256), q = new Float32Array(w * h);
        for (let dy = -r; dy <= r; dy += st) for (let dx = -r; dx <= r; dx += st) taps.push(dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * ss * ss)));   // a sparse grid of neighbours (speed)
        for (let i = 0; i < 256; i++) rw[i] = Math.exp(-i * i / (2 * 20 * 20));   // brightness difference -> weight
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const c = y * w + x, g0 = G[c]; let sum = 0, wsum = 0;
            for (let k = 0; k < taps.length; k += 3) {
                const xx = Math.min(w - 1, Math.max(0, x + taps[k])), yy = Math.min(h - 1, Math.max(0, y + taps[k + 1])), i = yy * w + xx;
                const wt = taps[k + 2] * rw[Math.min(255, Math.abs(G[i] - g0) | 0)]; sum += wt * p[i]; wsum += wt;
            }
            q[c] = sum / wsum;
        }
        return q;
    }
    function ramps(disp, w, h, r, thr, passes) {   // whole-pixel steps on slopes become smooth ramps; real depth edges (bigger jumps) stay sharp
        let d = disp;
        for (let k = 0; k < passes; k++) {
            const m = boxMean(d, w, h, r), o = new Float32Array(w * h);
            for (let i = 0; i < o.length; i++) o[i] = Math.abs(m[i] - d[i]) < thr ? m[i] : d[i];
            d = o;
        }
        return d;
    }
    function shrink(I, w, h, f) {   // f x f average
        const W = Math.max(8, Math.floor(w / f)), H = Math.max(8, Math.floor(h / f)), o = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += I[Math.min(h - 1, y * f + j) * w + Math.min(w - 1, x * f + i)]; o[y * W + x] = s / (f * f); }
        return { I: o, w: W, h: H };
    }
    function disparity(L, R, w, h, dmin, dmax, prog) {
        const D = dmax - dmin + 1, C = costVolume(L, R, census(L, w, h), census(R, w, h), w, h, dmin, D);
        const S = sgm(C, L, w, h, D, 8, 130, prog), disp = wta(S, w, h, D, dmin);
        lrCheck(S, disp, w, h, D, dmin);
        return disp;
    }
    self.onmessage = (e) => {
        const m = e.data, t0 = Date.now(), post = (v, stage) => self.postMessage({ type: 'p', v, stage });
        try {
            const { L, R, w, h } = m;
            // 1) the depth range of this pair, from a quick pass on a 4x smaller copy
            post(0.02, 'Finding the depth range...');
            const sL = shrink(L, w, h, 4), sR = shrink(R, w, h, 4), R0 = Math.max(6, Math.ceil(sL.w * 0.08));
            const coarse = disparity(sL.I, sR.I, sL.w, sL.h, -R0, R0, (v) => post(0.02 + 0.1 * v, 'Finding the depth range...'));
            const vals = []; for (let i = 0; i < coarse.length; i++) if (ok(coarse[i])) vals.push(coarse[i]);
            let dmin, dmax;
            if (vals.length > coarse.length * 0.05) {
                vals.sort((a, b) => a - b);
                const lo = vals[Math.floor(vals.length * 0.01)] * 4, hi = vals[Math.floor(vals.length * 0.99)] * 4, m2 = Math.max(4, Math.round((hi - lo) * 0.15));
                dmin = Math.floor(lo) - m2; dmax = Math.ceil(hi) + m2;
            } else { const r = Math.ceil(w * 0.06); dmin = -r; dmax = r; }
            if (dmax - dmin > 191) { const c = (dmin + dmax) >> 1; dmin = c - 95; dmax = c + 96; }
            if (dmax - dmin < 15) { const c = (dmin + dmax) >> 1; dmin = c - 8; dmax = c + 8; }
            // 2) full matching at working size
            post(0.13, 'Matching the two photos...');
            let disp = disparity(L, R, w, h, dmin, dmax, (v) => post(0.13 + 0.67 * v, 'Matching the two photos...'));
            post(0.82, 'Cleaning up...');
            speckles(disp, w, h, Math.max(40, Math.round(w * h * 0.004)), 1);
            let valid = 0; for (let i = 0; i < disp.length; i++) if (ok(disp[i])) valid++;
            fill(disp, w, h); disp = median5(disp, w, h);
            if (m.smooth) disp = ramps(disp, w, h, Math.max(3, Math.round(Math.max(w, h) / 45)), 1.2, 3);
            // 3) to the output size, edges following the photo
            const { G, wo, ho, smooth } = m, up = new Float32Array(wo * ho), sx = w / wo, sy = h / ho;
            for (let y = 0; y < ho; y++) {
                const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = fy | 0, y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
                for (let x = 0; x < wo; x++) {
                    const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = fx | 0, x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
                    up[y * wo + x] = (disp[y0 * w + x0] * (1 - tx) + disp[y0 * w + x1] * tx) * (1 - ty) + (disp[y1 * w + x0] * (1 - tx) + disp[y1 * w + x1] * tx) * ty;
                }
            }
            post(0.9, 'Following the edges...');
            const er = Math.max(4, Math.round(Math.max(wo, ho) / 110)), out = smooth ? edgeSmooth(G, edgeSmooth(G, up, wo, ho, er), wo, ho, er) : up;   // two passes: smoother inside objects
            // 4) near = white: robust range of the result
            const s = Float32Array.from(out).sort(), lo = s[Math.floor(s.length * 0.01)], hi = s[Math.floor(s.length * 0.99)], k = hi > lo ? 255 / (hi - lo) : 0, depth = new Uint8ClampedArray(wo * ho);
            for (let i = 0; i < out.length; i++) depth[i] = (out[i] - lo) * k;
            self.postMessage({ type: 'done', depth, wo, ho, dmin, dmax, valid: valid / (w * h), ms: Date.now() - t0 }, [depth.buffer]);
        } catch (err) { self.postMessage({ type: 'error', message: String((err && err.message) || err) }); }
    };
}
// Grey image of a canvas, at a given size (shrunk where the canvas lives, read back small)
function grayOf(src, w, h) {
    const x = smallRead(src, w, h), d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < g.length; i += 4, p++) g[p] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return g;
}
const DEPTH_QUALITY = { fast: 480, standard: 720, high: 1024 };
// Runs the depth worker on the current, aligned and cropped pair. onProgress(fraction, text). Returns a promise and a cancel function.
function depthRun(quality, smooth, onProgress, src) {   // src: { L, R } canvases of a loaded pair; none = the open project (aligned, cropped, edited)
    let c, L, R;
    if (src) { L = src.L; R = src.R; c = { w: L.width, h: L.height }; }
    else {
        const A = { rot: rotDeg, k: scaleK, fpct: 0, soft: false };   // the floating window bars would look like an object
        c = getCropRect(true);
        if (pairInfo && pairInfo.mode === 'pad') {   // black borders would read as depth: keep only where both photos are
            const W = pvL.width, H = pvL.height, a = pairContent('L'), b = pairContent('R');
            const x0 = Math.max(c.x0, Math.ceil(a[0] * W), Math.ceil(b[0] * W) + c.dx), y0 = Math.max(c.y0, Math.ceil(a[1] * H), Math.ceil(b[1] * H) + c.dy);
            const x1 = Math.min(c.x0 + c.w, Math.floor(a[2] * W), Math.floor(b[2] * W) + c.dx), y1 = Math.min(c.y0 + c.h, Math.floor(a[3] * H), Math.floor(b[3] * H) + c.dy);
            if (x1 - x0 >= 16 && y1 - y0 >= 16) c = Object.assign({}, c, { x0, y0, w: x1 - x0, h: y1 - y0 });
        }
        L = mkCanvas(c.w, c.h); R = mkCanvas(c.w, c.h);
        drawAlignedP(L.getContext('2d'), 'L', c.w, c.h, c, pvL, pvR, A); drawAlignedP(R.getContext('2d'), 'R', c.w, c.h, c, pvL, pvR, A);
    }
    const s = Math.min(1, DEPTH_QUALITY[quality] / Math.max(c.w, c.h)), w = Math.max(16, Math.round(c.w * s)), h = Math.max(16, Math.round(c.h * s));
    const gL = grayOf(L, w, h), gR = grayOf(R, w, h), G = grayOf(L, c.w, c.h);
    if (!src) { releaseCanvas(L); releaseCanvas(R); }
    const url = URL.createObjectURL(new Blob(['(' + depthWorkerMain.toString() + ')()'], { type: 'application/javascript' })), wk = new Worker(url);
    let cancel;
    const done = new Promise((resolve, reject) => {
        const end = () => { wk.terminate(); URL.revokeObjectURL(url); };
        cancel = () => { end(); reject(new Error('cancelled')); };
        wk.onmessage = (e) => {
            const m = e.data;
            if (m.type === 'p') onProgress(m.v, m.stage);
            else if (m.type === 'done') { end(); resolve(m); }
            else { end(); reject(new Error(m.message)); }
        };
        wk.onerror = (e) => { e.preventDefault && e.preventDefault(); end(); reject(new Error(e.message || 'worker error')); };
    });
    wk.postMessage({ L: gL, R: gR, w, h, G, wo: c.w, ho: c.h, smooth }, [gL.buffer, gR.buffer, G.buffer]);
    return { done, cancel };
}
const DEPTH_COLORS = (() => {   // our own palette for the color view: far = deep blue ... near = red, straight lines between these colors
    const stops = [[0, 28, 18, 72], [0.16, 38, 64, 196], [0.34, 30, 160, 222], [0.5, 56, 196, 128], [0.66, 184, 216, 64], [0.82, 248, 168, 40], [1, 204, 34, 30]];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
        const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
        const a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]);
        for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
    }
    return lut;
})();
// Tools window: a list; each tool opens in its own window (with a way back to the list)
const TOOLS = [
    { id: 'batch', name: 'Batch convert to ZIP', text: 'Converts many MPO, JPS or side-by-side files at once to MPO, SBS, anaglyph, GIF, APNG, HTML viewers or .3dta projects.', needsPair: false, open: () => openBatchTool() },
    { id: 'depth', name: 'Depth map', text: 'Measures the depth of a stereo pair (a file or the open image) and saves it as a grey image (white = near).', needsPair: false, open: () => openDepthTool() },
    { id: 'card', name: 'Stereo card splitter', text: 'Finds the two photos on a scanned stereo card, straightens the scan and cuts the card away.', needsPair: false, open: () => openCardTool() },
    { id: 'd2to3', name: '2D to 3D from a depth map', text: 'Makes a stereo pair from a single photo and its depth map.', needsPair: false, open: () => open2Dto3DTool() },
    { id: 'ana2sbs', name: 'Anaglyph to side-by-side', text: 'Splits a red/cyan (or other) anaglyph into its left and right views, in grey or in the original colours.', needsPair: false, open: () => openAnaToSbsTool() }
];
function openTools() {
    if (document.querySelector('.ov.tools, .ov.tool')) return;
    const box = openCard('tools', '<div style="font-weight:700;font-size:1.1rem">Tools</div><div id="toolList" style="display:flex;flex-direction:column;gap:10px;margin-top:14px"></div>', [['Close']]);
    const list = box.querySelector('#toolList');
    TOOLS.forEach(t => {
        const off = t.needsPair && !imagesLoaded, row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--panel-border);border-radius:8px';
        row.innerHTML = `<div style="min-width:0"><div style="font-weight:600">${t.name}</div><div style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">${t.text}${off ? ' <i>Open a stereo pair first.</i>' : ''}</div></div>`;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Open'; b.style.cssText = 'width:auto;padding:8px 16px;flex:none';
        b.disabled = off; b.addEventListener('click', () => { box.parentNode.remove(); t.open(); });
        row.appendChild(b); list.appendChild(row);
    });
}
function toolBack(box) { box.parentNode.remove(); openTools(); }   // 'Back' from a tool to the list
function openDepthTool() {
    if (document.querySelector('.ov.tool')) return;
    const sel = (id, opts) => `<select id="${id}" style="padding:6px 8px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light)">` + opts.map(([v, t, s]) => `<option value="${v}"${s ? ' selected' : ''}>${t}</option>`).join('') + '</select>';
    const box = openCard('tool depth', '<div style="font-weight:700;font-size:1.1rem">Depth map</div>'
        + '<div style="margin-top:10px">'
        + '<p style="margin:0 0 10px;font-size:0.85rem;color:var(--text-muted)">Measures the depth of a stereo pair from the differences between the two photos. White is near, black is far. Up to 1600 pixels. The open image is used with its alignment, crop and edits; a loaded file only gets its vertical misalignment fixed, so align it first for the best result.</p>'
        + '<div style="display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;font-size:0.85rem">'
        + '<button type="button" class="btn btn-outline" id="depLoad" style="width:auto;padding:8px 14px">Load SBS / MPO...</button>'
        + '<button type="button" class="btn btn-outline" id="depOpen" style="width:auto;padding:8px 14px">Use the open image</button>'
        + '<label>Layout ' + sel('depLay', [['sbs', 'Side-by-side (left | right)', true], ['cross', 'Cross-eye (right | left)'], ['tb', 'Top-bottom (left over right)']]) + '</label></div>'
        + '<div id="depSrc" style="margin-top:6px;font-size:0.8rem;color:var(--text-muted)">Choose a stereo pair.</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;font-size:0.85rem;margin-top:10px">'
        + '<label>Quality ' + sel('depQ', [['fast', 'Fast'], ['standard', 'Standard', true], ['high', 'High (slower)']]) + '</label>'
        + '<label>View ' + sel('depC', [['gray', 'Grayscale'], ['color', 'Colors']]) + '</label>'
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="depS" checked> Smooth, following edges</label>'
        + '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="depI"> Invert (black = near)</label></div>'
        + '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn" id="depGo" style="padding:8px 14px;width:auto" disabled>Generate depth map</button>'
        + '<button type="button" class="btn btn-outline" id="depSave" style="padding:8px 14px;width:auto" disabled>Save PNG</button></div>'
        + '<div id="depStatus" style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);min-height:1.2em"></div>'
        + '<canvas id="depCanvas" style="display:none;margin-top:8px;max-width:100%;max-height:52vh;width:auto;height:auto;border-radius:6px;box-shadow:none"></canvas></div>', [['Back', () => toolBack(box), true], ['Close']]);
    box.style.maxWidth = '760px';
    const ov = box.parentNode, q = (id) => box.querySelector('#' + id), cv = q('depCanvas'), status = q('depStatus'), go = q('depGo'), save = q('depSave');
    let result = null, job = null, pair = null, name = 'depth_map', useOpen = false;   // pair: { L, R } of a loaded file; useOpen: the open image
    const openBtn = q('depOpen'); openBtn.disabled = !imagesLoaded; if (!imagesLoaded) openBtn.title = 'No image is open';
    const setSource = (text) => { q('depSrc').textContent = text; go.disabled = !!job || (!pair && !useOpen); result = null; save.disabled = true; cv.style.display = 'none'; status.textContent = ''; };
    const dropPair = () => { if (pair) { releaseCanvas(pair.L); releaseCanvas(pair.R); pair = null; } };
    openBtn.addEventListener('click', () => { if (job || !imagesLoaded) return; dropPair(); useOpen = true; name = 'depth_map'; setSource('Source: the open image.'); });
    const inp = document.createElement('input'); inp.type = 'file'; inp.id = 'depLoadFile'; inp.accept = '.mpo,.jps,image/*'; inp.style.display = 'none'; box.appendChild(inp);
    q('depLoad').addEventListener('click', () => { if (!job) inp.click(); });
    inp.addEventListener('change', async () => {
        const f = inp.files[0]; inp.value = ''; if (!f || job) return;
        q('depSrc').textContent = 'Loading ' + f.name + '...';
        try {
            const pr = await depthPairFromFile(f, q('depLay').value); if (!document.body.contains(ov)) { releaseCanvas(pr.L); releaseCanvas(pr.R); return; }
            dropPair(); useOpen = false; pair = pr; name = (f.name.replace(/\.[^.]+$/, '') || 'pair') + '_depth';
            setSource(`Source: ${f.name} (${pr.L.width} × ${pr.L.height} per eye${pr.dy ? ', vertical misalignment of ' + pr.dy + ' px fixed' : ''}).`);
        } catch (e) { console.error(e); q('depSrc').textContent = 'Could not read ' + f.name + '.'; showToast('Could not open that file.', true); }
    });
    const draw = () => {   // shows the stored depth with the chosen view (no new computation)
        if (!result) return;
        const { depth, wo, ho } = result, color = q('depC').value === 'color', inv = q('depI').checked;
        cv.width = wo; cv.height = ho; const x = cv.getContext('2d'), id = x.createImageData(wo, ho), d = id.data;
        for (let i = 0, p = 0; p < depth.length; i += 4, p++) {
            const v = inv ? 255 - depth[p] : depth[p];
            if (color) { d[i] = DEPTH_COLORS[v * 3]; d[i + 1] = DEPTH_COLORS[v * 3 + 1]; d[i + 2] = DEPTH_COLORS[v * 3 + 2]; } else { d[i] = d[i + 1] = d[i + 2] = v; }
            d[i + 3] = 255;
        }
        x.putImageData(id, 0, 0); cv.style.display = 'block';
    };
    ['depC', 'depI'].forEach(id => q(id).addEventListener('change', draw));
    go.addEventListener('click', () => {
        if (job || (!pair && !useOpen)) return;
        if (useOpen && !imagesLoaded) { useOpen = false; setSource('The open image was closed. Choose a stereo pair.'); return; }
        go.disabled = true; go.textContent = 'Generating...'; status.textContent = 'Preparing...';
        const src = pair, start = (fn) => src ? fn() : whenFramesReady(fn);   // pending Individual Images edits first (open image only)
        start(() => {
            if (!document.body.contains(ov)) return;
            try { job = depthRun(q('depQ').value, q('depS').checked, (v, t) => { if (!document.body.contains(ov)) { job.cancel(); return; } status.textContent = t + ' ' + Math.round(v * 100) + '%'; }, src || undefined); }
            catch (e) { status.textContent = 'Could not start: ' + (e.message || e); go.disabled = false; go.textContent = 'Generate depth map'; return; }
            job.done.then((m) => {
                result = m; draw(); save.disabled = false;
                status.textContent = `Done in ${(m.ms / 1000).toFixed(1)} s · ${m.wo}×${m.ho} · ${Math.round(m.valid * 100)}% of the points matched directly, the rest filled in`;
            }, (e) => { if (e.message !== 'cancelled') status.textContent = 'Depth map failed: ' + e.message; })
                .finally(() => { job = null; go.disabled = !pair && !useOpen; go.textContent = 'Generate depth map'; });
        });
    });
    save.addEventListener('click', () => { if (result) cv.toBlob((b) => b && saveBlob(b, `${name}_${stamp()}.png`).then(() => showToast('Depth map saved.'), () => showToast('Cancelled.')), 'image/png'); });
    new MutationObserver((_, obs) => { if (!document.body.contains(ov)) { obs.disconnect(); if (job) job.cancel(); dropPair(); } }).observe(document.body, { childList: true });   // closing the window stops the work
}
async function depthPairFromFile(f, lay) {   // an MPO or a side-by-side / cross-eye / top-bottom image -> { L, R } up to 1600 px, vertical misalignment fixed
    let L, R;
    const isMpo = /\.mpo$/i.test(f.name) || await looksLikeMPO(f);
    if (isMpo) {
        const [b1, b2] = await parseMPO(f), [i1, i2] = await Promise.all([imgFromBuffer(b1), imgFromBuffer(b2)]);
        const cv = (im) => { const c = mkCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; };
        const src = { L: cv(i1), R: cv(i2) }, b = pairBases(src, 'crop'); [L, R] = pairFit(b.L, b.R, 'crop');   // different sizes: same scale, the common area
        [src.L, src.R, b.L, b.R].forEach(c => { if (c !== L && c !== R) releaseCanvas(c); });
    } else {
        const url = URL.createObjectURL(f); let img; try { img = await loadImageAsync(url); } finally { URL.revokeObjectURL(url); }
        let w, h, a, b;
        if (lay === 'tb') { w = img.width; h = Math.floor(img.height / 2); a = [0, 0]; b = [0, h]; } else { w = Math.floor(img.width / 2); h = img.height; a = [0, 0]; b = [w, 0]; if (lay === 'cross') [a, b] = [b, a]; }
        if (w < 16 || h < 16) throw new Error('image too small');
        L = mkCanvas(w, h); R = mkCanvas(w, h);
        L.getContext('2d').drawImage(img, a[0], a[1], w, h, 0, 0, w, h); R.getContext('2d').drawImage(img, b[0], b[1], w, h, 0, 0, w, h);
    }
    const k = Math.min(1, 1600 / Math.max(L.width, L.height));
    if (k < 1) { const w = Math.round(L.width * k), h = Math.round(L.height * k), L2 = scaledCanvas(L, w, h), R2 = scaledCanvas(R, w, h); releaseCanvas(L); releaseCanvas(R); L = L2; R = R2; }
    const pr = { L, R, b1: null, b2: null }, h0 = L.height; batchVAlign(pr);
    const fine = depthVFine(pr.L, pr.R); if (fine.L !== pr.L) { releaseCanvas(pr.L); releaseCanvas(pr.R); }
    return { L: fine.L, R: fine.R, dy: h0 - fine.L.height };
}
function depthVFine(L, R) {   // the last pixels of vertical misalignment (the depth matching only allows one row): row brightness profiles, ±4 px
    const w = L.width, h = L.height; if (h < 40) return { L, R };
    const prof = (c) => { const g = grayData(c, w, h), p = new Float32Array(h); for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) s += g[y * w + x]; p[y] = s / w; } return p; };
    const a = prof(L), b = prof(R); let best = Infinity, dy = 0;
    for (let d = -4; d <= 4; d++) { let s = 0, n = 0; for (let y = 8; y < h - 8; y++) { const v = a[y] - b[y - d]; s += v * v; n++; } s /= n; if (s < best - 1e-9) { best = s; dy = d; } }
    if (!dy) return { L, R };
    const ch = h - Math.abs(dy), L2 = mkCanvas(w, ch), R2 = mkCanvas(w, ch);
    L2.getContext('2d').drawImage(L, 0, Math.max(0, dy), w, ch, 0, 0, w, ch); R2.getContext('2d').drawImage(R, 0, Math.max(0, dy) - dy, w, ch, 0, 0, w, ch);
    return { L: L2, R: R2 };
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
