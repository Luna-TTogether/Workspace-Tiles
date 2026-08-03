import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forms = readFileSync(path.join(projectRoot, "src/features/forms.js"), "utf8");
const dialogStyles = readFileSync(path.join(projectRoot, "styles/dialogs.css"), "utf8");
const responsiveStyles = readFileSync(path.join(projectRoot, "styles/responsive.css"), "utf8");

const workspaceForm = forms.slice(
  forms.indexOf("function openWorkspaceForm"),
  forms.indexOf("function openBookmarkPicker"),
);

assert.doesNotMatch(workspaceForm, /siteUrl|initialUrl|第一个网站 URL/,
  "新建工作区主表单不应包含网站 URL 字段");
assert.equal((forms.match(/createBulkAddActions\(dialog/g) || []).length, 3,
  "新建工作区和添加网站应共用批量添加组件");
assert.match(forms, /t\("批量添加"\)/, "批量入口应使用确认后的分组标题");
assert.ok(
  forms.indexOf('t("从打开的标签页添加")') < forms.indexOf('t("从书签导入")'),
  "标签页入口应排在书签入口之前",
);
assert.doesNotMatch(forms, /bookmark-import-block|bookmark-select-button/,
  "正式表单不应保留旧版常驻导入区块");
assert.match(forms, /classList\.add\("bulk-add-chevron"\)/,
  "批量入口应保留表示进入下一步的 SVG 箭头");

assert.match(dialogStyles, /\.bulk-add-action\.button\s*\{[^}]*height:\s*44px/s,
  "批量入口应使用原型确认的 44px 行高");
assert.match(dialogStyles, /\.dialog\.small > \.dialog-header\s*\{[^}]*min-height:\s*56px/s,
  "小弹窗标题栏应保持确认后的 24px 内外节奏");
assert.match(dialogStyles, /\.field input::placeholder\s*\{[^}]*var\(--muted-light\)/s,
  "Placeholder 应使用设计系统的次级文字 Token");
assert.match(responsiveStyles, /\.dialog\.small \.dialog-header\s*\{[^}]*flex-wrap:\s*nowrap/s,
  "窄屏小弹窗标题和关闭按钮应保持同一行");

console.log("表单测试通过：轻量主路径、共享批量入口、文案与响应式间距均符合原型。");
