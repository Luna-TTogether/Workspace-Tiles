import { t } from "./i18n.js";
import { createId, getChromeApi, getSiteFallbackName, normalizeUrl } from "./utils.js";
import { normalizeCardFace, normalizeNote } from "./workspace-notes.js";

const STORAGE_KEY = "workspaceTilesState";
let state = { workspaces: [] };

function getState() {
  return state;
}

function setState(nextState) {
  state = normalizeState(nextState);
  return state;
}

function initializeState() {
  return new Promise((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      state = readLocalFallback();
      resolve(state);
      return;
    }

    chromeApi.storage.local.get(STORAGE_KEY, (result) => {
      state = normalizeState(result[STORAGE_KEY]);
      resolve(state);
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
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return { workspaces: [] };
  }
}

function normalizeState(value) {
  if (!value || !Array.isArray(value.workspaces)) {
    return { workspaces: [] };
  }

  return {
    workspaces: value.workspaces.map((workspace) => ({
      id: workspace.id || createId("workspace"),
      name: String(workspace.name || t("未命名工作区")).trim() || t("未命名工作区"),
      note: normalizeNote(workspace.note),
      cardFace: normalizeCardFace(workspace.cardFace),
      sites: Array.isArray(workspace.sites)
        ? workspace.sites.map((site) => normalizeSite(site)).filter(Boolean)
        : [],
    })),
  };
}

function normalizeSite(site) {
  if (!site || !site.url) return null;

  const url = normalizeUrl(site.url);
  if (!url) return null;
  const name = String(site.name || getSiteFallbackName(url)).trim() || getSiteFallbackName(url);
  return {
    id: site.id || createId("site"),
    name,
    url,
  };
}

function getWorkspace(workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId);
}

export {
  STORAGE_KEY,
  getState,
  getWorkspace,
  initializeState,
  loadStateForUpdate,
  normalizeSite,
  normalizeState,
  saveState,
  setState,
};
