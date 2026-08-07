import assert from "node:assert/strict";
import {
  calculateMultisetJaccard,
  createSourceIdentity,
  findReusableWorkspaceDraft,
  findWorkspaceDraftSuppression,
  normalizeDraftUrl,
  normalizeWorkspaceDraft,
  saveWorkspaceDraft,
  suppressWorkspaceDraft,
  transitionWorkspaceDraft,
} from "../src/features/workspace-draft.js";

assert.equal(normalizeDraftUrl("https://example.com/a?q=1#part"), "https://example.com/a");
assert.equal(normalizeDraftUrl("chrome://settings"), "");

const source = await createSourceIdentity([
  "https://example.com/a?q=1",
  "https://example.com/a?q=2",
  "https://example.com/b#part",
]);
assert.equal(source.normalizedUrls.length, 3);
assert.equal(source.normalizedUrls[0], "https://example.com/a");
assert.equal(source.normalizedUrls[1], "https://example.com/a");
assert.match(source.sourceSignature, /^[a-f\d]{64}$/);
assert.equal(calculateMultisetJaccard(["a", "a", "b"], ["a", "b", "b"]), 0.5);

const now = Date.parse("2026-08-07T08:00:00.000Z");
const draft = normalizeWorkspaceDraft({
  windowId: 7,
  sourceSignature: source.sourceSignature,
  sourceUrlHashes: source.sourceUrlHashes,
  source: "popup",
  state: "ready",
  suggestedName: "Research",
  confidence: "high",
  tabs: [{
    key: "tab-1",
    tabId: 11,
    originalUrl: "https://example.com/a?q=1",
    selected: true,
  }],
}, { now });
assert.equal(draft.tabs[0].originalUrl, "https://example.com/a?q=1");
assert.equal(draft.tabs[0].normalizedUrl, "https://example.com/a");

await saveWorkspaceDraft(draft, { now });
const reusable = await findReusableWorkspaceDraft(7, source.sourceUrlHashes, { now: now + 1_000 });
assert.equal(reusable.id, draft.id);
const reviewing = transitionWorkspaceDraft(draft, "reviewing", { now: now + 2_000 });
assert.equal(reviewing.state, "reviewing");
assert.throws(() => transitionWorkspaceDraft(draft, "generating"), /Invalid workspace draft transition/);

await suppressWorkspaceDraft(draft, "dismissed", { now });
const suppression = await findWorkspaceDraftSuppression(source.sourceUrlHashes, { now: now + 60_000 });
assert.equal(suppression.state, "dismissed");
assert.equal(await findWorkspaceDraftSuppression(source.sourceUrlHashes, { now: now + 25 * 60 * 60 * 1_000 }), null);

console.log("Workspace Draft 测试通过：URL 清洗、重复计数、签名、状态和抑制均符合预期。");
