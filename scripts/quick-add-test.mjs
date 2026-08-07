import assert from "node:assert/strict";
import {
  addPageToQuickAddData,
  commitQuickAdd,
  commitQuickAddData,
  deleteQuickAddedSiteData,
  normalizeRecentWorkspaceIds,
  orderWorkspacesByRecent,
  prepareQuickAddDraftData,
  touchRecentWorkspace,
  updateQuickAddedSiteData,
} from "../src/features/quick-add.js";

const createState = () => ({
  workspaces: [
    { id: "workspace-a", name: "A", sites: [] },
    { id: "workspace-b", name: "B", sites: [] },
    { id: "workspace-c", name: "C", sites: [] },
  ],
});

assert.deepEqual(
  normalizeRecentWorkspaceIds(["workspace-b", "missing", "workspace-b", "workspace-a"], createState().workspaces),
  ["workspace-b", "workspace-a"],
);
assert.deepEqual(
  orderWorkspacesByRecent(createState().workspaces, ["workspace-c", "workspace-a"]).map(({ id }) => id),
  ["workspace-c", "workspace-a", "workspace-b"],
);
assert.deepEqual(
  touchRecentWorkspace(["workspace-a", "workspace-b"], "workspace-b", createState().workspaces),
  ["workspace-b", "workspace-a"],
);

const added = addPageToQuickAddData(createState(), ["workspace-b"], {
  title: "  Example page  ",
  url: "https://example.com/path",
  favIconUrl: "https://cdn.example.com/favicon.svg",
});
assert.equal(added.status, "added");
assert.equal(added.workspace.id, "workspace-b");
assert.equal(added.site.name, "Example page");
assert.equal(added.workspace.sites[0].url, "https://example.com/path");
assert.equal(added.workspace.sites[0].faviconUrl, "https://cdn.example.com/favicon.svg");
assert.equal(added.workspace.sites[0].addedAtOrigin, "recorded");
assert.ok(Date.parse(added.workspace.sites[0].addedAt) > Date.parse(added.state.contextTimeMigratedAt));
assert.deepEqual(added.recentWorkspaceIds, ["workspace-b"]);

const moved = updateQuickAddedSiteData(added.state, added.recentWorkspaceIds, {
  siteId: added.site.id,
  name: " Renamed ",
  workspaceId: "workspace-c",
});
assert.equal(moved.state.workspaces[1].sites.length, 0);
assert.equal(moved.state.workspaces[2].sites[0].name, "Renamed");
assert.equal(moved.state.workspaces[2].sites[0].faviconUrl, "https://cdn.example.com/favicon.svg");
assert.equal(moved.state.workspaces[2].sites[0].addedAt, added.site.addedAt);
assert.deepEqual(moved.recentWorkspaceIds, ["workspace-c", "workspace-b"]);

const deleted = deleteQuickAddedSiteData(moved.state, added.site.id);
assert.equal(deleted.workspace.id, "workspace-c");
assert.equal(deleted.state.workspaces[2].sites.length, 0);

assert.equal(addPageToQuickAddData({ workspaces: [] }, [], { url: "https://example.com" }).status, "empty");
assert.throws(
  () => addPageToQuickAddData(createState(), [], { title: "No URL" }),
  (error) => error.code === "PAGE_UNAVAILABLE",
);
assert.throws(
  () => updateQuickAddedSiteData(added.state, [], {
    siteId: "missing",
    name: "Missing",
    workspaceId: "workspace-a",
  }),
  (error) => error.code === "SITE_NOT_FOUND",
);

const draftSource = createState();
const draftSourceSnapshot = JSON.stringify(draftSource);
const prepared = prepareQuickAddDraftData(draftSource, ["workspace-b"], {
  title: "Draft page",
  url: "https://example.com/draft?source=popup",
});
assert.equal(prepared.status, "ready");
assert.equal(prepared.defaultWorkspace.id, "workspace-b");
assert.equal(prepared.page.name, "Draft page");
assert.equal("id" in prepared.page, false, "准备阶段不应创建正式 Site ID");
assert.equal("addedAt" in prepared.page, false, "准备阶段不应创建正式加入时间");
assert.equal(JSON.stringify(draftSource), draftSourceSnapshot, "准备 Draft 不得修改正式状态");

const committedAt = Date.parse("2026-08-07T10:00:00.000Z");
const committed = commitQuickAddData(draftSource, {
  workspaceId: "workspace-b",
  name: "  Confirmed name  ",
  page: prepared.page,
}, { now: committedAt });
assert.equal(committed.workspace.sites.length, 1);
assert.equal(committed.site.name, "Confirmed name");
assert.equal(committed.site.url, "https://example.com/draft?source=popup");
assert.equal(committed.site.addedAtOrigin, "recorded");
assert.ok(Date.parse(committed.site.addedAt) >= committedAt);
assert.equal(JSON.stringify(draftSource), draftSourceSnapshot, "Commit 纯函数不得覆盖调用方旧状态");

const duplicate = commitQuickAddData(committed.state, {
  workspaceId: "workspace-b",
  name: "Second copy",
  page: prepared.page,
}, { now: committedAt });
assert.equal(duplicate.workspace.sites.length, 2, "同一 URL 允许明确保存多次");
assert.notEqual(duplicate.workspace.sites[0].id, duplicate.workspace.sites[1].id);

assert.throws(
  () => commitQuickAddData(draftSource, {
    workspaceId: "missing",
    name: "Missing",
    page: prepared.page,
  }),
  (error) => error.code === "WORKSPACE_NOT_FOUND",
);
assert.equal(JSON.stringify(draftSource), draftSourceSnapshot, "目标不存在时不得写入");

const writes = [];
const asyncCommitted = await commitQuickAdd({
  workspaceId: "workspace-a",
  name: "Saved once",
  page: prepared.page,
}, {
  now: committedAt,
  loadData: async () => ({ state: createState(), recentWorkspaceIds: ["workspace-b"] }),
  writeStorage: async (value) => {
    writes.push(value);
    if (writes.length === 2) throw new Error("recent write failed");
  },
});
assert.equal(writes.length, 2);
assert.equal(writes[0].workspaceTilesState.workspaces[0].sites.length, 1);
assert.equal(asyncCommitted.recentWorkspaceWriteFailed, true, "最近记录失败不得回滚已保存网站");

let failedWriteCalls = 0;
await assert.rejects(commitQuickAdd({
  workspaceId: "workspace-a",
  name: "Must not persist",
  page: prepared.page,
}, {
  loadData: async () => ({ state: createState(), recentWorkspaceIds: [] }),
  writeStorage: async () => {
    failedWriteCalls += 1;
    throw new Error("state write failed");
  },
}));
assert.equal(failedWriteCalls, 1, "正式状态失败后不得继续写最近 Workspace");

console.log("网页快捷加入测试通过：Draft 无写入、确认保存、真实时间、重复、并发与存储失败规则均符合预期。");
