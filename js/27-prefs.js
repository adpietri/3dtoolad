/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- SETTINGS (the gear button in the header): a window with tabs ---
// Changes show at once (colours, panel order, theme, language) so they can be judged, but are kept only with Save; Cancel,
// Esc or a click outside the window put everything back as it was. The values live in PREFS (js/01-core.js); the theme, the
// language and the MPO options keep their own stores (js/01-core.js, js/23-i18n.js, and the hidden #mpoProfile / #mpoCamera
// controls, remembered with the other export choices in js/07-keys-view.js).
const PREF_CENTER = { black: '#000000', dark: '#1c1c1f', mid: '#767676', light: '#c9c9cc', white: '#ffffff' };   // the area around the picture
const SETTINGS_FILE = '3DToolAD settings';
function prefSave() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(PREFS)); } catch (e) { } }
function prefApply() {   // appearance: panel order, panel colours (css/prefs.css), centre colour (also the start screen)
    const b = document.body;
    b.classList.toggle('tools-right', PREFS.toolsSide === 'right');
    if (PREFS.panelBg === 'theme') delete b.dataset.panel; else b.dataset.panel = PREFS.panelBg;
    if (PREF_CENTER[PREFS.centerBg]) b.style.setProperty('--canvas-bg', PREF_CENTER[PREFS.centerBg]); else b.style.removeProperty('--canvas-bg');
    b.classList.toggle('center-custom', !!PREF_CENTER[PREFS.centerBg]);
    if (typeof hsPlace === 'function') hsPlace();   // the History window sits over the export panel, wherever it is now
    if (typeof crvDraw === 'function') crvDraw();
}
function prefRender(v) {   // Settings > Performance: who does the work (the same switch as the debug panel's)
    if (DBG.force === v) return;
    DBG.force = v;
    if (v === 'multi') parReady().then(ok => { if (!ok) showToast('Several cores are not available here: ' + (PAR.why || 'unknown reason') + '. One core is used.', true); });
    Object.keys(indiv.cache).forEach(k => { if (k[0] === 'd') delete indiv.cache[k]; });   // the previews are redrawn by the chosen path
    indiv.noParPrev = false; IG.usedPrev = IG.usedFull = undefined;
    if (imagesLoaded) refreshView();
    indivRendererLabel();
}
function prefCommitted(k, before) {   // what a stored change does beyond its look
    if (k === 'histMax' && PREFS.histMax < before) histTrim();
    if (k === 'rememberFolds') pnlStore();
    if (k === 'presetSave') fillPresets();
    if (k === 'render') prefRender(PREFS.render);
}
function prefSet(k, v) {   // change and keep at once (used outside the window)
    const before = PREFS[k]; if (!prefPut(PREFS, k, v)) return;
    prefSave(); prefApply(); prefCommitted(k, before);
}
// theme: 'system' follows the device; 'light' / 'dark' are kept (the header button keeps working as before)
const themeStored = () => { try { const v = localStorage.getItem('3dtool-theme'); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; } };
const themeSystem = () => window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
function themeShow(t) { applyTheme(t === 'system' ? themeSystem() : t, false); }
function themeKeep(t) { if (t === 'system') { try { localStorage.removeItem('3dtool-theme'); } catch (e) { } themeShow('system'); } else applyTheme(t, true); }

prefApply();
DBG.force = PREFS.render;
// Settings > Appearance "Open in the tab": the tab of the start screen, so photos opened from it land there - when the program
// starts and after Clear. Photos dropped over open ones keep the tab in use; a project reopens in the tab it was saved in.
function goStartTab() { if (currentTab === PREFS.startTab) return; indiv.dirty = false; const t = document.querySelector(`.view-tab[data-target="${PREFS.startTab}"]`); if (t) t.click(); }
goStartTab();

