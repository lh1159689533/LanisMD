/**
 * 对话输入区的模型选择下拉框
 *
 * 列出设置中配置的全部模型；密钥不可用的模型置灰并提示原因。
 *
 * @changelog
 * | 版本   | 变更说明                | 关联           |
 * | v1.0.0 | 初始实现：模型选择 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useRef, useState } from 'react';
import { RiArrowDownSLine, RiCheckLine, RiSettings3Line } from 'react-icons/ri';

import { getModelKindMeta } from '@/services/ai/model-kinds';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

interface ModelSelectProps {
  /** 当前选中的模型配置 id（为空表示跟随当前模型） */
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelect({ value, onChange, disabled }: ModelSelectProps) {
  const models = useAiStore((s) => s.models);
  const currentModelId = useAiStore((s) => s.currentModelId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected =
    models.find((m) => m.id === value) ?? models.find((m) => m.id === currentModelId) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const openSettings = () => {
    setOpen(false);
    useUIStore.getState().openSettings('ai');
  };

  return (
    <div ref={rootRef} className="lanismd-ai-chat-model">
      <button
        type="button"
        className="lanismd-ai-chat-model-trigger"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={selected ? `${selected.name} · ${selected.model}` : '选择模型'}
      >
        <span className="lanismd-ai-chat-model-name">{selected?.name ?? '未配置模型'}</span>
        <RiArrowDownSLine size={14} />
      </button>

      {open && (
        <div className="lanismd-ai-chat-model-menu">
          {models.length === 0 && <div className="lanismd-ai-chat-model-empty">尚未配置模型</div>}
          {models.map((m) => {
            const active = m.id === selected?.id;
            return (
              <button
                key={m.id}
                type="button"
                className={cn(
                  'lanismd-ai-chat-model-option',
                  active && 'is-active',
                  !m.keyReady && 'is-unavailable',
                )}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                title={m.keyReady ? m.model : '密钥不可用，请在设置中检查'}
              >
                <span className="lanismd-ai-chat-model-option-main">
                  <span className="lanismd-ai-chat-model-option-name">{m.name}</span>
                  <span className="lanismd-ai-chat-model-option-desc">
                    {getModelKindMeta(m.kind).label} · {m.model}
                    {!m.keyReady && ' · 密钥不可用'}
                  </span>
                </span>
                {active && <RiCheckLine size={14} />}
              </button>
            );
          })}
          <div className="lanismd-ai-chat-model-divider" />
          <button type="button" className="lanismd-ai-chat-model-option" onClick={openSettings}>
            <span className="lanismd-ai-chat-model-option-main">
              <span className="lanismd-ai-chat-model-option-name">
                <RiSettings3Line size={13} />
                管理模型
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
