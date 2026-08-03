import * as i18n from "./i18n.js";
import { configureForms, openSiteForm, openWorkspaceForm } from "./forms.js";
import {
  attachDirectReorder,
  cancelActiveReorder,
  cancelKeyboardReorder,
  cancelPointerReorder,
  cancelReorderIn,
  configureReorder,
  configureReorderContainer,
  reorderLatestItems,
} from "./reorder.js";
import {
  closeMenu,
  closeModal,
  configureUiComponents,
  createButton,
  createDialog,
  createEmptyState,
  createIconButton,
  createMoreIconButton,
  createOpenAllIconButton,
  dismissModal,
  getCurrentModal,
  openDestructiveModal,
  setButtonLoading,
  setFieldError,
  setMenuReturnFocus,
  showMenu,
  showModal,
  showToast,
  trapModalFocus,
} from "./ui-components.js";
import {
  MAX_BACKUP_FILE_SIZE,
  BackupValidationError,
  createBackup,
  createBackupFilename,
  saveBackupFile,
  validateBackupData,
} from "./backup.js";
import {
  STORAGE_KEY,
  UI_STORAGE_KEY,
  getState,
  getUiState,
  getWorkspace,
  initializeState,
  initializeUiState,
  loadStateForUpdate,
  normalizeState,
  normalizeTileSize,
  saveExpandedWorkspaceId,
  saveState,
  setState,
} from "./state.js";
import { removeSiteForUndo, restoreDeletedSiteData } from "./site-delete.js";
import { renderFavicon } from "./favicon.js";
import {
  createId,
  getAppVersion,
  getChromeApi,
  getDomain,
  getUrlProtocol,
  isJavascriptUrl,
} from "./utils.js";
import {
  createWorkspaceDragImage,
  flipWorkspaceCard,
  runAfterDiscardNote,
  runNoteCardAction,
  setupWorkspaceNote,
  setWorkspaceCardFace,
} from "./workspace-note-card.js";

const t = (key, values) => i18n.t(key, values);
const grid = document.getElementById("workspaceGrid");
const emptyPageState = document.getElementById("emptyPageState");
const backdrop = document.getElementById("modalBackdrop");
const menuLayer = document.getElementById("menuLayer");
const tileTemplate = document.getElementById("workspaceTileTemplate");

let activeWorkspaceId = null;
let previewPages = {};
let previewWheelLocks = {};
let managementActiveTab = "export";
let expandedTransitionPending = false;
const tileSizeSavePending = new Set();

const TILE_PAGE_SIZES = {
  small: 4,
  medium: 8,
  large: 16,
};

configureReorder({ render });
configureForms({
  render,
  openWorkspaceDialog,
  appendSitesToLatestWorkspace,
  getActiveWorkspaceId: () => activeWorkspaceId,
  setActiveWorkspaceId: (workspaceId) => { activeWorkspaceId = workspaceId; },
});
configureUiComponents({
  beforeModalClose: cancelReorderIn,
  onModalClosed: () => { activeWorkspaceId = null; },
});

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const editingNoteFace = document.querySelector(".workspace-note-face.is-editing");
    if (editingNoteFace && backdrop.hidden && menuLayer.hidden) {
      event.preventDefault();
      runAfterDiscardNote(editingNoteFace, () => {}, editingNoteFace.querySelector(".workspace-note-textarea"));
      return;
    }
    if (cancelActiveReorder()) {
      event.preventDefault();
      return;
    }
    if (!menuLayer.hidden) {
      closeMenu();
    } else if (!backdrop.hidden) {
      dismissModal();
    }
    return;
  }

  const currentModal = getCurrentModal();
  if (event.key === "Tab" && currentModal) {
    trapModalFocus(event, currentModal.dialog);
  }
});
backdrop.addEventListener("click", (event) => {
  const currentModal = getCurrentModal();
  if (event.target === backdrop && currentModal?.dismissOnBackdrop) {
    dismissModal();
  }
});
menuLayer.addEventListener("click", (event) => {
  if (event.target === menuLayer) closeMenu();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelPointerReorder();
    cancelKeyboardReorder();
  }
});
getChromeApi()?.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[STORAGE_KEY]) {
    const nextState = normalizeState(changes[STORAGE_KEY].newValue);
    if (JSON.stringify(nextState) !== JSON.stringify(getState())) {
      setState(nextState);
      render();
    }
    if (activeWorkspaceId && !getWorkspace(activeWorkspaceId)) {
      closeModal({ restoreFocus: false });
      void persistExpandedWorkspaceId(null);
    }
  }
  if (changes[UI_STORAGE_KEY] && changes[UI_STORAGE_KEY].newValue?.expandedWorkspaceId === null) {
    if (getCurrentModal()?.dialog.classList.contains("workspace-expanded-dialog")) {
      void closeWorkspaceDialog(activeWorkspaceId);
    }
  }
});

async function init() {
  await i18n.init();
  renderManagementEntry();
  await initializeState();
  await initializeUiState();
  render();
  const createWorkspaceRequested = new URLSearchParams(window.location.search).get("createWorkspace") === "1";
  const restoredWorkspaceId = getUiState().expandedWorkspaceId;
  if (!createWorkspaceRequested && restoredWorkspaceId && getWorkspace(restoredWorkspaceId)) {
    requestAnimationFrame(() => openWorkspaceDialog(restoredWorkspaceId, null, { restore: true }));
  } else if (restoredWorkspaceId) {
    void persistExpandedWorkspaceId(null);
  }
  if (createWorkspaceRequested) {
    window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() => openWorkspaceForm());
  }
}

function renderManagementEntry() {
  if (document.getElementById("managementButton")) return;
  const button = createIconButton(
    t("菜单"),
    "M4 7h16M4 12h16M4 17h16",
    (event) => toggleManagementPanel(event.currentTarget),
  );
  button.id = "managementButton";
  button.classList.add("management-button");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  menuLayer.before(button);
}

function toggleManagementPanel(anchor) {
  if (!menuLayer.hidden && menuLayer.querySelector(".management-panel")) {
    closeMenu();
    return;
  }

  openManagementPanel(anchor, managementActiveTab);
}

