// Guard routing: the journal check must see the same path next-intl routes to.
// Transpiles i18n/{config,paths}.ts with the project's TypeScript (no extra dependencies).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const I18N = fileURLToPath(new URL("../../i18n/", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "i18n-guard-"));
after(() => rmSync(out, { recursive: true, force: true }));
for (const name of ["config", "paths"]) {
  const source = readFileSync(join(I18N, `${name}.ts`), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  writeFileSync(join(out, `${name}.mjs`), outputText.replace(/from "\.\/config"/g, 'from "./config.mjs"'));
}
const { routeOf } = await import(join(out, "paths.mjs"));

const journal = [
  ["/journal", "en"],
  ["/journal/", "en"],
  ["/journal/123", "en"],
  ["/es/journal", "es"],
  ["/es/journal/123", "es"],
  ["/%6Aournal", "en"],
  ["/%6aournal/123", "en"],
  ["/journa%6C", "en"],
  ["/es/%6Aournal", "es"],
  ["/%65s/journal", "es"],
];

for (const [path, locale] of journal) {
  test(`${path} resolves to the journal in ${locale}`, () => {
    const route = routeOf(path);
    assert.equal(route.locale, locale);
    assert.match(route.pathname, /^\/journal(\/|$)/);
  });
}

test("other pages keep their path and locale", () => {
  assert.deepEqual(routeOf("/time-explorer"), { locale: "en", pathname: "/time-explorer" });
  assert.deepEqual(routeOf("/es"), { locale: "es", pathname: "/" });
  assert.deepEqual(routeOf("/es/candidates"), { locale: "es", pathname: "/candidates" });
  assert.deepEqual(routeOf("/espacio"), { locale: "en", pathname: "/espacio" });
});

test("malformed encoding does not throw", () => {
  assert.deepEqual(routeOf("/%E0%A4%A"), { locale: "en", pathname: "/%E0%A4%A" });
});
