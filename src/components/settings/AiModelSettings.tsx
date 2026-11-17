/**
 * AI 设置页 - 模型配置区
 *
 * - 模型列表：一条配置 = 一个模型，可设为当前、测试连接、编辑、删除；
 *   限制最大高度（超出滚动），支持按名称 / 模型 ID / 类型 / 地址关键字搜索
 * - 添加 / 编辑在弹窗中进行：模型类型先选「本地模型 / API 模型」，联动显示二级分类；
 *   再填写名称、基础 URL、模型 ID 与密钥来源（本地保存 / 环境变量 / 无密钥），
 *   切换类型时自动带入该类型的默认值
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联                 |
 * | v1.0.0 | 初始实现：模型列表与分类型添加表单 | REQ: AI 模型配置重做 |
 * | v1.1.0 | 列表限高+搜索；表单改弹窗；类型两级联动 | REQ: AI 设置交互调整 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  RiAddLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiEditLine,
  RiExternalLinkLine,
  RiLoader4Line,
  RiPlugLine,
  RiSearchLine,
} from 'react-icons/ri';

import { Dialog } from '@/components/common/Dialog';

import { aiService, showConfirmDialog } from '@/services';
import {
  getModelKindMeta,
  MODEL_GROUP_LABELS,
  MODEL_KINDS,
  type AiModelGroup,
} from '@/services/ai/model-kinds';
import { useAiStore } from '@/stores/ai-store';
import type { AiKeySource, AiModelDraft, AiModelKind, AiModelProfile } from '@/types/ai';
import { cn } from '@/utils/cn';

import { SettingsSegmentedControl } from './SettingsControls';

/** 表单内部状态 */
interface FormState {
  id?: string;
  kind: AiModelKind;
  name: string;
  baseUrl: string;
  model: string;
  keySource: AiKeySource;
  apiKey: string;
  envVar: string;
  /** 编辑时：本地是否已保存密钥（决定密钥输入框的占位文案） */
  hasLocalKey: boolean;
}

const KEY_SOURCE_OPTIONS: { value: AiKeySource; label: string }[] = [
  { value: 'local', label: '本地保存' },
  { value: 'env', label: '环境变量' },
  { value: 'none', label: '无密钥' },
];

/** 新增时按类型生成初始表单 */
function formForKind(kind: AiModelKind): FormState {
  const meta = getModelKindMeta(kind);
  return {
    kind,
    name: meta.defaultName,
    baseUrl: meta.defaultBaseUrl,
    model: '',
    keySource: meta.defaultKeySource,
    apiKey: '',
    envVar: meta.defaultEnvVar,
    hasLocalKey: false,
  };
}

/** 由已有配置生成编辑表单 */
function formForProfile(profile: AiModelProfile): FormState {
  return {
    id: profile.id,
    kind: profile.kind,
    name: profile.name,
    baseUrl: profile.baseUrl,
    model: profile.model,
    keySource: profile.keySource,
    apiKey: '',
    envVar: profile.envVar || getModelKindMeta(profile.kind).defaultEnvVar,
    hasLocalKey: profile.hasLocalKey,
  };
}

/**
 * 切换类型：用户未改动过（为空或仍是旧类型默认值）的字段替换为新类型默认值，
 * 已手动填写的内容保留。
 */
function switchKind(form: FormState, kind: AiModelKind): FormState {
  const prev = getModelKindMeta(form.kind);
  const next = getModelKindMeta(kind);
  const untouched = (value: string, prevDefault: string) => !value || value === prevDefault;
  return {
    ...form,
    kind,
    name: untouched(form.name, prev.defaultName) ? next.defaultName : form.name,
    baseUrl: untouched(form.baseUrl, prev.defaultBaseUrl) ? next.defaultBaseUrl : form.baseUrl,
    envVar: untouched(form.envVar, prev.defaultEnvVar) ? next.defaultEnvVar : form.envVar,
    keySource: form.keySource === prev.defaultKeySource ? next.defaultKeySource : form.keySource,
  };
}

