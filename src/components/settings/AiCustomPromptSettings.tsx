import { useCallback, useRef, useState } from 'react';
import { RiAddLine } from 'react-icons/ri';

import { TEMPERATURE_RANGE, placementsOf } from '@/services/ai/custom-commands';
import { DEFAULT_GENERATION, MAX_OUTPUT_TOKENS } from '@/services/ai/generation';
import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_HINTS,
  type TemplateVariable,
} from '@/services/ai/prompt-template';
import { useSettingsStore } from '@/stores/settings-store';
import type { CustomPrompt, CustomPromptInsertMode, CustomPromptPlacement } from '@/types/ai';
import { cn } from '@/utils/cn';

import { SettingsSegmentedControl } from './SettingsControls';

/**
 * 自定义指令设置：新增 / 编辑 / 删除
 *
 * 每条指令可设置插入方式、出现位置（斜杠菜单 / 划词浮层 / 右键菜单）、温度与输出上限；
 * prompt 支持 {{selection}} 等模板变量。旧指令缺省字段按默认值处理，行为不变。
 *
 * @changelog
 * | 版本   | 变更说明                                             | 关联                         |
 * | v1.0.0 | 从 AiSettings 拆出；支持编辑、插入方式、位置与生成参数 | REQ: AI 体验短板-自定义指令 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 表单草稿：数值项用字符串保存，允许留空表示使用默认值 */
interface PromptDraft {
  id?: string;
  label: string;
  prompt: string;
  insertMode: CustomPromptInsertMode;
  placements: CustomPromptPlacement[];
  temperature: string;
  maxTokens: string;
}

const INSERT_MODE_OPTIONS: Array<{ value: CustomPromptInsertMode; label: string }> = [
  { value: 'insert-after', label: '插入到下方' },
  { value: 'replace-selection', label: '替换选区' },
];

const PLACEMENT_OPTIONS: Array<{ value: CustomPromptPlacement; label: string }> = [
  { value: 'slash', label: '斜杠菜单' },
  { value: 'tooltip', label: '划词浮层' },
  { value: 'context-menu', label: '右键菜单' },
];

const EMPTY_DRAFT: PromptDraft = {
  label: '',
  prompt: '',
  insertMode: 'insert-after',
  placements: ['slash'],
  temperature: '',
  maxTokens: '',
};

function toDraft(p: CustomPrompt): PromptDraft {
  return {
    id: p.id,
    label: p.label,
    prompt: p.prompt,
    insertMode: p.insertMode ?? 'insert-after',
    placements: placementsOf(p),
    temperature: p.temperature != null ? String(p.temperature) : '',
    maxTokens: p.maxTokens != null ? String(p.maxTokens) : '',
  };
}

