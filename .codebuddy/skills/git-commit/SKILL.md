---
name: git-commit
description: Git 快速提交工具。将工作区变更自动 add 并生成语义化 commit message 后提交（不 push）。当用户提到以下关键词时使用：git commit、提交代码、提交变更、commit、暂存提交
allowed-tools:
  - Bash
disable: true
---

# Git 快速提交技能

将当前工作区的变更自动暂存（git add）并根据变更内容生成语义化的 commit message 后提交，不执行 push。

## 使用场景

- 完成一段功能开发后需要快速提交
- 需要根据变更内容自动生成规范的 commit message
- 批量暂存并提交所有变更

## 工作流程

```
Step 1: 检查工作区状态 → Step 2: 分析变更内容 → Step 3: 生成 commit message → Step 4: 执行 add + commit
```

### Step 1: 检查工作区状态

执行 `git status` 和 `git diff --stat` 查看当前变更概况。

如果没有任何变更，告知用户工作区是干净的，无需提交。

### Step 2: 分析变更内容

使用以下命令获取变更详情：

```bash
# 查看已跟踪文件的变更摘要
git diff --stat

# 查看未跟踪的新文件
git ls-files --others --exclude-standard

# 查看具体变更内容（用于生成 commit message）
git diff
git diff --cached
```

### Step 3: 生成 Commit Message

根据变更内容生成符合 Conventional Commits 规范的 commit message。

**重要：使用简化格式，省略 scope 部分**

- ✅ 正确格式：`<type>: <subject>` （如 `feat: 新增图片缩放功能`）
- ❌ 错误格式：`<type>(<scope>): <subject>` （如 `feat(editor): 新增图片缩放功能`）

#### Commit Message 格式

```
<type>: <subject>

<body>
```

> 注意：type 后面直接跟冒号和空格，不要添加括号包裹的 scope。

#### Type 类型

| Type     | 说明                               |
| -------- | ---------------------------------- |
| feat     | 新功能                             |
| fix      | 修复 bug                           |
| refactor | 重构（既不是新功能也不是修复 bug） |
| style    | 代码格式化、样式调整（不影响逻辑） |
| docs     | 文档变更                           |
| chore    | 构建工具、辅助工具的变更           |
| perf     | 性能优化                           |
| test     | 测试相关                           |
| ci       | CI/CD 配置变更                     |

#### Subject 规则

- 使用中文，简洁描述变更内容
- 不超过 28 个字符
- 不以句号结尾
- 使用祈使语气（添加、修复、更新、移除...）

#### Body 规则（可选）

- 当变更较复杂时添加 body
- 说明变更的动机和具体内容
- 每行不超过 28 个字符

#### 示例

```
feat: 新增代码块增强插件

- 新增代码块语言选择器
- 新增复制按钮，支持复制代码
```

```
fix: 处理点击打开文件夹无反应问题
```

```
refactor: 将通用的表格 Hooks 提取至共享包
```

### Step 4: 执行提交

```bash
# 暂存所有变更
git add -A

# 提交（使用生成的 commit message）
git commit -m "<generated message>"
```

## 注意事项

- **不执行 push**，仅本地提交
- 如果用户指定了 commit message，直接使用用户提供的
- 如果工作区有冲突文件，提示用户先解决冲突
- 提交前展示变更摘要和生成的 commit message，等待用户确认
- 对于大量变更，可以建议用户分批提交

## 交互流程

1. 执行 `git status` 展示变更概况
2. 分析变更内容，生成 commit message
3. 向用户展示：
   - 变更文件列表
   - 生成的 commit message
4. 用户确认后执行 `git add -A && git commit -m "..."`
5. 展示提交结果
