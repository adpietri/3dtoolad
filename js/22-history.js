/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- HISTORY WINDOW (U): every recorded step of the undo history in plain words; click a step to go back (or forward) to it ---
// It reads the same snapshots as Ctrl+Z (08-undo.js) and only describes the difference between two neighbouring steps,
// so nothing is stored twice. The window does not cover the page: the photo changes behind it while you browse the steps,
// and Ctrl+Z / Ctrl+Y keep working with it open.
const HS = { box: null, list: null, sub: null, tick: 0 };
const HS_TAG = { start: 'Beginning', align: 'Alignment', window: 'Window', crop: 'Crop', order: 'Order', wiggle: 'Wiggle', ana: 'Anaglyph', L: 'Left', R: 'Right', both: 'Both' };
const HS_GEO = { straighten: 'Straighten', keyV: 'Vertical keystone', keyH: 'Horizontal keystone', lens: 'Lens distortion' };
const HS_HSL = ['hue', 'saturation', 'luminance'], HS_CURVE = ['Shadows', 'Darks', 'Lights', 'Highlights'], HS_CH = { rgb: 'RGB', r: 'Red', g: 'Green', b: 'Blue' };
const hsT = (s) => typeof trText === 'function' ? trText(s) : s;   // texts built here are translated as they are put together (js/22-i18n.js)
const hsSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hsSign = (v, d) => { const n = Number(v); const t = Math.abs(n).toFixed(d || 0); return (Number(t) === 0 ? '' : n > 0 ? '+' : '−') + t; };
const hsOnOff = (v) => hsT(v ? 'on' : 'off');
const hsOpt = (id, v) => { const el = document.getElementById(id), o = el && [...el.options].find(p => p.value === v); return o ? hsT(toEn(o.textContent.trim())) : String(v); };
const toEn = (t) => typeof toEnglish === 'function' ? toEnglish(t) : t;   // an option may already show translated text
const hsEsc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function hsPhoto(a, b) {   // what changed in one photo's settings: a list of { t: title, d: detail }
    const out = [];
    if (a.rot !== b.rot) { const d = (b.rot - a.rot + 4) & 3; out.push({ t: hsT(d === 1 ? 'Rotate 90° right' : d === 3 ? 'Rotate 90° left' : 'Rotate 180°'), d: '' }); }
    Object.keys(HS_GEO).forEach(k => { if (a.geo[k] !== b.geo[k]) out.push({ t: hsT(HS_GEO[k]), d: hsSign(b.geo[k], k === 'straighten' ? 1 : 0) + (k === 'straighten' ? '°' : '') }); });
    Object.values(ADJ_UI).flat().forEach(([k, label]) => { if (a.adj[k] !== b.adj[k]) out.push({ t: hsT(label), d: hsSign(b.adj[k]) }); });
    b.hsl.forEach((band, i) => band.forEach((v, c) => { if (a.hsl[i][c] !== v) out.push({ t: hsT('Color mixer'), d: `${hsT(BANDS[i][0])} · ${hsT(HS_HSL[c])} ${hsSign(v)}` }); }));
    Object.keys(HS_CH).forEach(ch => b.curve[ch].forEach((v, i) => { if (a.curve[ch][i] !== v) out.push({ t: hsT('Tone curve'), d: `${hsT(HS_CH[ch])} · ${hsT(HS_CURVE[i])} ${hsSign(v)}` }); }));
    if (b.curve.pts) Object.keys(HS_CH).forEach(ch => { if (!hsSame(a.curve.pts ? a.curve.pts[ch] : [[0, 0], [255, 255]], b.curve.pts[ch])) out.push({ t: hsT('Curves'), d: hsT(HS_CH[ch]) + (ptsIsId(b.curve.pts[ch]) ? ' · ' + hsT('straight') : '') }); });
    if (out.length > 1 && hsSame(b, indivNewSt())) return [{ t: hsT('Reset everything'), d: hsT('rotation, geometry, colors and tones') }];
    if (out.length > 3) return [{ t: hsT('Colors and tones'), d: `${out.length} ${hsT('settings')}: ` + [...new Set(out.map(o => o.t))].join(', ') }];   // a preset, a copy from the other photo...
    return out;
}

