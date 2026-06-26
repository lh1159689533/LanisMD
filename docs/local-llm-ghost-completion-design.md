# LanisMD 本地 LLM 幽灵补全实施文档

## 1. 概述

### 1.1 目标

为 LanisMD 实现基于本地 LLM（llama.cpp server）的幽灵补全（Ghost Text）功能。用户在编辑 Markdown 文档时，系统自动在光标位置显示灰色的 AI 补全建议文本，用户按 Tab 接受或 Esc 取消。

### 1.2 核心价值

- **完全离线可用**：无需网络即可使用 AI 补全
- **数据隐私**：文本上下文永远不离开本机
- **零成本**：无 API 调用费用

### 1.3 参考方案

- xeditor：Tauri 2 + TipTap + llama-server sidecar 的幽灵补全实现
- llama.vscode：VS Code + llama.cpp 的 FIM 补全实现

### 1.4 技术前提

LanisMD 已具备以下基础设施：

| 组件 | 现状 |
|------|------|
| `@tauri-apps/plugin-shell` | 已安装（前端 + Rust 侧均就绪） |
| `tauri-plugin-shell` (Rust) | Cargo.toml 已声明 |
| `shell:allow-open` | capabilities/default.json 已配置 |
| ProseMirror Plugin 模式 | 项目中已有 27 个 `$prose` 插件，模式成熟 |
| Decoration.widget 经验 | placeholder / upload-progress / focus-mode 均使用 Decoration |
| AI 云端通道 | 完整的 OpenAI 兼容 SSE 流式链路 |
| Zustand 状态管理 | ai-store.ts 已存在 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Milkdown Plugin 层                         │
│  src/editor/plugins/ghost-completion/                        │
│  ├── index.ts          ProseMirror Plugin 主入口             │
│  ├── types.ts          类型定义                              │
│  ├── decoration.ts     Decoration.widget 创建与管理          │
│  ├── keymap.ts         Tab/Esc 键盘处理                      │
│  └── context.ts        上下文采集（光标前后文本提取）          │
├──────────────────────────────────────────────────────────────┤
│                    Service 层                                 │
│  src/services/local-llm-service.ts                           │
│  ├── sidecar 生命周期管理（start/stop/restart）               │
│  ├── 健康检查（/health 轮询）                                 │
│  └── 补全请求（POST /completion）                             │
├──────────────────────────────────────────────────────────────┤
│                    Store 层                                   │
│  src/stores/ai-store.ts（扩展现有）                           │
│  └── localLlm: { enabled, status, modelPath, port }         │
├──────────────────────────────────────────────────────────────┤
│                    Tauri 配置层                               │
│  src-tauri/tauri.conf.json    → externalBin 声明              │
│  src-tauri/capabilities/      → shell:allow-spawn/kill 权限   │
│  CSP                          → connect-src localhost         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户输入字符
    │
    ▼
ghost-completion Plugin: onTransaction 钩子
    │ clearTimeout → setTimeout（400ms 防抖）
    ▼
防抖到期 → 检查触发条件
    │ ✓ 本地 LLM 已启动（status === 'running'）
    │ ✓ 幽灵补全已启用（ghostCompletionEnabled）
    │ ✓ 光标前文本 >= 5 字符
    │ ✓ 无正在进行的请求
    │ ✓ 光标在段落/heading/list_item 内（非 code_block）
    ▼
context.ts: 采集上下文
    │ beforeText = 光标前 2000 字符
    │ afterText = 光标后 500 字符
    ▼
local-llm-service.ts: requestCompletion()
    │ POST http://localhost:{port}/completion
    │ Body: { prompt (FIM), n_predict, stop, temperature, ... }
    │ AbortController 支持取消
    ▼
解析响应 → 提取补全文本
    │ 后处理：trim、过滤空结果、限制最大行数
    ▼
decoration.ts: 创建 Decoration.widget
    │ 通过 Transaction meta 通知 Plugin 更新状态
    ▼
渲染灰色幽灵文本 → 等待用户操作
    │
    ├── Tab     → insertContent(text) → 清除 Decoration
    ├── Escape  → 清除 Decoration
    ├── 继续输入 → 清除 Decoration → 重新触发防抖
    ├── 光标移动 → 清除 Decoration
    └── 失焦    → 清除 Decoration
