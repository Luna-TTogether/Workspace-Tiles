import {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  FAVICON_DATABASE_NAME,
  FAVICON_STORE_NAME,
  MAX_CACHED_FAVICONS,
  deleteCachedFaviconEntry,
  isFaviconCacheEntryFresh,
  readCachedFaviconEntry,
  writeCachedFaviconEntry,
} from "./favicon-cache.js";
import { buildFaviconCandidatePlan } from "./favicon-candidates.js";
import { isFaviconCandidateAcceptable } from "./favicon-quality.js";
import { getFaviconUrl, getInitial, isHttpUrl } from "./utils.js";

const FAVICON_CANDIDATE_TIMEOUT_MS = 2500;
const pendingFavicons = new Map();

function getFaviconCacheKey(url) {
  try {
    return new URL(url).origin;
  } catch {
    return String(url || "").trim();
  }
}

async function fetchFaviconBlob(faviconUrl) {
  if (!faviconUrl || typeof fetch !== "function") return null;
  const response = await fetch(faviconUrl, {
    cache: "force-cache",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.size || !String(blob.type).startsWith("image/")) return null;
  return blob;
}

async function loadFaviconBlob(url) {
  if (!isHttpUrl(url)) return null;
  const key = getFaviconCacheKey(url);
  if (pendingFavicons.has(key)) return pendingFavicons.get(key);

  const pending = (async () => {
    try {
      const cached = await readCachedFaviconEntry(key);
      if (cached?.blob) return cached.blob;
    } catch {
      // A cache failure must not prevent another favicon source from loading.
    }

    let blob = null;
    const faviconUrl = getFaviconUrl(url);
    try {
      blob = await fetchFaviconBlob(faviconUrl);
    } catch {
      return null;
    }
    if (!blob) return null;

    try {
      await writeCachedFaviconEntry(key, { blob, sourceUrl: faviconUrl, sourceKind: "chrome" });
    } catch {
      // Rendering can continue with the fetched image when persistence fails.
    }
    return blob;
  })();

  pendingFavicons.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingFavicons.delete(key);
  }
}

function canApplyFaviconResult(container, renderToken) {
  return container.faviconRenderToken === renderToken;
}

function createCachedCandidate(entry) {
  if (entry?.blob) {
    const objectUrl = URL.createObjectURL(entry.blob);
    return {
      kind: "cached-blob",
      sourceKind: entry.sourceKind,
      url: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl),
    };
  }
  if (entry?.sourceUrl) {
    return { kind: "cached-url", sourceKind: entry.sourceKind, url: entry.sourceUrl };
  }
  return null;
}

function mergeCachedCandidate(candidates, cachedCandidate) {
  if (!cachedCandidate) return candidates;
  const explicitCandidates = candidates.filter(({ kind }) => kind === "explicit");
  const remaining = candidates.filter(({ kind, url }) => kind !== "explicit" && url !== cachedCandidate.url);
  return [...explicitCandidates, cachedCandidate, ...remaining];
}

async function persistResolvedCandidate(cacheKey, candidate) {
  if (!cacheKey || !candidate?.url || candidate.kind.startsWith("cached-")) return;

  try {
    await writeCachedFaviconEntry(cacheKey, {
      sourceUrl: candidate.url,
      sourceKind: candidate.kind,
    });
  } catch {
    return;
  }

  if (candidate.kind !== "google" && candidate.kind !== "chrome") return;
  try {
    const blob = await fetchFaviconBlob(candidate.url);
    if (!blob) return;
    await writeCachedFaviconEntry(cacheKey, {
      blob,
      sourceUrl: candidate.url,
      sourceKind: candidate.kind,
    });
  } catch {
    // The selected URL remains cached even when its Blob cannot be persisted.
  }
}

function tryFaviconCandidates({ container, image, fallback, candidates, cacheKey, renderToken }) {
  let candidateIndex = 0;
  let attemptToken = 0;
  let timeoutId = null;

  const finishAttempt = (candidate) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    candidate?.revoke?.();
  };

  const tryNext = () => {
    if (!canApplyFaviconResult(container, renderToken)) return;
    const candidate = candidates[candidateIndex];
    candidateIndex += 1;
    if (!candidate) {
      image.remove();
      return;
    }

    attemptToken += 1;
    const currentAttempt = attemptToken;
    image.hidden = true;
    image.removeAttribute("src");

    const handleFailure = () => {
      if (currentAttempt !== attemptToken) return;
      finishAttempt(candidate);
      if (candidate.kind.startsWith("cached-")) {
        deleteCachedFaviconEntry(cacheKey).catch(() => {});
      }
      tryNext();
    };

    image.onload = () => {
      if (currentAttempt !== attemptToken) return;
      finishAttempt(candidate);
      if (!canApplyFaviconResult(container, renderToken)) return;
      if (!isFaviconCandidateAcceptable(candidate, image.naturalWidth, image.naturalHeight)) {
        handleFailure();
        return;
      }
      image.hidden = false;
      fallback.hidden = true;
      persistResolvedCandidate(cacheKey, candidate).catch(() => {});
    };
    image.onerror = handleFailure;
    timeoutId = setTimeout(handleFailure, FAVICON_CANDIDATE_TIMEOUT_MS);
    image.src = candidate.url;
  };

  tryNext();
}

function renderFavicon(container, site) {
  const renderToken = Symbol("favicon-render");
  container.faviconRenderToken = renderToken;
  container.replaceChildren();

  const fallback = document.createElement("span");
  fallback.className = "favicon-fallback";
  fallback.textContent = getInitial(site?.name);
  container.append(fallback);

  if (!isHttpUrl(site?.url)) return;

  const image = document.createElement("img");
  image.className = "favicon-image";
  image.alt = "";
  image.hidden = true;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  container.append(image);

  const cacheKey = getFaviconCacheKey(site.url);
  const candidates = buildFaviconCandidatePlan(site, getFaviconUrl(site.url));
  readCachedFaviconEntry(cacheKey).catch(() => null).then((cachedEntry) => {
    if (!canApplyFaviconResult(container, renderToken)) return;
    const cachedCandidate = createCachedCandidate(cachedEntry);
    tryFaviconCandidates({
      container,
      image,
      fallback,
      candidates: mergeCachedCandidate(candidates, cachedCandidate),
      cacheKey,
      renderToken,
    });
  });
}

export {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  FAVICON_CANDIDATE_TIMEOUT_MS,
  FAVICON_DATABASE_NAME,
  FAVICON_STORE_NAME,
  MAX_CACHED_FAVICONS,
  canApplyFaviconResult,
  getFaviconCacheKey,
  isFaviconCacheEntryFresh,
  loadFaviconBlob,
  renderFavicon,
};
