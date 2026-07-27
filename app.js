const STORAGE_KEY = "workspaceTilesState";
const grid = document.getElementById("workspaceGrid");
const emptyPageState = document.getElementById("emptyPageState");
const backdrop = document.getElementById("modalBackdrop");
const menuLayer = document.getElementById("menuLayer");
const toastRegion = document.getElementById("toastRegion");
const tileTemplate = document.getElementById("workspaceTileTemplate");

let state = { workspaces: [] };
let activeWorkspaceId = null;
let previewPages = {};
let previewWheelLocks = {};
let currentModal = null;
let toastTimer = null;
let menuReturnFocus = null;

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!menuLayer.hidden) {
      closeMenu();
    } else if (!backdrop.hidden) {
      dismissModal();
    }
    return;
  }

  if (event.key === "Tab" && currentModal) {
    trapModalFocus(event, currentModal.dialog);
  }
});
backdrop.addEventListener("click", (event) => {
  if (event.target === backdrop && currentModal?.dismissOnBackdrop) {
    dismissModal();
  }
});
menuLayer.addEventListener("click", (event) => {
  if (event.target === menuLayer) closeMenu();
});

async function init() {
  state = await loadState();
  render();
}

function loadState() {
  return new Promise((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      resolve(readLocalFallback());
      return;
    }

    chromeApi.storage.local.get(STORAGE_KEY, (result) => {
      resolve(normalizeState(result[STORAGE_KEY]));
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
      resolve();
      return;
    }

    chromeApi.storage.local.set({ [STORAGE_KEY]: data }, () => {
      if (chromeApi.runtime?.lastError) {
        reject(new Error(chromeApi.runtime.lastError.message));
        return;
      }
      state = data;
      resolve();
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
      name: String(workspace.name || "未命名工作区").trim() || "未命名工作区",
      sites: Array.isArray(workspace.sites)
        ? workspace.sites.map((site) => normalizeSite(site)).filter(Boolean)
        : [],
    })),
  };
}

function normalizeSite(site) {
  if (!site || !site.url) {
    return null;
  }

  const url = normalizeUrl(site.url);
  if (!url) return null;
  const name = String(site.name || getSiteFallbackName(url)).trim() || getSiteFallbackName(url);
  return {
    id: site.id || createId("site"),
    name,
    url,
  };
}

function render() {
  grid.replaceChildren();
  emptyPageState.replaceChildren();

  const isEmpty = state.workspaces.length === 0;
  grid.hidden = isEmpty;
  emptyPageState.hidden = !isEmpty;

  if (isEmpty) {
    emptyPageState.append(createEmptyState({
      title: "还没有工作区",
      description: "创建工作区来组织常用网站，之后可以一键打开整组工具。",
      actionLabel: "新建工作区",
      onAction: () => openWorkspaceForm(),
    }));
    return;
  }

  state.workspaces.forEach((workspace) => {
    grid.append(renderWorkspaceTile(workspace));
  });

  grid.append(renderAddWorkspaceTile());
}

function renderWorkspaceTile(workspace) {
  const node = tileTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.workspaceId = workspace.id;
  const tileBody = node.querySelector(".tile-body");
  const title = node.querySelector(".workspace-open-button");
  const count = node.querySelector("p");
  const preview = node.querySelector(".favicon-preview");
  const openAllButton = node.querySelector(".open-all-button");
  const moreButton = node.querySelector(".more-workspace-button");

  title.textContent = workspace.name;
  count.textContent = workspace.sites.length > 0 ? `${workspace.sites.length} 个网站` : "空工作区";
  count.hidden = false;
  openAllButton.hidden = workspace.sites.length === 0;

  if (workspace.sites.length === 0) {
    const addSiteButton = createAddSitePreviewButton(workspace.id);
    preview.append(wrapPreviewItem(addSiteButton));
    tileBody.addEventListener("click", () => openSiteForm(workspace.id, null, addSiteButton));
  } else {
    const pageSize = 16;
    const pageCount = Math.ceil(workspace.sites.length / pageSize);
    const currentPage = Math.min(previewPages[workspace.id] || 0, pageCount - 1);
    const pageSites = workspace.sites.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

    pageSites.forEach((site) => {
      const favicon = createFaviconButton(site, "favicon-mini");
      favicon.addEventListener("click", (event) => {
        event.stopPropagation();
        openUrl(site.url);
      });
      preview.append(wrapPreviewItem(favicon));
    });
    if (currentPage === pageCount - 1 && pageSites.length < pageSize) {
      preview.append(wrapPreviewItem(createAddSitePreviewButton(workspace.id)));
    }
    if (pageCount > 1) {
      node.classList.add("has-pagination");
      node.append(renderPreviewPagination(workspace.id, currentPage, pageCount));
      tileBody.addEventListener("wheel", (event) => handlePreviewWheel(event, workspace.id, currentPage, pageCount), { passive: false });
    }
    tileBody.addEventListener("click", () => openWorkspaceDialog(workspace.id));
  }

  openAllButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openAllMenu(event.currentTarget, workspace);
  });
  moreButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openWorkspaceMoreMenu(event.currentTarget, workspace);
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
  render();
  window.setTimeout(() => {
    previewWheelLocks[workspaceId] = false;
  }, 420);
}

