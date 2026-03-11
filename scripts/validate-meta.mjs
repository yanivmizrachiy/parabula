import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";

const repo = process.cwd();
const schemaPath = path.join(repo, "schemas", "page-meta.schema.json");
const metaPath   = path.join(repo, "meta", "pages.json");

if(!fs.existsSync(metaPath)){
  console.error("FAIL: meta/pages.json missing. Create it from /api/toc export or build script.");
  process.exit(2);
}
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const meta   = JSON.parse(fs.readFileSync(metaPath, "utf8"));

const ajv = new Ajv2020({ allErrors:true, allowUnionTypes:true });
const validate = ajv.compile(schema);

let ok = true;
for(const [i,item] of meta.entries()){
  if(!validate(item)){
    ok = false;
    console.error("META INVALID at index", i, item?.href);
    console.error(validate.errors);
  }
}
if(!ok) process.exit(3);
console.log("OK: meta/pages.json validated:", meta.length, "items");
