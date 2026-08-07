import * as i18n from "./src/core/i18n.js";
import { renderFavicon } from "./src/core/favicon.js";
import { getChromeApi, getDomain } from "./src/core/utils.js";
import {
  commitQuickAdd,
  orderWorkspacesByRecent,
  prepareQuickAddDraft,
} from "./src/features/quick-add.js";
import {
  createSourceIdentity,
  findReusableWorkspaceDraft,
} from "./src/features/workspace-draft.js";

const t = (key, values) => i18n.t(key, values);

const root = document.getElementById("quickAddRoot");
const loadingView = document.getElementById("loadingView");
const editorView = document.getElementById("editorView");
const emptyView = document.getElementById("emptyView");
const stateView = document.getElementById("stateView");
const form = document.getElementById("quickAddForm");
const siteIcon = document.getElementById("siteIcon");
const nameInput = document.getElementById("siteName");
const siteDomain = document.getElementById("siteDomain");
const workspaceSelect = document.getElementById("workspaceSelect");
const editorError = document.getElementById("editorError");
const createFromWindowButton = document.getElementById("createFromWindowButton");
const cancelButton = document.getElementById("cancelButton");
const saveButton = document.getElementById("saveButton");
const closeButton = document.getElementById("closeButton");
const emptyCloseButton = document.getElementById("emptyCloseButton");
const emptySiteIcon = document.getElementById("emptySiteIcon");
const emptySiteName = document.getElementById("emptySiteName");
const emptySiteDomain = document.getElementById("emptySiteDomain");
const emptyError = document.getElementById("emptyError");
const createEmptyWorkspaceButton = document.getElementById("createEmptyWorkspaceButton");
const createWindowWorkspaceButton = document.getElementById("createWindowWorkspaceButton");
const stateCloseButton = document.getElementById("stateCloseButton");
const stateTitle = document.getElementById("stateTitle");
const stateDescription = document.getElementById("stateDescription");
const stateError = document.getElementById("stateError");
const stateActions = document.getElementById("stateActions");

let session = null;
let activeView = "loading";
let popupActive = true;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", handleGlobalKeydown);
window.addEventListener("pagehide", stopPendingWork);
closeButton.addEventListener("click", closePopup);
emptyCloseButton.addEventListener("click", closePopup);
stateCloseButton.addEventListener("click", closePopup);
cancelButton.addEventListener("click", closePopup);
form.addEventListener("submit", saveCurrentPage);
workspaceSelect.addEventListener("change", handleWorkspaceChange);
createFromWindowButton.addEventListener("click", openCurrentWindowWorkspace);
createWindowWorkspaceButton.addEventListener("click", openCurrentWindowWorkspace);
createEmptyWorkspaceButton.addEventListener("click", () => openNewWorkspace(false));

async function init() {
  await i18n.init();
  showView("loading");
  await loadDraft();
}

async function loadDraft() {
  setRootBusy(true);
  try {
    const tab = await getActiveTab();
    const draft = await prepareQuickAddDraft(tab);
    session = {
      tab,
      page: draft.page,
      workspaces: draft.workspaces,
      recentWorkspaceIds: draft.recentWorkspaceIds,
      selectedWorkspaceId: draft.defaultWorkspace?.id || null,
      name: draft.page.name,
      reusableDraft: null,
    };

    if (draft.status === "empty") {
      showEmptyState();
      return;
    }

    void detectReusableDraft();
    showEditor();
  } catch (error) {
    if (error?.code === "PAGE_UNAVAILABLE") showUnavailableState();
    else showRetryState();
  } finally {
    setRootBusy(false);
  }
}

function getActiveTab() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.tabs?.query) return Promise.resolve({ title: document.title, url: window.location.href });
  return new Promise((resolve, reject) => {
    chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      const tab = Array.isArray(tabs) ? tabs[0] : null;
      if (!tab) {
        const error = new Error("Active tab unavailable");
        error.code = "PAGE_UNAVAILABLE";
        reject(error);
        return;
      }
      resolve(tab);
    });
  });
}