// "Save settings to a file" / "Open settings": every choice kept by the program (Settings, theme, language, export and view
// choices, colour presets); not the photos, their edits or the undo history.
function settingsBundle(prefs, lang) {
    let ui = {}; try { const v = JSON.parse(localStorage.getItem('3dtool-settings')); if (v && typeof v === 'object' && !Array.isArray(v)) ui = v; } catch (e) { }
    return { format: SETTINGS_FILE, formatVersion: 1, app: APP.id, appVersion: APP.version, prefs, language: lang, theme: themeStored(), ui, presets: loadPresets() };
}
function settingsLoad(o) {   // checked value by value: anything unknown or out of range is left as it is
    if (o.prefs && typeof o.prefs === 'object') {
        const before = Object.assign({}, PREFS);
        Object.keys(PREF_DEFAULTS).forEach(k => { if (k in o.prefs) prefPut(PREFS, k, o.prefs[k]); });
        prefSave(); prefApply(); Object.keys(before).forEach(k => { if (before[k] !== PREFS[k]) prefCommitted(k, before[k]); });
    }
    if (typeof o.language === 'string' && I18N_LANGS.includes(o.language)) setLang(o.language, true);
    if (['system', 'light', 'dark'].includes(o.theme)) themeKeep(o.theme);
    if (o.ui && typeof o.ui === 'object' && !Array.isArray(o.ui)) UI_KEEP_IDS.forEach(id => {
        const el = $id(id), v = o.ui[id]; if (!el || !(id in o.ui)) return;
        if (el.type === 'checkbox') { if (typeof v !== 'boolean') return; el.checked = v; }
        else if (el.tagName === 'SELECT') { if (![...el.options].some(p => p.value === v)) return; el.value = v; }
        else if (el.type === 'range' || el.type === 'number') { let x = Number(v); if (v === '' || !Number.isFinite(x)) return; const lo = parseFloat(el.min), hi = parseFloat(el.max); if (Number.isFinite(lo)) x = Math.max(lo, x); if (Number.isFinite(hi)) x = Math.min(hi, x); el.value = String(x); }
        else if (el.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(v)) return; el.value = v; }
        else { if (typeof v !== 'string') return; el.value = v.slice(0, 200); }
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));   // applied and remembered like a choice made by hand
    });
    if (o.presets && typeof o.presets === 'object' && !Array.isArray(o.presets)) {   // colour presets: into this browser's list
        const all = loadPresets();
        Object.entries(o.presets).slice(0, 500).forEach(([name, p]) => { const nm = String(name).trim().slice(0, 40); if (nm && p && typeof p === 'object' && (p.adj || p.hsl || p.curve)) all[nm] = cloneParts(cleanPhotoSt(p)); });
        try { localStorage.setItem(PRESET_KEY, JSON.stringify(all)); } catch (e) { }
        fillPresets();
    }
}

