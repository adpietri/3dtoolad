/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// === INDIVIDUAL IMAGES TAB: per-photo rotate, color mixer (HSL), match colors, auto-rotate ===
const BANDS = [['Red', 0], ['Orange', 30], ['Yellow', 60], ['Green', 120], ['Aqua', 180], ['Blue', 240], ['Purple', 270], ['Magenta', 300]];
const $id = (s) => document.getElementById(s);

// --- pure helpers (also covered by the self-test) ---
function hslLut(hsl) {   // per degree of hue: shift in degrees, saturation multiplier, lightness shift (blended between neighbouring bands)
    const C = BANDS.map(b => b[1]), dh = new Float32Array(360), sm = new Float32Array(360), la = new Float32Array(360);
    for (let h = 0; h < 360; h++) {
        let i = 0; for (let k = 0; k < C.length; k++) if (C[k] <= h) i = k;
        const a = i, b = (i + 1) % C.length, t = (h - C[a]) / ((b === 0 ? 360 : C[b]) - C[a]), mix = (q) => (1 - t) * hsl[a][q] + t * hsl[b][q];
        dh[h] = mix(0) * 0.4; sm[h] = 1 + mix(1) / 100; la[h] = mix(2) / 100 * 0.35;
    }
    return { dh, sm, la };
}
function hslApplyPixels(d, lut) {   // in place on RGBA data; greys are left alone
    for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
        if (dl < 0.012) continue;
        let hh = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; hh *= 60; if (hh < 0) hh += 360;
        const l = (mx + mn) / 2, s = dl / (1 - Math.abs(2 * l - 1)), hi = Math.min(359, hh | 0);
        const nh = (((hh + lut.dh[hi]) % 360) + 360) % 360, ns = Math.min(1, Math.max(0, s * lut.sm[hi])), nl = Math.min(1, Math.max(0, l + lut.la[hi] * (1 - Math.abs(2 * l - 1) * 0.5)));
        const c = (1 - Math.abs(2 * nl - 1)) * ns, hp = nh / 60, x = c * (1 - Math.abs(hp % 2 - 1)), m = nl - c / 2; let rr, gg, bb;
        if (hp < 1) { rr = c; gg = x; bb = 0; } else if (hp < 2) { rr = x; gg = c; bb = 0; } else if (hp < 3) { rr = 0; gg = c; bb = x; }
        else if (hp < 4) { rr = 0; gg = x; bb = c; } else if (hp < 5) { rr = x; gg = 0; bb = c; } else { rr = c; gg = 0; bb = x; }
        d[i] = (rr + m) * 255 + 0.5; d[i + 1] = (gg + m) * 255 + 0.5; d[i + 2] = (bb + m) * 255 + 0.5;
    }
}
function uprightScore(d, w, h) {   // > 0: the lighter / bluer part (sky) is on top; < 0: probably upside down
    const t = Math.max(1, Math.floor(h / 3)); let lt = 0, lb = 0, bt = 0, bb = 0, n = 0;
    for (let y = 0; y < t; y++) for (let x = 0; x < w; x++) {
        const a = (y * w + x) * 4, z = ((h - 1 - y) * w + x) * 4;
        lt += 0.299 * d[a] + 0.587 * d[a + 1] + 0.114 * d[a + 2]; bt += d[a + 2] - d[a];
        lb += 0.299 * d[z] + 0.587 * d[z + 1] + 0.114 * d[z + 2]; bb += d[z + 2] - d[z]; n++;
    }
    return (lt - lb) / n + 0.6 * (bt - bb) / n;
}
function pickRelativeRotation(gl, grays) {   // grays[k] = the right photo turned k x 90 degrees; returns the turn that matches the left best (0 unless clearly better)
    const sad = grays.map(g => { let s = 0; for (let i = 0; i < gl.length; i++) s += Math.abs(gl[i] - g[i]); return s / gl.length; });
    let best = 0; for (let k = 1; k < 4; k++) if (sad[k] < sad[best]) best = k;
    return (best !== 0 && sad[best] < sad[0] * 0.8) ? best : 0;
}

