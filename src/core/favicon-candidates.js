import { FAVICON_REQUEST_SIZE } from "./utils.js";
import { getFaviconRequestPolicy } from "./favicon-policy.js";

function normalizeExplicitFaviconUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    return parsed.href;
  } catch {
    return "";
  }
}

function getGoogleFaviconUrl(pageUrl, size = FAVICON_REQUEST_SIZE) {
  const policy = getFaviconRequestPolicy(pageUrl);
  if (!policy?.allowGoogleServerFallback) return "";

  const faviconUrl = new URL("https://t2.gstatic.cn/faviconV2");
  faviconUrl.searchParams.set("client", "SOCIAL");
  faviconUrl.searchParams.set("type", "FAVICON");
  faviconUrl.searchParams.set("fallback_opts", "TYPE,SIZE,URL");
  faviconUrl.searchParams.set("url", policy.pageUrl);
  faviconUrl.searchParams.set("size", String(size));
  return faviconUrl.href;
}

function getRootFaviconCandidates(pageUrl) {
  const policy = getFaviconRequestPolicy(pageUrl);
  if (!policy) return [];
  const origin = new URL(policy.pageUrl).origin;
  return [
    { kind: "site-svg", url: `${origin}/favicon.svg` },
    { kind: "site-touch-icon", url: `${origin}/apple-touch-icon.png` },
    { kind: "site-png", url: `${origin}/favicon.png` },
    { kind: "site-ico", url: `${origin}/favicon.ico` },
  ];
}

function buildFaviconCandidatePlan(site, chromeFaviconUrl = "") {
  const pageUrl = String(site?.url || "");
  const candidates = [
    { kind: "explicit", url: normalizeExplicitFaviconUrl(site?.faviconUrl) },
    { kind: "google", url: getGoogleFaviconUrl(pageUrl) },
    ...getRootFaviconCandidates(pageUrl),
    { kind: "chrome", url: String(chromeFaviconUrl || "") },
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

export {
  buildFaviconCandidatePlan,
  getGoogleFaviconUrl,
  getRootFaviconCandidates,
  normalizeExplicitFaviconUrl,
};