const PF_OPT = (pairs) => pairs.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
const PF_TABS = [['look', 'Appearance'], ['files', 'Files'], ['compat', 'Compatibility'], ['perf', 'Performance'], ['hist', 'History'], ['presets', 'Presets'], ['lang', 'Languages']];
function prefOpen() {
    if (document.querySelector('.ov.prefs')) return;
    const mpoSel = $id('mpoProfile'), mpoCam = $id('mpoCamera');
    const html = `<div class="pf-title">Settings</div>
<div class="pf-tabbar"><button type="button" class="pf-nav" id="pfPrev" title="Previous tab" aria-label="Previous tab">«</button><div class="pf-tabs" role="tablist">${PF_TABS.map(([id, t]) => `<button type="button" role="tab" class="pf-tab" data-tab="${id}" aria-selected="false">${t}</button>`).join('')}</div><button type="button" class="pf-nav" id="pfNext" title="Next tab" aria-label="Next tab">»</button></div>
<div class="pf-page" data-page="look" role="tabpanel">
  <label class="pf-row"><span>Theme</span><select id="pfTheme">${PF_OPT([['system', 'Same as the device'], ['light', 'Light'], ['dark', 'Dark']])}</select></label>
  <label class="pf-row"><span>Panels, header, tabs and windows</span><select data-pref="panelBg">${PF_OPT([['theme', 'Theme default'], ['charcoal', 'Night'], ['graphite', 'Stone'], ['slate', 'Dusk'], ['warm', 'Earth'], ['mid', 'Smoke'], ['light', 'Paper']])}</select></label>
  <label class="pf-row"><span>Background around the picture</span><select data-pref="centerBg">${PF_OPT([['theme', 'Theme default'], ['black', 'Black'], ['dark', 'Dark gray'], ['mid', 'Middle gray'], ['light', 'Light gray'], ['white', 'White']])}</select></label>
  <label class="pf-row"><span>Panel order</span><select data-pref="toolsSide">${PF_OPT([['right', 'Tools on the right, export on the left'], ['left', 'Tools on the left, export on the right']])}</select></label>
  <p class="pf-note">On phones the panels are always under the picture, tools first.</p>
  <label class="pf-row"><span>Open in the tab</span><select data-pref="startTab">${PF_OPT([['wiggle', 'Wigglegram'], ['anaglyph', 'Anaglyph 3D'], ['individual', 'Individual Images']])}</select></label>
  <p class="pf-note">The tab shown when the program starts and after Clear, where new photos open. A project opens in the tab it was saved in.</p>
  <label class="pf-check"><input type="checkbox" data-pref="rememberFolds"><span>Remember folded sections (− / +)</span></label>
</div>
<div class="pf-page" data-page="files" role="tabpanel" hidden>
  <label class="pf-row pf-col"><span>MPO file name</span><input type="text" data-pref="mpoName" maxlength="120" spellcheck="false" autocomplete="off"></label>
  <label class="pf-row pf-col"><span>SBS file name</span><input type="text" data-pref="sbsName" maxlength="120" spellcheck="false" autocomplete="off"></label>
  <p class="pf-note">{name} name of the opened file · {date} date and time · {layout} SBS layout. The extension is added automatically; an empty box goes back to the standard name.</p>
  <p class="pf-note"><span>Example:</span> <span class="pf-ex" data-noi18n></span></p>
  <label class="pf-check"><input type="checkbox" data-pref="warnLeave"><span>Ask before closing or reloading the page while photos are open</span></label>
  <p class="pf-note">Avoids losing work by closing the tab by mistake. Save a project (.3dta) to keep it.</p>
</div>
<div class="pf-page" data-page="compat" role="tabpanel" hidden>
  <div class="pf-sub">MPO</div>
  <label class="pf-row"><span>MPO compatibility profile</span><select id="pfMpoProfile">${mpoSel.innerHTML}</select></label>
  <p class="pf-note">Standard: everything the MPO format describes, with a small preview picture. Use another profile only if a viewer or camera refuses the files: without the preview picture, without the stereo geometry information, or Basic (only what every MPO reader needs).</p>
  <label class="pf-check"><input type="checkbox" id="pfMpoCamera"><span>Copy camera info (make, model, exposure) into the MPO</span></label>
  <div class="pf-sub">Projects (.3dta)</div>
  <label class="pf-check"><input type="checkbox" data-pref="warnFormats"><span>Warn before photos in a project are saved as PNG because their format does not open in every browser</span></label>
  <p class="pf-note">When off, they are saved as lossless PNG without asking.</p>
  <div class="pf-sub">Photos of different sizes</div>
  <label class="pf-check"><input type="checkbox" data-pref="warnSizes"><span>Ask what to do when the two photos have different sizes</span></label>
  <p class="pf-note">When off, they open cropped to the area they share (a different resolution is matched first). You can change it later in Size difference, in the Alignment panel.</p>
</div>
<div class="pf-page" data-page="perf" role="tabpanel" hidden>
  <label class="pf-row"><span>Who does the work</span><select data-pref="render">${PF_OPT([['auto', 'Graphics card (GPU) when available'], ['multi', 'Processor, several cores'], ['single', 'Processor, one core']])}</select></label>
  <p class="pf-note">The graphics card is the fastest. The processor is slower but gives the same result; use it if pictures look wrong or the graphics card misbehaves. With several cores the work is shared (where the browser allows it); one core is the slowest and the most compatible.</p>
</div>
<div class="pf-page" data-page="hist" role="tabpanel" hidden>
  <label class="pf-row"><span>Undo steps kept</span><input type="number" data-pref="histMax" min="${HIST_MIN}" max="${HIST_MAX}" step="1" inputmode="numeric"></label>
  <p class="pf-note">From ${HIST_MIN} to ${HIST_MAX}. A step keeps only the settings, never the photos, so even ${HIST_MAX} steps use little memory. Projects keep the same number of steps.</p>
</div>
<div class="pf-page" data-page="presets" role="tabpanel" hidden>
  <div class="pf-sub">"Save preset" (Individual Images) saves</div>
  <label class="pf-check"><input type="radio" name="pfPresetSave" data-pref="presetSave" value="browser"><span>In this browser</span></label>
  <label class="pf-check"><input type="radio" name="pfPresetSave" data-pref="presetSave" value="file"><span>To a .json file</span></label>
  <div class="pf-sub">All the settings</div>
  <p class="pf-note">One .json file with every choice the program keeps: these settings, the theme and language, the export and view choices, and the color presets of this browser. Not the photos, their edits or the undo history.</p>
  <div class="pf-btns"><button type="button" class="btn btn-outline" id="pfAllSave">Save settings to a .json file</button><button type="button" class="btn btn-outline" id="pfAllOpen">Open settings from a .json file...</button></div>
  <p class="pf-note">Saving the file also keeps the settings shown here in this browser. Opening a file applies and keeps its settings at once.</p>
  <input type="file" id="pfAllFile" accept=".json,application/json" hidden>
</div>
<div class="pf-page" data-page="lang" role="tabpanel" hidden>
  <label class="pf-row"><span>Language</span><select id="pfLang" data-noi18n>${I18N_LANGS.map(l => `<option value="${l}">${langName(l)}</option>`).join('')}</select></label>
</div>`;
    // what is kept now: put back if the window closes without Save
    const keep = Object.assign({}, PREFS); let keepLang = LANG, keepTheme = themeStored(), saved = false;
    const box = openCard('prefs', html, [['Restore defaults', () => restore(), true], ['Cancel'], ['Save', () => save()]]);
    box.classList.add('pf-box');
    const btns = box.lastElementChild.querySelectorAll('button'); btns[0].classList.add('pf-left'); btns[2].classList.remove('btn-outline'); btns[2].id = 'pfSave';
    const tabs = [...box.querySelectorAll('.pf-tab')], pages = [...box.querySelectorAll('.pf-page')], tl = box.querySelector('.pf-tabs'), prev = box.querySelector('#pfPrev'), next = box.querySelector('#pfNext');
    let cur = 0;
    const show = (i) => {
        cur = Math.max(0, Math.min(tabs.length - 1, i));
        tabs.forEach((b, j) => { const on = j === cur; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
        pages.forEach(p => { p.hidden = p.dataset.page !== tabs[cur].dataset.tab; });
        const t = tabs[cur], l = t.offsetLeft - tl.offsetLeft, r = l + t.offsetWidth;   // the chosen tab scrolled into view (only the tab bar moves)
        if (l < tl.scrollLeft) tl.scrollLeft = l - 8; else if (r > tl.scrollLeft + tl.clientWidth) tl.scrollLeft = r - tl.clientWidth + 8;
        prev.disabled = cur === 0; next.disabled = cur === tabs.length - 1;
    };
    tabs.forEach((t, i) => {
        t.addEventListener('click', () => show(i));
        t.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); e.stopPropagation(); show(cur + (e.key === 'ArrowRight' ? 1 : -1)); tabs[cur].focus(); });
    });
    prev.addEventListener('click', () => show(cur - 1)); next.addEventListener('click', () => show(cur + 1));
    show(0);
    const ex = box.querySelector('.pf-ex'), mpo = box.querySelector('#pfMpoProfile'), cam = box.querySelector('#pfMpoCamera'), lang = box.querySelector('#pfLang'), theme = box.querySelector('#pfTheme');
    mpo.value = mpoSel.value; cam.checked = mpoCam.checked; lang.value = LANG; theme.value = keepTheme;
    const example = () => { ex.textContent = `${prefFileName('mpo', 'mpo')} · ${prefFileName('sbs', 'jpg', 'full-sbs')}`; };
    function sync() {   // the controls show the values (after any correction: out of range, empty name...)
        box.querySelectorAll('[data-pref]').forEach(el => { const v = PREFS[el.dataset.pref]; if (el.type === 'checkbox') el.checked = !!v; else if (el.type === 'radio') el.checked = v === el.value; else if (document.activeElement !== el) el.value = v; });
        example();
    }
    box.querySelectorAll('[data-pref]').forEach(el => {
        const k = el.dataset.pref;
        el.addEventListener('change', () => { if (prefPut(PREFS, k, el.type === 'checkbox' ? el.checked : el.value)) prefApply(); if (el.type !== 'checkbox' && el.type !== 'radio') el.value = PREFS[k]; sync(); });   // shown now, kept with Save
        if (el.type === 'text') el.addEventListener('input', () => { const was = PREFS[k]; if (prefPut(PREFS, k, el.value)) { example(); PREFS[k] = was; } });   // live example
    });
    lang.addEventListener('change', () => setLang(lang.value, false));   // the window itself changes language at once
    theme.addEventListener('change', () => themeShow(theme.value));
    sync();
    function restore() {   // the defaults, shown; kept only with Save (theme and language stay)
        Object.keys(PREF_DEFAULTS).forEach(k => { PREFS[k] = PREF_DEFAULTS[k]; }); prefApply(); mpo.value = 'std'; cam.checked = true; sync();
        showToast('Defaults restored. Press Save to keep them.');
    }
    function commit() {   // keeps what the window shows (Save, and "Save settings to a .json file")
        prefSave();
        Object.keys(keep).forEach(k => { if (keep[k] !== PREFS[k]) prefCommitted(k, keep[k]); });
        setLang(lang.value, true); if (theme.value !== keepTheme) themeKeep(theme.value);
        [[mpoSel, 'value', mpo.value], [mpoCam, 'checked', cam.checked]].forEach(([el, p, v]) => { if (el[p] !== v) { el[p] = v; el.dispatchEvent(new Event('change', { bubbles: true })); } });   // remembered and applied like before
        if (!imagesLoaded) goStartTab();   // on the start screen the new start tab shows at once
        Object.assign(keep, PREFS); keepLang = LANG; keepTheme = theme.value;   // the new starting point if the window is then closed without Save
    }
    function save() { saved = true; commit(); showToast('Settings saved.'); }
    const changed = () => JSON.stringify(keep) !== JSON.stringify(PREFS) || LANG !== keepLang || theme.value !== keepTheme || mpo.value !== mpoSel.value || cam.checked !== mpoCam.checked;
    const ov = box.parentNode;
    new MutationObserver((_, obs) => {   // closed without Save (Cancel, Esc, a click outside): everything as it was
        if (document.body.contains(ov)) return; obs.disconnect();
        if (saved) return;
        if (changed()) showToast('The changes were not kept: press Save to keep them.');
        Object.assign(PREFS, keep); prefApply();
        if (LANG !== keepLang) setLang(keepLang, false);
        themeShow(keepTheme);
    }).observe(document.body, { childList: true });
    const file = box.querySelector('#pfAllFile');
    box.querySelector('#pfAllOpen').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const f = file.files[0]; file.value = ''; if (!f) return;
        let o = null; try { if (f.size <= 8e6) o = JSON.parse(await f.text()); } catch (e) { o = null; }
        if (!o || typeof o !== 'object' || o.format !== SETTINGS_FILE) { showToast('This file does not contain settings saved by ' + APP.name + '.', true); return; }
        saved = true; ov.remove();   // what was being tried in the window gives way to the file
        settingsLoad(o); showToast('Settings opened from the file and kept.');
    });
    box.querySelector('#pfAllSave').addEventListener('click', async () => {
        commit();   // what the window shows is what goes into the file, and it is kept in this browser too
        const data = settingsBundle(Object.assign({}, PREFS), LANG);
        try { await saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `3dtoolad_settings_${stamp()}.json`); showToast('Settings saved to a file.'); }
        catch (e) { if (e && e.message === 'cancelled') showToast('Cancelled.'); else showToast('Could not save the file.', true); }
    });
    setTimeout(() => tabs[0].focus(), 0);
}
$id('btnSettings').addEventListener('click', prefOpen);

// While a window is open, the page behind it does not scroll (phones and tablets scrolled the panel behind instead of the window).
new MutationObserver(() => {
    document.documentElement.classList.toggle('modal-open', !!document.querySelector('body > .ov, .modal.active'));
}).observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
const sbsM = document.getElementById('sbsModal'); if (sbsM) new MutationObserver(() => document.documentElement.classList.toggle('modal-open', !!document.querySelector('body > .ov, .modal.active'))).observe(sbsM, { attributes: true, attributeFilter: ['class'] });

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