function openManagementPanel(anchor, selectedTab = "export") {
  managementActiveTab = ["export", "import", "language", "about"].includes(selectedTab) ? selectedTab : "export";

  closeMenu({ restoreFocus: false });

  const panel = document.createElement("section");
  panel.className = "management-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", t("Workspace Tiles 菜单"));

  const navigation = document.createElement("div");
  navigation.className = "management-tabs";
  navigation.setAttribute("role", "tablist");
  navigation.setAttribute("aria-label", t("管理功能"));

  const content = document.createElement("div");
  content.className = "management-content";
  content.id = "managementPanelContent";
  content.setAttribute("role", "tabpanel");

  const tabDefinitions = [
    ["export", t("exportMenuLabel")],
    ["import", t("importMenuLabel")],
    ["language", t("语言")],
    ["about", t("关于")],
  ];
  const tabs = tabDefinitions.map(([tabId, label]) => {
    const tab = createButton(label, () => selectManagementTab(panel, tabId), { variant: "tertiary" });
    tab.classList.add("management-tab");
    tab.id = `management-tab-${tabId}`;
    tab.dataset.managementTab = tabId;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", content.id);
    navigation.append(tab);
    return tab;
  });

  navigation.addEventListener("keydown", (event) => {
    const currentIndex = tabs.indexOf(document.activeElement);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      selectManagementTab(panel, tabs[nextIndex].dataset.managementTab);
      tabs[nextIndex].focus();
    }
  });

  panel.append(navigation, content);

  setMenuReturnFocus(anchor);
  anchor.setAttribute("aria-expanded", "true");
  menuLayer.hidden = false;
  menuLayer.append(panel);
  selectManagementTab(panel, managementActiveTab);
  requestAnimationFrame(() => panel.querySelector('[role="tab"][aria-selected="true"]')?.focus());
}

function selectManagementTab(panel, tabId) {
  managementActiveTab = tabId;
  panel.querySelectorAll("[data-management-tab]").forEach((tab) => {
    const isSelected = tab.dataset.managementTab === tabId;
    tab.setAttribute("aria-selected", String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
    tab.classList.toggle("is-selected", isSelected);
  });

  const content = panel.querySelector(".management-content");
  content.setAttribute("aria-labelledby", `management-tab-${tabId}`);
  content.replaceChildren();
  if (tabId === "import") renderImportPanel(content);
  else if (tabId === "language") renderLanguagePanel(content);
  else if (tabId === "about") renderAboutPanel(content);
  else renderExportPanel(content);
}

function createManagementCopy(title, paragraphs) {
  const fragment = document.createDocumentFragment();
  const heading = document.createElement("h2");
  heading.className = "management-title";
  heading.textContent = title;
  fragment.append(heading);

  const copy = document.createElement("div");
  copy.className = "management-copy";
  paragraphs.forEach((paragraph) => {
    const body = document.createElement("p");
    body.textContent = paragraph;
    copy.append(body);
  });
  fragment.append(copy);
  return fragment;
}

function renderExportPanel(content) {
  content.append(createManagementCopy(t("导出备份"), [
    t("将当前所有工作区、网站和排列顺序保存为一个 JSON 备份文件。备份只会保存到你选择的位置，不会上传到服务器。"),
    t("建议在卸载插件、迁移电脑或进行重要调整前导出备份。"),
  ]));

  const button = createButton(t("选择保存位置"), null, {
    variant: "primary",
    loadingText: t("正在导出"),
  });
  button.classList.add("management-action");
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    setButtonLoading(button, true);
    try {
      const backup = createBackup(getState());
      const saved = await saveBackupFile(JSON.stringify(backup, null, 2), createBackupFilename());
      if (saved) showToast(t("备份已导出"), "success");
    } catch (error) {
      if (error?.name !== "AbortError") showToast(t("无法导出备份。请重试。"), "error");
    } finally {
      if (button.isConnected) setButtonLoading(button, false);
    }
  });
  content.append(button);
}

function renderImportPanel(content) {
  content.append(createManagementCopy(t("导入恢复"), [
    t("导入会完整替换当前所有工作区、网站和排列顺序，不会与当前数据合并。"),
    t("建议先导出当前数据作为备份。"),
  ]));

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;

  const error = document.createElement("p");
  error.className = "field-error management-error";
  error.id = createId("import-error");
  error.hidden = true;

  const button = createButton(t("选择备份文件"), () => input.click(), {
    variant: "primary",
    loadingText: t("正在读取"),
  });
  button.classList.add("management-action");
  button.setAttribute("aria-describedby", error.id);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setFieldError(button, error, "");
    setButtonLoading(button, true);
    try {
      if (file.size > MAX_BACKUP_FILE_SIZE) {
        throw new BackupValidationError(t("备份文件超过 10 MB，无法导入。"));
      }
      const parsed = validateBackupData(JSON.parse(await file.text()));
      openImportConfirmation(parsed);
    } catch (importError) {
      const message = importError instanceof SyntaxError
        ? t("无法导入：文件不是有效的 JSON。")
        : importError?.userMessage || t("无法导入：这不是有效的 Workspace Tiles 备份文件。");
      setFieldError(button, error, message);
      button.focus();
    } finally {
      if (button.isConnected) setButtonLoading(button, false);
    }
  });

  content.append(input, error, button);
}

function renderLanguagePanel(content) {
  content.append(createManagementCopy(t("语言"), [
    t("选择界面语言。更改会立即应用并保存在此设备上。"),
  ]));

  const options = document.createElement("fieldset");
  options.className = "language-options";
  const legend = document.createElement("legend");
  legend.className = "visually-hidden";
  legend.textContent = t("语言");
  options.append(legend);

  const languages = [
    ["zh-CN", "简体中文"],
    ["en", "英语"],
  ];
  languages.forEach(([value, labelKey]) => {
    const isSelected = i18n.getLanguage() === value;
    const label = document.createElement("label");
    label.className = "language-radio-option";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "interface-language";
    radio.value = value;
    radio.checked = isSelected;
    radio.addEventListener("change", () => {
      if (radio.checked) changeLanguage(value, options);
    });
    const text = document.createElement("span");
    text.textContent = t(labelKey);
    label.append(radio, text);
    options.append(label);
  });
  content.append(options);
}

