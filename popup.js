import * as i18n from "./i18n.js";
import {
  deleteQuickAddedSite,
  orderWorkspacesByRecent,
  quickAddCurrentPage,
  updateQuickAddedSite,
} from "./quick-add.js";
import { getChromeApi, getFaviconUrl, getInitial, isHttpUrl } from "./utils.js";

const t = (key, values) => i18n.t(key, values);
const root = document.getElementById("quickAddRoot");
const loadingView = document.getElementById("loadingView");
const editorView = document.getElementById("editorView");
const stateView = document.getElementById("stateView");
const form = document.getElementById("quickAddForm");
const nameInput = document.getElementById("siteName");
const workspaceSelect = document.getElementById("workspaceSelect");
const siteIcon = document.getElementById("siteIcon");
const editorError = document.getElementById("editorError");
const removeButton = document.getElementById("removeButton");
const doneButton = document.getElementById("doneButton");
const closeButton = document.getElementById("closeButton");
const stateCloseButton = document.getElementById("stateCloseButton");
const stateTitle = document.getElementById("stateTitle");
const stateDescription = document.getElementById("stateDescription");
const stateError = document.getElementById("stateError");
const stateActions = document.getElementById("stateActions");

let session = null;
let activeView = "loading";

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", handleGlobalKeydown);
closeButton.addEventListener("click", closePopup);
stateCloseButton.addEventListener("click", closePopup);
removeButton.addEventListener("click", removeCurrentSite);
form.addEventListener("submit", saveChanges);

async function init() {
  await i18n.init();
  showView("loading");
  await addCurrentPage();
}

async function addCurrentPage() {
  setRootBusy(true);
  try {
    const tab = await getActiveTab();
    const result = await quickAddCurrentPage(tab);
    if (result.status === "empty") {
      showEmptyState();
      return;
    }

    session = {
      siteId: result.site.id,
      savedName: result.site.name,
      savedWorkspaceId: result.workspace.id,
      site: result.site,
      workspaces: result.state.workspaces,
      recentWorkspaceIds: result.recentWorkspaceIds,
    };
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
  if (!chromeApi?.tabs?.query) {
    return Promise.resolve({ title: document.title, url: window.location.href });
  }

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
  renderSiteIcon(session.site);
  nameInput.value = session.savedName;
  workspaceSelect.replaceChildren();
  orderWorkspacesByRecent(session.workspaces, session.recentWorkspaceIds).forEach((workspace) => {
    const option = document.createElement("option");
    option.value = workspace.id;
    option.textContent = workspace.name;
    option.selected = workspace.id === session.savedWorkspaceId;
    workspaceSelect.append(option);
  });
  setMessage(editorError);
  showView("editor");
  requestAnimationFrame(() => {
    nameInput.focus();
    nameInput.select();
  });
}

function renderSiteIcon(site) {
  siteIcon.replaceChildren();
  if (!isHttpUrl(site.url)) {
    siteIcon.textContent = getInitial(site.name);
    return;
  }

  const image = document.createElement("img");
  image.alt = "";
  image.src = getFaviconUrl(site.url);
  image.addEventListener("error", () => {
    siteIcon.textContent = getInitial(site.name);
  }, { once: true });
  siteIcon.append(image);
}

function showEmptyState() {
  showState({
    title: t("还没有工作区"),
    description: t("请先创建工作区，再回来保存当前页面。"),
    actionLabel: t("新建工作区"),
    onAction: openNewWorkspace,
  });
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
    onAction: addCurrentPage,
  });
}

function showState({ title, description, actionLabel = "", onAction = null }) {
  stateTitle.textContent = title;
  stateDescription.textContent = description;
  setMessage(stateError);
  stateActions.replaceChildren();
  if (actionLabel && onAction) {
    stateActions.append(createActionButton(actionLabel, "primary", onAction));
  } else {
    stateActions.append(createActionButton(t("关闭"), "secondary", closePopup));
  }
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

async function saveChanges(event) {
  event.preventDefault();
  if (!session || doneButton.disabled) return;
  setMessage(editorError);
  setButtonLoading(doneButton, true, t("保存中"));
  setEditorDisabled(true);

  try {
    await updateQuickAddedSite({
      siteId: session.siteId,
      name: nameInput.value,
      workspaceId: workspaceSelect.value,
    });
    window.setTimeout(closePopup, 120);
  } catch (error) {
    if (error?.code === "SITE_NOT_FOUND") setMessage(editorError, t("网站已不存在。"));
    else if (error?.code === "WORKSPACE_NOT_FOUND") setMessage(editorError, t("工作区已不存在。"));
    else setMessage(editorError, t("无法保存修改，请重试。"));
    setEditorDisabled(false);
    setButtonLoading(doneButton, false);
  }
}

async function removeCurrentSite() {
  if (!session || removeButton.disabled) return;
  setMessage(editorError);
  setButtonLoading(removeButton, true, t("删除中"));
  setEditorDisabled(true);

  try {
    await deleteQuickAddedSite(session.siteId);
    window.setTimeout(closePopup, 120);
  } catch (error) {
    setMessage(
      editorError,
      error?.code === "SITE_NOT_FOUND" ? t("网站已不存在。") : t("无法删除网站，请重试。"),
    );
    setEditorDisabled(false);
    setButtonLoading(removeButton, false);
  }
}

function setEditorDisabled(disabled) {
  nameInput.disabled = disabled;
  workspaceSelect.disabled = disabled;
  removeButton.disabled = disabled;
  if (!doneButton.classList.contains("is-loading")) doneButton.disabled = disabled;
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
  stateView.hidden = view !== "state";
}

function openNewWorkspace() {
  const chromeApi = getChromeApi();
  const url = chromeApi?.runtime?.getURL
    ? chromeApi.runtime.getURL("newtab.html?createWorkspace=1")
    : new URL("newtab.html?createWorkspace=1", window.location.href).href;
  if (chromeApi?.tabs?.create) chromeApi.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
  closePopup();
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
  const focusables = getActiveFocusables().filter((element) => !element.disabled && !element.hidden);
  if (!focusables.length) return;
  const currentIndex = focusables.indexOf(document.activeElement);
  const direction = event.shiftKey ? -1 : 1;
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + focusables.length) % focusables.length;
  event.preventDefault();
  focusables[nextIndex].focus();
}

function getActiveFocusables() {
  if (activeView === "editor") {
    return [nameInput, workspaceSelect, removeButton, doneButton, closeButton];
  }
  if (activeView === "state") {
    return [...stateActions.querySelectorAll("button"), stateCloseButton];
  }
  return [];
}

function closePopup() {
  window.close();
}