function createAddSitePreviewButton(workspaceId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "favicon-mini add-site-preview";
  button.ariaLabel = "添加网站";
  button.innerHTML = `
    <span class="favicon-visual add-site-preview-icon" aria-hidden="true">
      <span class="add-site-preview-frame">
        <svg viewBox="0 0 24 24">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </span>
    </span>
    <span class="favicon-mini-name">添加网站</span>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openSiteForm(workspaceId, null, event.currentTarget);
  });
  return button;
}

function wrapPreviewItem(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "favicon-preview-cell";
  wrapper.append(item);
  return wrapper;
}

function renderPreviewPagination(workspaceId, currentPage, pageCount) {
  const pagination = document.createElement("nav");
  pagination.className = "preview-pagination";
  pagination.setAttribute("aria-label", "网站预览分页");

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "preview-pagination-button";
  previousButton.dataset.pageAction = "previous";
  previousButton.ariaLabel = "上一页网站";
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
  nextButton.ariaLabel = "下一页网站";
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
  render();

  if (!focusAction) return;
  requestAnimationFrame(() => {
    const tile = Array.from(grid.querySelectorAll(".workspace-tile"))
      .find((item) => item.dataset.workspaceId === workspaceId);
    tile?.querySelector(`[data-page-action="${focusAction}"]`)?.focus();
  });
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
      <span>新建工作区</span>
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
  icon.append(createFavicon(site));
  button.append(icon);
  if (className.includes("favicon-mini")) {
    const label = document.createElement("span");
    label.className = "favicon-mini-name";
    label.textContent = site.name;
    button.append(label);
  }
  return button;
}

function createFavicon(site) {
  if (!isHttpUrl(site.url)) {
    const fallback = document.createElement("span");
    fallback.textContent = getInitial(site.name);
    return fallback;
  }

  const img = document.createElement("img");
  img.alt = "";
  img.src = getFaviconUrl(site.url);
  img.addEventListener("error", () => {
    const fallback = document.createElement("span");
    fallback.textContent = getInitial(site.name);
    img.replaceWith(fallback);
  }, { once: true });
  return img;
}

function openWorkspaceDialog(workspaceId) {
  activeWorkspaceId = workspaceId;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  const dialog = createDialog();
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.innerHTML = `<h1></h1><p></p>`;
  title.querySelector("h1").textContent = workspace.name;
  title.querySelector("p").textContent = `${workspace.sites.length} 个网站`;

  const openButton = createOpenAllIconButton((event) => openAllMenu(event.currentTarget, workspace));
  const moreButton = createMoreIconButton((event) => openWorkspaceMoreMenu(event.currentTarget, workspace));
  const closeButton = createIconButton("关闭", "M6 6l12 12M18 6 6 18", closeModal);

  const header = dialog.querySelector(".dialog-header");
  header.append(title, openButton, moreButton, closeButton);

  const content = dialog.querySelector(".dialog-content");
  if (workspace.sites.length === 0) {
    content.append(createEmptyState({
      title: "这个工作区还没有网站",
      description: "添加第一个网站，之后就可以从新标签页快速打开。",
      actionLabel: "添加网站",
      onAction: (event) => openSiteForm(workspace.id, null, event.currentTarget),
      compact: true,
    }));
  } else {
    const siteGrid = document.createElement("div");
    siteGrid.className = "site-grid";
    const addSiteButton = createAddSitePreviewButton(workspace.id);
    siteGrid.append(addSiteButton);
    content.append(siteGrid);

    const batchSize = 64;
    let renderedSiteCount = 0;
    let updateScrollAffordance = () => {};

    const appendNextBatch = () => {
      const nextSites = workspace.sites.slice(renderedSiteCount, renderedSiteCount + batchSize);
      const fragment = document.createDocumentFragment();
      nextSites.forEach((site) => fragment.append(renderDialogSiteItem(workspace.id, site)));
      siteGrid.insertBefore(fragment, addSiteButton);
      renderedSiteCount += nextSites.length;
      requestAnimationFrame(updateScrollAffordance);
    };

    appendNextBatch();
    updateScrollAffordance = enableScrollAffordance(content);
    content.addEventListener("scroll", () => {
      updateScrollAffordance();
      const distanceToBottom = content.scrollHeight - content.scrollTop - content.clientHeight;
      if (distanceToBottom < 180 && renderedSiteCount < workspace.sites.length) {
        appendNextBatch();
      }
    });
    requestAnimationFrame(updateScrollAffordance);
  }

  showModal(dialog);
}

function renderDialogSiteItem(workspaceId, site) {
  const wrapper = document.createElement("div");
  wrapper.className = "site-card";

  const siteButton = createFaviconButton(site, "favicon-mini dialog-site-item");
  siteButton.title = site.url;
  siteButton.addEventListener("click", () => openUrl(site.url));

  const actions = document.createElement("div");
  actions.className = "site-card-actions";
  actions.append(
    createIconButton("编辑", "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z", () => openSiteForm(workspaceId, site)),
    createIconButton("删除", "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6", () => deleteSite(workspaceId, site.id), true),
  );

  wrapper.append(siteButton, actions);
  return wrapper;
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

function openWorkspaceForm(workspace = null, returnFocus = null) {
  const isEditing = Boolean(workspace);
  const dialog = createDialog("small");
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(isEditing ? "重命名工作区" : "新建工作区"));
  if (!isEditing) {
    header.append(createIconButton("关闭", "M6 6l12 12M18 6 6 18", closeModal));
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
      <label for="workspaceName">工作区名称</label>
      <input id="workspaceName" name="name" autocomplete="off" required maxlength="60" aria-describedby="workspaceNameError">
      <p class="field-error" id="workspaceNameError" role="status" hidden></p>
    </div>
  `;
  form.elements.name.value = workspace?.name || "";
  const workspaceNameInput = form.elements.name;
  const workspaceNameError = form.querySelector("#workspaceNameError");
  const validateWorkspaceName = () => {
    const message = workspaceNameInput.value.trim() ? "" : "工作区名称不能为空。";
    setFieldError(workspaceNameInput, workspaceNameError, message);
    return !message;
  };
  workspaceNameInput.addEventListener("blur", validateWorkspaceName);
  workspaceNameInput.addEventListener("input", () => {
    if (!workspaceNameError.hidden && workspaceNameInput.value.trim()) {
      setFieldError(workspaceNameInput, workspaceNameError);
    }
  });

  if (!isEditing) {
    const importBlock = document.createElement("div");
    importBlock.className = "bookmark-import-block";
    importBlock.innerHTML = `
      <div class="bookmark-import-heading">从书签添加</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">选择文件夹或网站</span>
        <span class="bookmark-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">所选文件夹中的网站将被平铺添加，不会保留原有文件夹结构。</p>
      <p class="form-message error" role="status" hidden></p>
    `;

    const selectButton = createButton("选择书签", null, {
      variant: "secondary",
      size: "small",
      loadingText: "读取中",
    });
    selectButton.classList.add("bookmark-select-button");
    importBlock.querySelector(".bookmark-select-button-slot").replaceWith(selectButton);
    const summary = importBlock.querySelector(".bookmark-import-summary");
    const error = importBlock.querySelector(".form-message");

    const updateImportSummary = () => {
      const count = selectedBookmarkIds.size;
      summary.textContent = count > 0 ? `已选择 ${count} 个网站` : "选择文件夹或网站";
      summary.classList.toggle("has-selection", count > 0);
      const buttonLabel = count > 0 ? "修改" : "选择书签";
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
          error.textContent = "未获得书签访问权限，你仍可手动添加网站。";
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
        error.textContent = "无法读取 Chrome 书签，请稍后重试。";
        error.hidden = false;
      } finally {
        setButtonLoading(selectButton, false);
      }
    });

    form.append(importBlock);

    const tabImportBlock = document.createElement("div");
    tabImportBlock.className = "bookmark-import-block";
    tabImportBlock.innerHTML = `
      <div class="bookmark-import-heading">从打开的标签页添加</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">选择当前窗口中的标签页</span>
        <span class="tab-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">选择当前窗口中需要保存的网站。</p>
      <p class="form-message error" role="status" hidden></p>
    `;

    const tabSelectButton = createButton("选择标签页", null, {
      variant: "secondary",
      size: "small",
      loadingText: "读取中",
    });
    tabSelectButton.classList.add("bookmark-select-button");
    tabImportBlock.querySelector(".tab-select-button-slot").replaceWith(tabSelectButton);
    const tabSummary = tabImportBlock.querySelector(".bookmark-import-summary");
    const tabError = tabImportBlock.querySelector(".form-message");

    const updateTabImportSummary = () => {
      const count = selectedOpenTabKeys.size;
      tabSummary.textContent = count > 0 ? `已选择 ${count} 个标签页` : "选择当前窗口中的标签页";
      tabSummary.classList.toggle("has-selection", count > 0);
      const buttonLabel = count > 0 ? "重新选择" : "选择标签页";
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
          tabError.textContent = "未获得标签页访问权限，你仍可手动添加网站或从书签添加。";
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
        tabError.textContent = "无法读取当前窗口的标签页，请稍后重试。";
        tabError.hidden = false;
      } finally {
        setButtonLoading(tabSelectButton, false);
      }
    });

    form.append(tabImportBlock);
  }

  dialog.querySelector(".dialog-content").append(form);
  const footer = dialog.querySelector(".dialog-footer");
  const submitButton = createButton(isEditing ? "保存" : "创建", () => form.requestSubmit(), {
    variant: "primary",
    loadingText: isEditing ? "保存中" : "创建中",
  });
  if (isEditing) {
    footer.append(
      createButton("取消", closeModal),
      submitButton,
    );
  } else {
    footer.append(submitButton);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
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
        state.workspaces.push({ id: newWorkspaceId, name, sites });
      }

      await saveState();
      closeModal();
      render();
      showToast(isEditing ? "工作区已重命名" : "工作区已创建", "success");
    } catch {
      if (workspace) {
        workspace.name = previousName;
      } else {
        state.workspaces = state.workspaces.filter((item) => item.id !== newWorkspaceId);
      }
      showToast("无法保存工作区。请重试。", "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  showModal(dialog, () => form.elements.name.focus(), { returnFocus });
}

function openBookmarkPicker(tree, confirmedSelection, {
  onCancel,
  onConfirm,
  confirmLabel = "确认选择",
  loadingText = "处理中",
  requireSelection = false,
}) {
  const draftSelection = new Set(confirmedSelection);
  const expandedFolderIds = new Set();
  const picker = createSelectionPicker("选择书签", "Chrome 书签", onCancel);
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
        title: "没有可选择的书签",
        description: "请先在 Chrome 中创建书签，然后再返回这里选择。",
        compact: true,
      }));
    } else {
      displayNodes.forEach((node) => {
        treeContainer.append(renderBookmarkNode(node, 0, draftSelection, expandedFolderIds, renderTree));
      });
    }

    dialogTitle.querySelector("h1").textContent = `选择书签（${draftSelection.size}）`;
    confirmButton.disabled = requireSelection && draftSelection.size === 0;
    treeContainer.scrollTop = scrollTop;
  };

  renderTree();
  showModal(dialog, null, { onDismiss: onCancel });
}

