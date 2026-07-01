/**
 * file_block NodeView 实现
 *
 * 以卡片形式渲染文件附件，包含图标、文件名、大小和操作按钮。
 */

import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { Node } from '@milkdown/kit/prose/model';
import {
  getFileSize,
  deleteFilePermanent,
  openFileWithSystem,
  checkFileExists,
} from '@/services/file-block-service';
import { fileService } from '@/services/tauri';
import { useSettingsStore } from '@/stores';
import { useUIStore } from '@/stores/ui-store';
import { getFileIcon } from './file-icons';
import { Event as TauriEvent } from '@tauri-apps/api/event';

export class FileBlockNodeView implements NodeView {
  dom: HTMLElement;
  private nameEl: HTMLElement;
  private sizeEl: HTMLElement;
  private iconEl: HTMLElement;
  private statusEl: HTMLElement | null = null;
  private view: EditorView;
  private getPos: () => number | undefined;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.view = view;
    this.getPos = getPos;
    this.dom = this.buildDOM(node);
    this.nameEl = this.dom.querySelector('.lanismd-file-block__name')!;
    this.sizeEl = this.dom.querySelector('.lanismd-file-block__size')!;
    this.iconEl = this.dom.querySelector('.lanismd-file-block__icon')!;
    this.bindEvents(node);
    this.loadAsyncData(node);
  }

  /**
   * 构建卡片 DOM 结构
   */
  private buildDOM(node: Node): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'lanismd-file-block';
    wrapper.setAttribute('data-type', 'file-block');
    wrapper.setAttribute('data-src', node.attrs.src);
    wrapper.setAttribute('data-name', node.attrs.name);

    // 图标区域
    const iconDiv = document.createElement('div');
    iconDiv.className = 'lanismd-file-block__icon';
    iconDiv.innerHTML = getFileIcon(node.attrs.name);

    // 信息区域
    const infoDiv = document.createElement('div');
    infoDiv.className = 'lanismd-file-block__info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'lanismd-file-block__name';
    nameSpan.textContent = node.attrs.name || '未知文件';

    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'lanismd-file-block__size';
    sizeSpan.textContent = node.attrs.size || '...';

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(sizeSpan);

    // 操作按钮区域
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'lanismd-file-block__actions';

    const previewBtn = this.createButton(
      '预览',
      'preview',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    );

    const revealBtn = this.createButton(
      '在 Finder 中显示',
      'reveal',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    );

    const deleteBtn = this.createButton(
      '删除',
      'delete',
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    );

    actionsDiv.appendChild(previewBtn);
    actionsDiv.appendChild(revealBtn);
    actionsDiv.appendChild(deleteBtn);

    wrapper.appendChild(iconDiv);
    wrapper.appendChild(infoDiv);
    wrapper.appendChild(actionsDiv);

    return wrapper;
  }

  /**
   * 创建操作按钮
   */
  private createButton(title: string, action: string, iconSvg: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'lanismd-file-block__btn';
    btn.setAttribute('data-action', action);
    btn.title = title;
    btn.innerHTML = iconSvg;
    return btn;
  }

  /**
   * 绑定按钮事件
   */
  private bindEvents(node: Node) {
    const actionsDiv = this.dom.querySelector('.lanismd-file-block__actions');
    if (!actionsDiv) return;

    actionsDiv.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const action = target.getAttribute('data-action');
      const src = this.dom.getAttribute('data-src') || node.attrs.src;

      switch (action) {
        case 'preview':
          this.handlePreview(src, node.attrs.name);
          break;
        case 'reveal':
          this.handleReveal(src);
          break;
        case 'delete':
          this.handleDelete(src);
          break;
      }
    });
  }

  /**
   * 异步加载数据（文件大小 + 文件存在性检测）
   */
  private async loadAsyncData(node: Node) {
    const src = node.attrs.src;
    if (!src) return;

    // 检查文件是否存在
    try {
      const exists = await checkFileExists(src);
      if (!exists) {
        this.showMissingStatus();
        return;
      }
    } catch {
      // 无法检查时忽略
    }

    // 如果 size 为空，异步获取文件大小
    if (!node.attrs.size) {
      try {
        const size = await getFileSize(src);
        const pos = this.getPos();
        if (pos !== undefined) {
          const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            size,
          });
          this.view.dispatch(tr);
        }
      } catch {
        this.sizeEl.textContent = '未知大小';
      }
    }
  }

  /**
   * 显示文件缺失状态
   */
  private showMissingStatus() {
    this.dom.classList.add('lanismd-file-block--missing');
    if (!this.statusEl) {
      this.statusEl = document.createElement('span');
      this.statusEl.className = 'lanismd-file-block__status';
      this.statusEl.textContent = '文件不存在';
      const infoDiv = this.dom.querySelector('.lanismd-file-block__info');
      infoDiv?.appendChild(this.statusEl);
    }
  }

  /**
   * 根据文件路径生成唯一的预览窗口 label
   * 使用简单的字符串哈希，确保 label 符合 Tauri 的命名规范（字母数字和连字符）
   */
  private static generatePreviewLabel(src: string): string {
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      const char = src.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    // 转为正整数的十六进制字符串
    const hexHash = (hash >>> 0).toString(16);
    return `file-preview-${hexHash}`;
  }

  /**
   * 预览文件
   */
  private async handlePreview(src: string, name: string) {
    const config = useSettingsStore.getState().config;
    const previewMode = config.attachment?.previewMode || 'builtin';

    // 先检查文件是否存在
    try {
      const exists = await checkFileExists(src);
      if (!exists) {
        this.showMissingStatus();
        return;
      }
    } catch {
      // 忽略
    }

    if (previewMode === 'builtin') {
      const onError = (e: unknown) => {
        console.error('预览窗口创建失败:', e);
        const errorMsg = (e as TauriEvent<string>)?.payload ?? String(e);
        useUIStore.getState().addToast({
          type: 'error',
          message: `预览失败: ${errorMsg}`,
          actions: [
            { label: '用系统软件打开', onClick: () => openFileWithSystem(src), primary: true },
          ],
        });
      };
      // 内置预览：创建新 Tauri 窗口，基于文件路径生成唯一 label
      try {
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const label = FileBlockNodeView.generatePreviewLabel(src);

        // 尝试获取已有的同文件预览窗口，存在则聚焦
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
          await existing.setFocus();
          return;
        }

        const currentTheme = config.theme || 'system';
        const previewWindow = new WebviewWindow(label, {
          url: `/preview?file=${encodeURIComponent(src)}&theme=${encodeURIComponent(currentTheme)}`,
          title: name,
          width: 900,
          height: 700,
          center: true,
          resizable: true,
        });
        // 监听创建错误
        previewWindow.once('tauri://error', onError);
      } catch (err) {
        onError(err);
      }
    } else {
      // 系统默认软件打开
      await openFileWithSystem(src);
    }
  }

  /**
   * 在文件管理器中显示
   */
  private async handleReveal(src: string) {
    try {
      const exists = await checkFileExists(src);
      if (!exists) {
        this.showMissingStatus();
        return;
      }
      await fileService.revealInFinder(src);
    } catch (e) {
      console.error('在 Finder 中显示失败:', e);
    }
  }

  /**
   * 删除附件：弹出自定义确认对话框，根据用户选择决定是否同时删除本地文件
   */
  private async handleDelete(src: string) {
    const fileName = this.nameEl.textContent || '未知文件';

    // 通过 store 驱动的模态弹窗请求确认
    const { requestDeleteConfirm } = useUIStore.getState();
    const { confirmed, deleteFile } = await requestDeleteConfirm(fileName);
    if (!confirmed) return;

    // 如果用户勾选了「同时删除本地原文件」
    if (deleteFile) {
      try {
        await deleteFilePermanent(src);
      } catch {
        // 文件可能已被移动/删除，继续删除节点
      }
    }

    // 从文档中删除此节点
    const pos = this.getPos();
    if (pos !== undefined) {
      const { state, dispatch } = this.view;
      const node = state.doc.nodeAt(pos);
      if (node) {
        const tr = state.tr.delete(pos, pos + node.nodeSize);
        dispatch(tr);
      }
    }
  }

  update(node: Node): boolean {
    if (node.type.name !== 'file_block') return false;

    // 更新 DOM
    this.dom.setAttribute('data-src', node.attrs.src);
    this.dom.setAttribute('data-name', node.attrs.name);
    this.nameEl.textContent = node.attrs.name || '未知文件';
    this.sizeEl.textContent = node.attrs.size || '...';
    this.iconEl.innerHTML = getFileIcon(node.attrs.name);

    return true;
  }

  destroy() {
    // DOM 事件随元素销毁自动清理
  }

  stopEvent(): boolean {
    return false;
  }

  ignoreMutation(): boolean {
    return true;
  }
}