async function changeLanguage(nextLanguage, fieldset) {
  if (nextLanguage === i18n.getLanguage()) return;
  fieldset?.setAttribute("aria-busy", "true");
  fieldset?.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  try {
    await i18n.setLanguage(nextLanguage);
    const managementButton = document.getElementById("managementButton");
    managementButton.title = t("菜单");
    managementButton.ariaLabel = t("菜单");
    render();
    openManagementPanel(managementButton, "language");
  } catch {
    const managementButton = document.getElementById("managementButton");
    openManagementPanel(managementButton, "language");
    showToast(t("无法保存语言设置。请重试。"), "error");
  }
}

function renderAboutPanel(content) {
  const heading = document.createElement("h2");
  heading.className = "management-title";
  heading.textContent = "Workspace Tiles";
  const version = document.createElement("p");
  version.className = "about-version";
  version.textContent = `Version ${getAppVersion()} · 2026.08.02`;

  const details = document.createElement("dl");
  details.className = "about-details";
  details.innerHTML = `
    <div><dt>Author:</dt><dd>WTing</dd></div>
    <div><dt>Contact:</dt><dd>wangluna830@gmail.com</dd></div>
  `;

  const supportButton = createButton("Buy me a coffee", () => {
    closeMenu({ restoreFocus: false });
    openExternalUrl("https://wt-support-d1glsnc0p9caea039-1318711866.tcloudbaseapp.com/");
  }, { variant: "primary" });
  supportButton.classList.add("management-action");
  content.append(heading, version, details, supportButton);
}

function openImportConfirmation(parsedBackup) {
  const currentWorkspaceCount = getState().workspaces.length;
  const currentSiteCount = getState().workspaces.reduce((total, workspace) => total + workspace.sites.length, 0);
  const description = currentWorkspaceCount || currentSiteCount
    ? t("backupReplace", {
      backupWorkspaces: parsedBackup.workspaceCount,
      backupSites: parsedBackup.siteCount,
      currentWorkspaces: currentWorkspaceCount,
      currentSites: currentSiteCount,
    })
    : t("backupRestore", {
      backupWorkspaces: parsedBackup.workspaceCount,
      backupSites: parsedBackup.siteCount,
    });

  const managementButton = document.getElementById("managementButton");
  openDestructiveModal({
    title: t("导入并替换当前数据？"),
    description,
    actionLabel: t("导入并替换"),
    loadingText: t("正在导入"),
    errorMessage: t("导入失败，当前数据未更改"),
    onCancel: () => openManagementPanel(managementButton, "import"),
    onConfirm: async () => {
      const previousState = getState();
      setState(parsedBackup.state);
      try {
        await saveState();
      } catch (error) {
        setState(previousState);
        throw error;
      }
    },
    onSuccess: () => {
      render();
      managementButton?.focus();
    },
    successMessage: t("数据已恢复"),
    returnFocus: managementButton,
  });
}

function render() {
  const state = getState();
  grid.replaceChildren();
  emptyPageState.replaceChildren();

  const isEmpty = state.workspaces.length === 0;
  grid.hidden = isEmpty;
  emptyPageState.hidden = !isEmpty;

  if (isEmpty) {
    emptyPageState.append(createEmptyState({
      title: t("还没有工作区"),
      description: t("创建工作区来组织常用网站，之后可以一键打开整组工具。"),
      actionLabel: t("新建工作区"),
      onAction: () => openWorkspaceForm(),
    }));
    return;
  }

  state.workspaces.forEach((workspace) => {
    grid.append(renderWorkspaceTile(workspace));
  });

  grid.append(renderAddWorkspaceTile());
  configureReorderContainer(grid, {
    kind: "workspace",
    itemSelector: ".workspace-tile[data-reorder-id]",
    fixedEndSelector: ".add-workspace-tile",
    renderAfterCommit: false,
    commit: commitWorkspaceOrder,
  });
  syncExpandedSourceTile();
}

function syncExpandedSourceTile() {
  grid.querySelectorAll(".workspace-tile.is-animation-source").forEach((tile) => {
    tile.classList.remove("is-animation-source");
  });
  if (!activeWorkspaceId || !getCurrentModal()?.dialog.classList.contains("workspace-expanded-dialog")) return;
  Array.from(grid.querySelectorAll(".workspace-tile"))
    .find((tile) => tile.dataset.workspaceId === activeWorkspaceId)
    ?.classList.add("is-animation-source");
}

