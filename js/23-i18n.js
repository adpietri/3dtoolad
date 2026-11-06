/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- LANGUAGES ---
// The program is written in English. Each other language is a dictionary keyed by the English text (plus patterns for
// texts with numbers or names in them). Everything on the page is translated as it appears (a watcher sees new or changed
// text), so the rest of the program needs no changes. To add a language: copy js/lang/pt-BR.js, translate it, and add its <script> line
// to index.html next to the others.
const I18N = typeof I18N_PACKS !== 'undefined' ? I18N_PACKS : {};   // the languages loaded from js/lang/ (English is built in)
const I18N_LANGS = ['en', ...Object.keys(I18N)];
const I18N_SKIP = '#dbgPanel, .dbgcard, [data-noi18n], script, style, pre, textarea';   // the debug tools stay in English (bug reports)
const I18N_ATTRS = ['title', 'placeholder', 'aria-label'];
let LANG = 'en';
const i18nRev = {}, i18nSeen = new WeakMap(), i18nNorm = (s) => s.replace(/\s+/g, ' ').trim();
Object.entries(I18N).forEach(([k, L]) => { const r = i18nRev[k] = new Map(); Object.entries(L.words).forEach(([en, t]) => { if (!r.has(t)) r.set(t, en); }); L.rx = L.rx.map(([p, t]) => [new RegExp(p), t]); });
const i18nWrap = (s, n, out) => s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];   // keeps the spaces around the text
function trText(s) {   // English text -> current language (text without a translation stays as it is)
    if (LANG === 'en' || !s) return s;
    const L = I18N[LANG], n = i18nNorm(s); if (!n) return s;
    let out = L.words[n];
    if (out === undefined) for (const [re, t] of L.rx) { const m = n.match(re); if (m) { out = t.replace(/\{(t?)(\d)\}/g, (_, tt, i) => { const g = m[+i] || ''; return tt ? trText(g) : g; }); break; } }
    return out === undefined ? s : i18nWrap(s, n, out);
}
function toEnglish(s) {   // a translated text read back from the page (e.g. a button label put back) -> its English source
    const n = i18nNorm(s); if (!n) return s;
    for (const k in i18nRev) { const e = i18nRev[k].get(n); if (e !== undefined) return i18nWrap(s, n, e); }
    return s;
}
function i18nNode(t, force) {
    const p = t.parentElement; if (!p || p.closest(I18N_SKIP)) return;
    const cur = t.data, r = i18nSeen.get(t); let src;
    if (r && cur === r.out) { if (!force) return; src = r.src; }
    else { if (!/[A-Za-zÀ-ÿ]{2}/.test(cur)) return; src = toEnglish(cur); }
    const out = trText(src); i18nSeen.set(t, { src, out }); if (out !== cur) t.data = out;
}
function i18nAttr(el, a, force) {
    const cur = el.getAttribute(a); if (!cur || el.closest(I18N_SKIP)) return;
    let r = i18nSeen.get(el); if (!r) i18nSeen.set(el, r = {});
    const x = r[a]; let src;
    if (x && cur === x.out) { if (!force) return; src = x.src; } else src = toEnglish(cur);
    const out = trText(src); r[a] = { src, out }; if (out !== cur) el.setAttribute(a, out);
}
function i18nTree(root, force) {
    if (root.nodeType === 3) { i18nNode(root, force); return; }
    if (root.nodeType !== 1 || (root.closest && root.closest(I18N_SKIP))) return;
    I18N_ATTRS.forEach(a => { if (root.hasAttribute(a)) i18nAttr(root, a, force); });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) i18nNode(n, force); else for (const a of I18N_ATTRS) if (n.hasAttribute(a)) i18nAttr(n, a, force); }
}
const i18nObs = new MutationObserver((list) => {
    for (const m of list) {
        if (m.type === 'characterData') i18nNode(m.target);
        else if (m.type === 'attributes') i18nAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(n => i18nTree(n));
    }
});
// The language is chosen in Settings > Languages (js/27-prefs.js).
const langName = (l) => l === 'en' ? 'English' : I18N[l].name;
function setLang(l, save) {
    if (!I18N_LANGS.includes(l)) l = 'en';
    const was = LANG; LANG = l;
    document.documentElement.lang = l === 'en' ? 'en' : I18N[l].html;
    const b = document.getElementById('btnLang');
    if (b) { b.textContent = l === 'en' ? 'EN' : I18N[l].label; b.title = 'Language / Idioma: ' + (l === 'en' ? 'English' : I18N[l].name); }
    if (save) { try { localStorage.setItem('3dtool-lang', l); } catch (e) { } }
    i18nObs.disconnect();
    if (l !== 'en' || was !== 'en') i18nTree(document.body, true);   // every text again, in the new language
    if (l !== 'en') i18nObs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
    if (was !== l) document.dispatchEvent(new CustomEvent('langchange', { detail: l }));   // for parts that build their text themselves (History window)
}
(function initLang() {   // ?lang=pt / ?lang=en, else the choice saved in this browser, else the browser's language
    const pick = (v) => { const s = String(v || '').toLowerCase(); return I18N_LANGS.find(l => s === l || s.startsWith(l + '-')) || null; };   // 'pt-BR', 'pt-PT' -> 'pt'
    let saved = null; try { saved = localStorage.getItem('3dtool-lang'); } catch (e) { }
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en', q = (location.search.match(/[?&]lang=([a-z-]+)/i) || [])[1];
    setLang(pick(q) || pick(saved) || pick(nav) || 'en', false);
})();

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
