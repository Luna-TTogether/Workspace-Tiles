import { getChromeApi } from "../core/utils.js";

const PAGE_DIGEST_EXCERPT_LIMIT = 2_000;
const PAGE_DIGEST_HEADING_LIMIT = 8;

function createPageDigestError(message = "Page digest unavailable") {
  const error = new Error(message);
  error.code = "PAGE_DIGEST_UNAVAILABLE";
  return error;
}

function normalizeDigestText(value, maxLength) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function normalizeDigestUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      protocol: url.protocol,
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: url.pathname || "/",
    };
  } catch {
    return null;
  }
}

function normalizePageDigest(value) {
  const url = normalizeDigestUrl(value?.href || value?.url);
  if (!url) return null;
  return {
    language: normalizeDigestText(value?.language, 35),
    title: normalizeDigestText(value?.title, 300),
    ogTitle: normalizeDigestText(value?.ogTitle, 300),
    heading: normalizeDigestText(value?.heading, 300),
    description: normalizeDigestText(value?.description, 500),
    headings: (Array.isArray(value?.headings) ? value.headings : [])
      .map((heading) => normalizeDigestText(heading, 300))
      .filter(Boolean)
      .slice(0, PAGE_DIGEST_HEADING_LIMIT),
    excerpt: normalizeDigestText(value?.excerpt, PAGE_DIGEST_EXCERPT_LIMIT),
    url,
  };
}

function collectPageDigestFromDocument() {
  const normalize = (value, maxLength) => String(value || "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
  const contentRoot = document.querySelector("main, article, [role='main']") || document.body;
  const blockedSelector = [
    "script", "style", "noscript", "template", "form", "input", "textarea", "select", "option", "button",
    "nav", "header", "footer", "aside", "[contenteditable='true']", "[aria-hidden='true']", "[hidden]",
  ].join(",");
  const textParts = [];
  if (contentRoot && globalThis.NodeFilter) {
    const walker = document.createTreeWalker(contentRoot, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && textParts.join(" ").length < 2_400) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest(blockedSelector)) continue;
      const style = globalThis.getComputedStyle?.(parent);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) continue;
      const text = normalize(node.nodeValue, 500);
      if (text) textParts.push(text);
    }
  }
  const headings = Array.from(document.querySelectorAll("main h1, main h2, main h3, article h1, article h2, article h3, [role='main'] h1, [role='main'] h2, [role='main'] h3, body > h1, body > h2"))
    .filter((element) => !element.closest(blockedSelector))
    .map((element) => normalize(element.textContent, 300))
    .filter(Boolean)
    .slice(0, 8);
  const meta = (selector) => normalize(document.querySelector(selector)?.getAttribute("content"), 500);
  return {
    href: globalThis.location?.href || "",
    language: normalize(document.documentElement?.lang, 35),
    title: normalize(document.title, 300),
    ogTitle: meta("meta[property='og:title']"),
    heading: normalize(document.querySelector("main h1, article h1, [role='main'] h1, h1")?.textContent, 300),
    description: meta("meta[name='description']") || meta("meta[property='og:description']"),
    headings,
    excerpt: normalize(textParts.join(" "), 2_000),
  };
}

async function extractPageDigest(tabId) {
  const chromeApi = getChromeApi();
  if (!Number.isInteger(tabId) || !chromeApi?.scripting?.executeScript) throw createPageDigestError();
  try {
    const results = await chromeApi.scripting.executeScript({
      target: { tabId },
      func: collectPageDigestFromDocument,
    });
    const digest = normalizePageDigest(results?.[0]?.result);
    if (!digest) throw createPageDigestError();
    return digest;
  } catch (error) {
    if (error?.code === "PAGE_DIGEST_UNAVAILABLE") throw error;
    throw createPageDigestError(error?.message);
  }
}

function createPageDigestFallback(tab) {
  return normalizePageDigest({
    href: tab?.pendingUrl || tab?.url,
    language: "",
    title: tab?.title,
    headings: [],
    excerpt: "",
  });
}

export {
  PAGE_DIGEST_EXCERPT_LIMIT,
  PAGE_DIGEST_HEADING_LIMIT,
  collectPageDigestFromDocument,
  createPageDigestFallback,
  extractPageDigest,
  normalizeDigestText,
  normalizeDigestUrl,
  normalizePageDigest,
};
