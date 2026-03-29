---
name: using-git-worktrees
description: Use when starting feature development that requires isolation or before executing an implementation plan. Creates isolated Git worktrees with smart directory selection and safety verification.
---

# 使用 Git Worktrees

## 概述

在开始需要隔离的功能开发或执行实施计划之前，通过智能目录选择和安全验证来创建隔离的 Git worktrees（工作树）。

**核心原则：** 系统化的目录选择 + 安全验证 = 可靠的隔离

## 启动宣言

```
"我正在使用 using-git-worktrees 技能来设置隔离的工作空间。"
```

## 目录选择流程

### 1. 检查现有目录
- 优先检查 `.worktrees`（首选，隐藏目录）
- 其次检查 `worktrees`
- 如果两者都存在，优先使用 `.worktrees`

### 2. 检查配置文件
- 搜索项目配置中的 worktree 偏好
- 如果指定了偏好，直接使用，无需询问

### 3. 询问用户
如果既没有目录也没有配置偏好，询问用户选择：
1. `.worktrees/`（项目本地，隐藏）
2. `~/.config/codebuddy/worktrees/<项目名>/`（全局位置）

## 安全验证

### 对于项目本地目录

**强制要求：** 在创建 worktree **之前**必须验证目录是否已被 git 忽略。

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**如果未被忽略：** 必须先将其添加到 `.gitignore` 并提交，然后才能继续。

**原因：** 防止意外将 worktree 的内容提交到仓库中。

### 对于全局目录

不需要 `.gitignore` 验证，因为目录完全在项目之外。

## 创建步骤

### 1. 检测项目名称

```bash
project=$(basename "$(git rev-parse --show-toplevel)")
```

### 2. 创建 Worktree

根据位置构建路径：
- 本地: `$LOCATION/$BRANCH_NAME`
- 全局: `~/.config/codebuddy/worktrees/$project/$BRANCH_NAME`

```bash
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

### 3. 运行项目设置

自动检测并运行相应的依赖安装：

| 项目类型 | 命令 |
|----------|------|
| Node.js (package.json) | `npm install` |
| Rust (Cargo.toml) | `cargo build` |
| Python (requirements.txt) | `pip install -r requirements.txt` |
| Python (pyproject.toml) | `poetry install` |
| Go (go.mod) | `go mod download` |
| Java (pom.xml) | `mvn install` |

### 4. 验证干净的基线

运行测试以确保 worktree 起始状态是干净的。

**测试失败：** 报告失败并询问是否继续或调查。
**测试通过：** 报告就绪。

### 5. 报告位置

```
Worktree ready at <路径>
Tests passing (<数量> tests, 0 failures)
Ready to implement
```

## 常见错误

| 错误 | 后果 |
|------|------|
| 跳过忽略验证 | worktree 内容被跟踪，污染 git 状态 |
| 假设目录位置 | 不一致，违反项目约定 |
| 在测试失败时继续 | 无法区分新错误和既有问题 |
| 硬编码设置命令 | 在不使用标准工具的项目中失败 |

## 危险信号

**绝对不要：**
- 在未验证忽略的情况下创建 worktree（针对项目本地）
- 跳过基线测试验证
- 未经询问就继续处理失败的测试
- 在模棱两可时假设目录位置

**必须：**
- 遵循目录优先级：现有 > 配置 > 询问
- 验证项目本地目录是否被忽略
- 自动检测并运行项目设置
- 验证干净的测试基线

## 与其他技能的集成

**被调用方：**
- `brainstorming`（第 4 阶段）- 当设计批准并开始实施时
- 任何需要隔离工作区的技能

**配对技能：**
- `finishing-a-development-branch` - 工作完成后清理
- `executing-plans` 或 `subagent-driven-development` - 实际工作在此 worktree 中进行
