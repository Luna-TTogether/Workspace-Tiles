import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(projectRoot, "i18n.js"), "utf8");
const appSource = readFileSync(path.join(projectRoot, "app.js"), "utf8");
const htmlSource = readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
const saved = new Map();

const context = vm.createContext({
  console,
  document: {
    documentElement: { lang: "zh-CN" },
    querySelectorAll() { return []; },
  },
  localStorage: {
    getItem(key) { return saved.get(key) ?? null; },
    setItem(key, value) { saved.set(key, value); },
  },
});
context.window = context;
vm.runInContext(source, context, { filename: "i18n.js" });

const i18n = context.WorkspaceTilesI18n;
await i18n.init();
assert.equal(i18n.getLanguage(), "zh-CN");
assert.equal(i18n.t("siteCount", { count: 2 }), "2 个网站");

await i18n.setLanguage("en");
assert.equal(i18n.getLanguage(), "en");
assert.equal(context.document.documentElement.lang, "en");
assert.equal(i18n.t("新建工作区"), "New workspace");
assert.equal(i18n.t("siteCount", { count: 1 }), "1 site");
assert.equal(i18n.t("siteCount", { count: 2 }), "2 sites");
assert.equal(saved.get("workspaceTilesLanguage"), "en");

const runtimeKeys = Array.from(appSource.matchAll(/\bt\("([^"]+)"/g), (match) => match[1]);
const staticKeys = Array.from(htmlSource.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g), (match) => match[1]);
const missingEnglish = [...new Set([...runtimeKeys, ...staticKeys])]
  .filter((key) => i18n.t(key) === key);
assert.deepEqual(missingEnglish, [], `Missing English messages: ${missingEnglish.join(", ")}`);

console.log("多语言测试通过：默认中文、英文切换、单复数和本地持久化均符合预期。");
