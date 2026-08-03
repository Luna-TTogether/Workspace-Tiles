import { t } from "../core/i18n.js";
import { getState, getWorkspace, saveState } from "../core/state.js";
import { createId, getChromeApi, getSiteFallbackName, getUrlValidationError, normalizeUrl } from "../core/utils.js";
import { closeModal, createButton, createDialog, createDialogTitle, createEmptyState, createIconButton, getCurrentModal, setButtonLoading, setFieldError, showModal, showToast } from "../ui/ui-components.js";

let renderApp = () => {};
let openWorkspaceDialogApp = () => {};
let appendSitesToLatestWorkspaceApp = async () => {};
let getActiveWorkspaceId = () => null;
let setActiveWorkspaceId = () => {};

function configureForms(options) {
  renderApp = options.render;
  openWorkspaceDialogApp = options.openWorkspaceDialog;
  appendSitesToLatestWorkspaceApp = options.appendSitesToLatestWorkspace;
  getActiveWorkspaceId = options.getActiveWorkspaceId;
  setActiveWorkspaceId = options.setActiveWorkspaceId;
}

function openWorkspaceForm(workspace = null, returnFocus = null) {
  const isEditing = Boolean(workspace);
  const dialog = createDialog("small");
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(isEditing ? t("重命名工作区") : t("新建工作区")));
  if (!isEditing) {
    header.append(createIconButton(t("关闭"), "M6 6l12 12M18 6 6 18", closeModal));
  }
  let bookmarkTree = [];
  let selectedBookmarkIds = new Set();
  let openTabs = [];
  let selectedOpenTabKeys = new Set();

  const form = document.createElement("form");
  form.className = "form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="field">
      <label for="workspaceName">${t("工作区名称")}</label>
      <input id="workspaceName" name="name" autocomplete="off" required maxlength="60" aria-describedby="workspaceNameError">
      <p class="field-error" id="workspaceNameError" role="status" hidden></p>
    </div>
  `;
  form.elements.name.value = workspace?.name || "";
  const workspaceNameInput = form.elements.name;
  const workspaceNameError = form.querySelector("#workspaceNameError");
  let workspaceNameValidationActive = false;
  const validateWorkspaceName = () => {
    const message = workspaceNameInput.value.trim() ? "" : t("工作区名称不能为空。");
    setFieldError(workspaceNameInput, workspaceNameError, message);
    return !message;
  };
  workspaceNameInput.addEventListener("blur", () => {
    if (workspaceNameValidationActive) validateWorkspaceName();
  });
  workspaceNameInput.addEventListener("input", () => {
    if (!workspaceNameError.hidden && workspaceNameInput.value.trim()) {
      setFieldError(workspaceNameInput, workspaceNameError);
    }
  });

  if (!isEditing) {
    const importBlock = document.createElement("div");
    importBlock.className = "bookmark-import-block";
    importBlock.innerHTML = `
      <div class="bookmark-import-heading">${t("从书签添加")}</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">${t("选择文件夹或网站")}</span>
        <span class="bookmark-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">${t("所选文件夹中的网站将被平铺添加，不会保留原有文件夹结构。")}</p>
      <p class="form-message error" role="status" hidden></p>
    `;

    const selectButton = createButton(t("选择书签"), null, {
      variant: "secondary",
      size: "small",
      loadingText: t("读取中"),
    });
    selectButton.classList.add("bookmark-select-button");
    importBlock.querySelector(".bookmark-select-button-slot").replaceWith(selectButton);
    const summary = importBlock.querySelector(".bookmark-import-summary");
    const error = importBlock.querySelector(".form-message");

    const updateImportSummary = () => {
      const count = selectedBookmarkIds.size;
      summary.textContent = count > 0 ? t("selectedSiteCount", { count }) : t("选择文件夹或网站");
      summary.classList.toggle("has-selection", count > 0);
      const buttonLabel = count > 0 ? t("修改") : t("选择书签");
      selectButton.dataset.defaultLabel = buttonLabel;
      selectButton.querySelector(".button-label").textContent = buttonLabel;
      selectButton.classList.toggle("is-compact", count > 0);
    };

    selectButton.addEventListener("click", async () => {
      error.hidden = true;
      setButtonLoading(selectButton, true);

      try {
        const granted = await requestBookmarksPermission();
        if (!granted) {
          error.textContent = t("未获得书签访问权限，你仍可手动添加网站。");
          error.hidden = false;
          return;
        }

        const nextBookmarkTree = await loadBookmarksTree();
        const availableBookmarkIds = new Set(nextBookmarkTree.flatMap((node) => getDescendantBookmarkIds(node)));
        const availableSelection = new Set(
          Array.from(selectedBookmarkIds).filter((id) => availableBookmarkIds.has(id)),
        );
        openBookmarkPicker(nextBookmarkTree, availableSelection, {
          onCancel: () => showModal(dialog, () => selectButton.focus()),
          onConfirm: (nextSelection) => {
            bookmarkTree = nextBookmarkTree;
            selectedBookmarkIds = nextSelection;
            updateImportSummary();
            showModal(dialog, () => selectButton.focus());
          },
        });
      } catch {
        error.textContent = t("无法读取 Chrome 书签，请稍后重试。");
        error.hidden = false;
      } finally {
        setButtonLoading(selectButton, false);
      }
    });

    form.append(importBlock);

    const tabImportBlock = document.createElement("div");
    tabImportBlock.className = "bookmark-import-block";
    tabImportBlock.innerHTML = `
      <div class="bookmark-import-heading">${t("从打开的标签页添加")}</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">${t("选择当前窗口中的标签页")}</span>
        <span class="tab-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">${t("选择当前窗口中需要保存的网站。")}</p>
      <p class="form-message error" role="status" hidden></p>
    `;

    const tabSelectButton = createButton(t("选择标签页"), null, {
      variant: "secondary",
      size: "small",
      loadingText: t("读取中"),
    });
    tabSelectButton.classList.add("bookmark-select-button");
    tabImportBlock.querySelector(".tab-select-button-slot").replaceWith(tabSelectButton);
    const tabSummary = tabImportBlock.querySelector(".bookmark-import-summary");
    const tabError = tabImportBlock.querySelector(".form-message");

    const updateTabImportSummary = () => {
      const count = selectedOpenTabKeys.size;
      tabSummary.textContent = count > 0 ? t("selectedTabCount", { count }) : t("选择当前窗口中的标签页");
      tabSummary.classList.toggle("has-selection", count > 0);
      const buttonLabel = count > 0 ? t("重新选择") : t("选择标签页");
      tabSelectButton.dataset.defaultLabel = buttonLabel;
      tabSelectButton.querySelector(".button-label").textContent = buttonLabel;
      tabSelectButton.classList.toggle("is-compact", count > 0);
    };

    tabSelectButton.addEventListener("click", async () => {
      tabError.hidden = true;
      setButtonLoading(tabSelectButton, true);

      try {
        const granted = await requestTabsPermission();
        if (!granted) {
          tabError.textContent = t("未获得标签页访问权限，你仍可手动添加网站或从书签添加。");
          tabError.hidden = false;
          return;
        }

        const nextOpenTabs = await loadCurrentWindowTabs();
        const availableKeys = new Set(nextOpenTabs.map((tab) => tab.key));
        const availableSelection = new Set(
          Array.from(selectedOpenTabKeys).filter((key) => availableKeys.has(key)),
        );
        openTabPicker(nextOpenTabs, availableSelection, {
          onCancel: () => showModal(dialog, () => tabSelectButton.focus()),
          onConfirm: (nextSelection) => {
            openTabs = nextOpenTabs;
            selectedOpenTabKeys = nextSelection;
            updateTabImportSummary();
            showModal(dialog, () => tabSelectButton.focus());
          },
        });
      } catch {
        tabError.textContent = t("无法读取当前窗口的标签页，请稍后重试。");
        tabError.hidden = false;
      } finally {
        setButtonLoading(tabSelectButton, false);
      }
    });

    form.append(tabImportBlock);
  }

  dialog.querySelector(".dialog-content").append(form);
  const footer = dialog.querySelector(".dialog-footer");
  const submitButton = createButton(isEditing ? t("保存") : t("创建"), () => form.requestSubmit(), {
    variant: "primary",
    loadingText: isEditing ? t("保存中") : t("创建中"),
  });
  if (isEditing) {
    footer.append(
      createButton(t("取消"), closeModal),
      submitButton,
    );
  } else {
    footer.append(submitButton);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    workspaceNameValidationActive = true;
    if (!validateWorkspaceName()) {
      workspaceNameInput.focus();
      return;
    }
    const name = workspaceNameInput.value.trim();
    setButtonLoading(submitButton, true);
    const previousName = workspace?.name;
    const newWorkspaceId = createId("workspace");

    try {
      if (workspace) {
        workspace.name = name;
      } else {
        const sites = [
          ...flattenSelectedBookmarks(bookmarkTree, selectedBookmarkIds),
          ...flattenSelectedTabs(openTabs, selectedOpenTabKeys),
        ];
        getState().workspaces.push({ id: newWorkspaceId, name, tileSize: "large", sites });
      }

      await saveState();
      closeModal();
      renderApp();
      showToast(isEditing ? t("工作区已重命名") : t("工作区已创建"), "success");
    } catch {
      if (workspace) {
        workspace.name = previousName;
      } else {
        getState().workspaces = getState().workspaces.filter((item) => item.id !== newWorkspaceId);
      }
      showToast(t("无法保存工作区。请重试。"), "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  showModal(dialog, () => form.elements.name.focus(), { returnFocus });
}

function openBookmarkPicker(tree, confirmedSelection, {
  onCancel,
  onConfirm,
  confirmLabel = t("确认选择"),
  loadingText = t("处理中"),
  requireSelection = false,
}) {
  const draftSelection = new Set(confirmedSelection);
  const expandedFolderIds = new Set();
  const picker = createSelectionPicker(t("选择书签"), t("Chrome 书签"), onCancel);
  const { dialog, dialogTitle, choiceContainer: treeContainer } = picker;
  treeContainer.setAttribute("role", "tree");

  const confirmButton = createButton(confirmLabel, null, { variant: "primary", loadingText });
  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) return;
    setButtonLoading(confirmButton, true);
    try {
      await onConfirm(new Set(draftSelection));
    } finally {
      if (dialog.isConnected) setButtonLoading(confirmButton, false);
    }
  });
  dialog.querySelector(".dialog-footer").append(confirmButton);

  const displayNodes = getBookmarkDisplayNodes(tree);

  const renderTree = () => {
    const scrollTop = treeContainer.scrollTop;
    treeContainer.replaceChildren();

    if (!displayNodes.length) {
      treeContainer.append(createEmptyState({
        title: t("没有可选择的书签"),
        description: t("请先在 Chrome 中创建书签，然后再返回这里选择。"),
        compact: true,
      }));
    } else {
      displayNodes.forEach((node) => {
        treeContainer.append(renderBookmarkNode(node, 0, draftSelection, expandedFolderIds, renderTree));
      });
    }

    dialogTitle.querySelector("h1").textContent = t("selectBookmarksTitle", { count: draftSelection.size });
    confirmButton.disabled = requireSelection && draftSelection.size === 0;
    treeContainer.scrollTop = scrollTop;
  };

  renderTree();
  showModal(dialog, null, { onDismiss: onCancel });
}

function createSelectionPicker(title, legend, onCancel) {
  const dialog = createDialog("bookmark-picker-dialog");
  const dialogTitle = createDialogTitle(`${title}（0）`);
  const closeButton = createIconButton(t("关闭"), "M6 6l12 12M18 6 6 18", onCancel);
  dialog.querySelector(".dialog-header").append(dialogTitle, closeButton);

  const content = dialog.querySelector(".dialog-content");
  content.classList.add("bookmark-picker-content");
  const choiceGroup = document.createElement("fieldset");
  choiceGroup.className = "bookmark-tree-group";
  const choiceLegend = document.createElement("legend");
  choiceLegend.className = "visually-hidden";
  choiceLegend.textContent = legend;
  const choiceContainer = document.createElement("div");
  choiceContainer.className = "bookmark-tree";
  choiceGroup.append(choiceLegend, choiceContainer);
  content.append(choiceGroup);

  return { dialog, dialogTitle, choiceContainer };
}

function openTabPicker(tabs, confirmedSelection, {
  onCancel,
  onConfirm,
  confirmLabel = t("确认选择"),
  loadingText = t("处理中"),
  requireSelection = false,
}) {
  const draftSelection = new Set(confirmedSelection);
  const picker = createSelectionPicker(t("选择标签页"), t("当前窗口标签页"), onCancel);
  const { dialog, dialogTitle, choiceContainer } = picker;
  choiceContainer.classList.add("tab-choice-list");

  const confirmButton = createButton(confirmLabel, null, { variant: "primary", loadingText });
  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) return;
    setButtonLoading(confirmButton, true);
    try {
      await onConfirm(new Set(draftSelection));
    } finally {
      if (dialog.isConnected) setButtonLoading(confirmButton, false);
    }
  });
  dialog.querySelector(".dialog-footer").append(confirmButton);

  const renderChoices = () => {
    const scrollTop = choiceContainer.scrollTop;
    choiceContainer.replaceChildren();

    choiceContainer.append(renderTabSelectAll(tabs, draftSelection, renderChoices));

    tabs.forEach((tab) => {
      choiceContainer.append(renderTabChoice(tab, draftSelection, renderChoices));
    });

    dialogTitle.querySelector("h1").textContent = t("selectTabsTitle", { count: draftSelection.size });
    confirmButton.disabled = requireSelection && draftSelection.size === 0;
    choiceContainer.scrollTop = scrollTop;
  };

  renderChoices();
  showModal(dialog, null, { onDismiss: onCancel });
}

function renderTabSelectAll(tabs, selection, rerender) {
  const selectableTabs = tabs.filter((tab) => tab.url);
  const selectedCount = selectableTabs.filter((tab) => selection.has(tab.key)).length;
  const allSelected = selectableTabs.length > 0 && selectedCount === selectableTabs.length;

  const row = document.createElement("div");
  row.className = "bookmark-tree-row tab-select-all-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = createId("tab-select-all");
  checkbox.checked = allSelected;
  checkbox.indeterminate = selectedCount > 0 && !allSelected;
  checkbox.disabled = selectableTabs.length === 0;
  checkbox.ariaLabel = allSelected ? t("取消全选标签页") : t("全选标签页");
  if (checkbox.disabled) checkbox.title = t("没有可保存的标签页");
  checkbox.addEventListener("change", () => {
    selectableTabs.forEach((tab) => {
      if (checkbox.checked) selection.add(tab.key);
      else selection.delete(tab.key);
    });
    rerender();
  });

  const choiceLabel = document.createElement("label");
  choiceLabel.className = "bookmark-choice-label tab-select-all-label";
  choiceLabel.htmlFor = checkbox.id;
  choiceLabel.title = checkbox.disabled ? t("没有可保存的标签页") : t("选择或取消选择全部可保存的标签页");

  const label = document.createElement("span");
  label.className = "bookmark-node-label";
  label.textContent = t("全选");
  const count = document.createElement("span");
  count.className = "tab-select-all-count";
  count.textContent = t("totalTabs", { count: selectableTabs.length });
  choiceLabel.append(label, count);
  row.append(checkbox, choiceLabel);
  return row;
}

function renderTabChoice(tab, selection, rerender) {
  const row = document.createElement("div");
  row.className = "bookmark-tree-row tab-choice-row";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = createId("tab-choice");
  checkbox.checked = selection.has(tab.key);
  checkbox.disabled = !tab.url;
  checkbox.ariaLabel = tab.url
    ? t("selectTab", { title: tab.title })
    : t("unavailableTab", { title: tab.title });
  if (checkbox.disabled) checkbox.title = t("此标签页暂时无法保存");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selection.add(tab.key);
    else selection.delete(tab.key);
    rerender();
  });

  const choiceLabel = document.createElement("label");
  choiceLabel.className = "bookmark-choice-label tab-choice-label";
  choiceLabel.htmlFor = checkbox.id;
  choiceLabel.title = tab.url || t("此标签页暂时无法保存");

  const title = document.createElement("span");
  title.className = "bookmark-node-label";
  title.textContent = tab.title;
  const detail = document.createElement("span");
  detail.className = "tab-choice-detail";
  detail.textContent = tab.url || t("此标签页暂时无法保存");
  choiceLabel.append(title, detail);
  row.append(checkbox, choiceLabel);
  return row;
}

function renderBookmarkNode(node, depth, selection, expandedFolderIds, rerender) {
  const wrapper = document.createElement("div");
  wrapper.className = "bookmark-tree-node";
  const row = document.createElement("div");
  row.className = "bookmark-tree-row";
  row.style.setProperty("--bookmark-indent", `${depth * 20}px`);
  row.setAttribute("role", "treeitem");

  const isFolder = !node.url;
  const descendantIds = isFolder ? getDescendantBookmarkIds(node) : [node.id];
  const selectedCount = descendantIds.filter((id) => selection.has(id)).length;

  const disclosure = document.createElement("button");
  disclosure.type = "button";
  disclosure.className = "bookmark-disclosure";
  disclosure.ariaLabel = expandedFolderIds.has(node.id) ? t("折叠文件夹") : t("展开文件夹");
  disclosure.innerHTML = isFolder
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`
    : "";
  disclosure.disabled = !isFolder;
  if (isFolder) {
    const isExpanded = expandedFolderIds.has(node.id);
    disclosure.setAttribute("aria-expanded", String(isExpanded));
    row.setAttribute("aria-expanded", String(isExpanded));
    if (isExpanded) disclosure.classList.add("is-expanded");
  }
  disclosure.addEventListener("click", () => {
    if (expandedFolderIds.has(node.id)) {
      expandedFolderIds.delete(node.id);
    } else {
      expandedFolderIds.add(node.id);
    }
    rerender();
  });

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = createId("bookmark-choice");
  checkbox.checked = descendantIds.length > 0 && selectedCount === descendantIds.length;
  checkbox.indeterminate = selectedCount > 0 && selectedCount < descendantIds.length;
  checkbox.disabled = descendantIds.length === 0;
  const nodeName = node.title || node.url || t("未命名");
  const partialDescription = checkbox.indeterminate
    ? t("partialSelection", { selected: selectedCount, total: descendantIds.length })
    : "";
  checkbox.ariaLabel = t("selectBookmarkNode", {
    kind: isFolder ? "folder" : "site",
    name: nodeName,
    detail: partialDescription,
  });
  if (checkbox.disabled) checkbox.title = t("此文件夹没有网站");
  checkbox.addEventListener("change", () => {
    const shouldSelect = checkbox.checked;
    descendantIds.forEach((id) => {
      if (shouldSelect) selection.add(id);
      else selection.delete(id);
    });
    rerender();
  });

  const choiceLabel = document.createElement("label");
  choiceLabel.className = "bookmark-choice-label";
  choiceLabel.htmlFor = checkbox.id;
  choiceLabel.title = checkbox.disabled ? t("此文件夹没有网站") : (node.url || node.title || "");

  const label = document.createElement("span");
  label.className = "bookmark-node-label";
  label.textContent = nodeName;
  choiceLabel.append(label);

  if (checkbox.indeterminate) {
    const selectedStatus = document.createElement("span");
    selectedStatus.className = "bookmark-selection-status";
    selectedStatus.textContent = `${selectedCount}/${descendantIds.length}`;
    selectedStatus.setAttribute("aria-hidden", "true");
    choiceLabel.append(selectedStatus);
  }

  row.append(disclosure, checkbox, choiceLabel);
  wrapper.append(row);

  if (isFolder && expandedFolderIds.has(node.id) && Array.isArray(node.children)) {
    node.children.forEach((child) => {
      wrapper.append(renderBookmarkNode(child, depth + 1, selection, expandedFolderIds, rerender));
    });
  }

  return wrapper;
}

