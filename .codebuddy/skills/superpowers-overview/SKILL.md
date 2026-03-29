---
name: superpowers-overview
description: Use at the start of any conversation to understand available skills and when to use them. Provides overview of the superpowers skill framework adapted for CodeBuddy.
---

# Superpowers 技能框架概览

## 概述

Superpowers 是一套基于可组合"技能"构建的 AI 编程工作流框架，专为高质量软件开发设计。

**核心理念：** 不是让 AI 直接开始写代码，而是通过结构化流程确保高质量输出。

## 核心工作流

```
1. 明确需求 (brainstorming)
      ↓
2. 编写计划 (writing-plans)
      ↓
3. 创建隔离环境 (using-git-worktrees)
      ↓
4. 执行计划 (executing-plans 或 subagent-driven-development)
      ↓
5. 代码审查 (requesting-code-review)
      ↓
6. 完成分支 (finishing-a-development-branch)
```

## 技能分类

### 🎯 核心工作流技能

| 技能 | 何时使用 |
|------|----------|
| `brainstorming` | 开始任何创意工作之前，明确需求和设计 |
| `writing-plans` | 有规格后，在编码前创建详细实施计划 |
| `executing-plans` | 按批次执行计划，带审查检查点 |
| `subagent-driven-development` | 同会话中执行计划，每任务派发子代理 |

### 🔧 开发实践技能

| 技能 | 何时使用 |
|------|----------|
| `test-driven-development` | 实现任何功能、bug 修复或重构 |
| `systematic-debugging` | 面对任何技术问题（测试失败、Bug、性能问题） |
| `verification-before-completion` | 在声称工作完成之前 |

### 👥 协作技能

| 技能 | 何时使用 |
|------|----------|
| `requesting-code-review` | 完成任务后，合并前请求审查 |
| `receiving-code-review` | 收到代码审查反馈时 |
| `dispatching-parallel-agents` | 面对多个独立的并行任务 |

### 🛠️ 工具技能

| 技能 | 何时使用 |
|------|----------|
| `using-git-worktrees` | 需要隔离的开发环境时 |
| `finishing-a-development-branch` | 实现完成，需要决定如何集成 |

## 使用原则

### 1. 如果有 1% 的可能性某技能适用，就使用它

不是可选项，而是强制执行。

### 2. 技能优先级

1. **过程技能优先**（brainstorming, systematic-debugging）- 决定*如何*处理任务
2. **实施技能其次**（TDD, writing-plans）- 指导执行

### 3. 声明使用

开始使用技能时，声明：
```
"我正在使用 [技能名称] 来 [目的]。"
```

### 4. 遵循检查清单

如果技能有检查清单，创建 TodoWrite 来跟踪。

## 典型场景

### 新功能开发
1. `brainstorming` → 明确需求
2. `writing-plans` → 创建计划
3. `using-git-worktrees` → 隔离环境
4. `subagent-driven-development` → 执行
5. `finishing-a-development-branch` → 完成

### Bug 修复
1. `systematic-debugging` → 找到根本原因
2. `test-driven-development` → 编写失败测试
3. `verification-before-completion` → 验证修复

### 代码审查
1. `requesting-code-review` → 请求审查
2. `receiving-code-review` → 处理反馈

## 危险信号

如果你在想以下内容，**停止并使用相应技能**：

| 想法 | 应该使用的技能 |
|------|----------------|
| "这只是个简单的问题" | 检查相关技能 |
| "我需要先了解更多背景" | 技能检查优先于澄清 |
| "让我先快速修一下" | `systematic-debugging` |
| "这不需要正式的技能" | 如果技能存在，就使用它 |
| "我记得这个技能" | 技能会演进，重新读取 |

## 安装位置

所有技能已安装到：
```
~/.codebuddy/skills/
```

这是用户级配置，适用于所有项目。
