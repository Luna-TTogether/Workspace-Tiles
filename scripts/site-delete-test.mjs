import assert from "node:assert/strict";
import { removeSiteForUndo, restoreDeletedSiteData } from "../site-delete.js";

const source = {
  workspaces: [{
    id: "workspace-a",
    name: "A",
    sites: [
      { id: "site-a", name: "A", url: "https://a.example" },
      { id: "site-b", name: "B", url: "https://b.example" },
      { id: "site-c", name: "C", url: "https://c.example" },
    ],
  }],
};

const removed = removeSiteForUndo(source, "workspace-a", "site-b");
assert.deepEqual(removed.state.workspaces[0].sites.map(({ id }) => id), ["site-a", "site-c"]);
assert.equal(removed.deletion.site.id, "site-b");
assert.equal(removed.deletion.siteIndex, 1);
assert.deepEqual(source.workspaces[0].sites.map(({ id }) => id), ["site-a", "site-b", "site-c"]);

const restored = restoreDeletedSiteData(removed.state, removed.deletion);
assert.deepEqual(restored.state.workspaces[0].sites.map(({ id }) => id), ["site-a", "site-b", "site-c"]);

const restoredAgain = restoreDeletedSiteData(restored.state, removed.deletion);
assert.deepEqual(restoredAgain.state.workspaces[0].sites.map(({ id }) => id), ["site-a", "site-b", "site-c"]);

assert.throws(
  () => removeSiteForUndo(source, "workspace-a", "missing"),
  (error) => error.code === "SITE_NOT_FOUND",
);
assert.throws(
  () => restoreDeletedSiteData({ workspaces: [] }, removed.deletion),
  (error) => error.code === "WORKSPACE_NOT_FOUND",
);

console.log("网站删除撤销测试通过：即时删除、原位恢复、重复撤销和工作区缺失规则均符合预期。");
