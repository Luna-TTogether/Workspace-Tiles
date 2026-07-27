const STORAGE_KEY = "workspaceTilesState";
const grid = document.getElementById("workspaceGrid");
const emptyPageState = document.getElementById("emptyPageState");
const backdrop = document.getElementById("modalBackdrop");
const menuLayer = document.getElementById("menuLayer");
const tileTemplate = document.getElementById("workspaceTileTemplate");

let state = { workspaces: [] };
let activeWorkspaceId = null;
let previewPages = {};
let previewWheelLocks = {};

document.addEventListener("DOMContentLoaded", init);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    closeModal();
  }
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
  state = data;

  return new Promise((resolve) => {
    const chromeApi = getChromeApi();
    if (!chromeApi?.storage?.local) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      resolve();
      return;
    }

    chromeApi.storage.local.set({ [STORAGE_KEY]: data }, resolve);
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
  const tileBody = node.querySelector(".tile-body");
  const title = node.querySelector("h2");
  const count = node.querySelector("p");
  const preview = node.querySelector(".favicon-preview");
  const openAllButton = node.querySelector(".open-all-button");
  const moreButton = node.querySelector(".more-workspace-button");

  title.textContent = workspace.name;
  count.textContent = workspace.sites.length > 0 ? `${workspace.sites.length} 个网站` : "空工作区";
  count.hidden = false;
  openAllButton.hidden = workspace.sites.length === 0;

  if (workspace.sites.length === 0) {
    preview.append(wrapPreviewItem(createAddSitePreviewButton(workspace.id)));
    tileBody.addEventListener("click", () => openSiteForm(workspace.id));
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
      tileBody.append(renderPreviewDots(workspace.id, currentPage, pageCount));
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
    openSiteForm(workspaceId);
  });
  return button;
}

function wrapPreviewItem(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "favicon-preview-cell";
  wrapper.append(item);
  return wrapper;
}

