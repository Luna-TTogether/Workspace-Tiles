const STORAGE_KEY = "workspaceTilesLanguage";
  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = new Set(["zh-CN", "en"]);

  const english = {
    "菜单": "Menu",
    "Workspace Tiles 菜单": "Workspace Tiles menu",
    "管理功能": "Management",
    "导出备份": "Export backup",
    "导入恢复": "Import backup",
    "语言": "Language",
    "关于": "About",
    "将当前所有工作区、网站和排列顺序保存为一个 JSON 备份文件。备份只会保存到你选择的位置，不会上传到服务器。": "Save all current workspaces, sites, and their sort order as a JSON backup file. The backup is saved only to the location you choose and is never uploaded.",
    "建议在卸载插件、迁移电脑或进行重要调整前导出备份。": "Export a backup before uninstalling the extension, moving to another computer, or making major changes.",
    "选择保存位置": "Choose save location",
    "正在导出": "Exporting…",
    "备份已导出": "Backup exported",
    "无法导出备份。请重试。": "Couldn’t export the backup. Try again.",
    "导入会完整替换当前所有工作区、网站和排列顺序，不会与当前数据合并。": "Importing completely replaces all current workspaces, sites, and their sort order. It will not merge with your current data.",
    "建议先导出当前数据作为备份。": "Export your current data first as a backup.",
    "选择备份文件": "Choose backup file",
    "正在读取": "Reading…",
    "备份文件超过 10 MB，无法导入。": "The backup file is larger than 10 MB and can’t be imported.",
    "无法导入：文件不是有效的 JSON。": "Couldn’t import: the file is not valid JSON.",
    "无法导入：这不是有效的 Workspace Tiles 备份文件。": "Couldn’t import: this is not a valid Workspace Tiles backup file.",
    "Workspace Tiles JSON 备份": "Workspace Tiles JSON backup",
    "无法导入：这不是 Workspace Tiles 创建的备份文件。": "Couldn’t import: this backup was not created by Workspace Tiles.",
    "无法导入：备份结构版本无效。": "Couldn’t import: the backup schema version is invalid.",
    "无法导入：该备份由更新版本的 Workspace Tiles 创建。": "Couldn’t import: this backup was created by a newer version of Workspace Tiles.",
    "无法导入：备份时间信息无效。": "Couldn’t import: the backup date is invalid.",
    "无法导入：备份缺少插件版本信息。": "Couldn’t import: the backup is missing the extension version.",
    "无法导入：备份中的工作区数据无效。": "Couldn’t import: the workspace data in the backup is invalid.",
    "无法导入：备份中包含无效的工作区。": "Couldn’t import: the backup contains an invalid workspace.",
    "无法导入：工作区 ID 缺失或重复。": "Couldn’t import: a workspace ID is missing or duplicated.",
    "无法导入：工作区名称或网站列表无效。": "Couldn’t import: a workspace name or site list is invalid.",
    "无法导入：备份中包含无效的网站。": "Couldn’t import: the backup contains an invalid site.",
    "无法导入：网站 ID 缺失或重复。": "Couldn’t import: a site ID is missing or duplicated.",
    "无法导入：网站名称无效。": "Couldn’t import: a site name is invalid.",
    "无法导入：备份中包含无效的网址。": "Couldn’t import: the backup contains an invalid URL.",
    "导入并替换当前数据？": "Import and replace current data?",
    "导入并替换": "Import and replace",
    "正在导入": "Importing…",
    "导入失败，当前数据未更改": "Import failed. Current data was not changed.",
    "数据已恢复": "Data restored",
    "选择界面语言。更改会立即应用并保存在此设备上。": "Choose the interface language. Changes apply immediately and are saved on this device.",
    "简体中文": "Simplified Chinese",
    "英语": "English",
    "无法保存语言设置。请重试。": "Couldn’t save the language setting. Try again.",
    "无法保存数据升级，请重试。": "Couldn’t save the data upgrade. Try again.",
    "未命名工作区": "Untitled workspace",
    "未命名网站": "Untitled site",
    "还没有工作区": "No workspaces yet",
    "创建工作区来组织常用网站，之后可以一键打开整组工具。": "Create a workspace to organize frequently used sites and open the whole set at once.",
    "新建工作区": "New workspace",
    "空工作区": "Empty workspace",
    "添加网站": "Add site",
    "网站预览分页": "Site preview pages",
    "上一页网站": "Previous site page",
    "下一页网站": "Next site page",
    "关闭": "Close",
    "这个工作区还没有网站": "No sites in this workspace",
    "添加第一个网站，之后就可以从新标签页快速打开。": "Add your first site to open it quickly from the new tab page.",
    "编辑": "Edit",
    "删除": "Delete",
    "顺序未改变": "Order unchanged",
    "已取消排序": "Reordering canceled",
    "排序已保存": "Sort order saved",
    "工作区已不存在。": "The workspace no longer exists.",
    "无法保存排序。请重试。": "Couldn’t save the sort order. Try again.",
    "无法保存排序，已恢复原顺序": "Couldn’t save the sort order. The original order was restored.",
    "重命名工作区": "Rename workspace",
    "工作区名称": "Workspace name",
    "工作区名称不能为空。": "Workspace name can’t be empty.",
    "例如：设计工作": "For example: Design work",
    "添加网站来源": "Add sites from",
    "书签": "Bookmarks",
    "从书签添加": "Add from bookmarks",
    "选择文件夹或网站": "Select folders or sites",
    "所选文件夹中的网站将被平铺添加，不会保留原有文件夹结构。": "Sites in selected folders will be added as a flat list. The original folder structure will not be preserved.",
    "选择书签": "Select bookmarks",
    "读取中": "Reading…",
    "修改": "Change",
    "未获得书签访问权限，你仍可手动添加网站。": "Bookmark access wasn’t granted. You can still add sites manually.",
    "无法读取 Chrome 书签，请稍后重试。": "Couldn’t read Chrome bookmarks. Try again later.",
    "打开的标签页": "Open tabs",
    "选择当前窗口中的标签页": "Select tabs in the current window",
    "选择当前窗口中需要保存的网站。": "Select the sites in the current window that you want to save.",
    "选择标签页": "Select tabs",
    "重新选择": "Reselect",
    "未获得标签页访问权限，你仍可手动添加网站或从书签添加。": "Tab access wasn’t granted. You can still add sites manually or from bookmarks.",
    "无法读取当前窗口的标签页，请稍后重试。": "Couldn’t read tabs in the current window. Try again later.",
    "保存": "Save",
    "创建": "Create",
    "保存中": "Saving…",
    "创建中": "Creating…",
    "取消": "Cancel",
    "工作区已重命名": "Workspace renamed",
    "工作区已创建": "Workspace created",
    "无法保存工作区。请重试。": "Couldn’t save the workspace. Try again.",
    "确认选择": "Confirm selection",
    "处理中": "Working…",
    "Chrome 书签": "Chrome bookmarks",
    "没有可选择的书签": "No bookmarks available",
    "请先在 Chrome 中创建书签，然后再返回这里选择。": "Create bookmarks in Chrome, then return here to select them.",
    "当前窗口标签页": "Tabs in current window",
    "取消全选标签页": "Deselect all tabs",
    "全选标签页": "Select all tabs",
    "没有可保存的标签页": "No tabs available to save",
    "选择或取消选择全部可保存的标签页": "Select or deselect all tabs that can be saved",
    "全选": "Select all",
    "此标签页暂时无法保存": "This tab can’t be saved",
    "折叠文件夹": "Collapse folder",
    "展开文件夹": "Expand folder",
    "未命名": "Untitled",
    "文件夹": "folder",
    "网站": "site",
    "此文件夹没有网站": "This folder contains no sites",
    "编辑网站": "Edit site",
    "名称": "Name",
    "选填，留空将使用网站域名": "Optional. Leave blank to use the site domain",
    "粘贴 URL 或输入域名": "Paste a URL or enter a domain",
    "填写名称后还需要填写 URL。": "Enter a URL for this name.",
    "请输入 URL，或从书签、标签页选择网站。": "Enter a URL, or select sites from bookmarks or tabs.",
    "URL 不能为空。": "URL can’t be empty.",
    "URL 格式无效。": "Enter a valid URL.",
    "添加": "Add",
    "添加中": "Adding…",
    "网站已更新": "Site updated",
    "网站已添加": "Site added",
    "正在添加当前网站": "Adding current site…",
    "保存当前页面": "Save current page",
    "网站名称": "Site name",
    "推荐": "Recommended",
    "AI 正在推荐": "AI is recommending…",
    "使用 AI 推荐？": "Use AI recommendations?",
    "为了推荐工作区和网站名称，会将页面标题、摘要和域名经 Supabase 发送给 DeepSeek。不发送 Cookie、表单内容、截图或完整浏览记录。": "To recommend a workspace and site name, the page title, summary, and domain are sent to DeepSeek through Supabase. Cookies, form content, screenshots, and full browsing history are not sent.",
    "暂不使用": "Not now",
    "同意并推荐": "Agree and recommend",
    "开启 AI 推荐": "Enable AI recommendations",
    "AI 推荐": "AI recommended",
    "通用": "General",
    "Workspace Tiles 可以根据打开的标签页整理 Workspace。": "Workspace Tiles can organize a workspace from your open tabs.",
    "开启后，页面标题、摘要和域名会发送给 AI 服务来生成建议。": "When enabled, page titles, summaries, and domains are sent to an AI service to generate suggestions.",
    "注意，不会发送 Cookie、表单内容或完整浏览记录。可以随时关闭。": "Cookies, form content, and full browsing history are not sent. You can turn this off at any time.",
    "根据当前页面内容建议网站名称和 Workspace。": "Suggest a site name and workspace based on the current page.",
    "暂不开启": "Not now",
    "开启 AI": "Enable AI",
    "开启中": "Enabling…",
    "关闭 AI": "Disable AI",
    "关闭中": "Disabling…",
    "AI 当前已开启": "AI is currently enabled",
    "AI 当前未开启": "AI is currently disabled",
    "AI 推荐已开启": "AI recommendations enabled",
    "AI 推荐已关闭": "AI recommendations disabled",
    "AI 已开启": "AI enabled",
    "AI 已关闭": "AI disabled",
    "无法读取 AI 设置，请重试。": "Couldn’t read the AI setting. Try again.",
    "AI 已建议名称": "AI suggested a name",
    "最近使用": "Recently used",
    "更多 Workspace": "More workspaces",
    "从当前窗口新建 Workspace": "New workspace from this window",
    "查看建议": "View suggestion",
    "创建一个工作区来保存当前页面。": "Create a workspace to save this page.",
    "新建空 Workspace": "New empty workspace",
    "无法保存 AI 设置，请重试。": "Couldn’t save the AI setting. Try again.",
    "未获得标签页访问权限，你仍可保存到已有 Workspace。": "Tab access wasn’t granted. You can still save to an existing workspace.",
    "需要标签页访问权限才能从当前窗口新建 Workspace。你仍可新建空 Workspace。": "Tab access is required to create a workspace from this window. You can still create an empty workspace.",
    "编辑网站": "Edit site",
    "完成": "Done",
    "请先创建工作区，再回来保存当前页面。": "Create a workspace first, then return to save this page.",
    "无法添加网站": "Couldn’t add site",
    "无法读取当前页面，请切换到普通网页后重试。": "This page can’t be read. Switch to a regular webpage and try again.",
    "无法添加网站，请重试。": "Couldn’t add the site. Try again.",
    "重试": "Try again",
    "网站已不存在。": "The site no longer exists.",
    "无法保存修改，请重试。": "Couldn’t save the changes. Try again.",
    "无法删除网站，请重试。": "Couldn’t delete the site. Try again.",
    "无法保存网站。请重试。": "Couldn’t save the site. Try again.",
    "无法添加网站。请重试。": "Couldn’t add the site. Try again.",
    "无法完成删除。请重试。": "Couldn’t complete the deletion. Try again.",
    "删除工作区": "Delete workspace",
    "删除中": "Deleting…",
    "工作区已删除": "Workspace deleted",
    "删除网站": "Delete site",
    "网站已删除": "Site deleted",
    "撤销": "Undo",
    "恢复中": "Restoring…",
    "网站已恢复": "Site restored",
    "无法撤销删除。请重试。": "Couldn’t undo the deletion. Try again.",
    "当前窗口打开": "Open in current window",
    "新窗口打开": "Open in new window",
    "在当前窗口打开": "Open in current window",
    "在新窗口打开": "Open in new window",
    "重命名": "Rename",
    "卡片大小": "Card size",
    "小": "Small",
    "中": "Medium",
    "大": "Large",
    "卡片大小已更新": "Card size updated",
    "无法保存卡片大小。请重试。": "Couldn’t save the card size. Try again.",
    "无法保存展开状态。请重试。": "Couldn’t save the expanded workspace state. Try again.",
    "此书签工具需要在目标网页中使用": "This bookmarklet must be used on its target page.",
    "此工作区只包含需要在目标网页中使用的书签工具": "This workspace contains only bookmarklets that must be used on their target pages.",
    "打开全部": "Open all",
    "更多": "More",
    "便签": "Notes",
    "查看便签": "View Notes",
    "查看网站": "View sites",
    "打开工作区": "Open workspace",
    "编辑便签": "Edit Notes",
    "写点什么……": "Write something…",
    "便签内容": "Note content",
    "输入 - [ ] 创建创建 todo。": "Type - [ ] to create a todo.",
    "便签内容不能超过 10,000 个字符。": "Notes can’t exceed 10,000 characters.",
    "无法保存便签。请重试。": "Couldn’t save the note. Try again.",
    "无法保存卡片显示状态。请重试。": "Couldn’t save the card view. Try again.",
    "放弃未保存的修改？": "Discard unsaved changes?",
    "便签中的未保存内容将丢失。": "Unsaved changes to this note will be lost.",
    "继续编辑": "Keep editing",
    "放弃修改": "Discard changes",
    "工作区": "Workspace",
    "Google 搜索": "Google search",
    "使用 Google 搜索……": "Search Google…",
    "工作区空状态": "Empty workspace state",
    "按空格键或回车键开始排序，使用方向键移动，按空格键或回车键保存，按 Escape 取消。": "Press Space or Enter to start reordering. Use the arrow keys to move. Press Space or Enter to save, or Escape to cancel.",
  };

  const englishTemplates = {
    workspaceField: () => "Workspace",
    exportMenuLabel: () => "Export",
    importMenuLabel: () => "Import",
    siteCount: ({ count }) => `${count} ${Number(count) === 1 ? "site" : "sites"}`,
    workspaceCount: ({ count }) => `${count} ${Number(count) === 1 ? "workspace" : "workspaces"}`,
    tabCount: ({ count }) => `${count} ${Number(count) === 1 ? "tab" : "tabs"}`,
    selectedSiteCount: ({ count }) => `${count} ${Number(count) === 1 ? "site" : "sites"} selected`,
    selectedTabCount: ({ count }) => `${count} ${Number(count) === 1 ? "tab" : "tabs"} selected`,
    addedSiteCount: ({ count }) => `${count} ${Number(count) === 1 ? "site" : "sites"} added`,
    reorderWorkspace: ({ name }) => `Reorder workspace: ${name}`,
    reorderSite: ({ name }) => `Reorder site: ${name}`,
    reorderPosition: ({ position, count, kind }) => `Moved to position ${position} of ${count} ${kind === "workspace" ? (Number(count) === 1 ? "workspace" : "workspaces") : (Number(count) === 1 ? "site" : "sites")}`,
    reorderInstructionsActive: ({ positionMessage }) => `${positionMessage}. Use the arrow keys to move. Press Enter or Space to save, or Escape to cancel.`,
    selectBookmarksTitle: ({ count }) => `Select bookmarks (${count})`,
    selectTabsTitle: ({ count }) => `Select tabs (${count})`,
    totalTabs: ({ count }) => `${count} total`,
    selectTab: ({ title }) => `Select tab ${title}`,
    unavailableTab: ({ title }) => `Tab ${title} can’t be saved`,
    partialSelection: ({ selected, total }) => `, ${selected} of ${total} selected`,
    selectBookmarkNode: ({ kind, name, detail }) => `Select ${kind === "folder" ? "folder" : "site"} ${name}${detail || ""}`,
    backupReplace: ({ backupWorkspaces, backupSites, currentWorkspaces, currentSites }) => `The backup contains ${formatEnglishCount(backupWorkspaces, "workspace")} and ${formatEnglishCount(backupSites, "site")}. Importing will completely replace the current ${formatEnglishCount(currentWorkspaces, "workspace")} and ${formatEnglishCount(currentSites, "site")}. This action cannot be undone.`,
    backupRestore: ({ backupWorkspaces, backupSites }) => `The backup contains ${formatEnglishCount(backupWorkspaces, "workspace")} and ${formatEnglishCount(backupSites, "site")}. Import it to restore these data in Workspace Tiles. This action cannot be undone.`,
    deleteWorkspace: ({ name, count }) => count
      ? `Delete “${name}” and its ${formatEnglishCount(count, "site")}. This action cannot be undone.`
      : `Delete “${name}”. This action cannot be undone.`,
    deleteSite: ({ name }) => `Remove “${name}” from this workspace. This action cannot be undone.`,
  };

  const chineseTemplates = {
    workspaceField: () => "工作区",
    exportMenuLabel: () => "导出备份",
    importMenuLabel: () => "导入恢复",
    siteCount: ({ count }) => `${count} 个网站`,
    workspaceCount: ({ count }) => `${count} 个工作区`,
    tabCount: ({ count }) => `${count} 个标签页`,
    selectedSiteCount: ({ count }) => `已选择 ${count} 个网站`,
    selectedTabCount: ({ count }) => `已选择 ${count} 个标签页`,
    addedSiteCount: ({ count }) => `已添加 ${count} 个网站`,
    reorderWorkspace: ({ name }) => `排序工作区：${name}`,
    reorderSite: ({ name }) => `排序网站：${name}`,
    reorderPosition: ({ position, count, kind }) => `已移动到第 ${position} 位，共 ${count} ${kind === "workspace" ? "个工作区" : "个网站"}`,
    reorderInstructionsActive: ({ positionMessage }) => `${positionMessage}。使用方向键移动，回车或空格保存，Escape 取消`,
    selectBookmarksTitle: ({ count }) => `选择书签（${count}）`,
    selectTabsTitle: ({ count }) => `选择标签页（${count}）`,
    totalTabs: ({ count }) => `共有 ${count} 个`,
    selectTab: ({ title }) => `选择标签页 ${title}`,
    unavailableTab: ({ title }) => `标签页 ${title} 暂时无法保存`,
    partialSelection: ({ selected, total }) => `，已选择 ${selected}/${total}`,
    selectBookmarkNode: ({ kind, name, detail }) => `选择${kind === "folder" ? "文件夹" : "网站"} ${name}${detail || ""}`,
    backupReplace: ({ backupWorkspaces, backupSites, currentWorkspaces, currentSites }) => `备份包含 ${backupWorkspaces} 个工作区和 ${backupSites} 个网站。导入后，当前的 ${currentWorkspaces} 个工作区和 ${currentSites} 个网站将被完整替换。此操作不可撤销。`,
    backupRestore: ({ backupWorkspaces, backupSites }) => `备份包含 ${backupWorkspaces} 个工作区和 ${backupSites} 个网站。导入后将使用这些数据恢复 Workspace Tiles。此操作不可撤销。`,
    deleteWorkspace: ({ name, count }) => `将删除“${name}”${count ? `及其中的 ${count} 个网站` : ""}。此操作无法撤销。`,
    deleteSite: ({ name }) => `将从该工作区中删除“${name}”。此操作无法撤销。`,
  };

  let language = DEFAULT_LANGUAGE;

  function formatEnglishCount(count, noun) {
    return `${count} ${Number(count) === 1 ? noun : `${noun}s`}`;
  }

  function getChromeApi() {
    return typeof chrome === "undefined" ? null : chrome;
  }

  function readLanguage() {
    return new Promise((resolve) => {
      const chromeApi = getChromeApi();
      if (!chromeApi?.storage?.local) {
        try {
          resolve(localStorage.getItem(STORAGE_KEY));
        } catch {
          resolve(null);
        }
        return;
      }
      chromeApi.storage.local.get(STORAGE_KEY, (result) => {
        resolve(chromeApi.runtime?.lastError ? null : result[STORAGE_KEY]);
      });
    });
  }

  function saveLanguage(nextLanguage) {
    return new Promise((resolve, reject) => {
      const chromeApi = getChromeApi();
      if (!chromeApi?.storage?.local) {
        try {
          localStorage.setItem(STORAGE_KEY, nextLanguage);
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }
      chromeApi.storage.local.set({ [STORAGE_KEY]: nextLanguage }, () => {
        if (chromeApi.runtime?.lastError) reject(new Error(chromeApi.runtime.lastError.message));
        else resolve();
      });
    });
  }

  function translateRoot(root) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.title = t(element.dataset.i18nTitle);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
  }

  function applyDocumentLanguage() {
    document.documentElement.lang = language;
    translateRoot(document);
    document.querySelectorAll("template").forEach((template) => translateRoot(template.content));
  }

  async function init() {
    const savedLanguage = await readLanguage();
    language = SUPPORTED_LANGUAGES.has(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE;
    applyDocumentLanguage();
    return language;
  }

  async function setLanguage(nextLanguage) {
    if (!SUPPORTED_LANGUAGES.has(nextLanguage)) return false;
    const previousLanguage = language;
    language = nextLanguage;
    applyDocumentLanguage();
    try {
      await saveLanguage(nextLanguage);
      return true;
    } catch (error) {
      language = previousLanguage;
      applyDocumentLanguage();
      throw error;
    }
  }

  function t(key, values = {}) {
    const template = language === "en" ? englishTemplates[key] : chineseTemplates[key];
    if (template) return template(values);
    return language === "en" ? english[key] || key : key;
  }

function getLanguage() {
  return language;
}

export { init, setLanguage, getLanguage, applyDocumentLanguage, t };
