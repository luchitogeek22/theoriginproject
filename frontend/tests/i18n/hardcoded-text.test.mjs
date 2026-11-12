// Heuristic guard against user-visible text written directly in components.
// Run: npm run test:i18n. Pass file paths as `I18N_SCAN=path1,path2` to scan only some files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const FRONTEND = new URL("../../", import.meta.url).pathname;
const DIRS = ["app", "components"];

/** Official names, units and symbols that stay identical in every language. */
const ALLOWED = [
  /^THE ORIGIN PROJECT$/,
  /^The Origin Project$/,
  /^(SPHEREx|NASA|IPAC|IRSA|NASA\/IPAC IRSA|Gaia|WISE|AllWISE|Aladin|SkyBoT|IMCCE|Supabase|ZODI|PSF|SNR|WCS|RA|Dec|µm|px|D[1-6])$/,
  /^[\s\d.,:;·/×±%°′″()+\-–—|=<>≥≤λσµ…#]*$/,
  /^[A-Z]$/,
];

const isAllowed = (text) => ALLOWED.some((re) => re.test(text.trim()));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const targets = process.env.I18N_SCAN
  ? process.env.I18N_SCAN.split(",").map((p) => join(FRONTEND, p.trim()))
  : DIRS.flatMap((d) => walk(join(FRONTEND, d)));

function findings(source) {
  const found = [];
  const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  // JSX text between tags: >Some text<
  for (const m of code.matchAll(/>([^<>{}`]*[A-Za-zÀ-ÿ]{2,}[^<>{}`]*)</g)) {
    const text = m[1].trim();
    if (text && !/[=;]|=>|&&|\|\|/.test(text) && !isAllowed(text)) found.push(text);
  }
  // Accessible / visible string attributes.
  for (const m of code.matchAll(/\b(aria-label|title|placeholder|alt|aria-description)="([^"]*[A-Za-zÀ-ÿ]{2,}[^"]*)"/g)) {
    if (!isAllowed(m[2])) found.push(`${m[1]}="${m[2]}"`);
  }
  return found;
}

test("components render translated text, not literals", () => {
  const problems = [];
  for (const file of targets) {
    for (const text of findings(readFileSync(file, "utf8"))) problems.push(`${relative(FRONTEND, file)}: ${text}`);
  }
  assert.deepEqual(problems, []);
});
