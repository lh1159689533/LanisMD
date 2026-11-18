/**
 * 技能设置：新增 / 编辑（弹窗）/ 删除 / 从 SKILL.md 导入
 *
 * 技能在 AI 对话中按对话启用，其指令会作为 system prompt 的一部分发送。
 * 导入使用浏览器文件选择（桌面端与浏览器模式通用），支持一次选择多个 .md 文件。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联         |
 * | v1.0.0 | 初始实现：技能管理与 SKILL.md 导入 | REQ: AI 技能 |
 * | v1.1.0 | 新增 / 编辑改为弹窗                | REQ: AI 技能 |
 * | v1.2.0 | 列表改为卡片，hover 悬浮操作图标   | REQ: AI 技能 |
 * | v1.2.0 | 列表改为卡片，hover 悬浮操作图标   | REQ: AI 技能 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RiAddLine, RiDeleteBinLine, RiEditLine, RiUpload2Line } from 'react-icons/ri';

import { Dialog } from '@/components/common/Dialog';
import { MAX_SKILL_INSTRUCTIONS, createSkillId, parseSkillMarkdown } from '@/services/ai/skills';
import { estimateTokens } from '@/services/ai/token-budget';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import type { AiSkill } from '@/types/ai';
import { cn } from '@/utils/cn';

type SkillDraft = Omit<AiSkill, 'id'> & { id?: string };

const EMPTY_DRAFT: SkillDraft = {
  name: '',
  description: '',
  instructions: '',
  defaultEnabled: false,
};

const NO_SKILLS: AiSkill[] = [];

function validateDraft(draft: SkillDraft, skills: AiSkill[]): string | null {
  const name = draft.name.trim();
  if (!name) return '请填写技能名称';
  if (skills.some((s) => s.id !== draft.id && s.name === name)) return '已存在同名技能';
  if (!draft.instructions.trim()) return '请填写技能指令';
  if (draft.instructions.length > MAX_SKILL_INSTRUCTIONS) {
    return `指令不能超过 ${MAX_SKILL_INSTRUCTIONS} 字`;
  }
  return null;
}

/** 同名时追加序号，避免导入覆盖已有技能 */
function uniqueName(name: string, skills: AiSkill[]): string {
  if (!skills.some((s) => s.name === name)) return name;
  let i = 2;
  while (skills.some((s) => s.name === `${name} ${i}`)) i++;
  return `${name} ${i}`;
}

