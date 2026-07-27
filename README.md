# Workspace Tiles

一个轻量 Chrome 新标签页工作区插件，用磁贴管理常用网站组合。

## 使用

1. 打开 Chrome 扩展管理页：`chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前文件夹：`Workspace Tiles`

## MVP 功能

- 新标签页显示工作区磁贴
- 本机保存到 `chrome.storage.local`
- 添加、重命名、删除工作区
- 新建工作区时可从 Chrome 书签选择文件夹或网站并平铺导入
- 添加、编辑、删除网站
- URL 自动补 `https://`，并支持保留特殊协议地址
- 网站名称为空时使用域名
- favicon 使用 Google favicon 服务，失败时显示名称首字母
- 单个网站点击后在当前标签页打开
- 打开全部支持当前窗口和新窗口

## 权限

默认只申请 `storage` 权限。“从书签添加”首次使用时按需申请可选的 `bookmarks` 权限；用户拒绝后仍可手动创建工作区。新窗口打开全部通过 `chrome.windows.create` 调用，不需要额外声明权限。
