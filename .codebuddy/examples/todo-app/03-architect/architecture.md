# 待办事项应用 - 架构设计文档

> 🏗️ BMAD 阶段三：Architect - 架构设计

---

## 文档信息

| 项目 | 内容 |
|------|------|
| 项目名称 | TodoApp |
| 版本 | v1.0 |
| 作者 | 架构师 |
| 创建日期 | 2026-02-02 |
| 状态 | 已批准 |

---

## 1. 架构概述

### 1.1 架构目标

- **快速开发**：4 周内完成 MVP
- **简单可靠**：技术简单，运维成本低
- **易于扩展**：便于后续功能迭代

### 1.2 架构风格

**选择**：前后端分离的单体应用

**理由**：
- MVP 阶段功能简单，不需要微服务
- 前后端分离便于独立开发和部署
- 团队规模小，单体架构更易管理

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    React Frontend                    │   │
│  │         (TypeScript + Tailwind CSS)                  │   │
│  └───────────────────────┬─────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────────┘
                           │
                           │ REST API (HTTP/JSON)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     Express Backend                          │
│                    (Node.js + TypeScript)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │   Routes    │  │  Services   │  │   Models    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       Database                               │
│                  SQLite (开发/MVP)                           │
│               PostgreSQL (生产/后续)                         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 部署架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      云服务器 / VPS                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Nginx                             │   │
│  │            (静态文件 + 反向代理)                      │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┴───────────────┐                │
│           │                               │                 │
│  ┌────────▼────────┐            ┌─────────▼────────┐       │
│  │  Static Files   │            │    API Server    │       │
│  │  (React Build)  │            │    (Express)     │       │
│  └─────────────────┘            └─────────┬────────┘       │
│                                           │                 │
│                                  ┌────────▼────────┐       │
│                                  │     SQLite      │       │
│                                  │   (data.db)     │       │
│                                  └─────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 技术选型

### 3.1 技术栈总览

| 层次 | 技术选择 | 版本 | 说明 |
|------|----------|------|------|
| 前端框架 | React | 18.x | 团队熟悉，生态丰富 |
| 前端语言 | TypeScript | 5.x | 类型安全 |
| 前端样式 | Tailwind CSS | 3.x | 快速开发 |
| 后端框架 | Express | 4.x | 轻量级，灵活 |
| 后端语言 | TypeScript | 5.x | 前后端统一 |
| 数据库 | SQLite | 3.x | 简单，适合 MVP |
| ORM | Prisma | 5.x | 类型安全，易用 |

### 3.2 选型依据

详见 ADR-001: 技术栈选型

---

## 4. 模块设计

### 4.1 前端模块

```
frontend/
├── src/
│   ├── components/          # UI 组件
│   │   ├── TaskInput.tsx    # 任务输入框
│   │   ├── TaskList.tsx     # 任务列表
│   │   ├── TaskItem.tsx     # 任务项
│   │   └── Header.tsx       # 页头
│   ├── hooks/               # 自定义 Hooks
│   │   └── useTasks.ts      # 任务数据 Hook
│   ├── services/            # API 调用
│   │   └── taskService.ts   # 任务 API
│   ├── types/               # TypeScript 类型
│   │   └── task.ts          # 任务类型定义
│   ├── App.tsx              # 根组件
│   └── main.tsx             # 入口
├── package.json
└── tsconfig.json
```

### 4.2 后端模块

```
backend/
├── src/
│   ├── routes/              # 路由
│   │   └── tasks.ts         # 任务路由
│   ├── services/            # 业务逻辑
│   │   └── taskService.ts   # 任务服务
│   ├── models/              # 数据模型
│   │   └── task.ts          # 任务模型
│   ├── middleware/          # 中间件
│   │   ├── errorHandler.ts  # 错误处理
│   │   └── logger.ts        # 日志
│   ├── app.ts               # Express 应用
│   └── server.ts            # 服务器入口
├── prisma/
│   └── schema.prisma        # 数据库 Schema
├── package.json
└── tsconfig.json
```

---

## 5. API 设计

### 5.1 API 列表

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/tasks | 获取所有任务 | 否 |
| POST | /api/tasks | 创建任务 | 否 |
| PUT | /api/tasks/:id | 更新任务 | 否 |
| DELETE | /api/tasks/:id | 删除任务 | 否 |

### 5.2 API 详情

#### GET /api/tasks

**响应**：
```json
{
  "code": 200,
  "data": [
    {
      "id": "1",
      "title": "买牛奶",
      "completed": false,
      "createdAt": "2026-02-02T10:00:00Z",
      "updatedAt": "2026-02-02T10:00:00Z"
    }
  ]
}
```

#### POST /api/tasks

**请求**：
```json
{
  "title": "买牛奶"
}
```

**响应**：
```json
{
  "code": 201,
  "data": {
    "id": "1",
    "title": "买牛奶",
    "completed": false,
    "createdAt": "2026-02-02T10:00:00Z",
    "updatedAt": "2026-02-02T10:00:00Z"
  }
}
```

#### PUT /api/tasks/:id

**请求**：
```json
{
  "title": "买酸奶",
  "completed": true
}
```

#### DELETE /api/tasks/:id

**响应**：
```json
{
  "code": 200,
  "message": "Task deleted"
}
```

### 5.3 错误码

| 错误码 | 描述 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 6. 数据设计

### 6.1 数据模型

#### Task 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | String | PK | 主键 (UUID) |
| title | String | NOT NULL | 任务标题 |
| completed | Boolean | DEFAULT false | 完成状态 |
| createdAt | DateTime | DEFAULT NOW | 创建时间 |
| updatedAt | DateTime | AUTO UPDATE | 更新时间 |

### 6.2 Prisma Schema

```prisma
model Task {
  id        String   @id @default(uuid())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 7. 非功能性设计

### 7.1 性能

- 数据库索引：createdAt（排序）
- 前端：React 虚拟 DOM 优化
- API：简单 CRUD，无性能瓶颈

### 7.2 安全

- 输入验证：标题长度限制
- XSS 防护：React 自动转义
- 后续：添加认证后使用 JWT

### 7.3 可扩展性

- 数据库：SQLite → PostgreSQL 迁移方便
- 架构：可拆分为微服务
- 功能：模块化设计，易于添加

---

## 8. 开发规范

### 8.1 代码规范

- ESLint + Prettier
- TypeScript strict 模式
- 命名规范：camelCase（变量）、PascalCase（组件）

### 8.2 Git 规范

```
feat: 新功能
fix: Bug 修复
docs: 文档
style: 格式
refactor: 重构
test: 测试
chore: 构建/工具
```

### 8.3 分支策略

```
main (生产)
  └── develop (开发)
        └── feature/xxx (功能分支)
```

---

## 9. 风险和应对

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SQLite 并发限制 | 低 | MVP 阶段用户量小，后续迁移 PostgreSQL |
| 单点故障 | 中 | 后续添加多实例部署 |

---

## 10. 后续演进

### v1.1 计划
- 添加任务分类
- 添加截止日期
- 迁移到 PostgreSQL

### v1.2 计划
- 用户认证系统
- 数据云同步

---

*架构设计完成，可以进入 Develop 阶段！* ✅