function renderPreviewDots(workspaceId, currentPage, pageCount) {
  const dots = document.createElement("div");
  dots.className = "preview-dots";
  dots.setAttribute("aria-label", "网站预览分页");

  Array.from({ length: pageCount }).forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = index === currentPage ? "preview-dot is-active" : "preview-dot";
    dot.ariaLabel = `第 ${index + 1} 页`;
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      previewPages[workspaceId] = index;
      render();
    });
    dots.append(dot);
  });

  return dots;
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
      onAction: () => openSiteForm(workspace.id),
      compact: true,
    }));
  } else {
    const siteGrid = document.createElement("div");
    siteGrid.className = "site-grid";
    workspace.sites.forEach((site) => siteGrid.append(renderDialogSiteItem(workspace.id, site)));
    siteGrid.append(createAddSitePreviewButton(workspace.id));
    content.append(siteGrid);
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

function openWorkspaceForm(workspace = null) {
  const isEditing = Boolean(workspace);
  const dialog = createDialog("small");
  const header = dialog.querySelector(".dialog-header");
  header.append(createDialogTitle(isEditing ? "重命名工作区" : "新建工作区"));
  if (!isEditing) {
    header.append(createIconButton("关闭", "M6 6l12 12M18 6 6 18", closeModal));
  }
  let bookmarkTree = [];
  let selectedBookmarkIds = new Set();

  const form = document.createElement("form");
  form.className = "form";
  form.innerHTML = `
    <div class="field">
      <label for="workspaceName">工作区名称</label>
      <input id="workspaceName" name="name" autocomplete="off" required maxlength="60">
    </div>
  `;
  form.elements.name.value = workspace?.name || "";

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

        bookmarkTree = await loadBookmarksTree();
        openBookmarkPicker(bookmarkTree, selectedBookmarkIds, {
          onCancel: () => showModal(dialog, () => selectButton.focus()),
          onConfirm: (nextSelection) => {
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
    const name = form.elements.name.value.trim();
    if (!name) return;
    setButtonLoading(submitButton, true);

    try {
      if (workspace) {
        workspace.name = name;
      } else {
        const sites = flattenSelectedBookmarks(bookmarkTree, selectedBookmarkIds);
        state.workspaces.push({ id: createId("workspace"), name, sites });
      }

      await saveState();
      closeModal();
      render();
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  showModal(dialog, () => form.elements.name.focus());
}

function openBookmarkPicker(tree, confirmedSelection, { onCancel, onConfirm }) {
  const draftSelection = new Set(confirmedSelection);
  const expandedFolderIds = new Set();
  const dialog = createDialog("bookmark-picker-dialog");
  const closeButton = createIconButton("关闭", "M6 6l12 12M18 6 6 18", onCancel);
  dialog.querySelector(".dialog-header").append(createDialogTitle("选择书签"), closeButton);

  const content = dialog.querySelector(".dialog-content");
  content.classList.add("bookmark-picker-content");
  const treeGroup = document.createElement("fieldset");
  treeGroup.className = "bookmark-tree-group";
  const treeLegend = document.createElement("legend");
  treeLegend.className = "visually-hidden";
  treeLegend.textContent = "Chrome 书签";
  const treeContainer = document.createElement("div");
  treeContainer.className = "bookmark-tree";
  treeContainer.setAttribute("role", "tree");
  treeGroup.append(treeLegend, treeContainer);
  content.append(treeGroup);

  const confirmButton = createButton("确认选择", () => onConfirm(new Set(draftSelection)), { variant: "primary" });
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

    const confirmLabel = `确认选择（${draftSelection.size}）`;
    confirmButton.dataset.defaultLabel = confirmLabel;
    confirmButton.querySelector(".button-label").textContent = confirmLabel;
    treeContainer.scrollTop = scrollTop;
  };

  renderTree();
  showModal(dialog);
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
  disclosure.textContent = isFolder ? "›" : "";
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

  const icon = document.createElement("span");
  icon.className = isFolder ? "bookmark-node-icon folder" : "bookmark-node-icon site";
  icon.textContent = isFolder ? "▰" : "●";
  icon.setAttribute("aria-hidden", "true");

  const choiceLabel = document.createElement("label");
  choiceLabel.className = "bookmark-choice-label";
  choiceLabel.htmlFor = checkbox.id;
  choiceLabel.title = checkbox.disabled ? "此文件夹没有网站" : (node.url || node.title || "");

  const label = document.createElement("span");
  label.className = "bookmark-node-label";
  label.textContent = nodeName;
  choiceLabel.append(icon, label);

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

function openSiteForm(workspaceId, site = null) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  const returnWorkspaceId = activeWorkspaceId;
  const isEditing = Boolean(site);
  const dialog = createDialog("small");
  dialog.querySelector(".dialog-header").append(createDialogTitle(isEditing ? "编辑网站" : "添加网站"));

  const form = document.createElement("form");
  form.className = "form";
  form.innerHTML = `
    <div class="field">
      <label for="siteName">名称</label>
      <input id="siteName" name="name" autocomplete="off" maxlength="80">
    </div>
    <div class="field">
      <label for="siteUrl">URL</label>
      <input id="siteUrl" name="url" autocomplete="off" required inputmode="url">
    </div>
  `;
  form.elements.name.value = site?.name || "";
  form.elements.url.value = site?.url || "";

  dialog.querySelector(".dialog-content").append(form);
  const submitButton = createButton("保存", () => form.requestSubmit(), {
    variant: "primary",
    loadingText: "保存中",
  });
  dialog.querySelector(".dialog-footer").append(
    createButton("取消", () => {
      closeModal();
      if (returnWorkspaceId) openWorkspaceDialog(returnWorkspaceId);
    }),
    submitButton,
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const url = normalizeUrl(form.elements.url.value);
    if (!url) return;
    setButtonLoading(submitButton, true);

    try {
      const name = form.elements.name.value.trim() || getSiteFallbackName(url);
      if (site) {
        site.name = name;
        site.url = url;
      } else {
        workspace.sites.push({ id: createId("site"), name, url });
      }

      await saveState();
      closeModal();
      render();
      openWorkspaceDialog(workspace.id);
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  showModal(dialog, () => form.elements.url.focus());
}

async function deleteWorkspace(workspaceId) {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return;

  if (!window.confirm(`删除工作区“${workspace.name}”？`)) return;
  state.workspaces = state.workspaces.filter((item) => item.id !== workspaceId);
  await saveState();
  render();
}

async function deleteSite(workspaceId, siteId) {
  const workspace = getWorkspace(workspaceId);
  const site = workspace?.sites.find((item) => item.id === siteId);
  if (!workspace || !site) return;

  if (!window.confirm(`删除网站“${site.name}”？`)) return;
  workspace.sites = workspace.sites.filter((item) => item.id !== siteId);
  await saveState();
  closeModal();
  render();
  openWorkspaceDialog(workspaceId);
}

function openAllMenu(anchor, workspace) {
  closeMenu();
  if (!workspace.sites.length) return;

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu";
  menu.innerHTML = `
    <button type="button" data-action="current">当前窗口打开</button>
    <button type="button" data-action="new">新窗口打开</button>
  `;

  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 96)}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;

  menu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "current") {
      openAllCurrentWindow(workspace.sites);
      closeMenu();
    }
    if (action === "new") {
      openAllNewWindow(workspace.sites);
      closeMenu();
    }
  });

  menuLayer.hidden = false;
  menuLayer.append(menu);
  menuLayer.addEventListener("click", closeMenu, { once: true });
}

function openWorkspaceMoreMenu(anchor, workspace) {
  closeMenu();

  const rect = anchor.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "open-menu workspace-more-menu";
  menu.innerHTML = `
    <button type="button" data-action="rename">重命名</button>
    <button type="button" data-action="delete" class="danger-menu-item">删除工作区</button>
  `;

  menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 96)}px`;
  menu.style.left = `${Math.min(rect.left - 116, window.innerWidth - 180)}px`;

  menu.addEventListener("click", (event) => {
    const action = event.target?.dataset?.action;
    if (action === "rename") {
      closeMenu();
      openWorkspaceForm(workspace);
    }
    if (action === "delete") {
      closeMenu();
      deleteWorkspace(workspace.id);
    }
  });

  menuLayer.hidden = false;
  menuLayer.append(menu);
  menuLayer.addEventListener("click", closeMenu, { once: true });
}

function closeMenu() {
  menuLayer.hidden = true;
  menuLayer.replaceChildren();
}

function openUrl(url) {
  if (isJavascriptUrl(url)) {
    window.alert("此书签工具需要在目标网页中使用");
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
    window.alert("此工作区只包含需要在目标网页中使用的书签工具");
    return;
  }
  openableSites.slice(1).forEach((site) => openUrlInNewTab(site.url));
  openUrl(openableSites[0].url);
}

function openAllNewWindow(sites) {
  const urls = sites.filter((site) => !isJavascriptUrl(site.url)).map((site) => site.url);
  if (!urls.length) {
    window.alert("此工作区只包含需要在目标网页中使用的书签工具");
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

function showModal(dialog, afterPaint) {
  closeMenu();
  backdrop.replaceChildren(dialog);
  backdrop.hidden = false;
  requestAnimationFrame(() => afterPaint?.());
}

function closeModal() {
  activeWorkspaceId = null;
  backdrop.hidden = true;
  backdrop.replaceChildren();
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
