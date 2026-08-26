/**
 * Board Block - Node Schema 与 Markdown 序列化
 *
 * 定义 board_block 的 ProseMirror 节点（块级 atom）及其 Markdown 双向序列化：
 * - 存储形态：` ```plait ` 代码围栏，正文为 base64(JSON) 串。
 * - 解析方向：借助 remark 树转换，将 `code(lang=plait)` mdast 节点改写为
 *   `board_block` 节点，规避 commonmark 的 code_block 抢先匹配所有 code 节点。
 * - 序列化方向：schema.toMarkdown 直接产出标准 `code` mdast 节点（lang=plait），
 *   由 mdast 默认序列化为围栏，无需自定义 toMarkdown handler。
 *
 * @changelog
 * | 版本   | 变更说明                                      | 关联                                                 |
 * | v1.0.0 | 初始实现：board_block schema + remark 双向序列化 | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { $nodeSchema, $remark } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { DEFAULT_HEIGHT, MAX_HEIGHT, MIN_HEIGHT, SCHEMA_VERSION } from './constants';

// ---------------------------------------------------------------------------
// Remark 插件：将 code(lang=plait) 转换为 board_block mdast 节点
// ---------------------------------------------------------------------------

/**
 * Remark 插件：树转换。
 *
 * commonmark 的 code_block 会匹配所有 `code` 类型的 mdast 节点（parser 按注册顺序
 * 取第一个匹配），board_block 永远轮不到。因此在解析进入 ProseMirror 之前，
 * 先把带 `lang: 'plait'` 的 code 节点重写为自定义的 `board_block` 节点，
 * 使 schema.parseMarkdown 能够匹配到。
 *
 * 序列化方向不在此处处理（由 schema.toMarkdown 直接产出 code 节点）。
 */
export const remarkBoardPlugin = $remark('remarkBoard', () => {
  return () => {
    return (tree: Root) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = (tree as any).children;
      if (!children || !Array.isArray(children)) return;

      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.type === 'code' && node.lang === 'plait') {
          children[i] = {
            type: 'board_block',
            value: node.value ?? '',
          };
        }
      }
    };
  };
});

// ---------------------------------------------------------------------------
// 高度归一化
// ---------------------------------------------------------------------------

/** 将任意输入的高度值收敛到合法区间，非法时回落默认高度 */
function normalizeHeight(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * board_block 节点 Schema。
 *
 * - 块级 atom 节点：内部为独立 Plait/React 子树，对 ProseMirror 是黑盒。
 * - isolating + selectable：selection 不进入内部，可整体选中。
 * - draggable: false：禁用 PM 给 DOM 设置的原生 HTML5 draggable 属性，
 *   否则在画板内部按下拖动会触发浏览器原生 drag（拖影 + 拖走整块），
 *   且 stopEvent 无法拦截原生 dragstart。整块拖动排序由 block-handle 抓手负责。
 * - attrs.data：base64(JSON) 编码的画板数据（不透明字符串，由 codec 边界处理）。
 */
export const boardBlockSchema = $nodeSchema('board_block', () => ({
  group: 'block',
  atom: true,
  marks: '',
  isolating: true,
  selectable: true,
  draggable: false,
  attrs: {
    /** base64(JSON) 编码的画板数据串 */
    data: { default: '' },
    /** Schema 版本号，供未来数据迁移 */
    version: { default: SCHEMA_VERSION },
    /** 视口高度（px） */
    height: { default: DEFAULT_HEIGHT },
    /** 是否在挂载时自动进入编辑态（仅新插入时为 true，不持久化） */
    autoEdit: { default: false },
  },
  parseDOM: [
    {
      tag: 'div[data-type="board-block"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          data: el.getAttribute('data-board') || '',
          version: Number(el.getAttribute('data-version')) || SCHEMA_VERSION,
          height: normalizeHeight(el.getAttribute('data-height')),
        };
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'board-block',
      'data-board': node.attrs.data,
      'data-version': String(node.attrs.version),
      'data-height': String(node.attrs.height),
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'board_block',
    runner: (state, node, nodeType) => {
      state.addNode(nodeType, {
        data: (node.value as string) || '',
        version: SCHEMA_VERSION,
        height: DEFAULT_HEIGHT,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'board_block',
    runner: (state, node) => {
      // 直接产出标准 code mdast 节点（lang=plait），由 mdast 默认序列化为围栏
      state.addNode('code', undefined, undefined, {
        lang: 'plait',
        value: node.attrs.data || '',
      });
    },
  },
}));
