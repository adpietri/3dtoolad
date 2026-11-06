/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// === POLISH & SAFETY NET (isolated additions) ===
document.title = APP.label;
document.querySelector('.navbar-brand').textContent = APP.header;
if (isDebug()) { const dw = document.createElement('span'); dw.className = 'dbg-word'; dw.textContent = 'Debug'; document.querySelector('.navbar-brand').appendChild(dw); }   // hidden on narrow phones (the debug button shows it)

if (isDebug()) DBG.log = [];
// --- DEBUG: the debug panel button (first in the header). Nothing here exists or runs unless the address has ?debug=yes ---
if (isDebug()) (function debugButton() {
    const btn = document.createElement('button'); btn.id = 'btnDebug'; btn.type = 'button'; btn.title = 'Debug panel'; btn.setAttribute('aria-label', 'Debug panel');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="13" rx="2"></rect><path d="M5.5 10.5h3l1.6-3.2 2.6 6.4 1.7-3.2h4.1"></path><path d="M8.5 20.5h7M12 16.5v4"></path></svg>';
    btn.addEventListener('click', () => debugPanel());
    const actions = document.querySelector('.top-actions'); actions.insertBefore(btn, actions.firstChild);
    let peak = 0;
    const estimate = () => {   // images and files held by the program (the browser does not report a page's real total)
        const seen = new Set(); let bytes = 0;
        const add = (c) => { if (c && c.width && c.height && !seen.has(c)) { seen.add(c); bytes += c.width * c.height * 4; } };
        [frameL, frameR, pvL, pvR, indiv.base.L, indiv.base.R, sbsAl && sbsAl.L, sbsAl && sbsAl.R, GL.canvas].forEach(add);
        Object.values(indiv.cache || {}).forEach(e => add(e && e.cv)); Object.values(indiv.gen || {}).forEach(e => add(e && e.cv));
        ['wiggleCanvas', 'anaglyphCanvas', 'sbsPreviewCanvas', 'indivCanvasL', 'indivCanvasR'].forEach(id => add(document.getElementById(id)));
        [origL, origR, exifBuf].forEach(b => { if (b && b.byteLength && !seen.has(b)) { seen.add(b); bytes += b.byteLength; } });
        return bytes;
    };
    const tick = () => {
        const b = estimate(), mb = Math.round(b / 1048576); if (b > peak) peak = b;
        const heap = (performance.memory && performance.memory.usedJSHeapSize) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        DBG.mem = { mb, peak: Math.round(peak / 1048576), heap };   // shown in the debug panel
        if (debugPanel.refresh) debugPanel.refresh();   // live numbers while the panel is open
    };
    tick(); setInterval(tick, 1000);
})();

