import { STORAGE_KEY, normalizeState } from "./state.js";
import { createId, getChromeApi, getSiteFallbackName, normalizeUrl } from "./utils.js";

const RECENT_WORKSPACES_STORAGE_KEY = "workspaceTilesRecentWorkspaceIds";
const MAX_RECENT_WORKSPACES = 5;

function createQuickAddError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeRecentWorkspaceIds(value, workspaces, limit = MAX_RECENT_WORKSPACES) {
  const validIds = new Set(workspaces.map((workspace) => workspace.id));
  const seen = new Set();
  const normalized = [];

  if (!Array.isArray(value)) return normalized;
  value.forEach((workspaceId) => {
    if (
      normalized.length >= limit
      || typeof workspaceId !== "string"
      || !validIds.has(workspaceId)
      || seen.has(workspaceId)
    ) return;
    seen.add(workspaceId);
    normalized.push(workspaceId);
  });
  return normalized;
}

function touchRecentWorkspace(recentWorkspaceIds, workspaceId, workspaces) {
  return normalizeRecentWorkspaceIds(
    [workspaceId, ...recentWorkspaceIds.filter((id) => id !== workspaceId)],
    workspaces,
  );
}

function orderWorkspacesByRecent(workspaces, recentWorkspaceIds) {
  const recentIds = normalizeRecentWorkspaceIds(recentWorkspaceIds, workspaces);
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const recentSet = new Set(recentIds);
  return [
    ...recentIds.map((workspaceId) => byId.get(workspaceId)),
    ...workspaces.filter((workspace) => !recentSet.has(workspace.id)),
  ];
}

function getDefaultWorkspace(workspaces, recentWorkspaceIds) {
  return orderWorkspacesByRecent(workspaces, recentWorkspaceIds)[0] || null;
}

function normalizeQuickAddPage(page) {
  const rawUrl = String(page?.pendingUrl || page?.url || "").trim();
  const url = normalizeUrl(rawUrl);
  if (!url) throw createQuickAddError("PAGE_UNAVAILABLE", "Current page has no saveable URL");

  const title = String(page?.title || "").trim();
  return {
    id: createId("site"),
    name: title || getSiteFallbackName(url),
    url,
  };
}

function addPageToQuickAddData(sourceState, recentWorkspaceIds, page) {
  const state = normalizeState(sourceState);
  const recentIds = normalizeRecentWorkspaceIds(recentWorkspaceIds, state.workspaces);
  const workspace = getDefaultWorkspace(state.workspaces, recentIds);
  if (!workspace) return { status: "empty", state, recentWorkspaceIds: [] };

  const site = normalizeQuickAddPage(page);
  workspace.sites.push(site);
  return {
    status: "added",
    state,
    site,
    workspace,
    recentWorkspaceIds: touchRecentWorkspace(recentIds, workspace.id, state.workspaces),
  };
}

function findSiteLocation(state, siteId) {
  for (const workspace of state.workspaces) {
    const siteIndex = workspace.sites.findIndex((site) => site.id === siteId);
    if (siteIndex >= 0) return { workspace, siteIndex, site: workspace.sites[siteIndex] };
  }
  return null;
}

function updateQuickAddedSiteData(sourceState, recentWorkspaceIds, { siteId, name, workspaceId }) {
  const state = normalizeState(sourceState);
  const location = findSiteLocation(state, siteId);
  if (!location) throw createQuickAddError("SITE_NOT_FOUND", "Quick-added site no longer exists");

  const targetWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!targetWorkspace) throw createQuickAddError("WORKSPACE_NOT_FOUND", "Target workspace no longer exists");

  const nextSite = {
    ...location.site,
    name: String(name || "").trim() || getSiteFallbackName(location.site.url),
  };

  if (targetWorkspace.id === location.workspace.id) {
    location.workspace.sites[location.siteIndex] = nextSite;
  } else {
    location.workspace.sites.splice(location.siteIndex, 1);
    targetWorkspace.sites.push(nextSite);
  }

  const recentIds = normalizeRecentWorkspaceIds(recentWorkspaceIds, state.workspaces);
  return {
    state,
    site: nextSite,
    workspace: targetWorkspace,
    recentWorkspaceIds: touchRecentWorkspace(recentIds, targetWorkspace.id, state.workspaces),
  };
}

function deleteQuickAddedSiteData(sourceState, siteId) {
  const state = normalizeState(sourceState);
  const location = findSiteLocation(state, siteId);
  if (!location) throw createQuickAddError("SITE_NOT_FOUND", "Quick-added site no longer exists");
  location.workspace.sites.splice(location.siteIndex, 1);
  return { state, site: location.site, workspace: location.workspace };
}

function readStorage(keys) {
  const chromeApi = getChromeApi();
  if (!chromeApi?.storage?.local) {
    const result = {};
    keys.forEach((key) => {
      try {
        result[key] = JSON.parse(localStorage.getItem(key));
      } catch {
        result[key] = null;
      }
    });
    return Promise.resolve(result);
  }

  return new Promise((resolve, reject) => {
    chromeApi.storage.local.get(keys, (result) => {
      if (chromeApi.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function writeStorage(values) {
  const chromeApi = getChromeApi();
  if (!chromeApi?.storage?.local) {
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    chromeApi.storage.local.set(values, () => {
      if (chromeApi.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
      else resolve();
    });
  });
}

async function loadQuickAddData({ cleanRecent = true } = {}) {
  const stored = await readStorage([STORAGE_KEY, RECENT_WORKSPACES_STORAGE_KEY]);
  const state = normalizeState(stored[STORAGE_KEY]);
  const storedRecentIds = stored[RECENT_WORKSPACES_STORAGE_KEY];
  const recentWorkspaceIds = normalizeRecentWorkspaceIds(storedRecentIds, state.workspaces);

  if (cleanRecent && JSON.stringify(storedRecentIds || []) !== JSON.stringify(recentWorkspaceIds)) {
    await writeStorage({ [RECENT_WORKSPACES_STORAGE_KEY]: recentWorkspaceIds });
  }
  return { state, recentWorkspaceIds };
}

async function quickAddCurrentPage(page) {
  const current = await loadQuickAddData();
  const result = addPageToQuickAddData(current.state, current.recentWorkspaceIds, page);
  if (result.status === "empty") return result;

  await writeStorage({
    [STORAGE_KEY]: result.state,
    [RECENT_WORKSPACES_STORAGE_KEY]: result.recentWorkspaceIds,
  });
  return result;
}

async function updateQuickAddedSite(input) {
  const current = await loadQuickAddData();
  const result = updateQuickAddedSiteData(current.state, current.recentWorkspaceIds, input);
  await writeStorage({
    [STORAGE_KEY]: result.state,
    [RECENT_WORKSPACES_STORAGE_KEY]: result.recentWorkspaceIds,
  });
  return result;
}

async function deleteQuickAddedSite(siteId) {
  const current = await loadQuickAddData();
  const result = deleteQuickAddedSiteData(current.state, siteId);
  await writeStorage({ [STORAGE_KEY]: result.state });
  return result;
}

export {
  MAX_RECENT_WORKSPACES,
  RECENT_WORKSPACES_STORAGE_KEY,
  addPageToQuickAddData,
  deleteQuickAddedSite,
  deleteQuickAddedSiteData,
  getDefaultWorkspace,
  loadQuickAddData,
  normalizeQuickAddPage,
  normalizeRecentWorkspaceIds,
  orderWorkspacesByRecent,
  quickAddCurrentPage,
  touchRecentWorkspace,
  updateQuickAddedSite,
  updateQuickAddedSiteData,
};