function createSelectionPicker(title, legend, onCancel) {
  const dialog = createDialog("bookmark-picker-dialog");
  const dialogTitle = createDialogTitle(`${title}（0）`);
  const closeButton = createIconButton("关闭", "M6 6l12 12M18 6 6 18", onCancel);
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
  confirmLabel = "确认选择",
  loadingText = "处理中",
  requireSelection = false,
}) {
  const draftSelection = new Set(confirmedSelection);
  const picker = createSelectionPicker("选择标签页", "当前窗口标签页", onCancel);
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

    dialogTitle.querySelector("h1").textContent = `选择标签页（${draftSelection.size}）`;
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
  checkbox.ariaLabel = allSelected ? "取消全选标签页" : "全选标签页";
  if (checkbox.disabled) checkbox.title = "没有可保存的标签页";
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
  choiceLabel.title = checkbox.disabled ? "没有可保存的标签页" : "选择或取消选择全部可保存的标签页";

  const label = document.createElement("span");
  label.className = "bookmark-node-label";
  label.textContent = "全选";
  const count = document.createElement("span");
  count.className = "tab-select-all-count";
  count.textContent = `共有 ${selectableTabs.length} 个`;
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
    ? `选择标签页 ${tab.title}`
    : `标签页 ${tab.title} 暂时无法保存`;
  if (checkbox.disabled) checkbox.title = "此标签页暂时无法保存";
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selection.add(tab.key);
    else selection.delete(tab.key);
    rerender();
  });

  const choiceLabel = document.createElement("label");
  choiceLabel.className = "bookmark-choice-label tab-choice-label";
  choiceLabel.htmlFor = checkbox.id;
  choiceLabel.title = tab.url || "此标签页暂时无法保存";

  const title = document.createElement("span");
  title.className = "bookmark-node-label";
  title.textContent = tab.title;
  const detail = document.createElement("span");
  detail.className = "tab-choice-detail";
  detail.textContent = tab.url || "此标签页暂时无法保存";
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
  disclosure.ariaLabel = expandedFolderIds.has(node.id) ? "折叠文件夹" : "展开文件夹";
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
  const nodeName = node.title || node.url || "未命名";
  const partialDescription = checkbox.indeterminate ? `，已选择 ${selectedCount}/${descendantIds.length}` : "";
  checkbox.ariaLabel = `选择${isFolder ? "文件夹" : "网站"} ${nodeName}${partialDescription}`;
  if (checkbox.disabled) checkbox.title = "此文件夹没有网站";
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
  choiceLabel.title = checkbox.disabled ? "此文件夹没有网站" : (node.url || node.title || "");

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
  const title = pageTitle || url || "未命名网站";
  const tabId = tab?.id ?? createId("unavailable-tab");
  return {
    key: JSON.stringify([tabId, url]),
    title,
    name: pageTitle || getSiteFallbackName(url) || "未命名网站",
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

  const returnWorkspaceId = activeWorkspaceId;
  const isEditing = Boolean(site);
  const originModal = !isEditing && currentModal && activeWorkspaceId === workspaceId
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
      activeWorkspaceId = workspaceId;
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
      openWorkspaceDialog(returnWorkspaceId);
      return;
    }
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
  };
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(isEditing ? "编辑网站" : "添加网站"));
  if (!isEditing) {
    header.append(createIconButton("关闭", "M6 6l12 12M18 6 6 18", cancelSiteForm));
  }

  const form = document.createElement("form");
  form.className = "form";
  form.noValidate = true;
  form.innerHTML = `
    <div class="field">
      <label for="siteName">名称</label>
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
      message = "填写名称后还需要填写 URL。";
    } else if (!isEditing && !hasImportedSites) {
      message = "请输入 URL，或从书签、标签页选择网站。";
    } else if (isEditing) {
      message = "URL 不能为空。";
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
      <div class="bookmark-import-heading">从书签添加</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">选择文件夹或网站</span>
        <span class="bookmark-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">所选文件夹中的网站将被平铺添加，不会保留原有文件夹结构。</p>
      <p class="form-message error" role="status" hidden></p>
    `;
    const bookmarkSelectButton = createButton("选择书签", null, {
      variant: "secondary",
      size: "small",
      loadingText: "读取中",
    });
    bookmarkSelectButton.classList.add("bookmark-select-button");
    importBlock.querySelector(".bookmark-select-button-slot").replaceWith(bookmarkSelectButton);
    const bookmarkSummary = importBlock.querySelector(".bookmark-import-summary");
    const bookmarkError = importBlock.querySelector(".form-message");

    const updateBookmarkSummary = () => {
      const count = selectedBookmarkIds.size;
      bookmarkSummary.textContent = count > 0 ? `已选择 ${count} 个网站` : "选择文件夹或网站";
      bookmarkSummary.classList.toggle("has-selection", count > 0);
      const label = count > 0 ? "修改" : "选择书签";
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
          bookmarkError.textContent = "未获得书签访问权限，你仍可手动添加网站。";
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
        bookmarkError.textContent = "无法读取 Chrome 书签，请稍后重试。";
        bookmarkError.hidden = false;
      } finally {
        setButtonLoading(bookmarkSelectButton, false);
      }
    });
    form.append(importBlock);

    const tabImportBlock = document.createElement("div");
    tabImportBlock.className = "bookmark-import-block";
    tabImportBlock.innerHTML = `
      <div class="bookmark-import-heading">从打开的标签页添加</div>
      <div class="bookmark-import-selection">
        <span class="bookmark-import-summary">选择当前窗口中的标签页</span>
        <span class="tab-select-button-slot"></span>
      </div>
      <p class="bookmark-import-help">选择当前窗口中需要保存的网站。</p>
      <p class="form-message error" role="status" hidden></p>
    `;
    const tabSelectButton = createButton("选择标签页", null, {
      variant: "secondary",
      size: "small",
      loadingText: "读取中",
    });
    tabSelectButton.classList.add("bookmark-select-button");
    tabImportBlock.querySelector(".tab-select-button-slot").replaceWith(tabSelectButton);
    const tabSummary = tabImportBlock.querySelector(".bookmark-import-summary");
    const tabError = tabImportBlock.querySelector(".form-message");

    const updateTabSummary = () => {
      const count = selectedOpenTabKeys.size;
      tabSummary.textContent = count > 0 ? `已选择 ${count} 个标签页` : "选择当前窗口中的标签页";
      tabSummary.classList.toggle("has-selection", count > 0);
      const label = count > 0 ? "重新选择" : "选择标签页";
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
          tabError.textContent = "未获得标签页访问权限，你仍可手动添加网站或从书签添加。";
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
        tabError.textContent = "无法读取当前窗口的标签页，请稍后重试。";
        tabError.hidden = false;
      } finally {
        setButtonLoading(tabSelectButton, false);
      }
    });
    form.append(tabImportBlock);
  }

  dialog.querySelector(".dialog-content").append(form);
  submitButton = createButton(isEditing ? "保存" : "添加", () => form.requestSubmit(), {
    variant: "primary",
    loadingText: isEditing ? "保存中" : "添加中",
  });
  if (isEditing) {
    dialog.querySelector(".dialog-footer").append(
      createButton("取消", cancelSiteForm),
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
        await appendSitesToLatestWorkspace(workspaceId, sites);
      }

      closeModal({ restoreFocus: false });
      render();
      openWorkspaceDialog(workspaceId);
      showToast(
        isEditing ? "网站已更新" : (addedCount === 1 ? "网站已添加" : `已添加 ${addedCount} 个网站`),
        "success",
      );
    } catch (error) {
      if (site && previousSite) {
        site.name = previousSite.name;
        site.url = previousSite.url;
      }
      if (!site && error?.code === "WORKSPACE_NOT_FOUND") {
        closeModal({ restoreFocus: false });
        render();
        showToast("工作区已不存在。", "error");
        return;
      }
      showToast(isEditing ? "无法保存网站。请重试。" : "无法添加网站。请重试。", "error");
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

function openDestructiveModal({ title, description, actionLabel, loadingText, onConfirm, successMessage, onSuccess, returnFocus = null }) {
  const parentModal = currentModal;
  const dialog = createDialog("small destructive-dialog");
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(title));

  const body = document.createElement("p");
  body.className = "destructive-dialog-copy";
  body.textContent = description;
  dialog.querySelector(".dialog-content").append(body);

  const cancel = () => {
    if (parentModal?.dialog) {
      showModal(parentModal.dialog, null, {
        onDismiss: parentModal.onDismiss,
        dismissOnBackdrop: parentModal.dismissOnBackdrop,
      });
    } else {
      closeModal();
    }
  };
  const cancelButton = createButton("取消", cancel);
  cancelButton.dataset.autofocus = "true";
  const confirmButton = createButton(actionLabel, null, {
    variant: "danger",
    loadingText,
  });
  confirmButton.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });
  confirmButton.addEventListener("click", async () => {
    if (confirmButton.disabled) return;
    setButtonLoading(confirmButton, true);
    try {
      await onConfirm();
      closeModal({ restoreFocus: false });
      onSuccess?.();
      showToast(successMessage, "success");
    } catch {
      showToast("无法完成删除。请重试。", "error");
    } finally {
      setButtonLoading(confirmButton, false);
    }
  });

  dialog.querySelector(".dialog-footer").append(cancelButton, confirmButton);
  showModal(dialog, null, {
    onDismiss: cancel,
    dismissOnBackdrop: false,
    returnFocus,
  });
}

