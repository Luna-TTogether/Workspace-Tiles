## UI 验收

- [ ] 复用了 `styles.css` 中的语义 Token，没有在组件中增加颜色字面量
- [ ] 复用了现有 Button、Modal、Toast、Input Error 和 Empty State 工厂
- [ ] 浅色与深色模式均可辨认，状态不只依赖颜色表达
- [ ] 可通过 Tab、Shift+Tab、Enter、Space 和 Escape 完成操作
- [ ] 弹窗打开后焦点正确，关闭后回到触发位置
- [ ] 覆盖了空状态、错误状态、加载状态和存储失败回滚
- [ ] 纯图标按钮包含 `title` 和 `aria-label`
- [ ] 560px 窄屏下没有遮挡、溢出或不可触达操作
- [ ] 没有增加远程字体、脚本或样式依赖
- [ ] 已运行 `npm run check`
