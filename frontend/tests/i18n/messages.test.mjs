// Translation catalogue checks. Run: npm run test:i18n (node:test, no dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../../locales/", import.meta.url).pathname;
const REFERENCE = "en";
const locales = readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const filesOf = (locale) => readdirSync(join(ROOT, locale)).filter((f) => f.endsWith(".json")).sort();
const load = (locale, file) => JSON.parse(readFileSync(join(ROOT, locale, file), "utf8"));

/** Flattens nested messages into `a.b.c` → string. */
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Top-level ICU argument names, e.g. "{count, plural, ...} of {total}" → ["count", "total"]. */
function argumentsOf(message) {
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const c = message[i];
    if (c === "{") {
      if (depth === 0) {
        const m = /^\{\s*([A-Za-z_][\w]*)/.exec(message.slice(i));
        if (m) names.add(m[1]);
      }
      depth += 1;
    } else if (c === "}") depth -= 1;
  }
  return [...names].sort();
}

test("English is present and every locale has more than the reference", () => {
  assert.ok(locales.includes(REFERENCE));
  assert.ok(locales.length >= 2, "at least English and Spanish");
});

test("every locale ships the same message files", () => {
  for (const locale of locales) assert.deepEqual(filesOf(locale), filesOf(REFERENCE), locale);
});

test("message files do not share top-level namespaces", () => {
  const owner = new Map();
  for (const file of filesOf(REFERENCE)) {
    for (const ns of Object.keys(load(REFERENCE, file))) {
      assert.ok(!owner.has(ns), `namespace "${ns}" defined in ${owner.get(ns)} and ${file}`);
      owner.set(ns, file);
    }
  }
});

for (const locale of locales.filter((l) => l !== REFERENCE)) {
  test(`${locale}: same keys, values and placeholders as ${REFERENCE}`, () => {
    for (const file of filesOf(REFERENCE)) {
      const ref = flatten(load(REFERENCE, file));
      const other = flatten(load(locale, file));
      const missing = Object.keys(ref).filter((k) => !(k in other));
      const extra = Object.keys(other).filter((k) => !(k in ref));
      assert.deepEqual(missing, [], `${locale}/${file} missing keys`);
      assert.deepEqual(extra, [], `${locale}/${file} extra keys`);
      for (const key of Object.keys(ref)) {
        assert.equal(typeof other[key], typeof ref[key], `${locale}/${file} ${key} type`);
        if (typeof ref[key] !== "string") continue;
        assert.ok(other[key].trim() !== "", `${locale}/${file} ${key} is empty`);
        assert.deepEqual(argumentsOf(other[key]), argumentsOf(ref[key]), `${locale}/${file} ${key} placeholders`);
      }
    }
  });
}

test("no empty English messages", () => {
  for (const file of filesOf(REFERENCE)) {
    for (const [key, value] of Object.entries(flatten(load(REFERENCE, file)))) {
      if (typeof value === "string") assert.ok(value.trim() !== "", `${file} ${key} is empty`);
    }
  }
});
