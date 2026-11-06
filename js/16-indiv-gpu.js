/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- GPU path (WebGL2) for the edits of this tab ---
// The same math as the CPU code below, done for all pixels in parallel on the graphics card. It is checked against the
// CPU code once, on first use. No WebGL2, a failed check, a photo too big for the card or any error: the CPU code runs.
const IG = { tried: false, ok: false, gl: null, cv: null, fl: false, max: 0, maxPx: 40e6, loc: new Map(), why: '', srcs: new Map() };
const IG_KEEP_PX = 4e6, IG_KEEP_N = 6;   // reduced copies (and small photos) stay uploaded on the card; full-size photos are sent once per rebuild
const IG_VS = '#version 300 es\nin vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';
const IG_HEAD = '#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;out vec4 o;\n';
const IG_MAIN = IG_HEAD + `
    uniform sampler2D uSrc, uTone, uBlur, uCurveT, uHslT, uMatchT;
    uniform ivec2 uSrcSize, uOut, uBS; uniform int uFlip, uRot, uGeo, uAdj, uClar, uQ, uCurve, uHsl, uMatch;
    uniform vec4 uG0, uG1; uniform float uGR, uCk; uniform vec3 uWb; uniform vec2 uSat;
    float q8(float v){ return roundEven(clamp(v, 0.0, 255.0)); }   // what storing into a Uint8ClampedArray does
    vec4 px(ivec2 p){ int w = uSrcSize.x, h = uSrcSize.y; ivec2 s = p;   // pixel of the photo after its quarter turns
        if (uRot == 1) s = ivec2(p.y, h - 1 - p.x); else if (uRot == 2) s = ivec2(w - 1 - p.x, h - 1 - p.y); else if (uRot == 3) s = ivec2(w - 1 - p.y, p.x);
        return round(texelFetch(uSrc, s, 0) * 255.0); }
    float lut(sampler2D t, int i, int ch){ return round(texelFetch(t, ivec2(clamp(i, 0, 255), 0), 0)[ch] * 255.0); }
    void main(){
        ivec2 p = ivec2(gl_FragCoord.xy); if (uFlip == 1) p.y = uOut.y - 1 - p.y;
        vec4 c;
        if (uGeo == 1) {   // geoApplyPixels
            float k = uG1.w, v = (float(p.y) + 0.5 - uG0.y) * k, u = (float(p.x) + 0.5 - uG0.x) * k, a = u * uG0.z - v * uG0.w, b = u * uG0.w + v * uG0.z;
            float a2 = a * (1.0 + uG1.x * b), b2 = b * (1.0 + uG1.y * a), f = 1.0 + uG1.z * (a2 * a2 + b2 * b2);
            float sx = clamp(uG0.x + a2 * f * uGR - 0.5, 0.0, float(uOut.x - 1)), sy = clamp(uG0.y + b2 * f * uGR - 0.5, 0.0, float(uOut.y - 1));
            int x0 = int(sx), y0 = int(sy), x1 = x0 < uOut.x - 1 ? x0 + 1 : x0, y1 = y0 < uOut.y - 1 ? y0 + 1 : y0; float tx = sx - float(x0), ty = sy - float(y0);
            vec4 d00 = px(ivec2(x0, y0)), d10 = px(ivec2(x1, y0)), d01 = px(ivec2(x0, y1)), d11 = px(ivec2(x1, y1)), m = (d00 + (d10 - d00) * tx) * (1.0 - ty) + (d01 + (d11 - d01) * tx) * ty;
            c = vec4(q8(m.r), q8(m.g), q8(m.b), q8(m.a));
        } else c = px(p);
        if (uAdj == 1) {   // adjApplyPixels (without Clarity)
            float r = lut(uTone, min(255, int(c.r * uWb.x + 0.5)), 0), g = lut(uTone, min(255, int(c.g * uWb.y + 0.5)), 0), b = lut(uTone, min(255, int(c.b * uWb.z + 0.5)), 0);
            if (uSat.x != 1.0 || uSat.y != 0.0) { float y = 0.299 * r + 0.587 * g + 0.114 * b, mx = max(r, max(g, b)), mn = min(r, min(g, b)), sp = mx > 0.0 ? (mx - mn) / mx : 0.0, f = uSat.x * (1.0 + uSat.y * (1.0 - sp));
                r = y + (r - y) * f; g = y + (g - y) * f; b = y + (b - y) * f; }
            c.rgb = vec3(q8(r), q8(g), q8(b));
        }
        if (uClar == 1) {   // clarityPass, with the blurred lightness made by the passes below
            float y8 = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b, bl;
            if (uQ == 1) bl = texelFetch(uBlur, p, 0).r;
            else { float q = float(uQ), fy = clamp((float(p.y) + 0.5) / q - 0.5, 0.0, float(uBS.y - 1)), fx = clamp((float(p.x) + 0.5) / q - 0.5, 0.0, float(uBS.x - 1));
                int y0 = int(fy), x0 = int(fx), y1 = min(uBS.y - 1, y0 + 1), x1 = min(uBS.x - 1, x0 + 1); float ty = fy - float(y0), tx = fx - float(x0);
                float b00 = texelFetch(uBlur, ivec2(x0, y0), 0).r, b10 = texelFetch(uBlur, ivec2(x1, y0), 0).r, b01 = texelFetch(uBlur, ivec2(x0, y1), 0).r, b11 = texelFetch(uBlur, ivec2(x1, y1), 0).r;
                bl = (b00 + (b10 - b00) * tx) * (1.0 - ty) + (b01 + (b11 - b01) * tx) * ty; }
            float t = y8 / 255.0, dy = (y8 - bl) * uCk * t * (1.0 - t); c.rgb = vec3(q8(c.r + dy), q8(c.g + dy), q8(c.b + dy));
        }
        if (uCurve == 1) c.rgb = vec3(lut(uCurveT, int(c.r), 0), lut(uCurveT, int(c.g), 1), lut(uCurveT, int(c.b), 2));   // tone curve
        if (uHsl == 1) {   // hslApplyPixels
            float r = c.r / 255.0, g = c.g / 255.0, b = c.b / 255.0, mx = max(r, max(g, b)), mn = min(r, min(g, b)), dl = mx - mn;
            if (dl >= 0.012) {
                float hh = mx == r ? (g - b) / dl : mx == g ? (b - r) / dl + 2.0 : (r - g) / dl + 4.0; hh *= 60.0; if (hh < 0.0) hh += 360.0;
                float l = (mx + mn) / 2.0, s = dl / (1.0 - abs(2.0 * l - 1.0)); vec4 L = texelFetch(uHslT, ivec2(min(359, int(hh)), 0), 0);
                float nh = mod(hh + L.r, 360.0), ns = clamp(s * L.g, 0.0, 1.0), nl = clamp(l + L.b * (1.0 - abs(2.0 * l - 1.0) * 0.5), 0.0, 1.0);
                float C = (1.0 - abs(2.0 * nl - 1.0)) * ns, hp = nh / 60.0, X = C * (1.0 - abs(mod(hp, 2.0) - 1.0)), m = nl - C / 2.0; vec3 q;
                if (hp < 1.0) q = vec3(C, X, 0.0); else if (hp < 2.0) q = vec3(X, C, 0.0); else if (hp < 3.0) q = vec3(0.0, C, X);
                else if (hp < 4.0) q = vec3(0.0, X, C); else if (hp < 5.0) q = vec3(X, 0.0, C); else q = vec3(C, 0.0, X);
                c.rgb = vec3(q8((q.r + m) * 255.0 + 0.5), q8((q.g + m) * 255.0 + 0.5), q8((q.b + m) * 255.0 + 0.5));
            }
        }
        if (uMatch == 1) c.rgb = vec3(lut(uMatchT, int(c.r), 0), lut(uMatchT, int(c.g), 1), lut(uMatchT, int(c.b), 2));   // match colors
        o = c / 255.0;
    }`;
