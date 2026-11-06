/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- ANIMATION ---
function renderWiggleLoop(timestamp) {
    if (!isPlaying || !imagesLoaded || currentTab !== 'wiggle' || isAligning) { animationId = null; return; }
    const speed = parseInt(speedRange.value); const elapsed = timestamp - lastSwapTime;
    const c = getCropRect(true); const w = c.w, h = c.h; const resized = syncWiggleSize(c);

    if (interpolateCheck.checked) {
        const progress = Math.max(0, Math.min(elapsed / speed, 1.0)); const alpha = Math.sin(progress * (Math.PI / 2));
        const base = currentFrame === 0 ? 'L' : 'R', over = currentFrame === 0 ? 'R' : 'L';
        wiggleCtx.clearRect(0, 0, w, h);
        drawAligned(wiggleCtx, base, w, h, c, true); wiggleCtx.globalAlpha = alpha; drawAligned(wiggleCtx, over, w, h, c, true);
        wiggleCtx.globalAlpha = 1.0;
        if (elapsed >= speed) { currentFrame = 1 - currentFrame; lastSwapTime = timestamp; }
    } else {
        const swap = elapsed >= speed;
        if (swap) { currentFrame = 1 - currentFrame; lastSwapTime = timestamp - (elapsed % speed); }
        if (swap || resized) { wiggleCtx.clearRect(0, 0, w, h); drawAligned(wiggleCtx, currentFrame === 0 ? 'L' : 'R', w, h, c, true); }
    }
    animationId = requestAnimationFrame(renderWiggleLoop);
}

function updatePlayButtonIcon() {
    btnPlayPause.innerHTML = isPlaying 
        ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.6" height="15" rx="1.4"></rect><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.4"></rect></svg>`
        : `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 4.6v14.8a1.1 1.1 0 0 0 1.68.94l11.6-7.4a1.1 1.1 0 0 0 0-1.88L9.18 3.66A1.1 1.1 0 0 0 7.5 4.6z"></path></svg>`;
}

btnPlayPause.addEventListener('click', () => {
    if (isAligning) { wasPlayingBeforeAlign = true; endAlignment(); return; }   // Play while in ghost view: resume
    isPlaying = !isPlaying; updatePlayButtonIcon(); if (!isPlaying) scheduleAlignWarm(800);   // paused: prepare auto-align now
    if (isPlaying && currentTab === 'wiggle') {
        lastSwapTime = performance.now(); if (!animationId) animationId = requestAnimationFrame(renderWiggleLoop);
    } else {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        if (!isPlaying && imagesLoaded && !isAligning) {
            currentFrame = 0; drawWiggleStatic(0);
        }
    }
});

// pv=true works on the reduced preview frames (offsets scaled to match); pv=false on full resolution.
function cropRatio() {
    const v = document.getElementById('cropAspect').value; if (v === 'free' || v === 'custom') return 0;
    const [x, y] = v.split(':').map(Number); return x / y;
}
function getCropRect(pv) {
    ensureFrames();   // full-size frames up to date (Individual Images edits are applied lazily)
    const F = pv ? pvL : frameL, k = pv ? pvScale : 1; const w = F.width, h = F.height;
    const dx = Math.round(offsetX * k) || 0, dy = Math.round(offsetY * k) || 0;
    let cw = w - Math.abs(dx), ch = h - Math.abs(dy);
    if (cw < 2 || ch < 2) return { x0: 0, y0: 0, w, h, dx, dy, fallback: true };
    let x0 = Math.max(0, dx), y0 = Math.max(0, dy); const ar = cropRatio();
    if (document.getElementById('cropAspect').value === 'custom' && !(pv && cropEditing)) {   // custom crop: normalised rectangle inside the common area (the preview shows the whole area while its handles are being edited)
        const k = customCrop, ox = x0, oy = y0, ow = cw, oh = ch;
        const nx = Math.min(ox + ow - 2, ox + Math.round(k.x * ow)), ny = Math.min(oy + oh - 2, oy + Math.round(k.y * oh));
        x0 = nx; y0 = ny; cw = Math.max(2, Math.min(ox + ow - nx, Math.round(k.w * ow))); ch = Math.max(2, Math.min(oy + oh - ny, Math.round(k.h * oh)));
    }
    if (ar) {   // centred crop to the chosen aspect ratio inside the common area
        let nw = cw, nh = Math.round(cw / ar); if (nh > ch) { nh = ch; nw = Math.round(ch * ar); }
        if (nw >= 2 && nh >= 2) { x0 += (cw - nw) >> 1; y0 += (ch - nh) >> 1; cw = nw; ch = nh; }
    }
    if (rotDeg || scaleK !== 1) {   // shrink the crop until it lies fully inside the rotated/scaled right image
        const th = rotDeg * Math.PI / 180, co = Math.cos(th), si = Math.sin(th), A = w * scaleK / 2, B = h * scaleK / 2, rx = w / 2 + dx, ry = h / 2 + dy;
        for (let t = 1; t > 0.4; t -= 0.01) {
            const nw = cw * t, nh = ch * t, ax = x0 + (cw - nw) / 2, ay = y0 + (ch - nh) / 2; let ok = true;
            for (const [px, py] of [[ax, ay], [ax + nw, ay], [ax, ay + nh], [ax + nw, ay + nh]]) { const X = px - rx, Y = py - ry; if (Math.abs(X * co + Y * si) > A || Math.abs(-X * si + Y * co) > B) { ok = false; break; } }
            if (ok) { x0 = Math.round(ax); y0 = Math.round(ay); cw = Math.max(2, Math.round(nw)); ch = Math.max(2, Math.round(nh)); break; }
        }
    }
    return { x0, y0, w: cw, h: ch, dx, dy, fallback: false };
}

