import { AI_CONFIG } from "../config/ai-config.js";
import { readLocalStorage, writeLocalStorage } from "../core/storage.js";
import { clearWorkspaceDrafts } from "./workspace-draft.js";
import { clearAiResponseCache } from "./ai-response-cache.js";

const AI_CONSENT_STORAGE_KEY = "workspaceTilesAiConsent";
const AI_CONSENT_STATES = new Set(["unknown", "accepted", "declined"]);

function normalizeAiConsent(value) {
  const state = AI_CONSENT_STATES.has(value?.state) ? value.state : "unknown";
  const consentVersion = Number.isInteger(value?.consentVersion) ? value.consentVersion : 0;
  const acceptedAt = typeof value?.acceptedAt === "string" && Number.isFinite(Date.parse(value.acceptedAt))
    ? new Date(Date.parse(value.acceptedAt)).toISOString()
    : null;
  if (state === "accepted" && consentVersion === AI_CONFIG.consentVersion && acceptedAt) {
    return { state, consentVersion, acceptedAt };
  }
  return {
    state: state === "declined" ? "declined" : "unknown",
    consentVersion,
    acceptedAt: null,
  };
}

async function getAiConsent() {
  const stored = await readLocalStorage(AI_CONSENT_STORAGE_KEY);
  return normalizeAiConsent(stored[AI_CONSENT_STORAGE_KEY]);
}

async function setAiConsent(state, { now = Date.now() } = {}) {
  if (!AI_CONSENT_STATES.has(state)) throw new TypeError("Invalid AI consent state");
  const consent = state === "accepted"
    ? {
      state,
      consentVersion: AI_CONFIG.consentVersion,
      acceptedAt: new Date(now).toISOString(),
    }
    : {
      state,
      consentVersion: AI_CONFIG.consentVersion,
      acceptedAt: null,
    };
  await writeLocalStorage({ [AI_CONSENT_STORAGE_KEY]: consent });
  if (state !== "accepted") {
    clearAiResponseCache();
    await clearWorkspaceDrafts();
  }
  return consent;
}

async function requireAiConsent() {
  const consent = await getAiConsent();
  if (consent.state !== "accepted" || consent.consentVersion !== AI_CONFIG.consentVersion) {
    const error = new Error("Cloud AI consent is required");
    error.code = "AI_CONSENT_REQUIRED";
    throw error;
  }
  return consent;
}

export {
  AI_CONSENT_STATES,
  AI_CONSENT_STORAGE_KEY,
  getAiConsent,
  normalizeAiConsent,
  requireAiConsent,
  setAiConsent,
};
