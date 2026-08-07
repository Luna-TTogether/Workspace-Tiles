import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeState, normalizeTileSize, normalizeUiState } from "../src/core/state.js";
import {
  MAX_NOTE_LENGTH,
  normalizeCardFace,
  normalizeNote,
  parseNoteLines,
  toggleChecklistLine,
} from "../src/features/workspace-notes.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(path.join(projectRoot, "newtab.html"), "utf8");
const app = readFileSync(path.join(projectRoot, "app.js"), "utf8");
const workspaceStyles = readFileSync(path.join(projectRoot, "styles/workspace.css"), "utf8");

const oldState = normalizeState({
  workspaces: [{ id: "workspace-1", name: "公司", sites: [] }],
});
assert.equal(oldState.workspaces[0].note, "");
assert.equal(oldState.workspaces[0].cardFace, "sites");
assert.equal(oldState.workspaces[0].tileSize, "large");

assert.equal(normalizeTileSize("small"), "small");
assert.equal(normalizeTileSize("medium"), "medium");
assert.equal(normalizeTileSize("large"), "large");
assert.equal(normalizeTileSize("invalid"), "large");
assert.deepEqual(normalizeUiState({ expandedWorkspaceId: "workspace-1" }), { expandedWorkspaceId: "workspace-1" });
assert.deepEqual(normalizeUiState({ expandedWorkspaceId: "  " }), { expandedWorkspaceId: null });
assert.deepEqual(normalizeUiState({ expandedWorkspaceId: 12 }), { expandedWorkspaceId: null });

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

assert.doesNotMatch(html, /workspaceSectionTitle|workspace-section-header/,
  "首页不得显示 Workspace 分组标题");
assert.match(html, /<section class="workspace-section" aria-label="工作区" data-i18n-aria-label="工作区">/,
  "移除可见标题后仍需保留工作区区域的无障碍名称");
assert.match(workspaceStyles, /\.workspace-note-layout\s*\{[\s\S]*?padding:\s*var\(--space-4\) 14px var\(--space-2\);/,
  "Notes 内容区必须使用统一的左右留边");
assert.doesNotMatch(workspaceStyles, /\.workspace-tile\[data-size="large"\]\s+\.workspace-note-layout/,
  "大卡片 Notes 面不得覆盖统一的左右留边");
assert.doesNotMatch(html, /show-sites-button/,
  "Notes 面不得保留重复的网格切回按钮");
assert.doesNotMatch(app, /showSitesButtons|show-sites-button/,
  "移除网格切回按钮后不得残留无效绑定逻辑");
assert.match(html, /<header class="workspace-tile-label">[\s\S]*?<div class="workspace-label-actions">[\s\S]*?open-all-menu-slot[\s\S]*?open-workspace-button[\s\S]*?more-workspace-button[\s\S]*?<\/header>/,
  "工作区级操作必须与标题位于同一行");
assert.doesNotMatch(html, /workspace-card-face[\s\S]*?tile-actions/,
  "卡片正反面内部不得残留旧操作栏");
assert.match(workspaceStyles, /\.workspace-tile\.is-note \.open-all-menu-button\s*\{[\s\S]*?display:\s*none;/,
  "Notes 面必须隐藏打开全部操作");

console.log("Workspace Notes 测试通过：数据规范化、清单解析、首页标题、Notes 留边与精简操作均符合预期。");
