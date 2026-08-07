import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearAiAuthSession, isSessionFresh, normalizeAuthSession } from "../src/features/ai-auth.js";
import { callWorkspaceAi, clearAiResponseCache, stableStringify } from "../src/features/ai-client.js";
import { getAiConsent, normalizeAiConsent, setAiConsent } from "../src/features/ai-consent.js";
import { validateAiResponseEnvelope, validateAiTaskInput } from "../src/features/ai-schema.js";

const now = Date.parse("2026-08-07T08:00:00.000Z");
assert.deepEqual(normalizeAiConsent({ state: "accepted", consentVersion: 0, acceptedAt: new Date(now).toISOString() }), {
  state: "unknown",
  consentVersion: 0,
  acceptedAt: null,
});
await setAiConsent("accepted", { now });
assert.equal((await getAiConsent()).state, "accepted");

const session = normalizeAuthSession({
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: Math.floor(now / 1000) + 3_600,
  user: { id: "user-1", email: "must-not-persist@example.com" },
}, { now });
assert.equal(session.user.id, "user-1");
assert.equal("email" in session.user, false);
assert.equal(isSessionFresh(session, { now }), true);

const input = {
  page: {
    language: "en",
    title: "Prompt API",
    heading: "Prompt API",
    description: "Browser AI",
    headings: ["Overview"],
    excerpt: "Read about browser AI.",
    url: { protocol: "https:", hostname: "developer.chrome.com", pathname: "/docs/ai/prompt-api" },
  },
  workspaces: [{
    id: "workspace-1",
    name: "Browser research",
    sites: [{ name: "Chrome extensions", hostname: "developer.chrome.com" }],
  }],
};
assert.equal(validateAiTaskInput("recommend_existing_workspace", input), true);
assert.equal(validateAiTaskInput("recommend_existing_workspace", { ...input, workspaces: [] }), false);
assert.equal(stableStringify({ b: 1, a: 2 }), '{"a":2,"b":1}');

await clearAiAuthSession();
clearAiResponseCache();
let authCalls = 0;
let edgeCalls = 0;
const fetchImpl = async (url) => {
  if (String(url).includes("/auth/v1/signup")) {
    authCalls += 1;
    return new Response(JSON.stringify({
      access_token: "anonymous-access",
      refresh_token: "anonymous-refresh",
      expires_in: 3_600,
      user: { id: "anonymous-user" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (String(url).includes("/functions/v1/workspace-ai")) {
    edgeCalls += 1;
    return new Response(JSON.stringify({
      requestId: "request-1",
      data: {
        siteName: "Chrome Prompt API",
        siteLanguage: "en",
        workspaceId: "workspace-1",
        confidence: "high",
        reason: "The page matches browser research",
      },
      usage: { remaining: 19, limit: 20, resetAt: "2026-08-08T00:00:00.000Z" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`Unexpected URL: ${url}`);
};

const result = await callWorkspaceAi("recommend_existing_workspace", input, { fetchImpl, now });
assert.equal(result.data.workspaceId, "workspace-1");
assert.equal(authCalls, 1);
assert.equal(edgeCalls, 1);
const cached = await callWorkspaceAi("recommend_existing_workspace", input, { fetchImpl, now: now + 1_000 });
assert.equal(cached.requestId, "request-1");
assert.equal(edgeCalls, 1);
assert.equal(validateAiResponseEnvelope(result, "recommend_existing_workspace", input), true);

clearAiResponseCache();
const callerController = new AbortController();
const abortingFetch = async (url, options = {}) => {
  if (String(url).includes("/auth/v1/signup")) return fetchImpl(url, options);
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
};
callerController.abort();
await assert.rejects(
  callWorkspaceAi("recommend_existing_workspace", input, {
    fetchImpl: abortingFetch,
    signal: callerController.signal,
    now: now + 1_500,
  }),
  (error) => error.code === "AI_PROVIDER_TIMEOUT",
  "调用方取消信号应中止 AI 请求",
);

await setAiConsent("declined", { now: now + 2_000 });
await assert.rejects(
  callWorkspaceAi("recommend_existing_workspace", input, { fetchImpl }),
  (error) => error.code === "AI_CONSENT_REQUIRED",
);
await setAiConsent("accepted", { now: now + 3_000 });
await callWorkspaceAi("recommend_existing_workspace", input, { fetchImpl, now: now + 3_000 });
assert.equal(edgeCalls, 2, "撤回同意必须清除内存中的 AI 响应缓存");

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../background.js", import.meta.url), "utf8");
assert.match(appSource, /maybeShowAiConsentPrompt\(\)/u, "首次 AI 开启提示应由新标签页触发");
assert.match(appSource, /\["general", t\("通用"\)\]/u, "设置菜单应合并为通用标签");
assert.match(appSource, /role", "switch"/u, "AI 设置应使用开关语义");
assert.match(appSource, /openAiConsentDialog/u, "新标签页与设置应复用同一个 AI 开启弹窗");
assert.match(appSource, /setAiConsent\("declined"\)/u, "设置中应允许关闭 AI");
assert.match(backgroundSource, /details\.reason !== "install"/u, "只有新安装用户才应默认开启 Smart Workspace");
assert.match(backgroundSource, /setAiConsent\("accepted"\)/u, "新安装用户应默认开启 Smart Workspace");

console.log("AI 基础测试通过：Consent、匿名 Session、请求校验、响应校验和缓存均符合预期。");