function drawAligned(ctx, which, dw, dh, c, pv) {
    ensureFrames();   // full-size frames up to date (Individual Images edits are applied lazily)
    const sL = pv ? pvL : frameL, sR = pv ? pvR : frameR;
    c = c || getCropRect(pv);
    drawAlignedP(ctx, which, dw, dh, c, sL, sR, { rot: rotDeg, k: scaleK, fpct: floatPct, soft: floatSoft });
}
function drawAlignedP(ctx, which, dw, dh, c, sL, sR, A) {   // the same, with the alignment given (A: rot, k, fpct, soft)
    const fw = Math.round(dw * A.fpct / 100);   // floating window: black bar on the left edge of L and the right edge of R
    if (which === 'L') { ctx.drawImage(sL, c.x0, c.y0, c.w, c.h, 0, 0, dw, dh); if (fw) floatBar(ctx, true, fw, dw, dh, A.soft); return; }
    if (!A.rot && A.k === 1 && !c.fallback) ctx.drawImage(sR, c.x0 - c.dx, c.y0 - c.dy, c.w, c.h, 0, 0, dw, dh);   // fast path: plain crop, no transform
    else { ctx.save(); ctx.scale(dw / c.w, dh / c.h); ctx.translate(-c.x0, -c.y0); placeR(ctx, sR, c.dx, c.dy, A.rot, A.k); ctx.restore(); }
    if (fw) floatBar(ctx, false, fw, dw, dh, A.soft);
}
function floatBar(ctx, left, fw, dw, dh, soft = floatSoft) {   // solid, or solid at the frame edge fading towards the picture (reduces the 'hard' window edge)
    const x0 = left ? 0 : dw - fw;
    if (!soft) { ctx.fillStyle = '#000'; ctx.fillRect(x0, 0, fw, dh); return; }
    const g = left ? ctx.createLinearGradient(0, 0, fw, 0) : ctx.createLinearGradient(dw, 0, dw - fw, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x0, 0, fw, dh);
}

function getAlignedFrames(pv) {
    const c = getCropRect(pv);
    const L = mkCanvas(c.w, c.h), R = mkCanvas(c.w, c.h);
    drawAligned(L.getContext('2d'), 'L', c.w, c.h, c, pv);
    drawAligned(R.getContext('2d'), 'R', c.w, c.h, c, pv);
    return { L, R, w: c.w, h: c.h };
}

function syncWiggleSize(c) {
    if (wiggleCanvas.width !== c.w || wiggleCanvas.height !== c.h) { wiggleCanvas.width = c.w; wiggleCanvas.height = c.h; return true; }
    return false;
}

