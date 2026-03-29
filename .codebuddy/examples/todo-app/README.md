# 待办事项应用 - BMAD 实战案例

> 🎯 完整展示如何使用 BMAD 方法论从零到一构建一个待办事项应用

---

## 项目概述

这是一个使用 BMAD 方法论开发的待办事项应用示例项目，完整展示了四个阶段的工作流程和产出物。

### 技术栈

- **前端**：React + TypeScript + Tailwind CSS
- **后端**：Node.js + Express
- **数据库**：SQLite（开发）/ PostgreSQL（生产）

---

## BMAD 四阶段记录

### 📁 文档目录

```
todo-app/
├── README.md                    # 本文档
├── 01-brainstorm/               # 🎯 头脑风暴阶段
│   └── brainstorm-notes.md      # 头脑风暴记录
├── 02-map/                      # 🗺️ 需求映射阶段
│   ├── prd.md                   # 产品需求文档
│   └── user-stories.md          # 用户故事列表
├── 03-architect/                # 🏗️ 架构设计阶段
│   ├── architecture.md          # 架构设计文档
│   └── adr/                     # 架构决策记录
│       └── ADR-001-tech-stack.md
└── 04-develop/                  # 💻 开发实现阶段
    ├── sprint-1/                # Sprint 1
    │   ├── sprint-plan.md       # Sprint 计划
    │   └── sprint-review.md     # Sprint 回顾
    └── code-samples/            # 代码示例
        ├── api-example.ts       # API 示例
        └── component-example.tsx # 组件示例
```

---

## 阶段一：Brainstorm（头脑风暴）

### 问题定义

**核心问题**：帮助用户有效管理日常任务，提高工作效率。

### 目标用户

1. **个人用户**：需要管理日常待办的个人
2. **学生**：管理作业、学习任务
3. **自由职业者**：项目和客户任务管理

### 初步方案

选择构建一个简洁、易用的 Web 待办应用，MVP 聚焦核心功能。

📄 详细内容见：[01-brainstorm/brainstorm-notes.md](./01-brainstorm/brainstorm-notes.md)

---

## 阶段二：Map（需求映射）

### MVP 功能

| 优先级 | 功能 | 用户故事 |
|--------|------|----------|
| Must | 创建任务 | US-001 |
| Must | 查看任务列表 | US-002 |
| Must | 完成任务 | US-003 |
| Must | 删除任务 | US-004 |
| Should | 任务分类 | US-005 |
| Could | 任务截止日期 | US-006 |

### 核心用户故事示例

**US-001: 创建任务**

```
作为用户，
我想要快速创建新任务，
以便记录我需要完成的事项。

验收标准：
Given 用户在任务列表页
When 用户输入任务标题并确认
Then 新任务出现在列表中
```

📄 详细内容见：
- [02-map/prd.md](./02-map/prd.md)
- [02-map/user-stories.md](./02-map/user-stories.md)

---

## 阶段三：Architect（架构设计）

### 架构风格

前后端分离的单体应用（适合 MVP 阶段）

### 技术选型

| 层次 | 选型 | 原因 |
|------|------|------|
| 前端 | React + TS | 团队熟悉，生态丰富 |
| 后端 | Express | 轻量级，快速开发 |
| 数据库 | SQLite | 简单，适合 MVP |

### 系统架构

```
┌─────────────────────────────────────────────┐
│                 Frontend                     │
│            React + TypeScript                │
└──────────────────┬──────────────────────────┘
                   │ REST API
┌──────────────────▼──────────────────────────┐
│                 Backend                      │
│            Express + Node.js                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│                Database                      │
│                SQLite                        │
└─────────────────────────────────────────────┘
```

📄 详细内容见：
- [03-architect/architecture.md](./03-architect/architecture.md)
- [03-architect/adr/ADR-001-tech-stack.md](./03-architect/adr/ADR-001-tech-stack.md)

---

## 阶段四：Develop（开发实现）

### Sprint 1 目标

实现任务的 CRUD 基础功能

### Sprint 1 Backlog

| 任务 | 故事点 | 状态 |
|------|--------|------|
| 项目初始化 | 2 | ✅ |
| 创建任务 API | 3 | ✅ |
| 任务列表 API | 2 | ✅ |
| 前端任务列表 | 5 | ✅ |
| 前端创建任务 | 3 | ✅ |

### 代码示例

详见 `04-develop/code-samples/` 目录

📄 详细内容见：
- [04-develop/sprint-1/sprint-plan.md](./04-develop/sprint-1/sprint-plan.md)

---

## 学习要点

### 1. 阶段不可跳过

- ✅ 每个阶段都有明确的输入和输出
- ✅ 上一阶段的产出是下一阶段的输入
- ✅ 遇到问题可以回退到上一阶段

### 2. 文档驱动

- ✅ 每个阶段产出明确的文档
- ✅ 文档是沟通的基础
- ✅ 文档便于追溯和传承

### 3. 角色分离

- ✅ 不同阶段使用不同的角色视角
- ✅ 角色聚焦自己的专业领域
- ✅ 避免一个人同时戴多顶帽子

### 4. 小步快跑

- ✅ MVP 先行，核心功能优先
- ✅ 每完成一步就验证一步
- ✅ 快速迭代，持续改进

---

## 如何使用本案例

1. **学习 BMAD 流程**：按顺序阅读各阶段文档
2. **参考模板**：复制文档模板用于自己的项目
3. **理解产出物**：了解每个阶段应该产出什么
4. **实践练习**：用类似项目练习 BMAD 流程

---

## 相关资源

- [BMAD 方法论完全指南](../../../BMAD-Methodology-Guide.md)
- [BMAD + CodeBuddy 集成指南](../../../BMAD-CodeBuddy-Integration-Guide.md)
- [文档模板库](../templates/)
- [提示词库](../prompts/)

---

*祝你学习愉快！🚀*
