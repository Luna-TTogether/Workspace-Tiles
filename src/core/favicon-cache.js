import { FAVICON_REQUEST_SIZE } from "./utils.js";

const FAVICON_DATABASE_NAME = "workspaceTilesAssets";
const FAVICON_DATABASE_VERSION = 1;
const FAVICON_STORE_NAME = "favicons";
const FAVICON_CACHE_FORMAT_VERSION = 4;
const FAVICON_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CACHED_FAVICONS = 400;

function isFaviconCacheEntryFresh(entry, now = Date.now()) {
  if (!entry?.blob && !entry?.sourceUrl) return false;
  if (entry.cacheFormatVersion !== FAVICON_CACHE_FORMAT_VERSION) return false;
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

async function readCachedFaviconEntry(key) {
  const database = await openFaviconDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FAVICON_STORE_NAME, "readonly");
    const request = transaction.objectStore(FAVICON_STORE_NAME).get(key);
    request.addEventListener("success", () => {
      resolve(isFaviconCacheEntryFresh(request.result) ? request.result : null);
    }, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
    transaction.addEventListener("complete", () => database.close(), { once: true });
    transaction.addEventListener("abort", () => database.close(), { once: true });
  });
}

async function writeCachedFaviconEntry(key, entry) {
  if (!key || (!entry?.blob && !entry?.sourceUrl)) return;
  const database = await openFaviconDatabase();
  if (!database) return;

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(FAVICON_STORE_NAME, "readwrite");
      transaction.objectStore(FAVICON_STORE_NAME).put({
        key,
        blob: entry.blob || null,
        sourceUrl: String(entry.sourceUrl || ""),
        sourceKind: String(entry.sourceKind || "unknown"),
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

async function deleteCachedFaviconEntry(key) {
  const database = await openFaviconDatabase();
  if (!database) return;

  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(FAVICON_STORE_NAME, "readwrite");
      transaction.objectStore(FAVICON_STORE_NAME).delete(key);
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener("error", () => reject(transaction.error), { once: true });
      transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    });
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

export {
  FAVICON_CACHE_FORMAT_VERSION,
  FAVICON_CACHE_TTL_MS,
  FAVICON_DATABASE_NAME,
  FAVICON_STORE_NAME,
  MAX_CACHED_FAVICONS,
  deleteCachedFaviconEntry,
  isFaviconCacheEntryFresh,
  readCachedFaviconEntry,
  writeCachedFaviconEntry,
};