const IG_LUM = IG_HEAD + `uniform sampler2D uA; uniform ivec2 uSz; uniform int uQ;   // lightness, averaged over q x q blocks (clarityPass)
    void main(){ ivec2 c = ivec2(gl_FragCoord.xy); float s = 0.0; int n = 0;
        for (int j = 0; j < uQ; j++) { int y = c.y * uQ + j; if (y >= uSz.y) break;
            for (int i = 0; i < uQ; i++) { int x = c.x * uQ + i; if (x >= uSz.x) break; vec3 v = round(texelFetch(uA, ivec2(x, y), 0).rgb * 255.0); s += dot(v, vec3(0.299, 0.587, 0.114)); n++; } }
        o = vec4(s / float(n), 0.0, 0.0, 1.0); }`;
const IG_BLUR = IG_HEAD + `uniform sampler2D uB; uniform ivec2 uSz; uniform int uR, uDir;   // one direction of the box blur (boxBlur)
    void main(){ ivec2 c = ivec2(gl_FragCoord.xy); float s = 0.0;
        for (int j = -uR; j <= uR; j++) { ivec2 p = uDir == 0 ? ivec2(clamp(c.x + j, 0, uSz.x - 1), c.y) : ivec2(c.x, clamp(c.y + j, 0, uSz.y - 1)); s += texelFetch(uB, p, 0).r; }
        o = vec4(s / float(2 * uR + 1), 0.0, 0.0, 1.0); }`;
