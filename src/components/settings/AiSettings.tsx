import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  RiExternalLinkLine,
  RiLoader4Line,
  RiAddLine,
  RiFolderOpenLine,
  RiRefreshLine,
} from 'react-icons/ri';

import { useSettingsStore } from '@/stores/settings-store';
import { useAiStore } from '@/stores/ai-store';
import { aiService, PROVIDER_PRESETS } from '@/services';
import type { AiProviderId, CustomPrompt } from '@/types/ai';
import { cn } from '@/utils/cn';

import { SettingsSelect, SettingsSlider, SettingsNumberInput } from './SettingsControls';

/**
 * AI 助手设置页
 *
 * - 保留 Key 输入框（快速配置）
 * - 保存 Key 到本地 JSON 配置文件
 * - 自动检测配置文件中的 Key 状态
 * - 模型列表从配置文件读取（支持用户自定义）
 * - 新增"打开配置文件"按钮
 */
export function AiSettings() {
  const { config, setNestedConfig } = useSettingsStore();
  const { keyStatus, refreshConfig, configProviders } = useAiStore();

  const providerId: AiProviderId = config.ai?.currentProvider ?? 'zhipu';
  const provider = providerId === 'custom' ? null : PROVIDER_PRESETS[providerId];

  // 从配置文件中获取当前 Provider 的完整信息
  const configProvider = useMemo(
    () => configProviders.find((p) => p.provider === providerId),
    [configProviders, providerId],
  );

  // 模型列表优先使用配置文件中的，回退到内置预设
  // 根据 free 字段动态拼接"(免费)"标记
  const modelOptions = useMemo(() => {
    const toOption = (m: { id: string; label: string; free?: boolean }) => ({
      value: m.id,
      label: m.free ? `${m.label}(免费)` : m.label,
    });
    if (configProvider && configProvider.models.length > 0) {
      return configProvider.models.map(toOption);
    }
    if (provider) {
      return provider.models.map(toOption);
    }
    return [];
  }, [configProvider, provider]);

  // 受控的 Key 输入值（提交后清空）
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 自定义 Prompt 编辑状态
  const [editingPrompt, setEditingPrompt] = useState<{
    label: string;
    prompt: string;
  } | null>(null);

  const customPrompts: CustomPrompt[] = config.ai?.customPrompts ?? [];

  const addCustomPrompt = useCallback(() => {
    if (!editingPrompt || !editingPrompt.label.trim() || !editingPrompt.prompt.trim()) return;
    const newPrompt: CustomPrompt = {
      id: `custom-${Date.now()}`,
      label: editingPrompt.label.trim(),
      prompt: editingPrompt.prompt.trim(),
    };
    setNestedConfig('ai.customPrompts', [...customPrompts, newPrompt]);
    setEditingPrompt(null);
  }, [editingPrompt, customPrompts, setNestedConfig]);

  const removeCustomPrompt = useCallback(
    (id: string) => {
      setNestedConfig(
        'ai.customPrompts',
        customPrompts.filter((p) => p.id !== id),
      );
    },
    [customPrompts, setNestedConfig],
  );

  // 组件挂载时刷新配置
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const currentHasKey = keyStatus[providerId] ?? false;
  const selectedModel =
    config.ai?.selectedModels?.[providerId] ?? configProvider?.models[0]?.id ?? '';

  // ---- 操作 ----------------------------------------------------------------

  const saveKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await aiService.setApiKey(providerId, trimmed);
      setKeyInput('');
      setTestResult(null);
      // 保存后立即刷新配置以更新状态
      await refreshConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`保存 Key 失败：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const openConfig = async () => {
    try {
      await aiService.openAiConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`打开配置目录失败：${msg}`);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await aiService.testConnection(
        providerId,
        selectedModel,
        providerId === 'custom' ? config.ai?.customBaseUrl : undefined,
      );
      setTestResult({
        ok: res.ok,
        message: res.ok ? `连接成功：${res.reply.slice(0, 60)}` : res.reply,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  // ---- 渲染 ----------------------------------------------------------------

  return (
    <div className="settings-section">
      {/* 功能总开关 */}
      <div className="settings-item">
        <label className="settings-item-label">启用 AI 助手</label>
        <button
          onClick={() => setNestedConfig('ai.enabled', !config.ai?.enabled)}
          className={cn('settings-toggle', config.ai?.enabled !== false && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      <div className="settings-item-hint">
        <p>关闭后，斜杠菜单与浮动工具栏中的 AI 指令入口都会被隐藏。</p>
      </div>

      {/* 服务商 */}
      <div className="settings-section-title">模型配置</div>
      <div className="settings-item">
        <label className="settings-item-label">服务商</label>
        <SettingsSelect
          value={providerId}
          options={[
            { value: 'zhipu', label: '智谱 GLM' },
            { value: 'deepseek', label: 'DeepSeek' },
            { value: 'siliconflow', label: '硅基流动' },
          ]}
          onChange={(v) => {
            setNestedConfig('ai.currentProvider', v as AiProviderId);
            // 同步写入配置文件
            void aiService.setDefaultProvider(v);
          }}
        />
      </div>

      {provider && (
        <>
          {/* API Key */}
          <div className="settings-item">
            <label className="settings-item-label">
              API Key
              <span
                className={cn(
                  'settings-ai-key-badge',
                  currentHasKey ? 'is-configured' : 'is-not-configured',
                )}
              >
                {currentHasKey ? '已配置' : '未配置'}
              </span>
            </label>

            <div className="settings-ai-key-row">
              <input
                type="password"
                className="settings-text-input"
                value={keyInput}
                placeholder={currentHasKey ? '已保存（输入新 Key 将覆盖）' : '粘贴你的 API Key'}
                onChange={(e) => setKeyInput(e.target.value)}
              />
              <button
                className="settings-button settings-button-primary"
                onClick={() => void saveKey()}
                disabled={saving || keyInput.trim().length === 0}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
          {/* 申请 Key 链接 */}
          <div className="settings-item-hint">
            <p>
              没有 Key？{' '}
              <a
                href={provider.apiKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="settings-link"
              >
                前往 {provider.name} 控制台申请 <RiExternalLinkLine size={12} />
              </a>
            </p>
          </div>

          {/* 模型选择 */}
          <div className="settings-item">
            <label className="settings-item-label">模型</label>
            <SettingsSelect
              value={selectedModel}
              options={modelOptions}
              onChange={(v) => {
                setNestedConfig(`ai.selectedModels.${providerId}`, v);
                // 同步写入配置文件
                void aiService.setDefaultModel(providerId, v);
              }}
            />
          </div>

          {/* 测试连接 */}
          <div className="settings-item">
            <label className="settings-item-label">测试连接</label>
            <button
              className="settings-button"
              onClick={() => void runTest()}
              disabled={testing || !currentHasKey}
            >
              {testing ? (
                <>
                  <RiLoader4Line size={14} className="settings-ai-spin" />
                  <span>测试中...</span>
                </>
              ) : (
                <span>发送一条测试消息</span>
              )}
            </button>
          </div>
          {testResult && (
            <div className={cn('settings-ai-test-result', testResult.ok ? 'is-ok' : 'is-error')}>
              {testResult.message}
            </div>
          )}
        </>
      )}

      {/* 配置文件 */}
      {/* <div className="settings-section-title">配置文件</div> */}
      <div className="settings-item" style={{ gap: '8px' }}>
        <label className="settings-item-label">配置文件</label>
        <div className="settings-ai-key-row">
          <button className="settings-button" onClick={() => void openConfig()}>
            <RiFolderOpenLine size={14} />
            <span>打开配置文件目录</span>
          </button>
          <button
            className="settings-button"
            onClick={() => {
              setRefreshing(true);
              void refreshConfig().finally(() => setRefreshing(false));
            }}
            disabled={refreshing}
          >
            <RiRefreshLine size={14} className={refreshing ? 'settings-ai-spin' : ''} />
            <span>{refreshing ? '刷新中...' : '刷新配置'}</span>
          </button>
        </div>
      </div>
      <div className="settings-item-hint">
        <p>配置文件包含所有服务商的 API Key、模型列表等信息，修改配置文件后点击刷新按钮生效。</p>
      </div>

      {/* 生成参数 */}
      <div className="settings-section-title">生成参数</div>
      <div className="settings-item">
        <label className="settings-item-label">Temperature</label>
        <SettingsSlider
          value={config.ai?.temperature ?? 0.7}
          min={0}
          max={2}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={(v) => setNestedConfig('ai.temperature', v)}
        />
      </div>
      <div className="settings-item-hint">
        <p>越高越发散，越低越稳定。常规写作建议 0.5-0.8。</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">最大生成 Token 数</label>
        <SettingsNumberInput
          value={config.ai?.maxTokens ?? 2000}
          min={256}
          max={8192}
          step={256}
          onChange={(v) => setNestedConfig('ai.maxTokens', v)}
        />
      </div>

      {/* 交互入口 */}
      <div className="settings-section-title">交互入口</div>
      <div className="settings-item">
        <label className="settings-item-label">在斜杠菜单中显示 AI 指令</label>
        <button
          onClick={() => setNestedConfig('ai.showInSlash', !config.ai?.showInSlash)}
          className={cn('settings-toggle', config.ai?.showInSlash !== false && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">在划词浮层中显示 AI 按钮</label>
        <button
          onClick={() => setNestedConfig('ai.showInTooltip', !config.ai?.showInTooltip)}
          className={cn('settings-toggle', config.ai?.showInTooltip !== false && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>

      {/* 自定义 Prompt 模板 */}
      <div className="settings-section-title">自定义指令</div>
      <div className="settings-item-hint">
        <p>添加自定义指令后，它们会出现在斜杠菜单的 AI 子菜单中。</p>
      </div>

      {/* 已有模板列表 */}
      {customPrompts.map((p) => (
        <div key={p.id} className="settings-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="settings-item-label">{p.label}</div>
            <div className="settings-item-hint" style={{ marginTop: 2 }}>
              <p
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '300px',
                }}
              >
                {p.prompt}
              </p>
            </div>
          </div>
          <button
            className="settings-button"
            onClick={() => removeCustomPrompt(p.id)}
            title="删除此指令"
          >
            <span>删除</span>
          </button>
        </div>
      ))}

      {/* 添加新模板 */}
      {editingPrompt ? (
        <div className="lanismd-ai-custom-prompt-form">
          <div className="settings-item" style={{ gap: '8px' }}>
            <input
              type="text"
              className="settings-text-input"
              placeholder="指令名称"
              value={editingPrompt.label}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, label: e.target.value })}
              style={{ minWidth: '100px', maxWidth: '140px' }}
            />
            <textarea
              className="settings-text-input"
              placeholder="输入 System Prompt..."
              value={editingPrompt.prompt}
              onChange={(e) => setEditingPrompt({ ...editingPrompt, prompt: e.target.value })}
              rows={3}
              style={{
                flex: 1,
                minWidth: '200px',
                maxWidth: 'none',
                resize: 'vertical',
              }}
            />
          </div>
          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}
          >
            <button className="settings-button" onClick={() => setEditingPrompt(null)}>
              取消
            </button>
            <button
              className="settings-button settings-button-primary"
              onClick={addCustomPrompt}
              disabled={!editingPrompt.label.trim() || !editingPrompt.prompt.trim()}
            >
              添加
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            className="settings-button"
            onClick={() => setEditingPrompt({ label: '', prompt: '' })}
          >
            <RiAddLine size={14} />
            <span>添加自定义指令</span>
          </button>
        </div>
      )}

      <div className="settings-section-title">历史记录</div>
      <div className="settings-item">
        <label className="settings-item-label">历史记录上限</label>
        <SettingsNumberInput
          value={config.ai?.maxHistoryCount ?? 200}
          min={10}
          max={1000}
          step={10}
          suffix="条"
          onChange={(v) => setNestedConfig('ai.maxHistoryCount', v)}
        />
      </div>
      <div className="settings-item-hint">
        <p>AI 生成结果的最大缓存条数，超出后自动丢弃最早的记录。</p>
      </div>
    </div>
  );
}
