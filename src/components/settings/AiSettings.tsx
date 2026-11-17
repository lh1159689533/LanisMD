import { useEffect, useState, useCallback } from 'react';
import { RiAddLine, RiFolderOpenLine, RiRefreshLine } from 'react-icons/ri';

import { useSettingsStore } from '@/stores/settings-store';
import { useAiStore } from '@/stores/ai-store';
import { aiService } from '@/services';
import type { CustomPrompt } from '@/types/ai';
import { cn } from '@/utils/cn';

import { AiModelSettings } from './AiModelSettings';
import { SettingsNumberInput } from './SettingsControls';

/**
 * AI 助手设置页
 *
 * - 模型：一条配置 = 一个模型（本地模型 / API 模型），见 AiModelSettings
 * - 不再提供 Temperature、最大 Token 等生成参数：各指令内置合适的默认值（services/ai/generation.ts）
 * - 交互入口、自定义指令、历史记录
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                 |
 * | v2.0.0 | 模型配置改为分类型的模型列表；移除生成参数设置 | REQ: AI 模型配置重做 |
 * /@changelog
 *
 * @author hhhuilli
 */
export function AiSettings() {
  const { config, setNestedConfig } = useSettingsStore();
  const refreshConfig = useAiStore((s) => s.refreshConfig);
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

  // 进入设置页时刷新配置（环境变量、配置文件可能已在外部修改）
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const openConfig = async () => {
    try {
      await aiService.openAiConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`打开配置目录失败：${msg}`);
    }
  };

  return (
    <div className="settings-section">
      {/* 功能总开关 */}
      <div className="settings-item">
        <label className="settings-item-label">启用 AI 助手</label>
        <button
          onClick={() => setNestedConfig('ai.enabled', !config.ai?.enabled)}
          className={cn('settings-toggle', config.ai?.enabled && 'checked')}
        >
          <span className="settings-toggle-thumb" />
        </button>
      </div>
      <div className="settings-item-hint">
        <p>开启后，可以使用斜杠菜单与浮动工具栏中的 AI 相关的指令。</p>
      </div>

      {/* 未启用时隐藏所有配置项 */}
      {!config.ai?.enabled ? null : (
        <>
          <div className="settings-section-title">模型</div>
          <AiModelSettings />

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
                <span>{refreshing ? '刷新中...' : '刷新'}</span>
              </button>
            </div>
          </div>
          <div className="settings-item-hint">
            <p>
              模型配置保存在 ai-providers.json 中；手动编辑或修改环境变量后点击刷新生效。
              长文档场景可在文件中为模型填写 contextLength（上下文窗口）。
            </p>
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
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  marginTop: '8px',
                }}
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
        </>
      )}
    </div>
  );
}