/** 解析可选数值：留空返回 undefined，非法或越界返回 null */
function parseOptionalNumber(raw: string, min: number, max: number): number | undefined | null {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

const MAX_TOKENS_LIMIT = MAX_OUTPUT_TOKENS * 4;

function validateDraft(draft: PromptDraft): string | null {
  if (!draft.label.trim()) return '请填写指令名称';
  if (!draft.prompt.trim()) return '请填写 Prompt';
  if (draft.placements.length === 0) return '请至少选择一个出现位置';
  if (
    parseOptionalNumber(draft.temperature, TEMPERATURE_RANGE.min, TEMPERATURE_RANGE.max) === null
  ) {
    return `温度需在 ${TEMPERATURE_RANGE.min} ~ ${TEMPERATURE_RANGE.max} 之间`;
  }
  if (parseOptionalNumber(draft.maxTokens, 1, MAX_TOKENS_LIMIT) === null) {
    return `输出上限需在 1 ~ ${MAX_TOKENS_LIMIT} 之间`;
  }
  return null;
}

function fromDraft(draft: PromptDraft): CustomPrompt {
  const temperature = parseOptionalNumber(
    draft.temperature,
    TEMPERATURE_RANGE.min,
    TEMPERATURE_RANGE.max,
  );
  const maxTokens = parseOptionalNumber(draft.maxTokens, 1, MAX_TOKENS_LIMIT);
  return {
    id: draft.id ?? `custom-${Date.now()}`,
    label: draft.label.trim(),
    prompt: draft.prompt.trim(),
    insertMode: draft.insertMode,
    placements: draft.placements,
    ...(temperature != null ? { temperature } : {}),
    ...(maxTokens != null ? { maxTokens: Math.round(maxTokens) } : {}),
  };
}

/** 列表中展示的指令摘要 */
function describePrompt(p: CustomPrompt): string {
  const places = placementsOf(p)
    .map((v) => PLACEMENT_OPTIONS.find((o) => o.value === v)?.label ?? v)
    .join(' / ');
  const mode = INSERT_MODE_OPTIONS.find((o) => o.value === (p.insertMode ?? 'insert-after'))?.label;
  const params = [
    p.temperature != null ? `温度 ${p.temperature}` : '',
    p.maxTokens != null ? `上限 ${p.maxTokens}` : '',
  ].filter(Boolean);
  return [places, mode, ...params].join(' · ');
}

function PromptForm({
  draft,
  onChange,
  onCancel,
  onSave,
}: {
  draft: PromptDraft;
  onChange: (draft: PromptDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const error = validateDraft(draft);

  /** 在光标处插入变量 */
  const insertVariable = (name: TemplateVariable) => {
    const token = `{{${name}}}`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.prompt.length;
    const end = el?.selectionEnd ?? draft.prompt.length;
    onChange({ ...draft, prompt: draft.prompt.slice(0, start) + token + draft.prompt.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const togglePlacement = (value: CustomPromptPlacement) => {
    const has = draft.placements.includes(value);
    onChange({
      ...draft,
      placements: has ? draft.placements.filter((v) => v !== value) : [...draft.placements, value],
    });
  };

  return (
    <div className="settings-ai-prompt-form">
      <input
        type="text"
        className="settings-text-input settings-ai-prompt-name"
        placeholder="指令名称"
        value={draft.label}
        onChange={(e) => onChange({ ...draft, label: e.target.value })}
      />
      <textarea
        ref={textareaRef}
        className="settings-text-input settings-ai-prompt-textarea"
        placeholder="输入 System Prompt，例如：把 {{selection}} 改写为适合发布在公众号的风格"
        value={draft.prompt}
        onChange={(e) => onChange({ ...draft, prompt: e.target.value })}
        rows={4}
      />
      <div className="settings-ai-prompt-vars">
        <span>插入变量：</span>
        {TEMPLATE_VARIABLES.map((name) => (
          <button
            key={name}
            type="button"
            className="settings-ai-prompt-var"
            title={TEMPLATE_VARIABLE_HINTS[name]}
            onClick={() => insertVariable(name)}
          >
            {`{{${name}}}`}
          </button>
        ))}
      </div>
      <div className="settings-item-hint">
        <p>不使用变量时，选中内容或输入的描述会作为用户消息发送（与旧版指令一致）。</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">插入方式</label>
        <SettingsSegmentedControl
          value={draft.insertMode}
          options={INSERT_MODE_OPTIONS}
          onChange={(v) => onChange({ ...draft, insertMode: v as CustomPromptInsertMode })}
        />
      </div>

      <div className="settings-item">
        <label className="settings-item-label">出现位置</label>
        <div className="settings-segmented">
          {PLACEMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                'settings-segmented-item',
                draft.placements.includes(opt.value) && 'active',
              )}
              onClick={() => togglePlacement(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-item-hint">
        <p>划词浮层与右键菜单仅在选中文本时出现，直接处理选中内容。</p>
      </div>

      <div className="settings-item">
        <label className="settings-item-label">温度</label>
        <input
          type="text"
          inputMode="decimal"
          className="settings-text-input settings-ai-prompt-number"
          placeholder={`默认 ${DEFAULT_GENERATION.temperature}`}
          value={draft.temperature}
          onChange={(e) => onChange({ ...draft, temperature: e.target.value })}
        />
      </div>
      <div className="settings-item">
        <label className="settings-item-label">输出上限（tokens）</label>
        <input
          type="text"
          inputMode="numeric"
          className="settings-text-input settings-ai-prompt-number"
          placeholder={`默认 ${DEFAULT_GENERATION.maxTokens}`}
          value={draft.maxTokens}
          onChange={(e) => onChange({ ...draft, maxTokens: e.target.value })}
        />
      </div>
      <div className="settings-item-hint">
        <p>留空使用默认值；填写后优先于默认设置。温度越低输出越稳定。</p>
      </div>

      <div className="settings-ai-prompt-footer">
        {error && <span className="settings-ai-prompt-error">{error}</span>}
        <button className="settings-button" onClick={onCancel}>
          取消
        </button>
        <button
          className="settings-button settings-button-primary"
          onClick={onSave}
          disabled={Boolean(error)}
        >
          {draft.id ? '保存' : '添加'}
        </button>
      </div>
    </div>
  );
}

/** 稳定的空数组引用，避免 selector 每次返回新数组导致重复渲染 */
const NO_PROMPTS: CustomPrompt[] = [];

export function AiCustomPromptSettings() {
  const customPrompts = useSettingsStore((s) => s.config.ai?.customPrompts ?? NO_PROMPTS);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);
  const [draft, setDraft] = useState<PromptDraft | null>(null);

  const save = useCallback(() => {
    if (!draft || validateDraft(draft)) return;
    const next = fromDraft(draft);
    const exists = customPrompts.some((p) => p.id === next.id);
    setNestedConfig(
      'ai.customPrompts',
      exists ? customPrompts.map((p) => (p.id === next.id ? next : p)) : [...customPrompts, next],
    );
    setDraft(null);
  }, [draft, customPrompts, setNestedConfig]);

  const remove = useCallback(
    (id: string) => {
      setNestedConfig(
        'ai.customPrompts',
        customPrompts.filter((p) => p.id !== id),
      );
      if (draft?.id === id) setDraft(null);
    },
    [customPrompts, draft, setNestedConfig],
  );

  return (
    <>
      <div className="settings-item-hint">
        <p>自定义指令可出现在斜杠菜单的 AI 助手、划词浮层的 AI 子菜单或右键菜单中。</p>
      </div>

      {customPrompts.map((p) =>
        draft?.id === p.id ? (
          <PromptForm
            key={p.id}
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={save}
          />
        ) : (
          <div key={p.id} className="settings-item">
            <div className="settings-ai-prompt-summary">
              <div className="settings-item-label">{p.label}</div>
              <div className="settings-ai-prompt-meta">{describePrompt(p)}</div>
              <div className="settings-ai-prompt-preview">{p.prompt}</div>
            </div>
            <div className="settings-ai-key-actions">
              <button className="settings-button" onClick={() => setDraft(toDraft(p))}>
                <span>编辑</span>
              </button>
              <button className="settings-button" onClick={() => remove(p.id)} title="删除此指令">
                <span>删除</span>
              </button>
            </div>
          </div>
        ),
      )}

      {draft && !draft.id ? (
        <PromptForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      ) : (
        !draft && (
          <div>
            <button className="settings-button" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <RiAddLine size={14} />
              <span>添加自定义指令</span>
            </button>
          </div>
        )
      )}
    </>
  );
}