// --- DEBUG PANEL: opened from the debug button. Only reachable with ?debug=yes; nothing here runs otherwise ---
let dbgGpu = '';
function dbgGpuName() {   // name of the graphics card, as the browser reports it (asked once)
    if (dbgGpu) return dbgGpu;
    if (wigInfo) return (dbgGpu = wigInfo);
    try {
        const own = IG.gl && !IG.gl.isContextLost() ? IG.gl : null, c = document.createElement('canvas'), g = own || c.getContext('webgl2') || c.getContext('webgl');
        if (!g) return (dbgGpu = 'no WebGL');
        let n = String(g.getParameter(g.RENDERER) || '');
        if (/^webkit webgl$/i.test(n)) { const d = g.getExtension('WEBGL_debug_renderer_info'); if (d) n = String(g.getParameter(d.UNMASKED_RENDERER_WEBGL) || n); }
        if (!own) { const lc = g.getExtension('WEBGL_lose_context'); if (lc) lc.loseContext(); }
        dbgGpu = n || 'unknown';
    } catch (e) { dbgGpu = 'unknown'; }
    return dbgGpu;
}
const FORCE_NAMES = { auto: 'Automatic (fastest available)', multi: 'CPU, several cores', single: 'CPU, one core' };
function dbgState() {   // everything the panel and the bundle show, as plain values
    const lbl = (id) => ((document.getElementById(id) || {}).textContent || '').replace(/\s*\[debug:.*\]$/, '');
    return {
        version: APP.label, browser: navigator.userAgent,
        screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x, window ${innerWidth}×${innerHeight}`,
        gpu: dbgGpuName(),
        gpuEditing: !IG.tried ? 'not started yet' : IG.ok ? `yes · max ${IG.max} px` + (IG.maxPx < 40e6 ? ` · photos above ${(IG.maxPx / 1e6).toFixed(1)} MP go to the CPU` : '') + ` · Clarity on ${IG.fl ? 'GPU' : 'CPU' + (IG.flWhy ? ' (' + IG.flWhy + ')' : '')}` : 'no — ' + (IG.why || 'unknown reason'),
        anaglyph: ANA2.tried && ANA2.ok && IG.ok ? 'WebGL2 (photos kept on the card)' : GL.ok ? 'WebGL' + (ANA2.why ? ' (WebGL2 view: ' + ANA2.why + ')' : '') : GL.tried ? 'CPU' : 'not started yet',
        cores: (navigator.hardwareConcurrency || '?') + ' reported · workers: ' + (parUsable() ? PAR.n + ' ready' : PAR.tried ? (PAR.ok ? 'started, not used now' : 'off — ' + PAR.why) : 'not started (not needed yet)'),
        forced: FORCE_NAMES[DBG.force],
        renderers: { wigglegram: lbl('wigRenderer') || '—', anaglyph: lbl('anaRenderer') || '—', individual: lbl('indivRenderer') || '—' },
        individual: `preview ${indiv.tPrev ?? '-'} ms · full-size step ${indiv.tFull ?? '-'} ms` + (DBG.rebuild !== null ? ` · last forced rebuild ≈ ${DBG.rebuild} ms` : ''),
        autoAlign: DBG.align ? `reading ${DBG.align.read} ms · search ${DBG.align.search} ms · redraw ${DBG.align.redraw} ms` : 'not run yet',
        memory: DBG.mem ? `${DBG.mem.mb} MB now · peak ${DBG.mem.peak} MB` + (DBG.mem.heap !== null ? ` · JavaScript heap ${DBG.mem.heap} MB` : '') : '—',
        flags: `tab ${currentTab} · playing ${isPlaying} · ghost view ${isAligning} · alignment panel ${toggleAdvanced.checked} · crop edit ${cropEditing} · busy ${busy} · edits pending ${indiv.dirty}${indiv.pendGeo ? ' (shape)' : ''}`,
        undo: imagesLoaded ? `step ${hist.i + 1} of ${hist.a.length}` : '—',
        source: projSrc ? projSrc.kind + (projSrc.files ? ': ' + projSrc.files.map(f => f.name + ' (' + Math.round(f.size / 1024) + ' KB)').join(', ') : '') + (projSrc.layout ? ' · layout ' + projSrc.layout : '') : '—',
        photos: imagesLoaded ? `${frameL.width}×${frameL.height} · preview ×${pvScale.toFixed(2)} · lossless MPO ${!!(origL && origR)}` + (indiv.dirty ? ' · edits not applied yet' : '') : 'none loaded',
        errors: ERRS.length ? ERRS.slice() : []
    };
}
function debugPanel() {
    if (!isDebug()) return;
    const open = document.getElementById('dbgPanel');
    if (open) { open.remove(); debugPanel.refresh = null; return; }   // the debug button opens and closes it
    const box = document.createElement('div'); box.id = 'dbgPanel'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Debug panel');
    box.style.cssText = 'position:fixed;top:62px;right:12px;width:min(400px,calc(100vw - 24px));max-height:calc(100vh - 80px);max-height:calc(100dvh - 80px);overflow:auto;z-index:9500;background:var(--panel-bg);color:var(--text-light);border:1px solid var(--panel-border);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 16px;font-size:0.78rem;line-height:1.4';
    const btn = (id, t) => `<button type="button" class="btn btn-outline" id="${id}" style="padding:7px 6px;font-size:0.78rem">${t}</button>`;
    box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-size:0.95rem">Debug panel</b>'
        + '<button type="button" id="dbgClose" aria-label="Close" style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;line-height:1;cursor:pointer">×</button></div>'
        + '<label for="dbgForce" style="display:block;font-weight:600;margin-bottom:4px">Renderer for photo edits and anaglyph</label>'
        + '<select id="dbgForce" style="width:100%;padding:7px;border-radius:6px;border:1px solid var(--panel-border);background:var(--bg-dark);color:var(--text-light)">'
        + Object.entries(FORCE_NAMES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('') + '</select>'
        + '<div style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 10px">Lasts until the page is reloaded. Use "Rebuild full size" to time the chosen path.</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">' + btn('dbgRebuild', 'Rebuild full size') + btn('dbgCopy', 'Copy diagnostics') + btn('dbgBundle', 'Save debug bundle') + btn('dbgSelf', 'Run self-test')
        + btn('dbgHist', 'Undo history...') + btn('dbgState', 'Copy settings (JSON)') + btn('dbgProj', 'Inspect .3dta file...') + btn('dbgLog', 'Message log...')
        + btn('dbgFps', DBG.fps ? 'Hide FPS meter' : 'Show FPS meter') + btn('dbgLose', 'Simulate GPU loss') + btn('dbgFree', 'Free caches now') + btn('dbgClearSet', 'Clear saved settings...') + '</div>'
        + '<input type="file" id="dbgProjFile" style="display:none">'
        + '<div id="dbgInfo" style="display:grid;grid-template-columns:auto 1fr;gap:5px 10px"></div>';
    document.body.appendChild(box);
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const info = box.querySelector('#dbgInfo'), sel = box.querySelector('#dbgForce');
    const refresh = () => {
        const d = dbgState(), rows = [['Version', d.version], ['Graphics card', d.gpu], ['GPU editing', d.gpuEditing], ['Anaglyph view', d.anaglyph], ['Processor', d.cores], ['Forced', d.forced],
            ['Renderers', `Wigglegram: ${d.renderers.wigglegram}<br>Anaglyph: ${d.renderers.anaglyph}<br>Individual: ${d.renderers.individual}`], ['Individual Images', d.individual], ['Auto-align', d.autoAlign],
            ['Memory', d.memory], ['Photos', d.photos], ['Opened from', d.source], ['Undo', d.undo], ['State', d.flags], ['Screen', d.screen], ['Browser', d.browser], ['Errors', d.errors.length ? d.errors.join('<br>') : 'none']];
        info.innerHTML = rows.map(([k, v]) => `<div style="color:var(--text-muted);white-space:nowrap">${k}</div><div style="word-break:break-word">${k === 'Renderers' || k === 'Errors' ? v.split('<br>').map(esc).join('<br>') : esc(v)}</div>`).join('');
    };
    debugPanel.refresh = refresh; sel.value = DBG.force; refresh();
    box.querySelector('#dbgClose').addEventListener('click', () => { box.remove(); debugPanel.refresh = null; });
    sel.addEventListener('change', async () => {
        DBG.force = sel.value;
        if (DBG.force === 'multi' && !(await parReady())) showToast('Several cores are not available here: ' + (PAR.why || 'unknown reason'), true);
        Object.keys(indiv.cache).forEach(k => { if (k[0] === 'd') delete indiv.cache[k]; });   // the previews are redrawn by the chosen path
        indiv.noParPrev = false; IG.usedPrev = IG.usedFull = undefined;
        if (imagesLoaded) refreshView();
        indivRendererLabel(); refresh(); showToast('Renderer: ' + FORCE_NAMES[DBG.force]);
    });
    box.querySelector('#dbgRebuild').addEventListener('click', () => {   // rebuilds both full-size photos with the current renderer and times it
        if (!imagesLoaded || !indiv.base.L) { showToast('Load photos first.', true); return; }
        if (busy) return;
        indiv.gen = {}; indivDropPrep(); indiv.dirty = true;
        const t0 = performance.now();
        whenFramesReady(() => { DBG.rebuild = Math.round(performance.now() - t0); refreshView(); refresh(); showToast(`Full-size rebuild: about ${DBG.rebuild} ms`); });
    });
    box.querySelector('#dbgCopy').addEventListener('click', copyDiagnostics);
    box.querySelector('#dbgBundle').addEventListener('click', saveDebugBundle);
    box.querySelector('#dbgSelf').addEventListener('click', () => runSelfTest());
    const card = (title, html) => openCard('dbgcard', `<div style="font-weight:700;font-size:1.05rem">${esc(title)}</div><div style="margin-top:10px;font-size:0.8rem">${html}</div>`, [['Close']]);
    const pre = (t) => `<pre style="white-space:pre-wrap;word-break:break-word;max-height:55vh;overflow:auto;background:var(--bg-dark);padding:8px;border-radius:6px;font-size:0.72rem">${esc(t)}</pre>`;
    box.querySelector('#dbgHist').addEventListener('click', () => {   // every undo step, what changed in it; click one to jump there
        if (!imagesLoaded || !hist.a.length) { showToast('Load photos first.', true); return; }
        const NAMES = { x: 'offset X', y: 'offset Y', r: 'rotation', k: 'scale', f: 'floating window', soft: 'soft window', crop: 'crop mode', cc: 'custom crop', sw: 'left/right swap', sp: 'wiggle speed', xf: 'crossfade', am: 'anaglyph type', mix: 'custom matrix', L: 'left photo edits', R: 'right photo edits', m: 'match colors', fit: 'size difference' };
        const rows = hist.a.map((h, i) => {
            const prev = i ? hist.a[i - 1].s : null, what = prev ? Object.keys(NAMES).filter(k => JSON.stringify(h.s[k]) !== JSON.stringify(prev[k])).map(k => NAMES[k]).join(', ') || '(no change)' : 'opened';
            return `<button type="button" class="btn btn-outline" data-step="${i}" style="display:block;width:100%;text-align:left;padding:6px 8px;margin-bottom:4px;font-size:0.78rem${i === hist.i ? ';border-color:var(--primary);font-weight:700' : ''}">${i + 1}. ${esc(what)}${i === hist.i ? ' ← now' : ''}</button>`;
        }).join('');
        const c = card('Undo history (' + hist.a.length + ' steps)', '<div style="max-height:55vh;overflow:auto">' + rows + '</div>');
        c.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { c.parentNode.remove(); histStep(+b.dataset.step - hist.i); refresh(); showToast('Jumped to step ' + (hist.i + 1) + '.'); }));
    });
    box.querySelector('#dbgState').addEventListener('click', () => {
        if (!imagesLoaded) { showToast('Load photos first.', true); return; }
        const t = JSON.stringify({ state: histState(), ui: projUiState() }, null, 2);
        (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject(new Error('no clipboard'))).then(() => showToast('Settings copied.'), () => card('Settings', pre(t)));
    });
    const pf = box.querySelector('#dbgProjFile');
    box.querySelector('#dbgProj').addEventListener('click', () => pf.click());
    pf.addEventListener('change', async () => {   // what is inside a project file, and whether every part is intact
        const f = pf.files[0]; pf.value = ''; if (!f) return;
        try {
            const z = await zipRead(f), lines = [`${f.name} · ${(f.size / 1048576).toFixed(2)} MB · looks like a project: ${await looksLikeProject(f)}`, ''];
            for (const e of z.list()) { let ok; try { await z.get(e.name, 2e9); ok = 'OK'; } catch (err) { ok = 'DAMAGED: ' + err.message; } lines.push(`${e.name}  ${e.us} bytes  ${e.method ? 'deflate' : 'stored'}  crc ${e.crc.toString(16).padStart(8, '0')}  ${ok}`); }
            for (const n of ['manifest.json', 'settings.json']) if (z.has(n)) { try { lines.push('', '--- ' + n, JSON.stringify(JSON.parse(new TextDecoder().decode(await z.get(n, 8e6))), null, 2)); } catch (err) { lines.push('', '--- ' + n + ': ' + err.message); } }
            if (z.has('history.json')) { try { const h = JSON.parse(new TextDecoder().decode(await z.get('history.json', 64e6))); lines.push('', `--- history.json: ${Array.isArray(h.states) ? h.states.length : '?'} steps, current ${h.index + 1}`); } catch (err) { lines.push('', '--- history.json: ' + err.message); } }
            card('Project file', pre(lines.join('\n')));
        } catch (err) { card('Project file', pre('Not readable: ' + err.message)); }
    });
    box.querySelector('#dbgLog').addEventListener('click', () => card('Message log (last ' + DBG.log.length + ')', DBG.log.length ? pre(DBG.log.map(([t, m, e]) => `${t} ${e ? '[error] ' : ''}${m}`).reverse().join('\n')) : 'No messages yet.'));
    box.querySelector('#dbgFps').addEventListener('click', (e) => { dbgFps(!DBG.fps); e.currentTarget.textContent = DBG.fps ? 'Hide FPS meter' : 'Show FPS meter'; });
    box.querySelector('#dbgLose').addEventListener('click', () => {   // tests the recovery after the graphics card is lost
        const gl = IG.gl, ext = gl && !gl.isContextLost() && gl.getExtension('WEBGL_lose_context');
        if (!ext) { showToast('No WebGL2 context to lose (the GPU is not in use).', true); return; }
        ext.loseContext(); showToast('GPU context lost on purpose; restoring in 2 s...');
        setTimeout(() => { try { ext.restoreContext(); } catch (err) { } setTimeout(() => { if (imagesLoaded) refreshView(); refresh(); showToast('GPU context restore requested. Check the Renderer lines.'); }, 300); }, 2000);
    });
    box.querySelector('#dbgFree').addEventListener('click', () => {
        const before = DBG.mem ? DBG.mem.mb : null;
        igForget(); indivDropPrep(); Object.values(indiv.cache || {}).forEach(e => { if (e && e.cv && e.cv !== frameL && e.cv !== frameR) releaseCanvas(e.cv); }); indiv.cache = {};
        if (imagesLoaded) refreshView();
        setTimeout(() => { refresh(); showToast('Caches freed' + (before !== null && DBG.mem ? `: ${before} → ${DBG.mem.mb} MB` : '.')); }, 1100);
    });
    box.querySelector('#dbgClearSet').addEventListener('click', () => openCard('confirm', '<div style="font-weight:700;font-size:1.05rem">Clear saved settings?</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">Removes everything 3DToolAD keeps in this browser (export options, theme, presets, custom matrix). The page reloads.</p>',
        [['Clear and reload', () => { try { Object.keys(localStorage).filter(k => /^3dtool/i.test(k)).forEach(k => localStorage.removeItem(k)); } catch (err) { } location.reload(); }], ['Cancel']]));
}
function dbgFps(on) {   // frames per second of the page, and long freezes (where the browser reports them)
    if (DBG.fps) { cancelAnimationFrame(DBG.fps.raf); if (DBG.fps.obs) DBG.fps.obs.disconnect(); DBG.fps.el.remove(); DBG.fps = null; }
    if (!on) return;
    const el = document.createElement('div'); el.dataset.noi18n = '1'; el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9600;background:rgba(0,0,0,.75);color:#7CFC00;font:12px/1.3 ui-monospace,monospace;padding:4px 8px;border-radius:6px;pointer-events:none';
    document.body.appendChild(el);
    const F = DBG.fps = { el, raf: 0, n: 0, t0: performance.now(), worst: 0, last: performance.now(), long: 0, obs: null };
    try { F.obs = new PerformanceObserver((l) => { F.long += l.getEntries().length; }); F.obs.observe({ entryTypes: ['longtask'] }); } catch (e) { F.obs = null; }
    const tick = (t) => {
        F.n++; F.worst = Math.max(F.worst, t - F.last); F.last = t;
        if (t - F.t0 >= 1000) { el.textContent = `${Math.round(F.n * 1000 / (t - F.t0))} fps · slowest frame ${Math.round(F.worst)} ms` + (F.obs ? ` · freezes ${F.long}` : ''); F.n = 0; F.worst = 0; F.t0 = t; }
        F.raf = requestAnimationFrame(tick);
    };
    F.raf = requestAnimationFrame(tick);
}
function saveDebugBundle() {   // one file to attach to a bug report: settings and measurements, never photos or camera data
    const settings = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^3dtool/i.test(k)) { const v = localStorage.getItem(k) || ''; settings[k] = v.length > 4000 ? v.slice(0, 4000) + '…(cut)' : v; } } } catch (e) { }
    const data = { note: 'Created by the 3DToolAD debug panel. It contains no photos and no camera data.', created: new Date().toISOString(), state: dbgState(), diagnostics: diagLines(),
        alignment: imagesLoaded ? { offsetX, offsetY, rotationDeg: rotDeg, scale: scaleK, floatingWindowPct: floatPct, softWindow: floatSoft, cropAspect: document.getElementById('cropAspect').value, customCrop: { ...customCrop }, alignView: document.getElementById('alignView').value } : null,
        individualEdits: indiv.base.L ? { left: indiv.st.L, right: indiv.st.R, matchColors: !!indiv.match, selected: { ...indiv.sel } } : null,
        currentTab, settings };
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `3dtoolad-debug-${stamp()}.json`).then(() => showToast('Debug bundle saved.'), () => { });
}

// errors that nobody caught are logged (shown in the diagnostics) instead of failing silently
const ERRS = []; let errToastAt = 0;
function logErr(msg) {
    ERRS.push(new Date().toISOString().slice(11, 19) + ' ' + msg); if (ERRS.length > 8) ERRS.shift();
    if (Date.now() - errToastAt > 4000) { errToastAt = Date.now(); showToast("Unexpected error: " + String(msg).slice(0, 90) + " (details: ? > About > Report a problem)", true); }
}
// Only OUR errors are reported. Browser extensions and the system share sheet run their own scripts in the page and raise
// anonymous errors ("Script error.", no file, no line); those must not trigger the warning.
const BASE = location.href.split(/[?#]/)[0];
const isOwnError = (filename, stack) => (!!filename && String(filename).split(/[?#]/)[0] === BASE) || (!!stack && String(stack).includes(BASE));
window.addEventListener('error', (e) => {
    if (e.message && /ResizeObserver/.test(e.message)) return;
    if (!isOwnError(e.filename, e.error && e.error.stack)) { console.debug('Ignored external error:', e.message, e.filename); return; }
    logErr((e.message || 'error') + (e.lineno ? ' @' + e.lineno : ''));
});
window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (!isOwnError('', r && r.stack)) { console.debug('Ignored external rejection:', r); return; }
    logErr('promise: ' + ((r && r.message) || r));
});

function openCard(cls, html, buttons) {
    const o = document.createElement('div'); o.className = 'ov ' + cls; o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px';
    const b = document.createElement('div'); b.style.cssText = 'background:var(--panel-bg);color:var(--text-light);border:1px solid var(--panel-border);border-radius:var(--radius);box-shadow:var(--shadow);max-width:480px;width:100%;max-height:88vh;overflow:auto;padding:20px';
    b.innerHTML = html; const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:16px';
    buttons.forEach(([t, fn, keep]) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'btn btn-outline'; x.style.padding = '8px 14px'; x.textContent = t; x.onclick = () => { if (!keep) o.remove(); if (fn) fn(); }; row.appendChild(x); });
    b.appendChild(row); o.appendChild(b); o.addEventListener('click', (e) => { if (e.target === o && !o.dataset.lock) o.remove(); }); document.body.appendChild(o); return b;
}
function reportProblem() { copyDiagnostics(); if (APP.repo) window.open(APP.repo.replace(/\/$/, '') + '/issues/new', '_blank', 'noopener'); }
const CREDITS = [   // shown in About and listed in the README
    ['Anaglyph', ['Eric Dubois — least-squares anaglyph matrices (2001)']],
    ['Depth map', ['Ramin Zabih and John Woodfill — census transform (1994)', 'Xing Mei et al. — AD-Census matching cost (2011)', 'Heiko Hirschmüller — Semi-Global Matching (2005)',
        'Carlo Tomasi and Roberto Manduchi — bilateral filter (1998), used as a joint bilateral filter (Petschnigg et al.; Eisemann and Durand, 2004)', 'Steven Gortler et al. — push-pull filling of missing values (The Lumigraph, 1996)']],
    ['2D to 3D', ['Christoph Fehn — depth-image-based rendering (2004)']],
    ['GIF export', ['Paul Heckbert — median-cut color quantization (1982)', 'Bryce Bayer — ordered dithering (1973)', 'Terry Welch — LZW compression (1984)']],
    ['File formats', ['CIPA DC-007 (MPO) and DC-008 (Exif)', 'APNG specification (Mozilla)', 'ZIP (PKWARE APPNOTE) and CRC-32']]
];
function showAbout() {
    if (document.querySelector('.ov.about')) return;
    const credits = CREDITS.map(([area, items]) => `<div style="margin-top:8px;font-weight:600">${area}</div><ul style="margin:2px 0 0 18px;padding:0">` + items.map(t => `<li>${t}</li>`).join('') + '</ul>').join('');
    openCard('about', `<div style="font-weight:700;font-size:1.1rem">${APP.header}</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">Align and export stereoscopic 3D photos. Everything runs inside your browser: your photos are never uploaded, and the program makes no network requests.</p><p style="margin-top:8px;font-size:0.85rem;color:var(--text-muted)">Free software under the GNU GPL v3 or later. Copyright (C) 2026 adpietri.</p><p data-noi18n style="margin-top:6px;font-size:0.85rem;font-style:italic;color:var(--text-light);opacity:0.75">Made in Brazil</p>`
        + `<details style="margin-top:10px;font-size:0.8rem;color:var(--text-muted)"><summary style="cursor:pointer;font-size:0.85rem;color:var(--text-light)">Credits: published methods this program builds on</summary><p style="margin:6px 0 0">All of 3DToolAD's code was written for this project — no third-party code or libraries are included. It implements these published methods and open formats, with thanks to their authors:</p>${credits}</details>`,
        [['Report a problem', reportProblem], ['Run self-test', runSelfTest], ['Close']]);
}

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