// The wiggle is drawn by the browser's own 2D canvas, which the browser runs on the graphics card whenever it has a usable one.
let wigGpu = null, wigInfo = '';
function wigRendererLabel() {
    const el = document.getElementById('wigRenderer'); if (!el) return;
    if (wigGpu === null) {   // once: is there a real graphics card (not a software stand-in)?
        try {
            const c = document.createElement('canvas'); c.width = c.height = 1;
            const g = c.getContext('webgl2') || c.getContext('webgl');
            wigInfo = g ? String(g.getParameter(g.RENDERER) || '') : 'no WebGL';
            if (g && /^webkit webgl$/i.test(wigInfo)) { const dbg = g.getExtension('WEBGL_debug_renderer_info'); if (dbg) wigInfo = String(g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || wigInfo); }   // some browsers report a generic name; the real one is behind this
            wigGpu = !!g && !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(wigInfo);
            const lc = g && g.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext();   // the test context is not kept
        } catch (e) { wigGpu = false; wigInfo = e.message || String(e); }
    }
    el.textContent = 'Renderer: ' + (wigGpu ? 'GPU' : 'CPU') + ' (browser canvas)' + (isDebug() ? ' [debug: ' + wigInfo + ']' : '');
    el.title = wigGpu ? 'The browser draws the animation on the graphics card.' : 'No graphics card available to the browser: it draws the animation on the CPU.';
}
function drawWiggleStatic(idx) {
    if (!imagesLoaded) return;
    wigRendererLabel();
    const c = getCropRect(true); syncWiggleSize(c);
    wiggleCtx.globalAlpha = 1.0; wiggleCtx.clearRect(0, 0, c.w, c.h);
    drawAligned(wiggleCtx, idx === 0 ? 'L' : 'R', c.w, c.h, c, true);
}

// --- ANAGLYPH (WebGL when supported, automatic CPU fallback) ---
document.getElementById('anaglyphMode').addEventListener('change', generateAnaglyph);
(function anaMixSetup() {   // custom anaglyph matrix editor
    try { const m = JSON.parse(localStorage.getItem('3dtool-anamix')); if (Array.isArray(m) && m.length === 18 && m.every(Number.isFinite)) ANA_MIX = m; } catch (e) { }
    const grid = document.getElementById('anaMixGrid'), heads = ['', 'L R', 'L G', 'L B', 'R R', 'R G', 'R B'], rows = ['Red', 'Green', 'Blue'], cells = [];
    heads.forEach(h => { const d = document.createElement('div'); d.className = 'mix-head'; d.textContent = h; grid.appendChild(d); });
    let raf = 0; const redraw = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (imagesLoaded && currentTab === 'anaglyph') generateAnaglyph(); }); };
    rows.forEach((name, r) => {
        const d = document.createElement('div'); d.className = 'mix-head'; d.textContent = name; grid.appendChild(d);
        for (let c = 0; c < 6; c++) {
            const k = r * 6 + c, el = document.createElement('input'); el.type = 'number'; el.step = '0.01'; el.min = '-3'; el.max = '3'; el.className = 'mix-cell'; el.setAttribute('aria-label', name + ' output from ' + heads[c + 1]); cells.push(el);
            el.addEventListener('input', () => { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; ANA_MIX[k] = Math.max(-3, Math.min(3, v)); try { localStorage.setItem('3dtool-anamix', JSON.stringify(ANA_MIX)); } catch (e) { } redraw(); });
            grid.appendChild(el);
        }
    });
    const fill = () => cells.forEach((el, k) => { el.value = ANA_MIX[k]; });
    fill(); anaMixFill = fill;
    document.getElementById('btnAnaMixLoad').addEventListener('click', () => { const p = ANA_PRESETS[document.getElementById('anaMixPreset').value]; if (!p) return; ANA_MIX = p.slice(); fill(); try { localStorage.setItem('3dtool-anamix', JSON.stringify(ANA_MIX)); } catch (e) { } redraw(); });
    const showPanel = () => { document.getElementById('anaMixPanel').style.display = document.getElementById('anaglyphMode').value === 'custom' ? 'block' : 'none'; };
    ['change', 'input'].forEach(ev => document.getElementById('anaglyphMode').addEventListener(ev, showPanel)); showPanel();
})();

const ANA_MODES = { classic: 0, halfcolor: 1, optimized: 2, dubois: 3, grayscale: 4, redblue: 5, greenmagenta: 6 };
const GL = { tried: false, ok: false, gl: null, canvas: null, tex: [], maxTex: 0, uMode: null };

