/* 3DToolAD - Copyright (C) 2026 adpietri - GPL v3 or later (see LICENSE / index.html). */

// --- STANDALONE 3D VIEWER (one HTML file with both photos inside; works offline) ---
const VIEWER_HTML = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3D viewer</title>'
    + '<style>html,body{margin:0;height:100%;background:#111;color:#eee;font:14px system-ui,sans-serif}#bar{position:fixed;top:0;left:0;right:0;display:flex;gap:10px;flex-wrap:wrap;align-items:center;padding:8px;background:rgba(0,0,0,.65);z-index:2;transition:opacity .35s,transform .35s}'
    + '#bar.hide{opacity:0;transform:translateY(-100%);pointer-events:none}#bar span{display:inline-flex;gap:10px;align-items:center;flex-wrap:wrap}label{display:inline-flex;gap:6px;align-items:center}select,button,input{font:inherit}#wrap{height:100%;display:flex;align-items:center;justify-content:center}canvas{display:block;max-width:100%;max-height:100%}body.fit canvas{width:100%;height:100%;object-fit:contain}</style></head><body class="fit">'
    + '<div id="bar"><select id="m"><option value="wig">Wigglegram</option><option value="par">Parallel side-by-side</option><option value="crs">Cross-eye side-by-side</option><option value="ana">Anaglyph (red/cyan)</option></select>'
    + '<span id="ws"><label>Speed <input id="s" type="range" min="60" max="400" value="@@MS@@" dir="rtl"></label><label><input id="x" type="checkbox" checked> Smooth crossfade</label></span>'
    + '<span id="as"><select id="t"><option value="dubois">Dubois</option><option value="classic">Classic</option><option value="halfcolor">Half-color</option><option value="optimized">Optimized</option></select></span>'
    + '<label title="Enlarge small pictures to fill the window"><input id="fit" type="checkbox" checked> Fit to window</label><button id="f">Full screen</button></div><div id="wrap"><canvas id="c"></canvas></div><scr' + 'ipt>'
    + 'function $(i){return document.getElementById(i);}$("fit").onchange=function(){document.body.className=this.checked?"fit":"";};'
    // the bar hides after a few seconds without mouse, touch or keys, and comes back with any of them
    + 'var bar=$("bar"),tm=0,touch=false;function hide(){if(!touch&&bar.matches&&bar.matches(":hover")){tm=setTimeout(hide,2500);return;}bar.className="hide";document.body.style.cursor="none";}'
    + 'var tt=0;function show(e){if(e&&e.type){if(e.type==="touchstart"||e.pointerType==="touch"){touch=true;tt=Date.now();}else if(e.type==="mousemove"&&Date.now()-tt>1000)touch=false;}bar.className="";document.body.style.cursor="";clearTimeout(tm);tm=setTimeout(hide,touch?4000:2500);}'
    + '["mousemove","pointerdown","touchstart","keydown","wheel"].forEach(function(k){window.addEventListener(k,show,{passive:true});});["change","input"].forEach(function(k){bar.addEventListener(k,show);});show();'
    + 'var M={classic:[1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],halfcolor:[0.299,0.587,0.114,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],optimized:[0,0.7,0.3,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1],'
    + 'dubois:[0.456,0.500,0.176,-0.043,-0.088,-0.002,-0.040,-0.038,-0.016,0.378,0.734,-0.018,-0.015,-0.021,-0.005,-0.072,-0.113,1.226]};'
    + 'var L=new Image(),R=new Image(),n=0;function ok(){if(++n===2)start();}L.onload=ok;R.onload=ok;L.src="@@L@@";R.src="@@R@@";'
    + 'function start(){var c=$("c"),x=c.getContext("2d",{willReadFrequently:true}),w=L.width,h=L.height,m=$("m"),s=$("s"),xf=$("x"),at=$("t"),t0=0,fr=0,cur="",A=null,B=null;at.value="@@ANA@@";'
    + 'function ui(){$("ws").style.display=m.value==="wig"?"":"none";$("as").style.display=m.value==="ana"?"":"none";}m.addEventListener("change",ui);ui();'
    + 'function ana(){c.width=w;c.height=h;if(!A){x.drawImage(L,0,0);A=x.getImageData(0,0,w,h).data;x.drawImage(R,0,0);B=x.getImageData(0,0,w,h).data;}'
    + 'var o=x.createImageData(w,h),d=o.data,k=M[at.value]||M.dubois;for(var i=0;i<d.length;i+=4){var r0=A[i],g0=A[i+1],b0=A[i+2],r1=B[i],g1=B[i+1],b1=B[i+2];'
    + 'd[i]=k[0]*r0+k[1]*g0+k[2]*b0+k[3]*r1+k[4]*g1+k[5]*b1;d[i+1]=k[6]*r0+k[7]*g0+k[8]*b0+k[9]*r1+k[10]*g1+k[11]*b1;d[i+2]=k[12]*r0+k[13]*g0+k[14]*b0+k[15]*r1+k[16]*g1+k[17]*b1;d[i+3]=255;}x.putImageData(o,0,0);}'
    + 'function draw(now){var v=m.value,key=v==="ana"?"ana"+at.value:v;'
    + 'if(v==="wig"){if(cur!=="wig"){c.width=w;c.height=h;cur="wig";t0=now;}var sp=+s.value,el=now-t0;'
    + 'if(xf.checked){var a=Math.sin(Math.min(1,Math.max(0,el/sp))*Math.PI/2);x.globalAlpha=1;x.drawImage(fr?R:L,0,0);x.globalAlpha=a;x.drawImage(fr?L:R,0,0);x.globalAlpha=1;if(el>=sp){fr=1-fr;t0=now;}}'
    + 'else{if(el>=sp){fr=1-fr;t0=now;}x.drawImage(fr?R:L,0,0);}}'
    + 'else if(key!==cur){cur=key;if(v==="ana"){ana();}else{c.width=w*2;c.height=h;x.drawImage(v==="par"?L:R,0,0);x.drawImage(v==="par"?R:L,w,0);}}requestAnimationFrame(draw);}'
    + '$("f").onclick=function(){var d=document,e=d.documentElement;if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);}else{var r=e.requestFullscreen||e.webkitRequestFullscreen;if(r)r.call(e);}};requestAnimationFrame(draw);}<\/script></body></html>';
