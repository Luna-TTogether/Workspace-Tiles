import { hashText } from "./workspace-draft.js";

const RECOMMENDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const recommendationCache = new Map();

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function getRecommendationCacheKey(input) {
  return hashText(stableStringify(input));
}

async function readCachedRecommendation(input, { now = Date.now() } = {}) {
  const key = await getRecommendationCacheKey(input);
  const cached = recommendationCache.get(key);
  if (!cached || cached.expiresAt <= now) {
    recommendationCache.delete(key);
    return null;
  }
  return cached.value;
}

async function cacheRecommendation(input, value, { now = Date.now() } = {}) {
  const key = await getRecommendationCacheKey(input);
  recommendationCache.set(key, { value, expiresAt: now + RECOMMENDATION_CACHE_TTL_MS });
}

function clearAiResponseCache() {
  recommendationCache.clear();
}

export {
  RECOMMENDATION_CACHE_TTL_MS,
  cacheRecommendation,
  clearAiResponseCache,
  readCachedRecommendation,
  stableStringify,
};
