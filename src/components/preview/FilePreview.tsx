/**
 * 内置文件预览页面
 *
 * 独立的 Tauri 窗口中渲染，通过 URL 参数接收文件路径。
 * 使用 open-file-viewer 组件支持 110+ 种文件格式的内置预览。
 * 不支持的格式显示文件基本信息并引导用户使用系统软件打开。
 */

import { useEffect, useState, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileViewer } from '@open-file-viewer/react';
import {
  imagePlugin,
  videoPlugin,
  audioPlugin,
  textPlugin,
  pdfPlugin,
  officePlugin,
  archivePlugin,
  emailPlugin,
  drawingPlugin,
  cadPlugin,
  model3dPlugin,
  gisPlugin,
  fallbackPlugin,
  PreviewContext,
} from '@open-file-viewer/core';
import '@open-file-viewer/core/style.css';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

import { openFileWithSystem, getFileSize, checkFileExists } from '@/services/file-block-service';
import { usePreviewTheme } from '@/hooks/usePreviewTheme';
import { useUIStore } from '@/stores/ui-store';
import '@/styles/preview/file-preview.css';
import '@/styles/preview/unsupported-preview.css';
import '@/styles/preview/file-preview-overrides.css';

// 获取 URL 参数中的文件路径
function getFilePathFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return decodeURIComponent(params.get('file') || '');
}

export function FilePreview() {
  // 主题同步：跟随主应用的主题切换
  const { isDark } = usePreviewTheme();
  const [filePath] = useState(() => getFilePathFromUrl());
  const [fileName] = useState(() => {
    const path = getFilePathFromUrl();
    const sep = path.includes('\\') ? '\\' : '/';
    return path.split(sep).pop() || '未知文件';
  });
  const [fileSize, setFileSize] = useState('');
  const [fileExists, setFileExists] = useState(true);
  const [fileUrl, setFileUrl] = useState('');
  // 初始化 open-file-viewer 插件列表
  const plugins = useMemo(
    () => [
      imagePlugin(),
      videoPlugin(),
      audioPlugin(),
      textPlugin(),
      pdfPlugin({ workerSrc: pdfWorkerSrc }),
      officePlugin(),
      archivePlugin(),
      emailPlugin(),
      drawingPlugin(),
      cadPlugin(),
      model3dPlugin(),
      gisPlugin(),
      fallbackPlugin(),
    ],
    [],
  );

  useEffect(() => {
    if (!filePath) return;

    // 检查文件是否存在
    checkFileExists(filePath)
      .then((exists) => {
        setFileExists(exists);
      })
      .catch(() => setFileExists(false));

    // 获取文件大小
    getFileSize(filePath)
      .then((size) => {
        setFileSize(size);
      })
      .catch(() => {});

    // 通过 Tauri 的 convertFileSrc 将本地文件路径转为可访问的 URL
    setFileUrl(convertFileSrc(filePath));
  }, [filePath]);

  const handleOpenWithSystem = async () => {
    await openFileWithSystem(filePath);
  };

  const onRenderfallback = (ctx: PreviewContext) => {
    const el = document.createElement('div');
    el.className = 'lanismd-unsupported-preview';

    // 文件信息行
    const infoHtml = [
      `<div class="lanismd-unsupported-preview__row"><dt>文件</dt><dd>${ctx.file.name}</dd></div>`,
      `<div class="lanismd-unsupported-preview__row"><dt>格式</dt><dd>${ctx.file.extension ? `.${ctx.file.extension}` : '未知'}</dd></div>`,
      fileSize
        ? `<div class="lanismd-unsupported-preview__row"><dt>大小</dt><dd>${fileSize}</dd></div>`
        : '',
    ].join('');

    // 卡片结构
    const card = document.createElement('div');
    card.className = 'lanismd-unsupported-preview__card';
    card.innerHTML = `
                  <div class="lanismd-unsupported-preview__icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="12" y1="18" x2="12" y2="12"/>
                      <line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                  </div>
                  <h2 class="lanismd-unsupported-preview__title">暂不支持预览</h2>
                  <p class="lanismd-unsupported-preview__subtitle">该文件格式无法在应用内预览</p>
                  <dl class="lanismd-unsupported-preview__info">${infoHtml}</dl>
                `;

    // "用系统软件打开"按钮
    const btn = document.createElement('button');
    btn.className = 'lanismd-unsupported-preview__btn';
    btn.textContent = '用系统软件打开';
    btn.addEventListener('click', () => openFileWithSystem(filePath));
    card.appendChild(btn);

    el.appendChild(card);
    ctx.viewport.appendChild(el);
    return { destroy: () => el.remove() };
  };

  const onError = (errorMsg: string) => {
    console.error('预览窗口创建失败:', errorMsg);
    useUIStore.getState().addToast({
      type: 'error',
      message: `预览失败: ${errorMsg}`,
      actions: [
        { label: '用系统软件打开', onClick: () => openFileWithSystem(filePath), primary: true },
      ],
    });
  };

  if (!filePath) {
    return (
      <div className="lanismd-preview-page flex h-screen items-center justify-center">
        <p className="lanismd-preview-muted">未指定文件路径</p>
      </div>
    );
  }

  if (!fileExists) {
    return (
      <div className="lanismd-preview-page flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg" style={{ color: 'var(--lanismd-danger)' }}>
          文件不存在
        </p>
        <p className="lanismd-preview-muted text-sm">{filePath}</p>
      </div>
    );
  }

  return (
    <div className="lanismd-preview-page flex h-screen flex-col">
      {/* 预览内容区域 */}
      <div className="flex-1 overflow-hidden">
        {fileUrl && (
          <FileViewer
            file={fileUrl}
            fileName={fileName}
            width="100%"
            height="100%"
            fit="contain"
            toolbar={{
              zoom: true,
              rotate: true,
              search: true,
              labels: {
                search: '搜索',
                'zoom-in': '放大',
                'zoom-out': '缩小',
                'zoom-reset': '原始比例',
                'rotate-right': '旋转',
              },
              order: [
                'zoom-out',
                'zoom-in',
                'zoom-reset',
                'rotate-right',
                'openWithSystem',
                'search',
              ],
              actions: [
                {
                  id: 'openWithSystem',
                  label: '用系统软件打开',
                  onClick() {
                    handleOpenWithSystem();
                  },
                },
              ],
            }}
            theme={isDark ? 'dark' : 'light'}
            plugins={plugins}
            fallback="custom"
            onError={(error, file) => {
              console.log('error:', error, file);
              const errorMsg = error instanceof Error ? error.message : String(error);
              onError(errorMsg);
            }}
            renderFallback={onRenderfallback}
            onUnsupported={(file) => {
              console.log('onUnsupported:', file);
              const ext = file?.extension || file?.name?.split('.').pop() || '未知';
              onError(`不支持预览 .${ext} 格式的文件`);
            }}
            onLoad={(file) => {
              console.log('onLoad:', file);
            }}
          />
        )}
      </div>
    </div>
  );
}
