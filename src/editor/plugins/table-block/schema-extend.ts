/**
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                                  |
 * | v1.1.0 | 表格节点增加独立滚动容器并补齐 DOM 解析规则    | REQ: 表格列宽与表头排版优化 TECH: 内容驱动列宽方案 §2 |
 * /@changelog
 *
 * @author hhhuilli
 *
 * Table Schema Extend Plugin
 *
 * 扩展 Milkdown GFM 表格 schema：
 * 1. 允许表格只有 header 行（content 从 table_row+ 改为 table_row*）
 * 2. 为表格节点输出独立的外层容器，由容器承担横向滚动
 *
 * Markdown 的解析与序列化由 remark runner 独立完成，不经过这里的
 * toDOM / parseDOM，因此改动不会影响 .md 文件的往返结果。
 */

import { tableSchema } from '@milkdown/kit/preset/gfm';

/** 表格滚动容器类名，需与 styles/editor/table.css 保持一致 */
export const TABLE_WRAP_CLASS = 'lanismd-table-wrap';

/**
 * 扩展的表格 schema
 *
 * table 保持原生表格语义（不使用 display: block），外层仅作为滚动容器，
 * 这样 prosemirror-tables 的列宽拖拽与 colgroup 仍然作用于真实的 table 元素。
 */
export const extendedTableSchema = tableSchema.extendSchema((prev) => {
  return (ctx) => {
    const baseSchema = prev(ctx);
    // 保留裸 table 规则，兼容从外部粘贴、不带容器的 HTML 表格
    const baseParseDOM = baseSchema.parseDOM ?? [{ tag: 'table' }];
    return {
      ...baseSchema,
      // table_row+ 表示至少一行数据行
      // table_row* 表示零行或多行数据行（允许只有 header 行）
      content: 'table_header_row table_row*',
      toDOM: () => ['div', { class: TABLE_WRAP_CLASS }, ['table', 0]],
      parseDOM: [
        ...baseParseDOM,
        // 自身渲染出的容器在重解析时直接取内部 table 作为内容来源
        { tag: `div.${TABLE_WRAP_CLASS}`, contentElement: 'table' },
      ],
    };
  };
});
