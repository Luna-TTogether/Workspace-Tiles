import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(projectRoot, "app.js"), "utf8");

function createElementStub() {
  return {
    hidden: true,
    addEventListener() {},
    append() {},
    replaceChildren() {},
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {} },
  };
}

const context = vm.createContext({
  console,
  URL,
  document: {
    hidden: false,
    body: createElementStub(),
    addEventListener() {},
    getElementById() { return createElementStub(); },
  },
});

vm.runInContext(source, context, { filename: "app.js" });

function evaluate(expression, values = {}) {
  Object.assign(context, values);
  return vm.runInContext(expression, context);
}

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

const backup = evaluate(
  "createBackup(testState, '2026-07-28T10:49:10.000Z', '0.1.1')",
  { testState: sourceState },
);
assert.equal(backup.format, "workspace-tiles-backup");
assert.equal(backup.schemaVersion, 1);
assert.equal(backup.data.workspaces[0].sites.length, 2);

const validated = evaluate("validateBackupData(testBackup)", { testBackup: backup });
assert.equal(validated.workspaceCount, 1);
assert.equal(validated.siteCount, 2);
assert.equal(validated.state.workspaces[0].name, "工作");

const emptyBackup = structuredClone(backup);
emptyBackup.data.workspaces = [];
const validatedEmpty = evaluate("validateBackupData(testBackup)", { testBackup: emptyBackup });
assert.equal(validatedEmpty.workspaceCount, 0);
assert.equal(validatedEmpty.siteCount, 0);

const futureBackup = structuredClone(backup);
futureBackup.schemaVersion = 2;
assert.throws(
  () => evaluate("validateBackupData(testBackup)", { testBackup: futureBackup }),
  /更新版本/,
);

const duplicateWorkspaceBackup = structuredClone(backup);
duplicateWorkspaceBackup.data.workspaces.push(structuredClone(duplicateWorkspaceBackup.data.workspaces[0]));
assert.throws(
  () => evaluate("validateBackupData(testBackup)", { testBackup: duplicateWorkspaceBackup }),
  /工作区 ID 缺失或重复/,
);

const invalidSiteBackup = structuredClone(backup);
invalidSiteBackup.data.workspaces[0].sites[0].url = "not a valid url";
assert.throws(
  () => evaluate("validateBackupData(testBackup)", { testBackup: invalidSiteBackup }),
  /无效的网址/,
);

assert.equal(
  evaluate("createBackupFilename(new Date('2026-07-28T12:00:00'))"),
  "workspace-tiles-backup-2026-07-28.json",
);

console.log("备份测试通过：导出结构、空备份、严格校验、版本拦截和文件名均符合预期。");
