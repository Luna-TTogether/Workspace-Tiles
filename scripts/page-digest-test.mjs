import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createPageDigestFallback,
  normalizeDigestText,
  normalizeDigestUrl,
  normalizePageDigest,
} from "../src/features/page-digest.js";

assert.equal(normalizeDigestText("  Hello\n world  ", 20), "Hello world");
assert.deepEqual(normalizeDigestUrl("https://example.com/a?q=secret#part"), {
  protocol: "https:",
  hostname: "example.com",
  pathname: "/a",
});
assert.equal(normalizeDigestUrl("chrome://settings"), null);

const digest = normalizePageDigest({
  href: "https://example.com/article?token=secret",
  language: "en",
  title: "Title",
  headings: Array.from({ length: 12 }, (_, index) => `Heading ${index}`),
  excerpt: "a".repeat(2_500),
});
assert.equal(digest.headings.length, 8);
assert.equal(digest.excerpt.length, 2_000);
assert.equal("search" in digest.url, false);

const fallback = createPageDigestFallback({ title: "Fallback", url: "https://example.com/?private=1" });
assert.equal(fallback.title, "Fallback");
assert.equal(fallback.url.pathname, "/");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/features/page-digest.js"), "utf8");
assert.match(source, /form.*input.*textarea.*contenteditable/s);
assert.match(source, /style\.display === "none".*style\.visibility === "hidden"/s);

console.log("Page Digest 测试通过：文本截断、敏感 URL 清洗、降级和 DOM 排除规则均符合预期。");
