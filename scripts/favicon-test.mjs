import assert from "node:assert/strict";
import {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  canApplyFaviconResult,
  getFaviconCacheKey,
  isFaviconCacheEntryFresh,
  loadFaviconBlob,
} from "../src/core/favicon.js";
import {
  buildFaviconCandidatePlan,
  getGoogleFaviconUrl,
  getRootFaviconCandidates,
  normalizeExplicitFaviconUrl,
} from "../src/core/favicon-candidates.js";
import { canUseGoogleFaviconFallback, getFaviconRequestPolicy, isIpHostname } from "../src/core/favicon-policy.js";
import {
  MIN_RASTER_FAVICON_SIZE,
  isFaviconCandidateAcceptable,
  isVectorFaviconUrl,
} from "../src/core/favicon-quality.js";
import { FAVICON_REQUEST_SIZE, getFaviconUrl, getInitial } from "../src/core/utils.js";

assert.equal(getFaviconCacheKey("https://example.com/a?x=1#part"), "https://example.com");
assert.equal(getFaviconCacheKey("http://example.com:8080/a"), "http://example.com:8080");
assert.equal(getFaviconCacheKey("not a url"), "not a url");

const renderToken = Symbol("favicon-render");
const detachedContainer = { faviconRenderToken: renderToken, isConnected: false };
assert.equal(canApplyFaviconResult(detachedContainer, renderToken), true, "未挂载的弹窗节点仍可接收有效图标结果");
assert.equal(canApplyFaviconResult(detachedContainer, Symbol("stale-render")), false, "过期图标结果不会覆盖新渲染");

assert.equal(getInitial("  OpenAI"), "O");
assert.equal(getInitial("中文网站"), "中");
assert.equal(getInitial("👨‍👩‍👧 Family"), "👨‍👩‍👧");
assert.equal(getInitial("   "), "?");
assert.equal(getFaviconUrl("https://example.com"), "");

assert.equal(isIpHostname("192.168.1.10"), true);
assert.equal(isIpHostname("[::1]"), true);
assert.equal(isIpHostname("example.com"), false);
assert.equal(canUseGoogleFaviconFallback("example.com"), true);
assert.equal(canUseGoogleFaviconFallback("www.example.com"), true);
assert.equal(canUseGoogleFaviconFallback("localhost"), false);
assert.equal(canUseGoogleFaviconFallback("printer"), false);
assert.equal(canUseGoogleFaviconFallback("nas.internal"), false);
assert.equal(canUseGoogleFaviconFallback("service.local"), false);
assert.equal(canUseGoogleFaviconFallback("private.example.onion"), false);
assert.deepEqual(
  getFaviconRequestPolicy("https://user:secret@example.com/private/path?token=hidden#section"),
  { pageUrl: "https://example.com/", allowGoogleServerFallback: true },
  "favicon 请求只能保留网站 origin",
);
assert.deepEqual(
  getFaviconRequestPolicy("http://192.168.1.10/admin?token=hidden"),
  { pageUrl: "http://192.168.1.10/", allowGoogleServerFallback: false },
  "IP 地址必须禁用 Google 回退",
);
assert.equal(getFaviconRequestPolicy("chrome://extensions"), null);
assert.equal(
  normalizeExplicitFaviconUrl("https://user:secret@cdn.example.com/icon.svg#mark"),
  "https://cdn.example.com/icon.svg",
);
assert.equal(normalizeExplicitFaviconUrl("data:image/png;base64,abc"), "");
assert.equal(
  getGoogleFaviconUrl("https://example.com/private/path?token=hidden"),
  "https://t2.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=https%3A%2F%2Fexample.com%2F&size=128",
);
assert.equal(getGoogleFaviconUrl("http://localhost:8080/private"), "");
assert.deepEqual(
  getRootFaviconCandidates("https://example.com/path").map(({ kind }) => kind),
  ["site-svg", "site-touch-icon", "site-png", "site-ico"],
);
assert.deepEqual(
  buildFaviconCandidatePlan({
    url: "https://example.com/path",
    faviconUrl: "https://cdn.example.com/page-icon.svg",
  }, "chrome-extension://test/_favicon/").map(({ kind }) => kind),
  ["explicit", "google", "site-svg", "site-touch-icon", "site-png", "site-ico", "chrome"],
  "候选顺序应优先使用页面图标和 Google 128px，并保留网站根图标与 Chrome 降级",
);
assert.equal(MIN_RASTER_FAVICON_SIZE, 48);
assert.equal(isVectorFaviconUrl("https://example.com/favicon.svg?v=2"), true);
assert.equal(isFaviconCandidateAcceptable({ kind: "explicit", url: "https://example.com/icon.png" }, 16, 16), false);
assert.equal(isFaviconCandidateAcceptable({ kind: "explicit", url: "https://example.com/icon.png" }, 64, 64), true);
assert.equal(isFaviconCandidateAcceptable({ kind: "site-svg", url: "https://example.com/icon.svg" }, 16, 16), true);
assert.equal(isFaviconCandidateAcceptable({ kind: "chrome", url: "chrome-extension://test/_favicon/" }, 16, 16), true);