function renderWorkspaceTile(workspace) {
  const node = tileTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.workspaceId = workspace.id;
  node.dataset.size = normalizeTileSize(workspace.tileSize);
  const sitesFace = node.querySelector(".workspace-sites-face");
  const noteFace = node.querySelector(".workspace-note-face");
  const tileBody = node.querySelector(".tile-body");
  const title = node.querySelector(".workspace-open-button");
  const noteTitle = node.querySelector(".workspace-note-title");
  const count = node.querySelector(".workspace-site-meta");
  const countBadges = node.querySelectorAll(".workspace-site-count-badge");
  const preview = node.querySelector(".favicon-preview");
  const openAllButton = node.querySelector(".open-all-button");
  const openWorkspaceButtons = node.querySelectorAll(".open-workspace-button");
  const moreButtons = node.querySelectorAll(".more-workspace-button");
  const showSitesButtons = noteFace.querySelectorAll(".show-sites-button");

  node.dataset.reorderId = workspace.id;
  attachDirectReorder(node, grid, {
    ignoreSelector: "button, input, textarea, label, .favicon-preview, .preview-pagination, .workspace-note-editor",
    createDragImage: createWorkspaceDragImage,
  });

  title.textContent = workspace.name;
  title.title = t("查看便签");
  noteTitle.textContent = workspace.name;
  noteTitle.title = t("查看网站");
  const siteCountLabel = workspace.sites.length > 0 ? t("siteCount", { count: workspace.sites.length }) : t("空工作区");
  count.textContent = "";
  count.hidden = true;
  countBadges.forEach((badge) => {
    badge.textContent = String(workspace.sites.length);
    badge.ariaLabel = siteCountLabel;
    badge.title = siteCountLabel;
  });
  openAllButton.hidden = workspace.sites.length === 0;

  openAllButton.title = t("打开全部");
  openAllButton.ariaLabel = t("打开全部");
  openWorkspaceButtons.forEach((button) => {
    button.title = t("打开工作区");
    button.ariaLabel = t("打开工作区");
  });
  moreButtons.forEach((button) => {
    button.title = t("更多");
    button.ariaLabel = t("更多");
  });
  showSitesButtons.forEach((button) => {
    button.title = t("查看网站");
    button.ariaLabel = t("查看网站");
  });

  setupWorkspaceNote(node, noteFace, workspace);
  setWorkspaceCardFace(node, workspace.cardFace);

  if (workspace.sites.length === 0) {
    const addSiteButton = createAddSitePreviewButton(workspace.id);
    preview.append(wrapPreviewItem(addSiteButton, { fixed: true }));
  } else {
    const pageSize = TILE_PAGE_SIZES[node.dataset.size];
    const pageCount = Math.ceil(workspace.sites.length / pageSize);
    const currentPage = Math.min(previewPages[workspace.id] || 0, pageCount - 1);
    const pageSites = workspace.sites.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    pageSites.forEach((site) => {
      const favicon = createFaviconButton(site, "favicon-mini");
      favicon.addEventListener("click", (event) => {
        event.stopPropagation();
        openUrl(site.url);
      });
      favicon.addEventListener("contextmenu", (event) => {
        openSiteContextMenu(event, workspace.id, site, favicon);
      });
      const previewItem = wrapPreviewItem(favicon, { reorderId: site.id });
      preview.append(previewItem);
      attachDirectReorder(previewItem, preview, { dragSource: favicon });
    });
    if (currentPage === pageCount - 1 && pageSites.length < pageSize) {
      preview.append(wrapPreviewItem(createAddSitePreviewButton(workspace.id), { fixed: true }));
    }
    configureReorderContainer(preview, {
      kind: "site",
      itemSelector: ".favicon-preview-cell[data-reorder-id]",
      fixedEndSelector: ".favicon-preview-cell.is-fixed-preview-item",
      getFullIds: () => workspace.sites.map((site) => site.id),
      preserveHiddenPositions: true,
      renderAfterCommit: false,
      commit: (orderedIds) => commitSiteOrder(workspace.id, orderedIds),
    });
    if (pageCount > 1) {
      node.classList.add("has-pagination");
      sitesFace.append(renderPreviewPagination(workspace.id, currentPage, pageCount));
      tileBody.addEventListener("wheel", (event) => handlePreviewWheel(event, workspace.id, currentPage, pageCount), { passive: false });
    }
  }

  tileBody.addEventListener("click", (event) => {
    if (event.target.closest("button, input, textarea, label, .preview-pagination")) return;
    flipWorkspaceCard(node, workspace.id, "note", false);
  });
  title.addEventListener("click", (event) => {
    event.stopPropagation();
    flipWorkspaceCard(node, workspace.id, "note", event.detail === 0);
  });

  openAllButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openAllMenu(event.currentTarget, workspace);
  });
  openWorkspaceButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const anchor = event.currentTarget;
      runNoteCardAction(noteFace, () => openWorkspaceDialog(workspace.id, anchor), anchor);
    });
  });
  moreButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const anchor = event.currentTarget;
      runNoteCardAction(noteFace, () => openWorkspaceMoreMenu(anchor, workspace), anchor);
    });
  });
  showSitesButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const fromKeyboard = event.detail === 0;
      runAfterDiscardNote(noteFace, () => flipWorkspaceCard(node, workspace.id, "sites", fromKeyboard), event.currentTarget);
    });
  });
  noteFace.addEventListener("click", (event) => {
    if (event.target.closest("button, input, textarea, label, .workspace-note-editor")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString()) return;
    runAfterDiscardNote(noteFace, () => flipWorkspaceCard(node, workspace.id, "sites", false));
  });

  return node;
}

function handlePreviewWheel(event, workspaceId, currentPage, pageCount) {
  if (Math.abs(event.deltaX) < 18 || Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
    return;
  }

  event.preventDefault();
  if (previewWheelLocks[workspaceId]) {
    return;
  }

  const direction = event.deltaX > 0 ? 1 : -1;
  const nextPage = Math.max(0, Math.min(pageCount - 1, currentPage + direction));
  if (nextPage === currentPage) {
    return;
  }

  previewPages[workspaceId] = nextPage;
  previewWheelLocks[workspaceId] = true;
  renderWorkspaceTileInPlace(workspaceId);
  window.setTimeout(() => {
    previewWheelLocks[workspaceId] = false;
  }, 420);
}

function createAddSitePreviewButton(workspaceId, onAction = null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "favicon-mini add-site-preview";
  button.ariaLabel = t("添加网站");
  button.innerHTML = `
    <span class="favicon-visual add-site-preview-icon" aria-hidden="true">
      <span class="add-site-preview-frame">
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </span>
    </span>
    <span class="favicon-mini-name">${t("添加网站")}</span>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (onAction) onAction(event);
    else openSiteForm(workspaceId, null, event.currentTarget);
  });
  return button;
}

function wrapPreviewItem(item, { reorderId = "", fixed = false } = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "favicon-preview-cell";
  if (reorderId) wrapper.dataset.reorderId = reorderId;
  if (fixed) wrapper.classList.add("is-fixed-preview-item");
  wrapper.append(item);
  return wrapper;
}

function renderPreviewPagination(workspaceId, currentPage, pageCount) {
  const pagination = document.createElement("nav");
  pagination.className = "preview-pagination";
  pagination.setAttribute("aria-label", t("网站预览分页"));

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "preview-pagination-button";
  previousButton.dataset.pageAction = "previous";
  previousButton.ariaLabel = t("上一页网站");
  previousButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>`;
  previousButton.disabled = currentPage === 0;
  previousButton.addEventListener("click", () => {
    changePreviewPage(workspaceId, currentPage - 1, "previous");
  });

  const pageStatus = document.createElement("span");
  pageStatus.className = "preview-page-status";
  pageStatus.textContent = `${currentPage + 1} / ${pageCount}`;
  pageStatus.setAttribute("aria-live", "polite");

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "preview-pagination-button";
  nextButton.dataset.pageAction = "next";
  nextButton.ariaLabel = t("下一页网站");
  nextButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;
  nextButton.disabled = currentPage === pageCount - 1;
  nextButton.addEventListener("click", () => {
    changePreviewPage(workspaceId, currentPage + 1, "next");
  });

  pagination.append(previousButton, pageStatus, nextButton);
  return pagination;
}

