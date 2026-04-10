import { useCallback } from 'react';

export function useExport() {
  const exportToPDF = useCallback(async (markdown: string, fileName: string) => {
    const htmlContent = markdownToHtml(markdown, fileName);

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');

    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
        URL.revokeObjectURL(url);
      });
    }
  }, []);

  const exportToHTML = useCallback(async (markdown: string, fileName: string) => {
    const htmlContent = markdownToHtml(markdown, fileName, true);

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return { exportToPDF, exportToHTML };
}

function markdownToHtml(markdown: string, title: string, standalone = false): string {
  // 简单的 markdown 转 HTML，用于导出
  // 在生产应用中，应使用专业的 markdown 解析器
  let html = markdown;

  // 转义 HTML 实体（基本）
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 标题
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 粗体、斜体、删除线、行内代码
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 代码块
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const content = match
      .replace(/```\w*\n?/, '')
      .replace(/```$/, '')
      .trim();
    return `<pre><code>${content}</code></pre>`;
  });

  // 链接和图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 引用
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 水平线
  html = html.replace(/^---$/gm, '<hr />');

  // 无序列表
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // 段落
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');

  if (standalone) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.75; color: #1e293b; }
    h1, h2 { border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3em; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px 20px; border-radius: 8px; overflow-x: auto; font-size: 0.875rem; }
    code { background: rgba(0,0,0,0.06); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.875em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #2563eb; padding-left: 16px; color: #475569; margin: 1em 0; }
    a { color: #2563eb; }
    img { max-width: 100%; border-radius: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html>
<head><title>${title}</title>
<style>
  body { max-width: 800px; margin: 40px auto; padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.75; color: #1e293b; }
  h1, h2 { border-bottom: 1px solid #e2e8f0; }
  pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; }
  code { background: rgba(0,0,0,0.06); padding: 0.15em 0.4em; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #2563eb; padding-left: 16px; }
  a { color: #2563eb; }
  img { max-width: 100%; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>${html}</body>
</html>`;
}
