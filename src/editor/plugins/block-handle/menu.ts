/**
 * 块手柄操作菜单
 *
 * 点击六点手柄后弹出，复用统一右键菜单渲染器。菜单只保留「在下方插入」
 * 「转为」「删除」三类操作；「转为」子菜单使用与斜杠命令一致的样式。
 *
 * @changelog
 * | 版本   | 变更说明                                             | 关联                                               |
 * | v1.0.0 | 初始实现：块级操作菜单                               | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.1.0 | 移除复制/剪切/副本；转为改斜杠样式并扩充列表与链接   | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ActiveNode } from '@milkdown/kit/plugin/block';
import type { EditorView } from '@milkdown/kit/prose/view';

import { showContextMenu, type ContextMenuItem } from '../context-menu/renderer';
import { getBasicSlashCommands } from '../slash-menu/commands-basic';
import { getIcon } from '../slash-menu/icons';

import {
  canConvertBlock,
  convertActiveBlock,
  convertActiveBlockToLink,
  deleteActiveBlock,
  type ConvertTarget,
} from './block-actions';
import { CONVERT_ICON, DELETE_ICON, INSERT_BELOW_ICON } from './icons';

interface OpenBlockMenuOptions {
  view: EditorView;
  /** 打开菜单瞬间捕获的块，避免鼠标移开后 BlockProvider 清空 active */
  active: ActiveNode;
  /** 手柄按钮的视口矩形，菜单在其下方展开 */
  anchor: DOMRect;
  /** 在下方插入：打开与斜杠命令相同的菜单 */
  onInsertBelow: (active: ActiveNode, anchor: DOMRect) => void;
}

/** 「转为」候选项：斜杠命令 id 与对应的转换目标 */
const CONVERT_OPTIONS: Array<{ slashId: string; target: ConvertTarget }> = [
  { slashId: 'heading1', target: { kind: 'heading', level: 1 } },
  { slashId: 'heading2', target: { kind: 'heading', level: 2 } },
  { slashId: 'heading3', target: { kind: 'heading', level: 3 } },
  { slashId: 'heading4', target: { kind: 'heading', level: 4 } },
  { slashId: 'heading5', target: { kind: 'heading', level: 5 } },
  { slashId: 'heading6', target: { kind: 'heading', level: 6 } },
  { slashId: 'bullet-list', target: { kind: 'bullet' } },
  { slashId: 'ordered-list', target: { kind: 'ordered' } },
  { slashId: 'task-list', target: { kind: 'task' } },
  { slashId: 'code-block', target: { kind: 'code' } },
];

/**
 * 渲染「转为」子菜单。
 *
 * 名称、图标、Markdown 语法提示直接取自斜杠命令定义，两处菜单始终一致；
 * 执行逻辑则换成作用于整块的转换，而非斜杠命令的「在光标处插入」。
 */
function createConvertItems(view: EditorView, active: ActiveNode): ContextMenuItem[] {
  const slashById = new Map(getBasicSlashCommands().map((cmd) => [cmd.id, cmd]));

  const items: ContextMenuItem[] = [
    {
      label: '正文',
      icon: getIcon('text'),
      action: () => convertActiveBlock(view, active, { kind: 'paragraph' }),
    },
  ];

  CONVERT_OPTIONS.forEach(({ slashId, target }) => {
    const cmd = slashById.get(slashId);
    if (!cmd) return;
    items.push({
      label: cmd.label,
      icon: cmd.icon,
      markdown: cmd.markdown,
      action: () => convertActiveBlock(view, active, target),
    });
  });

  const link = slashById.get('link');
  if (link) {
    items.push({
      label: link.label,
      icon: link.icon,
      action: () => convertActiveBlockToLink(view, active),
    });
  }

  return items;
}

/** 在手柄下方弹出块操作菜单 */
export function openBlockMenu({ view, active, anchor, onInsertBelow }: OpenBlockMenuOptions): void {
  const items: ContextMenuItem[] = [
    {
      label: '在下方插入',
      icon: INSERT_BELOW_ICON,
      action: () => onInsertBelow(active, anchor),
    },
  ];

  if (canConvertBlock(view, active)) {
    items.push(
      { label: '', separator: true },
      {
        label: '转为',
        icon: CONVERT_ICON,
        submenuVariant: 'slash',
        children: createConvertItems(view, active),
      },
    );
  }

  items.push(
    { label: '', separator: true },
    {
      label: '删除',
      icon: DELETE_ICON,
      danger: true,
      action: () => deleteActiveBlock(view, active),
    },
  );

  showContextMenu(items, anchor.left, anchor.bottom + 6);
}
