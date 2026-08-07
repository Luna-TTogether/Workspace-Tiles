import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(path.join(projectRoot, "app.js"), "utf8");
const noteCard = readFileSync(path.join(projectRoot, "src/features/workspace-note-card.js"), "utf8");
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
const expandedDialog = functionSource(app, "openWorkspaceDialog", "createExpandedWorkspaceNote");
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
assert.match(expandedDialog, /const openAllButton = createMenuButton\(\{[\s\S]*?label: t\("打开全部"\)[\s\S]*?openAllMenu\(event\.currentTarget, workspace, \{ initialFocus \}\)/,
  "完整工作区必须复用新版打开全部菜单按钮");
assert.doesNotMatch(expandedDialog, /createSplitButton|createOpenAllIconButton/,
  "完整工作区不得继续使用旧版组合按钮或单图标按钮");
assert.match(app, /const openAllButton = createMenuButton\(\{\s*label: t\("打开全部"\),\s*accessibleLabel: t\("打开全部"\)/,
  "所有卡片尺寸必须显示完整的“打开全部”文案");
assert.match(styles, /\.workspace-label-actions:has\(\[aria-expanded="true"\]\)\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?pointer-events:\s*auto;/,
  "菜单打开期间标题操作组必须保持可见和可交互");
assert.match(app, /moreButtons\.forEach\(\(button\) => \{[\s\S]*?aria-haspopup[\s\S]*?aria-expanded/,
  "标题行 More 按钮必须声明菜单展开状态");
assert.match(app, /showMenu\(menu, anchor, \{ initialFocus, align: "start" \}\)/,
  "打开全部菜单必须优先与按钮左边缘对齐");
assert.match(app, /showMenu\(menu, anchor, \{ align: "end" \}\)/,
  "More 菜单必须优先与按钮右边缘对齐");
assert.match(styles, /\.menu-button:not\(:disabled\):active,\s*\.more-workspace-button:not\(:disabled\):active\s*\{[\s\S]*?transform:\s*none;/,
  "菜单锚点按钮按下时不得缩放外框，以免定位边缘漂移");
assert.doesNotMatch(readFileSync(path.join(projectRoot, "src/ui/ui-components.js"), "utf8"), /menu\.style\.(?:left|top) = `\$\{Math\.round\(/,
  "菜单定位必须保留亚像素坐标，不得整数取整");

assert.match(styles, /--workspace-large-card-height:\s*calc\(var\(--workspace-tile-height\) \+ var\(--workspace-tile-label-height\) \+ var\(--workspace-tile-height\) \+ var\(--workspace-tile-label-height\) \+ var\(--workspace-grid-row-gap\)\);/,
  "大卡片固定高度必须由两行卡片高度、标题高度和行间距共同计算");
assert.match(styles, /\.dialog\.workspace-expanded-dialog\s*\{[\s\S]*?width:\s*min\(var\(--workspace-expanded-dialog-width\), calc\(100vw - 64px\)\);[\s\S]*?height:\s*min\(var\(--workspace-large-card-height\), calc\(100vh - 32px\)\);/,
  "完整工作区必须与大卡片共享尺寸 Token，并保留视口安全边距");
assert.match(styles, /::view-transition-group\(workspace-expand\)\s*\{[\s\S]*?animation-duration:\s*420ms;[\s\S]*?cubic-bezier\(0\.22, 1, 0\.36, 1\);/,
  "共享元素过渡必须保持原版 420ms 时长与 easing");
assert.match(styles, /::view-transition-old\(workspace-expand\),\s*::view-transition-new\(workspace-expand\)\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*clip;[\s\S]*?animation:\s*none;[\s\S]*?mix-blend-mode:\s*normal;/,
  "过渡快照必须保持原版裁切与混合方式");
assert.match(styles, /data-workspace-transition="expand"[\s\S]*?object-fit:\s*contain;/,
  "展开旧视图必须保持来源卡片比例");
assert.match(styles, /data-workspace-transition="collapse"\]::view-transition-new\(workspace-expand\)\s*\{[\s\S]*?object-fit:\s*contain;[\s\S]*?object-position:\s*center center;[\s\S]*?animation:\s*workspace-collapse-target-in 160ms ease-out both;/,
  "收起目标卡片必须居中并轻微渐入，避免先向左跳动");
assert.match(styles, /data-workspace-transition="collapse"\]::view-transition-old\(workspace-expand\)\s*\{[\s\S]*?opacity:\s*0;/,
  "收起时必须隐藏旧弹窗快照，避免出现白色矩形");
assert.doesNotMatch(styles, /\.modal-backdrop\s*\{[^}]*backdrop-filter/s,
  "真实弹窗遮罩不得使用背景模糊，避免收起快照残留模糊画面");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?::view-transition-group\(workspace-expand\)[\s\S]*?animation-duration:\s*1ms;/,
  "减少动态效果时必须跳过位移缩放动画");
assert.match(noteCard, /const sourceStyles = getComputedStyle\(node\)/,
  "工作区拖动预览必须读取来源卡片的计算样式");
assert.match(noteCard, /preview\.style\.gridTemplateRows = sourceStyles\.gridTemplateRows/,
  "工作区拖动预览必须锁定来源卡片的标题行与主体高度");
assert.match(noteCard, /"--tile-label-height", "--tile-height", "--tile-unit"/,
  "工作区拖动预览必须继承 Grid 尺寸变量");
assert.match(styles, /grid-template-rows:\s*var\(--tile-label-height, 32px\) minmax\(0, 1fr\)/,
  "工作区卡片离开 Grid 上下文后必须保留标题行高度回退值");
assert.match(styles, /\.workspace-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, var\(--tile-unit\)\);[\s\S]*?column-gap:\s*var\(--workspace-grid-column-gap\);[\s\S]*?row-gap:\s*var\(--workspace-grid-row-gap\);/,
  "宽屏工作区必须保持 6 列、32px 横向和 48px 纵向呼吸间距");
assert.match(styles, /\.workspace-card-face\s*\{[\s\S]*?border:\s*1px solid var\(--workspace-card-border\);[\s\S]*?background:\s*var\(--workspace-card-surface\);/,
  "工作区卡片默认必须使用淡化但不透明的背景与边框 Token");
assert.match(styles, /\.workspace-tile:hover \.workspace-card-face,[\s\S]*?background:\s*var\(--surface\);/,
  "工作区卡片悬停或聚焦时必须恢复清晰表面");
assert.match(styles, /\.workspace-tile\.is-dragging\s*\{[\s\S]*?opacity:\s*0;/,
  "工作区拖动时必须隐藏原位源卡片，避免标题行出现灰色占位框");

console.log("工作区动画契约测试通过：原版转场、无模糊遮罩、收起弹窗快照清理、状态恢复及共享尺寸均保持完整。");