async function buildViewerHtml(src) {   // src: { L, R, w, h } for the batch; default = the current aligned pair
    const al = src || getAlignedFrames(false), k = Math.min(1, 1600 / al.w), w = Math.round(al.w * k), h = Math.round(al.h * k);
    const enc = async (cv) => {
        const sc = k < 1 ? scaledCanvas(cv, w, h) : cv, buf = await canvasToJpegBuffer(sc, 0.88); if (sc !== cv) releaseCanvas(sc);
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error || new Error('could not encode the image')); fr.readAsDataURL(new Blob([buf], { type: 'image/jpeg' })); });
    };
    let L, R; try { L = await enc(al.L); R = await enc(al.R); } finally { if (!src) { releaseCanvas(al.L); releaseCanvas(al.R); } }   // the batch frees its own copies
    const ms = String(Math.max(60, Math.min(400, parseInt(speedRange.value) || 150)));
    const am = document.getElementById('anaglyphMode').value, ana = ['dubois', 'classic', 'halfcolor', 'optimized'].includes(am) ? am : 'dubois';   // the viewer's anaglyph starts as the program's, when it has it
    const vt = (h) => LANG === 'en' ? h : h.replace(/<html>/, '<html lang="' + I18N[LANG].html + '">').replace(/(<title>|<option value="\w+">|<label[^>]*>|<input id="(?:x|fit)" type="checkbox" checked>|<button id="f">)([^<]+)/g, (m, a, b) => a + trText(b)).replace(/title="([^"]+)"/g, (m, a) => 'title="' + trText(a) + '"');   // the viewer in the language in use
    return vt(VIEWER_HTML).replace('@@MS@@', () => ms).replace('@@ANA@@', () => ana).replace('@@L@@', () => L).replace('@@R@@', () => R);
}
document.getElementById('btnViewerHtml').addEventListener('click', (e) => {
    withBusy(e.currentTarget, 'Building viewer...', 'viewer', async () => {
        await saveBlob(new Blob([await buildViewerHtml()], { type: 'text/html' }), `3d_viewer_${stamp()}.html`); showToast("Standalone viewer saved.");
    });
});

APP_PARTS.push(document.currentScript);   // start-up check: this file was found and ran to the end (see index.html)
