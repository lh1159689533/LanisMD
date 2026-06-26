# AGENTS.md — LanisMD

本文件面向 AI 编码代理（Claude Code / Codex / CodeBuddy / Copilot 等），提供本项目的工作流、约定与自我改进机制。

## 项目概览

- **技术栈**: Tauri 2 + Vite + React + TypeScript + TailwindCSS
- **包管理器**: `pnpm`（**不要使用 npm/yarn**，lock 文件为 `pnpm-lock.yaml`，配置 `.npmrc`）
- **前端入口**: `src/`
- **桌面端入口**: `src-tauri/`
- **构建产物**: `dist/`（已在 .gitignore）
- **文档**: `docs/`（已在 .gitignore）

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm dev                # 启动 Vite 开发服务
pnpm tauri dev          # 启动 Tauri 桌面开发模式
pnpm build              # 构建前端
pnpm tauri build        # 构建桌面安装包
```

> 如命令名与 `package.json` 不一致，先读取 `package.json` 的 `scripts` 字段为准。

## 自我改进工作流（Self-Improvement）

本项目集成了 `self-improvement` skill，主入口：[`.codebuddy/skills/self-improvement/SKILL.md`](.codebuddy/skills/self-improvement/SKILL.md)

### 触发记录的时机

| 情境 | 写入文件 | ID 前缀 |
|---|---|---|
| 命令/操作失败 | `.codebuddy/.learnings/ERRORS.md` | `ERR-` |
| 用户纠正你（"不对"、"实际上是…"） | `.codebuddy/.learnings/LEARNINGS.md`（category: `correction`） | `LRN-` |
| 用户期望但当前不支持的能力 | `.codebuddy/.learnings/FEATURE_REQUESTS.md` | `FEAT-` |
| 发现知识过时 / 文档差异 | `.codebuddy/.learnings/LEARNINGS.md`（category: `knowledge_gap`） | `LRN-` |
| 发现更优的反复出现的写法 | `.codebuddy/.learnings/LEARNINGS.md`（category: `best_practice`） | `LRN-` |

### 记录格式（必读）

完整字段、状态机、晋升规则请参考：
- `.codebuddy/skills/self-improvement/SKILL.md` § Logging Format
- `.codebuddy/skills/self-improvement/references/examples.md`

每条记录 ID 形如 `LRN-YYYYMMDD-XXX` / `ERR-YYYYMMDD-XXX` / `FEAT-YYYYMMDD-XXX`，必须包含 `Priority` / `Status` / `Area` / `Summary` / `Details` / `Suggested Action` / `Metadata` 字段。

### 三级沉淀漏斗

```
.learnings/*.md（瞬时日志）
   │  Recurrence-Count ≥ 3 且跨 2+ 任务、30 天内
   ▼
项目长期记忆：CLAUDE.md / AGENTS.md
   │  通用、可复用、非项目相关
   ▼
独立 Skill：skills/<name>/SKILL.md
   （可用 ./.codebuddy/skills/self-improvement/scripts/extract-skill.sh 生成脚手架）
```

### 安全准则（强制）

- ❌ 禁止将 secrets、token、API key、`.env` 内容、完整凭证日志写入 `.learnings/`
- ✅ 长输出做摘要或脱敏后再写入
- `.learnings/` 已加入 `.gitignore`，默认只在本地保留

## 修改前必读

1. **包管理**：永远使用 `pnpm`
2. **代码风格**：项目带 `.prettierrc`，编辑后保持现有格式
3. **不要修改**：`docs/`、`dist/`、`src-tauri/target/`
4. **新功能开发完成后**：评估是否需要往 `.learnings/` 写一条 learning（参考上面"触发记录的时机"）

## 周期回顾

每完成一个主要任务后，简要检查：
```bash
grep -h "Status\*\*: pending" .learnings/*.md | wc -l   # 还有多少待处理
grep -B5 "Priority\*\*: high" .learnings/*.md | grep "^## \["   # 列出 high 优先级条目
```
