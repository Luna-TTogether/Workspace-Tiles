import assert from "node:assert/strict";

globalThis.document = {
  getElementById() { return {}; },
};

const {
  hasCrossedReorderThreshold,
  mergeVisibleOrder,
  reorderIdsByIndex,
  reorderLatestItems,
} = await import("../src/features/reorder.js");

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

const currentRect = { left: 0, top: 0, width: 100, height: 100 };
const rightRect = { left: 120, top: 0, width: 100, height: 100 };
assert.equal(hasCrossedReorderThreshold(currentRect, rightRect, 110, 50), false, "中心线附近保持原位置");
assert.equal(hasCrossedReorderThreshold(currentRect, rightRect, 125, 50), true, "越过滞后阈值后才向右换位");
assert.equal(hasCrossedReorderThreshold(rightRect, currentRect, 110, 50), false, "轻微回移不会立刻切回");
assert.equal(hasCrossedReorderThreshold(rightRect, currentRect, 95, 50), true, "充分越过反向阈值后允许切回");

console.log("排序测试通过：索引移动、分页重排、换位滞后阈值、并发新增保留和并发删除兼容均符合预期。");
