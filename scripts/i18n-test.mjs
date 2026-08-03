import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSources = [
  "app.js",
  "popup.js",
  "src/core/state.js",
  "src/core/utils.js",
  "src/features/backup.js",
  "src/features/forms.js",
  "src/features/quick-add.js",
  "src/features/reorder.js",
  "src/features/workspace-note-card.js",
  "src/ui/ui-components.js",
].map((filename) => readFileSync(path.join(projectRoot, filename), "utf8"));
const htmlSource = readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
const popupHtmlSource = readFileSync(path.join(projectRoot, "popup.html"), "utf8");
const manifestSource = readFileSync(path.join(projectRoot, "manifest.json"), "utf8");
const englishLocale = JSON.parse(readFileSync(path.join(projectRoot, "_locales/en/messages.json"), "utf8"));
const chineseLocale = JSON.parse(readFileSync(path.join(projectRoot, "_locales/zh_CN/messages.json"), "utf8"));
const saved = new Map();

globalThis.document = {
  documentElement: { lang: "zh-CN" },
  querySelectorAll() { return []; },
};
globalThis.localStorage = {
  getItem(key) { return saved.get(key) ?? null; },
  setItem(key, value) { saved.set(key, value); },
};

const i18n = await import("../src/core/i18n.js");
await i18n.init();
assert.equal(i18n.getLanguage(), "en");
assert.equal(i18n.t("siteCount", { count: 2 }), "2 sites");

await i18n.setLanguage("zh-CN");
assert.equal(i18n.getLanguage(), "zh-CN");
assert.equal(i18n.t("新建工作区"), "新建工作区");
assert.equal(i18n.t("siteCount", { count: 2 }), "2 个网站");

await i18n.setLanguage("en");
assert.equal(i18n.getLanguage(), "en");
assert.equal(globalThis.document.documentElement.lang, "en");
assert.equal(i18n.t("新建工作区"), "New workspace");
assert.equal(i18n.t("siteCount", { count: 1 }), "1 site");
assert.equal(i18n.t("siteCount", { count: 2 }), "2 sites");
assert.equal(saved.get("workspaceTilesLanguage"), "en");

const runtimeKeys = runtimeSources.flatMap((source) =>
  Array.from(source.matchAll(/\bt\("([^"]+)"/g), (match) => match[1]));
const staticKeys = [htmlSource, popupHtmlSource].flatMap((source) =>
  Array.from(source.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g), (match) => match[1]));
const missingEnglish = [...new Set([...runtimeKeys, ...staticKeys])]
  .filter((key) => i18n.t(key) === key);
assert.deepEqual(missingEnglish, [], `Missing English messages: ${missingEnglish.join(", ")}`);

const manifestMessageKeys = Array.from(manifestSource.matchAll(/__MSG_([\w]+)__/g), (match) => match[1]);
const missingManifestMessages = [...new Set(manifestMessageKeys)].filter(
  (key) => !englishLocale[key]?.message || !chineseLocale[key]?.message,
);
assert.deepEqual(
  missingManifestMessages,
  [],
  `Missing localized Manifest messages: ${missingManifestMessages.join(", ")}`,
);

console.log("多语言测试通过：默认英文、中英文切换、单复数和本地持久化均符合预期。");
