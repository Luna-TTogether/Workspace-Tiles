import { t } from "./i18n.js";
import { getFaviconRequestPolicy } from "./favicon-policy.js";

const FAVICON_REQUEST_SIZE = 128;
const AUTO_NAME_MAX_WEIGHT = 12;
const COMPOUND_PUBLIC_SUFFIXES = new Set([
  "co.jp", "co.kr", "co.nz", "co.uk",
  "com.au", "com.br", "com.cn", "com.hk", "com.mx", "com.sg", "com.tw",
]);
const PRIVATE_PUBLIC_SUFFIXES = new Set([
  "blogspot.com", "github.io", "netlify.app", "pages.dev", "vercel.app",
]);
const BRAND_STYLINGS = new Map([
  ["aliexpress", "AliExpress"],
  ["github", "GitHub"],
  ["gitlab", "GitLab"],
  ["linkedin", "LinkedIn"],
  ["openai", "OpenAI"],
  ["tiktok", "TikTok"],
  ["whatsapp", "WhatsApp"],
  ["wordpress", "WordPress"],
  ["youtube", "YouTube"],
]);
const GENERIC_TITLE_PARTS = new Set([
  "dashboard", "home", "homepage", "login", "sign in", "首页", "登录", "控制台",
]);

function getChromeApi() {
  return typeof chrome === "undefined" ? null : chrome;
}

function getAppVersion() {
  return getChromeApi()?.runtime?.getManifest?.().version || "0.1.6";
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z\d+\-.]*:/i.test(raw)) return raw;
  const withProtocol = `https://${raw}`;

  try {
    return new URL(withProtocol).href;
  } catch {
    return "";
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getDomainBrand(url) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\d*\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
  if (!hostname || hostname === "localhost" || /^\[?[\da-f:.]+\]?$/i.test(hostname)) return hostname;

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length === 1) return labels[0];
  const lastTwo = labels.slice(-2).join(".");
  const suffixLength = PRIVATE_PUBLIC_SUFFIXES.has(lastTwo) || COMPOUND_PUBLIC_SUFFIXES.has(lastTwo) ? 2 : 1;
  return labels.at(-(suffixLength + 1)) || labels[0] || "";
}

function formatDomainBrand(value) {
  const brand = String(value || "").trim().toLowerCase();
  if (!brand) return "";
  if (brand === "localhost" || /^\[?[\da-f:.]+\]?$/i.test(brand)) return brand;
  if (BRAND_STYLINGS.has(brand)) return BRAND_STYLINGS.get(brand);
  return brand
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getNameWeight(value) {
  return Array.from(String(value || "")).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.5;
    if (/[^\u0000-\u00ff]/u.test(character)) return total + 2;
    return total + 1;
  }, 0);
}

function normalizeNameKey(value) {
  return String(value || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanPageTitle(value) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^(?:\(\d+\)|\[\d+\])\s*(?:[-–—|｜·:]\s*)?/u, "")
    .trim();
}

function getAutomaticSiteName(title, url) {
  const cleanedTitle = cleanPageTitle(title);
  const domainBrand = getDomainBrand(url);
  const fallback = formatDomainBrand(domainBrand) || getSiteFallbackName(url);
  if (!cleanedTitle) return fallback;

  const brandKey = normalizeNameKey(domainBrand);
  const titleParts = [
    ...cleanedTitle.split(/\s+(?:[-–—·•])\s+|\s*[|｜]\s*/u),
    ...(cleanedTitle.includes(":") ? [cleanedTitle.split(":", 1)[0]] : []),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  const matchingParts = titleParts
    .filter((part) => {
      const partKey = normalizeNameKey(part);
      return brandKey.length >= 3 && (partKey.includes(brandKey) || brandKey.includes(partKey));
    })
    .sort((left, right) => getNameWeight(left) - getNameWeight(right));

  const conciseMatch = matchingParts.find((part) => getNameWeight(part) <= AUTO_NAME_MAX_WEIGHT);
  if (conciseMatch) return conciseMatch;

  for (const part of matchingParts) {
    const matchingToken = part.split(/\s+/u).find((token) => normalizeNameKey(token).includes(brandKey));
    if (matchingToken && getNameWeight(matchingToken) <= AUTO_NAME_MAX_WEIGHT) return matchingToken;
  }

  const conciseLocalizedPart = titleParts.find((part) => (
    /[^\u0000-\u00ff]/u.test(part)
    && getNameWeight(part) <= AUTO_NAME_MAX_WEIGHT
    && !GENERIC_TITLE_PARTS.has(part.toLocaleLowerCase())
  ));
  return conciseLocalizedPart || fallback;
}

function getSiteFallbackName(url) {
  return formatDomainBrand(getDomainBrand(url)) || getDomain(url) || String(url || "").trim() || t("未命名网站");
}

function getUrlProtocol(url) {
  const match = String(url || "").trim().match(/^([a-z][a-z\d+\-.]*):/i);
  return match ? match[1].toLowerCase() : "";
}

function isHttpUrl(url) {
  const protocol = getUrlProtocol(url);
  return protocol === "http" || protocol === "https";
}

function isJavascriptUrl(url) {
  return getUrlProtocol(url) === "javascript";
}

function getFaviconUrl(url) {
  const chromeApi = getChromeApi();
  const requestPolicy = getFaviconRequestPolicy(url);
  if (!chromeApi?.runtime?.getURL || !requestPolicy) return "";
  const faviconUrl = new URL(chromeApi.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", requestPolicy.pageUrl);
  faviconUrl.searchParams.set("size", String(FAVICON_REQUEST_SIZE));
  faviconUrl.searchParams.set("allowGoogleServerFallback", "0");
  faviconUrl.searchParams.set("forceEmptyDefaultFavicon", "1");
  return faviconUrl.href;
}

function getInitial(name) {
  const value = String(name || "?").trim();
  if (!value) return "?";
  if (globalThis.Intl?.Segmenter) {
    const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value);
    return segments[Symbol.iterator]().next().value?.segment || "?";
  }
  return Array.from(value)[0] || "?";
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getUrlValidationError(value) {
  const raw = String(value || "").trim();
  if (!raw) return t("URL 不能为空。");

  const protocol = getUrlProtocol(raw);
  if (protocol === "http" || protocol === "https") {
    try {
      const parsed = new URL(raw);
      return parsed.hostname ? "" : t("URL 格式无效。");
    } catch {
      return t("URL 格式无效。");
    }
  }

  return normalizeUrl(raw) ? "" : t("URL 格式无效。");
}

export {
  FAVICON_REQUEST_SIZE,
  createId,
  getAppVersion,
  getAutomaticSiteName,
  getChromeApi,
  getDomain,
  getFaviconUrl,
  getInitial,
  getSiteFallbackName,
  getUrlProtocol,
  getUrlValidationError,
  isHttpUrl,
  isJavascriptUrl,
  normalizeUrl,
};
