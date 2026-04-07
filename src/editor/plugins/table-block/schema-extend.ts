/**
 * Table Schema Extend Plugin
 *
 * 扩展 Milkdown GFM 表格 schema，允许表格只有 header 行：
 * - 原 schema：content: "table_header_row table_row+"（至少一个数据行）
 * - 扩展后：content: "table_header_row table_row*"（零个或多个数据行）
 *
 * 这使得用户删除所有数据行后，只剩 header 行仍是合法状态。
 */

import { tableSchema } from '@milkdown/kit/preset/gfm';

/**
 * 扩展的表格 schema
 * 将 content 从 "table_header_row table_row+" 改为 "table_header_row table_row*"
 */
export const extendedTableSchema = tableSchema.extendSchema((prev) => {
  return (ctx) => {
    const baseSchema = prev(ctx);
    return {
      ...baseSchema,
      // table_row+ 表示至少一行数据行
      // table_row* 表示零行或多行数据行（允许只有 header 行）
      content: 'table_header_row table_row*',
    };
  };
});
