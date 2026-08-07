import assert from "node:assert/strict";
import { createBackup, createBackupFilename, validateBackupData } from "../src/features/backup.js";

const sourceState = {
  workspaces: [{
    id: "workspace-1",
    name: "工作",
    note: "- [ ] 检查报表",
    cardFace: "note",
    tileSize: "medium",
    sites: [
      {
        id: "site-1",
        name: "OpenAI",
        url: "https://openai.com/",
        faviconUrl: "https://openai.com/favicon.svg",
      },
      { id: "site-2", name: "书签工具", url: "javascript:void(0)" },
    ],
  }],
};

const backup = createBackup(sourceState, "2026-07-28T10:49:10.000Z", "0.1.1");
assert.equal(backup.format, "workspace-tiles-backup");
assert.equal(backup.schemaVersion, 2);
assert.equal(backup.data.schemaVersion, 2);
assert.ok(backup.data.contextTimeMigratedAt);
assert.equal(backup.data.workspaces[0].createdAtOrigin, "legacy_migration");
assert.equal(backup.data.workspaces[0].sites[0].addedAtOrigin, "legacy_migration");
assert.equal(backup.data.workspaces[0].sites.length, 2);
assert.equal("faviconUrl" in backup.data.workspaces[0].sites[0], false);
assert.equal("expandedWorkspaceId" in backup.data, false);

const validated = validateBackupData(backup);
assert.equal(validated.workspaceCount, 1);
assert.equal(validated.siteCount, 2);
assert.equal(validated.state.workspaces[0].name, "工作");
assert.equal(validated.state.workspaces[0].note, "- [ ] 检查报表");
assert.equal(validated.state.workspaces[0].cardFace, "note");
assert.equal(validated.state.workspaces[0].tileSize, "medium");

const legacyBackup = structuredClone(backup);
legacyBackup.schemaVersion = 1;
delete legacyBackup.data.schemaVersion;
delete legacyBackup.data.contextTimeMigratedAt;
delete legacyBackup.data.lastRecordedAt;
delete legacyBackup.data.workspaces[0].note;
delete legacyBackup.data.workspaces[0].cardFace;
delete legacyBackup.data.workspaces[0].tileSize;
legacyBackup.data.workspaces.forEach((workspace) => {
  delete workspace.createdAt;
  delete workspace.createdAtOrigin;
  workspace.sites.forEach((site) => {
    delete site.addedAt;
    delete site.addedAtOrigin;
  });
});
const validatedLegacy = validateBackupData(legacyBackup, { now: Date.parse("2026-08-07T10:00:00.000Z") });
assert.equal(validatedLegacy.state.workspaces[0].note, "");
assert.equal(validatedLegacy.state.workspaces[0].cardFace, "sites");
assert.equal(validatedLegacy.state.workspaces[0].tileSize, "large");
assert.equal(validatedLegacy.state.workspaces[0].createdAt, "2026-08-07T09:59:59.999Z");
assert.equal(validatedLegacy.state.workspaces[0].sites[0].addedAtOrigin, "legacy_migration");

const emptyBackup = structuredClone(backup);
emptyBackup.data.workspaces = [];
const validatedEmpty = validateBackupData(emptyBackup);
assert.equal(validatedEmpty.workspaceCount, 0);
assert.equal(validatedEmpty.siteCount, 0);

const futureBackup = structuredClone(backup);
futureBackup.schemaVersion = 3;
assert.throws(
  () => validateBackupData(futureBackup),
  /newer version/,
);

const duplicateWorkspaceBackup = structuredClone(backup);
duplicateWorkspaceBackup.data.workspaces.push(structuredClone(duplicateWorkspaceBackup.data.workspaces[0]));
assert.throws(
  () => validateBackupData(duplicateWorkspaceBackup),
  /workspace ID is missing or duplicated/,
);

const invalidSiteBackup = structuredClone(backup);
invalidSiteBackup.data.workspaces[0].sites[0].url = "not a valid url";
assert.throws(
  () => validateBackupData(invalidSiteBackup),
  /invalid URL/,
);

assert.equal(
  createBackupFilename(new Date("2026-07-28T12:00:00")),
  "workspace-tiles-backup-2026-07-28.json",
);

console.log("备份测试通过：导出结构、空备份、严格校验、版本拦截和文件名均符合预期。");
