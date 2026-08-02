import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function report(file, line, message) {
  errors.push(`${file}:${line}  ${message}`);
}

function lineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function runSyntaxCheck(relativePath) {
  const result = spawnSync(process.execPath, ["--check", path.join(projectRoot, relativePath)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    report(relativePath, 1, (result.stderr || result.stdout).trim() || "JavaScript 语法检查失败");
  }
}

function checkForbiddenText(file, source) {
  const rules = [
    { pattern: /window\.(?:alert|confirm)\s*\(/g, message: "请使用 Toast 或破坏性确认弹窗，不要使用原生 alert/confirm" },
    { pattern: /[‹›●▰]/g, message: "请使用统一的 SVG 图标，不要使用 Unicode 图形符号" },
  ];
  rules.forEach(({ pattern, message }) => {
    for (const match of source.matchAll(pattern)) report(file, lineNumber(source, match.index), message);
  });
}

function checkCss(file, source, { requireTokens = false } = {}) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => "\n".repeat(comment.split("\n").length - 1));
  const colorPattern = /(?:#[\da-f]{3,8}\b|(?:rgb|hsl)a?\s*\()/gi;
  let blockDepth = 0;
  let rootDepth = null;

  withoutComments.split("\n").forEach((line, index) => {
    const opensRoot = /^\s*:root\s*\{/.test(line);
    if (opensRoot) rootDepth = blockDepth + 1;

    if (colorPattern.test(line)) {
      const isCustomProperty = /^\s*--[\w-]+\s*:/.test(line);
      if (!isCustomProperty || rootDepth === null) {
        report(file, index + 1, "组件颜色必须引用语义 Token；颜色字面量只能在 :root Token 中定义");
      }
    }
    colorPattern.lastIndex = 0;

    blockDepth += (line.match(/\{/g) || []).length;
    blockDepth -= (line.match(/\}/g) || []).length;
    if (rootDepth !== null && blockDepth < rootDepth) rootDepth = null;
  });

  for (const match of withoutComments.matchAll(/url\(\s*["']?https?:/gi)) {
    report(file, lineNumber(withoutComments, match.index), "样式和字体资源必须随扩展本地打包");
  }

  if (requireTokens) {
    const requiredTokens = [
      "--page", "--surface", "--text", "--muted", "--border", "--focus", "--danger",
      "--success", "--radius-base", "--shadow-modal", "--space-1", "--space-4", "--font-sans",
    ];
    requiredTokens.forEach((token) => {
      if (!source.includes(`${token}:`)) report(file, 1, `缺少基础设计 Token ${token}`);
    });
  }

  for (const match of source.matchAll(/--space-[\w-]+\s*:\s*([\d.]+)px/g)) {
    if (Number(match[1]) % 4 !== 0) {
      report(file, lineNumber(source, match.index), `空间 Token ${match[0]} 不在 4px 网格上`);
    }
  }
}

function checkScriptAndMarkupColors(file, source) {
  const colorPattern = /(?:#[\da-f]{3,8}\b|(?:rgb|hsl)a?\s*\()/gi;
  for (const match of source.matchAll(colorPattern)) {
    report(file, lineNumber(source, match.index), "JavaScript 和 HTML 中不得写颜色字面量，请使用 CSS 语义 Token");
  }
}

function checkHtml(file, source) {
  for (const match of source.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/gi)) {
    report(file, lineNumber(source, match.index), "脚本、样式和字体不得使用运行时网络依赖");
  }

  let buttonDepth = 0;
  for (const match of source.matchAll(/<\/?button\b[^>]*>/gi)) {
    const tag = match[0];
    if (/^<\/button/i.test(tag)) {
      buttonDepth = Math.max(0, buttonDepth - 1);
      continue;
    }
    if (buttonDepth > 0) report(file, lineNumber(source, match.index), "不能嵌套 button");
    buttonDepth += 1;

    if (/class=["'][^"']*\bicon-button\b/i.test(tag)) {
      if (!/\baria-label=["'][^"']+["']/i.test(tag)) {
        report(file, lineNumber(source, match.index), "纯图标按钮缺少 aria-label");
      }
      if (!/\btitle=["'][^"']+["']/i.test(tag)) {
        report(file, lineNumber(source, match.index), "纯图标按钮缺少 title");
      }
    }
  }
}

function checkRequiredPatterns(file, source, patterns) {
  patterns.forEach(({ pattern, message }) => {
    if (!pattern.test(source)) report(file, 1, message);
  });
}

function runSelfTest() {
  errors.length = 0;
  checkForbiddenText("fixture.js", "window.alert('x'); const icon = '●';");
  checkHtml("fixture.html", '<button class="icon-button"><button type="button">嵌套</button></button>');
  checkCss("fixture.css", '.fixture { color: #fff; background-image: url("https://example.com/a.png"); }');

  const output = errors.join("\n");
  const expectedMessages = [
    "原生 alert/confirm",
    "Unicode 图形符号",
    "不能嵌套 button",
    "纯图标按钮缺少 aria-label",
    "纯图标按钮缺少 title",
    "颜色字面量只能在 :root Token 中定义",
    "样式和字体资源必须随扩展本地打包",
  ];
  const missing = expectedMessages.filter((message) => !output.includes(message));
  if (missing.length) {
    console.error(`UI 检查器自测失败，未拦截：${missing.join("、")}`);
    process.exit(1);
  }

  console.log("UI 检查器自测通过：已验证颜色、远程资源、原生提示、Unicode 图标、按钮嵌套和图标标签规则。");
  process.exit(0);
}

if (process.argv.includes("--self-test")) runSelfTest();

const sourceFiles = [
  "app.js",
  "backup.js",
  "favicon.js",
  "forms.js",
  "i18n.js",
  "popup.js",
  "quick-add.js",
  "reorder.js",
  "state.js",
  "ui-components.js",
  "utils.js",
  "workspace-note-card.js",
  "workspace-notes.js",
];
sourceFiles.forEach(runSyntaxCheck);

try {
  JSON.parse(read("manifest.json"));
} catch (error) {
  report("manifest.json", 1, `Manifest JSON 无效：${error.message}`);
}

const css = read("styles.css");
const popupCss = read("popup.css");
const app = read("app.js");
const uiComponents = read("ui-components.js");
const html = read("newtab.html");
const popupHtml = read("popup.html");
const designSystem = read("DESIGN_SYSTEM.md");

checkCss("styles.css", css, { requireTokens: true });
checkCss("popup.css", popupCss);
checkHtml("newtab.html", html);
checkHtml("popup.html", popupHtml);
sourceFiles.forEach((filename) => {
  const source = read(filename);
  checkForbiddenText(filename, source);
  checkScriptAndMarkupColors(filename, source);
});
checkForbiddenText("newtab.html", html);
checkScriptAndMarkupColors("newtab.html", html);
checkForbiddenText("popup.html", popupHtml);
checkScriptAndMarkupColors("popup.html", popupHtml);

checkRequiredPatterns("ui-components.js", uiComponents, [
  { pattern: /function createDialog\(/, message: "缺少统一弹窗工厂 createDialog()" },
  { pattern: /function showModal\(/, message: "缺少统一弹窗入口 showModal()" },
  { pattern: /function trapModalFocus\(/, message: "缺少弹窗焦点循环" },
  { pattern: /function openDestructiveModal\(/, message: "缺少破坏性操作确认组件" },
  { pattern: /function showToast\(/, message: "缺少统一 Toast 反馈" },
  { pattern: /function setFieldError\(/, message: "缺少统一字段错误反馈" },
]);

checkRequiredPatterns("newtab.html", html, [
  { pattern: /id="toastRegion"[^>]*aria-live="polite"/, message: "Toast 区域必须使用 aria-live=polite" },
]);

checkRequiredPatterns("DESIGN_SYSTEM.md", designSystem, [
  { pattern: /## Modal/, message: "设计规范缺少 Modal 规则" },
  { pattern: /## Input 与校验/, message: "设计规范缺少 Input 校验规则" },
  { pattern: /## Toast/, message: "设计规范缺少 Toast 规则" },
]);

for (const asset of ["fonts/Geist.woff2", "fonts/OFL.txt"]) {
  if (!existsSync(path.join(projectRoot, asset))) report(asset, 1, "缺少本地字体资源或许可证");
}

if (errors.length) {
  console.error(`UI 检查失败（${errors.length} 项）：\n`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("UI 检查通过：语法、Manifest、Token、资源、反馈组件与基础无障碍规则均符合规范。");