function hsDescribe(p, c) {   // one undo step in words: { tag, t, d, all } (all = every change, for the tooltip)
    const it = [], add = (tag, t, d) => it.push({ tag, t: hsT(t), d: d || '' });   // titles from hsPhoto are already translated (translating twice changes nothing)
    if (c.fit && p.fit && p.fit !== c.fit) add('crop', 'Size difference', hsT(PAIR_LABEL[c.fit] || c.fit));   // photos of different sizes: crop or borders
    const swapped = p.sw !== c.sw;
    if (!(swapped && hsSame(p.L, c.R) && hsSame(p.R, c.L))) {   // a swap also swaps the photos' own settings: that is not a separate change
        const l = hsPhoto(p.L, c.L), r = hsPhoto(p.R, c.R);
        if (l.length && hsSame(l, r)) l.forEach(o => add('both', o.t, o.d));
        else { l.forEach(o => add('L', o.t, o.d)); r.forEach(o => add('R', o.t, o.d)); }
    }
    if (!hsSame(p.m, c.m)) add('both', 'Match colors', hsT(c.m ? 'right photo matched to the left' : 'removed'));
    if (swapped) add('order', c.sw ? 'Left and right swapped' : 'Left and right back in order');
    const al = ['x', 'y', 'r', 'k'].filter(k => p[k] !== c[k]);
    const alD = { x: `X ${c.x} px`, y: `Y ${c.y} px`, r: `${hsT('rotation')} ${hsSign(c.r, 2)}°`, k: `${hsT('scale')} ${(c.k * 100).toFixed(1)} %` };
    const alV = { x: `${c.x} px`, y: `${c.y} px`, r: `${hsSign(c.r, 2)}°`, k: `${(c.k * 100).toFixed(1)} %` };
    if (al.length >= 2 && !c.x && !c.y && !c.r && c.k === 1) add('align', 'Alignment reset', '');
    else if (al.length >= 3) add('align', 'Alignment', al.map(k => alD[k]).join(', '));
    else if (al.length === 2 && al.includes('x') && al.includes('y')) add('align', 'Position', `X ${c.x} px, Y ${c.y} px`);
    else al.forEach(k => add('align', { x: 'Horizontal position', y: 'Vertical position', r: 'Rotation', k: 'Scale' }[k], alV[k]));
    if (p.f !== c.f) add('window', 'Floating window', `${c.f.toFixed(1)} %`);
    if (p.soft !== c.soft) add('window', 'Soft inner edge', hsOnOff(c.soft));
    if (p.crop !== c.crop) add('crop', 'Crop', hsOpt('cropAspect', c.crop));
    else if (!hsSame(p.cc, c.cc)) add('crop', 'Custom crop', `${Math.round(c.cc.w * 100)} × ${Math.round(c.cc.h * 100)} % ${hsT('of the photo')}`);
    if (p.sp !== c.sp) add('wiggle', 'Wiggle speed', `${c.sp} ms`);
    if (p.xf !== c.xf) add('wiggle', 'Smooth crossfade', hsOnOff(c.xf));
    if (p.am !== c.am) add('ana', 'Anaglyph type', hsOpt('anaglyphMode', c.am));
    if (!hsSame(p.mix, c.mix)) { const pre = Object.keys(ANA_PRESETS).find(k => hsSame(ANA_PRESETS[k], c.mix)); add('ana', 'Custom matrix', pre ? hsOpt('anaglyphMode', pre) + ' ' + hsT('loaded') : hsT('edited')); }
    if (!it.length) return { tag: 'start', t: hsT('No visible change'), d: '', all: '' };
    const f = it[0], more = it.length - 1;
    return { tag: f.tag, t: f.t, d: f.d + (more ? (f.d ? ' · ' : '') + hsT(`+${more} more`) : ''), all: it.map(o => `${hsT(HS_TAG[o.tag])}: ${o.t}${o.d ? ' ' + o.d : ''}`).join('\n') };
}