function changePreviewPage(workspaceId, nextPage, focusAction = "") {
  previewPages[workspaceId] = nextPage;
  renderWorkspaceTileInPlace(workspaceId, focusAction);
}

function renderWorkspaceTileInPlace(workspaceId, focusAction = "") {
  const workspace = getWorkspace(workspaceId);
  const currentTile = grid.querySelector(`.workspace-tile[data-workspace-id="${CSS.escape(workspaceId)}"]`);
  if (!workspace || !currentTile) return;

  const nextTile = renderWorkspaceTile(workspace);
  if (currentTile.classList.contains("is-animation-source")) {
    nextTile.classList.add("is-animation-source");
  }
  currentTile.replaceWith(nextTile);

  if (focusAction) {
    requestAnimationFrame(() => {
      nextTile.querySelector(`[data-page-action="${focusAction}"]`)?.focus();
    });
  }
}

function renderAddWorkspaceTile() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-workspace-tile";
  button.innerHTML = `
    <span class="add-workspace-content">
      <span class="add-plus" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"></path>
          <path d="M12 10.5v5"></path>
          <path d="M9.5 13h5"></path>
        </svg>
      </span>
      <span>${t("新建工作区")}</span>
    </span>
  `;
  button.addEventListener("click", () => openWorkspaceForm());
  return button;
}

function createFaviconButton(site, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = site.name;
  button.ariaLabel = site.name;
  const icon = document.createElement("span");
  icon.className = "favicon-visual";
  renderFavicon(icon, site);
  button.append(icon);
  if (className.includes("favicon-mini")) {
    const label = document.createElement("span");
    label.className = "favicon-mini-name";
    label.textContent = site.name;
    button.append(label);
  }
  return button;
}

function openWorkspaceDialog(workspaceId, returnFocus = null, { restore = false } = {}) {
  if (expandedTransitionPending) return;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;
  activeWorkspaceId = workspaceId;

  const dialog = createDialog("workspace-expanded-dialog");
  dialog.dataset.workspaceId = workspace.id;
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.innerHTML = `
    <h1>
      <span class="workspace-expanded-title-text"></span>
      <span class="workspace-site-count-badge"></span>
    </h1>
  `;
  title.querySelector(".workspace-expanded-title-text").textContent = workspace.name;
  const titleCountBadge = title.querySelector(".workspace-site-count-badge");
  const siteCountLabel = workspace.sites.length > 0
    ? t("siteCount", { count: workspace.sites.length })
    : t("空工作区");
  titleCountBadge.textContent = String(workspace.sites.length);
  titleCountBadge.ariaLabel = siteCountLabel;
  titleCountBadge.title = siteCountLabel;

  const noteFace = createExpandedWorkspaceNote(dialog, workspace);
  const requestClose = () => runAfterDiscardNote(
    noteFace,
    () => closeWorkspaceDialog(workspace.id),
    noteFace.querySelector(".workspace-note-textarea"),
  );
  const openButton = createOpenAllIconButton((event) => {
    runNoteCardAction(noteFace, () => openAllMenu(event.currentTarget, workspace), event.currentTarget);
  });
  openButton.hidden = workspace.sites.length === 0;
  const moreButton = createMoreIconButton((event) => {
    runNoteCardAction(noteFace, () => openWorkspaceMoreMenu(event.currentTarget, workspace), event.currentTarget);
  });
  const closeButton = createIconButton(t("关闭"), "M6 6l12 12M18 6 6 18", requestClose);
  closeButton.classList.add("close-expanded-workspace-button");

  const header = dialog.querySelector(".dialog-header");
  header.append(title, openButton, moreButton, closeButton);

  const content = dialog.querySelector(".dialog-content");
  content.classList.add("workspace-expanded-content");
  const sitesPane = document.createElement("section");
  sitesPane.className = "workspace-expanded-sites";
  sitesPane.setAttribute("aria-label", t("网站"));
  const sitesScroller = document.createElement("div");
  sitesScroller.className = "workspace-expanded-sites-scroll";
  sitesScroller.tabIndex = 0;
  sitesScroller.ariaLabel = t("网站");
  sitesPane.append(sitesScroller);
  content.append(sitesPane, noteFace);

  if (workspace.sites.length === 0) {
    sitesScroller.append(createEmptyState({
      title: t("这个工作区还没有网站"),
      description: t("添加第一个网站，之后就可以从新标签页快速打开。"),
      actionLabel: t("添加网站"),
      onAction: (event) => runNoteCardAction(
        noteFace,
        () => openSiteForm(workspace.id, null, event.currentTarget),
        event.currentTarget,
      ),
      compact: true,
    }));
  } else {
    const siteGrid = document.createElement("div");
    siteGrid.className = "site-grid workspace-expanded-site-grid";
    const addSiteButton = createAddSitePreviewButton(workspace.id, (event) => {
      runNoteCardAction(
        noteFace,
        () => openSiteForm(workspace.id, null, event.currentTarget),
        event.currentTarget,
      );
    });
    siteGrid.append(addSiteButton);
    sitesScroller.append(siteGrid);

    const batchSize = 64;
    let renderedSiteCount = 0;
    let updateScrollAffordance = () => {};

    const appendNextBatch = () => {
      const nextSites = workspace.sites.slice(renderedSiteCount, renderedSiteCount + batchSize);
      const fragment = document.createDocumentFragment();
      nextSites.forEach((site) => fragment.append(renderDialogSiteItem(workspace.id, site, noteFace)));
      siteGrid.insertBefore(fragment, addSiteButton);
      renderedSiteCount += nextSites.length;
      requestAnimationFrame(updateScrollAffordance);
    };

    const appendAllBatches = () => {
      while (renderedSiteCount < workspace.sites.length) appendNextBatch();
    };

    appendNextBatch();
    configureReorderContainer(siteGrid, {
      kind: "site",
      itemSelector: ".site-card[data-reorder-id]",
      fixedEndSelector: ".add-site-preview",
      commit: (orderedIds) => commitSiteOrder(workspace.id, orderedIds),
      ensureAll: appendAllBatches,
      getFullIds: () => workspace.sites.map((site) => site.id),
      scrollContainer: sitesScroller,
    });
    updateScrollAffordance = enableScrollAffordance(sitesScroller);
    sitesScroller.addEventListener("scroll", () => {
      updateScrollAffordance();
      const distanceToBottom = sitesScroller.scrollHeight - sitesScroller.scrollTop - sitesScroller.clientHeight;
      if (distanceToBottom < 180 && renderedSiteCount < workspace.sites.length) {
        appendNextBatch();
      }
    });
    requestAnimationFrame(updateScrollAffordance);
  }

  showExpandedWorkspaceDialog(dialog, workspace, returnFocus, { restore, onDismiss: requestClose });
}

