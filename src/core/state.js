import { t } from "./i18n.js";
import { normalizeExplicitFaviconUrl } from "./favicon-candidates.js";
import { createId, getChromeApi, getSiteFallbackName, normalizeUrl } from "./utils.js";
import { normalizeCardFace, normalizeNote } from "../features/workspace-notes.js";
import {
  CONTEXT_STATE_SCHEMA_VERSION,
  getLatestRecordedAt,
  getLegacyAt,
  getMigrationAt,
  normalizeEntityTime,
} from "./context-time.js";

const STORAGE_KEY = "workspaceTilesState";
const UI_STORAGE_KEY = "workspaceTilesUiState";
const TILE_SIZES = new Set(["small", "medium", "large"]);
let state = normalizeState({ workspaces: [] });
let uiState = { expandedWorkspaceId: null };
let stateInitializationError = null;

function getState() {
  return state;
}

function setState(nextState) {
  state = normalizeState(nextState);
  return state;
}

function initializeState() {
  stateInitializationError = null;
  return new Promise((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      state = readLocalFallback();
      resolve(state);
      return;
    }

    chromeApi.storage.local.get(STORAGE_KEY, (result) => {
      if (chromeApi.runtime?.lastError) {
        stateInitializationError = new Error(chromeApi.runtime.lastError.message);
        state = normalizeState({ workspaces: [] });
        resolve(state);
        return;
      }
      const storedState = result[STORAGE_KEY];
      state = normalizeState(storedState);
      if (JSON.stringify(storedState) === JSON.stringify(state)) {
        resolve(state);
        return;
      }
      chromeApi.storage.local.set({ [STORAGE_KEY]: state }, () => {
        if (chromeApi.runtime?.lastError) {
          stateInitializationError = new Error(chromeApi.runtime.lastError.message);
        }
        resolve(state);
      });
    });
  });
}

function getUiState() {
  return uiState;
}

function getStateInitializationError() {
  return stateInitializationError;
}

function initializeUiState() {
  return new Promise((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      uiState = readLocalUiFallback();
      resolve(uiState);
      return;
    }

    chromeApi.storage.local.get(UI_STORAGE_KEY, (result) => {
      uiState = normalizeUiState(result[UI_STORAGE_KEY]);
      resolve(uiState);
    });
  });
}

function saveExpandedWorkspaceId(workspaceId) {
  const nextUiState = normalizeUiState({ expandedWorkspaceId: workspaceId });
  uiState = nextUiState;

  return new Promise((resolve, reject) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(nextUiState));
      resolve(uiState);
      return;
    }

    chromeApi.storage.local.set({ [UI_STORAGE_KEY]: nextUiState }, () => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      resolve(uiState);
    });
  });
}

function saveState() {
  const data = normalizeState(state);

  return new Promise((resolve, reject) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      state = data;
      resolve(state);
      return;
    }

    chromeApi.storage.local.set({ [STORAGE_KEY]: data }, () => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      state = data;
      resolve(state);
    });
  });
}

function loadStateForUpdate() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.storage?.local) {
    return Promise.resolve(readLocalFallback());
  }

  return new Promise((resolve, reject) => {
    chromeApi.storage.local.get(STORAGE_KEY, (result) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      resolve(normalizeState(result[STORAGE_KEY]));
    });
  });
}

function readLocalFallback() {
  let storedState = null;
  try {
    storedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    storedState = null;
  }
  const normalized = normalizeState(storedState);
  if (JSON.stringify(storedState) !== JSON.stringify(normalized)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (error) {
      stateInitializationError = error;
    }
  }
  return normalized;
}

function readLocalUiFallback() {
  try {
    return normalizeUiState(JSON.parse(localStorage.getItem(UI_STORAGE_KEY)));
  } catch {
    return { expandedWorkspaceId: null };
  }
}

function normalizeTileSize(value) {
  return TILE_SIZES.has(value) ? value : "large";
}

function normalizeUiState(value) {
  const expandedWorkspaceId = typeof value?.expandedWorkspaceId === "string"
    ? value.expandedWorkspaceId.trim()
    : "";
  return {
    expandedWorkspaceId: expandedWorkspaceId || null,
  };
}

function normalizeState(value, { now = Date.now() } = {}) {
  const source = value && Array.isArray(value.workspaces) ? value : { workspaces: [] };
  const contextTimeMigratedAt = getMigrationAt(source, now);
  const legacyAt = getLegacyAt(contextTimeMigratedAt);
  const workspaces = source.workspaces.map((workspace) => {
    const workspaceTime = normalizeEntityTime(workspace.createdAt, workspace.createdAtOrigin, legacyAt);
    return {
      id: workspace.id || createId("workspace"),
      name: String(workspace.name || t("未命名工作区")).trim() || t("未命名工作区"),
      note: normalizeNote(workspace.note),
      cardFace: normalizeCardFace(workspace.cardFace),
      tileSize: normalizeTileSize(workspace.tileSize),
      createdAt: workspaceTime.timestamp,
      createdAtOrigin: workspaceTime.origin,
      sites: Array.isArray(workspace.sites)
        ? workspace.sites.map((site) => normalizeSite(site, legacyAt)).filter(Boolean)
        : [],
    };
  });
  const normalized = {
    schemaVersion: CONTEXT_STATE_SCHEMA_VERSION,
    contextTimeMigratedAt,
    lastRecordedAt: contextTimeMigratedAt,
    workspaces,
  };
  normalized.lastRecordedAt = getLatestRecordedAt(normalized, contextTimeMigratedAt);
  return normalized;
}

function normalizeSite(site, fallbackAt = null) {
  if (!site || !site.url) return null;

  const url = normalizeUrl(site.url);
  if (!url) return null;
  const name = String(site.name || getSiteFallbackName(url)).trim() || getSiteFallbackName(url);
  const faviconUrl = normalizeExplicitFaviconUrl(site.faviconUrl);
  const migrationAt = fallbackAt
    ? new Date(Date.parse(fallbackAt) + 1).toISOString()
    : getMigrationAt(null);
  const siteTime = normalizeEntityTime(site.addedAt, site.addedAtOrigin, fallbackAt || getLegacyAt(migrationAt));
  return {
    id: site.id || createId("site"),
    name,
    url,
    addedAt: siteTime.timestamp,
    addedAtOrigin: siteTime.origin,
    ...(faviconUrl ? { faviconUrl } : {}),
  };
}

function getWorkspace(workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId);
}

export {
  STORAGE_KEY,
  UI_STORAGE_KEY,
  getState,
  getStateInitializationError,
  getUiState,
  getWorkspace,
  initializeState,
  initializeUiState,
  loadStateForUpdate,
  normalizeSite,
  normalizeState,
  normalizeTileSize,
  normalizeUiState,
  saveExpandedWorkspaceId,
  saveState,
  setState,
};
