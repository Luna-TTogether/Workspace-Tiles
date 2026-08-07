import { createId } from "../core/utils.js";
import { toValidIso } from "../core/context-time.js";
import {
  readLocalStorage,
  readSessionStorage,
  removeSessionStorage,
  writeLocalStorage,
  writeSessionStorage,
} from "../core/storage.js";

const WORKSPACE_DRAFT_STORAGE_KEY = "workspaceTilesWorkspaceDrafts";
const WORKSPACE_DRAFT_SUPPRESSION_KEY = "workspaceTilesWorkspaceDraftSuppressions";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const SIMILAR_CONTEXT_THRESHOLD = 0.8;
const DRAFT_STATES = new Set(["generating", "ready", "reviewing", "created", "dismissed", "expired"]);
const DRAFT_SOURCES = new Set(["popup", "newtab", "manual"]);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const ALLOWED_TRANSITIONS = new Map([
  ["generating", new Set(["ready", "expired"])],
  ["ready", new Set(["reviewing", "created", "dismissed", "expired"])],
  ["reviewing", new Set(["ready", "created", "dismissed", "expired"])],
  ["created", new Set()],
  ["dismissed", new Set()],
  ["expired", new Set()],
]);

function normalizeDraftUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createSourceIdentity(urls) {
  const normalizedUrls = urls.map(normalizeDraftUrl).filter(Boolean).sort();
  const sourceUrlHashes = await Promise.all(normalizedUrls.map(hashText));
  sourceUrlHashes.sort();
  const sourceSignature = await hashText(normalizedUrls.join("\n"));
  return { normalizedUrls, sourceUrlHashes, sourceSignature };
}

