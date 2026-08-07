import { AI_CONFIG } from "../config/ai-config.js";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "../core/storage.js";

const AI_AUTH_STORAGE_KEY = "workspaceTilesAiAuthSession";
const SESSION_EXPIRY_SKEW_SECONDS = 60;
let sessionRequest = null;

function createAuthError(message, cause = null) {
  const error = new Error(message || "AI authentication failed", cause ? { cause } : undefined);
  error.code = "AI_AUTH_REQUIRED";
  return error;
}

function normalizeAuthSession(value, { now = Date.now() } = {}) {
  if (!value || typeof value !== "object") return null;
  const accessToken = typeof value.access_token === "string" ? value.access_token : "";
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : "";
  let expiresAt = Number(value.expires_at);
  if (!Number.isFinite(expiresAt) && Number.isFinite(Number(value.expires_in))) {
    expiresAt = Math.floor(now / 1000) + Number(value.expires_in);
  }
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) return null;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    token_type: typeof value.token_type === "string" ? value.token_type : "bearer",
    user: value.user && typeof value.user === "object" ? { id: String(value.user.id || "") } : null,
  };
}

function isSessionFresh(session, { now = Date.now() } = {}) {
  return Boolean(session && session.expires_at > Math.floor(now / 1000) + SESSION_EXPIRY_SKEW_SECONDS);
}

function getAuthHeaders() {
  return {
    apikey: AI_CONFIG.supabasePublishableKey,
    Authorization: `Bearer ${AI_CONFIG.supabasePublishableKey}`,
    "Content-Type": "application/json",
  };
}

async function parseAuthResponse(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    throw createAuthError("AI authentication returned an invalid response");
  }
  if (!response.ok) throw createAuthError(body?.msg || body?.message || "AI authentication was rejected");
  const session = normalizeAuthSession(body);
  if (!session) throw createAuthError("AI authentication returned an invalid session");
  await writeLocalStorage({ [AI_AUTH_STORAGE_KEY]: session });
  return session;
}

async function createAnonymousSession({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(`${AI_CONFIG.supabaseUrl}/auth/v1/signup`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });
    return await parseAuthResponse(response);
  } catch (error) {
    if (error?.code === "AI_AUTH_REQUIRED") throw error;
    throw createAuthError("Could not create an anonymous AI session", error);
  }
}

async function refreshAnonymousSession(refreshToken, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(`${AI_CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return await parseAuthResponse(response);
  } catch (error) {
    await removeLocalStorage(AI_AUTH_STORAGE_KEY);
    if (error?.code === "AI_AUTH_REQUIRED") throw error;
    throw createAuthError("Could not refresh the anonymous AI session", error);
  }
}

async function loadStoredSession() {
  const stored = await readLocalStorage(AI_AUTH_STORAGE_KEY);
  return normalizeAuthSession(stored[AI_AUTH_STORAGE_KEY]);
}

async function getAiAuthSession({ fetchImpl = globalThis.fetch, forceRefresh = false, now = Date.now() } = {}) {
  if (sessionRequest) return sessionRequest;
  sessionRequest = (async () => {
    const stored = await loadStoredSession();
    if (!forceRefresh && isSessionFresh(stored, { now })) return stored;
    if (stored?.refresh_token) {
      try {
        return await refreshAnonymousSession(stored.refresh_token, { fetchImpl });
      } catch {
        // A revoked or corrupt anonymous session is replaced with a new anonymous user.
      }
    }
    return createAnonymousSession({ fetchImpl });
  })();
  try {
    return await sessionRequest;
  } finally {
    sessionRequest = null;
  }
}

async function clearAiAuthSession() {
  await removeLocalStorage(AI_AUTH_STORAGE_KEY);
}

export {
  AI_AUTH_STORAGE_KEY,
  SESSION_EXPIRY_SKEW_SECONDS,
  clearAiAuthSession,
  createAnonymousSession,
  getAiAuthSession,
  isSessionFresh,
  normalizeAuthSession,
  refreshAnonymousSession,
};