function deleteWorkspace(workspaceId, returnFocus = null) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  const siteCountText = workspace.sites.length ? `及其中的 ${workspace.sites.length} 个网站` : "";
  openDestructiveModal({
    title: "删除工作区",
    description: `将删除“${workspace.name}”${siteCountText}。此操作无法撤销。`,
    actionLabel: "删除工作区",
    loadingText: "删除中",
    onConfirm: async () => {
      const previousWorkspaces = state.workspaces;
      state.workspaces = state.workspaces.filter((item) => item.id !== workspaceId);
      try {
        await saveState();
      } catch (error) {
        state.workspaces = previousWorkspaces;
        throw error;
      }
    },
    onSuccess: render,
    successMessage: "工作区已删除",
    returnFocus,
  });
}

function deleteSite(workspaceId, siteId) {
  const workspace = getWorkspace(workspaceId);
  const site = workspace?.sites.find((item) => item.id === siteId);
  if (!workspace || !site) return;

  openDestructiveModal({
    title: "删除网站",
    description: `将从该工作区中删除“${site.name}”。此操作无法撤销。`,
    actionLabel: "删除网站",
    loadingText: "删除中",
    onConfirm: async () => {
      const previousSites = workspace.sites;
      workspace.sites = workspace.sites.filter((item) => item.id !== siteId);
      try {
        await saveState();
      } catch (error) {
        workspace.sites = previousSites;
        throw error;
      }
    },
    onSuccess: () => {
      render();
      openWorkspaceDialog(workspaceId);
    },
    successMessage: "网站已删除",
  });
}

