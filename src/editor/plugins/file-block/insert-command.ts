/**
 * 插入附件的逻辑
 *
 * 通过系统文件对话框选择文件，根据配置决定是否复制到附件目录，然后插入 file_block 节点。
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { open } from '@tauri-apps/plugin-dialog';

import { removeSlashTrigger } from '../slash-menu/commands-basic';
import { getFileSize, copyFileToAttachments } from '@/services/file-block-service';
import { useSettingsStore } from '@/stores';

/**
 * 插入文件附件节点
 */
export async function insertFileBlock(view: EditorView) {
  removeSlashTrigger(view);

  // 1. 打开系统文件选择对话框
  const filePath = await open({
    multiple: false,
    directory: false,
  });
  if (!filePath) return; // 用户取消

  // filePath 可能是 string（单选）
  const selectedPath = typeof filePath === 'string' ? filePath : filePath;
  if (!selectedPath) return;

  // 2. 获取文件名
  // 兼容 Windows/macOS/Linux 路径分隔符
  const separator = selectedPath.includes('\\') ? '\\' : '/';
  const fileName = selectedPath.split(separator).pop() || selectedPath;

  // 3. 根据配置决定存储策略
  const config = useSettingsStore.getState().config;
  let finalPath = selectedPath;
  const storageDir = config.attachment?.storageDir;

  if (storageDir) {
    try {
      finalPath = await copyFileToAttachments(selectedPath, storageDir);
    } catch (e) {
      console.error('复制文件到附件目录失败:', e);
      // 降级为使用原始路径
      finalPath = selectedPath;
    }
  }

  // 4. 获取文件大小
  let size = '';
  try {
    size = await getFileSize(selectedPath);
  } catch {
    // 忽略，NodeView 会异步获取
  }

  // 5. 插入 file_block 节点
  const { state, dispatch } = view;
  const schema = state.schema;
  const fileBlockType = schema.nodes.file_block;
  if (!fileBlockType) return;

  const { $from } = state.selection;
  const parent = $from.parent;
  const fileNode = fileBlockType.create({ src: finalPath, name: fileName, size });

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    // 替换当前空段落
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, fileNode);
    dispatch(tr.scrollIntoView());
  } else {
    // 在当前块后面插入
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, fileNode);
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}