```

---

## 3. 文件结构

### 3.1 新增文件

```
src/
├── editor/plugins/ghost-completion/
│   ├── index.ts              # Milkdown $prose 插件主入口
│   ├── types.ts              # 类型定义（GhostState、GhostConfig 等）
│   ├── decoration.ts         # Decoration.widget 创建工具函数
│   ├── keymap.ts             # Tab/Esc 键盘事件处理
│   └── context.ts            # ProseMirror State → 光标前后文本提取
├── services/
│   └── local-llm-service.ts  # llama-server sidecar 管理 + 补全请求
├── styles/editor/
│   └── ghost-completion.css  # 幽灵文本渲染样式

src-tauri/
└── llama-server/             # sidecar 二进制存放目录（开发时手动放入）
    └── llama-server-{target-triple}
```

### 3.2 修改文件

| 文件 | 变更内容 |
|------|---------|
| `src/editor/editor-setup.ts` | 注册 ghostCompletionPlugin |
| `src/stores/ai-store.ts` | 扩展 localLlm 相关状态 |
| `src/types/ai.ts` | 新增 LocalLlmConfig / GhostCompletionConfig 类型 |
| `src/styles/variables.css` | 新增 `--lanismd-ghost-*` CSS 变量 |
| `src-tauri/tauri.conf.json` | 新增 `externalBin` 和 CSP 配置 |
| `src-tauri/capabilities/default.json` | 新增 shell:allow-spawn/kill 权限 |

---

## 4. 详细设计

### 4.1 类型定义（`types.ts`）

```typescript
/** 本地 LLM 运行状态 */
export type LocalLlmStatus = 'stopped' | 'starting' | 'running' | 'error';

/** 本地 LLM 配置（持久化到 settings） */
export interface LocalLlmConfig {
  /** 是否启用本地 LLM */
  enabled: boolean;
  /** GGUF 模型文件路径 */
  modelPath: string;
  /** llama-server 监听端口（默认 8080） */
  port: number;
  /** 上下文窗口大小（默认 2048） */
  ctxSize: number;
  /** GPU 层数（0 = 纯 CPU，-1 = 全 GPU） */
  nGpuLayers: number;
}

/** 幽灵补全配置 */
export interface GhostCompletionConfig {
  /** 防抖延迟（ms），默认 400 */
  debounceDelay: number;
  /** 最小触发字符数，默认 5 */
  minTriggerLength: number;
  /** 最大生成 token 数，默认 128 */
  maxPredictTokens: number;
  /** 生成温度，默认 0.1 */
  temperature: number;
  /** 停止序列 */
  stopSequences: string[];
  /** 最大显示行数，默认 3 */
  maxDisplayLines: number;
}

/** Plugin 内部状态 */
export interface GhostState {
  /** 当前状态 */
  status: 'idle' | 'loading' | 'showing';
  /** 补全文本 */
  text: string;
  /** 补全位置（文档中的绝对位置） */
  pos: number;
  /** 用于取消当前请求的 AbortController */
  abortController: AbortController | null;
}

/** 默认幽灵补全配置 */
export const DEFAULT_GHOST_CONFIG: GhostCompletionConfig = {
  debounceDelay: 400,
  minTriggerLength: 5,
  maxPredictTokens: 128,
  temperature: 0.1,
  stopSequences: ['\n\n', '\n#', '\n---', '\n```'],
  maxDisplayLines: 3,
};

/** 默认本地 LLM 配置 */
export const DEFAULT_LOCAL_LLM_CONFIG: LocalLlmConfig = {
  enabled: false,
  modelPath: '',
  port: 8080,
  ctxSize: 2048,
  nGpuLayers: -1,
};
```

### 4.2 Sidecar 管理（`local-llm-service.ts`）

```typescript
/**
 * 本地 LLM Sidecar 服务
 *
 * 负责 llama-server 进程的完整生命周期管理和补全请求。
 * 通过 Tauri Shell 插件以 sidecar 模式启动 llama-server，
 * 通过 HTTP (localhost) 进行通信。
 */

import { Command, type Child } from '@tauri-apps/plugin-shell';

import type {
  LocalLlmConfig,
  LocalLlmStatus,
  GhostCompletionConfig,
  DEFAULT_GHOST_CONFIG,
} from '@/editor/plugins/ghost-completion/types';

