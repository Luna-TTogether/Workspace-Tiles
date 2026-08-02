# Workspace Tiles 视觉规范

本项目的字体、颜色和材质规则参考 Vercel Geist Design System：

- [Introduction](https://vercel.com/geist/introduction)
- [Typography](https://vercel.com/geist/typography)
- [Colors](https://vercel.com/geist/colors)
- [Materials](https://vercel.com/geist/materials)
- [Button](https://vercel.com/geist/button)
- [Choicebox](https://vercel.com/geist/choicebox)
- [Checkbox](https://vercel.com/geist/checkbox)
- [Empty State](https://vercel.com/geist/empty-state)
- [Textarea](https://vercel.com/geist/textarea)
- [Scroller](https://vercel.com/geist/scroller)
- [Modal](https://vercel.com/geist/modal)
- [Input](https://vercel.com/geist/input)
- [Toast](https://vercel.com/geist/toast)

## 字体

界面使用随扩展打包的 Geist Sans 可变字体，不依赖运行时网络。中文字符回退到 PingFang SC、Hiragino Sans GB 或 Microsoft YaHei。字体文件使用 SIL Open Font License，许可证保存在 `fonts/OFL.txt`。

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
| `--success` | `#1a7f37` | `#3ecf8e` | 保存成功等正向反馈 |

颜色层级遵循 Geist 用法：低阶灰用于背景，中阶灰用于边框，高阶灰用于文本和图标。不依赖颜色单独传达信息。

## 材质

| 层级 | 圆角 | 阴影 | 用途 |
| --- | --- | --- | --- |
| Base | 6px | 无，Hover 时使用 Small | 工作区卡片、表单控件 |
| Menu | 12px | `--shadow-menu` | 打开全部、更多菜单 |
| Modal | 12px | `--shadow-modal` | 工作区、编辑和书签弹窗 |
| Fullscreen | 16px | 仅全屏浮层 | 当前未使用 |

同一元素只使用一种 Material。阴影只表达高度，边界仍由边框和键盘焦点环表达。

## 网格与图标

页面布局遵循 4px 空间网格，常用间距通过 `--space-*` token 表达。组件内部优先使用 8px、12px、16px，区块之间使用 24px、32px 或更大间距。

界面图标统一使用 16px SVG、`currentColor` 和 1.5px 描边。展开箭头通过旋转同一图标表达状态，不混用 Unicode 符号、图片字形或实心圆点。

## Button

| 类型 | 用途 |
| --- | --- |
| Primary | 弹窗的唯一主操作，例如“创建”、“保存” |
| Secondary | 取消、选择书签等普通操作 |
| Tertiary | 低强调的辅助操作 |
| Danger | 删除等不可逆操作 |

默认按钮使用 32px 高度，小按钮使用 28px。每个弹窗最多一个 Primary。异步操作期间按钮显示加载状态、设置 `aria-busy` 并禁用重复提交。纯图标按钮必须同时提供 `title` 和 `aria-label`。

## Checkbox

Checkbox 仅用于书签树和当前窗口标签页列表的多选。保留原生 `<input type="checkbox">`，并通过 `<fieldset>` / `<legend>` 声明选择组。每个选项都有真实 `<label>`，点击名称即可切换。

文件夹部分选中时：

- Checkbox 使用 `indeterminate` 视觉状态。
- 同时显示 `X/Y` 已选数量，不只依赖颜色或横线。
- 空文件夹可禁用，但必须说明“此文件夹没有网站”。

标签页选择器的“全选”使用同一 Checkbox 样式，放在列表顶部并在滚动时吸顶。部分标签页已选时使用 `indeterminate` 状态；无有效 URL 的禁用标签页不计入全选范围。

## Empty State

| 场景 | 类型 | 主操作 |
| --- | --- | --- |
| 首次打开、无工作区 | Informational | 新建工作区 |
| 工作区无网站 | Blank Slate | 添加网站 |
| Chrome 书签树为空 | Blank Slate | 无，仅说明解决方式 |

空状态由标题、补充说明和最多一个 Primary CTA 组成。说明文字补充下一步，不重复标题。CTA 必须使用真实 `<button>`。

## Choicebox

Choicebox 仅用于 4–6 个同组、带标题和说明的单选或多选项。当前工作区导航、打开方式和书签树都不符合这个语义，因此不在当前界面中引入。未来如果增加“默认打开方式”等少量持久选项，再进行评估。

## Scroller 与分页

工作区磁贴每页固定显示 16 个网站。多页时使用“上一页 / 当前页数 / 下一页”控件，不随总页数生成大量圆点。分页区使用独立的 28px 底部区域，不与第四行网站重叠。

工作区弹窗每批渲染 64 个网站，接近底部时再追加下一批。可继续滚动时，容器边缘使用渐隐提示剩余内容。项目必须保持稳定尺寸和 DOM 阅读顺序。

## 直接操作

- 工作区卡片的非交互区域可以直接拖动排序；网站按钮、分页和操作按钮不会触发工作区拖动。
- 首页网站和工作区详情中的网站卡片可以直接拖动排序。首页只调整当前预览页内的顺序，未显示网站保持原位置。
- 点击与拖动由浏览器拖动阈值区分，拖动结束后不得继续触发打开操作。
- 网站右键菜单只拦截网站目标，提供修改和删除；页面其他区域保留浏览器原生右键菜单。
- 工作区和网站不显示独立排序按钮，鼠标排序统一使用直接拖动。
- 网站不显示独立编辑和删除按钮，修改与删除统一放在网站右键菜单中。
- 拖动开始时锁定所有可见项目的几何位置；拖动过程中不改变 DOM 顺序，只通过 `transform` 让其他项目平滑让位，松手后再保存一次最终顺序。
- 添加、修改和删除网站完成后返回操作发起时的首页或工作区详情状态。

## Textarea

Textarea 只用于会自然换行的描述、备注等多行内容。Workspace Note 在卡片反面使用原位 Textarea；工作区名称、网站名称和 URL 保持使用单行 Input。Note Textarea 使用内部边框变化表达焦点，不增加外溢焦点环。

## Modal

弹窗必须使用 `aria-labelledby` 关联可见标题，并把键盘焦点限制在弹窗内部。打开时聚焦首个合理控件，关闭后把焦点还给触发按钮；嵌套流程取消后返回上一级弹窗。

普通弹窗允许按 Escape 或点击遮罩关闭。删除等破坏性弹窗不允许点击遮罩误关，默认焦点放在“取消”，并使用陈述式标题与明确的不可撤销后果说明。

## Input 与校验

名称在提交前去除首尾空格。URL 在失焦或提交时校验，错误紧邻字段展示，并通过 `aria-describedby` 和 `aria-invalid` 暴露给辅助技术。错误发生后保留用户输入，不用 Toast 代替可直接修正的字段错误。

## Toast

Toast 只反馈已经结束且无需继续操作的结果，例如保存成功或存储失败。消息保持简短，一次只显示一条，并通过 `aria-live="polite"` 播报；字段错误继续使用行内提示。

## 规范执行

新功能必须复用现有 Token 和组件工厂，并遵循根目录 `AGENTS.md`。提交前运行 `npm test`；其中 UI 审计会检查颜色字面量、远程资源、原生提示框、Unicode 图标、按钮嵌套、图标按钮标签以及基础交互组件是否仍然存在。GitHub Push 和 Pull Request 会通过 `.github/workflows/ui-check.yml` 自动运行同一套检查。

自动检查不能替代视觉和键盘验收。浅色、深色、560px 窄屏、焦点顺序、错误状态、加载状态和存储失败场景按 `.github/pull_request_template.md` 人工确认。
