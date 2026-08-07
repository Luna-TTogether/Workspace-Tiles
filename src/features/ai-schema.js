const AI_SCHEMA_VERSION = 1;
const AI_TASKS = new Set(["recommend_existing_workspace", "suggest_workspace_draft"]);
const AI_CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);
const AI_ERROR_CODES = new Set([
  "AI_CONSENT_REQUIRED",
  "AI_AUTH_REQUIRED",
  "AI_UNAUTHORIZED",
  "AI_QUOTA_EXCEEDED",
  "AI_INVALID_REQUEST",
  "AI_PAYLOAD_TOO_LARGE",
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_STORAGE_ERROR",
]);

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isLimitedString(value, maxLength, { required = false } = {}) {
  return typeof value === "string" && value.length <= maxLength && (!required || Boolean(value.trim()));
}

function validatePageInput(page) {
  return isPlainObject(page)
    && isLimitedString(page.language || "", 35)
    && isLimitedString(page.title || "", 300)
    && isLimitedString(page.heading || "", 300)
    && isLimitedString(page.description || "", 500)
    && Array.isArray(page.headings)
    && page.headings.length <= 8
    && page.headings.every((heading) => isLimitedString(heading, 300))
    && isLimitedString(page.excerpt || "", 2_000)
    && isPlainObject(page.url)
    && ["http:", "https:"].includes(page.url.protocol)
    && isLimitedString(page.url.hostname, 253, { required: true })
    && isLimitedString(page.url.pathname || "/", 2_000);
}

function validateRecommendInput(input) {
  if (!isPlainObject(input) || !validatePageInput(input.page)) return false;
  if (!Array.isArray(input.workspaces) || !input.workspaces.length || input.workspaces.length > 20) return false;
  const ids = new Set();
  return input.workspaces.every((workspace) => {
    if (!isPlainObject(workspace) || !isLimitedString(workspace.id, 120, { required: true }) || ids.has(workspace.id)) {
      return false;
    }
    ids.add(workspace.id);
    return isLimitedString(workspace.name, 60, { required: true })
      && Array.isArray(workspace.sites)
      && workspace.sites.length <= 20
      && workspace.sites.every((site) => isPlainObject(site)
        && isLimitedString(site.name || "", 80)
        && isLimitedString(site.hostname || "", 253));
  });
}

function validateDraftInput(input) {
  if (!isPlainObject(input) || !Array.isArray(input.tabs) || !input.tabs.length || input.tabs.length > 60) return false;
  const keys = new Set();
  return input.tabs.every((tab, index) => {
    if (!isPlainObject(tab) || !isLimitedString(tab.key, 160, { required: true }) || keys.has(tab.key)) return false;
    keys.add(tab.key);
    return isLimitedString(tab.title || "", 300)
      && isLimitedString(tab.language || "", 35)
      && typeof tab.isActive === "boolean"
      && ["http:", "https:"].includes(tab.protocol)
      && isLimitedString(tab.hostname, 253, { required: true })
      && isLimitedString(tab.pathname || "/", 2_000)
      && Number.isInteger(tab.position)
      && tab.position >= 0
      && tab.position <= Math.max(500, index + 500);
  });
}

function validateAiTaskInput(task, input) {
  if (task === "recommend_existing_workspace") return validateRecommendInput(input);
  if (task === "suggest_workspace_draft") return validateDraftInput(input);
  return false;
}

function validateRecommendResult(data, input) {
  const workspaceIds = new Set(input.workspaces.map((workspace) => workspace.id));
  return isPlainObject(data)
    && isLimitedString(data.siteName, 80, { required: true })
    && isLimitedString(data.siteLanguage || "", 35)
    && workspaceIds.has(data.workspaceId)
    && AI_CONFIDENCE_LEVELS.has(data.confidence)
    && isLimitedString(data.reason || "", 120);
}

function validateDraftResult(data, input) {
  if (!isPlainObject(data)) return false;
  if (data.kind === "no_suggestion") return isLimitedString(data.reason || "", 120);
  if (data.kind !== "workspace_draft"
    || !isLimitedString(data.suggestedName, 60, { required: true })
    || !AI_CONFIDENCE_LEVELS.has(data.confidence)
    || !isLimitedString(data.reason || "", 120)
    || !Array.isArray(data.selectedTabs)
    || data.selectedTabs.length < 2
    || data.selectedTabs.length > input.tabs.length) return false;
  const inputKeys = new Set(input.tabs.map((tab) => tab.key));
  const selectedKeys = new Set();
  return data.selectedTabs.every((tab) => {
    if (!isPlainObject(tab) || !inputKeys.has(tab.key) || selectedKeys.has(tab.key)) return false;
    selectedKeys.add(tab.key);
    return isLimitedString(tab.suggestedSiteName, 80, { required: true })
      && isLimitedString(tab.reason || "", 120);
  });
}

function validateAiResponseEnvelope(value, task, input) {
  if (!isPlainObject(value)
    || !isLimitedString(value.requestId, 120, { required: true })
    || !isPlainObject(value.usage)
    || !Number.isInteger(value.usage.remaining)
    || !Number.isInteger(value.usage.limit)
    || !isLimitedString(value.usage.resetAt, 40, { required: true })
    || !Number.isFinite(Date.parse(value.usage.resetAt))) return false;
  if (task === "recommend_existing_workspace") return validateRecommendResult(value.data, input);
  if (task === "suggest_workspace_draft") return validateDraftResult(value.data, input);
  return false;
}

export {
  AI_CONFIDENCE_LEVELS,
  AI_ERROR_CODES,
  AI_SCHEMA_VERSION,
  AI_TASKS,
  validateAiResponseEnvelope,
  validateAiTaskInput,
};