function SkillDialog({
  draft,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  draft: SkillDraft;
  error: string | null;
  onChange: (draft: SkillDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const footer = (
    <>
      {error ? (
        <span className="settings-ai-prompt-error">{error}</span>
      ) : (
        <span className="settings-ai-skill-tokens">
          约 {estimateTokens(draft.instructions + draft.description)} tokens
        </span>
      )}
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
    </>
  );

  // 设置页本身是全屏遮罩弹窗，挂到 body 上保证叠在其上方
  return createPortal(
    <Dialog
      open
      onClose={onCancel}
      title={draft.id ? '编辑技能' : '添加技能'}
      size="lg"
      footer={footer}
      className="settings-ai-edit-dialog"
    >
      <div className="settings-ai-prompt-form">
        <input
          type="text"
          className="settings-text-input settings-ai-prompt-name"
          placeholder="技能名称，例如：技术文档审阅"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
        />
        <input
          type="text"
          className="settings-text-input settings-ai-skill-desc"
          placeholder="一句话说明用途（显示在选择列表中）"
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
        />
        <textarea
          className="settings-text-input settings-ai-prompt-textarea"
          placeholder={
            '技能指令（支持 Markdown），例如：\n你是资深技术编辑。审阅用户提供的文档时：\n1. 先指出结构问题，再逐段给出修改建议\n2. 术语保持全文一致……'
          }
          value={draft.instructions}
          onChange={(e) => onChange({ ...draft, instructions: e.target.value })}
          rows={8}
        />
        <div className="settings-item">
          <label className="settings-item-label">默认启用</label>
          <button
            type="button"
            onClick={() => onChange({ ...draft, defaultEnabled: !draft.defaultEnabled })}
            className={cn('settings-toggle', draft.defaultEnabled && 'checked')}
          >
            <span className="settings-toggle-thumb" />
          </button>
        </div>
      </div>
    </Dialog>,
    document.body,
  );
}

export function AiSkillSettings() {
  const skills = useSettingsStore((s) => s.config.ai?.skills ?? NO_SKILLS);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const error = draft ? validateDraft(draft, skills) : null;

  const save = useCallback(() => {
    if (!draft || validateDraft(draft, skills)) return;
    const next: AiSkill = {
      id: draft.id ?? createSkillId(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
      ...(draft.defaultEnabled ? { defaultEnabled: true } : {}),
    };
    const exists = skills.some((s) => s.id === next.id);
    setNestedConfig(
      'ai.skills',
      exists ? skills.map((s) => (s.id === next.id ? next : s)) : [...skills, next],
    );
    setDraft(null);
  }, [draft, skills, setNestedConfig]);

  const remove = useCallback(
    (id: string) => {
      setNestedConfig(
        'ai.skills',
        skills.filter((s) => s.id !== id),
      );
      if (draft?.id === id) setDraft(null);
    },
    [skills, draft, setNestedConfig],
  );

  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imported: AiSkill[] = [];
    const failed: string[] = [];
    let pool = [...skills];
    for (const file of Array.from(files)) {
      try {
        const parsed = parseSkillMarkdown(await file.text(), file.name);
        if (!parsed) {
          failed.push(file.name);
          continue;
        }
        const skill: AiSkill = {
          id: createSkillId(),
          ...parsed,
          name: uniqueName(parsed.name, pool),
        };
        imported.push(skill);
        pool = [...pool, skill];
      } catch {
        failed.push(file.name);
      }
    }
    if (imported.length > 0) setNestedConfig('ai.skills', pool);
    const { addToast } = useUIStore.getState();
    if (imported.length > 0) {
      addToast({ type: 'success', message: `已导入 ${imported.length} 个技能` });
    }
    if (failed.length > 0) {
      addToast({ type: 'error', message: `以下文件没有可用的技能指令：${failed.join('、')}` });
    }
  };

  return (
    <>
      <div className="settings-item-hint">
        <p>
          技能可在 AI 对话中启用（输入区的「技能」按钮或键入
          /），只对本次发送的消息生效（发送后恢复为默认启用的技能），其指令会随该消息发送给模型，
          用于固定角色、工作流程或输出规范。可直接导入 SKILL.md（front-matter 中的 name /
          description 作为名称与说明，正文作为指令）。
        </p>
      </div>

      {skills.length > 0 && (
        <div className="settings-ai-skill-grid">
          {skills.map((skill) => (
            <div key={skill.id} className="settings-ai-skill-card">
              <div className="settings-ai-skill-card-head">
                <span className="settings-ai-skill-card-name">{skill.name}</span>
                {skill.defaultEnabled && (
                  <span
                    className="settings-ai-skill-card-badge"
                    title="每条消息默认启用，可在输入框中移除"
                  >
                    默认
                  </span>
                )}
              </div>
              <div className={cn('settings-ai-skill-card-desc', !skill.description && 'is-empty')}>
                {skill.description || '暂无描述'}
              </div>
              {/* 操作按钮绝对定位悬浮在卡片右上角，hover 时显示，不占用卡片尺寸 */}
              <div className="settings-ai-skill-card-ops">
                <button
                  type="button"
                  className="settings-ai-skill-card-op"
                  onClick={() => setDraft({ ...skill })}
                  title="编辑"
                  aria-label={`编辑技能 ${skill.name}`}
                >
                  <RiEditLine size={13} />
                </button>
                <button
                  type="button"
                  className="settings-ai-skill-card-op is-danger"
                  onClick={() => remove(skill.id)}
                  title="删除"
                  aria-label={`删除技能 ${skill.name}`}
                >
                  <RiDeleteBinLine size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-ai-skill-actions">
        <button className="settings-button" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <RiAddLine size={14} />
          <span>添加技能</span>
        </button>
        <button className="settings-button" onClick={() => fileInputRef.current?.click()}>
          <RiUpload2Line size={14} />
          <span>从 SKILL.md 导入</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          multiple
          hidden
          onChange={(e) => {
            void handleImport(e.target.files);
            // 允许重复选择同一文件
            e.target.value = '';
          }}
        />
      </div>

      {draft && (
        <SkillDialog
          draft={draft}
          error={error}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}
    </>
  );
}
