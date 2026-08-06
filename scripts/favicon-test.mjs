import assert from "node:assert/strict";
import {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  canApplyFaviconResult,
  getFaviconCacheKey,
  isFaviconCacheEntryFresh,
  loadFaviconBlob,
} from "../src/core/favicon.js";
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
  getFaviconUrl("https://example.com/path"),
  "chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpath&size=128&allowGoogleServerFallback=0&forceEmptyDefaultFavicon=1",
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

console.log("favicon 测试通过：128px 本地地址、缓存版本与有效期、并发去重、离线弹窗节点、Unicode 首字符和降级均符合预期。");