function showEditor() {
  renderFavicon(siteIcon, session.page);
  nameInput.value = session.name;
  siteDomain.textContent = getDomain(session.page.url);
  renderWorkspaceOptions();
  setMessage(editorError);
  showView("editor");
  requestAnimationFrame(() => nameInput.focus());
}

function renderWorkspaceOptions() {
  const ordered = orderWorkspacesByRecent(session.workspaces, session.recentWorkspaceIds);
  workspaceSelect.replaceChildren(...ordered.map((workspace) => {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = workspace.name;
    return option;
  }));
  workspaceSelect.value = session.selectedWorkspaceId || "";
  saveButton.disabled = !session.selectedWorkspaceId;
}

function handleWorkspaceChange() {
  if (!session) return;
  session.selectedWorkspaceId = workspaceSelect.value;
  setMessage(editorError);
  saveButton.disabled = !session.selectedWorkspaceId;
}

async function saveCurrentPage(event) {
  event.preventDefault();
  if (!session || saveButton.disabled || !session.selectedWorkspaceId) return;
  setMessage(editorError);
  setButtonLoading(saveButton, true, t("保存中"));
  setEditorDisabled(true);
  try {
    await commitQuickAdd({
      workspaceId: session.selectedWorkspaceId,
      name: nameInput.value,
      page: session.page,
    });
    window.setTimeout(closePopup, 120);
  } catch (error) {
    if (error?.code === "WORKSPACE_NOT_FOUND") {
      await refreshMissingWorkspace();
      setMessage(editorError, t("工作区已不存在。"));
    } else {
      setMessage(editorError, t("无法保存网站。请重试。"));
    }
    setButtonLoading(saveButton, false);
    setEditorDisabled(false);
  }
}

async function refreshMissingWorkspace() {
  try {
    const latest = await prepareQuickAddDraft(session.tab);
    session.workspaces = latest.workspaces;
    session.recentWorkspaceIds = latest.recentWorkspaceIds;
    session.selectedWorkspaceId = null;
    renderWorkspaceOptions();
  } catch {
    session.selectedWorkspaceId = null;
  }
}

function showEmptyState() {
  renderFavicon(emptySiteIcon, session.page);
  emptySiteName.textContent = session.page.name;
  emptySiteDomain.textContent = getDomain(session.page.url);
  showView("empty");
  requestAnimationFrame(() => createWindowWorkspaceButton.focus());
}

async function detectReusableDraft() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.permissions?.contains || !chromeApi?.tabs?.query) return;
  const hasTabs = await new Promise((resolve) => {
    chromeApi.permissions.contains({ permissions: ["tabs"] }, (granted) => resolve(Boolean(granted)));
  });
  if (!hasTabs || !popupActive) return;
  const tabs = await new Promise((resolve) => {
    chromeApi.tabs.query({ currentWindow: true }, (items) => resolve(chromeApi.runtime?.lastError ? [] : items || []));
  });
  const windowId = tabs.find((tab) => Number.isInteger(tab.windowId))?.windowId;
  if (!Number.isInteger(windowId)) return;
  const identity = await createSourceIdentity(tabs.map((tab) => tab.pendingUrl || tab.url));
  const reusable = await findReusableWorkspaceDraft(windowId, identity.sourceUrlHashes);
  if (!reusable || !popupActive) return;
  session.reusableDraft = reusable;
  createFromWindowButton.querySelector(".button-label").textContent = t("查看建议");
}

async function openCurrentWindowWorkspace() {
  if (session?.reusableDraft) {
    openExtensionPage(`newtab.html?workspaceDraft=${encodeURIComponent(session.reusableDraft.id)}`);
    return;
  }
  const errorElement = activeView === "empty" ? emptyError : editorError;
  setMessage(errorElement);
  createFromWindowButton.disabled = true;
  createWindowWorkspaceButton.disabled = true;
  const granted = await requestTabsPermission();
  createFromWindowButton.disabled = false;
  createWindowWorkspaceButton.disabled = false;
  if (!granted || !popupActive) {
    if (popupActive) {
      setMessage(errorElement, activeView === "empty"
        ? t("需要标签页访问权限才能从当前窗口新建 Workspace。你仍可新建空 Workspace。")
        : t("未获得标签页访问权限，你仍可保存到已有 Workspace。"));
    }
    return;
  }
  openNewWorkspace(true);
}

