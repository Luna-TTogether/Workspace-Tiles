import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(projectRoot, "app.js"), "utf8");
const styles = ["styles.css", "styles/workspace.css", "styles/dialogs.css", "styles/overlays.css", "styles/responsive.css"]
  .map((filename) => readFileSync(path.join(projectRoot, filename), "utf8"))
  .join("\n");

function functionSource(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `缺少 ${name}()`);
  assert.notEqual(end, -1, `无法确定 ${name}() 的结束位置`);
  return source.slice(start, end);
}

const supportCheck = functionSource(app, "supportsWorkspaceViewTransition", "showExpandedWorkspaceDialog");
const openTransition = functionSource(app, "showExpandedWorkspaceDialog", "closeButtonAfterTransition");
const closeTransition = functionSource(app, "closeWorkspaceDialog", "renderDialogSiteItem");

assert.match(supportCheck, /typeof document\.startViewTransition === "function"/);
assert.match(supportCheck, /prefers-reduced-motion: reduce/);

for (const [label, source] of [["展开", openTransition], ["收起", closeTransition]]) {
  assert.match(source, /expandedTransitionPending/, `${label}流程必须防止重复触发`);
  assert.match(source, /document\.startViewTransition/, `${label}流程必须使用共享元素过渡`);
  assert.match(source, /try \{[\s\S]*?\} finally \{/, `${label}流程必须使用 finally 收尾`);
  assert.match(source, /removeProperty\("view-transition-name"\)/, `${label}流程必须清理临时过渡名称`);
  assert.match(source, /delete document\.documentElement\.dataset\.workspaceTransition/, `${label}流程必须清理根过渡状态`);
  assert.match(source, /expandedTransitionPending = false/, `${label}流程必须解除交互锁`);
}

assert.match(openTransition, /if \(restore \|\| !returnFocus \|\| !sourceTile \|\| !supportsWorkspaceViewTransition\(\)\) \{[\s\S]*?showModal\(/,
  "恢复、无来源卡片或不支持 View Transitions 时必须直接打开");
assert.match(openTransition, /if \(!restore\) void persistExpandedWorkspaceId\(workspace\.id\)/,
  "主动展开后必须保存工作区 ID");
assert.match(closeTransition, /closeModal\(\{ restoreFocus: false \}\)/,
  "收起流程必须提供直接关闭兜底");
assert.match(closeTransition, /returnFocus\?\.focus\(\{ preventScroll: true \}\)/,
  "收起后必须恢复焦点且保持页面滚动位置");
assert.match(closeTransition, /persistExpandedWorkspaceId\(null\)/,
  "主动收起后必须清空展开状态");

assert.match(styles, /\.dialog\.workspace-expanded-dialog\s*\{[\s\S]*?width:\s*min\(992px, calc\(100vw - 64px\)\);[\s\S]*?height:\s*min\(496px, calc\(100vh - 32px\)\);/,
  "完整工作区必须保持 992 × 496px 目标尺寸和安全边距");
assert.match(styles, /::view-transition-group\(workspace-expand\)\s*\{[\s\S]*?animation-duration:\s*420ms;[\s\S]*?cubic-bezier\(0\.22, 1, 0\.36, 1\);/,
  "共享元素过渡必须保持已确认的 420ms 时长与 easing");
assert.match(styles, /::view-transition-old\(workspace-expand\),\s*::view-transition-new\(workspace-expand\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*clip;[\s\S]*?animation:\s*none;[\s\S]*?mix-blend-mode:\s*normal;/,
  "过渡快照必须保持不透明、裁切且不使用默认淡入淡出");
assert.match(styles, /data-workspace-transition="expand"[\s\S]*?object-fit:\s*contain;/,
  "展开旧视图必须保持来源卡片比例");
assert.match(styles, /data-workspace-transition="collapse"[\s\S]*?object-fit:\s*cover;/,
  "收起旧视图必须覆盖目标外壳");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?::view-transition-group\(workspace-expand\)[\s\S]*?animation-duration:\s*1ms;/,
  "减少动态效果时必须跳过位移缩放动画");

console.log("工作区动画契约测试通过：防重入、异常收尾、状态恢复、降级路径、目标尺寸与减少动态效果规则均保持完整。");