function anaglyphCPU(dL, dR, out, mode) {
    for (let i = 0; i < dL.length; i += 4) {
        const rL = dL[i], gL = dL[i+1], bL = dL[i+2], rR = dR[i], gR = dR[i+1], bR = dR[i+2]; let r, g, b;
        switch (mode) {
            case 'dubois':
                r = 0.456*rL + 0.500*gL + 0.176*bL - 0.043*rR - 0.088*gR - 0.002*bR;
                g = -0.040*rL - 0.038*gL - 0.016*bL + 0.378*rR + 0.734*gR - 0.018*bR;
                b = -0.015*rL - 0.021*gL - 0.005*bL - 0.072*rR - 0.113*gR + 1.226*bR; break;
            case 'optimized': r = 0.7*gL + 0.3*bL; g = gR; b = bR; break;
            case 'halfcolor': r = 0.299*rL + 0.587*gL + 0.114*bL; g = gR; b = bR; break;
            case 'grayscale': r = 0.299*rL + 0.587*gL + 0.114*bL; g = b = 0.299*rR + 0.587*gR + 0.114*bR; break;
            case 'redblue': r = rL; g = 0; b = bR; break;
            case 'greenmagenta': r = rR; g = gL; b = bR; break;
            case 'custom': { const m = ANA_MIX; r = m[0]*rL + m[1]*gL + m[2]*bL + m[3]*rR + m[4]*gR + m[5]*bR; g = m[6]*rL + m[7]*gL + m[8]*bL + m[9]*rR + m[10]*gR + m[11]*bR; b = m[12]*rL + m[13]*gL + m[14]*bL + m[15]*rR + m[16]*gR + m[17]*bR; break; }
            default: r = rL; g = gR; b = bR;
        }
        out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = 255;
    }
}

function anaglyphGL(L, R, mode, w, h) {
    const gl = GL.gl;
    if (gl.isContextLost()) { GL.ok = false; return null; }
    if (w > GL.maxTex || h > GL.maxTex) return null;               // too big for this GPU -> caller uses CPU
    if (GL.canvas.width !== w || GL.canvas.height !== h) { GL.canvas.width = w; GL.canvas.height = h; }
    gl.viewport(0, 0, w, h);
    [L, R].forEach((src, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, GL.tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); });
    gl.uniform1f(GL.uMode, ANA_MODES[mode] || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return GL.canvas;
}

