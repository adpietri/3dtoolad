/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- SLIDER VALUES: every slider gets a small box with its exact value ---
// Moving the slider updates the box; typing a number in the box (Enter, or leaving it) moves the slider there, kept
// inside the slider's range and on its steps. Arrow keys in the box change it one step (Shift: ten steps).
// Where a slider already showed its number next to the label, the box takes that number's place, so the label still
// reads the same ("Rotation [0.00]°"). The program keeps writing its own number into the old (now hidden) element,
// so nothing else had to change. Sliders created later (Tools, export windows) get their box as they appear.
const SV = { boxes: new WeakMap() };
const svProto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const svDecimals = (el) => { const s = String(el.step || '1'), i = s.indexOf('.'); return s === 'any' ? 2 : i < 0 ? 0 : s.length - i - 1; };
const svFormat = (el, v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(svDecimals(el)).replace(/^-(0(\.0+)?)$/, '$1') : ''; };
function svSync(el) {   // the box shows the slider's value, unless someone is typing in it
    const b = SV.boxes.get(el); if (b && document.activeElement !== b) b.value = svFormat(el, svProto.get.call(el));
}
function svCommit(el, box) {   // the typed value, within the slider's range and on its steps
    const t = box.value.trim().replace(/,/g, '.').replace(/[−–]/g, '-').replace(/^\+/, '');
    let v = parseFloat(t);
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t) || !Number.isFinite(v)) { box.value = svFormat(el, el.value); return; }   // not a number: back to the slider's value
    const mn = parseFloat(el.min), mx = parseFloat(el.max), st = parseFloat(el.step) > 0 ? parseFloat(el.step) : 1, lo = Number.isFinite(mn) ? mn : 0, hi = Number.isFinite(mx) ? mx : 100;
    v = Math.min(hi, Math.max(lo, v));
    v = Math.min(hi, Math.max(lo, lo + Math.round((v - lo) / st) * st));
    const old = el.value; el.value = v.toFixed(svDecimals(el) + 2);
    box.value = svFormat(el, el.value);
    if (el.value !== old) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }   // the program reacts as if the slider was moved
}
function svAttach(el) {
    if (SV.boxes.has(el) || el.closest('[data-nosv]')) return;
    const box = document.createElement('input');
    box.type = 'text'; box.className = 'sv-box'; box.inputMode = 'decimal'; box.autocomplete = 'off'; box.spellcheck = false;
    box.title = 'Type a value and press Enter';
    SV.boxes.set(el, box);
    // the number the slider already shows, if any: next to it (Tools) or at the end of the label above it
    const lab = el.previousElementSibling && el.previousElementSibling.tagName === 'LABEL' ? el.previousElementSibling : null;
    const next = el.nextElementSibling, own = next && next.tagName === 'SPAN' && el.id && next.id === el.id + 'V' ? next : null;
    const inLab = !own && lab ? [...lab.querySelectorAll('span')].filter(s => /^\s*[-−+]?\d/.test(s.textContent)).pop() : null;
    const span = own || inLab;
    if (span) {
        const wrap = document.createElement('span'); wrap.className = 'sv-wrap';
        span.parentNode.insertBefore(wrap, span);
        const tail = []; for (let n = span.nextSibling; n; n = n.nextSibling) if (inLab) tail.push(n);   // "%", "°", "% (black edge bars...)": kept right after the box
        wrap.append(box, span); tail.forEach(n => wrap.appendChild(n));
        span.classList.add('sv-old');
        if (own) {   // Tools show the unit inside their number ("2.5%"): keep the unit next to the box
            const unit = document.createElement('span'); unit.className = 'sv-unit'; wrap.appendChild(unit);
            const upd = () => { unit.textContent = span.textContent.replace(/^\s*[-−+]?[\d.,]*\s*/, ''); };
            upd(); new MutationObserver(upd).observe(span, { childList: true, characterData: true, subtree: true });
        }
    } else {   // no number shown yet: a small row with the box, right above the slider
        const row = document.createElement('div'); row.className = 'sv-row'; row.appendChild(box); el.parentNode.insertBefore(row, el);
    }
    Object.defineProperty(el, 'value', {   // any change made by the program (undo, reset, presets...) shows in the box
        configurable: true, get() { return svProto.get.call(this); }, set(v) { svProto.set.call(this, v); svSync(this); }
    });
    el.addEventListener('input', () => svSync(el));
    box.addEventListener('change', () => svCommit(el, box));
    box.addEventListener('focus', () => box.select());
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') return;
        e.stopPropagation();   // typed keys stay in the box (the arrows would otherwise move the alignment, letters would be shortcuts)
        if (e.key === 'Enter') { e.preventDefault(); svCommit(el, box); box.select(); }
        else if (e.key === 'Escape') { e.preventDefault(); box.value = svFormat(el, el.value); box.blur(); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault(); const st = parseFloat(el.step) > 0 ? parseFloat(el.step) : 1, cur = parseFloat(box.value.replace(',', '.'));
            box.value = String((Number.isFinite(cur) ? cur : parseFloat(el.value)) + (e.key === 'ArrowUp' ? 1 : -1) * st * (e.shiftKey ? 10 : 1)); svCommit(el, box); box.select();
        }
    });
    svSync(el);
}
document.querySelectorAll('input[type="range"]').forEach(svAttach);
new MutationObserver((list) => {   // sliders of windows opened later
    for (const m of list) m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('input[type="range"]')) svAttach(n); else n.querySelectorAll('input[type="range"]').forEach(svAttach);
    });
}).observe(document.body, { childList: true, subtree: true });

// --- COLOUR SLIDERS: the track shows what moving the slider does to the picture ---
// Black to white for the ones that make it darker or lighter, grey to vivid colours for saturation, and the colour
// pairs of white balance, the colour mixer and the tone-curve channels. The colour mixer's own tracks (the band's
// neighbouring hues, grey to the band colour, dark to light) are set by the Individual Images code.
const SV_BW = 'linear-gradient(to right, #000, #fff)';
const SV_SAT = (a) => `linear-gradient(to right, rgba(128,128,128,${a}), rgba(128,128,128,0)), linear-gradient(to right, #ff3030, #ffd000, #30d040, #20c8ff, #3050ff, #c040ff, #ff3080)`;
const SV_CURVE = { rgb: SV_BW, r: 'linear-gradient(to right, #00b4b4, #ff3c3c)', g: 'linear-gradient(to right, #d040d0, #2fc040)', b: 'linear-gradient(to right, #e0c800, #3a5cff)' };
const svColor = (id, bg) => { const el = document.getElementById(id); if (!el) return; el.classList.add('sv-color'); if (bg) el.style.background = bg; };
['adj_exposure', 'adj_brightness', 'adj_shadows', 'adj_highlights'].forEach(id => svColor(id, SV_BW));
svColor('adj_saturation', SV_SAT(1)); svColor('adj_vibrance', SV_SAT(0.85));
['adj_temperature', 'adj_tint', 'bandH', 'bandS', 'bandL'].forEach(id => svColor(id));   // their colours come from their own code
function svCurveColors() { const ch = typeof curveCh === 'function' ? curveCh() : 'rgb'; for (let i = 0; i < 4; i++) svColor('curve' + i, SV_CURVE[ch] || SV_BW); }
svCurveColors();
const svCh = document.getElementById('curveCh'); if (svCh) svCh.addEventListener('change', svCurveColors);

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