async function appendSitesToLatestWorkspace(workspaceId, sites) {
  const previousState = state;
  const latestState = await loadStateForUpdate();
  const workspace = latestState.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    state = latestState;
    const error = new Error("Workspace not found");
    error.code = "WORKSPACE_NOT_FOUND";
    throw error;
  }

  workspace.sites.push(...sites);
  state = latestState;
  try {
    await saveState();
  } catch (error) {
    state = previousState;
    throw error;
  }
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

function openAllMenu(anchor, workspace) {
  closeMenu({ restoreFocus: false });
  if (!workspace.sites.length) return;

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-action="current">当前窗口打开</button>
    <button type="button" role="menuitem" data-action="new">新窗口打开</button>
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

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu workspace-more-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <button type="button" role="menuitem" data-action="rename">重命名</button>
    <button type="button" role="menuitem" data-action="delete" class="danger-menu-item">删除工作区</button>
  `;

  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 96)}px`;
  menu.style.left = `${Math.min(rect.left - 116, window.innerWidth - 180)}px`;

  menu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "rename") {
      closeMenu({ restoreFocus: false });
      openWorkspaceForm(workspace, anchor);
    }
    if (action === "delete") {
      closeMenu({ restoreFocus: false });
      deleteWorkspace(workspace.id, anchor);
    }
  });

  showMenu(menu, anchor);
}