function hsAgo(t) {
    if (!t) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 10 ? hsT('now') : s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h';
}

function hsCount() {   // the small number on the button: how many changes are recorded
    const el = document.getElementById('histCount'); if (!el) return;
    const n = imagesLoaded ? Math.max(0, hist.a.length - 1) : 0;
    el.textContent = n ? String(n) : ''; el.style.display = n ? '' : 'none';
}

function hsRender() {
    hsCount();
    if (!HS.box) return;
    if (!imagesLoaded || !hist.a.length) { HS.list.innerHTML = `<div class="hs-empty">${hsEsc(hsT('Nothing recorded yet.'))}</div>`; HS.sub.textContent = ''; return; }
    const keepScroll = HS.list.scrollTop, hadFocus = HS.box.contains(document.activeElement);
    HS.list.innerHTML = hist.a.map((h, i) => {
        const x = i ? hsDescribe(hist.a[i - 1].s, h.s) : { tag: 'start', t: hsT('Starting point'), d: hsT(hist.a.length >= PREFS.histMax ? 'oldest step kept' : 'as opened'), all: '' };
        const cls = i === hist.i ? ' now' : i > hist.i ? ' later' : '';
        return `<button type="button" class="hs-row${cls}" data-step="${i}" role="option" aria-selected="${i === hist.i}"${x.all ? ` title="${hsEsc(x.all)}"` : ''}>`
            + '<span class="hs-rail"><span class="hs-dot"></span></span>'
            + `<span class="hs-main"><span class="hs-title">${hsEsc(x.t)}</span>${x.d ? `<span class="hs-detail">${hsEsc(x.d)}</span>` : ''}</span>`
            + `<span class="hs-side"><span class="hs-tag hs-${x.tag}">${hsEsc(hsT(HS_TAG[x.tag]))}</span><span class="hs-time">${hsAgo(h.t)}</span></span></button>`;
    }).join('');
    HS.sub.textContent = hsT(`Step ${hist.i + 1} of ${hist.a.length}`);
    HS.box.querySelector('#hsUndo').disabled = hist.i <= 0;
    HS.box.querySelector('#hsRedo').disabled = hist.i >= hist.a.length - 1;
    HS.box.querySelector('#hsNote').textContent = hsT(hist.i < hist.a.length - 1
        ? 'The faded steps were undone. Click one to bring it back; any new change discards them.'
        : `Click a step to go back to it. Up to ${PREFS.histMax} steps are kept (Settings > History), and they are saved in the project file.`);
    HS.list.scrollTop = keepScroll;
    const cur = HS.list.querySelector('.hs-row.now');
    if (cur) { const lr = HS.list.getBoundingClientRect(), cr = cur.getBoundingClientRect(); if (cr.top < lr.top) HS.list.scrollTop += cr.top - lr.top - 4; else if (cr.bottom > lr.bottom) HS.list.scrollTop += cr.bottom - lr.bottom + 4; }   // keeps the page itself from scrolling
    if (hadFocus && cur) cur.focus({ preventScroll: true });
}

function hsPlace() {   // on wide screens it sits over the right panel, so the picture is never covered; on phones the stylesheet makes it a bottom sheet
    if (!HS.box) return;
    const side = document.querySelector('.sidebar-right'), wide = window.innerWidth > 900 && side && side.offsetWidth;
    if (!wide) { HS.box.style.left = HS.box.style.top = HS.box.style.width = HS.box.style.maxHeight = ''; return; }
    const r = side.getBoundingClientRect(), w = Math.max(270, r.width - 16), top = Math.max(r.top, 0) + 8;
    HS.box.style.width = w + 'px'; HS.box.style.left = Math.max(8, r.right - 8 - w) + 'px'; HS.box.style.top = top + 'px';
    HS.box.style.maxHeight = Math.max(240, window.innerHeight - top - 12) + 'px';
}
window.addEventListener('resize', hsPlace);

function hsGo(i) {
    if (!imagesLoaded || i === hist.i || i < 0 || i >= hist.a.length) return;
    if (busy) { showToast('Please wait for the current task to finish.', true); return; }
    histStep(i - hist.i);
}

