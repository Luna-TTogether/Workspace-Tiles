import assert from "node:assert/strict";
import { getFaviconCacheKey, loadFaviconBlob } from "../favicon.js";
import { getFaviconUrl, getInitial } from "../utils.js";

assert.equal(getFaviconCacheKey("https://example.com/a?x=1#part"), "https://example.com");
assert.equal(getFaviconCacheKey("http://example.com:8080/a"), "http://example.com:8080");
assert.equal(getFaviconCacheKey("not a url"), "not a url");

assert.equal(getInitial("  OpenAI"), "O");
assert.equal(getInitial("中文网站"), "中");
assert.equal(getInitial("👨‍👩‍👧 Family"), "👨‍👩‍👧");
assert.equal(getInitial("   "), "?");
assert.equal(getFaviconUrl("https://example.com"), "");

globalThis.chrome = {
  runtime: {
    getURL: (path) => `chrome-extension://test-extension${path}`,
  },
};
assert.equal(
  getFaviconUrl("https://example.com/path"),
  "chrome-extension://test-extension/_favicon/?pageUrl=https%3A%2F%2Fexample.com%2Fpath&size=64&allowGoogleServerFallback=0&forceEmptyDefaultFavicon=1",
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

console.log("favicon 测试通过：本地地址、缓存键、并发去重、Unicode 首字符和降级均符合预期。");