function createExpandedWorkspaceNote(dialog, workspace) {
  const noteFace = tileTemplate.content.querySelector(".workspace-note-face").cloneNode(true);
  noteFace.className = "workspace-expanded-note";
  noteFace.setAttribute("aria-label", t("便签"));
  noteFace.removeAttribute("aria-hidden");
  noteFace.removeAttribute("inert");
  noteFace.querySelector(".note-accent")?.remove();
  noteFace.querySelector(".note-card-header")?.remove();
  noteFace.querySelector(".tile-actions")?.remove();
  setupWorkspaceNote(dialog, noteFace, workspace, { onSaved: render });
  return noteFace;
}

function supportsWorkspaceViewTransition() {
  return typeof document.startViewTransition === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function showExpandedWorkspaceDialog(dialog, workspace, returnFocus, { restore, onDismiss }) {
  const sourceTile = Array.from(grid.querySelectorAll(".workspace-tile"))
    .find((tile) => tile.dataset.workspaceId === workspace.id);

  if (restore || !returnFocus || !sourceTile || !supportsWorkspaceViewTransition()) {
    showModal(dialog, null, { returnFocus: returnFocus || sourceTile?.querySelector(".open-workspace-button"), onDismiss });
    sourceTile?.classList.add("is-animation-source");
  } else {
    expandedTransitionPending = true;
    sourceTile.style.viewTransitionName = "workspace-expand";
    document.documentElement.dataset.workspaceTransition = "expand";
    try {
      const transition = document.startViewTransition(() => {
        sourceTile.style.removeProperty("view-transition-name");
        sourceTile.classList.add("is-animation-source");
        showModal(dialog, null, { returnFocus, onDismiss });
        dialog.style.viewTransitionName = "workspace-expand";
      });
      await transition.finished.catch(() => {});
    } catch {
      sourceTile.classList.add("is-animation-source");
      if (backdrop.hidden) showModal(dialog, null, { returnFocus, onDismiss });
    } finally {
      sourceTile.style.removeProperty("view-transition-name");
      dialog.style.removeProperty("view-transition-name");
      delete document.documentElement.dataset.workspaceTransition;
      expandedTransitionPending = false;
    }
  }

  closeButtonAfterTransition(dialog);
  if (!restore) void persistExpandedWorkspaceId(workspace.id);
}

function closeButtonAfterTransition(dialog) {
  requestAnimationFrame(() => dialog.querySelector(".close-expanded-workspace-button")?.focus({ preventScroll: true }));
}

async function closeWorkspaceDialog(workspaceId) {
  if (expandedTransitionPending) return;
  const currentModal = getCurrentModal();
  const dialog = currentModal?.dialog;
  const sourceTile = Array.from(grid.querySelectorAll(".workspace-tile"))
    .find((tile) => tile.dataset.workspaceId === workspaceId);
  const returnFocus = sourceTile?.querySelector(".open-workspace-button");

  if (dialog?.classList.contains("workspace-expanded-dialog") && sourceTile && supportsWorkspaceViewTransition()) {
    expandedTransitionPending = true;
    dialog.style.viewTransitionName = "workspace-expand";
    document.documentElement.dataset.workspaceTransition = "collapse";
    try {
      const transition = document.startViewTransition(() => {
        dialog.style.removeProperty("view-transition-name");
        closeModal({ restoreFocus: false });
        sourceTile.classList.remove("is-animation-source");
        sourceTile.style.viewTransitionName = "workspace-expand";
      });
      await transition.finished.catch(() => {});
    } catch {
      if (!backdrop.hidden) closeModal({ restoreFocus: false });
      sourceTile.classList.remove("is-animation-source");
    } finally {
      dialog.style.removeProperty("view-transition-name");
      sourceTile.style.removeProperty("view-transition-name");
      delete document.documentElement.dataset.workspaceTransition;
      expandedTransitionPending = false;
    }
    returnFocus?.focus({ preventScroll: true });
  } else {
    closeModal({ restoreFocus: false });
    sourceTile?.classList.remove("is-animation-source");
    returnFocus?.focus({ preventScroll: true });
  }

  void persistExpandedWorkspaceId(null);
}

function renderDialogSiteItem(workspaceId, site, noteFace = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "site-card";
  wrapper.dataset.reorderId = site.id;

  const siteButton = createFaviconButton(site, "favicon-mini dialog-site-item");
  siteButton.title = site.url;
  siteButton.addEventListener("click", () => {
    if (noteFace) runNoteCardAction(noteFace, () => openUrl(site.url), siteButton);
    else openUrl(site.url);
  });
  siteButton.addEventListener("contextmenu", (event) => {
    if (noteFace) {
      event.preventDefault();
      runNoteCardAction(noteFace, () => openSiteContextMenu(event, workspaceId, site, siteButton), siteButton);
    } else {
      openSiteContextMenu(event, workspaceId, site, siteButton);
    }
  });

  wrapper.append(siteButton);
  attachDirectReorder(wrapper, wrapper.closest(".site-grid"), { dragSource: siteButton });
  return wrapper;
}


async function commitWorkspaceOrder(orderedIds) {
  const previousState = getState();
  const latestState = await loadStateForUpdate();
  latestState.workspaces = reorderLatestItems(latestState.workspaces, orderedIds);
  setState(latestState);
  try {
    await saveState();
  } catch (error) {
    setState(previousState);
    throw error;
  }
}

async function commitSiteOrder(workspaceId, orderedIds) {
  const previousState = getState();
  const latestState = await loadStateForUpdate();
  const workspace = latestState.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    setState(latestState);
    const error = new Error("Workspace not found");
    error.code = "WORKSPACE_NOT_FOUND";
    throw error;
  }

  workspace.sites = reorderLatestItems(workspace.sites, orderedIds);
  setState(latestState);
  try {
    await saveState();
  } catch (error) {
    setState(previousState);
    throw error;
  }
}

