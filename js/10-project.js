/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- PROJECT FILE (.3dta): a ZIP with the original photos byte for byte, every setting and the undo history ---
//   mimetype        "application/x-3dtoolad-project" (first and uncompressed: the file is recognised by its first bytes)
//   manifest.json   format version, program version, where the photos came from
//   source/...      the opened file(s) unchanged; PNG (lossless) when the photos did not come from a file
//   settings.json   every left-panel setting, plus the view (tab, alignment mode, grid)
//   history.json    the undo steps and the current position
//   preview.jpg     a small picture of the left photo
const PROJ_MIME = 'application/x-3dtoolad-project', PROJ_VER = 1;
async function looksLikeProject(file) {
    if (/\.3dta$/i.test(file.name)) return true;
    try {
        const b = new Uint8Array(await file.slice(0, 38 + PROJ_MIME.length).arrayBuffer());
        return b.length === 38 + PROJ_MIME.length && b[0] === 0x50 && b[1] === 0x4B && b[2] === 3 && b[3] === 4 && new TextDecoder().decode(b.subarray(30)) === 'mimetype' + PROJ_MIME;
    } catch (e) { return false; }
}
async function zipRead(blob) {   // ZIP reader: stored or deflated entries, sizes and CRC checked
    const n = blob.size; if (n < 22) throw new Error('not a ZIP file');
    const tl = Math.min(n, 65557), tv = new DataView(await blob.slice(n - tl).arrayBuffer()); let e = -1;
    for (let i = tl - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('not a ZIP file');
    const cnt = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOff = tv.getUint32(e + 16, true);
    if (cnt > 256 || cdOff + cdSize > n) throw new Error('damaged ZIP file');
    const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), map = new Map(); let q = 0;
    for (let i = 0; i < cnt; i++) {
        if (q + 46 > cd.byteLength || cd.getUint32(q, true) !== 0x02014b50) throw new Error('damaged ZIP file');
        const nl = cd.getUint16(q + 28, true), el = cd.getUint16(q + 30, true), cl = cd.getUint16(q + 32, true);
        if (q + 46 + nl > cd.byteLength) throw new Error('damaged ZIP file');
        map.set(dec.decode(new Uint8Array(cd.buffer, q + 46, nl)), { method: cd.getUint16(q + 10, true), crc: cd.getUint32(q + 16, true), cs: cd.getUint32(q + 20, true), us: cd.getUint32(q + 24, true), lho: cd.getUint32(q + 42, true) });
        q += 46 + nl + el + cl;
    }
    return {
        has: (name) => map.has(name),
        list: () => [...map].map(([name, z]) => Object.assign({ name }, z)),
        async get(name, max) {
            const z = map.get(name); if (!z) throw new Error('missing ' + name);
            if (z.us > max || z.lho + 30 + z.cs > n) throw new Error(name + ' is too large or damaged');
            const lh = new DataView(await blob.slice(z.lho, z.lho + 30).arrayBuffer());
            if (lh.byteLength < 30 || lh.getUint32(0, true) !== 0x04034b50) throw new Error('damaged ZIP file');
            const start = z.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true), raw = blob.slice(start, start + z.cs); let out;
            if (z.method === 0) out = new Uint8Array(await raw.arrayBuffer());
            else if (z.method === 8 && typeof DecompressionStream !== 'undefined') {   // recompressed by another program
                const rd = raw.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), parts = []; let len = 0;
                for (;;) { const r = await rd.read(); if (r.done) break; len += r.value.length; if (len > z.us) { rd.cancel(); throw new Error(name + ' is damaged'); } parts.push(r.value); }
                out = new Uint8Array(len); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
            } else throw new Error('this ZIP compression is not supported');
            if (out.length !== z.us || crc32(out) !== z.crc) throw new Error(name + ' is damaged');
            return out;
        }
    };
}
function projUiState() { return { tab: currentTab, alignMode: toggleAdvanced.checked, alignView: document.getElementById('alignView').value, grid: document.getElementById('gridToggle').checked, selected: { L: !!indiv.sel.L, R: !!indiv.sel.R } }; }
// The original photo files go into the project only in formats every browser opens. Others (HEIC/HEIF, AVIF, JPEG XL, TIFF...,
// which only some devices open) are kept as lossless PNG instead, after asking: the project then opens anywhere.
function projPortable(b) {
    return b.length >= 12 && ((b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)                                          // JPEG (and MPO, JPS)
        || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)                                              // PNG
        || (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)                                              // GIF
        || (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)   // WebP
        || (b[0] === 0x42 && b[1] === 0x4D));                                                                              // BMP
}
async function projFilesPortable() {
    if (!projSrc || !projSrc.files || !(projSrc.kind === 'single' || projSrc.kind === 'pair')) return true;
    for (const f of projSrc.files) { let b; try { b = new Uint8Array(await f.slice(0, 12).arrayBuffer()); } catch (e) { return true; } if (!projPortable(b)) return false; }   // unreadable: handled below
    return true;
}
async function saveProject(opt) {
    const btn = document.getElementById('btnSaveProject');
    if (!imagesLoaded) return;
    if (busy) { showToast('Wait for the export to finish.', true); return; }
    let asPng = !!(opt && opt.png);
    if (!asPng && !PREFS.warnFormats && !(await projFilesPortable())) asPng = true;   // Settings > Files: no question, PNG straight away
    if (!asPng && !(await projFilesPortable())) {
        if (document.querySelector('.ov.projfmt')) return;
        openCard('confirm projfmt', '<div style="font-weight:700;font-size:1.05rem">Save project</div><p style="margin-top:10px;font-size:0.9rem;color:var(--text-muted)">The file cannot be saved in its current format; it will be saved as lossless PNG.</p>',
            [['Continue', () => saveProject({ png: true })], ['Cancel', () => showToast('Cancelled.')]]);
        return;
    }
    await withBusy(btn, 'Saving project...', 'project', async () => {
        pushHist();   // the current settings are the last undo step
        const te = new TextEncoder(), files = [{ name: 'mimetype', data: te.encode(PROJ_MIME) }], safe = (nm) => (nm || 'photo').replace(/[^\w.\- ()]+/g, '_').slice(-100);
        const src = { kind: projSrc && projSrc.files && !asPng ? projSrc.kind : 'pixels', files: [], names: [] };
        if (src.kind === 'single' || src.kind === 'pair') {
            try {
                for (let i = 0; i < projSrc.files.length; i++) {
                    const f = projSrc.files[i], path = 'source/' + (src.kind === 'pair' ? (i ? 'right_' : 'left_') : '') + safe(f.name);
                    files.push({ name: path, data: new Uint8Array(await f.arrayBuffer()) }); src.files.push(path); src.names.push(f.name);
                }
                if (src.kind === 'single') src.layout = projSrc.layout;
            } catch (e) {   // the original file can no longer be read (moved or deleted): keep the photos as lossless PNG instead
                console.warn('original file unreadable, saving the photos as PNG', e); files.length = 1; src.kind = 'pixels'; src.files = []; src.names = [];
            }
        }
        if (src.kind === 'pixels') {   // made by a tool or pasted: the photos as they were opened, lossless
            const pair = pairSrc ? [pairSrc.L, pairSrc.R] : swappedLR ? [indiv.base.R, indiv.base.L] : [indiv.base.L, indiv.base.R];   // the photos as opened (pairSrc never follows Swap L/R; the swap is a setting)
            for (let i = 0; i < 2; i++) {
                const b = await new Promise(res => pair[i].toBlob(res, 'image/png')); if (!b) throw new Error('could not encode the photos');
                const path = 'source/' + (i ? 'right.png' : 'left.png'); files.push({ name: path, data: new Uint8Array(await b.arrayBuffer()) }); src.files.push(path); src.names.push(i ? 'right.png' : 'left.png');
            }
        }
        const b0 = swappedLR ? indiv.base.R : indiv.base.L;
        const manifest = { format: '3DToolAD project', formatVersion: PROJ_VER, app: APP.id, appVersion: APP.version, created: new Date().toISOString(), source: src, photoSize: [b0.width, b0.height] };
        const settings = { formatVersion: PROJ_VER, state: histState(), ui: projUiState() };
        const history = { formatVersion: PROJ_VER, index: hist.i, states: hist.a.map(h => h.s) };
        files.push({ name: 'manifest.json', data: te.encode(JSON.stringify(manifest, null, 2)) }, { name: 'settings.json', data: te.encode(JSON.stringify(settings, null, 2)) }, { name: 'history.json', data: te.encode(JSON.stringify(history)) });
        if (pvL && pvL.width) { const k = Math.min(1, 320 / pvL.width), c = scaledCanvas(pvL, Math.max(1, Math.round(pvL.width * k)), Math.max(1, Math.round(pvL.height * k))); files.push({ name: 'preview.jpg', data: new Uint8Array(await canvasToJpegBuffer(c, 0.8)) }); releaseCanvas(c); }
        const stem = (src.kind !== 'pixels' && src.names[0] ? src.names[0].replace(/\.[^.]+$/, '') : '') || ('project_' + stamp());
        await saveBlob(new Blob([makeZip(files)], { type: 'application/octet-stream' }), safe(stem) + '.3dta');   // a generic type: some browsers rename '.zip' files
        showToast('Project saved.');
    });
}
async function openProject(file) {
    if (busy) { showToast('Wait for the export to finish.', true); return; }
    showToast('Opening project...');
    try {
        pairPreset = null;
        const z = await zipRead(file), td = new TextDecoder(), txt = async (n, max) => td.decode(await z.get(n, max));
        if (!z.has('mimetype') || (await txt('mimetype', 200)).trim() !== PROJ_MIME) throw new Error('not a project');
        const man = JSON.parse(await txt('manifest.json', 1e6));
        if (!man || typeof man !== 'object') throw new Error('not a project');
        if (Number(man.formatVersion) > PROJ_VER) throw new Error('newer');
        let settings = null, history = null;
        const fresh = man.fresh === true && !z.has('settings.json');   // made by Tools > Batch convert: only the photos, opened like new ones
        if (z.has('settings.json')) try { settings = JSON.parse(await txt('settings.json', 8e6)); } catch (e) { console.warn('project settings unreadable', e); }
        if (z.has('history.json')) try { history = JSON.parse(await txt('history.json', 64e6)); } catch (e) { console.warn('project history unreadable', e); }
        pairPreset = fresh ? null : (settings && settings.state && PAIR_LABEL[settings.state.fit]) ? settings.state.fit : 'legacy';   // photos of different sizes: as saved, nothing asked (a fresh project asks, like new photos)
        const s = man.source && typeof man.source === 'object' ? man.source : {}, paths = Array.isArray(s.files) ? s.files.filter(p => typeof p === 'string' && z.has(p)).slice(0, 2) : [];
        const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', mpo: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif' };
        const mk = async (p, i) => { const nm = String((Array.isArray(s.names) && typeof s.names[i] === 'string' && s.names[i]) || p.split('/').pop()).replace(/[\\/]/g, '_').slice(-120), ext = (nm.split('.').pop() || '').toLowerCase(); return new File([await z.get(p, 1.5e9)], nm, { type: types[ext] || '' }); };
        if (s.kind === 'single' && paths.length === 1) {
            const f = await mk(paths[0], 0); await loadSingleFile(f, ['sbs', 'cross', 'tb', 'tb-r'].includes(s.layout) ? s.layout : 'sbs');
            if (!projSrc || projSrc.files[0] !== f) throw new Error('the photos inside could not be opened');
        } else if (s.kind === 'pair' && paths.length === 2) {
            fileL = await mk(paths[0], 0); fileR = await mk(paths[1], 1); setBadge('L', 'Ready', true); setBadge('R', 'Ready', true);
            const a = fileL; await checkSeparateUploads();
            if (!projSrc || projSrc.files[0] !== a) throw new Error('the photos inside could not be opened');
        } else if (paths.length === 2) {
            const imgs = [];
            for (const p of paths) { const url = URL.createObjectURL(new Blob([await z.get(p, 1.5e9)], { type: 'image/png' })); try { imgs.push(await loadImageAsync(url)); } finally { URL.revokeObjectURL(url); } }
            ++loadSeq; openedMpoFile = null; setFrames(imgs[0], imgs[1], null, null, pairPreset || 'crop'); projSrc = { kind: 'pixels' }; onImagesReady();
        } else throw new Error('the project has no photos');
        const st = cleanState(settings && settings.state);
        if (st) applyState(st);
        const ui = settings && settings.ui;
        if (ui && typeof ui === 'object') {
            if (ui.selected && typeof ui.selected === 'object') { indiv.sel.L = !!ui.selected.L; indiv.sel.R = !!ui.selected.R; indivUpdateUI(); }
            const av = document.getElementById('alignView'); if ([...av.options].some(o => o.value === ui.alignView)) av.value = ui.alignView;
            setGrid(!!ui.grid);
            if (['wiggle', 'anaglyph', 'individual'].includes(ui.tab) && ui.tab !== currentTab) { const t = document.querySelector(`.view-tab[data-target="${ui.tab}"]`); if (t) t.click(); }
            // 'Alignment Mode' open: only the panel. Starting the ghost view here kept the picture uncropped and paused, and the anaglyph tab blank, until Play was pressed
            toggleAdvanced.checked = !!ui.alignMode; if (currentTab !== 'individual') alignmentPanel.style.display = ui.alignMode ? 'block' : 'none';
        }
        const live = histState(), steps = history && Array.isArray(history.states) ? history.states.slice(-PREFS.histMax).map(cleanState).filter(Boolean) : [];
        const idx = Number.isInteger(history && history.index) ? history.index - Math.max(0, history.states.length - PREFS.histMax) : steps.length - 1;
        if (steps.length && idx >= 0 && idx < steps.length) { hist.a = steps.map(c => ({ s: c, j: histJSON(c) })); hist.i = idx; hist.a[idx] = { s: live, j: histJSON(live) }; histNotify(); }
        else histReset();
        if (isAligning) endAlignment();   // never left in the ghost view
        cropEditing = false; updateCropUI(); refreshView(); pairPreset = null;
        showToast('Project opened.');
    } catch (e) {
        console.error(e);
        pairPreset = null;
        showToast(e.message === 'newer' ? 'This project was saved by a newer version of ' + APP.name + '.' : 'Could not open this project: ' + (e.message === 'not a project' ? 'it is not a ' + APP.name + ' project file.' : e.message), true);
    }
}
document.getElementById('btnSaveProject').addEventListener('click', () => saveProject());
document.getElementById('btnOpenProject').addEventListener('click', () => document.getElementById('inputProject').click());
document.getElementById('inputProject').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openProject(f); });   // no file-type filter: some phones hide unknown extensions

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