function showMenu(menu, anchor) {
  menuReturnFocus = anchor;
  const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
  menu.addEventListener("keydown", (event) => {
    const currentIndex = items.indexOf(document.activeElement);
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  });
  menuLayer.hidden = false;
  menuLayer.append(menu);
  requestAnimationFrame(() => items[0]?.focus());
}

function closeMenu({ restoreFocus = true } = {}) {
  const returnFocus = menuReturnFocus;
  menuReturnFocus = null;
  menuLayer.hidden = true;
  menuLayer.replaceChildren();
  if (restoreFocus && returnFocus?.isConnected) {
    requestAnimationFrame(() => returnFocus.focus());
  }
}

function openUrl(url) {
  if (isJavascriptUrl(url)) {
    showToast("此书签工具需要在目标网页中使用");
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

function openAllCurrentWindow(sites) {
  const openableSites = sites.filter((site) => !isJavascriptUrl(site.url));
  if (!openableSites.length) {
    showToast("此工作区只包含需要在目标网页中使用的书签工具");
    return;
  }
  openableSites.slice(1).forEach((site) => openUrlInNewTab(site.url));
  openUrl(openableSites[0].url);
}

function openAllNewWindow(sites) {
  const urls = sites.filter((site) => !isJavascriptUrl(site.url)).map((site) => site.url);
  if (!urls.length) {
    showToast("此工作区只包含需要在目标网页中使用的书签工具");
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

function setFieldError(input, errorElement, message = "") {
  const hasError = Boolean(message);
  input.setAttribute("aria-invalid", String(hasError));
  errorElement.textContent = message;
  errorElement.hidden = !hasError;
}

function getUrlValidationError(value) {
  const raw = String(value || "").trim();
  if (!raw) return "URL 不能为空。";

  const protocol = getUrlProtocol(raw);
  if (protocol === "http" || protocol === "https") {
    try {
      const parsed = new URL(raw);
      return parsed.hostname ? "" : "URL 格式无效。";
    } catch {
      return "URL 格式无效。";
    }
  }

  return normalizeUrl(raw) ? "" : "URL 格式无效。";
}

function showToast(message, type = "message", duration = 3600) {
  window.clearTimeout(toastTimer);
  toastRegion.replaceChildren();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastRegion.append(toast);
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
      if (toast.isConnected) toast.remove();
    }, 160);
  }, duration);
}