function enableScrollAffordance(content) {
  const shell = document.createElement("div");
  shell.className = "dialog-scroll-shell";
  const topFade = document.createElement("div");
  topFade.className = "scroll-edge scroll-edge-top";
  topFade.setAttribute("aria-hidden", "true");
  const bottomFade = document.createElement("div");
  bottomFade.className = "scroll-edge scroll-edge-bottom";
  bottomFade.setAttribute("aria-hidden", "true");

  content.replaceWith(shell);
  shell.append(content, topFade, bottomFade);

  const update = () => {
    const threshold = 2;
    shell.classList.toggle("can-scroll-up", content.scrollTop > threshold);
    shell.classList.toggle(
      "can-scroll-down",
      content.scrollTop + content.clientHeight < content.scrollHeight - threshold,
    );
  };

  return update;
}

function deleteWorkspace(workspaceId, returnFocus = null) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  openDestructiveModal({
    title: t("删除工作区"),
    description: t("deleteWorkspace", { name: workspace.name, count: workspace.sites.length }),
    actionLabel: t("删除工作区"),
    loadingText: t("删除中"),
    onConfirm: async () => {
      const previousWorkspaces = getState().workspaces;
      getState().workspaces = getState().workspaces.filter((item) => item.id !== workspaceId);
      try {
        await saveState();
      } catch (error) {
        getState().workspaces = previousWorkspaces;
        throw error;
      }
    },
    onSuccess: () => {
      render();
      if (getUiState().expandedWorkspaceId === workspaceId) void persistExpandedWorkspaceId(null);
    },
    successMessage: t("工作区已删除"),
    returnFocus,
  });
}

async function deleteSite(workspaceId, siteId, returnFocus = null) {
  const workspace = getWorkspace(workspaceId);
  const site = workspace?.sites.find((item) => item.id === siteId);
  if (!workspace || !site) return;
  const returnToWorkspace = activeWorkspaceId === workspaceId;
  const previousState = getState();
  let deletion;

  try {
    const result = removeSiteForUndo(previousState, workspaceId, siteId);
    deletion = result.deletion;
    setState(result.state);
    renderAfterSiteChange(workspaceId, returnToWorkspace, returnFocus);
    await saveState();
  } catch {
    setState(previousState);
    renderAfterSiteChange(workspaceId, returnToWorkspace, returnFocus);
    showToast(t("无法完成删除。请重试。"), "error");
    return;
  }

  showToast(t("网站已删除"), "error", 6000, {
    label: t("撤销"),
    loadingText: t("恢复中"),
    onClick: () => undoSiteDeletion(deletion, returnToWorkspace),
  });
}

async function undoSiteDeletion(deletion, returnToWorkspace) {
  let stateBeforeRestore = null;
  try {
    stateBeforeRestore = await loadStateForUpdate();
    const restored = restoreDeletedSiteData(stateBeforeRestore, deletion);
    setState(restored.state);
    await saveState();
    renderAfterSiteChange(deletion.workspaceId, returnToWorkspace);
    showToast(t("网站已恢复"), "success");
  } catch {
    if (stateBeforeRestore) setState(stateBeforeRestore);
    renderAfterSiteChange(deletion.workspaceId, returnToWorkspace);
    showToast(t("无法撤销删除。请重试。"), "error");
  }
}

function renderAfterSiteChange(workspaceId, returnToWorkspace, returnFocus = null) {
  render();
  if (returnToWorkspace && getWorkspace(workspaceId)) {
    openWorkspaceDialog(workspaceId);
    return;
  }

  const workspaceTile = Array.from(grid.querySelectorAll(".workspace-tile"))
    .find((tile) => tile.dataset.workspaceId === workspaceId);
  const focusTarget = workspaceTile?.querySelector(".workspace-open-button");
  if (returnFocus?.isConnected) requestAnimationFrame(() => returnFocus.focus());
  else if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
}

function openSiteContextMenu(event, workspaceId, site, anchor) {
  event.preventDefault();
  event.stopPropagation();
  closeMenu({ restoreFocus: false });

  const menu = document.createElement("div");
  menu.className = "open-menu site-context-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-action="edit">${t("编辑网站")}</button>
    <button type="button" role="menuitem" data-action="delete" class="danger-menu-item">${t("删除")}</button>
  `;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 96)}px`;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`;
  menu.addEventListener("click", (clickEvent) => {
    const action = clickEvent.target?.dataset?.action;
    if (action === "edit") {
      closeMenu({ restoreFocus: false });
      openSiteForm(workspaceId, site, anchor);
    }
    if (action === "delete") {
      closeMenu({ restoreFocus: false });
      deleteSite(workspaceId, site.id, anchor);
    }
  });
  showMenu(menu, anchor);
}

async function appendSitesToLatestWorkspace(workspaceId, sites) {
  const previousState = getState();
  const latestState = await loadStateForUpdate();
  const workspace = latestState.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    setState(latestState);
    const error = new Error("Workspace not found");
    error.code = "WORKSPACE_NOT_FOUND";
    throw error;
  }

  workspace.sites.push(...sites);
  setState(latestState);
  try {
    await saveState();
  } catch (error) {
    setState(previousState);
    throw error;
  }
}

function openAllMenu(anchor, workspace) {
  closeMenu({ restoreFocus: false });
  if (!workspace.sites.length) return;

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-action="current">${t("当前窗口打开")}</button>
    <button type="button" role="menuitem" data-action="new">${t("新窗口打开")}</button>
  `;

  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 96)}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;

  menu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "current") {
      openAllCurrentWindow(workspace.sites);
      closeMenu({ restoreFocus: false });
    }
    if (action === "new") {
      openAllNewWindow(workspace.sites);
      closeMenu({ restoreFocus: false });
    }
  });

  showMenu(menu, anchor);
}

