import assert from "node:assert/strict";
import { test } from "node:test";

import { en, type Dictionary } from "./en";
import {
  alternateLocale,
  defaultLocale,
  fill,
  getDictionary,
  htmlLang,
  isLocale,
  localeFromPathname,
  localePath,
  locales,
  skipsLocaleRouting,
  stripLocale,
} from "./index";
import { zh } from "./zh";

/** Flatten a dictionary into `dotted.path → string` pairs. */
function flatten(value: unknown, prefix = "", out = new Map<string, string>()) {
  if (typeof value === "string") {
    out.set(prefix, value);
    return out;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function placeholders(template: string): string[] {
  return [...new Set(template.match(/\{(\w+)\}/g) ?? [])].sort();
}

const english = flatten(en);
const chinese = flatten(zh);

test("Chinese defines exactly the keys English defines", () => {
  const missing = [...english.keys()].filter((key) => !chinese.has(key));
  const extra = [...chinese.keys()].filter((key) => !english.has(key));
  assert.deepEqual(missing, [], `missing Chinese keys: ${missing.join(", ")}`);
  assert.deepEqual(extra, [], `unexpected Chinese keys: ${extra.join(", ")}`);
});

test("no string is empty and none leaks a placeholder object", () => {
  for (const [name, dict] of [
    ["en", english],
    ["zh", chinese],
  ] as const) {
    for (const [key, value] of dict) {
      assert.ok(value.trim().length > 0, `${name}.${key} is empty`);
      assert.ok(
        !value.includes("[object Object]") && !value.includes("undefined"),
        `${name}.${key} renders a non-string`,
      );
    }
  }
});

test("Chinese keeps the same placeholders as English, so fill() cannot drop a value", () => {
  for (const [key, template] of english) {
    assert.deepEqual(
      placeholders(chinese.get(key) ?? ""),
      placeholders(template),
      `placeholders differ for ${key}`,
    );
  }
});

/**
 * Strings that are identical in both locales on purpose: the language names,
 * the product name, and formats made only of placeholders or a protocol token.
 */
const sharedByDesign = [
  "language.english",
  "language.chinese",
  "common.siteName",
  "meta.titleTemplate",
  "meta.titles.overview",
  "automation.leadHash",
  "automation.leadHttpStatus",
  "capability.versionNumber",
  "capability.historyMeta",
];

function isSharedByDesign(key: string): boolean {
  return sharedByDesign.some((prefix) => key === prefix || key.startsWith(prefix));
}

test("Chinese is not a copy of the English text", () => {
  const untranslated = [...english.entries()]
    .filter(([key, value]) => chinese.get(key) === value && !isSharedByDesign(key))
    .map(([key]) => key);
  assert.deepEqual(untranslated, [], `identical in both locales: ${untranslated.join(", ")}`);
});

test("every string marked shared-by-design really is shared", () => {
  for (const prefix of sharedByDesign) {
    const keys = [...english.keys()].filter((key) => key === prefix || key.startsWith(prefix));
    assert.ok(keys.length > 0, `${prefix} matches no key`);
    for (const key of keys) {
      assert.equal(chinese.get(key), english.get(key), `${key} should stay identical`);
    }
  }
});

test("the product name and the brand suffix are not translated", () => {
  assert.equal(zh.common.siteName, en.common.siteName);
  assert.equal(zh.meta.titleTemplate, en.meta.titleTemplate);
});

test("getDictionary returns the matching locale object", () => {
  assert.equal(getDictionary("en"), en);
  assert.equal(getDictionary("zh"), zh);
});

test("locales are the supported set and English is the default", () => {
  assert.deepEqual([...locales], ["en", "zh"]);
  assert.equal(defaultLocale, "en");
  assert.equal(alternateLocale("en"), "zh");
  assert.equal(alternateLocale("zh"), "en");
  assert.ok(isLocale("zh") && !isLocale("fr") && !isLocale(undefined));
  assert.equal(htmlLang.zh, "zh-Hans");
});

test("localePath prefixes a locale-free path and keeps the query and fragment", () => {
  assert.equal(localePath("en", "/"), "/en");
  assert.equal(localePath("zh", "/"), "/zh");
  assert.equal(localePath("zh", "/evidence"), "/zh/evidence");
  assert.equal(localePath("zh", "/evidence?tab=claims"), "/zh/evidence?tab=claims");
  assert.equal(localePath("en", "/evidence#top"), "/en/evidence#top");
  // An idempotent call is still a bug on the caller's side, but it must not
  // produce "/zh/zh/..." by silently joining.
  assert.equal(localePath("zh", "evidence"), "/zh/evidence");
});

test("stripLocale removes a leading locale and reports its absence", () => {
  assert.deepEqual(stripLocale("/zh/evidence"), { locale: "zh", path: "/evidence" });
  assert.deepEqual(stripLocale("/zh"), { locale: "zh", path: "/" });
  assert.deepEqual(stripLocale("/zh/"), { locale: "zh", path: "/" });
  assert.deepEqual(stripLocale("/en/progress/cap-5"), { locale: "en", path: "/progress/cap-5" });
  assert.equal(stripLocale("/evidence"), null);
  assert.equal(stripLocale("/"), null);
  // A section whose first segment merely looks like a locale is not one.
  assert.equal(stripLocale("/zhx/evidence"), null);
});

test("localeFromPathname defaults to English", () => {
  assert.equal(localeFromPathname("/zh/evidence"), "zh");
  assert.equal(localeFromPathname("/evidence"), "en");
});

test("assets, framework internals and API routes skip locale routing", () => {
  for (const path of ["/_next/static/chunk.js", "/api/tasks", "/favicon.ico", "/og.png"]) {
    assert.ok(skipsLocaleRouting(path), `${path} should skip`);
  }
  for (const path of ["/", "/evidence", "/progress/cap-5", "/zh", "/research"]) {
    assert.ok(!skipsLocaleRouting(path), `${path} should be routed`);
  }
});

test("fill drops unknown placeholders through, keeping them visible", () => {
  assert.equal(fill("{count} of {total} shown", { count: 3, total: 12 }), "3 of 12 shown");
  assert.equal(fill("HTTP {status}", { status: 403 }), "HTTP 403");
  assert.equal(fill("{a} and {b}", { a: "x" }), "x and {b}");
  assert.equal(fill("no placeholders", {}), "no placeholders");
});

test("a dictionary satisfies the exported type for every locale", () => {
  const dictionaries: Record<string, Dictionary> = { en, zh };
  assert.deepEqual(Object.keys(dictionaries).sort(), ["en", "zh"]);
});
