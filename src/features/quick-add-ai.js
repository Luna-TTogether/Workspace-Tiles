const MAX_WORKSPACE_CANDIDATES = 20;
const MAX_REPRESENTATIVE_SITES = 20;
const RECOMMENDED_CONFIDENCE = new Set(["high", "medium"]);

function getHostname(value) {
  try {
    return new URL(String(value || "")).hostname.toLocaleLowerCase();
  } catch {
    return "";
  }
}

function createSearchTerms(value) {
  const normalized = String(value || "").toLocaleLowerCase();
  const words = normalized.match(/[\p{L}\p{N}]{2,}/gu) || [];
  const terms = new Set(words.filter((word) => /[^\u3400-\u9fff]/u.test(word) ? word.length >= 3 : false));
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/gu) || [];
  chineseRuns.forEach((run) => {
    for (let index = 0; index < run.length - 1; index += 1) terms.add(run.slice(index, index + 2));
  });
  return [...terms].slice(0, 24);
}

function getWorkspaceSearchText(workspace) {
  return [
    workspace.name,
    ...(Array.isArray(workspace.sites) ? workspace.sites.flatMap((site) => [site.name, getHostname(site.url)]) : []),
  ].join(" ").toLocaleLowerCase();
}

function selectWorkspaceCandidates(workspaces, recentWorkspaceIds, page, limit = MAX_WORKSPACE_CANDIDATES) {
  const recentRank = new Map((Array.isArray(recentWorkspaceIds) ? recentWorkspaceIds : []).map((id, index) => [id, index]));
  const pageHostname = String(page?.url?.hostname || getHostname(page?.url)).toLocaleLowerCase();
  const terms = createSearchTerms([page?.title, page?.heading, page?.description, pageHostname].join(" "));

  return (Array.isArray(workspaces) ? workspaces : [])
    .map((workspace, index) => {
      const sites = Array.isArray(workspace.sites) ? workspace.sites : [];
      const sameHostname = Boolean(pageHostname && sites.some((site) => getHostname(site.url) === pageHostname));
      const searchText = getWorkspaceSearchText(workspace);
      const termMatches = terms.reduce((count, term) => count + Number(searchText.includes(term)), 0);
      const rank = recentRank.get(workspace.id);
      const score = (sameHostname ? 10_000 : 0)
        + (Number.isInteger(rank) ? 1_000 - rank : 0)
        + termMatches * 100;
      return { workspace, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(({ workspace }) => workspace);
}

function createWorkspaceSummary(workspace) {
  return {
    id: String(workspace.id),
    name: String(workspace.name || "").trim().slice(0, 60),
    sites: (Array.isArray(workspace.sites) ? workspace.sites : [])
      .slice(-MAX_REPRESENTATIVE_SITES)
      .map((site) => ({
        name: String(site.name || "").trim().slice(0, 80),
        hostname: getHostname(site.url).slice(0, 253),
      })),
  };
}

function buildQuickAddRecommendationInput(page, workspaces, recentWorkspaceIds) {
  return {
    page,
    workspaces: selectWorkspaceCandidates(workspaces, recentWorkspaceIds, page)
      .map(createWorkspaceSummary),
  };
}

function normalizeLanguage(value) {
  return String(value || "").trim().toLocaleLowerCase().split(/[-_]/u)[0];
}

function isSuggestedSiteNameValid(name, siteLanguage, pageLanguage) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName || normalizedName.length > 80) return false;
  const suggestedLanguage = normalizeLanguage(siteLanguage);
  const sourceLanguage = normalizeLanguage(pageLanguage);
  return !suggestedLanguage || !sourceLanguage || suggestedLanguage === sourceLanguage;
}

function applyQuickAddAiResult(current, data, pageLanguage = "") {
  const next = { ...current };
  if (!current.nameLocked && isSuggestedSiteNameValid(data?.siteName, data?.siteLanguage, pageLanguage)) {
    next.name = String(data.siteName).trim();
    next.nameSource = "ai_recommended";
  }
  if (
    !current.workspaceLocked
    && RECOMMENDED_CONFIDENCE.has(data?.confidence)
    && current.candidateWorkspaceIds.includes(data?.workspaceId)
  ) {
    next.workspaceId = data.workspaceId;
    next.workspaceSource = "ai_recommended";
    next.reason = String(data.reason || "").trim().slice(0, 120);
  }
  return next;
}

export {
  MAX_REPRESENTATIVE_SITES,
  MAX_WORKSPACE_CANDIDATES,
  RECOMMENDED_CONFIDENCE,
  applyQuickAddAiResult,
  buildQuickAddRecommendationInput,
  createSearchTerms,
  createWorkspaceSummary,
  isSuggestedSiteNameValid,
  selectWorkspaceCandidates,
};
