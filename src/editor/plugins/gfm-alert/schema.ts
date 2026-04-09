/**
 * GFM Alert Schema Extension
 *
 * 扩展 blockquote schema，添加 alertType 属性支持。
 */

import { blockquoteSchema } from '@milkdown/kit/preset/commonmark';
import { ALERT_TYPES, type GfmAlertType } from './types';

/**
 * 扩展 blockquote schema 以支持 GFM Alert
 *
 * 添加：
 * - alertType 属性
 * - parseMarkdown 支持从 remark 插件读取 alertType
 * - toMarkdown 支持序列化为 [!TYPE] 语法
 * - parseDOM 支持从 data-alert-type 属性读取
 * - toDOM 支持输出 data-alert-type 属性
 */
export const gfmAlertSchema = blockquoteSchema.extendSchema((prev) => {
  return (ctx) => {
    const baseSchema = prev(ctx);
    return {
      ...baseSchema,
      attrs: {
        ...baseSchema.attrs,
        alertType: {
          default: null,
        },
      },
      // 扩展 parseDOM 以读取 data-alert-type
      parseDOM: [
        {
          tag: 'blockquote[data-alert-type]',
          getAttrs: (dom: HTMLElement) => ({
            alertType: dom.getAttribute('data-alert-type') || null,
          }),
        },
        // 保留原有的解析规则
        ...(baseSchema.parseDOM || [{ tag: 'blockquote' }]),
      ],
      // 扩展 toDOM 以输出 data-alert-type
      toDOM: (node) => {
        const attrs: Record<string, string> = {};
        if (node.attrs.alertType) {
          attrs['data-alert-type'] = node.attrs.alertType;
        }
        return ['blockquote', attrs, 0];
      },
      // 扩展 parseMarkdown 以读取 alertType
      parseMarkdown: {
        match: ({ type }) => type === 'blockquote',
        runner: (state, node, type) => {
          // 从节点 data 中读取 alertType
          const data = (node.data || {}) as Record<string, unknown>;
          const alertType = (data.alertType as GfmAlertType) || null;

          state.openNode(type, { alertType });
          state.next(node.children);
          state.closeNode();
        },
      },
      // 扩展 toMarkdown 以输出 [!TYPE] 语法
      toMarkdown: {
        match: (node) => node.type.name === 'blockquote',
        runner: (state, node) => {
          const alertType = node.attrs.alertType as GfmAlertType | null;

          state.openNode('blockquote');

          if (alertType && ALERT_TYPES[alertType]) {
            const config = ALERT_TYPES[alertType];
            // 在内容前添加 [!TYPE] 标记
            // 创建一个包含 alert 语法的段落
            state.openNode('paragraph');
            state.addNode('text', undefined, `[!${config.syntax}]`);
            state.closeNode();
          }

          // 处理 blockquote 的子节点
          state.next(node.content);
          state.closeNode();
        },
      },
    };
  };
});
