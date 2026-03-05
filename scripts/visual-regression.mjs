import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const base = process.cwd();
const baselineDir = path.join(base, "visual-baseline");
const outDir = path.join(base, "visual-out");
const urlsPath = path.join(base, "visual-urls.txt");

if(!fs.existsSync(urlsPath)){
  console.error("FAIL: visual-urls.txt missing. Put absolute/relative URLs to render (one per line).");
  process.exit(2);
}

const lines = fs.readFileSync(urlsPath, "utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
if(!lines.length){
  console.error("FAIL: visual-urls.txt is empty.");
  process.exit(3);
}

fs.mkdirSync(baselineDir, {recursive:true});
fs.mkdirSync(outDir, {recursive:true});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let changed = 0;
for(const u of lines){
  const url = u.startsWith("http") ? u : "http://127.0.0.1:53275" + (u.startsWith("/") ? u : ("/" + u));
  const safe = u.replace(/[^\w\-\.]+/g,"_").slice(0,180);
  const basePng = path.join(baselineDir, safe + ".png");
  const outPng  = path.join(outDir, safe + ".png");

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPng, fullPage: true });

  if(!fs.existsSync(basePng)){
    fs.copyFileSync(outPng, basePng);
    console.log("BASELINE:", u);
    continue;
  }

  const a = fs.readFileSync(basePng);
  const b = fs.readFileSync(outPng);
  if(a.length !== b.length || !a.equals(b)){
    changed++;
    console.log("CHANGED:", u);
  } else {
    console.log("OK:", u);
  }
}

await browser.close();
if(changed){
  console.error("FAIL: visual regression detected:", changed, "changed pages");
  process.exit(4);
}
console.log("OK: visual regression clean");
