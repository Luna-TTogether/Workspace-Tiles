import { AI_CONFIG } from "../config/ai-config.js";
import { createId } from "../core/utils.js";
import { getAiAuthSession } from "./ai-auth.js";
import { requireAiConsent } from "./ai-consent.js";
import {
  AI_ERROR_CODES,
  AI_SCHEMA_VERSION,
  AI_TASKS,
  validateAiResponseEnvelope,
  validateAiTaskInput,
} from "./ai-schema.js";
import {
  RECOMMENDATION_CACHE_TTL_MS,
  cacheRecommendation,
  clearAiResponseCache,
  readCachedRecommendation,
  stableStringify,
} from "./ai-response-cache.js";

function createAiError(code, message = code, details = null) {
  const normalizedCode = AI_ERROR_CODES.has(code) ? code : "AI_PROVIDER_UNAVAILABLE";
  const error = new Error(message || normalizedCode);
  error.code = normalizedCode;
  if (details) error.details = details;
  return error;
}

async function parseEdgeResponse(response, task, input) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    throw createAiError("AI_INVALID_RESPONSE", "AI service returned invalid JSON");
  }
  if (!response.ok) {
    const code = AI_ERROR_CODES.has(body?.error?.code) ? body.error.code : (
      response.status === 401 ? "AI_UNAUTHORIZED"
        : response.status === 413 ? "AI_PAYLOAD_TOO_LARGE"
          : response.status === 429 ? "AI_QUOTA_EXCEEDED"
            : "AI_PROVIDER_UNAVAILABLE"
    );
    throw createAiError(code, body?.error?.message || code, body?.usage || null);
  }
  if (!validateAiResponseEnvelope(body, task, input)) {
    throw createAiError("AI_INVALID_RESPONSE", "AI service response failed validation");
  }
  return body;
}

async function sendEdgeRequest(request, task, input, {
  fetchImpl,
  signal,
  forceRefresh = false,
} = {}) {
  const session = await getAiAuthSession({ fetchImpl, forceRefresh });
  const response = await fetchImpl(
    `${AI_CONFIG.supabaseUrl}/functions/v1/${AI_CONFIG.edgeFunctionName}`,
    {
      method: "POST",
      headers: {
        apikey: AI_CONFIG.supabasePublishableKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    },
  );
  if (response.status === 401 && !forceRefresh) {
    return sendEdgeRequest(request, task, input, { fetchImpl, signal, forceRefresh: true });
  }
  return parseEdgeResponse(response, task, input);
}

async function callWorkspaceAi(task, input, {
  locale = "en",
  idempotencyKey = createId("ai-request"),
  timeoutMs = AI_CONFIG.requestTimeoutMs,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  if (!AI_TASKS.has(task) || !validateAiTaskInput(task, input)) {
    throw createAiError("AI_INVALID_REQUEST", "AI request failed local validation");
  }
  await requireAiConsent();
  if (task === "recommend_existing_workspace") {
    const cached = await readCachedRecommendation(input, { now });
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const request = {
    version: AI_SCHEMA_VERSION,
    idempotencyKey,
    task,
    locale: String(locale || "en").slice(0, 35),
    input,
  };
  try {
    const response = await sendEdgeRequest(request, task, input, {
      fetchImpl,
      signal: controller.signal,
    });
    if (task === "recommend_existing_workspace") await cacheRecommendation(input, response, { now });
    return response;
  } catch (error) {
    if (error?.name === "AbortError") throw createAiError("AI_PROVIDER_TIMEOUT", "AI request timed out");
    if (AI_ERROR_CODES.has(error?.code)) throw error;
    throw createAiError("AI_PROVIDER_UNAVAILABLE", "AI service is unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

export {
  RECOMMENDATION_CACHE_TTL_MS,
  callWorkspaceAi,
  clearAiResponseCache,
  createAiError,
  stableStringify,
};
