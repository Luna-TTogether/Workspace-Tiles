import assert from "node:assert/strict";
import {
  createRecordedSiteFields,
  createRecordedWorkspaceFields,
  getNextRecordedAt,
} from "../src/core/context-time.js";
import { normalizeState } from "../src/core/state.js";

const migrationNow = Date.parse("2026-08-07T08:00:00.000Z");
const legacy = normalizeState({
  workspaces: [{
    id: "workspace-1",
    name: "Legacy",
    sites: [{ id: "site-1", name: "Example", url: "https://example.com/path" }],
  }],
}, { now: migrationNow });

assert.equal(legacy.schemaVersion, 2);
assert.equal(legacy.contextTimeMigratedAt, "2026-08-07T08:00:00.000Z");
assert.equal(legacy.workspaces[0].createdAt, "2026-08-07T07:59:59.999Z");
assert.equal(legacy.workspaces[0].createdAtOrigin, "legacy_migration");
assert.equal(legacy.workspaces[0].sites[0].addedAt, "2026-08-07T07:59:59.999Z");
assert.equal(legacy.workspaces[0].sites[0].addedAtOrigin, "legacy_migration");

const repeated = normalizeState(legacy, { now: migrationNow + 60_000 });
assert.equal(repeated.contextTimeMigratedAt, legacy.contextTimeMigratedAt);
assert.equal(repeated.workspaces[0].createdAt, legacy.workspaces[0].createdAt);

const workspaceTime = createRecordedWorkspaceFields(repeated, migrationNow - 60_000);
assert.equal(workspaceTime.createdAt, "2026-08-07T08:00:00.001Z");
assert.equal(workspaceTime.createdAtOrigin, "recorded");
const siteTime = createRecordedSiteFields(repeated, migrationNow - 60_000);
assert.equal(siteTime.addedAt, "2026-08-07T08:00:00.002Z");
assert.equal(siteTime.addedAtOrigin, "recorded");
assert.equal(getNextRecordedAt(repeated, migrationNow - 120_000), "2026-08-07T08:00:00.003Z");

const partial = normalizeState({
  contextTimeMigratedAt: "2026-08-01T00:00:00.000Z",
  workspaces: [{
    id: "workspace-2",
    name: "Partial",
    createdAt: "2025-01-01T00:00:00.000Z",
    sites: [],
  }],
});
assert.equal(partial.workspaces[0].createdAt, "2025-01-01T00:00:00.000Z");
assert.equal(partial.workspaces[0].createdAtOrigin, "legacy_migration");

console.log("Context 时间测试通过：旧数据迁移、幂等、Origin 与时钟回拨规则均符合预期。");
