import assert from "node:assert/strict";
import { getAutomaticSiteName, getSiteFallbackName } from "../src/core/utils.js";

assert.equal(getSiteFallbackName("https://www.notion.so/product"), "Notion");
assert.equal(getSiteFallbackName("https://github.com/openai/codex"), "GitHub");
assert.equal(getSiteFallbackName("https://my-company.co.uk/about"), "My Company");
assert.equal(getSiteFallbackName("https://project.github.io/docs"), "Project");
assert.equal(getSiteFallbackName("http://localhost:8080/private"), "localhost");

assert.equal(
  getAutomaticSiteName("Notion – Your connected workspace", "https://www.notion.so/product"),
  "Notion",
);
assert.equal(
  getAutomaticSiteName("Pricing | Notion", "https://www.notion.so/pricing"),
  "Notion",
);
assert.equal(
  getAutomaticSiteName("GitHub: Let’s build from here", "https://github.com"),
  "GitHub",
);
assert.equal(
  getAutomaticSiteName("OpenAI API Platform", "https://platform.openai.com/docs"),
  "OpenAI",
);
assert.equal(
  getAutomaticSiteName("Google Docs", "https://docs.google.com/document/1"),
  "Google Docs",
);
assert.equal(
  getAutomaticSiteName("(3) Example page", "https://example.com/path"),
  "Example page",
);
assert.equal(
  getAutomaticSiteName("淘宝网 - 淘！我喜欢", "https://www.taobao.com"),
  "淘宝网",
);
assert.equal(
  getAutomaticSiteName("Dashboard", "https://example.com/dashboard"),
  "Example",
);

console.log("网站自动命名测试通过：标题清理、短品牌识别、域名回退和本地化名称均符合预期。");
