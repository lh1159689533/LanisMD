/**
 * List Item Block Plugin（轻量版）
 *
 * @changelog
 * | 版本   | 变更说明                                             | 关联                                    |
 * | v1.0.0 | 初始实现：用原生 DOM 替换 Milkdown Vue 版列表项 NodeView | REQ: 大文件打开性能优化                |
 * | v1.1.0 | 补齐有序列表项标记同步，修复输入 "1. " 渲染成无序圆点   | REQ: 有序列表输入规则 TECH: appendTransaction |
 * /@changelog
 *
 * @author hhhuilli
 *
 * 为什么不用 @milkdown/kit/component/list-item-block 自带的 NodeView：
 * - 官方实现为每个列表项 createApp() 挂载一个独立的 Vue 应用，并对图标做 DOMPurify.sanitize，
 *   含数百个列表项的大文档切换时，仅这一项就要 400ms+ 的同步主线程耗时。
 * - 这里保持与官方完全一致的 DOM 结构和 class（样式 list.css、块手柄等均依赖它），
 *   但改为原生 DOM 一次性构建，图标 HTML 按字符串缓存只清洗一次。
 *
 * 为什么还要注册 orderedListLabelSyncPlugin：
 * - 本 NodeView 根据 list_item 的 listType/label 属性渲染编号，这些属性由 commonmark 的
 *   syncListOrderPlugin 在 appendTransaction 中维护。
 * - 该插件会跳过 !tr.isGeneric 的事务，而 Milkdown 的 customInputRules 会给每次输入规则
 *   触发的事务附加 meta；prosemirror-state 中 isGeneric 只要存在任意 meta 即为 false。
 * - 于是输入 "1. " 生成 ordered_list 后，列表项属性仍停在默认的 bullet/•，被渲染成无序圆点，
 *   直到用户再输入一个普通字符才被纠正。此处以互补插件补齐这一漏网场景。
 *
 * DOM 结构：
 *   div.milkdown-list-item-block
 *     li.list-item
 *       div.label-wrapper[contenteditable=false]
 *         span.milkdown-icon.label.{bullet|ordered|checked|unchecked}
 *       div.children
 *         div.content-dom[data-content-dom]   <- contentDOM
 */

import DOMPurify from 'dompurify';
import type { Node } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';
import { listItemSchema, orderedListSchema } from '@milkdown/kit/preset/commonmark';
import { listItemBlockConfig } from '@milkdown/kit/component/list-item-block';
import { $prose, $view } from '@milkdown/kit/utils';

/** 图标 HTML 清洗结果缓存：图标种类极少，避免每个列表项重复调用 DOMPurify */
const sanitizedIconCache = new Map<string, string>();

function sanitizeIcon(icon: string): string {
  let cached = sanitizedIconCache.get(icon);
  if (cached === undefined) {
    cached = DOMPurify.sanitize(icon.trim());
    sanitizedIconCache.set(icon, cached);
  }
  return cached;
}

/** 与官方组件保持一致的 label class 计算 */
function getLabelClass(listType: string, checked: boolean | null): string {
  if (checked == null) return listType === 'bullet' ? 'bullet' : 'ordered';
  return checked ? 'checked' : 'unchecked';
}

