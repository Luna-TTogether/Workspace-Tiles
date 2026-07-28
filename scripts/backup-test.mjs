import assert from "node:assert/strict";
import { createBackup, createBackupFilename, validateBackupData } from "../backup.js";

const sourceState = {
  workspaces: [{
    id: "workspace-1",
    name: "工作",
    sites: [
      { id: "site-1", name: "OpenAI", url: "https://openai.com/" },
      { id: "site-2", name: "书签工具", url: "javascript:void(0)" },
    ],
  }],
};

const backup = createBackup(sourceState, "2026-07-28T10:49:10.000Z", "0.1.1");
assert.equal(backup.format, "workspace-tiles-backup");
assert.equal(backup.schemaVersion, 1);
assert.equal(backup.data.workspaces[0].sites.length, 2);

const validated = validateBackupData(backup);
assert.equal(validated.workspaceCount, 1);
assert.equal(validated.siteCount, 2);
assert.equal(validated.state.workspaces[0].name, "工作");

const emptyBackup = structuredClone(backup);
emptyBackup.data.workspaces = [];
const validatedEmpty = validateBackupData(emptyBackup);
assert.equal(validatedEmpty.workspaceCount, 0);
assert.equal(validatedEmpty.siteCount, 0);

const futureBackup = structuredClone(backup);
futureBackup.schemaVersion = 2;
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