function requestTabsPermission() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.permissions?.request) return Promise.resolve(true);
  return new Promise((resolve) => {
    chromeApi.permissions.request({ permissions: ["tabs"] }, (granted) => {
      resolve(!chromeApi.runtime?.lastError && Boolean(granted));
    });
  });
}

function openNewWorkspace(selectTabs) {
  openExtensionPage(`newtab.html?createWorkspace=1${selectTabs ? "&selectTabs=1" : ""}`);
}

function openExtensionPage(path) {
  const chromeApi = getChromeApi();
  const url = chromeApi?.runtime?.getURL
    ? chromeApi.runtime.getURL(path)
    : new URL(path, window.location.href).href;
  if (chromeApi?.tabs?.create) chromeApi.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
  closePopup();
}

function showUnavailableState() {
  showState({
    title: t("无法添加网站"),
    description: t("无法读取当前页面，请切换到普通网页后重试。"),
  });
}

function showRetryState() {
  showState({
    title: t("无法添加网站"),
    description: t("无法添加网站，请重试。"),
    actionLabel: t("重试"),
    onAction: loadDraft,
  });
}

function showState({ title, description, actionLabel = "", onAction = null }) {
  stateTitle.textContent = title;
  stateDescription.textContent = description;
  setMessage(stateError);
  stateActions.replaceChildren();
  stateActions.append(createActionButton(
    actionLabel || t("关闭"),
    actionLabel ? "primary" : "secondary",
    onAction || closePopup,
  ));
  showView("state");
  requestAnimationFrame(() => stateActions.querySelector("button")?.focus());
}

function createActionButton(label, variant, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${variant}`;
  const buttonLabel = document.createElement("span");
  buttonLabel.className = "button-label";
  buttonLabel.textContent = label;
  button.append(buttonLabel);
  button.addEventListener("click", onClick);
  return button;
}

function setEditorDisabled(disabled) {
  nameInput.disabled = disabled;
  workspaceSelect.disabled = disabled;
  createFromWindowButton.disabled = disabled;
  cancelButton.disabled = disabled;
  if (!saveButton.classList.contains("is-loading")) saveButton.disabled = disabled || !session.selectedWorkspaceId;
}

function setButtonLoading(button, loading, loadingLabel = "") {
  const label = button.querySelector(".button-label");
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = label.textContent;
  button.classList.toggle("is-loading", loading);
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  label.textContent = loading ? loadingLabel : button.dataset.defaultLabel;
}

function setMessage(element, message = "") {
  element.textContent = message;
  element.hidden = !message;
}

function setRootBusy(busy) {
  root.setAttribute("aria-busy", String(busy));
}

function showView(view) {
  activeView = view;
  loadingView.hidden = view !== "loading";
  editorView.hidden = view !== "editor";
  emptyView.hidden = view !== "empty";
  stateView.hidden = view !== "state";
}

function handleGlobalKeydown(event) {
  if (event.key === "Tab") {
    trapPopupFocus(event);
    return;
  }
  if (event.key !== "Escape") return;
  event.preventDefault();
  closePopup();
}

function trapPopupFocus(event) {
  const focusables = getActiveFocusables().filter((element) => !element.disabled && !element.hidden && element.offsetParent !== null);
  if (!focusables.length) return;
  const currentIndex = focusables.indexOf(document.activeElement);
  const direction = event.shiftKey ? -1 : 1;
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + focusables.length) % focusables.length;
  event.preventDefault();
  focusables[nextIndex].focus();
}

function getActiveFocusables() {
  if (activeView === "editor") return [nameInput, workspaceSelect, createFromWindowButton, cancelButton, saveButton, closeButton];
  if (activeView === "empty") return [createEmptyWorkspaceButton, createWindowWorkspaceButton, emptyCloseButton];
  if (activeView === "state") return [...stateActions.querySelectorAll("button"), stateCloseButton];
  return [];
}

function stopPendingWork() {
  popupActive = false;
}

function closePopup() {
  stopPendingWork();
  window.close();
}