function igDrop(why) {   // CPU from now on (until the graphics card comes back)
    igForget(); IG.ok = false; IG.why = why || IG.why; IG.loc.clear();
    if (IG.cv) { IG.cv.width = IG.cv.height = 1; } IG.gl = null; IG.cv = null;
}
function igForget() {   // drops the photos kept on the graphics card (new photos, cleared project, lost context)
    if (IG.gl) IG.srcs.forEach(e => IG.gl.deleteTexture(e.t));
    IG.srcs.clear();
}
function igSrcTex(gl, src) {   // the uploaded copy of an unchanging source canvas, uploaded only the first time
    const e = IG.srcs.get(src);
    if (e && e.w === src.width && e.h === src.height) { IG.srcs.delete(src); IG.srcs.set(src, e); return e.t; }   // most recently used goes last
    if (e) { gl.deleteTexture(e.t); IG.srcs.delete(src); }
    IG.srcs.forEach((o, c) => { if (c.width !== o.w || c.height !== o.h) { gl.deleteTexture(o.t); IG.srcs.delete(c); } });   // photos released meanwhile: free their copies on the card
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    IG.srcs.set(src, { t, w: src.width, h: src.height });
    while (IG.srcs.size > IG_KEEP_N) { const [k, old] = IG.srcs.entries().next().value; gl.deleteTexture(old.t); IG.srcs.delete(k); }   // least recently used
    return t;
}
function igInit() {
    if (IG.tried) return IG.ok;
    IG.tried = true; IG.ok = false;
    try {
        const c = document.createElement('canvas'); c.width = c.height = 4;
        const gl = c.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true });
        if (!gl || typeof gl.texImage2D !== 'function') throw new Error('WebGL2 not available');
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
        const prog = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, IG_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link'); return p; };
        IG.pMain = prog(IG_MAIN); IG.pLum = prog(IG_LUM); IG.pBlur = prog(IG_BLUR);
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.disable(gl.BLEND); gl.disable(gl.DITHER);
        const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        IG.max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), vp[0], vp[1]);
        IG.fl = !!gl.getExtension('EXT_color_buffer_float');   // needed only by Clarity (float blur); without it Clarity runs on the CPU
        IG.gl = gl; IG.cv = c; IG.loc.clear();
        c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); igDrop('graphics context lost'); });
        c.addEventListener('webglcontextrestored', () => { IG.tried = false; });   // rebuilt (and re-checked) on the next use
        igSelfTest();
        IG.ok = true; IG.why = '';
    } catch (e) { console.info('GPU editing unavailable, using CPU:', e.message || e); igDrop(e.message || String(e)); }
    return IG.ok;
}
function igSelfTest() {   // a small odd-sized picture through every step, GPU against CPU
    const w = 37, h = 23, src = mkCanvas(w, h), sx = src.getContext('2d', { willReadFrequently: true }), id = sx.createImageData(w, h), d = id.data;   // read several times below
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) {
        const g = (x + y) % 9 === 0; d[i] = g ? 128 : (x * 7 + y * 3) % 256; d[i + 1] = g ? 128 : (y * 11 + 40) % 256; d[i + 2] = g ? 128 : (255 - x * 6) & 255; d[i + 3] = 255;
    }
    sx.putImageData(id, 0, 0);
    const pix = (c) => { const t = mkCanvas(c.width, c.height), x = t.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const check = (gpu, cpu, name) => {
        if (!gpu || gpu.width !== cpu.width || gpu.height !== cpu.height) throw new Error('self-test: no result for ' + name);
        const a = pix(gpu), b = pix(cpu); let far = 0, sum = 0;
        for (let i = 0; i < a.length; i++) { const e = Math.abs(a[i] - b[i]); sum += e; if (e > 2) far++; }
        if (far > a.length * 0.01 || sum / a.length > 0.5) throw new Error('self-test mismatch in ' + name + ' (mean ' + (sum / a.length).toFixed(2) + ', ' + (far / a.length * 100).toFixed(1) + '% off)');
    };
    // 1) quarter turns: pixels must land exactly where they belong. Checked against the source pixels themselves, not against
    //    the canvas: browsers differ in whether a 90-degree turn is slightly smoothed.
    const sd = pix(src);
    for (let r = 1; r < 4; r++) {
        const st = indivNewSt(); st.rot = r; const g = igDraw(src, st, false, null, false);
        if (!g || g.width !== (r & 1 ? h : w)) throw new Error('self-test: quarter turn ' + r + ' has the wrong size');
        const gd = pix(g), W = g.width, H = g.height; let bad = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = r === 1 ? y : r === 2 ? w - 1 - x : w - 1 - y, v = r === 1 ? h - 1 - x : r === 2 ? h - 1 - y : x;
            for (let c = 0; c < 4; c++) if (Math.abs(gd[(y * W + x) * 4 + c] - sd[(v * w + u) * 4 + c]) > 1) bad++;
        }
        if (bad) throw new Error('self-test: quarter turn ' + r + ' moved ' + bad + ' values wrongly');
    }
    // 2) every edit step (no quarter turn here, see above)
    const st = indivNewSt(); st.geo = { straighten: 4, keyV: 25, keyH: -20, lens: 15 };
    Object.assign(st.adj, { exposure: 20, brightness: -10, contrast: 15, saturation: 20, vibrance: 30, shadows: 20, highlights: -20, temperature: 30, tint: -20 });
    st.curve = { rgb: [10, -10, 20, -5], r: [5, 0, 0, 10], g: [0, -8, 0, 0], b: [0, 0, 12, 0], pts: { rgb: [[0, 0], [70, 90], [255, 255]], r: [[0, 0], [255, 255]], g: [[10, 0], [128, 120], [255, 250]], b: [[0, 0], [255, 255]] } }; st.hsl = BANDS.map((b, i) => [(i * 37) % 60 - 30, (i * 53) % 80 - 40, (i * 29) % 50 - 25]);
    const st2 = indivNewSt(); Object.assign(st2.adj, { exposure: -15, saturation: -30, temperature: -40 }); st2.hsl = st.hsl;
    const luts = [0, 1, 2].map(ch => Uint8ClampedArray.from({ length: 256 }, (v, i) => Math.round(255 * Math.pow(i / 255, 0.8 + ch * 0.15))));
    check(igDraw(src, st, false, null, false), indivRenderCPU(src, st, false, false), 'full edit');
    check(igDraw(src, st2, false, null, false), indivRenderCPU(src, st2, false, false), 'edit without geometry');
    check(igDraw(src, st, true, null, false), indivRenderCPU(src, st, true, false), 'before view');
    check(igDraw(src, null, false, luts, false), indivApplyLutsCPU(src, luts, false), 'match colors');
    // 3) Clarity uses float images on the card. If that part fails, only Clarity stays on the CPU.
    if (IG.fl) {
        const stc = indivNewSt(); Object.assign(stc.adj, { exposure: 10, clarity: 60 });
        try { check(igDraw(src, stc, false, null, false), indivRenderCPU(src, stc, false, false), 'clarity'); }
        catch (e) {
            IG.fl = false; IG.flWhy = e.message || String(e); console.info('GPU Clarity unavailable, Clarity runs on the CPU:', IG.flWhy);
            for (let i = 0; i < 16 && IG.gl.getError() !== IG.gl.NO_ERROR; i++);   // clear the error left by the failed attempt
        }
    }
}
// Returns a new canvas with the result, or null when there is nothing for the GPU to do or it cannot do it (-> CPU code).
const igWork = (st, before, luts) => !!(luts || (st && (!geoZero(st.geo) || (!before && (!adjZero(st.adj) || !curveZero(st.curve) || st.hsl.some(b => b[0] || b[1] || b[2]))))));
function igCan(src, st, before, luts) {   // would the graphics card do this one (without trying)?
    if (DBG.force !== 'auto' || !src || src.width < 2 || src.height < 2 || !igWork(st, before, luts) || !igInit()) return false;
    const rot = st ? st.rot & 3 : 0, w = rot & 1 ? src.height : src.width, h = rot & 1 ? src.width : src.height, n = w * h, q = Math.max(1, Math.ceil(Math.sqrt(n / 4e6)));
    const clar = !!st && !before && !adjZero(st.adj) && !!st.adj.clarity;
    return !(Math.max(src.width, src.height) > IG.max || n > IG.maxPx || (clar && (!IG.fl || q > 16)));
}
function igNote(gpu, preview) { IG[preview ? 'usedPrev' : 'usedFull'] = gpu ? 'GPU' : 'CPU'; }   // for the 'Renderer:' line
function indivRendererLabel() {
    const el = $id('indivRenderer'); if (!el) return;
    const p = IG.usedPrev || (IG.tried ? (IG.ok && DBG.force === 'auto' ? 'GPU' : 'CPU') : null), f = IG.usedFull;   // processor chosen (Settings > Performance): never the graphics card
    const cpu = 'CPU' + (parUsable() ? ' (' + PAR.n + ' cores)' : '');
    el.textContent = !p ? '' : 'Renderer: ' + (p === 'GPU' ? 'GPU (WebGL2)' : cpu) + (f && f !== p ? ' (full size: ' + (f === 'GPU' ? 'GPU' : cpu) + ')' : '');
    if (isDebug() && DBG.force !== 'auto') el.textContent += ' [debug: forced ' + (DBG.force === 'single' ? 'one core' : 'several cores') + ']';
    else if (isDebug()) el.textContent += IG.ok ? (IG.fl ? '' : ' [debug: Clarity on CPU: ' + (IG.flWhy || 'no float render targets') + ']') : ' [debug: ' + (IG.why || 'GPU not tried yet') + ']';
    el.title = IG.ok && DBG.force === 'auto' ? 'Edits are computed on the graphics card' + (IG.fl ? '' : ' (Clarity on the CPU)') + '. Photos too big for it are done on the CPU.' : 'Edits are computed on the CPU' + (IG.why ? ': ' + IG.why : '') + '.';
}
function igRender(src, st, before, luts, rf, keep) {   // keep: src never changes (an original or its reduced copy), so it may stay on the card
    const work = igWork(st, before, luts);
    if (DBG.force !== 'auto' || !work || !src || src.width < 2 || src.height < 2 || !igInit()) return null;   // debug can force the CPU paths   // a plain quarter turn is already one drawImage on the CPU path
    try { return igDraw(src, st, before, luts, rf, keep); }
    catch (e) {
        const n = src.width * src.height, gl = IG.gl;
        if (gl && !gl.isContextLost() && n > 2e6) {   // a big photo the card or the browser would not take: CPU for that size only, previews stay on the GPU
            IG.maxPx = Math.min(IG.maxPx, n - 1); console.info('GPU editing: photo too big here, using CPU for it:', e.message || e);
            for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++);   // clear what the failed attempt left
            return null;
        }
        console.info('GPU editing failed, using CPU:', e.message || e); igDrop(e.message || String(e)); return null;
    }
}
function igDraw(src, st, before, luts, rf, keep) {
    const gl = IG.gl, rot = st ? st.rot & 3 : 0, w = rot & 1 ? src.height : src.width, h = rot & 1 ? src.width : src.height;
    const geo = !!st && !geoZero(st.geo), adj = !!st && !before && !adjZero(st.adj), curve = !!st && !before && !curveZero(st.curve), hsl = !!st && !before && st.hsl.some(b => b[0] || b[1] || b[2]);
    const clar = adj && !!st.adj.clarity, n = w * h, q = Math.max(1, Math.ceil(Math.sqrt(n / 4e6)));
    if (Math.max(src.width, src.height) > IG.max || n > IG.maxPx || (clar && (!IG.fl || q > 16))) return null;   // too big for this card, or Clarity without float targets
    const made = [], fbs = [], big = n > 2e6;
    const loc = (p, name) => { const k = name + (p === IG.pMain ? 'M' : p === IG.pLum ? 'L' : 'B'); if (!IG.loc.has(k)) IG.loc.set(k, gl.getUniformLocation(p, name)); return IG.loc.get(k); };
    const tex = (tw, th, ifmt, fmt, type, data) => {
        const t = gl.createTexture(); made.push(t); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (data && !ArrayBuffer.isView(data)) gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, fmt, type, data); else gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, tw, th, 0, fmt, type, data || null);
        return t;
    };
    const lutTex = (L3) => { const a = new Uint8Array(1024); for (let i = 0; i < 256; i++) { a[i * 4] = L3[0][i]; a[i * 4 + 1] = L3[1][i]; a[i * 4 + 2] = L3[2][i]; a[i * 4 + 3] = 255; } return tex(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, a); };
    const target = (t, tw, th) => { const f = gl.createFramebuffer(); fbs.push(f); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete'); gl.viewport(0, 0, tw, th); };
    const bind = (list) => { for (let u = 0; u < 6; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, list[u] || null); } };   // only what this pass reads (no feedback loops)
    const draw = () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    try {
        const tSrc = keep && src.width * src.height <= IG_KEEP_PX ? igSrcTex(gl, src) : tex(0, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
        let tTone = null, tCurve = null, tHsl = null, tMatch = null, P = null;
        if (adj) { const T = adjToneLut(st.adj); tTone = lutTex([T, T, T]); }
        if (curve) tCurve = lutTex(curveLuts(st.curve));
        if (hsl) { const H = hslLut(st.hsl), a = new Float32Array(360 * 4); for (let i = 0; i < 360; i++) { a[i * 4] = H.dh[i]; a[i * 4 + 1] = H.sm[i]; a[i * 4 + 2] = H.la[i]; } tHsl = tex(360, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, a); }
        if (luts) tMatch = lutTex(luts);
        if (geo) P = geoParams(st.geo, w, h);
        const pm = IG.pMain, setMain = (o) => {   // uniforms of the main pass
            gl.useProgram(pm);
            ['uSrc', 'uTone', 'uBlur', 'uCurveT', 'uHslT', 'uMatchT'].forEach((s, u) => gl.uniform1i(loc(pm, s), u));
            gl.uniform2i(loc(pm, 'uSrcSize'), o.sw, o.sh); gl.uniform2i(loc(pm, 'uOut'), w, h); gl.uniform1i(loc(pm, 'uFlip'), o.flip); gl.uniform1i(loc(pm, 'uRot'), o.rot);
            gl.uniform1i(loc(pm, 'uGeo'), o.geo ? 1 : 0); gl.uniform1i(loc(pm, 'uAdj'), o.adj ? 1 : 0); gl.uniform1i(loc(pm, 'uClar'), o.clar ? 1 : 0); gl.uniform1i(loc(pm, 'uCurve'), o.curve ? 1 : 0);
            gl.uniform1i(loc(pm, 'uHsl'), o.hsl ? 1 : 0); gl.uniform1i(loc(pm, 'uMatch'), o.match ? 1 : 0); gl.uniform1i(loc(pm, 'uQ'), q);
            if (o.geo) { gl.uniform4f(loc(pm, 'uG0'), P.cx, P.cy, P.co, P.si); gl.uniform4f(loc(pm, 'uG1'), P.kv, P.kh, P.kl, P.s / P.R); gl.uniform1f(loc(pm, 'uGR'), P.R); }
            if (o.adj) { const tg = st.adj.temperature / 100 * 0.25; gl.uniform3f(loc(pm, 'uWb'), 1 + tg, 1 - st.adj.tint / 100 * 0.25, 1 - tg); gl.uniform2f(loc(pm, 'uSat'), 1 + st.adj.saturation / 100, st.adj.vibrance / 100); }
        };
        const toCanvas = () => {   // last pass draws into the WebGL canvas, rows top-down
            if (IG.cv.width !== w || IG.cv.height !== h) { IG.cv.width = w; IG.cv.height = h; }
            if (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h) throw new Error('drawing buffer too small');
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
        };
        if (!clar) {   // one pass does everything
            toCanvas(); setMain({ sw: src.width, sh: src.height, flip: 1, rot, geo, adj, clar: false, curve, hsl, match: !!luts });
            bind([tSrc, tTone, null, tCurve, tHsl, tMatch]); draw();
        } else {
            // 1) turn + geometry + exposure / tone / white balance -> A
            const tA = tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null); target(tA, w, h);
            setMain({ sw: src.width, sh: src.height, flip: 0, rot, geo, adj: true, clar: false, curve: false, hsl: false, match: false });
            bind([tSrc, tTone]); draw();
            // 2) lightness grid (q x q averages above 4 MP), then 3 x (horizontal + vertical) box blur, like clarityPass
            const gw = Math.ceil(w / q), gh = Math.ceil(h / q), r0 = Math.max(2, Math.round(Math.min(w, h) * 0.012)), r = q === 1 ? r0 : Math.max(1, Math.round(r0 / q));
            const t1 = tex(gw, gh, gl.R32F, gl.RED, gl.FLOAT, null), t2 = tex(gw, gh, gl.R32F, gl.RED, gl.FLOAT, null);
            target(t1, gw, gh); gl.useProgram(IG.pLum); gl.uniform1i(loc(IG.pLum, 'uA'), 0); gl.uniform2i(loc(IG.pLum, 'uSz'), w, h); gl.uniform1i(loc(IG.pLum, 'uQ'), q); bind([tA]); draw();
            gl.useProgram(IG.pBlur); gl.uniform1i(loc(IG.pBlur, 'uB'), 0); gl.uniform2i(loc(IG.pBlur, 'uSz'), gw, gh); gl.uniform1i(loc(IG.pBlur, 'uR'), r);
            for (let it = 0; it < 3; it++) {
                target(t2, gw, gh); gl.uniform1i(loc(IG.pBlur, 'uDir'), 0); bind([t1]); draw();
                target(t1, gw, gh); gl.uniform1i(loc(IG.pBlur, 'uDir'), 1); bind([t2]); draw();
            }
            // 3) Clarity + curve + color mixer + match colors, from A
            toCanvas(); setMain({ sw: w, sh: h, flip: 1, rot: 0, geo: false, adj: false, clar: true, curve, hsl, match: !!luts });
            gl.uniform2i(loc(pm, 'uBS'), gw, gh); gl.uniform1f(loc(pm, 'uCk'), st.adj.clarity / 100 * 1.2 * 4);
            bind([tA, null, t1, tCurve, tHsl, tMatch]); draw();
        }
        const err = gl.getError();
        if (err === gl.OUT_OF_MEMORY) { IG.maxPx = Math.min(IG.maxPx, n - 1); return null; }   // this size is too much for the card: CPU for it from now on
        if (err !== gl.NO_ERROR || gl.isContextLost()) throw new Error('WebGL error ' + err);
        const out = mkCanvas(w, h); out.getContext('2d').drawImage(IG.cv, 0, 0);   // stays on the graphics card (not 'willReadFrequently'): no copy back to memory
        return out;
    } finally {
        bind([]); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        fbs.forEach(f => gl.deleteFramebuffer(f)); made.forEach(t => gl.deleteTexture(t));
        if (big && IG.cv) { IG.cv.width = IG.cv.height = 1; }   // give the memory of a full-size result back right away
    }
}