function hsClose() {
    if (!HS.box) return;
    HS.box.remove(); HS.box = HS.list = HS.sub = null; clearInterval(HS.tick); HS.tick = 0;
    const b = document.getElementById('btnHistory'); if (b) { b.setAttribute('aria-expanded', 'false'); b.classList.remove('hs-open'); }
}

function hsOpen() {
    if (HS.box || !imagesLoaded) return;
    pushHist();   // a change still waiting to be recorded shows up straight away
    const box = document.createElement('div');
    box.id = 'historyWin'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'History');
    box.innerHTML = '<div class="hs-head"><div><div class="hs-name">History</div><div class="hs-sub" id="hsSub"></div></div>'
        + '<button type="button" class="hs-x" id="hsClose" title="Close (Esc)" aria-label="Close">×</button></div>'
        + '<div class="hs-list" id="hsList" role="listbox" aria-label="Steps"></div>'
        + '<div class="hs-foot"><div class="hs-note" id="hsNote"></div><div class="hs-btns">'
        + '<button type="button" class="btn btn-outline" id="hsUndo" title="Ctrl+Z">Undo</button><button type="button" class="btn btn-outline" id="hsRedo" title="Ctrl+Y">Redo</button></div></div>';
    screenEditor.appendChild(box);   // inside the editor: it hides with it when going back to the start screen
    HS.box = box; HS.list = box.querySelector('#hsList'); HS.sub = box.querySelector('#hsSub'); hsPlace();
    box.querySelector('#hsClose').addEventListener('click', hsClose);
    box.querySelector('#hsUndo').addEventListener('click', () => hsGo(hist.i - 1));
    box.querySelector('#hsRedo').addEventListener('click', () => hsGo(hist.i + 1));
    HS.list.addEventListener('click', (e) => { const r = e.target.closest('.hs-row'); if (r) hsGo(+r.dataset.step); });
    box.addEventListener('keydown', (e) => {   // keys typed inside the window stay here (the arrows would otherwise nudge the alignment)
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hsClose(); const b = document.getElementById('btnHistory'); if (b) b.focus(); return; }
        if (e.ctrlKey || e.metaKey || e.altKey) return;   // Ctrl+Z / Ctrl+Y go on to the page
        const rows = [...HS.list.querySelectorAll('.hs-row')], at = rows.indexOf(document.activeElement);
        let to = -1;
        if (e.key === 'ArrowDown') to = Math.min(rows.length - 1, at + 1); else if (e.key === 'ArrowUp') to = Math.max(0, at - 1);
        else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = rows.length - 1;
        if (to >= 0 && rows[to]) { e.preventDefault(); rows[to].focus(); }
        if (e.key === 'u' || e.key === 'U') { e.preventDefault(); hsClose(); }
        e.stopPropagation();
    });
    HS.tick = setInterval(() => { if (HS.box) HS.box.querySelectorAll('.hs-row').forEach(r => { const h = hist.a[+r.dataset.step], t = r.querySelector('.hs-time'); if (h && t) t.textContent = hsAgo(h.t); }); }, 20000);
    const b = document.getElementById('btnHistory'); b.setAttribute('aria-expanded', 'true'); b.classList.add('hs-open');
    hsRender();
    (HS.list.querySelector('.hs-row.now') || box.querySelector('#hsClose')).focus({ preventScroll: true });
}

histSubs.push(hsRender);
document.addEventListener('langchange', hsRender);
document.getElementById('btnHistory').addEventListener('click', () => { if (HS.box) hsClose(); else hsOpen(); });
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('.ov')) return;
    const ae = document.activeElement, typing = ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || (ae.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(ae.type)));
    if (e.key === 'Escape' && HS.box && !busy) { hsClose(); return; }
    if (typing || !screenEditor.classList.contains('active')) return;
    if (e.key === 'u' || e.key === 'U') { e.preventDefault(); if (HS.box) hsClose(); else hsOpen(); }
});
hsCount();

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
