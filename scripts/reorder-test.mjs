import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(projectRoot, "app.js"), "utf8");
const i18nSource = readFileSync(path.join(projectRoot, "i18n.js"), "utf8");

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

context.window = context;
vm.runInContext(i18nSource, context, { filename: "i18n.js" });
vm.runInContext(source, context, { filename: "app.js" });

function reorder(items, ids) {
  context.testItems = items;
  context.testIds = ids;
  return vm.runInContext("reorderLatestItems(testItems, testIds)", context);
}

const initial = [
  { id: "a", name: "最新 A" },
  { id: "b", name: "最新 B" },
  { id: "c", name: "最新 C" },
];
assert.deepEqual(reorder(initial, ["c", "a", "b"]).map((item) => item.id), ["c", "a", "b"]);

const withConcurrentAddition = [
  { id: "a", name: "最新 A" },
  { id: "new", name: "并发新增" },
  { id: "b", name: "最新 B" },
  { id: "c", name: "最新 C" },
];
const preservedAddition = reorder(withConcurrentAddition, ["c", "a", "b"]);
assert.deepEqual(preservedAddition.map((item) => item.id), ["c", "new", "a", "b"]);
assert.equal(preservedAddition[0].name, "最新 C");

const withConcurrentDeletion = [
  { id: "a", name: "最新 A" },
  { id: "c", name: "最新 C" },
];
assert.deepEqual(reorder(withConcurrentDeletion, ["c", "a", "b"]).map((item) => item.id), ["c", "a"]);

console.log("排序测试通过：基础重排、并发新增保留、并发删除兼容均符合预期。");
