# Workspace Tiles 视觉规范

本项目的字体、颜色和材质规则参考 Vercel Geist Design System：

- [Typography](https://vercel.com/geist/typography)
- [Colors](https://vercel.com/geist/colors)
- [Materials](https://vercel.com/geist/materials)
- [Button](https://vercel.com/geist/button)
- [Choicebox](https://vercel.com/geist/choicebox)
- [Checkbox](https://vercel.com/geist/checkbox)
- [Empty State](https://vercel.com/geist/empty-state)

## 字体

界面优先使用 Geist Sans。中文字符回退到 PingFang SC、Hiragino Sans GB 或 Microsoft YaHei，不从网络加载字体。

| 语义 | 字号 / 行高 | 字重 | 用途 |
| --- | --- | --- | --- |
| Heading 14 | 14 / 20px | 600 | 工作区名、弹窗标题 |
| Label 14 | 14 / 20px | 400 | 菜单、主要界面文字 |
| Button 14 | 14 / 20px | 500 | 按钮和操作项 |
| Label 13 | 13 / 20px | 500 | 表单标签 |
| Label 12 | 12 / 16px | 400 | 网站名、数量、帮助文字 |

标题使用 `-0.01em` 的轻微负字距。普通文本不使用额外字距。连续文本不小于 12px。

## 颜色

颜色按语义使用，业务样式不直接写灰阶值。

| 语义 Token | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--page` | `#fafafa` | `#000000` | 页面背景 |
| `--surface` | `#ffffff` | `#0a0a0a` | 卡片、弹窗和菜单 |
| `--surface-hover` | `#f2f2f2` | `#1a1a1a` | 可交互元素 Hover |
| `--surface-active` | `#ebebeb` | `#1f1f1f` | 可交互元素 Active |
| `--border` | `#ebebeb` | `#1f1f1f` | 默认边框 |
| `--border-strong` | `#d4d4d4` | `#3d3d3d` | Hover 或较强边界 |
| `--text` | `#171717` | `#ededed` | 主文本和主图标 |
| `--muted` | `#666666` | `#a1a1a1` | 次要文本和图标 |
| `--focus` | `#0068d6` | `#52a8ff` | 键盘焦点环 |
| `--danger` | `#e5484d` | `#ff6166` | 删除和错误 |

颜色层级遵循 Geist 用法：低阶灰用于背景，中阶灰用于边框，高阶灰用于文本和图标。不依赖颜色单独传达信息。

## 材质

| 层级 | 圆角 | 阴影 | 用途 |
| --- | --- | --- | --- |
| Base | 6px | 无，Hover 时使用 Small | 工作区卡片、表单控件 |
| Menu | 12px | `--shadow-menu` | 打开全部、更多菜单 |
| Modal | 12px | `--shadow-modal` | 工作区、编辑和书签弹窗 |
| Fullscreen | 16px | 仅全屏浮层 | 当前未使用 |

同一元素只使用一种 Material。阴影只表达高度，边界仍由边框和键盘焦点环表达。

## Button

| 类型 | 用途 |
| --- | --- |
| Primary | 弹窗的唯一主操作，例如“创建”、“保存” |
| Secondary | 取消、选择书签等普通操作 |
| Tertiary | 低强调的辅助操作 |
| Danger | 删除等不可逆操作 |

默认按钮使用 32px 高度，小按钮使用 28px。每个弹窗最多一个 Primary。异步操作期间按钮显示加载状态、设置 `aria-busy` 并禁用重复提交。纯图标按钮必须同时提供 `title` 和 `aria-label`。

## Checkbox

Checkbox 仅用于书签树的多选。保留原生 `<input type="checkbox">`，并通过 `<fieldset>` / `<legend>` 声明选择组。每个选项都有真实 `<label>`，点击名称即可切换。

文件夹部分选中时：

- Checkbox 使用 `indeterminate` 视觉状态。
- 同时显示 `X/Y` 已选数量，不只依赖颜色或横线。
- 空文件夹可禁用，但必须说明“此文件夹没有网站”。

## Empty State

| 场景 | 类型 | 主操作 |
| --- | --- | --- |
| 首次打开、无工作区 | Informational | 新建工作区 |
| 工作区无网站 | Blank Slate | 添加网站 |
| Chrome 书签树为空 | Blank Slate | 无，仅说明解决方式 |

空状态由标题、补充说明和最多一个 Primary CTA 组成。说明文字补充下一步，不重复标题。CTA 必须使用真实 `<button>`。

## Choicebox

Choicebox 仅用于 4–6 个同组、带标题和说明的单选或多选项。当前工作区导航、打开方式和书签树都不符合这个语义，因此不在当前界面中引入。未来如果增加“默认打开方式”等少量持久选项，再进行评估。