function createEmptyState({ title, description, actionLabel = "", onAction = null, compact = false }) {
  const emptyState = document.createElement("section");
  emptyState.className = compact ? "empty-state is-compact" : "empty-state";

  const icon = document.createElement("div");
  icon.className = "empty-state-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z"></path>
    </svg>
  `;

  const copy = document.createElement("div");
  copy.className = "empty-state-copy";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const body = document.createElement("p");
  body.textContent = description;
  copy.append(heading, body);
  emptyState.append(icon, copy);

  if (actionLabel && onAction) {
    emptyState.append(createButton(actionLabel, onAction, { variant: "primary" }));
  }

  return emptyState;
}

function createDialog(size = "") {
  const dialog = document.createElement("section");
  dialog.className = `dialog ${size}`.trim();
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.innerHTML = `
    <header class="dialog-header"></header>
    <div class="dialog-content"></div>
    <footer class="dialog-footer"></footer>
  `;
  return dialog;
}

function showModal(dialog, afterPaint, { onDismiss = null, dismissOnBackdrop = true, returnFocus = null } = {}) {
  closeMenu({ restoreFocus: false });
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!dialog._returnFocus) {
    dialog._returnFocus = returnFocus || activeElement;
  }

  const title = dialog.querySelector(".dialog-title h1");
  if (title) {
    if (!title.id) title.id = createId("dialog-title");
    dialog.setAttribute("aria-labelledby", title.id);
  }

  dialog.tabIndex = -1;
  currentModal = { dialog, onDismiss, dismissOnBackdrop };
  backdrop.replaceChildren(dialog);
  backdrop.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    afterPaint?.();
    if (!dialog.contains(document.activeElement)) {
      const initialFocus = dialog.querySelector("[data-autofocus]") || getFocusableElements(dialog)[0] || dialog;
      initialFocus.focus();
    }
  });
}

function closeModal({ restoreFocus = true } = {}) {
  const returnFocus = currentModal?.dialog?._returnFocus;
  activeWorkspaceId = null;
  currentModal = null;
  backdrop.hidden = true;
  backdrop.replaceChildren();
  document.body.classList.remove("modal-open");

  if (restoreFocus && returnFocus?.isConnected) {
    requestAnimationFrame(() => returnFocus.focus());
  }
}

function dismissModal() {
  const onDismiss = currentModal?.onDismiss;
  if (onDismiss) {
    onDismiss();
  } else {
    closeModal();
  }
}

function getFocusableElements(container) {
  const selector = [
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "a[href]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll(selector))
    .filter((element) => (
      !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && element.getClientRects().length > 0
    ));
}

function trapModalFocus(event, dialog) {
  const focusable = getFocusableElements(dialog);
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function createDialogTitle(text) {
  const title = document.createElement("div");
  title.className = "dialog-title";
  title.innerHTML = `<h1></h1>`;
  title.querySelector("h1").textContent = text;
  return title;
}

function createButton(text, onClick, { variant = "secondary", size = "medium", loadingText = "处理中" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${variant} ${size}`;
  button.dataset.defaultLabel = text;
  button.dataset.loadingLabel = loadingText;

  const spinner = document.createElement("span");
  spinner.className = "button-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "button-label";
  label.textContent = text;
  button.append(spinner, label);
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

function setButtonLoading(button, isLoading) {
  if (!button) return;
  const label = button.querySelector(".button-label");
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.setAttribute("aria-busy", String(isLoading));
  if (label) {
    label.textContent = isLoading ? button.dataset.loadingLabel : button.dataset.defaultLabel;
  }
}

function createOpenAllIconButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button";
  button.title = "打开全部";
  button.ariaLabel = "打开全部";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3h6v6"></path>
      <path d="M10 14 21 3"></path>
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function createMoreIconButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-button more-workspace-button";
  button.title = "更多";
  button.ariaLabel = "更多";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.7"></circle>
      <circle cx="12" cy="12" r="1.7"></circle>
      <circle cx="18" cy="12" r="1.7"></circle>
    </svg>
  `;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function createIconButton(label, pathData, onClick, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "icon-button danger" : "icon-button";
  button.title = label;
  button.ariaLabel = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${pathData}"></path></svg>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick(event);
  });
  return button;
}

function getWorkspace(workspaceId) {
  return state.workspaces.find((workspace) => workspace.id === workspaceId);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[a-z][a-z\d+\-.]*:/i.test(raw)) return raw;
  const withProtocol = `https://${raw}`;

  try {
    return new URL(withProtocol).href;
  } catch {
    return "";
  }
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getSiteFallbackName(url) {
  return getDomain(url) || String(url || "").trim() || "未命名网站";
}

function getUrlProtocol(url) {
  const match = String(url || "").trim().match(/^([a-z][a-z\d+\-.]*):/i);
  return match ? match[1].toLowerCase() : "";
}

function isHttpUrl(url) {
  const protocol = getUrlProtocol(url);
  return protocol === "http" || protocol === "https";
}

function isJavascriptUrl(url) {
  return getUrlProtocol(url) === "javascript";
}

function getFaviconUrl(url) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=64`;
}

function getInitial(name) {
  return String(name || "?").trim().charAt(0) || "?";
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getChromeApi() {
  return typeof chrome === "undefined" ? null : chrome;
}
