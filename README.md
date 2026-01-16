# Single Page Applications

这是一个包含三个独立单页应用的集合，每个应用都是功能完整的 Web 应用，无需后端服务器即可运行。

## 📦 项目结构

```
SinglePageApplications/
├── ActiveTranslation.html    # 英语学习阅读器
├── ActiveHabits.html          # 习惯追踪应用
├── ActiveTodo.html            # 任务管理应用
└── README.md                  # 本文件
```

## 🚀 应用介绍

### 1. ActiveTranslation.html - Fluent Wing Reader v17

一个优雅的英语学习阅读器，帮助用户通过阅读英文名言来学习英语。

**主要功能：**
- 📖 从 API 获取随机英文名言（历史、科学、智慧、技术等主题）
- 🔍 点击任意单词查看详细释义、音标、词根、例句
- 📚 词汇库：收藏生词，随时复习
- 🌐 自动翻译：提供中文翻译辅助理解
- 💾 本地存储：所有收藏的单词保存在浏览器本地

**技术特点：**
- 使用 `compromise` 库进行自然语言处理
- 集成多个词典 API（Dictionary API、DataMuse、MyMemory 翻译）
- 流畅的卡片式界面设计
- 响应式布局，支持侧边栏展开/收起

**使用方法：**
直接在浏览器中打开 `ActiveTranslation.html` 即可使用。

---

### 2. ActiveHabits.html - Fluent Habit Hub

一个功能丰富的习惯追踪应用，帮助用户建立和维持良好的日常习惯。

**主要功能：**
- ✅ 创建自定义习惯，支持图标和尺寸设置
- 📊 数据分析视图：
  - 年度/月度热力图
  - 30 天趋势折线图
  - 每周频率柱状图
- 📁 习惯分组管理
- 📱 拖拽排序功能
- 💾 数据本地持久化存储

**技术特点：**
- 使用 React 18 构建
- Tailwind CSS 样式框架
- 流畅的动画和交互效果
- 响应式设计

**使用方法：**
直接在浏览器中打开 `ActiveHabits.html` 即可使用。

---

### 3. ActiveTodo.html - iOS 26 Liquid Suite Tasks v68

一个现代化的任务管理应用，具有精美的界面和强大的功能。

**主要功能：**
- ✅ 任务创建、编辑、完成、归档
- 📌 任务置顶功能
- 📅 截止日期设置和提醒
- 🔄 重复任务支持（每日、工作日、每周、每月、每年）
- 🎨 10 种主题切换（Ayu、Dracula、Monokai、One Dark、Xcode 等）
- 📊 活动分析：
  - 年度热力图
  - 月度趋势图表（折线图/柱状图切换）
  - 完整年度日历视图
- 🗑️ 回收站功能
- 🔍 搜索功能
- 📝 Markdown 支持（粗体、斜体、列表、标题、代码、引用）

**技术特点：**
- 使用 ECharts 5.4.3 进行数据可视化
- Lucide 图标库
- 毛玻璃效果（Glassmorphism）设计
- 流畅的动画过渡
- 完全响应式设计

**使用方法：**
直接在浏览器中打开 `ActiveTodo.html` 即可使用。

## 💡 使用说明

### 基本使用

1. 直接在浏览器中打开任意 HTML 文件
2. 所有数据都保存在浏览器的 `localStorage` 中
3. 无需安装任何依赖或配置服务器

### 数据存储

- 所有应用的数据都保存在浏览器的本地存储中
- 清除浏览器数据会删除所有保存的内容
- 建议定期导出重要数据（部分应用支持导出功能）

### 浏览器兼容性

- 推荐使用现代浏览器（Chrome、Firefox、Safari、Edge 最新版本）
- 需要支持 ES6+ JavaScript
- 需要支持 CSS3 和现代 Web API

## 🛠️ 技术栈

### ActiveTranslation.html
- 纯 JavaScript（ES6+）
- Compromise.js（NLP）
- 多个外部 API 集成

### ActiveHabits.html
- React 18
- Tailwind CSS
- Babel Standalone

### ActiveTodo.html
- 纯 JavaScript（ES6+）
- ECharts 5.4.3
- Lucide Icons

## 📝 注意事项

1. **网络连接**：部分应用需要网络连接以获取外部 API 数据
2. **浏览器存储**：数据保存在本地，清除浏览器数据会丢失所有内容
3. **隐私**：所有应用都在本地运行，不会向外部服务器发送用户数据（除了必要的 API 调用）

## 🎨 设计理念

所有应用都遵循以下设计原则：
- **简洁优雅**：现代化的 UI 设计
- **流畅交互**：平滑的动画和过渡效果
- **响应式**：适配不同屏幕尺寸
- **无依赖**：单文件即可运行，无需构建工具

## 📄 许可证

本项目中的代码仅供学习和个人使用。

## 🔄 更新日志

- **ActiveTranslation.html**: v17
- **ActiveHabits.html**: v2.3 Final
- **ActiveTodo.html**: v68 (ECharts)

---

**享受使用！** 🎉
