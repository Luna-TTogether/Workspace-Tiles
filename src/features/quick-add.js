import { STORAGE_KEY, normalizeState } from "../core/state.js";
import { normalizeExplicitFaviconUrl } from "../core/favicon-candidates.js";
import { createId, getSiteFallbackName, normalizeUrl } from "../core/utils.js";
import { createRecordedSiteFields } from "../core/context-time.js";
import { readLocalStorage, writeLocalStorage } from "../core/storage.js";

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

function normalizeQuickAddDraftPage(page) {
  const rawUrl = String(page?.pendingUrl || page?.url || "").trim();
  const url = normalizeUrl(rawUrl);
  if (!url) throw createQuickAddError("PAGE_UNAVAILABLE", "Current page has no saveable URL");

  const title = String(page?.title || "").trim();
  const faviconUrl = normalizeExplicitFaviconUrl(page?.favIconUrl);
  return {
    name: title.slice(0, 80) || getSiteFallbackName(url),
    url,
    ...(faviconUrl ? { faviconUrl } : {}),
  };
}

function normalizeQuickAddPage(page, timeFields = null) {
  const draft = normalizeQuickAddDraftPage(page);
  return {
    id: createId("site"),
    ...draft,
    ...(timeFields || {}),
  };
}

function prepareQuickAddDraftData(sourceState, recentWorkspaceIds, page) {
  const state = normalizeState(sourceState);
  const recentIds = normalizeRecentWorkspaceIds(recentWorkspaceIds, state.workspaces);
  const draftPage = normalizeQuickAddDraftPage(page);
  const defaultWorkspace = getDefaultWorkspace(state.workspaces, recentIds);
  return {
    status: defaultWorkspace ? "ready" : "empty",
    page: draftPage,
    workspaces: state.workspaces,
    recentWorkspaceIds: recentIds,
    defaultWorkspace,
  };
}

function commitQuickAddData(sourceState, { workspaceId, name, page }, { now = Date.now() } = {}) {
  const state = normalizeState(sourceState, { now });
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw createQuickAddError("WORKSPACE_NOT_FOUND", "Target workspace no longer exists");

  const site = normalizeQuickAddPage(page, createRecordedSiteFields(state, now));
  site.name = String(name || "").trim() || getSiteFallbackName(site.url);
  workspace.sites.push(site);
  return { state, site, workspace };
}

function addPageToQuickAddData(sourceState, recentWorkspaceIds, page) {
  const state = normalizeState(sourceState);
  const recentIds = normalizeRecentWorkspaceIds(recentWorkspaceIds, state.workspaces);
  const workspace = getDefaultWorkspace(state.workspaces, recentIds);
  if (!workspace) return { status: "empty", state, recentWorkspaceIds: [] };

  const site = normalizeQuickAddPage(page, createRecordedSiteFields(state));
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

async function loadQuickAddData({ cleanRecent = true } = {}) {
  const stored = await readLocalStorage([STORAGE_KEY, RECENT_WORKSPACES_STORAGE_KEY]);
  const state = normalizeState(stored[STORAGE_KEY]);
  const storedRecentIds = stored[RECENT_WORKSPACES_STORAGE_KEY];
  const recentWorkspaceIds = normalizeRecentWorkspaceIds(storedRecentIds, state.workspaces);

  if (cleanRecent && JSON.stringify(storedRecentIds || []) !== JSON.stringify(recentWorkspaceIds)) {
    await writeLocalStorage({ [RECENT_WORKSPACES_STORAGE_KEY]: recentWorkspaceIds });
  }
  return { state, recentWorkspaceIds };
}

async function quickAddCurrentPage(page) {
  const current = await loadQuickAddData();
  const result = addPageToQuickAddData(current.state, current.recentWorkspaceIds, page);
  if (result.status === "empty") return result;

  await writeLocalStorage({
    [STORAGE_KEY]: result.state,
    [RECENT_WORKSPACES_STORAGE_KEY]: result.recentWorkspaceIds,
  });
  return result;
}

async function prepareQuickAddDraft(page) {
  const current = await loadQuickAddData({ cleanRecent: false });
  return prepareQuickAddDraftData(current.state, current.recentWorkspaceIds, page);
}

async function commitQuickAdd(input, {
  now = Date.now(),
  loadData = loadQuickAddData,
  writeStorage = writeLocalStorage,
} = {}) {
  const current = await loadData({ cleanRecent: false });
  const result = commitQuickAddData(current.state, input, { now });
  await writeStorage({ [STORAGE_KEY]: result.state });

  const recentWorkspaceIds = touchRecentWorkspace(
    current.recentWorkspaceIds,
    result.workspace.id,
    result.state.workspaces,
  );
  let recentWorkspaceWriteFailed = false;
  try {
    await writeStorage({ [RECENT_WORKSPACES_STORAGE_KEY]: recentWorkspaceIds });
  } catch {
    recentWorkspaceWriteFailed = true;
  }
  return { ...result, recentWorkspaceIds, recentWorkspaceWriteFailed };
}

async function updateQuickAddedSite(input) {
  const current = await loadQuickAddData();
  const result = updateQuickAddedSiteData(current.state, current.recentWorkspaceIds, input);
  await writeLocalStorage({
    [STORAGE_KEY]: result.state,
    [RECENT_WORKSPACES_STORAGE_KEY]: result.recentWorkspaceIds,
  });
  return result;
}

async function deleteQuickAddedSite(siteId) {
  const current = await loadQuickAddData();
  const result = deleteQuickAddedSiteData(current.state, siteId);
  await writeLocalStorage({ [STORAGE_KEY]: result.state });
  return result;
}

export {
  MAX_RECENT_WORKSPACES,
  RECENT_WORKSPACES_STORAGE_KEY,
  addPageToQuickAddData,
  commitQuickAdd,
  commitQuickAddData,
  deleteQuickAddedSite,
  deleteQuickAddedSiteData,
  getDefaultWorkspace,
  loadQuickAddData,
  normalizeQuickAddPage,
  normalizeQuickAddDraftPage,
  normalizeRecentWorkspaceIds,
  orderWorkspacesByRecent,
  prepareQuickAddDraft,
  prepareQuickAddDraftData,
  quickAddCurrentPage,
  touchRecentWorkspace,
  updateQuickAddedSite,
  updateQuickAddedSiteData,
};
