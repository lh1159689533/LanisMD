import { useEffect, useState } from 'react';
import { RiFolderOpenLine, RiRefreshLine } from 'react-icons/ri';

import { useSettingsStore } from '@/stores/settings-store';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import { aiService } from '@/services';
import {
  MAX_HISTORY_RETENTION_DAYS,
  MIN_HISTORY_RETENTION_DAYS,
  normalizeRetentionDays,
} from '@/services/ai/history-retention';
import { cn } from '@/utils/cn';

import { AiCustomPromptSettings } from './AiCustomPromptSettings';
import { AiModelSettings } from './AiModelSettings';
import { AiSkillSettings } from './AiSkillSettings';
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
 * | v2.1.0 | 自定义指令拆为独立组件；错误提示改为应用内提示 | REQ: AI 体验短板     |
 * | v2.2.0 | 新增对话技能管理                               | REQ: AI 技能         |
 * | v2.3.0 | 历史记录由条数上限改为保存天数（1 ~ 90 天）    | REQ: AI 历史按时间保存 |
 * /@changelog
 *
 * @author hhhuilli
 */
export function AiSettings() {
  const { config, setNestedConfig } = useSettingsStore();
  const refreshConfig = useAiStore((s) => s.refreshConfig);
  const [refreshing, setRefreshing] = useState(false);

  // 进入设置页时刷新配置（环境变量、配置文件可能已在外部修改）
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const openConfig = async () => {
    try {
      await aiService.openAiConfig();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      useUIStore.getState().addToast({ type: 'error', message: `打开配置目录失败：${msg}` });
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

          {/* 自定义指令 */}
          <div className="settings-section-title">自定义指令</div>
          <AiCustomPromptSettings />

          {/* 对话技能（对话面板「管理技能」会滚动定位到此处） */}
          <div id="lanismd-settings-ai-skills" className="settings-section-title">
            对话技能
          </div>
          <AiSkillSettings />

          <div className="settings-section-title">历史记录</div>
          <div className="settings-item">
            <label className="settings-item-label">历史记录保存时间</label>
            <SettingsNumberInput
              value={normalizeRetentionDays(config.ai?.historyRetentionDays)}
              min={MIN_HISTORY_RETENTION_DAYS}
              max={MAX_HISTORY_RETENTION_DAYS}
              step={1}
              suffix="天"
              onChange={(v) => setNestedConfig('ai.historyRetentionDays', Math.round(v))}
            />
          </div>
          <div className="settings-item-hint">
            <p>
              AI 指令结果与对话的保存天数（{MIN_HISTORY_RETENTION_DAYS} ~{' '}
              {MAX_HISTORY_RETENTION_DAYS} 天），超过后自动清理；当前打开的对话不受影响。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
