/**
 * 设置 > MCP 服务：生成并复制外部 AI 客户端（Claude Desktop / Cursor 等）的接入配置
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                     |
 * | v1.0.0 | 初始实现：多客户端格式、只读模式、复制 | REQ: 设置页复制 MCP 配置 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useMemo, useState } from 'react';
import { RiCheckLine, RiErrorWarningLine, RiFileCopyLine, RiLoader4Line } from 'react-icons/ri';
import { mcpService, type McpServerInfo } from '@/services/tauri/mcp-service';
import { cn } from '@/utils/cn';
import { buildMcpConfig, MCP_CONFIG_FORMATS, type McpConfigFormat } from '@/utils/mcp-config';
import { SettingsSelect } from './SettingsControls';

import '@/styles/mcp-settings.css';

const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
/** 复制成功提示的展示时长 */
const COPIED_FEEDBACK_MS = 2000;

export function McpSettings() {
  const [info, setInfo] = useState<McpServerInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [format, setFormat] = useState<McpConfigFormat>('json');
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    mcpService
      .getServerInfo()
      .then(setInfo)
      .catch((err) => setLoadError(String(err)));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const config = useMemo(
    () =>
      info
        ? buildMcpConfig(format, { executable: info.executable, readOnly, isWindows: IS_WINDOWS })
        : '',
    [info, format, readOnly],
  );
  const formatMeta = MCP_CONFIG_FORMATS.find((f) => f.value === format);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
    } catch (err) {
      setLoadError(`复制失败：${String(err)}`);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-section-title">接入外部 AI</div>
      <div className="settings-item-hint">
        <p>
          LanisMD 可作为 MCP 服务，让 Claude Desktop、Cursor 等 AI 客户端搜索、阅读和修改你的
          Markdown 文档。复制下方配置粘贴到客户端，重启客户端后生效。
        </p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">客户端</label>
        <SettingsSelect
          value={format}
          options={MCP_CONFIG_FORMATS.map((f) => ({ value: f.value, label: f.label }))}
          onChange={(v) => setFormat(v as McpConfigFormat)}
        />
      </div>

      <div className="settings-item">
        <label className="settings-item-label">只读模式</label>
        <button
          onClick={() => setReadOnly(!readOnly)}
          className={cn('settings-toggle', readOnly && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      <div className="settings-item-hint">
        <p>开启后 AI 只能读取、搜索文档和查看 Git 记录，不能创建、修改或删除文档。</p>
      </div>

      {!info && !loadError && (
        <div className="mcp-settings-loading">
          <RiLoader4Line size={14} className="animate-spin" />
          <span>正在获取 LanisMD 路径…</span>
        </div>
      )}

      {info && (
        <div className="mcp-settings-config">
          <div className="mcp-settings-config-header">
            <span>{formatMeta?.label} 配置</span>
            <button
              className={cn('mcp-settings-copy-btn', copied && 'copied')}
              onClick={() => void copy()}
            >
              {copied ? <RiCheckLine size={14} /> : <RiFileCopyLine size={14} />}
              <span>{copied ? '已复制' : '复制配置'}</span>
            </button>
          </div>
          <pre className="mcp-settings-code">{config}</pre>
        </div>
      )}

      {formatMeta && (
        <div className="settings-item-hint">
          <p>{formatMeta.hint}</p>
        </div>
      )}

      {info?.warning && (
        <div className="mcp-settings-warning">
          <RiErrorWarningLine size={14} />
          <span>{info.warning}</span>
        </div>
      )}
      {info?.devBuild && (
        <div className="mcp-settings-warning">
          <RiErrorWarningLine size={14} />
          <span>当前为开发构建，配置指向 target/debug，正式安装后请重新复制。</span>
        </div>
      )}
      {loadError && (
        <div className="mcp-settings-warning">
          <RiErrorWarningLine size={14} />
          <span>{loadError}</span>
        </div>
      )}

      <div className="settings-section-title">工作方式</div>
      <div className="settings-item-hint mcp-settings-notes">
        <p>AI 操作的文件夹跟随 LanisMD 当前打开的文件夹，切换后立即生效。</p>
        <p>LanisMD 未运行或未打开文件夹时，客户端会让你从最近打开的文件夹中选择，或指定新目录。</p>
        <p>你正在编辑且未保存的文档不会被 AI 改写；AI 的修改会实时同步到编辑器并给出提示。</p>
        <p>隐藏文件（如 .git、.env）不可访问，删除的文档会移到废纸篓。</p>
      </div>
    </div>
  );
}