// --- Anaglyph view straight from the photos kept on the graphics card (WebGL2) ---
// The live anaglyph used to make two aligned copies of the photos and send both to the card on every redraw.
// Here the reduced photos stay on the card and the crop, offset, rotation, scale and floating window are done by the
// card while it mixes the colors. Checked once against the old way; any problem -> the old way (WebGL1 or CPU).
const ANA2 = { tried: false, ok: false, prog: null, why: '' };
const ANA_MATS = { classic: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], halfcolor: [0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1],
    optimized: [0, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], grayscale: [0.299, 0.587, 0.114, 0, 0, 0, 0, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0, 0.299, 0.587, 0.114],
    redblue: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], greenmagenta: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    dubois: [0.456, 0.500, 0.176, -0.043, -0.088, -0.002, -0.040, -0.038, -0.016, 0.378, 0.734, -0.018, -0.015, -0.021, -0.005, -0.072, -0.113, 1.226] };   // the formulas of anaglyphCPU as matrices
const anaMat = (mode) => mode === 'custom' ? ANA_MIX : (ANA_MATS[mode] || ANA_MATS.classic);
const IG_ANA = IG_HEAD + `
    uniform sampler2D uL, uR; uniform ivec2 uOut, uL0, uR0; uniform int uFast, uFw, uSoft; uniform vec2 uSize, uRc, uRot; uniform float uK, uM[18];
    float ramp(float t){ return t <= 0.45 ? 1.0 : max(0.0, 1.0 - (t - 0.45) / 0.55); }   // the soft floating-window gradient
    void main(){
        ivec2 p = ivec2(gl_FragCoord.xy); p.y = uOut.y - 1 - p.y;
        vec3 l = texelFetch(uL, uL0 + p, 0).rgb, r;
        if (uFast == 1) r = texelFetch(uR, uR0 + p, 0).rgb;   // plain crop
        else {   // inverse of placeR: offset, rotation and scale around the centre, bilinear like drawImage
            vec2 P = vec2(p) + 0.5 - uRc, s = vec2(uRot.x * P.x + uRot.y * P.y, -uRot.y * P.x + uRot.x * P.y) / uK + uSize * 0.5;
            r = (s.x < 0.0 || s.y < 0.0 || s.x > uSize.x || s.y > uSize.y) ? vec3(0.0) : texture(uR, s / uSize).rgb;
        }
        if (uFw > 0) { float X = float(p.x) + 0.5, fw = float(uFw), W = float(uOut.x);
            if (X < fw) l *= 1.0 - (uSoft == 1 ? ramp(X / fw) : 1.0);
            if (X > W - fw) r *= 1.0 - (uSoft == 1 ? ramp((W - X) / fw) : 1.0); }
        vec3 c = vec3(uM[0] * l.r + uM[1] * l.g + uM[2] * l.b + uM[3] * r.r + uM[4] * r.g + uM[5] * r.b,
                      uM[6] * l.r + uM[7] * l.g + uM[8] * l.b + uM[9] * r.r + uM[10] * r.g + uM[11] * r.b,
                      uM[12] * l.r + uM[13] * l.g + uM[14] * l.b + uM[15] * r.r + uM[16] * r.g + uM[17] * r.b);
        o = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`;
