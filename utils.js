import { t } from "./i18n.js";

function getChromeApi() {
  return typeof chrome === "undefined" ? null : chrome;
}

function getAppVersion() {
  return getChromeApi()?.runtime?.getManifest?.().version || "0.1.3";
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

function getSiteFallbackName(url) {
  return getDomain(url) || String(url || "").trim() || t("未命名网站");
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
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=64`;
}

function getInitial(name) {
  return String(name || "?").trim().charAt(0) || "?";
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
  createId,
  getAppVersion,
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
