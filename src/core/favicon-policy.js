const PRIVATE_FAVICON_HOST_SUFFIXES = [
  ".home",
  ".home.arpa",
  ".internal",
  ".invalid",
  ".lan",
  ".local",
  ".localdomain",
  ".localhost",
  ".onion",
  ".test",
];

function isIpHostname(hostname) {
  const value = String(hostname || "").replace(/^\[|\]$/g, "");
  if (!value) return false;
  if (value.includes(":")) return true;

  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function canUseGoogleFaviconFallback(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".") || isIpHostname(host)) return false;
  return !PRIVATE_FAVICON_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function getFaviconRequestPolicy(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      pageUrl: `${parsed.origin}/`,
      allowGoogleServerFallback: canUseGoogleFaviconFallback(parsed.hostname),
    };
  } catch {
    return null;
  }
}

export {
  canUseGoogleFaviconFallback,
  getFaviconRequestPolicy,
  isIpHostname,
};
