import assert from "node:assert/strict";
import {
  addPageToQuickAddData,
  deleteQuickAddedSiteData,
  normalizeRecentWorkspaceIds,
  orderWorkspacesByRecent,
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

console.log("网页快捷加入测试通过：最近工作区、默认选择、添加、移动、删除和异常规则均符合预期。");