// ---------------------------------------------------------------------------
// Sidecar 生命周期管理
// ---------------------------------------------------------------------------

class LocalLlmService {
  private child: Child | null = null;
  private _status: LocalLlmStatus = 'stopped';
  private statusListeners: Set<(status: LocalLlmStatus) => void> = new Set();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private config: LocalLlmConfig | null = null;

  get status(): LocalLlmStatus {
    return this._status;
  }

  /** 注册状态变化监听 */
  onStatusChange(listener: (status: LocalLlmStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: LocalLlmStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  /** 启动 llama-server sidecar */
  async start(config: LocalLlmConfig): Promise<void> {
    // 如果已有进程在运行，先停止
    if (this.child) {
      await this.stop();
    }

    this.config = config;
    this.setStatus('starting');

    try {
      const command = Command.sidecar('llama-server/llama-server', [
        '--model', config.modelPath,
        '--port', String(config.port),
        '--ctx-size', String(config.ctxSize),
        '--n-gpu-layers', String(config.nGpuLayers),
        // 仅开启补全端点，减少攻击面
        '--no-webui',
      ]);

      // 监听进程关闭事件
      command.on('close', (data) => {
        console.log(`[local-llm] llama-server 退出: code=${data.code}`);
        this.child = null;
        this.stopHealthCheck();
        if (this._status !== 'stopped') {
          this.setStatus(data.code === 0 ? 'stopped' : 'error');
        }
      });

      // 监听 stderr 输出（llama-server 的日志走 stderr）
      command.stderr.on('data', (line) => {
        console.log(`[local-llm] ${line}`);
        // llama-server 输出 "server is listening" 时标记为就绪
        if (line.includes('server is listening') || line.includes('main: server is listening')) {
          this.setStatus('running');
          this.startHealthCheck();
        }
      });

      // 启动 sidecar 进程
      this.child = await command.spawn();
    } catch (err) {
      console.error('[local-llm] 启动失败:', err);
      this.setStatus('error');
      throw err;
    }
  }

  /** 停止 llama-server sidecar */
  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (this.child) {
      try {
        await this.child.kill();
      } catch {
        // 进程可能已退出
      }
      this.child = null;
    }
    this.setStatus('stopped');
  }

  /** 重启（用于切换模型） */
  async restart(config: LocalLlmConfig): Promise<void> {
    await this.stop();
    await this.start(config);
  }

  /** 进程是否存活 */
  isRunning(): boolean {
    return this.child !== null && this._status === 'running';
  }

  // ---------------------------------------------------------------------------
  // 健康检查
  // ---------------------------------------------------------------------------

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(async () => {
      try {
        const port = this.config?.port ?? 8080;
        const resp = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!resp.ok && this._status === 'running') {
          this.setStatus('error');
        }
      } catch {
        if (this._status === 'running') {
          this.setStatus('error');
        }
      }
    }, 30_000); // 每 30 秒检查一次
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // 补全请求
  // ---------------------------------------------------------------------------

  /**
   * 发起补全请求
   *
   * @param beforeText 光标前文本
   * @param afterText 光标后文本
   * @param config 补全配置
   * @param signal AbortSignal 用于取消请求
   * @returns 补全文本，失败返回空字符串
   */
  async requestCompletion(
    beforeText: string,
    afterText: string,
    config: GhostCompletionConfig,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.isRunning()) return '';

    const port = this.config?.port ?? 8080;

