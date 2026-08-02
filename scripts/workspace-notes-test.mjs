import assert from "node:assert/strict";
import { normalizeState } from "../state.js";
import {
  MAX_NOTE_LENGTH,
  normalizeCardFace,
  normalizeNote,
  parseNoteLines,
  toggleChecklistLine,
} from "../workspace-notes.js";

const oldState = normalizeState({
  workspaces: [{ id: "workspace-1", name: "公司", sites: [] }],
});
assert.equal(oldState.workspaces[0].note, "");
assert.equal(oldState.workspaces[0].cardFace, "sites");

assert.equal(normalizeCardFace("note"), "note");
assert.equal(normalizeCardFace("invalid"), "sites");
assert.equal(normalizeNote("  \n"), "");
assert.equal(normalizeNote(" text \n"), " text \n");
assert.equal(normalizeNote("a".repeat(MAX_NOTE_LENGTH + 5)).length, MAX_NOTE_LENGTH + 5);

const note = "标题\n- [ ] 未完成\n  -[X] 已完成\n正文 [ ] 不解析\n-[ ]";
const parsed = parseNoteLines(note);
assert.equal(parsed[0].type, "text");
assert.deepEqual(parsed[1], {
  type: "checklist",
  index: 1,
  source: "- [ ] 未完成",
  checked: false,
  text: "未完成",
});
assert.equal(parsed[2].checked, true);
assert.equal(parsed[3].type, "text");
assert.equal(parsed[4].text, "");

assert.equal(toggleChecklistLine(note, 1, true).split("\n")[1], "- [x] 未完成");
assert.equal(toggleChecklistLine(note, 2, false).split("\n")[2], "  -[ ] 已完成");
assert.equal(toggleChecklistLine(note, 3, true), note);

console.log("Workspace Notes 测试通过：旧数据兼容、规范化、清单解析与切换均符合预期。");
