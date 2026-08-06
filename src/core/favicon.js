import { FAVICON_REQUEST_SIZE, getFaviconUrl, getInitial, isHttpUrl } from "./utils.js";

const FAVICON_DATABASE_NAME = "workspaceTilesAssets";
const FAVICON_DATABASE_VERSION = 1;
const FAVICON_STORE_NAME = "favicons";
const FAVICON_CACHE_FORMAT_VERSION = 2;
const FAVICON_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CACHED_FAVICONS = 400;
const pendingFavicons = new Map();

function getFaviconCacheKey(url) {
  try {
    return new URL(url).origin;
  } catch {
    return String(url || "").trim();
  }
}

function isFaviconCacheEntryFresh(entry, now = Date.now()) {
  if (!entry?.blob || entry.cacheFormatVersion !== FAVICON_CACHE_FORMAT_VERSION) return false;
  if (Number(entry.requestedSize) < FAVICON_REQUEST_SIZE) return false;

  const cachedAt = Number(entry.cachedAt);
  const checkedAt = Number(now);
  if (!Number.isFinite(cachedAt) || !Number.isFinite(checkedAt)) return false;
  return cachedAt > 0 && cachedAt <= checkedAt && checkedAt - cachedAt <= FAVICON_CACHE_TTL_MS;
}

function openFaviconDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FAVICON_DATABASE_NAME, FAVICON_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(FAVICON_STORE_NAME)) {
        const store = request.result.createObjectStore(FAVICON_STORE_NAME, { keyPath: "key" });
        store.createIndex("cachedAt", "cachedAt");
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
    request.addEventListener("blocked", () => reject(new Error("Favicon database upgrade blocked")), { once: true });
  });
}

async function readCachedFavicon(key) {
  const database = await openFaviconDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FAVICON_STORE_NAME, "readonly");
    const request = transaction.objectStore(FAVICON_STORE_NAME).get(key);
    request.addEventListener("success", () => {
      resolve(isFaviconCacheEntryFresh(request.result) ? request.result.blob : null);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
    transaction.addEventListener("complete", () => database.close(), { once: true });
    transaction.addEventListener("abort", () => database.close(), { once: true });
  });
}

async function writeCachedFavicon(key, blob) {
  const database = await openFaviconDatabase();
  if (!database) return;

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(FAVICON_STORE_NAME, "readwrite");
      transaction.objectStore(FAVICON_STORE_NAME).put({
        key,
        blob,
        cacheFormatVersion: FAVICON_CACHE_FORMAT_VERSION,
        requestedSize: FAVICON_REQUEST_SIZE,
        cachedAt: Date.now(),
      });
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });

    await trimFaviconCache(database);
  } finally {
    database.close();
  }
}

function trimFaviconCache(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FAVICON_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FAVICON_STORE_NAME);
    const countRequest = store.count();

    countRequest.addEventListener("success", () => {
      let removeCount = Math.max(0, countRequest.result - MAX_CACHED_FAVICONS);
      if (!removeCount) return;

      const cursorRequest = store.index("cachedAt").openCursor();
      cursorRequest.addEventListener("success", () => {
        const cursor = cursorRequest.result;
        if (!cursor || removeCount <= 0) return;
        cursor.delete();
        removeCount -= 1;
        cursor.continue();
      });
    }, { once: true });

    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
  });
}

async function fetchFavicon(url) {
  const faviconUrl = getFaviconUrl(url);
  if (!faviconUrl || typeof fetch !== "function") return null;

  const response = await fetch(faviconUrl);
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
      const cached = await readCachedFavicon(key);
      if (cached) return cached;
    } catch {
      // A cache failure must not prevent Chrome's local favicon from loading.
    }

    let blob = null;
    try {
      blob = await fetchFavicon(url);
    } catch {
      return null;
    }
    if (!blob) return null;

    try {
      await writeCachedFavicon(key, blob);
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

function renderFavicon(container, site) {
  const renderToken = Symbol("favicon-render");
  container.faviconRenderToken = renderToken;
  container.replaceChildren();

  const fallback = document.createElement("span");
  fallback.className = "favicon-fallback";
  fallback.textContent = getInitial(site?.name);
  container.append(fallback);

  if (!isHttpUrl(site?.url)) return;

  loadFaviconBlob(site.url).then((blob) => {
    if (!blob || !canApplyFaviconResult(container, renderToken)) return;

    const image = document.createElement("img");
    const objectUrl = URL.createObjectURL(blob);
    image.className = "favicon-image";
    image.alt = "";
    image.hidden = true;
    image.addEventListener("load", () => {
      URL.revokeObjectURL(objectUrl);
      if (!canApplyFaviconResult(container, renderToken)) return;
      image.hidden = false;
      fallback.hidden = true;
    }, { once: true });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      image.remove();
    }, { once: true });
    image.src = objectUrl;
    container.append(image);
  }).catch(() => {});
}

export {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  FAVICON_DATABASE_NAME,
  FAVICON_STORE_NAME,
  MAX_CACHED_FAVICONS,
  canApplyFaviconResult,
  getFaviconCacheKey,
  isFaviconCacheEntryFresh,
  loadFaviconBlob,
  renderFavicon,
};