const cacheNow = Date.UTC(2026, 7, 6);
const cachedBlob = new Blob(["favicon"], { type: "image/png" });
const freshCacheEntry = {
  blob: cachedBlob,
  cacheFormatVersion: FAVICON_CACHE_FORMAT_VERSION,
  requestedSize: FAVICON_REQUEST_SIZE,
  cachedAt: cacheNow - FAVICON_CACHE_TTL_MS,
};
assert.equal(isFaviconCacheEntryFresh(freshCacheEntry, cacheNow), true, "有效期边界内的高清缓存应继续使用");
assert.equal(
  isFaviconCacheEntryFresh({ ...freshCacheEntry, cachedAt: freshCacheEntry.cachedAt - 1 }, cacheNow),
  false,
  "超过有效期的缓存应重新获取",
);
assert.equal(
  isFaviconCacheEntryFresh({ ...freshCacheEntry, requestedSize: 64 }, cacheNow),
  false,
  "旧的低分辨率缓存应自动失效",
);
assert.equal(
  isFaviconCacheEntryFresh({ ...freshCacheEntry, cacheFormatVersion: FAVICON_CACHE_FORMAT_VERSION - 1 }, cacheNow),
  false,
  "旧格式缓存应自动失效",
);

globalThis.chrome = {
  runtime: {
    getURL: (path) => `chrome-extension://test-extension${path}`,
  },
};
assert.equal(
  getFaviconUrl("https://example.com/private/path?token=hidden"),
  "chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2F&size=128&allowGoogleServerFallback=0&forceEmptyDefaultFavicon=1",
);
assert.equal(
  getFaviconUrl("http://localhost:8080/private/path?token=hidden"),
  "chrome-extension://test-extension/_favicon/?pageUrl=http%3A%2F%2Flocalhost%3A8080%2F&size=128&allowGoogleServerFallback=0&forceEmptyDefaultFavicon=1",
);

let fetchCount = 0;
globalThis.fetch = async () => {
  fetchCount += 1;
  return new Response(new Blob(["favicon"], { type: "image/png" }), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
};
const [firstBlob, secondBlob] = await Promise.all([
  loadFaviconBlob("https://example.com/first"),
  loadFaviconBlob("https://example.com/second"),
]);
assert.equal(fetchCount, 1);
assert.equal(firstBlob.type, "image/png");
assert.equal(secondBlob.size, firstBlob.size);

delete globalThis.fetch;
delete globalThis.chrome;

console.log("favicon 测试通过：明确图标、Google 128px、网站根图标、Chrome 降级、隐私过滤、缓存升级和并发去重均符合预期。");
