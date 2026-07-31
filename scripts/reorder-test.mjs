import assert from "node:assert/strict";

globalThis.document = {
  getElementById() { return {}; },
};

const { mergeVisibleOrder, reorderIdsByIndex, reorderLatestItems } = await import("../reorder.js");

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

assert.deepEqual(
  mergeVisibleOrder(["a", "b", "c", "d", "e", "f"], ["e", "c", "d"]),
  ["a", "b", "e", "c", "d", "f"],
  "当前页排序只替换该页网站原来的位置",
);

assert.deepEqual(reorderIdsByIndex(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
assert.deepEqual(reorderIdsByIndex(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
assert.deepEqual(reorderIdsByIndex(["a", "b"], 1, 1), ["a", "b"]);

console.log("排序测试通过：索引移动、分页重排、并发新增保留、并发删除兼容均符合预期。");
