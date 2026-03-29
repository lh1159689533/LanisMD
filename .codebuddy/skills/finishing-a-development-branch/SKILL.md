---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and need to decide how to integrate work. Guides development completion with structured options (merge, PR, or cleanup).
---

# 完成开发分支 (Finishing a Development Branch)

## 概述

当实现完成、所有测试通过，且需要决定如何集成工作时使用。通过提供结构化的选项来指导开发工作的完成。

**核心原则：** 验证测试 → 展示选项 → 执行选择 → 清理工作

## 启动宣言

```
"我正在使用 finishing-a-development-branch 技能来完成此工作。"
```

## 执行流程

### 第一步：验证测试

在展示任何选项之前，必须确认测试通过。

```bash
npm test  # 或 pytest, cargo test, mvn test 等
```

**失败处理：** 如果测试失败，显示失败详情并停止。**严禁**在测试失败时继续合并或创建 PR。

**成功处理：** 如果测试通过，进入第二步。

### 第二步：确定基础分支

确定当前分支分叉自哪个主干分支（通常是 `main` 或 `master`）。

```bash
git merge-base HEAD main
```

### 第三步：展示选项

**必须严格展示以下 4 个选项：**

```
实现完成，所有测试通过。请选择后续操作：

1. 本地合并 - 合并回 [main/master] 分支
2. 创建 PR - 推送并创建 Pull Request
3. 保持原样 - 保留分支，稍后处理
4. 丢弃工作 - 删除此分支和更改
```

**不要**添加额外解释或其他选项。

### 第四步：执行选择

#### 选项 1：本地合并
1. 切换到基础分支并拉取最新代码
2. 合并特性分支
3. 验证合并后的测试结果
4. 如果通过，删除特性分支
5. 进入第五步（清理 Worktree）

```bash
git checkout main
git pull origin main
git merge feature-branch
npm test  # 验证合并后测试
git branch -d feature-branch
```

#### 选项 2：推送并创建 PR
1. 推送分支
2. 使用 CLI 或手动创建 Pull Request

```bash
git push -u origin feature-branch
# 创建 PR（使用 gh CLI 或工蜂 API）
```

3. 进入第五步（清理 Worktree）

#### 选项 3：保持原样
1. 报告："保留分支 <name>。Worktree 保留在 <path>。"
2. **不要**清理 Worktree
3. 流程结束

#### 选项 4：丢弃工作
1. **先确认**：要求用户输入 'discard' 以确认永久删除
2. 切换到基础分支
3. 强制删除特性分支

```bash
git checkout main
git branch -D feature-branch
```

4. 进入第五步（清理 Worktree）

### 第五步：清理 Worktree

**仅适用于选项 1、2 和 4。**

检查是否在 worktree 中，如果是，则移除该 worktree：

```bash
git worktree remove <path>
```

**对于选项 3（保留分支），保留 worktree。**

## 快速参考表

| 选项 | 合并 | 推送 | 保留 Worktree | 清理分支 |
|------|------|------|---------------|----------|
| 1. 本地合并 | ✓ | - | - | ✓ |
| 2. 创建 PR | - | ✓ | - | - |
| 3. 保持原样 | - | - | ✓ | - |
| 4. 丢弃 | - | - | - | ✓ (强制) |

## 常见错误

| 错误 | 修正 |
|------|------|
| 跳过测试验证 | 必须在提供选项前始终验证测试 |
| 开放式提问 | 必须严格展示 4 个固定选项 |
| 自动清理 worktree | 仅在选项 1 和 4 中清理 |
| 无确认丢弃 | 选项 4 必须要求输入 "discard" 确认 |

## 危险信号

**绝不：**
- 在测试失败时继续
- 在合并结果上未验证测试
- 无确认删除工作
- 除非明确要求否则强制推送

**始终：**
- 在展示选项前验证测试
- 展示 4 个固定选项
- 获取选项 4 的输入确认
- 仅在选项 1 和 4 中清理 worktree

## 与其他技能的集成

**调用者：**
- `subagent-driven-development`（第 7 步）
- `executing-plans`（第 5 步）

**配合技能：**
- `using-git-worktrees` - 负责清理由该技能创建的 worktree