function openWorkspaceMoreMenu(anchor, workspace) {
  closeMenu({ restoreFocus: false });

  const workspaceTile = anchor.closest(".workspace-tile");
  const showingNote = workspaceTile?.classList.contains("is-note") || false;
  const faceAction = workspaceTile
    ? `<button type="button" role="menuitem" data-action="toggle-face">${t(showingNote ? "查看网站" : "查看便签")}</button>`
    : "";
  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu workspace-more-menu";
  menu.setAttribute("role", "menu");
  const workspaceSectionId = createId("workspace-menu-section");
  const sizeSectionId = createId("workspace-size-section");
  menu.innerHTML = `
    <div class="menu-section" role="group" aria-labelledby="${workspaceSectionId}">
      <div class="menu-section-label" id="${workspaceSectionId}">${t("工作区")}</div>
      ${faceAction}
      <button type="button" role="menuitem" data-action="rename">${t("重命名工作区")}</button>
    </div>
    <div class="menu-section" role="group" aria-labelledby="${sizeSectionId}">
      <div class="menu-section-label" id="${sizeSectionId}">${t("卡片大小")}</div>
      ${["small", "medium", "large"].map((size) => `
        <button type="button" role="menuitemradio" aria-checked="${workspace.tileSize === size}" data-size="${size}"${tileSizeSavePending.has(workspace.id) ? " disabled" : ""}>
          <span>${t(size === "small" ? "小" : size === "medium" ? "中" : "大")}</span>
          <svg class="menu-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>
        </button>
      `).join("")}
    </div>
    <div class="menu-divider" role="separator"></div>
    <button type="button" role="menuitem" data-action="delete" class="danger-menu-item">${t("删除工作区")}</button>
  `;

  menu.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 320))}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.right - 200, window.innerWidth - 208))}px`;

  menu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    const sizeButton = event.target.closest("[data-size]");
    if (sizeButton) {
      const isCurrentSize = sizeButton.getAttribute("aria-checked") === "true";
      closeMenu({ restoreFocus: isCurrentSize });
      if (isCurrentSize) return;
      void updateWorkspaceTileSize(workspace.id, sizeButton.dataset.size);
      return;
    }
    if (action === "toggle-face" && workspaceTile) {
      closeMenu({ restoreFocus: false });
      const targetFace = showingNote ? "sites" : "note";
      flipWorkspaceCard(workspaceTile, workspace.id, targetFace, event.detail === 0);
      return;
    }
    if (action === "rename") {
      closeMenu({ restoreFocus: false });
      let renameReturnFocus = anchor;
      if (getCurrentModal()?.dialog.classList.contains("workspace-expanded-dialog")) {
        const sourceTile = Array.from(grid.querySelectorAll(".workspace-tile"))
          .find((tile) => tile.dataset.workspaceId === workspace.id);
        sourceTile?.classList.remove("is-animation-source");
        renameReturnFocus = sourceTile?.querySelector(".more-workspace-button") || anchor;
        void persistExpandedWorkspaceId(null);
      }
      openWorkspaceForm(workspace, renameReturnFocus);
    }
    if (action === "delete") {
      closeMenu({ restoreFocus: false });
      deleteWorkspace(workspace.id, anchor);
    }
  });

  showMenu(menu, anchor);
}

async function updateWorkspaceTileSize(workspaceId, requestedSize) {
  if (tileSizeSavePending.has(workspaceId)) return;
  const tileSize = normalizeTileSize(requestedSize);
  const previousState = getState();
  tileSizeSavePending.add(workspaceId);
  try {
    const latestState = await loadStateForUpdate();
    const workspace = latestState.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    workspace.tileSize = tileSize;
    setState(latestState);
    previewPages[workspaceId] = 0;
    render();
    await saveState();
    requestAnimationFrame(() => {
      const expandedMenuButton = getCurrentModal()?.dialog.querySelector(".more-workspace-button");
      const tileMenuButton = Array.from(grid.querySelectorAll(".workspace-tile"))
        .find((tile) => tile.dataset.workspaceId === workspaceId)
        ?.querySelector(".more-workspace-button");
      (expandedMenuButton || tileMenuButton)?.focus();
    });
    showToast(t("卡片大小已更新"), "success");
  } catch {
    setState(previousState);
    render();
    showToast(t("无法保存卡片大小。请重试。"), "error");
  } finally {
    tileSizeSavePending.delete(workspaceId);
  }
}

async function persistExpandedWorkspaceId(workspaceId) {
  try {
    await saveExpandedWorkspaceId(workspaceId);
  } catch {
    showToast(t("无法保存展开状态。请重试。"), "error");
  }
}

function openUrl(url) {
  if (isJavascriptUrl(url)) {
    showToast(t("此书签工具需要在目标网页中使用"));
    return;
  }

  const chromeApi = getChromeApi();
  if (chromeApi?.tabs?.update) {
    chromeApi.tabs.update({ url }, () => {
      if (chromeApi.runtime?.lastError) {
        window.location.href = url;
      }
    });
    return;
  }

  window.location.href = url;
}

function openUrlInNewTab(url) {
  if (isJavascriptUrl(url)) return;

  const chromeApi = getChromeApi();
  if (chromeApi?.tabs?.create) {
    chromeApi.tabs.create({ url, active: false }, () => {
      if (chromeApi.runtime?.lastError) {
        window.open(url, "_blank", "noopener");
      }
    });
    return;
  }

  window.open(url, "_blank", "noopener");
}

function openExternalUrl(url) {
  const chromeApi = getChromeApi();
  if (chromeApi?.tabs?.create) {
    chromeApi.tabs.create({ url, active: true }, () => {
      if (chromeApi.runtime?.lastError) window.open(url, "_blank", "noopener");
    });
    return;
  }
  window.open(url, "_blank", "noopener");
}

function openAllCurrentWindow(sites) {
  const openableSites = sites.filter((site) => !isJavascriptUrl(site.url));
  if (!openableSites.length) {
    showToast(t("此工作区只包含需要在目标网页中使用的书签工具"));
    return;
  }
  openableSites.slice(1).forEach((site) => openUrlInNewTab(site.url));
  openUrl(openableSites[0].url);
}

function openAllNewWindow(sites) {
  const urls = sites.filter((site) => !isJavascriptUrl(site.url)).map((site) => site.url);
  if (!urls.length) {
    showToast(t("此工作区只包含需要在目标网页中使用的书签工具"));
    return;
  }
  const chromeApi = getChromeApi();
  if (chromeApi?.windows?.create) {
    chromeApi.windows.create({ url: urls }, () => {
      if (chromeApi.runtime?.lastError) {
        urls.forEach((url) => openUrlInNewTab(url));
      }
    });
    return;
  }
  urls.forEach((url) => window.open(url, "_blank", "noopener"));
}
