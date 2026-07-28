import assert from "node:assert/strict";

globalThis.document = {
  getElementById() { return {}; },
};

const { reorderLatestItems } = await import("../reorder.js");

const initial = [
  { id: "a", name: "最新 A" },
  { id: "b", name: "最新 B" },
  { id: "c", name: "最新 C" },
];
assert.deepEqual(reorderLatestItems(initial, ["c", "a", "b"]).map((item) => item.id), ["c", "a", "b"]);

const withConcurrentAddition = [
  { id: "a", name: "最新 A" },
  { id: "new", name: "并发新增" },
  { id: "b", name: "最新 B" },
  { id: "c", name: "最新 C" },
];
const preservedAddition = reorderLatestItems(withConcurrentAddition, ["c", "a", "b"]);
assert.deepEqual(preservedAddition.map((item) => item.id), ["c", "new", "a", "b"]);
assert.equal(preservedAddition[0].name, "最新 C");

const withConcurrentDeletion = [
  { id: "a", name: "最新 A" },
  { id: "c", name: "最新 C" },
];
assert.deepEqual(reorderLatestItems(withConcurrentDeletion, ["c", "a", "b"]).map((item) => item.id), ["c", "a"]);

console.log("排序测试通过：基础重排、并发新增保留、并发删除兼容均符合预期。");
