---
name: writing-plans
description: Use when you have specifications or requirements for a multi-step task and need to create a detailed implementation plan before coding. Should be used after brainstorming and before executing-plans.
---

# 编写计划 (Writing Plans)

## 概述

将规格说明书转化为可执行的实施计划，每个步骤都是 2-5 分钟的小任务。

**核心原则：** DRY + YAGNI + TDD + 频繁提交

## 何时使用

- 拥有规格说明书或需求
- 需要多步骤实施
- 开始编码之前

**假设执行者：**
- 对代码库背景为零
- 是熟练的开发者，但对工具集或问题领域知之甚少
- 不太擅长设计良好的测试

## 启动宣言

```
"我正在使用 writing-plans 技能来创建实施计划。"
```

## 计划保存路径

```
docs/plans/YYYY-MM-DD-[Feature Name].md
```

## 计划文档结构

### 必须的头部

```markdown
# [Feature Name] 实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** [一句话描述构建内容]
**架构：** [2-3句话关于方法的描述]
**技术栈：** [关键技术/库]

---
```

### 任务结构模板

每个任务需包含：

```markdown
### 任务 N: [组件名称]

**文件：**
- 创建: `exact/path/to/file.py`
- 修改: `exact/path/to/existing.py:123-145`
- 测试: `tests/exact/path/to/test.py`

**步骤 1: 编写失败的测试**
[代码块]

**步骤 2: 运行测试验证失败**
运行: `[命令]`
预期: FAIL [具体错误信息]

**步骤 3: 编写最小实现**
[代码块]

**步骤 4: 运行测试验证通过**
运行: `[命令]`
预期: PASS

**步骤 5: 提交**
```bash
git commit -m "feat: add specific feature"
```
```

## 任务粒度要求

每个步骤必须是**单个动作**，耗时 **2-5 分钟**：

1. 编写失败的测试
2. 运行以确保失败
3. 实现使测试通过的最小代码
4. 运行测试以确保通过
5. 提交代码

## 执行交接

计划保存后，提供执行选择：

```markdown
**计划已保存到 `docs/plans/xxx.md`。两种执行选项：**

**选项 1: Subagent 驱动**
- 在本会话中，每项任务派发新的子代理
- 任务间进行审查，快速迭代
- 使用 `subagent-driven-development` 技能

**选项 2: 顺序执行**
- 按批次执行，设置检查点
- 使用 `executing-plans` 技能

选择哪种方式？
```

## 常见错误

| 错误 | 修正 |
|------|------|
| 任务过大 | 拆分为 2-5 分钟的小步骤 |
| 缺少测试步骤 | 每个功能都需要 RED-GREEN 循环 |
| 路径模糊 | 使用精确的文件路径 |
| 缺少验证命令 | 每个步骤都要有运行命令 |
| 跳过提交 | 每个小功能完成后都要提交 |

## 危险信号

- 任务描述超过 10 行
- 没有测试步骤
- 文件路径使用通配符
- 一个任务修改超过 3 个文件
- 没有验证命令

## 与其他技能的集成

- **前置技能**：`brainstorming`
- **后续技能**：`executing-plans` 或 `subagent-driven-development`
- **辅助技能**：`test-driven-development`