function calculateMultisetJaccard(left, right) {
  const count = (values) => values.reduce((map, value) => {
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map());
  const leftCounts = count(Array.isArray(left) ? left : []);
  const rightCounts = count(Array.isArray(right) ? right : []);
  const keys = new Set([...leftCounts.keys(), ...rightCounts.keys()]);
  let intersection = 0;
  let union = 0;
  keys.forEach((key) => {
    intersection += Math.min(leftCounts.get(key) || 0, rightCounts.get(key) || 0);
    union += Math.max(leftCounts.get(key) || 0, rightCounts.get(key) || 0);
  });
  return union ? intersection / union : 1;
}

function normalizeDraftTab(tab, index) {
  const originalUrl = String(tab?.originalUrl || tab?.url || "").trim();
  const normalizedUrl = normalizeDraftUrl(tab?.normalizedUrl || originalUrl);
  if (!normalizedUrl) return null;
  return {
    key: String(tab?.key || createId("tab-key")),
    tabId: Number.isInteger(tab?.tabId) ? tab.tabId : null,
    originalUrl,
    normalizedUrl,
    title: String(tab?.title || "").trim().slice(0, 300),
    suggestedSiteName: String(tab?.suggestedSiteName || "").trim().slice(0, 80),
    selected: Boolean(tab?.selected),
    originalIndex: Number.isInteger(tab?.originalIndex) ? tab.originalIndex : index,
  };
}

function normalizeWorkspaceDraft(value, { now = Date.now() } = {}) {
  if (!value || !Number.isInteger(value.windowId)) return null;
  const state = DRAFT_STATES.has(value.state) ? value.state : "generating";
  const source = DRAFT_SOURCES.has(value.source) ? value.source : "manual";
  const generatedAt = toValidIso(value.generatedAt) || new Date(now).toISOString();
  const updatedAt = toValidIso(value.updatedAt) || generatedAt;
  const expiresAt = toValidIso(value.expiresAt)
    || new Date(Date.parse(generatedAt) + DRAFT_TTL_MS).toISOString();
  return {
    id: String(value.id || createId("workspace-draft")),
    windowId: value.windowId,
    sourceSignature: String(value.sourceSignature || ""),
    sourceUrlHashes: Array.isArray(value.sourceUrlHashes)
      ? value.sourceUrlHashes.filter((hash) => typeof hash === "string" && /^[a-f\d]{64}$/i.test(hash)).sort()
      : [],
    source,
    state,
    suggestedName: String(value.suggestedName || "").trim().slice(0, 60),
    reason: String(value.reason || "").trim().slice(0, 120),
    confidence: CONFIDENCE_LEVELS.has(value.confidence) ? value.confidence : null,
    tabs: (Array.isArray(value.tabs) ? value.tabs : []).map(normalizeDraftTab).filter(Boolean),
    generatedAt,
    updatedAt,
    expiresAt,
  };
}

function transitionWorkspaceDraft(value, nextState, { now = Date.now() } = {}) {
  const draft = normalizeWorkspaceDraft(value, { now });
  if (!draft || !DRAFT_STATES.has(nextState) || !ALLOWED_TRANSITIONS.get(draft.state)?.has(nextState)) {
    const error = new Error("Invalid workspace draft transition");
    error.code = "AI_INVALID_REQUEST";
    throw error;
  }
  return { ...draft, state: nextState, updatedAt: new Date(now).toISOString() };
}

function getDraftStorageId(windowId, sourceSignature) {
  return `${windowId}:${sourceSignature}`;
}

async function readDraftMap() {
  const stored = await readSessionStorage(WORKSPACE_DRAFT_STORAGE_KEY);
  return stored[WORKSPACE_DRAFT_STORAGE_KEY] && typeof stored[WORKSPACE_DRAFT_STORAGE_KEY] === "object"
    ? stored[WORKSPACE_DRAFT_STORAGE_KEY]
    : {};
}

async function saveWorkspaceDraft(value, { now = Date.now() } = {}) {
  const draft = normalizeWorkspaceDraft(value, { now });
  if (!draft || !draft.sourceSignature) {
    const error = new Error("Invalid workspace draft");
    error.code = "AI_INVALID_REQUEST";
    throw error;
  }
  const drafts = await readDraftMap();
  Object.entries(drafts).forEach(([key, existing]) => {
    if (existing?.windowId === draft.windowId && key !== getDraftStorageId(draft.windowId, draft.sourceSignature)) {
      delete drafts[key];
    }
  });
  drafts[getDraftStorageId(draft.windowId, draft.sourceSignature)] = draft;
  await writeSessionStorage({ [WORKSPACE_DRAFT_STORAGE_KEY]: drafts });
  return draft;
}

async function findReusableWorkspaceDraft(windowId, sourceUrlHashes, { now = Date.now() } = {}) {
  const drafts = await readDraftMap();
  const candidates = Object.values(drafts)
    .map((draft) => normalizeWorkspaceDraft(draft, { now }))
    .filter((draft) => draft
      && draft.windowId === windowId
      && Date.parse(draft.expiresAt) > now
      && ["generating", "ready", "reviewing"].includes(draft.state));
  return candidates.find((draft) => (
    calculateMultisetJaccard(draft.sourceUrlHashes, sourceUrlHashes) >= SIMILAR_CONTEXT_THRESHOLD
  )) || null;
}

async function clearWorkspaceDrafts() {
  await removeSessionStorage(WORKSPACE_DRAFT_STORAGE_KEY);
}

async function readSuppressions({ now = Date.now() } = {}) {
  const stored = await readLocalStorage(WORKSPACE_DRAFT_SUPPRESSION_KEY);
  const suppressions = Array.isArray(stored[WORKSPACE_DRAFT_SUPPRESSION_KEY])
    ? stored[WORKSPACE_DRAFT_SUPPRESSION_KEY]
    : [];
  const active = suppressions.filter((item) => toValidIso(item?.expiresAt) && Date.parse(item.expiresAt) > now);
  if (active.length !== suppressions.length) {
    await writeLocalStorage({ [WORKSPACE_DRAFT_SUPPRESSION_KEY]: active });
  }
  return active;
}

async function suppressWorkspaceDraft(value, state, { now = Date.now() } = {}) {
  const draft = normalizeWorkspaceDraft(value, { now });
  if (!draft || !["created", "dismissed"].includes(state)) return null;
  const suppressions = await readSuppressions({ now });
  const expiresAt = new Date(now + (state === "dismissed" ? DISMISS_TTL_MS : DRAFT_TTL_MS)).toISOString();
  const next = suppressions.filter((item) => item.sourceSignature !== draft.sourceSignature);
  const suppression = {
    sourceSignature: draft.sourceSignature,
    sourceUrlHashes: draft.sourceUrlHashes,
    state,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  };
  next.push(suppression);
  await writeLocalStorage({ [WORKSPACE_DRAFT_SUPPRESSION_KEY]: next });
  return suppression;
}

async function findWorkspaceDraftSuppression(sourceUrlHashes, { now = Date.now() } = {}) {
  const suppressions = await readSuppressions({ now });
  return suppressions.find((item) => (
    calculateMultisetJaccard(item.sourceUrlHashes, sourceUrlHashes) >= SIMILAR_CONTEXT_THRESHOLD
  )) || null;
}

export {
  CONFIDENCE_LEVELS,
  DISMISS_TTL_MS,
  DRAFT_STATES,
  DRAFT_TTL_MS,
  SIMILAR_CONTEXT_THRESHOLD,
  WORKSPACE_DRAFT_STORAGE_KEY,
  WORKSPACE_DRAFT_SUPPRESSION_KEY,
  calculateMultisetJaccard,
  clearWorkspaceDrafts,
  createSourceIdentity,
  findReusableWorkspaceDraft,
  findWorkspaceDraftSuppression,
  hashText,
  normalizeDraftUrl,
  normalizeWorkspaceDraft,
  saveWorkspaceDraft,
  suppressWorkspaceDraft,
  transitionWorkspaceDraft,
};