const listItemBlockView = $view(listItemSchema.node, (ctx): NodeViewConstructor => {
  return (initialNode, view, getPos) => {
    const config = ctx.get(listItemBlockConfig.key);

    const dom = document.createElement('div');
    dom.className = 'milkdown-list-item-block';

    const li = document.createElement('li');
    li.className = 'list-item';

    const labelWrapper = document.createElement('div');
    labelWrapper.className = 'label-wrapper';
    labelWrapper.contentEditable = 'false';

    const icon = document.createElement('span');
    labelWrapper.appendChild(icon);

    const children = document.createElement('div');
    children.className = 'children';

    const contentDOM = document.createElement('div');
    contentDOM.setAttribute('data-content-dom', 'true');
    contentDOM.classList.add('content-dom');

    children.appendChild(contentDOM);
    li.appendChild(labelWrapper);
    li.appendChild(children);
    dom.appendChild(li);

    let node = initialNode;
    // 记录上次渲染的图标 HTML，避免重复写 innerHTML
    let renderedIcon: string | null = null;

    /** 根据节点属性刷新 label（图标 + class） */
    const render = (target: Node) => {
      const { label, listType, checked } = target.attrs;
      const readonly = !view.editable;
      const html = config.renderLabel({ label, listType, checked, readonly });
      icon.className = [
        'milkdown-icon',
        'label',
        readonly ? 'readonly' : '',
        getLabelClass(listType, checked),
      ]
        .filter(Boolean)
        .join(' ');
      if (html !== renderedIcon) {
        icon.innerHTML = html ? sanitizeIcon(html) : '';
        renderedIcon = html;
      }
    };

    // 点击任务列表复选框：切换 checked 属性（与官方 onPointerdown 行为一致）
    const onPointerDown = (e: PointerEvent) => {
      if (node.attrs.checked == null) return;
      e.stopPropagation();
      e.preventDefault();
      if (!view.editable) return;
      const pos = getPos();
      if (pos == null) return;
      if (!view.hasFocus()) view.focus();
      view.dispatch(view.state.tr.setNodeAttribute(pos, 'checked', !node.attrs.checked));
    };
    labelWrapper.addEventListener('pointerdown', onPointerDown);

    render(initialNode);

    return {
      dom,
      contentDOM,
      update: (updatedNode) => {
        if (updatedNode.type !== initialNode.type) return false;
        if (updatedNode.sameMarkup(node) && updatedNode.content.eq(node.content)) return true;
        node = updatedNode;
        render(updatedNode);
        return true;
      },
      ignoreMutation: (mutation) => {
        if ((mutation.type as unknown) === 'selection') return false;
        if (contentDOM === mutation.target && mutation.type === 'attributes') return true;
        if (contentDOM.contains(mutation.target)) return false;
        return true;
      },
      selectNode: () => {
        dom.classList.add('selected');
        li.classList.add('ProseMirror-selectednode');
      },
      deselectNode: () => {
        dom.classList.remove('selected');
        li.classList.remove('ProseMirror-selectednode');
      },
      destroy: () => {
        labelWrapper.removeEventListener('pointerdown', onPointerDown);
      },
    };
  };
});

/**
 * 补齐输入规则事务中遗漏的有序列表项标记同步。
 *
 * 与官方 syncListOrderPlugin 互补而非替代：官方插件在普通事务中完成同步后，
 * 本插件检测到属性已一致便返回 null，不会产生第二次 dispatch。
 * 仅当事务带 meta（输入规则）导致官方插件跳过时，才补写 listType 与 label。
 */
const orderedListLabelSyncPlugin = $prose((ctx) => {
  const listItemType = listItemSchema.type(ctx);
  const orderedListType = orderedListSchema.type(ctx);

  return new Plugin({
    key: new PluginKey('LANISMD_ORDERED_LIST_LABEL_SYNC'),
    appendTransaction: (transactions, _oldState, newState) => {
      // 自身追加的事务不再处理，避免 appendTransaction 循环。
      if (transactions.some((tr) => tr.getMeta('addToHistory') === false)) {
        return null;
      }
      // 官方插件只处理 isGeneric 事务，普通输入由它同步；这里仅补它跳过的
      // 带 meta 事务（输入规则、粘贴、输入法结束等），避免大文档重复全量遍历。
      if (!transactions.some((tr) => tr.docChanged && !tr.isGeneric)) {
        return null;
      }

      let tr = newState.tr;
      let changed = false;

      newState.doc.descendants((node, pos, parent, index) => {
        if (node.type !== listItemType || parent?.type !== orderedListType) {
          return true;
        }

        // 与官方算法一致：序号 = 列表项在父节点中的索引 + ordered_list 的起始序号
        const label = `${index + (parent.attrs.order ?? 1)}.`;
        if (node.attrs.listType === 'ordered' && node.attrs.label === label) {
          return true;
        }

        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          listType: 'ordered',
          label,
        });
        changed = true;
        // 返回 true 继续下钻，保证嵌套有序列表同样被修正
        return true;
      });

      // 属性修正不属于用户编辑，不进入撤销栈
      return changed ? tr.setMeta('addToHistory', false) : null;
    },
  });
});

/**
 * 替代官方 listItemBlockComponent：复用配置 slice，替换 NodeView 实现，
 * 并补齐输入规则场景下有序列表项标记的同步。
 */
export const listItemBlockComponent = [
  listItemBlockConfig,
  listItemBlockView,
  orderedListLabelSyncPlugin,
].flat();
