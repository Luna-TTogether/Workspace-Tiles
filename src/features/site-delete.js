import { normalizeState } from "../core/state.js";

function createSiteDeleteError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function removeSiteForUndo(sourceState, workspaceId, siteId) {
  const state = normalizeState(sourceState);
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw createSiteDeleteError("WORKSPACE_NOT_FOUND");

  const siteIndex = workspace.sites.findIndex((item) => item.id === siteId);
  if (siteIndex < 0) throw createSiteDeleteError("SITE_NOT_FOUND");

  const [site] = workspace.sites.splice(siteIndex, 1);
  return {
    state,
    deletion: {
      workspaceId,
      site,
      siteIndex,
    },
  };
}

function restoreDeletedSiteData(sourceState, deletion) {
  const state = normalizeState(sourceState);
  const workspace = state.workspaces.find((item) => item.id === deletion?.workspaceId);
  if (!workspace) throw createSiteDeleteError("WORKSPACE_NOT_FOUND");
  if (!deletion?.site?.id) throw createSiteDeleteError("SITE_NOT_FOUND");

  if (!workspace.sites.some((item) => item.id === deletion.site.id)) {
    const insertIndex = Math.max(0, Math.min(Number(deletion.siteIndex) || 0, workspace.sites.length));
    workspace.sites.splice(insertIndex, 0, deletion.site);
  }
  return { state, workspace, site: deletion.site };
}

export { removeSiteForUndo, restoreDeletedSiteData };
