/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- FOLDING SECTIONS: every heading of the left panels (Wigglegram, Anaglyph, Individual Images) has a − / + button ---
// "−" folds the section away and turns into "+"; "+" opens it again. Clicking the heading's text does the same.
// A panel heading folds its whole panel; a heading inside Individual Images folds what comes after it, up to the next
// heading (Settings > Appearance can turn the remembering off). Nothing is moved or rebuilt: the folded elements only get a class that hides them, so the rest of the program
// (which shows and hides parts itself) is not affected. The folded sections are remembered in this browser.
const PNL_KEY = '3dtool-folded';
const pnlFolded = (() => { if (!PREFS.rememberFolds) return new Set(); try { const a = JSON.parse(localStorage.getItem(PNL_KEY)); return new Set(Array.isArray(a) ? a.filter(v => typeof v === 'string') : []); } catch (e) { return new Set(); } })();
function pnlStore() {   // Settings > Appearance: remembered, or forgotten when the page closes
    try { if (PREFS.rememberFolds) localStorage.setItem(PNL_KEY, JSON.stringify([...pnlFolded])); else localStorage.removeItem(PNL_KEY); } catch (e) { }
}
function pnlRange(head) {   // the elements this heading folds
    const sub = head.classList.contains('indiv-sub'), out = [];
    for (let n = head.nextElementSibling; n; n = n.nextElementSibling) { if (sub && (n.classList.contains('indiv-sub') || n.classList.contains('panel-title'))) break; out.push(n); }
    return out;
}
function pnlSet(head, folded) {
    const cls = head.classList.contains('indiv-sub') ? 'pnl-hide-s' : 'pnl-hide-p';   // two classes: a panel and a section inside it fold independently
    pnlRange(head).forEach(n => n.classList.toggle(cls, folded));
    head.classList.toggle('pnl-folded', folded);
    const b = head.querySelector('.pnl-btn'); b.textContent = folded ? '+' : '−'; b.setAttribute('aria-expanded', String(!folded));
    b.title = folded ? 'Show this section' : 'Hide this section';
}
document.querySelectorAll('.sidebar:not(.sidebar-right) .panel-title, .sidebar:not(.sidebar-right) .indiv-sub').forEach(head => {
    const sec = head.closest('.panel-section'), key = (sec && sec.id || 'panel') + ':' + (sec ? [...sec.querySelectorAll('.panel-title, .indiv-sub')].indexOf(head) : 0);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pnl-btn'; b.setAttribute('aria-label', 'Show or hide this section');
    head.classList.add('pnl-head'); head.appendChild(b);
    head.addEventListener('click', (e) => {
        if (e.target !== head && e.target !== b && e.target.closest('input, select, a, label, button:not(.pnl-btn)')) return;
        const folded = !head.classList.contains('pnl-folded'); pnlSet(head, folded);
        if (folded) pnlFolded.add(key); else pnlFolded.delete(key);
        pnlStore();
    });
    pnlSet(head, pnlFolded.has(key));
});
function pnlToggleAll() {   // Shift+F: folds every section of the panels on screen, or opens them all again
    const heads = [...document.querySelectorAll('.pnl-head')].filter(h => h.offsetParent !== null && !h.closest('.pnl-hide-p, .pnl-hide-s'));
    const fold = heads.some(h => !h.classList.contains('pnl-folded'));
    heads.forEach(h => { if (h.classList.contains('pnl-folded') !== fold) h.click(); });
}
// Screen readers: every control gets the name written next to it (a label that only sits beside a control does not name it)
function a11yName(root) {
    (root || document).querySelectorAll('label').forEach(l => {
        if (l.htmlFor || l.querySelector('input:not(.sv-box), select, textarea')) return;   // (a slider's value box inside the label does not name the slider)
        let n = l.nextElementSibling; if (n && n.classList.contains('sv-row')) n = n.nextElementSibling;
        if (n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName) && n.type !== 'hidden') { if (n.id) l.htmlFor = n.id; else if (!n.getAttribute('aria-label')) n.setAttribute('aria-label', l.textContent.replace(/\s+/g, ' ').trim()); }
    });
    (root || document).querySelectorAll('.sv-box').forEach(b => {   // the value boxes of the sliders: "<slider name>, value"
        if (b.getAttribute('aria-label')) return;
        const lab = b.closest('label') || (b.closest('.sv-row') && b.closest('.sv-row').previousElementSibling);
        const t = lab && lab.tagName === 'LABEL' ? lab.cloneNode(true) : null; if (t) t.querySelectorAll('.sv-wrap, .sv-old').forEach(x => x.remove());
        const name = t ? t.textContent.replace(/\s+/g, ' ').trim() : ''; b.setAttribute('aria-label', (name ? name + ', ' : '') + 'value');
    });
}
a11yName();
new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.querySelector && n.querySelector('label, .sv-box')) a11yName(n); }); }).observe(document.body, { childList: true, subtree: true });

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
