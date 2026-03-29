---
name: requesting-code-review
description: Use after completing a task, implementing a major feature, or before merging code to verify work meets requirements. Essential for quality assurance.
---

# 请求代码审查 (Requesting Code Review)

## 概述

在完成任务、实现主要功能或合并代码之前，通过代码审查验证工作是否符合要求。

**核心原则：** 尽早审查，经常审查。

## 何时请求审查

**强制执行：**
- 在子代理驱动开发的每个任务之后
- 完成主要功能之后
- 合并到主分支之前

**可选但有价值：**
- 遇到卡顿/受阻时（获得新视角）
- 重构之前（建立基准检查）
- 修复复杂错误之后

## 如何请求审查

### 步骤 1：获取 git SHAs

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # 或者 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

### 步骤 2：准备审查信息

填写以下模板：

```markdown
## 代码审查请求

**实现内容：** [刚刚构建的内容]
**计划/需求：** [应该做什么]
**基础提交：** {BASE_SHA}
**最新提交：** {HEAD_SHA}
**简要描述：** [变更简要总结]
```

### 步骤 3：根据反馈采取行动

| 严重级别 | 处理方式 |
|----------|----------|
| Critical（严重） | **立即**修复 |
| Important（重要） | 在继续之前**修复** |
| Minor（次要） | 记录以备后用 |

如果审查者错误，可以用技术理由推回。

## 工作流程集成

### 子代理驱动开发
- 在**每个**任务后审查
- 防止问题累积
- 修复后再进行下一步

### 执行计划
- 每批（3个任务）审查一次
- 获取反馈并应用后继续

### 临时开发
- 合并前审查
- 受阻时审查

## 审查清单

**审查者应检查：**

- [ ] 代码是否符合规格/计划
- [ ] 测试是否覆盖关键路径
- [ ] 边缘情况是否处理
- [ ] 错误处理是否完善
- [ ] 代码是否可读/可维护
- [ ] 是否有性能问题
- [ ] 安全性是否考虑

## 危险信号

**禁止：**
- 因为"它很简单"而跳过审查
- 忽视 Critical 问题
- 在未修复 Important 问题的情况下继续进行
- 与有效的技术反馈争辩

**如果审查者错误：**
- 用技术理由推回
- 展示证明其有效的代码/测试
- 请求澄清

## 与其他技能的集成

- **配合技能**：`subagent-driven-development`、`executing-plans`
- **后续技能**：`receiving-code-review`（处理审查反馈）