// --- exposure / tone / white balance (pure pixel math, also covered by the self-test) ---
const ADJ_UI = { adjExposure: [['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['saturation', 'Saturation'], ['vibrance', 'Vibrance'], ['clarity', 'Clarity']],
    adjShadows: [['shadows', 'Shadows'], ['highlights', 'Highlights']], adjWB: [['temperature', 'Temperature'], ['tint', 'Tint']] };
const adjZero = (a) => !a || ADJ_KEYS.every(k => !a[k]);
function adjToneLut(a) {   // one curve for all channels: exposure -> brightness -> shadows and highlights -> contrast
    const lut = new Uint8ClampedArray(256), stops = a.exposure / 100 * 2, gam = Math.pow(2, -0.7 * a.brightness / 100), f = 1 + a.contrast / 100, cl = (v) => Math.min(1, Math.max(0, v));
    for (let i = 0; i < 256; i++) {
        let x = i / 255;
        x = Math.pow(Math.pow(x, 2.2) * Math.pow(2, stops), 1 / 2.2);   // exposure in stops, on linear light
        x = Math.pow(cl(x), gam);                                       // brightness: mid-tone gamma, black and white stay put
        x += a.shadows / 100 * 0.3 * 9.48 * x * (1 - x) * (1 - x) * (1 - x) + a.highlights / 100 * 0.3 * 9.48 * x * x * x * (1 - x);   // each acts on its own tonal range, never on pure black or white
        x = 0.5 + (cl(x) - 0.5) * f;                                    // contrast around mid grey
        lut[i] = Math.round(cl(x) * 255);
    }
    return lut;
}
function boxBlur(src, w, h, r) {   // three passes of a separable box blur (close to a Gaussian)
    let a = Float32Array.from(src); const b = new Float32Array(src.length), cx = (v) => Math.min(w - 1, Math.max(0, v)), cy = (v) => Math.min(h - 1, Math.max(0, v)), k = 2 * r + 1;
    for (let it = 0; it < 3; it++) {
        for (let y = 0; y < h; y++) { const row = y * w; let sum = 0; for (let x = -r; x <= r; x++) sum += a[row + cx(x)]; for (let x = 0; x < w; x++) { b[row + x] = sum / k; sum += a[row + cx(x + r + 1)] - a[row + cx(x - r)]; } }
        for (let x = 0; x < w; x++) { let sum = 0; for (let y = -r; y <= r; y++) sum += b[cy(y) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = sum / k; sum += b[cy(y + r + 1) * w + x] - b[cy(y - r) * w + x]; } }
    }
    return a;
}
const clarityRQ = (w, h) => [Math.max(2, Math.round(Math.min(w, h) * 0.012)), Math.max(1, Math.ceil(Math.sqrt(w * h / 4e6)))];   // blur radius and grid step for a w x h photo
function clarityPass(d, w, h, amt) { const [r, q] = clarityRQ(w, h); clarityPassRQ(d, w, h, amt, r, q); }
function clarityPassRQ(d, w, h, amt, r, q) {   // local contrast on the mid-tones: lightness minus its blurred copy (r, q from the whole photo, so a band of it gives the same result)
    const n = w * h;
    if (q === 1) {   // up to about 4 MP: exact
        const Y = new Float32Array(n), k = amt * 1.2 * 4; for (let i = 0, p = 0; p < n; i += 4, p++) Y[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const B = boxBlur(Y, w, h, r); for (let i = 0, p = 0; p < n; i += 4, p++) { const t = Y[p] / 255, dy = (Y[p] - B[p]) * k * t * (1 - t); d[i] += dy; d[i + 1] += dy; d[i + 2] += dy; }
        return;
    }
    const sw = Math.ceil(w / q), sh = Math.ceil(h / q), S = new Float32Array(sw * sh);   // bigger photos: blur a q x smaller grid, same radius in photo pixels
    const X0 = new Int32Array(w), X1 = new Int32Array(w), TX = new Float32Array(w), CX = new Int32Array(w);   // per-column lookups, computed once
    for (let x = 0; x < w; x++) { const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / q - 0.5)); X0[x] = fx | 0; X1[x] = Math.min(sw - 1, X0[x] + 1); TX[x] = fx - X0[x]; CX[x] = (x / q) | 0; }
    for (let y = 0, i = 0; y < h; y++) { const row = ((y / q) | 0) * sw; for (let x = 0; x < w; x++, i += 4) S[row + CX[x]] += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
    for (let cy = 0; cy < sh; cy++) { const ch = Math.min(q, h - cy * q); for (let cx = 0; cx < sw; cx++) S[cy * sw + cx] /= ch * Math.min(q, w - cx * q); }
    const B = boxBlur(S, sw, sh, Math.max(1, Math.round(r / q))), k = amt * 1.2 * 4;
    for (let y = 0, i = 0; y < h; y++) {
        const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / q - 0.5)), r0 = (fy | 0) * sw, r1 = Math.min(sh - 1, (fy | 0) + 1) * sw, ty = fy - (fy | 0);
        for (let x = 0; x < w; x++, i += 4) {
            const x0 = X0[x], x1 = X1[x], tx = TX[x];
            const blur = (B[r0 + x0] + (B[r0 + x1] - B[r0 + x0]) * tx) * (1 - ty) + (B[r1 + x0] + (B[r1 + x1] - B[r1 + x0]) * tx) * ty;
            const y8 = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2], t = y8 / 255, dy = (y8 - blur) * k * t * (1 - t);
            d[i] += dy; d[i + 1] += dy; d[i + 2] += dy;
        }
    }
}
function adjParams(a) {   // tint: + = magenta (less green), - = green; warm = more red, less blue
    const tg = a.temperature / 100 * 0.25;
    return { lut: adjToneLut(a), rg: 1 + tg, bg: 1 - tg, gg: 1 - a.tint / 100 * 0.25, sat: 1 + a.saturation / 100, vib: a.vibrance / 100 };
}
function adjApplyPixels(d, w, h, a) {   // in place on RGBA data
    const p = adjParams(a); adjPixelsCore(d, p.lut, p.rg, p.gg, p.bg, p.sat, p.vib);
    if (a.clarity) clarityPass(d, w, h, a.clarity / 100);
}
function adjPixelsCore(d, lut, rg, gg, bg, sat, vib) {   // exposure / tone / white balance / saturation, pixel by pixel (no neighbours)
    for (let i = 0; i < d.length; i += 4) {
        let r = lut[Math.min(255, d[i] * rg + 0.5 | 0)], g = lut[Math.min(255, d[i + 1] * gg + 0.5 | 0)], b = lut[Math.min(255, d[i + 2] * bg + 0.5 | 0)];   // warm = more red, less blue
        if (sat !== 1 || vib) {
            const y = 0.299 * r + 0.587 * g + 0.114 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b), sp = mx ? (mx - mn) / mx : 0, f = sat * (1 + vib * (1 - sp));   // vibrance moves the dull colors more than the vivid ones
            r = y + (r - y) * f; g = y + (g - y) * f; b = y + (b - y) * f;
        }
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
