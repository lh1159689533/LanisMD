/**
 * 任务列表输入规则插件
 *
 * @changelog
 * | 版本   | 变更说明                                             | 关联                                    |
 * | v1.0.0 | 初始实现：普通段落输入 [] / [x] 一步生成任务列表     | REQ: 任务列表输入规则 TECH: InputRule   |
 * /@changelog
 *
 * @author hhhuilli
 *
 * 为什么替换 GFM 预设自带的 wrapInTaskListInputRule：
 * - 官方 handler 逐级向上寻找 list_item 祖先，找不到就返回 null，因此必须先输入 "- "
 *   生成列表，再输入 "[x] " 才能把列表项变成任务项。
 * - 官方正则 /^\[(?<checked>\s|x)\]\s$/ 不认方括号内为空的 []，也不认大写 [X]。
 * 本规则同时覆盖两种场景：
 * - 普通段落：把段落包进 bullet_list > list_item(checked)，一步生成任务列表。
 * - 列表项内：沿用官方行为，只给该 list_item 写入 checked 属性。
 *
 * 注意：Milkdown 的 customInputRules 在 handleTextInput 时把待输入字符拼到 textBefore
 * 上做匹配，末尾空格此时尚未写入文档；handler 收到的是输入前的 state，start/end 覆盖
 * 的只是 "[x]" 部分，规则命中后该空格也不会被插入。
 */

import type { NodeType, ResolvedPos } from '@milkdown/kit/prose/model';
import type { EditorState, Transaction } from '@milkdown/kit/prose/state';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { findWrapping } from '@milkdown/kit/prose/transform';
import { $inputRule } from '@milkdown/kit/utils';

/** 段落开头的任务标记加触发空格：[]、[ ]、[x]、[X] 均可 */
const TASK_MARKER_REGEX = /^\[([\sxX]?)\]\s$/;

/** 查找光标所在的最近 list_item 祖先深度，不存在时返回 null */
function findListItemDepth($pos: ResolvedPos, listItemType?: NodeType): number | null {
  if (!listItemType) return null;
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type === listItemType) return depth;
  }
  return null;
}

/**
 * 列表项内场景：删除标记文本，把该列表项标记为任务项。
 * 已是任务项时不重复处理，与官方规则保持一致。
 */
function markListItemAsTask(
  state: EditorState,
  $start: ResolvedPos,
  itemDepth: number,
  start: number,
  end: number,
  checked: boolean,
): Transaction | null {
  const item = $start.node(itemDepth);
  if (item.attrs.checked != null) return null;
  const tr = state.tr.delete(start, end);
  const itemPos = tr.mapping.map($start.before(itemDepth));
  return tr.setNodeMarkup(itemPos, undefined, { ...item.attrs, checked });
}

/**
 * 普通段落场景：先删除标记文本，再用 findWrapping 求出合法的包装链，
 * 把 checked 写入最内层 list_item 后包装整个段落。
 * 用 findWrapping 而非硬编码两层节点，是为了在 blockquote 等容器内也能得到合法结构，
 * 并在不允许列表的容器中安全放弃转换。
 */
function wrapParagraphInTaskList(
  state: EditorState,
  $start: ResolvedPos,
  start: number,
  end: number,
  checked: boolean,
): Transaction | null {
  const {
    bullet_list: bulletListType,
    list_item: listItemType,
    paragraph: paragraphType,
  } = state.schema.nodes;
  if (!bulletListType || !listItemType || !paragraphType) return null;
  if ($start.parent.type !== paragraphType) return null;

  const tr = state.tr.delete(start, end);
  const range = tr.doc.resolve(start).blockRange();
  if (!range) return null;

  const wrapping = findWrapping(range, bulletListType);
  if (!wrapping || wrapping.length === 0) return null;

  const innermost = wrapping[wrapping.length - 1];
  if (innermost.type !== listItemType) return null;
  const nextWrapping = [
    ...wrapping.slice(0, -1),
    {
      ...innermost,
      // 其余属性交由 type.create 填默认值，只需显式写入 checked
      attrs: { ...(innermost.attrs ?? {}), checked },
    },
  ];

  tr.wrap(range, nextWrapping);
  return tr;
}

/**
 * 应用任务列表转换：依据光标所在位置决定是新建任务列表，还是把已有列表项转为任务项。
 * 与 Milkdown 插件层解耦，便于在不启动编辑器的情况下校验 ProseMirror 变换结果。
 */
export function applyTaskListRule(
  state: EditorState,
  match: string[],
  start: number,
  end: number,
): Transaction | null {
  const checked = match[1]?.toLowerCase() === 'x';
  const $start = state.doc.resolve(start);
  const itemDepth = findListItemDepth($start, state.schema.nodes.list_item);
  return itemDepth != null
    ? markListItemAsTask(state, $start, itemDepth, start, end, checked)
    : wrapParagraphInTaskList(state, $start, start, end, checked);
}

/**
 * 任务列表输入规则：在段落开头输入 "[] " / "[ ] " / "[x] " / "[X] " 后直接生成任务列表；
 * 在已有列表项内输入时则把该项转换为任务项。
 */
export const taskListInputRule = $inputRule(() => {
  return new InputRule(TASK_MARKER_REGEX, applyTaskListRule);
});
