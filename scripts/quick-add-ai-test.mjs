import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyQuickAddAiResult,
  buildQuickAddRecommendationInput,
  isSuggestedSiteNameValid,
  selectWorkspaceCandidates,
} from "../src/features/quick-add-ai.js";

const workspaces = Array.from({ length: 24 }, (_, index) => ({
  id: `workspace-${index}`,
  name: `Workspace ${index}`,
  note: "must never be sent",
  sites: [{ name: `Site ${index}`, url: `https://site-${index}.example.com/path?secret=1` }],
}));
workspaces.push({
  id: "workspace-browser-ai",
  name: "Browser AI research",
  note: "private note",
  sites: [{ name: "Chrome extensions", url: "https://developer.chrome.com/docs/extensions" }],
});

const page = {
  language: "en",
  title: "Chrome Prompt API",
  heading: "Prompt API",
  description: "Browser AI documentation",
  headings: ["Overview"],
  excerpt: "Build browser AI features.",
  url: { protocol: "https:", hostname: "developer.chrome.com", pathname: "/docs/ai/prompt-api" },
};

const candidates = selectWorkspaceCandidates(workspaces, ["workspace-3"], page);
assert.equal(candidates.length, 20);
assert.equal(candidates[0].id, "workspace-browser-ai", "同域名语义候选应优先于单纯最近使用");
assert.ok(candidates.some((workspace) => workspace.id === "workspace-3"));

const input = buildQuickAddRecommendationInput(page, workspaces, ["workspace-3"]);
assert.equal(input.workspaces.length, 20);
assert.equal(input.workspaces[0].id, "workspace-browser-ai");
assert.equal("note" in input.workspaces[0], false);
assert.deepEqual(input.workspaces[0].sites[0], {
  name: "Chrome extensions",
  hostname: "developer.chrome.com",
});

assert.equal(isSuggestedSiteNameValid("Chrome Prompt API", "en-US", "en"), true);
assert.equal(isSuggestedSiteNameValid("浏览器 AI", "zh-CN", "en"), false);
assert.equal(isSuggestedSiteNameValid("", "en", "en"), false);
assert.equal(isSuggestedSiteNameValid("x".repeat(81), "en", "en"), false);

const baseState = {
  name: "Prompt API",
  nameLocked: false,
  nameSource: "page",
  workspaceId: "workspace-3",
  workspaceLocked: false,
  workspaceSource: "recent",
  candidateWorkspaceIds: input.workspaces.map((workspace) => workspace.id),
  reason: "",
};
const highResult = applyQuickAddAiResult(baseState, {
  siteName: "Chrome Prompt API guide",
  siteLanguage: "en",
  workspaceId: "workspace-browser-ai",
  confidence: "high",
  reason: "Matches browser AI research",
}, page.language);
assert.equal(highResult.name, "Chrome Prompt API guide");
assert.equal(highResult.workspaceId, "workspace-browser-ai");
assert.equal(highResult.workspaceSource, "ai_recommended");

const lowResult = applyQuickAddAiResult(baseState, {
  siteName: "Chrome guide",
  siteLanguage: "en",
  workspaceId: "workspace-browser-ai",
  confidence: "low",
  reason: "Weak match",
}, page.language);
assert.equal(lowResult.name, "Chrome guide", "有效网站名称可独立采用");
assert.equal(lowResult.workspaceId, "workspace-3", "低置信度不得替换本地默认 Workspace");

const lockedResult = applyQuickAddAiResult({
  ...baseState,
  name: "My title",
  nameLocked: true,
  workspaceId: "workspace-5",
  workspaceLocked: true,
}, {
  siteName: "Late AI title",
  siteLanguage: "en",
  workspaceId: "workspace-browser-ai",
  confidence: "high",
  reason: "Late result",
}, page.language);
assert.equal(lockedResult.name, "My title");
assert.equal(lockedResult.workspaceId, "workspace-5");

const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const popupJs = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const popupCss = readFileSync(new URL("../styles/popup.css", import.meta.url), "utf8");
const workspaceIndex = popupHtml.indexOf('id="workspaceSelect"');
const createIndex = popupHtml.indexOf('id="createFromWindowButton"');
assert.ok(workspaceIndex > 0 && workspaceIndex < createIndex, "Workspace 选择应先于低优先级的新建入口");
assert.equal(popupHtml.includes('id="consentView"'), false, "快捷加入 Popup 不承担 AI 开启授权");
assert.equal(popupHtml.includes('id="recommendedWorkspace"'), false, "快捷加入复用紧凑表单，不展示大型推荐卡片");
assert.equal(/type=["']search["']/u.test(popupHtml), false, "2.2B 不增加常驻搜索");
assert.match(popupHtml, /class="form quick-add-form"/u, "快捷加入应复用现有表单样式");
assert.match(popupHtml, /id="siteIcon"/u, "快捷加入表单应展示当前网页图标");
assert.match(popupJs, /renderFavicon\(siteIcon, session\.page\)/u, "网页图标应通过统一 favicon 渲染器生成");
assert.equal(popupJs.includes("quickAddCurrentPage("), false, "打开 Popup 不得调用旧的立即写入流程");
assert.equal(popupJs.includes("commitQuickAdd({"), true, "只有提交处理器调用确认保存流程");
assert.equal(popupJs.includes("setAiConsent"), false, "Popup 不得修改 AI 开启状态");
assert.equal(popupJs.includes("callWorkspaceAi"), false, "快捷加入 Popup 不得发起云端 AI 请求");
assert.doesNotMatch(popupCss, /max-height:\s*min\([^;]*100vh|grid-template-rows:[^;]*minmax\(0,\s*1fr\)/u,
  "原生 Chrome Popup 不得用视口循环尺寸压缩内容区");
assert.match(popupCss, /\.quick-add-dialog\s*\{[\s\S]*?max-height:\s*600px;/u,
  "Popup 应使用明确上限并由内容决定实际高度");

console.log("AI 快捷加入测试通过：候选裁剪、语言、置信度、用户锁定、紧凑表单和确认保存语义均符合预期。");