// Detects WebGL, builds the shader and verifies it against the CPU result once. Any failure -> CPU path.
function initGL() {
    if (GL.tried) return GL.ok;
    GL.tried = true;
    try {
        const c = document.createElement('canvas'); c.width = c.height = 4;
        const opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true };
        const gl = c.getContext('webgl', opts) || c.getContext('experimental-webgl', opts);
        if (!gl) return false;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 aPos;varying vec2 vUv;void main(){vUv=aPos*0.5+0.5;gl_Position=vec4(aPos,0.0,1.0);}'));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 vUv;uniform sampler2D uL;uniform sampler2D uR;uniform float uMode;
            void main(){
                vec3 l=texture2D(uL,vUv).rgb, r=texture2D(uR,vUv).rgb, o; vec3 lum=vec3(0.299,0.587,0.114);
                if(uMode<0.5){o=vec3(l.r,r.g,r.b);}
                else if(uMode<1.5){o=vec3(dot(l,lum),r.g,r.b);}
                else if(uMode<2.5){o=vec3(0.7*l.g+0.3*l.b,r.g,r.b);}
                else if(uMode<3.5){o=vec3(dot(l,vec3(0.456,0.500,0.176))+dot(r,vec3(-0.043,-0.088,-0.002)),dot(l,vec3(-0.040,-0.038,-0.016))+dot(r,vec3(0.378,0.734,-0.018)),dot(l,vec3(-0.015,-0.021,-0.005))+dot(r,vec3(-0.072,-0.113,1.226)));}
                else if(uMode<4.5){float y=dot(r,lum);o=vec3(dot(l,lum),y,y);}
                else if(uMode<5.5){o=vec3(l.r,0.0,r.b);}
                else {o=vec3(r.r,l.g,r.b);}
                gl_FragColor=vec4(clamp(o,0.0,1.0),1.0);
            }`));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        for (let i = 0; i < 2; i++) {
            const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            GL.tex[i] = t;
        }
        gl.uniform1i(gl.getUniformLocation(prog, 'uL'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'uR'), 1);
        GL.uMode = gl.getUniformLocation(prog, 'uMode'); GL.gl = gl; GL.canvas = c; GL.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); GL.ok = false; });
        c.addEventListener('webglcontextrestored', () => { GL.tried = false; GL.ok = false; });   // rebuilt (and re-checked) on the next use
        // self-test against the CPU implementation
        const n = 4, mkT = (f) => { const t = mkCanvas(n, n), x = t.getContext('2d'); for (let i = 0; i < n * n; i++) { x.fillStyle = f(i); x.fillRect(i % n, (i / n) | 0, 1, 1); } return t; };
        const tL = mkT(i => `rgb(${i * 15},${255 - i * 12},${(i * 40) % 256})`), tR = mkT(i => `rgb(${(i * 53) % 256},${i * 9},${255 - i * 16})`);
        const getD = (cv) => cv.getContext('2d').getImageData(0, 0, n, n).data, dL = getD(tL), dR = getD(tR);   // read once, not once per mode
        for (const m of ['classic', 'halfcolor', 'optimized', 'dubois', 'grayscale', 'redblue', 'greenmagenta']) {
            const g = anaglyphGL(tL, tR, m, n, n); if (!g) throw new Error('self-test');
            const o = mkCanvas(n, n); o.getContext('2d').drawImage(g, 0, 0);
            const exp = new Uint8ClampedArray(n * n * 4); anaglyphCPU(dL, dR, exp, m); const got = getD(o);
            for (let i = 0; i < exp.length; i++) if (Math.abs(exp[i] - got[i]) > 4) throw new Error('self-test mismatch in ' + m);
        }
        GL.ok = true;
    } catch (e) { console.info('WebGL anaglyph unavailable, using CPU:', e.message || e); GL.ok = false; }
    return GL.ok;
}

// Draws the anaglyph (or cross-eye pair) for the current alignment into any canvas. Returns 'GPU' | 'CPU'.
function renderAnaglyphTo(canvas, pv) {
    const mode = document.getElementById('anaglyphMode').value, ctx = canvas.getContext('2d');
    if (pv && mode !== 'crosseye' && mode !== 'parallel' && DBG.force === 'auto' && anaGpuInit()) {   // live view: straight from the photos kept on the graphics card
        try {
            const c = getCropRect(true), g = anaGpuDraw(pvL, pvR, c, { rot: rotDeg, k: scaleK, fpct: floatPct, soft: floatSoft }, mode);
            if (g) { if (canvas.width !== c.w || canvas.height !== c.h) { canvas.width = c.w; canvas.height = c.h; } ctx.drawImage(g, 0, 0); return 'GPU2'; }
        } catch (e) { console.info('GPU anaglyph view failed, using the previous way:', e.message || e); ANA2.ok = false; }
    }
    const al = getAlignedFrames(pv), w = al.w, h = al.h;
    if (mode === 'crosseye' || mode === 'parallel') { canvas.width = w * 2; canvas.height = h; const [a, b] = mode === 'crosseye' ? [al.R, al.L] : [al.L, al.R]; ctx.drawImage(a, 0, 0, w, h); ctx.drawImage(b, w, 0, w, h); releaseCanvas(al.L); releaseCanvas(al.R); return 'CPU'; }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (mode !== 'custom' && DBG.force === 'auto' && initGL()) {   // the custom matrix is computed on the CPU (and debug can force the CPU)
        try { const g = anaglyphGL(al.L, al.R, mode, w, h); if (g) { ctx.drawImage(g, 0, 0); releaseCanvas(al.L); releaseCanvas(al.R); return 'GPU'; } }
        catch (e) { console.info('WebGL failed, falling back to CPU:', e); GL.ok = false; }
    }
    const dL = al.L.getContext('2d').getImageData(0, 0, w, h).data, dR = al.R.getContext('2d').getImageData(0, 0, w, h).data;
    releaseCanvas(al.L); releaseCanvas(al.R);   // pixels already read
    const img = ctx.createImageData(w, h); anaglyphCPU(dL, dR, img.data, mode); ctx.putImageData(img, 0, 0);
    return 'CPU';
}

function generateAnaglyph() {
    if (!imagesLoaded || isAligning) return;
    const r = renderAnaglyphTo(anaglyphCanvas, true);
    const lbl = document.getElementById('anaRenderer'); if (lbl) lbl.innerText = (r === 'GPU2' ? 'Renderer: GPU (WebGL2)' : r === 'GPU' ? 'Renderer: GPU (WebGL)' : 'Renderer: CPU') + (isDebug() && r !== 'GPU2' ? ' [debug: WebGL2 view: ' + (DBG.force !== 'auto' ? 'CPU forced' : (ANA2.why || IG.why || 'not used for this mode')) + ']' : '');
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