/** 表单 -> 提交草稿；密钥留空表示保持原值 */
function toDraft(form: FormState): AiModelDraft {
  return {
    id: form.id,
    kind: form.kind,
    name: form.name,
    baseUrl: form.baseUrl,
    model: form.model,
    keySource: form.keySource,
    apiKey: form.keySource === 'local' && form.apiKey.trim() ? form.apiKey.trim() : undefined,
    envVar: form.envVar,
  };
}

/** 密钥状态文案 */
function keyStatusText(profile: AiModelProfile): string {
  if (profile.keySource === 'none') return '无密钥';
  if (profile.keySource === 'env') {
    return profile.keyReady ? `环境变量 ${profile.envVar}` : `环境变量 ${profile.envVar} 未设置`;
  }
  return profile.keyReady ? '密钥已保存' : '密钥未保存';
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// 类型选择
// ---------------------------------------------------------------------------

/** 模型分组的展示顺序 */
const MODEL_GROUPS: AiModelGroup[] = ['local', 'api'];

/**
 * 模型类型选择：一级为「本地模型 / API 模型」，二级为该分组下的具体类型，两级使用相同的胶囊按钮样式。
 * 切换 tab 时自动选中该分组的第一个类型。
 */
function KindPicker({
  value,
  onChange,
}: {
  value: AiModelKind;
  onChange: (kind: AiModelKind) => void;
}) {
  const activeGroup = getModelKindMeta(value).group;
  const kinds = MODEL_KINDS.filter((k) => k.group === activeGroup);

  const selectGroup = (group: AiModelGroup) => {
    if (group === activeGroup) return;
    const first = MODEL_KINDS.find((k) => k.group === group);
    if (first) onChange(first.kind);
  };

  return (
    <div className="settings-ai-kind-picker">
      <div className="settings-ai-kind-options" role="radiogroup" aria-label="模型分组">
        {MODEL_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            role="radio"
            aria-checked={group === activeGroup}
            className={cn('settings-ai-kind-chip', group === activeGroup && 'active')}
            onClick={() => selectGroup(group)}
          >
            {MODEL_GROUP_LABELS[group]}
          </button>
        ))}
      </div>
      <div className="settings-ai-kind-options">
        {kinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            className={cn('settings-ai-kind-chip', value === k.kind && 'active')}
            onClick={() => onChange(k.kind)}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表单
// ---------------------------------------------------------------------------

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="settings-ai-form-field">
      <label className="settings-item-label">{label}</label>
      <div className="settings-ai-form-control">
        {children}
        {hint && <div className="settings-ai-form-hint">{hint}</div>}
      </div>
    </div>
  );
}

function KeyFields({
  form,
  update,
}: {
  form: FormState;
  update: (patch: Partial<FormState>) => void;
}) {
  const meta = getModelKindMeta(form.kind);
  return (
    <>
      <FormField label="API 密钥">
        <SettingsSegmentedControl
          value={form.keySource}
          options={KEY_SOURCE_OPTIONS}
          onChange={(v) => update({ keySource: v as AiKeySource })}
        />
      </FormField>

      {form.keySource === 'local' && (
        <FormField
          label="密钥"
          hint={
            meta.apiKeyUrl && (
              <a href={meta.apiKeyUrl} target="_blank" rel="noreferrer" className="settings-link">
                前往 {meta.label} 控制台获取 <RiExternalLinkLine size={12} />
              </a>
            )
          }
        >
          <input
            type="password"
            className="settings-text-input"
            value={form.apiKey}
            placeholder={form.hasLocalKey ? '已保存，留空则保持不变' : '粘贴 API 密钥'}
            onChange={(e) => update({ apiKey: e.target.value })}
          />
        </FormField>
      )}

      {form.keySource === 'env' && (
        <FormField
          label="环境变量名"
          hint="运行时读取；从 Dock 启动时也会读取登录 Shell（如 ~/.zshrc）中 export 的变量"
        >
          <input
            type="text"
            className="settings-text-input"
            value={form.envVar}
            placeholder={meta.defaultEnvVar}
            spellCheck={false}
            onChange={(e) => update({ envVar: e.target.value })}
          />
        </FormField>
      )}
    </>
  );
}

