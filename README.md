# LanisMD

一款基于 Tauri 2 + React 构建的现代化跨平台 Markdown 编辑器，提供简洁优雅的写作体验。

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.x-orange)
![React](https://img.shields.io/badge/React-18-61dafb)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能特性

- 📝 **所见即所得编辑** — 基于 [Milkdown](https://milkdown.dev/) 的富文本 Markdown 编辑体验
- 🌙 **深色 / 浅色主题** — 支持多种主题切换，适应不同使用场景
- 📂 **文件树管理** — 侧边栏文件树浏览，快速打开和管理文档
- 🗂️ **大纲导航** — 自动解析文档标题结构，快速跳转
- 🔍 **文件内搜索** — 在文档中快速定位内容
- 💾 **自动保存** — 编辑内容自动保存，防止数据丢失
- 📁 **最近文件夹** — 快速访问最近打开的文件夹
- ⌨️ **快捷键支持** — 常用操作绑定快捷键，提升效率
- 📤 **导出功能** — 支持将文档导出为多种格式
- 🔄 **文件监听** — 实时检测外部文件变更并同步更新
- 🧮 **KaTeX 数学公式** — 支持 LaTeX 数学公式渲染
- 📊 **Mermaid 图表** — 支持 Mermaid 语法绘制流程图、时序图等
- 🖥️ **跨平台** — 支持 macOS、Windows 和 Linux

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | [Tauri 2](https://v2.tauri.app/) |
| 前端框架 | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| 构建工具 | [Vite 5](https://vitejs.dev/) |
| 编辑器内核 | [Milkdown](https://milkdown.dev/) (基于 ProseMirror) |
| 样式方案 | [Tailwind CSS 3](https://tailwindcss.com/) |
| 状态管理 | [Zustand](https://github.com/pmndrs/zustand) |
| 后端语言 | [Rust](https://www.rust-lang.org/) |

## 📦 项目结构

```
LanisMD/
├── src/                    # 前端源码
│   ├── components/         # UI 组件
│   │   ├── common/         # 通用组件（Toast 等）
│   │   ├── editor/         # 编辑器相关组件
│   │   ├── layout/         # 布局组件（标题栏、侧边栏、文件树等）
│   │   └── settings/       # 设置对话框
│   ├── editor/             # 编辑器核心
│   │   ├── components/     # 编辑器 UI 组件
│   │   ├── hooks/          # 编辑器专用 Hooks
│   │   ├── plugins/        # Milkdown 插件
│   │   └── theme/          # 编辑器主题
│   ├── hooks/              # 全局 React Hooks
│   ├── services/           # 服务层
│   ├── stores/             # Zustand 状态管理
│   ├── styles/             # 全局样式
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   ├── App.tsx             # 应用入口组件
│   └── main.tsx            # 渲染入口
├── src-tauri/              # Tauri/Rust 后端源码
│   ├── src/                # Rust 源码
│   └── Cargo.toml          # Rust 依赖配置
├── public/                 # 静态资源
├── docs/                   # 项目文档
├── package.json            # 前端依赖配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind CSS 配置
└── tsconfig.json           # TypeScript 配置
```

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Rust](https://rustup.rs/) >= 1.70
- Tauri 2 系统依赖（参考 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)）

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/your-username/LanisMD.git
cd LanisMD

# 安装前端依赖
pnpm install
```

### 开发模式

```bash
# 启动 Tauri 开发模式（包含热重载）
pnpm tauri dev
```

### 构建发布

```bash
# 构建生产版本
pnpm tauri build
```

构建产物将输出到 `src-tauri/target/release/bundle/` 目录。

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + N` | 新建文件 |
| `Cmd/Ctrl + O` | 打开文件 |
| `Cmd/Ctrl + S` | 保存文件 |
| `Cmd/Ctrl + B` | 切换侧边栏 |
| `Cmd/Ctrl + ,` | 打开设置 |

## 🔧 CI/CD

项目使用 GitHub Actions 进行自动化构建和发布：

- 推送 `v*` 标签时自动触发构建
- 支持 macOS (ARM64 / x86_64)、Ubuntu、Windows 多平台构建
- 自动创建 GitHub Release Draft

## 📄 许可证

[MIT License](LICENSE)
