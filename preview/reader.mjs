const API_TOC = "/api/toc";
const LS_LAST = "reader:lastHref";
const LS_MODE = "reader:mode"; // "single" | "continuous"
const LS_BM   = "reader:bookmarks"; // array of href

const el = (id)=>document.getElementById(id);
const tocEl = el("toc");
const bmEl  = el("bm");
const view  = el("view");
const q     = el("q");
const aOpen = el("open");
const btnMode = el("btn-mode");
const btnContinue = el("btn-continue");
const btnBookmarks = el("btn-bookmarks");
const btnPrev = el("prev");
const btnNext = el("next");

let toc = [];
let order = [];
let currentHref = null;

function loadBM(){
  try{ return JSON.parse(localStorage.getItem(LS_BM) || "[]"); } catch { return []; }
}
function saveBM(arr){ localStorage.setItem(LS_BM, JSON.stringify(arr)); }
function isBM(href){ return loadBM().includes(href); }

function setLast(href){ localStorage.setItem(LS_LAST, href); }
function getLast(){ return localStorage.getItem(LS_LAST) || ""; }

function getMode(){
  const m = localStorage.getItem(LS_MODE);
  return (m === "continuous") ? "continuous" : "single";
}
function setMode(m){ localStorage.setItem(LS_MODE, m); }

async function fetchTOC(){
  const r = await fetch(API_TOC, { cache:"no-store" });
  if(!r.ok) throw new Error("TOC fetch failed: " + r.status);
  const data = await r.json();

  // Accept multiple shapes: {items:[...]}, {toc:[...]}, [...]
  const items = Array.isArray(data) ? data
    : Array.isArray(data.items) ? data.items
    : Array.isArray(data.toc) ? data.toc
    : [];

  // Normalize: expect {title, href, topic?, kind?}
  const norm = items.map((x)=>({
    title: x.title || x.name || x.label || (x.href || "").split("/").pop(),
    href:  x.href  || x.url  || x.path  || "",
    topic: x.topic || x.section || "",
    kind:  x.kind  || x.type || ""
  })).filter(x=>x.href);

  toc = norm;
  order = norm.map(x=>x.href);
}

function renderTOC(filter=""){
  tocEl.innerHTML = "";
  const f = filter.trim().toLowerCase();

  const grouped = new Map();
  for(const it of toc){
    const key = it.topic || "כללי";
    if(!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(it);
  }

  for(const [topic, items] of grouped.entries()){
    const h = document.createElement("div");
    h.className = "side-title";
    h.textContent = topic;
    tocEl.appendChild(h);

    for(const it of items){
      if(f && !(it.title.toLowerCase().includes(f) || it.href.toLowerCase().includes(f))) continue;

      const row = document.createElement("div");
      row.className = "item";
      row.onclick = ()=>openHref(it.href);

      const t = document.createElement("div");
      t.innerHTML = <div class="t"></div><div class="k"></div>;

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.textContent = it.kind || "";

      const star = document.createElement("button");
      star.className = "star" + (isBM(it.href) ? " on" : "");
      star.textContent = "★";
      star.onclick = (e)=>{
        e.stopPropagation();
        toggleBM(it.href);
        star.className = "star" + (isBM(it.href) ? " on" : "");
        renderBM();
      };

      row.appendChild(t);
      row.appendChild(badge);
      row.appendChild(star);
      tocEl.appendChild(row);
    }
  }
}

function renderBM(){
  bmEl.innerHTML = "";
  const bms = loadBM();
  if(!bms.length){
    const x = document.createElement("div");
    x.className="item";
    x.style.opacity="0.8";
    x.textContent="אין סימניות עדיין";
    bmEl.appendChild(x);
    return;
  }
  for(const href of bms){
    const it = toc.find(x=>x.href===href);
    const title = it ? it.title : href.split("/").pop();
    const row = document.createElement("div");
    row.className="item";
    row.onclick = ()=>openHref(href);
    row.innerHTML = <div><div class="t"></div><div class="k"></div></div>;
    bmEl.appendChild(row);
  }
}

function toggleBM(href){
  const bms = loadBM();
  const idx = bms.indexOf(href);
  if(idx>=0) bms.splice(idx,1);
  else bms.unshift(href);
  saveBM(bms);
}

function idxOf(href){ return order.indexOf(href); }

function openHref(href){
  currentHref = href;
  setLast(href);
  aOpen.href = href;

  const mode = getMode();
  btnMode.textContent = (mode==="continuous") ? "דף" : "רציף";

  const i = idxOf(href);
  btnPrev.disabled = i<=0;
  btnNext.disabled = i<0 || i>=order.length-1;

  if(mode==="single"){
    view.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.className="frame";
    iframe.src = href;
    view.appendChild(iframe);
  } else {
    // Continuous: render current + next 2 for "book feel"
    view.innerHTML = "";
    const stack = document.createElement("div");
    stack.className="stack";
    const slice = order.slice(Math.max(0,i), Math.min(order.length, i+3));
    for(const h of slice){
      const iframe = document.createElement("iframe");
      iframe.src = h;
      stack.appendChild(iframe);
    }
    view.appendChild(stack);
  }
}

function go(delta){
  if(!currentHref) return;
  const i = idxOf(currentHref);
  const j = i + delta;
  if(j<0 || j>=order.length) return;
  openHref(order[j]);
}

btnPrev.onclick = ()=>go(-1);
btnNext.onclick = ()=>go(+1);

btnContinue.onclick = ()=>{
  const last = getLast();
  if(last) openHref(last);
  else if(order.length) openHref(order[0]);
};

btnMode.onclick = ()=>{
  const mode = getMode();
  setMode(mode==="single" ? "continuous" : "single");
  if(currentHref) openHref(currentHref);
};

btnBookmarks.onclick = ()=>{
  // focus bookmarks area quickly
  bmEl.scrollIntoView({behavior:"smooth", block:"start"});
};

q.addEventListener("input", ()=>renderTOC(q.value));

(async function main(){
  await fetchTOC();
  renderTOC("");
  renderBM();
  const last = getLast();
  openHref(last && order.includes(last) ? last : order[0]);
})();