function anaGpuInit() {
    const card = igInit();   // (re)starts the graphics context if it was lost and came back
    if (ANA2.tried && !(ANA2.ok && card && ANA2.gl !== IG.gl)) return ANA2.ok && card && ANA2.gl === IG.gl;   // checked once (again after the card came back)
    ANA2.tried = true; ANA2.ok = false;
    try {
        if (!igInit()) throw new Error('no WebGL2');
        const gl = IG.gl, sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
        const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, IG_VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, IG_ANA)); gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
        ANA2.prog = p; ANA2.gl = gl; ANA2.loc = {};
        // check against the old way: aligned copies + anaglyphCPU
        const w = 83, h = 57, mk = (f) => { const c = mkCanvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h); for (let y = 0, i = 0; y < h; y++) for (let k = 0; k < w; k++, i += 4) { const v = f(k, y); id.data[i] = v[0]; id.data[i + 1] = v[1]; id.data[i + 2] = v[2]; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); return c; };
        const sm = (v) => Math.round(128 + 100 * v);   // smooth pictures: the smoothing filters of different browsers agree on them
        const sL = mk((x, y) => [sm(Math.sin(x / 6 + y / 9)), sm(Math.cos(y / 7)), sm(Math.sin((x + y) / 11))]), sR = mk((x, y) => [sm(Math.cos(x / 8 - y / 10)), sm(Math.sin(x / 5)), sm(Math.cos((x - y) / 9))]);
        const pix = (c) => { const t = mkCanvas(c.width, c.height), x = t.getContext('2d'); x.drawImage(c, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
        const tests = [[{ x0: 4, y0: 3, w: 75, h: 52, dx: 4, dy: 3, fallback: false }, { rot: 0, k: 1, fpct: 4, soft: false }, 'dubois', 0.3, 0.01],
            [{ x0: 0, y0: 2, w: 79, h: 55, dx: -4, dy: 2, fallback: false }, { rot: 0, k: 1, fpct: 6, soft: true }, 'halfcolor', 0.6, 0.02],
            [{ x0: 6, y0: 5, w: 70, h: 46, dx: 3, dy: -2, fallback: false }, { rot: 2.5, k: 1.04, fpct: 0, soft: false }, 'custom', 2.5, 0.06]];   // bilinear sampling differs a little between browsers
        for (const [c, A, mode, maxMean, maxFar] of tests) {
            const g = anaGpuDraw(sL, sR, c, A, mode); if (!g) throw new Error('no result');
            const L = mkCanvas(c.w, c.h), R = mkCanvas(c.w, c.h); drawAlignedP(L.getContext('2d'), 'L', c.w, c.h, c, sL, sR, A); drawAlignedP(R.getContext('2d'), 'R', c.w, c.h, c, sL, sR, A);
            const exp = new Uint8ClampedArray(c.w * c.h * 4); anaglyphCPU(pix(L), pix(R), exp, mode); const got = pix(g); let sum = 0, far = 0;
            for (let i = 0; i < exp.length; i++) { if ((i & 3) === 3) continue; const e = Math.abs(exp[i] - got[i]); sum += e; if (e > 6) far++; }
            if (sum / (exp.length * 0.75) > maxMean || far > exp.length * 0.75 * maxFar) throw new Error('self-test mismatch (' + mode + ', mean ' + (sum / (exp.length * 0.75)).toFixed(2) + ', ' + (far / (exp.length * 0.75) * 100).toFixed(1) + '% off)');
        }
        ANA2.ok = true;
    } catch (e) { console.info('GPU anaglyph view unavailable, using the previous way:', e.message || e); ANA2.why = e.message || String(e); ANA2.ok = false; }
    return ANA2.ok;
}
// Draws the anaglyph of sL / sR (crop c, alignment A) into the WebGL canvas and returns it, or null.
function anaGpuDraw(sL, sR, c, A, mode) {
    const gl = IG.gl, p = ANA2.prog, w = c.w, h = c.h;
    if (!gl || gl !== ANA2.gl || gl.isContextLost() || w < 1 || h < 1 || Math.max(sL.width, sL.height, w, h) > IG.max || sL.width !== sR.width || sL.height !== sR.height) return null;
    const L = (n) => (n in ANA2.loc) ? ANA2.loc[n] : (ANA2.loc[n] = gl.getUniformLocation(p, n));
    const tL = igSrcTex(gl, sL), tR = igSrcTex(gl, sR);   // kept on the card: sent once per photo, not once per redraw
    gl.bindTexture(gl.TEXTURE_2D, tR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);   // smooth for rotation / scale
    if (IG.cv.width !== w || IG.cv.height !== h) { IG.cv.width = w; IG.cv.height = h; }
    if (gl.drawingBufferWidth !== w || gl.drawingBufferHeight !== h) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.useProgram(p);
    for (let u = 0; u < 6; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, u === 0 ? tL : u === 1 ? tR : null); }
    const fast = !A.rot && A.k === 1 && !c.fallback, th = A.rot * Math.PI / 180;
    gl.uniform1i(L('uL'), 0); gl.uniform1i(L('uR'), 1); gl.uniform2i(L('uOut'), w, h); gl.uniform2i(L('uL0'), c.x0, c.y0); gl.uniform2i(L('uR0'), c.x0 - c.dx, c.y0 - c.dy);
    gl.uniform1i(L('uFast'), fast ? 1 : 0); gl.uniform1i(L('uFw'), Math.round(w * A.fpct / 100)); gl.uniform1i(L('uSoft'), A.soft ? 1 : 0);
    gl.uniform2f(L('uSize'), sR.width, sR.height); gl.uniform2f(L('uRc'), sR.width / 2 + c.dx - c.x0, sR.height / 2 + c.dy - c.y0); gl.uniform2f(L('uRot'), Math.cos(th), Math.sin(th));
    gl.uniform1f(L('uK'), A.k); gl.uniform1fv(L('uM[0]'), new Float32Array(anaMat(mode)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (let u = 0; u < 2; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
    const err = gl.getError(); if (err !== gl.NO_ERROR || gl.isContextLost()) throw new Error('WebGL error ' + err);
    return IG.cv;
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