    try {
      const response = await fetch(`http://localhost:${port}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: beforeText,
          n_predict: config.maxPredictTokens,
          stop: config.stopSequences,
          temperature: config.temperature,
          top_k: 40,
          top_p: 0.99,
          cache_prompt: true,
        }),
        signal,
      });

      if (!response.ok) return '';

      const data = await response.json();
      const content = (data.content ?? '').trimEnd();

      // 后处理：限制最大显示行数
      if (config.maxDisplayLines > 0) {
        const lines = content.split('\n');
        if (lines.length > config.maxDisplayLines) {
          return lines.slice(0, config.maxDisplayLines).join('\n');
        }
      }

      return content;
    } catch (err) {
      // AbortError 是正常取消，不打日志
      if (err instanceof DOMException && err.name === 'AbortError') {
        return '';
      }
      console.error('[local-llm] 补全请求失败:', err);
      return '';
    }
  }
}

export const localLlmService = new LocalLlmService();
```

### 4.3 上下文采集（`context.ts`）

```typescript
/**
 * 从 ProseMirror EditorState 提取光标前后的纯文本上下文
 */

import type { EditorState } from '@milkdown/kit/prose/state';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';

/** 上下文采集结果 */
export interface CompletionContext {
  beforeText: string;
  afterText: string;
  /** 当前节点类型名称，用于判断是否在合适的位置触发 */
  nodeType: string;
}

/** 从文档节点中提取纯文本 */
function nodeToText(node: ProseMirrorNode): string {
  let text = '';
  node.descendants((child) => {
    if (child.isText) {
      text += child.text;
    } else if (child.isBlock && text.length > 0) {
      text += '\n';
    }
    return true;
  });
  return text;
}

/**
 * 采集光标位置的前后文本上下文
 *
 * @param state 当前 EditorState
 * @param maxBefore 光标前最大字符数（默认 2000）
 * @param maxAfter 光标后最大字符数（默认 500）
 */
export function collectContext(
  state: EditorState,
  maxBefore = 2000,
  maxAfter = 500,
): CompletionContext | null {
  const { selection, doc } = state;

  // 仅在光标选区（非范围选区）时采集
  if (selection.from !== selection.to) return null;

  const pos = selection.from;
  const $pos = doc.resolve(pos);

  // 获取当前节点类型
  const parent = $pos.parent;
  const nodeType = parent.type.name;

  // 提取全文并按光标位置切割
  const fullText = nodeToText(doc);

  // 计算光标在纯文本中的偏移量
  // 简化实现：遍历文档到光标位置，累加文本长度
  let textOffset = 0;
  let found = false;

  doc.nodesBetween(0, pos, (node, nodePos) => {
    if (found) return false;
    if (node.isText) {
      const start = nodePos;
      const end = nodePos + node.nodeSize;
      if (end <= pos) {
        textOffset += node.nodeSize;
      } else {
        textOffset += pos - start;
        found = true;
      }
    } else if (node.isBlock && nodePos > 0 && nodePos < pos) {
      // 块级节点之间添加换行
      textOffset = Math.min(textOffset + 1, fullText.length);
    }
    return true;
  });

  const beforeText = fullText.slice(Math.max(0, textOffset - maxBefore), textOffset);
  const afterText = fullText.slice(textOffset, textOffset + maxAfter);

  return { beforeText, afterText, nodeType };
}

/** 判断节点类型是否适合触发补全 */
export function isTriggerableNode(nodeType: string): boolean {
  // 在以下节点类型中触发补全
  const ALLOWED_TYPES = [
    'paragraph',
    'heading',
    'list_item',
    'blockquote',
  ];
  return ALLOWED_TYPES.includes(nodeType);
}
```

### 4.4 Decoration 创建（`decoration.ts`）

```typescript
/**
 * 幽灵文本 Decoration 工具函数
 */

import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { EditorState } from '@milkdown/kit/prose/state';
import type { GhostState } from './types';

/**
 * 创建幽灵文本 Decoration
 *
 * 使用 Decoration.widget 在光标右侧渲染半透明的补全建议文本。
 */
export function createGhostDecoration(pos: number, text: string): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const span = document.createElement('span');
      span.textContent = text;
      span.className = 'lanismd-ghost-completion';
      span.setAttribute('aria-hidden', 'true');
      return span;
    },
    {
      side: 1,                    // 光标右侧
      stopEvent: () => true,      // 阻止 DOM 事件穿透
      key: 'ghost-completion',    // 高效 DOM 复用
    },
  );
}

/**
 * 根据 Plugin 状态构建 DecorationSet
 */
export function buildDecorationSet(
  state: EditorState,
  ghostState: GhostState,
): DecorationSet {
  if (ghostState.status !== 'showing' || !ghostState.text || ghostState.pos < 0) {
    return DecorationSet.empty;
  }

  // 验证位置合法性
  if (ghostState.pos > state.doc.content.size) {
    return DecorationSet.empty;
  }

  const deco = createGhostDecoration(ghostState.pos, ghostState.text);
  return DecorationSet.create(state.doc, [deco]);
}
```

### 4.5 键盘处理（`keymap.ts`）

```typescript
/**
 * 幽灵补全的键盘交互处理
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import type { PluginKey } from '@milkdown/kit/prose/state';
import type { GhostState } from './types';

/**
 * 处理 Tab 按键 — 接受补全
 *
 * @returns true 表示已处理（阻止默认行为），false 表示未处理
 */
export function handleTab(
  view: EditorView,
  pluginKey: PluginKey<GhostState>,
): boolean {
  const ghostState = pluginKey.getState(view.state);
  if (!ghostState || ghostState.status !== 'showing' || !ghostState.text) {
    return false;
  }

  // 在光标位置插入补全文本
  const { state, dispatch } = view;
  const tr = state.tr.insertText(ghostState.text, ghostState.pos);
  // 通知 Plugin 清除幽灵状态
  tr.setMeta(pluginKey, { action: 'clear' });
  dispatch(tr);
  return true;
}

/**
 * 处理 Escape 按键 — 取消补全
 *
 * @returns true 表示已处理，false 表示未处理
 */
export function handleEscape(
  view: EditorView,
  pluginKey: PluginKey<GhostState>,
): boolean {
  const ghostState = pluginKey.getState(view.state);
  if (!ghostState || ghostState.status !== 'showing') {
    return false;
  }

  // 取消正在进行的请求
  ghostState.abortController?.abort();

  // 通知 Plugin 清除状态
  const tr = view.state.tr.setMeta(pluginKey, { action: 'clear' });
  view.dispatch(tr);
  return true;
}
```

### 4.6 Plugin 主入口（`index.ts`）

```typescript
/**
 * Ghost Completion Plugin
 *
 * 本地 LLM 驱动的幽灵补全 Milkdown 插件。
 * 当用户输入文本时，在光标位置显示灰色的 AI 补全建议。
 * 按 Tab 接受，按 Esc 取消。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

import { buildDecorationSet } from './decoration';
import { handleTab, handleEscape } from './keymap';
import { collectContext, isTriggerableNode } from './context';
import { localLlmService } from '@/services/local-llm-service';
import type { GhostState } from './types';
import { DEFAULT_GHOST_CONFIG } from './types';

// ---------------------------------------------------------------------------
// Plugin Key
// ---------------------------------------------------------------------------

export const ghostCompletionPluginKey = new PluginKey<GhostState>('ghost-completion');

// ---------------------------------------------------------------------------
// 初始状态
// ---------------------------------------------------------------------------

const INITIAL_STATE: GhostState = {
  status: 'idle',
  text: '',
  pos: -1,
  abortController: null,
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const ghostCompletionPlugin = $prose(() => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 清除防抖定时器 */
  function clearDebounce(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  return new Plugin({
    key: ghostCompletionPluginKey,

    // -----------------------------------------------------------------------
    // Plugin State
    // -----------------------------------------------------------------------
    state: {
      init(): GhostState {
        return { ...INITIAL_STATE };
      },

      apply(tr, prev): GhostState {
        // 处理 meta 指令
        const meta = tr.getMeta(ghostCompletionPluginKey);
        if (meta) {
          if (meta.action === 'clear') {
            prev.abortController?.abort();
            return { ...INITIAL_STATE };
          }
          if (meta.action === 'show') {
            return {
              status: 'showing',
              text: meta.text,
              pos: meta.pos,
              abortController: null,
            };
          }
          if (meta.action === 'loading') {
            return {
              status: 'loading',
              text: '',
              pos: -1,
              abortController: meta.abortController ?? null,
            };
          }
        }

        // 文档变化或光标移动时，清除现有补全
        if (tr.docChanged || tr.selectionSet) {
          if (prev.status !== 'idle') {
            prev.abortController?.abort();
            return { ...INITIAL_STATE };
          }
        }

        return prev;
      },
    },

    // -----------------------------------------------------------------------
    // Props
    // -----------------------------------------------------------------------
    props: {
      // 渲染 Decoration
      decorations(state) {
        const ghostState = ghostCompletionPluginKey.getState(state);
        if (!ghostState) return null;
        return buildDecorationSet(state, ghostState);
      },

      // 键盘事件处理
      handleKeyDown(view, event) {
        if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
          return handleTab(view, ghostCompletionPluginKey);
        }
        if (event.key === 'Escape') {
          return handleEscape(view, ghostCompletionPluginKey);
        }
        return false;
      },
    },

    // -----------------------------------------------------------------------
    // View（管理防抖触发逻辑）
    // -----------------------------------------------------------------------
    view() {
      return {
        update(view, prevState) {
          // 仅在文档变化时触发（选区变化不触发）
          if (!view.state.doc.eq(prevState.doc)) {
            clearDebounce();

            // 取消之前的请求
            const currentState = ghostCompletionPluginKey.getState(view.state);
            currentState?.abortController?.abort();

            debounceTimer = setTimeout(async () => {
              // 再次检查 LLM 是否可用
              if (!localLlmService.isRunning()) return;

              // 采集上下文
              const context = collectContext(view.state);
              if (!context) return;

              // 检查节点类型
              if (!isTriggerableNode(context.nodeType)) return;

              // 检查最小触发长度
              const config = DEFAULT_GHOST_CONFIG;
              if (context.beforeText.trim().length < config.minTriggerLength) return;

              // 创建 AbortController
              const abortController = new AbortController();

              // 标记加载状态
              const loadingTr = view.state.tr.setMeta(ghostCompletionPluginKey, {
                action: 'loading',
                abortController,
              });
              view.dispatch(loadingTr);

              // 发起补全请求
              const completion = await localLlmService.requestCompletion(
                context.beforeText,
                context.afterText,
                config,
                abortController.signal,
              );

              // 检查结果是否有效
              if (!completion || abortController.signal.aborted) return;

              // 检查 view 是否还存在（编辑器可能已卸载）
              if (!view.dom.isConnected) return;

              // 显示补全
              const showTr = view.state.tr.setMeta(ghostCompletionPluginKey, {
                action: 'show',
                text: completion,
                pos: view.state.selection.from,
              });
              view.dispatch(showTr);
            }, DEFAULT_GHOST_CONFIG.debounceDelay);
          }
        },

        destroy() {
          clearDebounce();
          const currentState = ghostCompletionPluginKey.getState(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            undefined as any,
          );
          currentState?.abortController?.abort();
        },
      };
    },
  });
});
```

### 4.7 样式（`ghost-completion.css`）

```css
/* 幽灵补全文本样式 */
.lanismd-ghost-completion {
  color: var(--lanismd-ghost-text-color, #9ca3af);
  opacity: 0.6;
  pointer-events: none;
  font-style: italic;
  user-select: none;
  white-space: pre-wrap;
  /* 确保不影响光标定位 */
  position: relative;
  z-index: 0;
}

/* 深色主题 */
.dark .lanismd-ghost-completion {
  color: var(--lanismd-ghost-text-color-dark, #6b7280);
  opacity: 0.5;
}
```

### 4.8 CSS 变量（添加到 `variables.css`）

```css
/* ===== 幽灵补全 ===== */
--lanismd-ghost-text-color: #9ca3af;
--lanismd-ghost-text-color-dark: #6b7280;
--lanismd-ghost-text-opacity: 0.6;
--lanismd-ghost-text-font-style: italic;
```

---

## 5. Tauri 配置变更

### 5.1 `tauri.conf.json`

```jsonc
{
  "app": {
    "security": {
      // 在现有 CSP 的 default-src 中追加 localhost 访问
      "csp": "default-src 'self' ipc: http://ipc.localhost; connect-src 'self' http://localhost:8080; img-src 'self' asset: http://asset.localhost blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    // 新增 externalBin
    "externalBin": ["llama-server/llama-server"]
  }
}
```

### 5.2 `capabilities/default.json`

在 `permissions` 数组中新增：

```json
{
  "identifier": "shell:allow-spawn",
  "allow": [
    { "name": "llama-server/llama-server", "sidecar": true }
  ]
},
{
  "identifier": "shell:allow-kill",
  "allow": [
    { "name": "llama-server/llama-server", "sidecar": true }
  ]
}
```

### 5.3 Sidecar 二进制放置

开发时，在 `src-tauri/` 下创建 `llama-server/` 目录，放入对应平台的二进制：

```
src-tauri/llama-server/
├── llama-server-aarch64-apple-darwin      # macOS ARM
├── llama-server-x86_64-apple-darwin       # macOS Intel
├── llama-server-x86_64-pc-windows-msvc.exe # Windows
└── llama-server-x86_64-unknown-linux-gnu  # Linux
```

Tauri 打包时会自动根据目标三元组选择正确的二进制。

---

## 6. Store 扩展

### 6.1 `ai-store.ts` 扩展

在现有 `AiState` 接口中新增：

```typescript
/** 本地 LLM 相关状态 */
interface AiState {
  // ... 现有字段 ...

  /** 本地 LLM 运行状态 */
  localLlmStatus: LocalLlmStatus;
  /** 启动本地 LLM */
  startLocalLlm: () => Promise<void>;
  /** 停止本地 LLM */
  stopLocalLlm: () => Promise<void>;
  /** 同步本地 LLM 状态（响应设置变更） */
  syncLocalLlmState: () => Promise<void>;
}
```

实现逻辑：

```typescript
// 在 create<AiState> 内新增

localLlmStatus: 'stopped',

startLocalLlm: async () => {
  const config = useSettingsStore.getState().config.localLlm;
  if (!config?.enabled || !config.modelPath) return;

  try {
    await localLlmService.start(config);
    // 状态通过 onStatusChange 回调自动更新
  } catch (err) {
    console.error('[ai-store] startLocalLlm failed', err);
  }
},

stopLocalLlm: async () => {
  await localLlmService.stop();
},

syncLocalLlmState: async () => {
  const config = useSettingsStore.getState().config.localLlm;
  if (config?.enabled && config.modelPath) {
    if (!localLlmService.isRunning()) {
      await get().startLocalLlm();
    }
  } else {
    if (localLlmService.isRunning()) {
      await get().stopLocalLlm();
    }
  }
},
```

在 store 初始化后注册状态同步：

```typescript
// 监听 sidecar 状态变化，同步到 store
localLlmService.onStatusChange((status) => {
  useAiStore.setState({ localLlmStatus: status });
});
```

### 6.2 `types/ai.ts` 扩展

在 `AiConfig` 接口中新增：

```typescript
export interface AiConfig {
  // ... 现有字段 ...

  /** 本地 LLM 配置 */
  localLlm?: LocalLlmConfig;
  /** 幽灵补全配置 */
  ghostCompletion?: GhostCompletionConfig;
}
```

---

## 7. 编辑器注册

### 7.1 `editor-setup.ts` 修改

```typescript
// 新增导入
import { ghostCompletionPlugin } from './plugins/ghost-completion';

// 在 createEditor 函数的 .use() 链中添加（放在 focusModePlugin 之后）
.use(ghostCompletionPlugin)
```

### 7.2 条件加载（可选优化）

如果希望在本地 LLM 未启用时不加载插件，可以在 Plugin 的 view() 中做惰性检查（当前方案已在 update 钩子中检查 `localLlmService.isRunning()`，未启用时无开销）。

---

## 8. 安全模型

### 8.1 三层防护

```
┌──────────────────────────────────────────────────────┐
│ Layer 1: CSP 策略                                     │
│   connect-src: localhost:8080                         │
│   前端只能访问本地 LLM，无法向外泄露文档内容           │
├──────────────────────────────────────────────────────┤
│ Layer 2: Tauri Capability 权限系统                    │
│   shell:allow-spawn → 仅 llama-server                │
│   shell:allow-kill  → 仅 llama-server                │
│   无法执行任何其他命令                                │
├──────────────────────────────────────────────────────┤
│ Layer 3: 端口隔离                                     │
│   llama-server 仅绑定 127.0.0.1（默认行为）           │
│   外部网络无法访问本地 LLM 服务                       │
└──────────────────────────────────────────────────────┘
```

### 8.2 安全注意事项

- llama-server 默认绑定 `127.0.0.1`，不暴露到外网
- CSP `connect-src` 仅允许 `http://localhost:8080`，防止前端将文本发送到外部
- Capability 严格限定只能操作 llama-server 二进制
- 模型文件路径由用户通过文件对话框选择，不接受任意路径输入

---

## 9. 实施计划

### Phase 1: 核心功能（MVP）

| 步骤 | 任务 | 预估 |
|------|------|------|
| 1 | 创建 `ghost-completion/` 插件目录结构（5 个文件） | 2h |
| 2 | 实现 `local-llm-service.ts`（sidecar 管理 + 补全请求） | 2h |
| 3 | 配置 Tauri（externalBin / capabilities / CSP） | 0.5h |
| 4 | 注册到 `editor-setup.ts`，端到端验证基本功能 | 1h |
| 5 | 扩展 `ai-store.ts` 状态管理 | 1h |
| 6 | 样式实现（ghost-completion.css + variables.css） | 0.5h |

**Phase 1 总计：约 7h**

### Phase 2: 设置与引导 UI

| 步骤 | 任务 | 预估 |
|------|------|------|
| 7 | 设置面板：本地 LLM 开关 + 模型路径选择器 | 2h |
| 8 | 首次启用引导弹窗（推荐模型 + 下载链接） | 1.5h |
| 9 | 状态栏 LLM 状态指示器（stopped/starting/running/error） | 1h |

**Phase 2 总计：约 4.5h**

### Phase 3: 优化与增强

| 步骤 | 任务 | 预估 |
|------|------|------|
| 10 | 端口冲突检测 + 动态端口分配 | 1h |
| 11 | 补全缓存（LRU Cache + 前缀匹配） | 2h |
| 12 | 多行补全渲染优化（换行渲染） | 1h |
| 13 | 硬件检测 + 模型推荐（可用内存/GPU） | 1.5h |
| 14 | 补全配置面板（debounce / maxTokens / temperature） | 1h |

**Phase 3 总计：约 6.5h**

---

## 10. 配置项汇总

### 10.1 用户可配置项（设置面板）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `localLlm.enabled` | `false` | 是否启用本地 LLM |
| `localLlm.modelPath` | `''` | GGUF 模型文件路径 |
| `localLlm.port` | `8080` | llama-server 监听端口 |
| `localLlm.ctxSize` | `2048` | 上下文窗口大小 |
| `localLlm.nGpuLayers` | `-1` | GPU 层数（-1=全部） |
| `ghostCompletion.debounceDelay` | `400` | 防抖延迟（ms） |
| `ghostCompletion.maxPredictTokens` | `128` | 最大生成 token 数 |
| `ghostCompletion.temperature` | `0.1` | 生成温度 |
| `ghostCompletion.maxDisplayLines` | `3` | 最大显示行数 |

### 10.2 内部常量

| 常量 | 值 | 说明 |
|------|-----|------|
| `minTriggerLength` | `5` | 最小触发字符数 |
| `stopSequences` | `['\n\n', '\n#', '\n---', '\n```']` | 停止序列 |
| `healthCheckInterval` | `30000` | 健康检查间隔（ms） |
| `contextMaxBefore` | `2000` | 光标前最大上下文字符数 |
| `contextMaxAfter` | `500` | 光标后最大上下文字符数 |

---

## 11. 推荐模型

| 模型 | 大小 | 最低内存 | 适用场景 |
|------|------|---------|---------|
| Qwen2.5-Coder 0.5B Q4_K_M | ~400MB | 8GB | 轻量体验，低端设备 |
| Qwen2.5-Coder 1.5B Q4_K_M | ~1GB | 12GB | **推荐**，性价比最优 |
| Qwen2.5-Coder 3B Q4_K_M | ~2GB | 16GB | 质量较好 |
| Qwen2.5-Coder 7B Q4_K_M | ~4GB | 16GB+ | 高质量，需要充足内存 |

---

## 12. 已知限制与后续方向

### 12.1 当前方案的限制

- **补全质量**受限于本地小模型能力，中文续写可能偶有不通顺
- **首次启动慢**：llama-server 加载模型需要 2-10 秒（取决于模型大小和硬件）
- **内存占用**：运行时内存 = 模型大小 + ~500MB 开销
- **单端口**：默认 8080 可能与其他本地服务冲突

### 12.2 后续可扩展方向

- **双模式切换**：云端 AI 补全 + 本地 LLM 补全，用户可在设置中切换
- **FIM 格式支持**：根据模型类型自动选择 FIM token 格式
- **流式渲染**：将同步请求改为流式，逐字渲染幽灵文本（提升感知速度）
- **补全缓存**：LRU 缓存 + 前缀增量匹配，减少重复请求
- **Ollama 支持**：兼容 Ollama API（`/api/generate`），免去用户手动管理 llama-server