function getBookmarkDisplayNodes(tree) {
  if (!Array.isArray(tree)) return [];
  if (tree.length === 1 && !tree[0].url && !tree[0].title && Array.isArray(tree[0].children)) {
    return tree[0].children;
  }
  return tree;
}

function getDescendantBookmarkIds(node) {
  if (node.url) return [node.id];
  if (!Array.isArray(node.children)) return [];
  return node.children.flatMap((child) => getDescendantBookmarkIds(child));
}

function flattenSelectedBookmarks(tree, selectedIds) {
  const sites = [];

  const visit = (node) => {
    if (node.url && selectedIds.has(node.id)) {
      const url = String(node.url);
      const name = String(node.title || "").trim() || getSiteFallbackName(url);
      sites.push({ id: createId("site"), name, url });
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };

  tree.forEach(visit);
  return sites;
}

async function requestBookmarksPermission() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.permissions?.request) return false;

  return new Promise((resolve) => {
    chromeApi.permissions.request({ permissions: ["bookmarks"] }, (granted) => {
      if (chromeApi.runtime?.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function loadBookmarksTree() {
  const chromeApi = getChromeApi();
  return new Promise((resolve, reject) => {
    if (!chromeApi?.bookmarks?.getTree) {
      reject(new Error("Bookmarks API unavailable"));
      return;
    }

    chromeApi.bookmarks.getTree((tree) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      resolve(Array.isArray(tree) ? tree : []);
    });
  });
}

async function requestTabsPermission() {
  const chromeApi = getChromeApi();
  if (!chromeApi?.permissions?.request) return false;

  return new Promise((resolve) => {
    chromeApi.permissions.request({ permissions: ["tabs"] }, (granted) => {
      if (chromeApi.runtime?.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(granted));
    });
  });
}

function loadCurrentWindowTabs() {
  const chromeApi = getChromeApi();
  return new Promise((resolve, reject) => {
    if (!chromeApi?.tabs?.query) {
      reject(new Error("Tabs API unavailable"));
      return;
    }

    chromeApi.tabs.query({ currentWindow: true }, (tabs) => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      resolve((Array.isArray(tabs) ? tabs : []).map(normalizeOpenTab));
    });
  });
}

function normalizeOpenTab(tab) {
  const url = String(tab?.pendingUrl || tab?.url || "").trim();
  const pageTitle = String(tab?.title || "").trim();
  const title = pageTitle || url || t("未命名网站");
  const tabId = tab?.id ?? createId("unavailable-tab");
  return {
    key: JSON.stringify([tabId, url]),
    title,
    name: pageTitle || getSiteFallbackName(url) || t("未命名网站"),
    url,
  };
}

function flattenSelectedTabs(tabs, selectedKeys) {
  return tabs
    .filter((tab) => tab.url && selectedKeys.has(tab.key))
    .map((tab) => ({
      id: createId("site"),
      name: tab.name,
      url: tab.url,
    }));
}

function openSiteForm(workspaceId, site = null, returnFocus = null) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  const returnWorkspaceId = getActiveWorkspaceId();
  const isEditing = Boolean(site);
  const currentModal = getCurrentModal();
  const originModal = !isEditing && currentModal && getActiveWorkspaceId() === workspaceId
    ? { ...currentModal }
    : null;
  const trigger = returnFocus || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  let bookmarkTree = [];
  let selectedBookmarkIds = new Set();
  let openTabs = [];
  let selectedOpenTabKeys = new Set();
  const dialog = createDialog("small");
  const cancelSiteForm = () => {
    if (originModal?.dialog) {
      setActiveWorkspaceId(workspaceId);
      showModal(originModal.dialog, () => {
        const target = trigger?.isConnected
          ? trigger
          : originModal.dialog.querySelector(".add-site-preview, .empty-state .button");
        target?.focus();
      }, {
        onDismiss: originModal.onDismiss,
        dismissOnBackdrop: originModal.dismissOnBackdrop,
      });
      return;
    }
    closeModal({ restoreFocus: false });
    if (returnWorkspaceId) {
      openWorkspaceDialogApp(returnWorkspaceId);
      return;
    }
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
  };
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(isEditing ? t("编辑网站") : t("添加网站")));
  if (!isEditing) {
    header.append(createIconButton(t("关闭"), "M6 6l12 12M18 6 6 18", cancelSiteForm));
  }

  const form = document.createElement("form");
  form.className = "form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="field">
      <label for="siteName">${t("名称")}</label>
      <input id="siteName" name="name" autocomplete="off" maxlength="80">
    </div>
    <div class="field">
      <label for="siteUrl">URL</label>
      <input id="siteUrl" name="url" autocomplete="off" required inputmode="url" aria-describedby="siteUrlError">
      <p class="field-error" id="siteUrlError" role="status" hidden></p>
    </div>
  `;
  form.elements.name.value = site?.name || "";
  form.elements.url.value = site?.url || "";
  const siteUrlInput = form.elements.url;
  siteUrlInput.required = isEditing;
  const siteUrlError = form.querySelector("#siteUrlError");
  const validateSiteUrl = () => {
    const rawUrl = siteUrlInput.value.trim();
    const rawName = form.elements.name.value.trim();
    const hasImportedSites = selectedBookmarkIds.size > 0 || selectedOpenTabKeys.size > 0;
    let message = "";
    if (rawUrl) {
      message = getUrlValidationError(rawUrl);
    } else if (!isEditing && rawName) {
      message = t("填写名称后还需要填写 URL。");
    } else if (!isEditing && !hasImportedSites) {
      message = t("请输入 URL，或从书签、标签页选择网站。");
    } else if (isEditing) {
      message = t("URL 不能为空。");
    }
    setFieldError(siteUrlInput, siteUrlError, message);
    return !message;
  };
  siteUrlInput.addEventListener("blur", () => {
    if (isEditing || siteUrlInput.value.trim() || form.elements.name.value.trim()) {
      validateSiteUrl();
    }
  });
  siteUrlInput.addEventListener("input", () => {
    if (!siteUrlError.hidden) setFieldError(siteUrlInput, siteUrlError);
    updateSubmitAvailability();
  });

  let submitButton = null;
  const updateSubmitAvailability = () => {
    if (isEditing || !submitButton) return;
    const hasImportedSites = selectedBookmarkIds.size > 0 || selectedOpenTabKeys.size > 0;
    const hasContent = Boolean(
      form.elements.url.value.trim()
      || form.elements.name.value.trim()
      || hasImportedSites,
    );
    submitButton.disabled = !hasContent;
    if (
      hasImportedSites
      && !form.elements.url.value.trim()
      && !form.elements.name.value.trim()
      && !siteUrlError.hidden
    ) {
      setFieldError(siteUrlInput, siteUrlError);
    }
  };
  form.elements.name.addEventListener("input", updateSubmitAvailability);

  if (!isEditing) {
    const importBlock = document.createElement("div");
    importBlock.className = "bookmark-import-block";
    importBlock.innerHTML = `
      <div class="bookmark-import-heading">${t("从书签添加")}</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">${t("选择文件夹或网站")}</span>
        <span class="bookmark-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">${t("所选文件夹中的网站将被平铺添加，不会保留原有文件夹结构。")}</p>
      <p class="form-message error" role="status" hidden></p>
    `;
    const bookmarkSelectButton = createButton(t("选择书签"), null, {
      variant: "secondary",
      size: "small",
      loadingText: t("读取中"),
    });
    bookmarkSelectButton.classList.add("bookmark-select-button");
    importBlock.querySelector(".bookmark-select-button-slot").replaceWith(bookmarkSelectButton);
    const bookmarkSummary = importBlock.querySelector(".bookmark-import-summary");
    const bookmarkError = importBlock.querySelector(".form-message");

    const updateBookmarkSummary = () => {
      const count = selectedBookmarkIds.size;
      bookmarkSummary.textContent = count > 0 ? t("selectedSiteCount", { count }) : t("选择文件夹或网站");
      bookmarkSummary.classList.toggle("has-selection", count > 0);
      const label = count > 0 ? t("修改") : t("选择书签");
      bookmarkSelectButton.dataset.defaultLabel = label;
      bookmarkSelectButton.querySelector(".button-label").textContent = label;
      bookmarkSelectButton.classList.toggle("is-compact", count > 0);
      updateSubmitAvailability();
    };

    bookmarkSelectButton.addEventListener("click", async () => {
      bookmarkError.hidden = true;
      setButtonLoading(bookmarkSelectButton, true);
      try {
        const granted = await requestBookmarksPermission();
        if (!granted) {
          bookmarkError.textContent = t("未获得书签访问权限，你仍可手动添加网站。");
          bookmarkError.hidden = false;
          return;
        }
        const nextBookmarkTree = await loadBookmarksTree();
        const availableBookmarkIds = new Set(nextBookmarkTree.flatMap((node) => getDescendantBookmarkIds(node)));
        const availableSelection = new Set(
          Array.from(selectedBookmarkIds).filter((id) => availableBookmarkIds.has(id)),
        );
        openBookmarkPicker(nextBookmarkTree, availableSelection, {
          onCancel: () => showModal(dialog, () => bookmarkSelectButton.focus()),
          onConfirm: (nextSelection) => {
            bookmarkTree = nextBookmarkTree;
            selectedBookmarkIds = nextSelection;
            updateBookmarkSummary();
            showModal(dialog, () => bookmarkSelectButton.focus());
          },
        });
      } catch {
        bookmarkError.textContent = t("无法读取 Chrome 书签，请稍后重试。");
        bookmarkError.hidden = false;
      } finally {
        setButtonLoading(bookmarkSelectButton, false);
      }
    });
    form.append(importBlock);

    const tabImportBlock = document.createElement("div");
    tabImportBlock.className = "bookmark-import-block";
    tabImportBlock.innerHTML = `
      <div class="bookmark-import-heading">${t("从打开的标签页添加")}</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">${t("选择当前窗口中的标签页")}</span>
        <span class="tab-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">${t("选择当前窗口中需要保存的网站。")}</p>
      <p class="form-message error" role="status" hidden></p>
    `;
    const tabSelectButton = createButton(t("选择标签页"), null, {
      variant: "secondary",
      size: "small",
      loadingText: t("读取中"),
    });
    tabSelectButton.classList.add("bookmark-select-button");
    tabImportBlock.querySelector(".tab-select-button-slot").replaceWith(tabSelectButton);
    const tabSummary = tabImportBlock.querySelector(".bookmark-import-summary");
    const tabError = tabImportBlock.querySelector(".form-message");

    const updateTabSummary = () => {
      const count = selectedOpenTabKeys.size;
      tabSummary.textContent = count > 0 ? t("selectedTabCount", { count }) : t("选择当前窗口中的标签页");
      tabSummary.classList.toggle("has-selection", count > 0);
      const label = count > 0 ? t("重新选择") : t("选择标签页");
      tabSelectButton.dataset.defaultLabel = label;
      tabSelectButton.querySelector(".button-label").textContent = label;
      tabSelectButton.classList.toggle("is-compact", count > 0);
      updateSubmitAvailability();
    };

    tabSelectButton.addEventListener("click", async () => {
      tabError.hidden = true;
      setButtonLoading(tabSelectButton, true);
      try {
        const granted = await requestTabsPermission();
        if (!granted) {
          tabError.textContent = t("未获得标签页访问权限，你仍可手动添加网站或从书签添加。");
          tabError.hidden = false;
          return;
        }
        const nextOpenTabs = await loadCurrentWindowTabs();
        const availableKeys = new Set(nextOpenTabs.map((tab) => tab.key));
        const availableSelection = new Set(
          Array.from(selectedOpenTabKeys).filter((key) => availableKeys.has(key)),
        );
        openTabPicker(nextOpenTabs, availableSelection, {
          onCancel: () => showModal(dialog, () => tabSelectButton.focus()),
          onConfirm: (nextSelection) => {
            openTabs = nextOpenTabs;
            selectedOpenTabKeys = nextSelection;
            updateTabSummary();
            showModal(dialog, () => tabSelectButton.focus());
          },
        });
      } catch {
        tabError.textContent = t("无法读取当前窗口的标签页，请稍后重试。");
        tabError.hidden = false;
      } finally {
        setButtonLoading(tabSelectButton, false);
      }
    });
    form.append(tabImportBlock);
  }

  dialog.querySelector(".dialog-content").append(form);
  submitButton = createButton(isEditing ? t("保存") : t("添加"), () => form.requestSubmit(), {
    variant: "primary",
    loadingText: isEditing ? t("保存中") : t("添加中"),
  });
  if (isEditing) {
    dialog.querySelector(".dialog-footer").append(
      createButton(t("取消"), cancelSiteForm),
      submitButton,
    );
  } else {
    dialog.querySelector(".dialog-footer").append(submitButton);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    if (!validateSiteUrl()) {
      siteUrlInput.focus();
      return;
    }
    setButtonLoading(submitButton, true);
    const previousSite = site ? { name: site.name, url: site.url } : null;
    let addedCount = 0;

    try {
      if (site) {
        const url = normalizeUrl(siteUrlInput.value);
        const name = form.elements.name.value.trim() || getSiteFallbackName(url);
        site.name = name;
        site.url = url;
        await saveState();
      } else {
        const sites = [];
        if (siteUrlInput.value.trim()) {
          const url = normalizeUrl(siteUrlInput.value);
          sites.push({
            id: createId("site"),
            name: form.elements.name.value.trim() || getSiteFallbackName(url),
            url,
          });
        }
        sites.push(
          ...flattenSelectedBookmarks(bookmarkTree, selectedBookmarkIds),
          ...flattenSelectedTabs(openTabs, selectedOpenTabKeys),
        );
        addedCount = sites.length;
        await appendSitesToLatestWorkspaceApp(workspaceId, sites);
      }

      closeModal({ restoreFocus: false });
      renderApp();
      if (returnWorkspaceId === workspaceId) openWorkspaceDialogApp(workspaceId);
      showToast(
        isEditing ? t("网站已更新") : (addedCount === 1 ? t("网站已添加") : t("addedSiteCount", { count: addedCount })),
        "success",
      );
    } catch (error) {
      if (site && previousSite) {
        site.name = previousSite.name;
        site.url = previousSite.url;
      }
      if (!site && error?.code === "WORKSPACE_NOT_FOUND") {
        closeModal({ restoreFocus: false });
        renderApp();
        showToast(t("工作区已不存在。"), "error");
        return;
      }
      showToast(isEditing ? t("无法保存网站。请重试。") : t("无法添加网站。请重试。"), "error");
    } finally {
      if (dialog.isConnected) {
        setButtonLoading(submitButton, false);
        updateSubmitAvailability();
      }
    }
  });

  updateSubmitAvailability();
  showModal(dialog, () => form.elements.url.focus(), {
    onDismiss: cancelSiteForm,
    returnFocus: trigger,
  });
}


export { configureForms, openSiteForm, openWorkspaceForm };