/** 添加 / 编辑模型弹窗 */
function ModelDialog({
  initial,
  onSaved,
  onClose,
}: {
  initial: FormState;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const meta = getModelKindMeta(form.kind);
  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await aiService.saveAiModel(toDraft(form));
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button className="settings-button" onClick={onClose} disabled={saving}>
        取消
      </button>
      <button
        className="settings-button settings-button-primary"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? '保存中...' : '保存'}
      </button>
    </>
  );

  // 设置页本身是全屏遮罩弹窗，挂到 body 上保证叠在其上方且不受其布局影响
  return createPortal(
    <Dialog
      open
      onClose={onClose}
      title={initial.id ? '编辑模型' : '添加模型'}
      size="md"
      footer={footer}
      className="settings-ai-model-dialog"
    >
      <div className="settings-ai-model-form">
        <FormField label="模型类型">
          <KindPicker value={form.kind} onChange={(kind) => setForm((f) => switchKind(f, kind))} />
        </FormField>
        <FormField label="名称">
          <input
            type="text"
            className="settings-text-input"
            value={form.name}
            placeholder={meta.defaultName}
            onChange={(e) => update({ name: e.target.value })}
          />
        </FormField>
        <FormField label="基础 URL">
          <input
            type="text"
            className="settings-text-input"
            value={form.baseUrl}
            placeholder={meta.baseUrlPlaceholder}
            spellCheck={false}
            onChange={(e) => update({ baseUrl: e.target.value })}
          />
        </FormField>
        <FormField label="模型 ID">
          <input
            type="text"
            className="settings-text-input"
            value={form.model}
            placeholder={meta.modelPlaceholder}
            spellCheck={false}
            onChange={(e) => update({ model: e.target.value })}
          />
        </FormField>
        <KeyFields form={form} update={update} />
        {error && <div className="settings-ai-test-result is-error">{error}</div>}
      </div>
    </Dialog>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------

type TestState = { status: 'testing' } | { status: 'ok' | 'error'; message: string };

function ModelRow({
  profile,
  isCurrent,
  onSelect,
  onEdit,
  onDelete,
}: {
  profile: AiModelProfile;
  isCurrent: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [test, setTest] = useState<TestState | null>(null);

  const runTest = async () => {
    setTest({ status: 'testing' });
    try {
      const res = await aiService.testConnection(profile.id);
      setTest({ status: 'ok', message: `连接成功：${res.reply.slice(0, 60)}` });
    } catch (e) {
      setTest({ status: 'error', message: errorText(e) });
    }
  };

  return (
    <div className={cn('settings-ai-model-row', isCurrent && 'is-current')}>
      <div className="settings-ai-model-main">
        <button
          type="button"
          className="settings-ai-model-radio"
          onClick={onSelect}
          title={isCurrent ? '当前使用' : '设为当前模型'}
        >
          {isCurrent && <RiCheckLine size={12} />}
        </button>
        <div className="settings-ai-model-info" onClick={onSelect}>
          <div className="settings-ai-model-title">
            <span>{profile.name}</span>
            <span className="settings-ai-model-kind">{getModelKindMeta(profile.kind).label}</span>
          </div>
          <div className="settings-ai-model-meta">
            <span>{profile.model}</span>
            <span className={cn(!profile.keyReady && 'is-warning')}>{keyStatusText(profile)}</span>
          </div>
        </div>
        <div className="settings-ai-model-actions">
          <button
            className="settings-ai-icon-button"
            onClick={() => void runTest()}
            disabled={test?.status === 'testing' || !profile.keyReady}
            title="测试连接"
          >
            {test?.status === 'testing' ? (
              <RiLoader4Line size={14} className="settings-ai-spin" />
            ) : (
              <RiPlugLine size={14} />
            )}
          </button>
          <button className="settings-ai-icon-button" onClick={onEdit} title="编辑">
            <RiEditLine size={14} />
          </button>
          <button className="settings-ai-icon-button" onClick={onDelete} title="删除">
            <RiDeleteBinLine size={14} />
          </button>
        </div>
      </div>
      {test && test.status !== 'testing' && (
        <div className={cn('settings-ai-test-result', test.status === 'ok' ? 'is-ok' : 'is-error')}>
          {test.message}
        </div>
      )}
    </div>
  );
}

/** 模型配置区 */
/** 按关键字过滤：名称、模型 ID、类型名、基础 URL，不区分大小写 */
function filterModels(models: AiModelProfile[], keyword: string): AiModelProfile[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    [m.name, m.model, getModelKindMeta(m.kind).label, m.baseUrl].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}

/** 模型配置区 */
export function AiModelSettings() {
  const { models, currentModelId, refreshConfig } = useAiStore();
  /** null：弹窗关闭；否则为表单初始值 */
  const [dialogInitial, setDialogInitial] = useState<FormState | null>(null);
  const [keyword, setKeyword] = useState('');
  const [actionError, setActionError] = useState('');
  const currentId = models.some((m) => m.id === currentModelId) ? currentModelId : models[0]?.id;
  const visible = useMemo(() => filterModels(models, keyword), [models, keyword]);

  const run = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
      await refreshConfig();
    } catch (e) {
      setActionError(errorText(e));
    }
  };

  const remove = async (profile: AiModelProfile) => {
    const ok = await showConfirmDialog('删除模型', `确定删除「${profile.name}」吗？`);
    if (ok) await run(() => aiService.deleteAiModel(profile.id));
  };

  return (
    <>
      <div className="settings-ai-model-toolbar">
        <div className="settings-ai-model-search">
          <RiSearchLine size={14} />
          <input
            type="text"
            value={keyword}
            placeholder="搜索名称、模型 ID、类型"
            spellCheck={false}
            onChange={(e) => setKeyword(e.target.value)}
            disabled={models.length === 0}
          />
        </div>
        <button className="settings-button" onClick={() => setDialogInitial(formForKind('ollama'))}>
          <RiAddLine size={14} />
          <span>添加模型</span>
        </button>
      </div>

      {models.length === 0 ? (
        <div className="settings-item-hint">
          <p>
            还没有配置模型。支持 Ollama、LM Studio 本地模型，以及 OpenAI、Anthropic 等 API 模型。
          </p>
        </div>
      ) : (
        <div className="settings-ai-model-list">
          {visible.map((profile) => (
            <ModelRow
              key={profile.id}
              profile={profile}
              isCurrent={profile.id === currentId}
              onSelect={() => void run(() => aiService.setCurrentAiModel(profile.id))}
              onEdit={() => setDialogInitial(formForProfile(profile))}
              onDelete={() => void remove(profile)}
            />
          ))}
          {visible.length === 0 && (
            <div className="settings-ai-model-empty">没有匹配「{keyword.trim()}」的模型</div>
          )}
        </div>
      )}

      {actionError && <div className="settings-ai-test-result is-error">{actionError}</div>}

      {dialogInitial && (
        <ModelDialog
          // 每次打开都重新挂载，保证表单状态从初始值开始
          key={dialogInitial.id ?? 'new'}
          initial={dialogInitial}
          onClose={() => setDialogInitial(null)}
          onSaved={() => void run(async () => setDialogInitial(null))}
        />
      )}
    </>
  );
}
